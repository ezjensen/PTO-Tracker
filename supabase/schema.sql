-- PTO Tracker database schema
-- Households own people. People own time-off types, yearly balances, entries and holidays.
-- Everything is protected by row-level security: you only see rows in households you belong to.

create schema if not exists private;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My household',
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members(user_id);

create function private.is_member(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_member(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid) to authenticated;

create table public.people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  employer text not null default '',
  color int not null default 0,
  emoji text not null default '',
  avatar text not null default '',
  sort_order bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (id, household_id)
);
create index people_household_idx on public.people(household_id);

create table public.types (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  person_id uuid not null,
  name text not null,
  color int not null default 0,
  kind text not null check (kind in ('balance', 'allowance', 'tracked', 'holiday')),
  description text not null default '',
  hide_on_holiday boolean not null default false,
  sort_order int not null default 0,
  foreign key (person_id, household_id) references public.people(id, household_id) on delete cascade,
  unique (person_id, name)
);
create index types_household_idx on public.types(household_id);

create table public.years (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  person_id uuid not null,
  year int not null,
  carried numeric(7, 2) not null default 0,
  accrued numeric(7, 2) not null default 0,
  future numeric(7, 2) not null default 0,
  as_of date,
  carry_cap numeric(6, 2) not null default 40,
  allowances jsonb not null default '{}'::jsonb,
  foreign key (person_id, household_id) references public.people(id, household_id) on delete cascade,
  unique (person_id, year)
);
create index years_household_idx on public.years(household_id);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  person_id uuid not null,
  year int not null,
  type text not null,
  start_date date not null,
  end_date date not null,
  hours numeric(6, 2) not null check (hours >= 0),
  status text not null check (status in ('used', 'planned')),
  reason text not null default '',
  check (end_date >= start_date),
  foreign key (person_id, household_id) references public.people(id, household_id) on delete cascade
);
create index entries_household_idx on public.entries(household_id);
create index entries_person_year_idx on public.entries(person_id, year);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  person_id uuid not null,
  year int not null,
  name text not null,
  date date not null,
  foreign key (person_id, household_id) references public.people(id, household_id) on delete cascade
);
create index holidays_household_idx on public.holidays(household_id);
create index holidays_person_year_idx on public.holidays(person_id, year);

-- Row-level security
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.people enable row level security;
alter table public.types enable row level security;
alter table public.years enable row level security;
alter table public.entries enable row level security;
alter table public.holidays enable row level security;

create policy "members read household" on public.households
  for select to authenticated using ((select private.is_member(id)));
create policy "members rename household" on public.households
  for update to authenticated
  using ((select private.is_member(id))) with check ((select private.is_member(id)));

create policy "members see members" on public.household_members
  for select to authenticated using ((select private.is_member(household_id)));
create policy "members can leave" on public.household_members
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "members all" on public.people
  for all to authenticated
  using ((select private.is_member(household_id))) with check ((select private.is_member(household_id)));
create policy "members all" on public.types
  for all to authenticated
  using ((select private.is_member(household_id))) with check ((select private.is_member(household_id)));
create policy "members all" on public.years
  for all to authenticated
  using ((select private.is_member(household_id))) with check ((select private.is_member(household_id)));
create policy "members all" on public.entries
  for all to authenticated
  using ((select private.is_member(household_id))) with check ((select private.is_member(household_id)));
create policy "members all" on public.holidays
  for all to authenticated
  using ((select private.is_member(household_id))) with check ((select private.is_member(household_id)));

-- Functions the app calls to create and join a household
create function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare h uuid;
begin
  if (select auth.uid()) is null then raise exception 'Not signed in'; end if;
  insert into public.households (name)
    values (coalesce(nullif(trim(p_name), ''), 'My household'))
    returning id into h;
  insert into public.household_members (household_id, user_id) values (h, (select auth.uid()));
  return h;
end;
$$;

create function public.join_household(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare h uuid;
begin
  if (select auth.uid()) is null then raise exception 'Not signed in'; end if;
  select id into h from public.households where invite_code = lower(trim(p_code));
  if h is null then raise exception 'That invite code was not found'; end if;
  insert into public.household_members (household_id, user_id)
    values (h, (select auth.uid())) on conflict do nothing;
  return h;
end;
$$;

create function public.rotate_invite_code(p_household uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare c text;
begin
  if not (select private.is_member(p_household)) then raise exception 'Not a member'; end if;
  update public.households
    set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
    where id = p_household returning invite_code into c;
  return c;
end;
$$;

revoke execute on function public.create_household(text) from public, anon;
revoke execute on function public.join_household(text) from public, anon;
revoke execute on function public.rotate_invite_code(uuid) from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.rotate_invite_code(uuid) to authenticated;

-- Live updates so changes made on one device show up on the others
alter publication supabase_realtime add table public.people, public.types, public.years, public.entries, public.holidays;
