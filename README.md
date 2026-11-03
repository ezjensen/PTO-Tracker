# PTO Tracker

An installable web app (PWA) for tracking PTO balances, planned time off, holidays and carryover for a household.
It is plain HTML, CSS and JavaScript with no build step, and it uses a Supabase project for sign-in and data.

## Files

- `index.html`, `app.css`, `app.js`: the app
- `config.js`: your Supabase project URL and publishable key
- `manifest.webmanifest`, `sw.js`, `icons/`: make it installable and available offline
- `supabase/schema.sql`: tables, row-level security and functions
- `supabase/seed.sql`: one-time import of the data from the original spreadsheet

## Set up

1. **Database.** Create a Supabase project in a personal organization, then run `supabase/schema.sql` in the SQL editor.
2. **Connect the app.** Put the project URL and publishable key (Project Settings, API) in `config.js`.
3. **Sign-in providers** (Authentication, Providers in the Supabase dashboard):
   - Google: create an OAuth client in Google Cloud Console and paste the client ID and secret into Supabase. Add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI.
   - Apple: needs an Apple Developer Program membership ($99 a year). Create a Services ID and key, then paste them into Supabase.
   - Email sign-in links work without any extra setup.
4. **Allowed web addresses.** In Authentication, URL Configuration, set the Site URL to your GitHub Pages address (for example `https://<you>.github.io/<repo>/`) and add the same address to Redirect URLs.
5. **Publish.** Push this folder to GitHub, then Settings, Pages, deploy from the `main` branch root.
6. **First sign-in.** Open the site, sign in, and create your household. Then run `supabase/seed.sql` once to import the existing data.
7. **Your wife joins.** She signs in and chooses "Join a household" with the invite code from Settings, Account and sharing.

## Install it

- iPhone or iPad: open the site in Safari, tap Share, then Add to Home Screen.
- Mac: open in Safari and choose File, Add to Dock, or install from Chrome or Edge.
- Windows: open in Edge or Chrome and choose Install app from the address bar or menu.

## Privacy

Every table is protected by row-level security. Only signed-in members of a household can read or change that household's rows. Everyone in a household can see and edit everyone's time off. The publishable key in `config.js` is designed to be public.
