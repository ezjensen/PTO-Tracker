(function(){
'use strict';
var DEFAULT_TYPES=[
  {key:'pto',name:'PTO',color:0,kind:'balance',order:0},
  {key:'cultural',name:'Cultural Day',color:1,kind:'allowance',order:1},
  {key:'service',name:'Service Hours',color:2,kind:'allowance',order:2},
  {key:'bereavement',name:'Bereavement',color:3,kind:'tracked',order:3},
  {key:'designated',name:'Designated Holiday',color:4,kind:'allowance',hideOnHoliday:true,order:4},
  {key:'company',name:'Company Holiday',color:5,kind:'holiday',order:5}];
var KIND_LABEL={balance:'Draws from the PTO balance',allowance:'Has its own yearly allowance',tracked:'No limit, just tracked',holiday:'Paid company holiday, uses no balance'};
var SWATCH=['Teal','Purple','Amber','Slate','Blue','Gray','Red','Green','Brown','Rose'];
var TABS=['log','calendar','together','holidays','settings'];
var TAB_LABEL={log:'Time off log',calendar:'Calendar',together:'Together',holidays:'Holidays',settings:'Settings'};
var MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
var NAMES=['people','types','years','entries','holidays'];
var db=null;
var S={year:null,person:null,tab:'log',month:new Date().getMonth(),people:[],types:[],years:[],entries:[],holidays:[],ready:{},confirmType:null,
  fType:'all',fPlanned:false,confirm:null,nodb:false,slow:false,pending:false};

function $(s){return document.querySelector(s)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function pd(s){var p=String(s).split('-').map(Number);return new Date(p[0],p[1]-1,p[2])}
function ds(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function todayStr(){return ds(new Date())}
function fh(n){n=Math.round((+n||0)*100)/100;return String(n)}
function fdate(s,o){return pd(s).toLocaleDateString('en-US',o||{month:'short',day:'numeric'})}
function range(e){return e.end&&e.end!==e.start?fdate(e.start)+' – '+fdate(e.end):fdate(e.start,{weekday:'short',month:'short',day:'numeric'})}
function toast(m){var t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(function(){t.hidden=true},3200)}

/* ---------- people and scoping (records without a person belong to the original profile) ---------- */
function pid(x){return x.person}
function yn(x){return x.year!=null?+x.year:+x.id}
function personDoc(id){return S.people.find(function(p){return p.id===id})}
function pname(id){var p=personDoc(id);return p?p.name:'Someone'}
function mini(q){return q.avatar?'<img class="av mini" alt="" src="'+esc(q.avatar)+'"> ':(q.emoji?esc(q.emoji)+' ':'')}
function avatar(q,big){
  var c=big?' big':'';
  if(q.avatar)return '<img class="av'+c+'" alt="" src="'+esc(q.avatar)+'">';
  if(q.emoji)return '<span class="av'+c+'" aria-hidden="true">'+esc(q.emoji)+'</span>';
  return '<span class="av dot" aria-hidden="true"></span>';
}
function pcolor(id){var i=S.people.findIndex(function(p){return p.id===id});if(i<0)return 0;var c=S.people[i].color;return (c==null?i:c)%10}
function yearDoc(y,p){p=p||S.person;return S.years.find(function(x){return pid(x)===p&&yn(x)===+y})}
function entriesFor(p,y){return S.entries.filter(function(e){return pid(e)===p&&+e.year===+y})}
function holidaysFor(p,y){return S.holidays.filter(function(h){return pid(h)===p&&+h.year===+y})}
function typesFor(p){
  var l=S.types.filter(function(t){return pid(t)===p}).sort(function(a,b){return (a.order||0)-(b.order||0)});
  return l.length?l:DEFAULT_TYPES.map(function(t){return Object.assign({},t,{id:'v-'+t.key,person:p,virtual:true})});
}
function typeByName(p,n){return typesFor(p).find(function(t){return t.name===n})}
function tcls(p,n){var t=typeByName(p,n);return t?'k'+(t.color%10):'k-none'}
function isHolType(e){var t=typeByName(pid(e),e.type);return !!(t&&t.kind==='holiday')}
function allowFor(yr,t){
  if(yr.allowances&&yr.allowances[t.id]!=null)return +yr.allowances[t.id]||0;
  if(t.legacy&&yr[t.legacy]!=null)return +yr[t.legacy]||0;
  return 0;
}
function personYears(p){return S.years.filter(function(x){return pid(x)===p}).map(yn).sort()}
function allYears(){var o={};S.years.forEach(function(x){o[yn(x)]=1});return Object.keys(o).map(Number).sort()}

/* ---------- calculations ---------- */
function holidaySet(p){p=p||S.person;var s={};S.holidays.forEach(function(h){if(pid(h)===p)s[h.date]=h.name});return s}
function calcHours(start,end,type,p){
  if(!start)return 0; end=end||start; if(end<start)return 0;
  var hs=holidaySet(p),ty=typeByName(p||S.person,type),skip=!(ty&&ty.kind==='holiday'),n=0,d=pd(start),e=pd(end);
  while(d<=e){var w=d.getDay();if(w!==0&&w!==6&&!(skip&&hs[ds(d)]))n++;d.setDate(d.getDate()+1)}
  return n*8;
}
function stats(y,p){
  p=p||S.person;var yr=yearDoc(y,p)||{};var es=entriesFor(p,y),ts=typesFor(p);
  function sum(names,st){return es.filter(function(e){return names.indexOf(e.type)>-1&&e.status===st}).reduce(function(a,e){return a+(+e.hours||0)},0)}
  var total=(+yr.carried||0)+(+yr.accrued||0)+(+yr.future||0);
  var cap=yr.carryCap==null?40:+yr.carryCap;
  var bal=ts.filter(function(t){return t.kind==='balance'}).map(function(t){return t.name});
  var used=sum(bal,'used'),planned=sum(bal,'planned');
  var left=total-used,after=left-planned;
  var risk=Math.max(0,after-cap),carry=Math.max(0,Math.min(after,cap)),over=Math.max(0,-after);
  var rows=ts.filter(function(t){return t.kind!=='holiday'}).map(function(t){
    var u=sum([t.name],'used'),pl=sum([t.name],'planned');
    var allow=t.kind==='balance'?total:t.kind==='allowance'?allowFor(yr,t):null;
    return {type:t,allow:allow,used:u,planned:pl,left:allow==null?null:allow-u,after:allow==null?null:allow-u-pl}});
  return {yr:yr,total:total,cap:cap,used:used,planned:planned,left:left,after:after,risk:risk,carry:carry,over:over,rows:rows};
}

/* ---------- default holidays for a new year ---------- */
function nthDow(y,m,dow,n){var d=new Date(y,m,1);while(d.getDay()!==dow)d.setDate(d.getDate()+1);d.setDate(d.getDate()+7*(n-1));return d}
function lastDow(y,m,dow){var d=new Date(y,m+1,0);while(d.getDay()!==dow)d.setDate(d.getDate()-1);return d}
function obs(d,eve){var w=d.getDay(),x=new Date(d);if(w===6)x.setDate(x.getDate()-1);else if(w===0)x.setDate(x.getDate()+(eve?-2:1));return x}
function defaultHolidays(y){
  var tg=nthDow(y,10,4,4),bf=new Date(tg);bf.setDate(bf.getDate()+1);
  return [['New Years Day '+y,obs(new Date(y,0,1))],['Martin Luther King Jr Day',nthDow(y,0,1,3)],['Memorial Day',lastDow(y,4,1)],
    ['Independence Day',obs(new Date(y,6,4))],['Labor Day',nthDow(y,8,1,1)],['Thanksgiving Day',tg],['Black Friday',bf],
    ['Christmas Eve',obs(new Date(y,11,24),true)],['Christmas Day',obs(new Date(y,11,25))],['New Years Day '+(y+1),obs(new Date(y+1,0,1))]
  ].map(function(a){return {name:a[0],date:ds(a[1])}});
}

/* ---------- rendering ---------- */
function tabsHtml(){return '<nav class="tabs" aria-label="Views">'+TABS.map(function(t){return '<a href="#'+t+'"'+(S.tab===t?' aria-current="page"':'')+'>'+TAB_LABEL[t]+'</a>'}).join('')+'</nav>'}
function render(){
  var app=$('#app');
  if(S.setup){app.innerHTML='<div class="panel loading"><b>This app isn’t connected to a database yet.</b><br>Add your Supabase project URL and publishable key to config.js.</div>';return}
  if(S.nodb){app.innerHTML='<div class="panel loading"><b>Your PTO data can’t load right now.</b><br>'+esc(S.why||'')+'<br><br><button class="btn" data-action="reload">Try again</button> <button class="btn" data-action="sign-out">Sign out</button></div>';return}
  if(!S.authReady){app.innerHTML='<div class="loading">Loading…</div>';return}
  if(!S.session){app.innerHTML=signInHtml();return}
  if(S.needHousehold){app.innerHTML=householdHtml();return}
  var ready=NAMES.every(function(n){return S.ready[n]});
  if(!ready){app.innerHTML='<div class="loading">Loading your PTO…</div>';return}
  if(!S.people.length){app.innerHTML='<div class="panel empty"><h2>Who is this PTO tracker for?</h2><p>Add the first person to get started.</p><button class="btn primary" data-action="person-add">Add person</button></div>';return}
  var p=S.person,y=S.year,h='';
  if(!y){y=S.year=String(new Date().getFullYear())}
  var pp=personDoc(p)||{};
  h+='<header class="top"><div><h1>PTO Tracker</h1><p class="sub"><span class="who">'+esc(pp.name||'')+'</span>'+(pp.employer?' · '+esc(pp.employer):'')+' · All figures in hours</p></div><button class="btn primary" data-action="add">Add time off</button></header>';
  h+='<nav class="people" aria-label="Person">'+S.people.map(function(q){return '<button class="pc'+pcolor(q.id)+'" data-action="person" data-person="'+esc(q.id)+'" aria-pressed="'+(q.id===p)+'">'+avatar(q)+esc(q.name)+(q.employer?'<small>'+esc(q.employer)+'</small>':'')+'</button>'}).join('')+'<button class="btn small" data-action="person-add">+ Add person</button></nav>';
  var ids=allYears();
  h+='<nav class="years" aria-label="Year">'+ids.map(function(i){return '<button data-action="year" data-year="'+i+'" aria-pressed="'+(String(i)===String(y))+'">'+i+'</button>'}).join('')+'</nav>';
  var yr=yearDoc(y,p);
  if(S.tab==='together'){h+=tabsHtml()+'<section>'+viewTogether()+'</section>';app.innerHTML=h;return}
  if(!yr){
    h+='<div class="panel stack"><h2 style="font-size:20px">'+esc(pp.name||'This person')+' has no '+esc(y)+' yet</h2><p class="hint" style="margin:0">Set up '+esc(y)+' to start tracking. It carries over up to 40 hrs from last year if there is one and adds the standard holiday schedule. You can change every number afterwards.</p><div class="actions"><button class="btn primary" data-action="setup-year">Set up '+esc(y)+'</button></div></div>';
    h+=tabsHtml();if(S.tab==='settings')h+='<section>'+viewSet({})+'</section>';app.innerHTML=h;return;
  }
  var st=stats(y,p);
  var past=entriesFor(p,y).filter(function(e){return e.status==='planned'&&(e.end||e.start)<todayStr()});
  if(past.length)h+='<div class="nudge"><span><b>'+past.length+' planned '+(past.length>1?'entries have':'entry has')+' already passed.</b> Mark them taken so the balance is current.</span><button class="btn small" data-action="take-all">Mark all taken</button></div>';
  h+=summary(st,y);
  h+='<section class="panel"><div class="tablewrap">'+allowTable(st)+'</div></section>';
  h+=tabsHtml();
  h+='<section>'+({log:viewLog,calendar:viewCal,holidays:viewHol,settings:viewSet}[S.tab]||viewLog)(st)+'</section>';
  app.innerHTML=h;
}
function signInHtml(){
  return '<div class="panel stack" style="max-width:420px;margin:48px auto 0;width:100%"><div><h1>PTO Tracker</h1><p class="sub">Sign in to see your household’s time off.</p></div>'+
    '<button class="btn primary" data-action="sign-apple">Continue with Apple</button><button class="btn" data-action="sign-google">Continue with Google</button>'+
    '<div class="eyebrow" style="text-align:center">or</div>'+
    '<label class="field">Email<input id="si-email" type="email" autocomplete="email" placeholder="you@example.com"></label>'+
    '<button class="btn" data-action="sign-email">Email me a sign-in link</button>'+
    (S.authMsg?'<p class="hint" style="margin:0">'+esc(S.authMsg)+'</p>':'')+'</div>';
}
function householdHtml(){
  return '<div class="stack" style="max-width:460px;margin:40px auto 0;width:100%"><div><h1>Welcome</h1><p class="sub">Signed in as '+esc((S.session.user||{}).email||'')+'. Start a household for your family’s time off, or join one with an invite code.</p></div>'+
    '<div class="panel stack"><h2 style="font-size:20px">Start a household</h2><label class="field">Name<input id="hh-name" type="text" maxlength="60" value="Our household"></label><div class="actions"><button class="btn primary" data-action="hh-create">Create household</button></div></div>'+
    '<div class="panel stack"><h2 style="font-size:20px">Join a household</h2><label class="field">Invite code<input id="hh-code" type="text" maxlength="40" autocapitalize="none" autocomplete="off"></label><div class="actions"><button class="btn" data-action="hh-join">Join</button></div></div>'+
    (S.authMsg?'<p class="hint">'+esc(S.authMsg)+'</p>':'')+'<div class="actions"><button class="btn small" data-action="sign-out">Sign out</button></div></div>';
}
function accountPanel(){
  var hh=S.household||{};
  return '<div class="panel stack" style="margin-top:14px"><h2 style="font-size:20px">Account and sharing</h2>'+
    '<p class="hint" style="margin:0">Signed in as <b>'+esc(((S.session||{}).user||{}).email||'')+'</b>. Household: <b>'+esc(hh.name||'')+'</b>.</p>'+
    '<div class="field">Invite code<div class="actions"><code class="num" style="font-size:16px">'+esc(hh.invite_code||'')+'</code><button class="btn small" data-action="copy-code">Copy</button><button class="btn small" data-action="rotate-code">New code</button></div></div>'+
    '<p class="hint" style="margin:0">Anyone who signs in and enters this code joins the household and can see and edit everyone’s time off. Make a new code if you shared it with the wrong person.</p>'+
    '<div class="actions"><button class="btn" data-action="sign-out">Sign out</button></div></div>';
}
function scheduleRender(){
  var a=document.activeElement;
  if(a&&$('#app').contains(a)&&/INPUT|SELECT|TEXTAREA/.test(a.tagName)&&S.tab==='settings'){S.pending=true;return}
  render();
}
function summary(st,y){
  var yr=st.yr,den=Math.max(st.total,st.used+st.planned)||1;
  function w(v){return (v/den*100).toFixed(2)+'%'}
  var seg='<span class="seg-used" style="width:'+w(st.used)+'"></span><span class="seg-planned" style="width:'+w(st.planned)+'"></span>'+
    (st.over?'<span class="seg-over" style="width:'+w(st.over)+'"></span>':'')+
    '<span class="seg-risk" style="width:'+w(st.risk)+'"></span><span class="seg-carry" style="width:'+w(st.carry)+'"></span>';
  var asof=yr.asOf?'Accrual as of '+fdate(yr.asOf,{month:'short',day:'numeric',year:'numeric'}):'';
  var left='<div class="panel"><div class="eyebrow">PTO left in '+esc(y)+'</div><div class="big">'+fh(st.left)+' <small>hrs</small></div>'+
    '<div class="muted">'+fh(st.planned)+' planned, leaving '+fh(st.after)+' hrs by year end'+(asof?' · '+asof:'')+'</div>'+
    '<div class="bar" role="img" aria-label="PTO split into used, planned, at risk and carry over">'+seg+'</div>'+
    '<div class="legend"><span><i style="background:var(--accent)"></i>Taken <b>'+fh(st.used)+'</b></span>'+
    '<span><i style="background:repeating-linear-gradient(135deg,var(--accent) 0 3px,var(--surface) 3px 6px)"></i>Planned <b>'+fh(st.planned)+'</b></span>'+
    (st.over?'<span><i style="background:var(--bad)"></i>Over balance <b>'+fh(st.over)+'</b></span>':'')+
    '<span><i style="background:var(--warn)"></i>At risk <b>'+fh(st.risk)+'</b></span>'+
    '<span><i style="background:var(--carry)"></i>Carries over <b>'+fh(st.carry)+'</b></span></div></div>';
  var cls,eb,title,body;
  var ny=(+y)+1;
  if(st.over>0){cls='bad';eb='Over balance';title='Planned time is '+fh(st.over)+' hrs more than the balance';body='Move or remove some planned days, or check the accrual numbers in Settings.'}
  else if(st.risk>0){cls='warn';eb='Use it or lose it';title=fh(st.risk)+' hrs would be lost';body='The balance after planned time is '+fh(st.after)+' hrs and only '+fh(st.cap)+' can carry into '+ny+'. Book at least '+fh(st.risk)+' more hrs before year end.'}
  else{cls='ok';eb='Carryover is safe';title='Nothing at risk';body='On track to carry '+fh(st.carry)+' hrs into '+ny+' (limit '+fh(st.cap)+').'}
  var right='<div class="status '+cls+'"><div class="eyebrow">'+eb+'</div><h3>'+title+'</h3><p>'+body+'</p></div>';
  return '<div class="summary">'+left+right+'</div>';
}
function allowTable(st){
  var h='<table><thead><tr><th>Type</th><th>Allowed</th><th>Taken</th><th>Left</th><th>Planned</th><th>After planned</th></tr></thead><tbody>';
  st.rows.forEach(function(r){
    var c=function(v){return v==null?'<td class="num muted">—</td>':'<td class="num'+(v<0?' neg':'')+'">'+fh(v)+'</td>'};
    h+='<tr><td><span class="chip k'+(r.type.color%10)+'">'+esc(r.type.name)+'</span></td>'+(r.allow==null?'<td class="num muted">—</td>':'<td class="num">'+fh(r.allow)+'</td>')+
      '<td class="num">'+fh(r.used)+'</td>'+c(r.left)+'<td class="num">'+fh(r.planned)+'</td>'+c(r.after)+'</tr>';
  });
  return h+'</tbody></table>';
}
function viewLog(){
  var list=entriesFor(S.person,S.year).slice();
  if(S.fType!=='all')list=list.filter(function(e){return e.type===S.fType});
  if(S.fPlanned)list=list.filter(function(e){return e.status==='planned'});
  list.sort(function(a,b){return a.start<b.start?-1:a.start>b.start?1:0});
  var h='<div class="tools"><label>Type <select id="flt-type" data-action="filter-type"><option value="all">All types</option>'+
    typesFor(S.person).map(function(t){return '<option'+(S.fType===t.name?' selected':'')+'>'+esc(t.name)+'</option>'}).join('')+'</select></label>'+
    '<label><input type="checkbox" id="flt-planned" data-action="filter-planned"'+(S.fPlanned?' checked':'')+'> Planned only</label></div>';
  if(!list.length)return h+'<div class="panel empty">No entries match. Use “Add time off” to log a day.</div>';
  h+='<div class="panel" style="padding-top:4px">';
  var cm=-1;
  list.forEach(function(e){
    var m=pd(e.start).getMonth();
    if(m!==cm){cm=m;h+='<div class="mhead">'+MONTHS[m]+'</div>'}
    var late=e.status==='planned'&&(e.end||e.start)<todayStr();
    var acts;
    if(S.confirm===e.id)acts='<span class="muted">Delete this entry?</span><button class="btn small danger" data-action="del-yes" data-id="'+e.id+'">Delete</button><button class="btn small" data-action="del-no">Keep</button>';
    else acts=(e.status==='planned'?'<button class="btn small" data-action="take" data-id="'+e.id+'">Mark taken</button>':'')+
      '<button class="btn small" data-action="edit" data-id="'+e.id+'">Edit</button><button class="btn small" data-action="del" data-id="'+e.id+'">Delete</button>';
    h+='<div class="row'+(isHolType(e)?' company':'')+'"><div class="d num">'+esc(range(e))+'</div>'+
      '<div class="ty"><span class="chip '+tcls(pid(e),e.type)+'">'+esc(e.type)+'</span></div><div class="h num">'+fh(e.hours)+'</div>'+
      '<div class="st"><span class="pill '+(late?'past':e.status)+'">'+(e.status==='used'?'Taken':late?'Passed':'Planned')+'</span></div>'+
      '<div class="reason">'+esc(e.reason||'')+'</div><div class="acts">'+acts+'</div></div>';
  });
  return h+'</div>';
}
function monthBar(){return '<div class="cal-months">'+MONTHS.map(function(n,i){return '<button data-action="month" data-m="'+i+'" aria-pressed="'+(i===S.month)+'">'+n.slice(0,3)+'</button>'}).join('')+'</div>'}
function viewCal(){
  var p=S.person,y=+S.year,m=S.month,hs=holidaySet(p),first=new Date(y,m,1),dim=new Date(y,m+1,0).getDate(),tds=todayStr();
  var h=monthBar();
  h+='<div class="panel"><h2 style="font-size:20px;margin-bottom:12px">'+MONTHS[m]+' '+y+'</h2><div class="cal">';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(function(d){h+='<div class="dow">'+d+'</div>'});
  for(var i=0;i<first.getDay();i++)h+='<div class="day out"></div>';
  var all=S.entries.filter(function(e){return pid(e)===p&&(+e.year===y||(e.start&&e.start.slice(0,4)===String(y)))});
  for(var d=1;d<=dim;d++){
    var dt=new Date(y,m,d),k=ds(dt),w=dt.getDay();
    var chips='';
    if(hs[k])chips+='<span class="chol" title="'+esc(hs[k])+'">'+esc(hs[k])+'</span>';
    all.forEach(function(e){
      if(k<e.start||k>(e.end||e.start))return;
      var ty=typeByName(p,e.type);
      if(ty&&(ty.kind==='holiday'||(hs[k]&&ty.hideOnHoliday)))return;
      chips+='<span class="cchip '+tcls(p,e.type)+(e.status==='planned'?' planned':'')+'" title="'+esc(e.type+': '+(e.reason||''))+'">'+esc(e.reason||e.type)+'</span>';
    });
    h+='<button class="day'+(w===0||w===6?' wknd':'')+(k===tds?' today':'')+'" data-action="add-day" data-date="'+k+'" aria-label="'+esc(fdate(k,{weekday:'long',month:'long',day:'numeric'}))+'"><span class="dn">'+d+'</span>'+chips+'</button>';
  }
  h+='</div><div class="legend" style="margin-top:12px">'+typesFor(p).filter(function(t){return t.kind!=='holiday'}).map(function(t){return '<span class="chip k'+(t.color%10)+'">'+esc(t.name)+'</span>'}).join('')+
    '<span>Dashed = planned, solid = taken, italic = company holiday</span></div></div>';
  var ml=all.filter(function(e){var a=e.start,b=e.end||e.start,ms=ds(first),me=ds(new Date(y,m,dim));return a<=me&&b>=ms&&!isHolType(e)}).sort(function(a,b){return a.start<b.start?-1:1});
  if(ml.length){h+='<div class="panel" style="margin-top:14px;padding-top:4px"><div class="mhead">This month</div>';
    ml.forEach(function(e){h+='<div class="row"><div class="d num">'+esc(range(e))+'</div><div class="ty"><span class="chip '+tcls(p,e.type)+'">'+esc(e.type)+'</span></div><div class="h num">'+fh(e.hours)+'</div><div class="st"><span class="pill '+e.status+'">'+(e.status==='used'?'Taken':'Planned')+'</span></div><div class="reason">'+esc(e.reason||'')+'</div><div class="acts"><button class="btn small" data-action="edit" data-id="'+e.id+'">Edit</button></div></div>'});
    h+='</div>'}
  return h;
}
function viewTogether(){
  var y=+S.year,m=S.month,h='';
  h+='<div class="panel"><h2 style="font-size:20px;margin-bottom:8px">'+y+' balances</h2><div class="tablewrap"><table><thead><tr><th>Person</th><th>PTO left</th><th>Planned</th><th>After planned</th><th>At risk</th><th>Carries over</th></tr></thead><tbody>';
  S.people.forEach(function(q){
    var tag='<span class="chip pc'+pcolor(q.id)+'">'+mini(q)+esc(q.name)+'</span>'+(q.employer?' <span class="muted">'+esc(q.employer)+'</span>':'');
    if(!yearDoc(y,q.id)){h+='<tr><td>'+tag+'</td><td colspan="5" class="muted" style="text-align:left">Not set up for '+y+'</td></tr>';return}
    var st=stats(y,q.id);
    h+='<tr><td>'+tag+'</td><td class="num">'+fh(st.left)+'</td><td class="num">'+fh(st.planned)+'</td><td class="num'+(st.after<0?' neg':'')+'">'+fh(st.after)+'</td><td class="num">'+fh(st.risk)+'</td><td class="num">'+fh(st.carry)+'</td></tr>';
  });
  h+='</tbody></table></div></div>';
  var first=new Date(y,m,1),dim=new Date(y,m+1,0).getDate(),tds=todayStr();
  var ms=ds(first),me=ds(new Date(y,m,dim));
  var all=S.entries.filter(function(e){var ty=typeByName(pid(e),e.type);return (!ty||(ty.kind!=='holiday'&&!ty.hideOnHoliday))&&e.start<=me&&(e.end||e.start)>=ms&&personDoc(pid(e))});
  var together=[];
  h+='<div style="margin-top:14px">'+monthBar()+'</div><div class="panel"><h2 style="font-size:20px;margin-bottom:12px">'+MONTHS[m]+' '+y+'</h2><div class="cal">';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(function(d){h+='<div class="dow">'+d+'</div>'});
  for(var i=0;i<first.getDay();i++)h+='<div class="day out"></div>';
  for(var d=1;d<=dim;d++){
    var dt=new Date(y,m,d),k=ds(dt),w=dt.getDay(),who={},chips='';
    all.forEach(function(e){
      if(k<e.start||k>(e.end||e.start))return;
      who[pid(e)]=1;
      var nm=pname(pid(e));
      var pq=personDoc(pid(e))||{};
      var mark=pq.avatar?'<img class="av mini" alt="" src="'+esc(pq.avatar)+'">':esc(pq.emoji||nm.charAt(0).toUpperCase());
      chips+='<span class="cchip pc'+pcolor(pid(e))+(e.status==='planned'?' planned':'')+'" title="'+esc(nm+': '+(e.reason||e.type))+'">'+mark+' '+esc(e.reason||e.type)+'</span>';
    });
    var both=S.people.length>1&&w!==0&&w!==6&&Object.keys(who).length===S.people.length;
    if(both)together.push(d);
    h+='<div class="day static'+(w===0||w===6?' wknd':'')+(both?' both':'')+(k===tds?' today':'')+'"><span class="dn">'+d+'</span>'+chips+'</div>';
  }
  h+='</div><div class="legend" style="margin-top:12px">'+S.people.map(function(q){return '<span class="chip pc'+pcolor(q.id)+'">'+mini(q)+esc(q.name)+'</span>'}).join('')+
    '<span>Dashed = planned, solid = taken. Shaded days: everyone is off.</span></div>';
  if(S.people.length>1)h+='<p class="hint">'+(together.length?'Everyone is off on '+together.map(function(d){return MONTHS[m].slice(0,3)+' '+d}).join(', ')+'.':'No weekdays this month when everyone is off.')+'</p>';
  h+='</div>';
  all.sort(function(a,b){return a.start<b.start?-1:1});
  if(all.length){h+='<div class="panel" style="margin-top:14px;padding-top:4px"><div class="mhead">This month</div>';
    all.forEach(function(e){h+='<div class="row"><div class="d num">'+esc(range(e))+'</div><div class="ty"><span class="chip pc'+pcolor(pid(e))+'">'+mini(personDoc(pid(e))||{})+esc(pname(pid(e)))+'</span></div><div class="h num">'+fh(e.hours)+'</div><div class="st"><span class="pill '+e.status+'">'+(e.status==='used'?'Taken':'Planned')+'</span></div><div class="reason">'+esc(e.type+(e.reason?' · '+e.reason:''))+'</div><div class="acts"></div></div>'});
    h+='</div>'}
  return h;
}
function viewHol(st){
  var y=S.year,list=holidaysFor(S.person,y).slice().sort(function(a,b){return a.date<b.date?-1:1});
  var n=list.length,calc=Math.max(0,(n-8)*8),yr=st.yr,dt=typesFor(S.person).find(function(t){return t.kind==='allowance'&&t.hideOnHoliday}),cur=dt?allowFor(yr,dt):0;
  var h='<div class="panel"><div class="actions" style="justify-content:space-between;margin-bottom:6px"><h2 style="font-size:20px">'+esc(y)+' holiday schedule</h2><button class="btn small" data-action="hol-add">Add holiday</button></div>'+
    '<p class="hint" style="margin:0 0 10px">Company holidays are separate from PTO and don’t use any balance. The first eight holidays are company days; each one beyond that becomes an 8 hr designated holiday.</p>';
  if(!list.length)h+='<div class="empty">No holidays for this year yet.</div>';
  list.forEach(function(x){
    h+='<div class="row" style="grid-template-columns:150px minmax(0,1fr) auto"><div class="num">'+esc(fdate(x.date,{weekday:'short',month:'short',day:'numeric',year:'numeric'}))+'</div><div>'+esc(x.name)+'</div><div class="acts"><button class="btn small" data-action="hol-edit" data-id="'+x.id+'">Edit</button><button class="btn small" data-action="hol-del" data-id="'+x.id+'">Delete</button></div></div>'});
  if(dt)h+='<p class="hint"><b class="num">'+n+'</b> holidays → '+esc(dt.name)+' allowance <b class="num">'+fh(calc)+'</b> hrs (currently <b class="num">'+fh(cur)+'</b>). '+
    (calc!==cur?'<button class="btn small" data-action="apply-des">Apply '+fh(calc)+' hrs</button>':'')+'</p>';
  h+='</div>';
  return h;
}
function personWithPending(pp){return S.pendingAvatar!==undefined?Object.assign({},pp,{avatar:S.pendingAvatar}):pp}
function updatePrev(){var el=$('#pp-prev');if(el)el.innerHTML=avatar(personWithPending(personDoc(S.person)||{}),true)}
var CROP=null;
function openCrop(file){
  var r=new FileReader();
  r.onload=function(){var im=new Image();
    im.onload=function(){startCrop(im)};
    im.onerror=function(){toast('Couldn’t read that image.')};
    im.src=r.result};
  r.onerror=function(){toast('Couldn’t read that image.')};
  r.readAsDataURL(file);
}
function clampCrop(){var c=CROP,w=c.im.width*c.s,h=c.im.height*c.s;c.x=Math.min(0,Math.max(c.V-w,c.x));c.y=Math.min(0,Math.max(c.V-h,c.y))}
function drawCrop(){
  var c=CROP,cv=$('#crop-cv');if(!cv||!c)return;
  var g=cv.getContext('2d');g.clearRect(0,0,c.V,c.V);
  g.drawImage(c.im,c.x,c.y,c.im.width*c.s,c.im.height*c.s);
  g.save();g.fillStyle='rgba(0,0,0,.55)';g.beginPath();g.rect(0,0,c.V,c.V);g.arc(c.V/2,c.V/2,c.V/2-1,0,Math.PI*2,true);g.fill('evenodd');g.restore();
  g.strokeStyle='#fff';g.lineWidth=2;g.beginPath();g.arc(c.V/2,c.V/2,c.V/2-1,0,Math.PI*2);g.stroke();
}
function setZoom(z){
  z=Math.max(1,Math.min(4,z));var c=CROP;if(!c)return;
  var cx=(c.V/2-c.x)/c.s,cy=(c.V/2-c.y)/c.s;
  c.s=c.min*z;c.x=c.V/2-cx*c.s;c.y=c.V/2-cy*c.s;clampCrop();
  var sl=$('#crop-zoom');if(sl)sl.value=z;drawCrop();
}
function startCrop(im){
  var V=240,min=Math.max(V/im.width,V/im.height);
  CROP={im:im,V:V,min:min,s:min,x:(V-im.width*min)/2,y:(V-im.height*min)/2};
  openModal('<h2>Crop photo</h2><p class="hint" style="margin:0">Drag the photo to move it and use the slider to zoom. The circle is what will show.</p>'+
    '<div style="display:grid;place-items:center"><canvas id="crop-cv" width="240" height="240" style="width:240px;height:240px;max-width:100%;touch-action:none;cursor:grab;border-radius:8px"></canvas></div>'+
    '<label class="field">Zoom<input id="crop-zoom" type="range" min="1" max="4" step="0.01" value="1"></label>'+
    '<div class="actions"><button class="btn primary" data-action="crop-save">Use photo</button><button class="btn" data-action="close">Cancel</button></div>');
  var cv=$('#crop-cv'),drag=null;
  cv.addEventListener('pointerdown',function(e){drag={px:e.clientX,py:e.clientY,x:CROP.x,y:CROP.y};try{cv.setPointerCapture(e.pointerId)}catch(x){}cv.style.cursor='grabbing'});
  cv.addEventListener('pointermove',function(e){
    if(!drag)return;var k=CROP.V/cv.getBoundingClientRect().width;
    CROP.x=drag.x+(e.clientX-drag.px)*k;CROP.y=drag.y+(e.clientY-drag.py)*k;clampCrop();drawCrop()});
  function end(){drag=null;cv.style.cursor='grab'}
  cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
  cv.addEventListener('wheel',function(e){e.preventDefault();setZoom(parseFloat($('#crop-zoom').value)*(e.deltaY<0?1.06:1/1.06))},{passive:false});
  drawCrop();
}
function cropResult(){
  var c=CROP,o=document.createElement('canvas');o.width=o.height=128;
  o.getContext('2d').drawImage(c.im,-c.x/c.s,-c.y/c.s,c.V/c.s,c.V/c.s,0,0,128,128);
  return o.toDataURL('image/jpeg',0.85);
}
function typesPanel(p){
  var ts=typesFor(p),virtual=ts.length&&ts[0].virtual;
  var h='<div class="panel stack" style="margin-top:14px"><div class="actions" style="justify-content:space-between"><h2 style="font-size:20px">Time off types</h2>'+(virtual?'':'<button class="btn small" data-action="type-add">Add type</button>')+'</div>';
  if(virtual){return h+'<p class="hint" style="margin:0">'+esc(pname(p))+' is using the standard set. Save it to rename types, change colors, or add your own.</p><div class="actions"><button class="btn primary" data-action="seed-types">Customize types</button></div></div>'}
  ts.forEach(function(t){
    var n=S.entries.filter(function(e){return pid(e)===p&&e.type===t.name}).length;
    var acts;
    if(S.confirmType===t.id)acts='<span class="muted">'+(n?'Delete? '+n+' entr'+(n>1?'ies':'y')+' will keep the name but lose the color.':'Delete this type?')+'</span><button class="btn small danger" data-action="type-del-yes" data-id="'+t.id+'">Delete</button><button class="btn small" data-action="type-del-no">Keep</button>';
    else acts='<button class="btn small" data-action="type-edit" data-id="'+t.id+'">Edit</button>'+(t.kind==='balance'?'':'<button class="btn small" data-action="type-del" data-id="'+t.id+'">Delete</button>');
    h+='<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><div><span class="chip k'+(t.color%10)+'">'+esc(t.name)+'</span> <span class="muted" style="font-size:13px">'+esc(KIND_LABEL[t.kind]||'')+(t.hideOnHoliday?' · shown as a holiday':'')+'</span>'+(t.description?'<div class="muted" style="font-size:13px;margin-top:3px">'+esc(t.description)+'</div>':'')+'</div><div class="acts">'+acts+'</div></div>';
  });
  return h+'</div>';
}
function viewSet(st){
  var yr=st.yr,y=S.year,p=S.person,pp=personDoc(p)||{},mine=personYears(p),maxY=mine.length?Math.max.apply(null,mine):0;
  function f(id,label,val,step){return '<label class="field">'+label+'<input id="'+id+'" type="number" step="'+(step||'0.01')+'" value="'+esc(val==null?'':val)+'"></label>'}
  var h='<div class="panel stack"><h2 style="font-size:20px">Person</h2><div class="kv"><label class="field">Name<input id="pp-name" type="text" value="'+esc(pp.name||'')+'" maxlength="40"></label>'+
    '<label class="field">Employer<input id="pp-emp" type="text" value="'+esc(pp.employer||'')+'" maxlength="60"></label>'+
    '<label class="field">Emoji<input id="pp-emoji" type="text" value="'+esc(pp.emoji||'')+'" maxlength="8" placeholder="Paste an emoji"></label></div>'+
    '<div class="field">Color<div class="swatches" role="radiogroup" aria-label="Person color">'+SWATCH.map(function(n,i){return '<label class="k'+i+'" title="'+n+'"><input type="radio" name="pp-color" value="'+i+'"'+(pcolor(p)===i?' checked':'')+'><span></span></label>'}).join('')+'</div></div>'+
    '<div class="field">Photo (shown instead of the emoji)<div class="actions"><span id="pp-prev" class="pc'+pcolor(p)+'">'+avatar(personWithPending(pp),true)+'</span><input id="pp-photo" type="file" accept="image/*" data-action="pp-photo"><button class="btn small" data-action="pp-photo-clear">Remove photo</button></div></div>'+
    '<div class="actions"><button class="btn" data-action="save-person">Save person</button></div>'+
    '<div class="actions" style="margin-top:6px">'+(S.confirmPerson===p?'<span class="muted">Delete '+esc(pp.name||'this person')+' and all of their entries, holidays, years and types? This cannot be undone.</span><button class="btn small danger" data-action="person-del-yes">Delete everything</button><button class="btn small" data-action="person-del-no">Keep</button>':'<button class="btn small danger" data-action="person-del">Delete this person</button>')+'</div></div>';
  if(!yr){h+='<div class="panel stack" style="margin-top:14px"><h2 style="font-size:20px">'+esc(y)+' balances</h2><p class="hint" style="margin:0">Set up '+esc(y)+' to enter carried-over, accrued and future hours and the allowances.</p><div class="actions"><button class="btn primary" data-action="setup-year">Set up '+esc(y)+'</button></div></div>';h+=typesPanel(p);h+=accountPanel();return h}
  h+='<div class="panel stack" style="margin-top:14px"><h2 style="font-size:20px">'+esc(y)+' balances</h2><div class="kv">'+
    f('s-carried','Carried in from last year',yr.carried)+f('s-accrued','Accrued to date',yr.accrued)+f('s-future','Future accrual',yr.future)+
    '<label class="field">Accrual as of<input id="s-asof" type="date" value="'+esc(yr.asOf||'')+'"></label>'+
    f('s-cap','Max carryover',yr.carryCap==null?40:yr.carryCap)+typesFor(p).filter(function(t){return t.kind==='allowance'}).map(function(t){return f('s-al-'+t.id,t.name+' allowance',allowFor(yr,t))}).join('')+
    '</div><p class="hint" style="margin:0">PTO total = carried + accrued + future = <b class="num">'+fh(st.total)+'</b> hrs. Accrual rates depend on the employer.</p>'+
    '<div class="actions"><button class="btn primary" data-action="save-set">Save balances</button></div></div>';
  h+=typesPanel(p);
  h+=accountPanel();
  if(+y===maxY){
    h+='<div class="panel stack" style="margin-top:14px"><h2 style="font-size:20px">Start '+(maxY+1)+'</h2><p class="hint" style="margin:0">Creates the next year with up to '+fh(st.cap)+' hrs carried over (carrying <b class="num">'+fh(st.carry)+'</b> based on planned time), the standard holiday schedule, and this year’s accrual as a starting estimate. Adjust the numbers afterwards.</p>'+
      '<div class="actions"><button class="btn" data-action="new-year">Start '+(maxY+1)+'</button></div></div>';
  }
  return h;
}

/* ---------- modals ---------- */
function closeModal(){$('#modal').innerHTML='';document.removeEventListener('keydown',escKey)}
function escKey(e){if(e.key==='Escape')closeModal()}
function openModal(inner){
  $('#modal').innerHTML='<div class="modal-bg" data-action="bg"><div class="modal" role="dialog" aria-modal="true">'+inner+'</div></div>';
  document.addEventListener('keydown',escKey);
  var f=$('#modal input,#modal select');if(f)f.focus();
}
var manualHours=false;
function typeDesc(p,n){var t=typeByName(p,n);return t&&t.description?t.description:''}
function typeOptions(p,cur){
  var ts=typesFor(p),names=ts.map(function(t){return t.name});
  if(cur&&names.indexOf(cur)<0)names.push(cur);
  return names.map(function(n){return '<option'+(cur===n?' selected':'')+'>'+esc(n)+'</option>'}).join('');
}
function entryModal(e,date){
  var isNew=!e;e=e||{type:'PTO',start:date||todayStr(),end:date||todayStr(),status:'planned',reason:'',hours:null};
  manualHours=!isNew;
  var who=isNew?S.person:pid(e);
  var hrs=e.hours==null?calcHours(e.start,e.end,e.type,who):e.hours;
  openModal('<h2>'+(isNew?'Add time off':'Edit entry')+' <span class="muted" style="font-size:14px;font-family:var(--f-body)">for '+esc(pname(who))+'</span></h2><input type="hidden" id="e-id" value="'+esc(e.id||'')+'"><input type="hidden" id="e-year" value="'+esc(e.year||S.year)+'"><input type="hidden" id="e-person" value="'+esc(who)+'">'+
    '<label class="field">Type<select id="e-type" data-action="e-calc">'+typeOptions(who,e.type)+'</select></label>'+
    '<div class="hint" id="e-tdesc" style="margin:-6px 0 0">'+esc(typeDesc(who,e.type))+'</div>'+
    '<div class="kv" style="grid-template-columns:1fr 1fr"><label class="field">Start<input id="e-start" type="date" value="'+esc(e.start)+'" data-action="e-calc"></label>'+
    '<label class="field">End<input id="e-end" type="date" value="'+esc(e.end||e.start)+'" data-action="e-calc"></label></div>'+
    '<label class="field">Hours<input id="e-hours" type="number" step="0.25" min="0" value="'+esc(hrs)+'" data-action="e-hours"></label>'+
    '<div class="field">Status<div class="seg"><label><input type="radio" name="e-status" value="planned"'+(e.status==='planned'?' checked':'')+'>Planned</label><label><input type="radio" name="e-status" value="used"'+(e.status==='used'?' checked':'')+'>Taken</label></div></div>'+
    '<label class="field">Reason<input id="e-reason" type="text" value="'+esc(e.reason||'')+'" maxlength="140"></label>'+
    '<div class="hint" style="margin:0">Hours fill in from weekdays minus company holidays (8 hrs a day). Change the number for half days or weekends.</div>'+
    '<div class="err" id="e-err"></div><div class="actions"><button class="btn primary" data-action="e-save">Save</button><button class="btn" data-action="close">Cancel</button></div>');
}
function holModal(x){
  x=x||{name:'',date:S.year+'-01-01'};
  openModal('<h2>'+(x.id?'Edit holiday':'Add holiday')+'</h2><input type="hidden" id="h-id" value="'+esc(x.id||'')+'">'+
    '<label class="field">Name<input id="h-name" type="text" value="'+esc(x.name)+'" maxlength="80"></label>'+
    '<label class="field">Date observed<input id="h-date" type="date" value="'+esc(x.date)+'"></label>'+
    '<div class="err" id="e-err"></div><div class="actions"><button class="btn primary" data-action="h-save">Save</button><button class="btn" data-action="close">Cancel</button></div>');
}
function typeModal(t){
  var isNew=!t;t=t||{name:'',color:S.types.filter(function(x){return pid(x)===S.person}).length%10,kind:'allowance'};
  var main=t.kind==='balance';
  openModal('<h2>'+(isNew?'Add time off type':'Edit type')+'</h2><input type="hidden" id="t-id" value="'+esc(t.id||'')+'">'+
    '<label class="field">Name<input id="t-name" type="text" maxlength="40" value="'+esc(t.name)+'"></label>'+
    '<label class="field">Description<textarea id="t-desc" rows="2" maxlength="200" placeholder="What this type is for">'+esc(t.description||'')+'</textarea></label>'+
    '<div class="field">Color<div class="swatches" role="radiogroup" aria-label="Color">'+SWATCH.map(function(n,i){return '<label class="k'+i+'" title="'+n+'"><input type="radio" name="t-color" value="'+i+'"'+((t.color%10)===i?' checked':'')+'><span></span></label>'}).join('')+'</div></div>'+
    (main?'<p class="hint" style="margin:0">This is the main PTO type. Its hours come out of the yearly PTO balance.</p><input type="hidden" id="t-kind" value="balance">':
    '<label class="field">How it works<select id="t-kind">'+['allowance','tracked','holiday'].map(function(k){return '<option value="'+k+'"'+(t.kind===k?' selected':'')+'>'+KIND_LABEL[k]+'</option>'}).join('')+'</select></label>'+
    '<label class="field" style="flex-direction:row;gap:8px;align-items:center"><input id="t-hol" type="checkbox"'+(t.hideOnHoliday?' checked':'')+'> Show as a holiday on the calendar when it lands on a listed holiday</label>')+
    '<div class="err" id="e-err"></div><div class="actions"><button class="btn primary" data-action="t-save">Save</button><button class="btn" data-action="close">Cancel</button></div>');
}
function personModal(){
  openModal('<h2>Add person</h2><label class="field">Name<input id="pm-name" type="text" maxlength="40" placeholder="First name"></label>'+
    '<label class="field">Employer<input id="pm-emp" type="text" maxlength="60" placeholder="Company name"></label>'+
    '<label class="field">Emoji (optional)<input id="pm-emoji" type="text" maxlength="8" placeholder="Paste an emoji"></label>'+
    '<div class="field">Color<div class="swatches" role="radiogroup" aria-label="Person color">'+SWATCH.map(function(n,i){return '<label class="k'+i+'" title="'+n+'"><input type="radio" name="pm-color" value="'+i+'"'+((S.people.length%10)===i?' checked':'')+'><span></span></label>'}).join('')+'</div></div>'+
    '<p class="hint" style="margin:0">Everyone with access to this page can see and edit every person’s time off.</p>'+
    '<div class="err" id="e-err"></div><div class="actions"><button class="btn primary" data-action="p-save">Add person</button><button class="btn" data-action="close">Cancel</button></div>');
}
function recalc(){
  $('#e-tdesc').textContent=typeDesc($('#e-person').value,$('#e-type').value);
  if(manualHours)return;
  $('#e-hours').value=calcHours($('#e-start').value,$('#e-end').value||$('#e-start').value,$('#e-type').value,$('#e-person').value);
}

/* ---------- writes ---------- */
function fail(e){console.error(e);toast('Couldn’t save that. '+(e&&e.message?e.message:'Try again in a moment.'))}
async function saveEntry(){
  var start=$('#e-start').value,end=$('#e-end').value||start,hours=parseFloat($('#e-hours').value),id=$('#e-id').value;
  if(!start){$('#e-err').textContent='Pick a start date.';return}
  if(end<start){$('#e-err').textContent='End date is before the start date.';return}
  if(!(hours>=0)){$('#e-err').textContent='Enter the hours for this entry.';return}
  var data={person:$('#e-person').value,year:+$('#e-year').value,type:$('#e-type').value,start:start,end:end,hours:hours,
    status:document.querySelector('input[name=e-status]:checked').value,reason:$('#e-reason').value.trim()};
  try{ if(id)await db.collection('entries').doc(id).set(data); else await db.collection('entries').doc().set(data); closeModal(); toast('Saved') }catch(e){fail(e)}
}
async function saveHoliday(){
  var name=$('#h-name').value.trim(),date=$('#h-date').value,id=$('#h-id').value;
  if(!name||!date){$('#e-err').textContent='Enter a name and a date.';return}
  var data={person:S.person,year:+S.year,name:name,date:date};
  try{ if(id)await db.collection('holidays').doc(id).set(data); else await db.collection('holidays').doc().set(data); closeModal(); toast('Saved') }catch(e){fail(e)}
}
async function saveSettings(){
  function n(id){var v=parseFloat($(id).value);return isNaN(v)?0:v}
  var yr=yearDoc(S.year);if(!yr)return;
  var al={};typesFor(S.person).forEach(function(t){if(t.kind==='allowance'&&$('#s-al-'+t.id))al[t.id]=n('#s-al-'+t.id)});
  try{ await db.collection('years').doc(yr.id).update({carried:n('#s-carried'),accrued:n('#s-accrued'),future:n('#s-future'),asOf:$('#s-asof').value||'',
    carryCap:n('#s-cap'),allowances:al}); toast('Balances saved') }catch(e){fail(e)}
}
async function seedTypes(p){
  for(var i=0;i<DEFAULT_TYPES.length;i++){var d=DEFAULT_TYPES[i];
    var o={person:p,name:d.name,color:d.color,kind:d.kind,order:d.order};if(d.hideOnHoliday)o.hideOnHoliday=true;
    await db.collection('types').doc().set(o)}
}
async function saveType(){
  var name=$('#t-name').value.trim(),id=$('#t-id').value;
  if(!name){$('#e-err').textContent='Enter a name.';return}
  var col=+document.querySelector('input[name=t-color]:checked').value,kind=$('#t-kind').value,hol=$('#t-hol')?$('#t-hol').checked:false,desc=$('#t-desc').value.trim();
  var dup=typesFor(S.person).find(function(t){return t.name.toLowerCase()===name.toLowerCase()&&t.id!==id});
  if(dup){$('#e-err').textContent='There is already a type with that name.';return}
  try{
    if(id){
      var old=S.types.find(function(t){return t.id===id}),o={name:name,color:col,kind:kind,hideOnHoliday:hol,description:desc};
      await db.collection('types').doc(id).update(o);
      if(old&&old.name!==name){
        var es=S.entries.filter(function(e){return pid(e)===S.person&&e.type===old.name});
        for(var i=0;i<es.length;i++)await db.collection('entries').doc(es[i].id).update({type:name});
      }
    }else{
      var ord=typesFor(S.person).reduce(function(m,t){return Math.max(m,t.order||0)},0)+1;
      await db.collection('types').doc().set({person:S.person,name:name,color:col,kind:kind,hideOnHoliday:hol,description:desc,order:ord});
    }
    closeModal();toast('Saved');
  }catch(e){fail(e)}
}
async function savePerson(){
  var name=$('#pp-name').value.trim();if(!name){toast('Enter a name.');return}
  var o={name:name,employer:$('#pp-emp').value.trim(),emoji:$('#pp-emoji').value.trim(),color:+document.querySelector('input[name=pp-color]:checked').value};
  if(S.pendingAvatar!==undefined)o.avatar=S.pendingAvatar;
  try{await db.collection('people').doc(S.person).update(o);S.pendingAvatar=undefined;toast('Saved')}catch(e){fail(e)}
}
async function addPerson(){
  var name=$('#pm-name').value.trim();if(!name){$('#e-err').textContent='Enter a name.';return}
  var data={name:name,employer:$('#pm-emp').value.trim(),color:+(document.querySelector('input[name=pm-color]:checked')||{value:S.people.length%10}).value,emoji:$('#pm-emoji').value.trim(),created:Date.now()};
  try{
    var ref=db.collection('people').doc();
    await ref.set(data);
    await seedTypes(ref.id);
    S.person=ref.id;try{localStorage.setItem('pto-person',S.person)}catch(e){}
    closeModal();toast(name+' added. Pick a year to set up.');
  }catch(e){fail(e)}
}
async function createYear(p,y){
  var prev=yearDoc(y-1,p),carry=0,fut=0;
  if(prev){var ps=stats(y-1,p);carry=Math.round(ps.carry*100)/100;fut=Math.round(((+prev.accrued||0)+(+prev.future||0))*100)/100}
  var hol=defaultHolidays(y),al={};
  typesFor(p).forEach(function(t){if(t.kind==='allowance')al[t.id]=t.hideOnHoliday?Math.max(0,(hol.length-8)*8):(prev?allowFor(prev,t):0)});
  await db.collection('years').doc().set({person:p,year:y,carried:carry,accrued:0,future:fut,asOf:'',carryCap:prev?(prev.carryCap==null?40:+prev.carryCap):40,allowances:al});
  for(var i=0;i<hol.length;i++)await db.collection('holidays').doc().set({person:p,year:y,name:hol[i].name,date:hol[i].date});
}
async function setupYear(){
  try{await createYear(S.person,+S.year);S.tab='settings';location.hash='settings';toast(S.year+' set up. Enter the accrual numbers.')}catch(e){fail(e)}
}
async function newYear(){
  var mine=personYears(S.person),ny=Math.max.apply(null,mine)+1;
  try{await createYear(S.person,ny);S.year=ny;S.tab='settings';location.hash='settings';toast(ny+' created. Update the accrual numbers.')}catch(e){fail(e)}
}

/* ---------- events ---------- */
document.addEventListener('click',async function(ev){
  var el=ev.target.closest('[data-action]');if(!el)return;
  var a=el.dataset.action,id=el.dataset.id;
  if(a==='bg'){if(ev.target===el)closeModal();return}
  if(a==='e-calc'||a==='filter-type'||a==='filter-planned'||a==='e-hours')return;
  switch(a){
    case 'year':S.year=el.dataset.year;S.confirm=null;try{localStorage.setItem('pto-year',S.year)}catch(e){}render();break;
    case 'person':S.person=el.dataset.person;S.confirm=null;S.confirmPerson=null;S.pendingAvatar=undefined;try{localStorage.setItem('pto-person',S.person)}catch(e){}render();break;
    case 'person-add':personModal();break;
    case 'person-del':S.confirmPerson=S.person;render();break;
    case 'person-del-no':S.confirmPerson=null;render();break;
    case 'person-del-yes':{var gone=S.person;S.confirmPerson=null;try{await db.collection('people').doc(gone).delete();try{if(localStorage.getItem('pto-person')===gone)localStorage.removeItem('pto-person')}catch(e){}await loadAll();toast('Person deleted')}catch(e){fail(e)}break}
    case 'p-save':addPerson();break;
    case 'save-person':savePerson();break;
    case 'crop-save':try{S.pendingAvatar=cropResult();closeModal();updatePrev();toast('Photo ready. Press Save person to keep it.')}catch(e){toast('Couldn’t crop that image.')}break;
    case 'pp-photo-clear':S.pendingAvatar='';updatePrev();break;
    case 'sign-apple':oauth('apple');break;
    case 'sign-google':oauth('google');break;
    case 'sign-email':emailLink();break;
    case 'sign-out':await sb.auth.signOut();break;
    case 'reload':S.nodb=false;if(S.session)startSession();else render();break;
    case 'hh-create':hhCreate();break;
    case 'hh-join':hhJoin();break;
    case 'copy-code':try{await navigator.clipboard.writeText((S.household||{}).invite_code||'');toast('Code copied')}catch(e){toast('Select the code and copy it.')}break;
    case 'rotate-code':try{var rc=await sb.rpc('rotate_invite_code',{p_household:HID});if(rc.error)throw rc.error;S.household.invite_code=rc.data;render();toast('New code created')}catch(e){fail(e)}break;
    case 'type-add':typeModal(null);break;
    case 'type-edit':typeModal(S.types.find(function(t){return t.id===id}));break;
    case 't-save':saveType();break;
    case 'type-del':S.confirmType=id;render();break;
    case 'type-del-no':S.confirmType=null;render();break;
    case 'type-del-yes':S.confirmType=null;try{await db.collection('types').doc(id).delete();toast('Deleted')}catch(e){fail(e)}break;
    case 'seed-types':try{await seedTypes(S.person);toast('Types saved')}catch(e){fail(e)}break;
    case 'setup-year':setupYear();break;
    case 'add':entryModal(null);break;
    case 'add-day':entryModal(null,el.dataset.date);break;
    case 'edit':entryModal(S.entries.find(function(e){return e.id===id}));break;
    case 'close':closeModal();break;
    case 'e-save':saveEntry();break;
    case 'month':S.month=+el.dataset.m;render();break;
    case 'take':try{await db.collection('entries').doc(id).update({status:'used'});toast('Marked taken')}catch(e){fail(e)}break;
    case 'take-all':
      try{var p=entriesFor(S.person,S.year).filter(function(e){return e.status==='planned'&&(e.end||e.start)<todayStr()});
        for(var i=0;i<p.length;i++)await db.collection('entries').doc(p[i].id).update({status:'used'});toast('Marked '+p.length+' taken')}catch(e){fail(e)}break;
    case 'del':S.confirm=id;render();break;
    case 'del-no':S.confirm=null;render();break;
    case 'del-yes':S.confirm=null;try{await db.collection('entries').doc(id).delete();toast('Deleted')}catch(e){fail(e)}break;
    case 'hol-add':holModal(null);break;
    case 'hol-edit':holModal(S.holidays.find(function(x){return x.id===id}));break;
    case 'hol-del':try{await db.collection('holidays').doc(id).delete();toast('Deleted')}catch(e){fail(e)}break;
    case 'h-save':saveHoliday();break;
    case 'apply-des':
      var n=holidaysFor(S.person,S.year).length,yd=yearDoc(S.year),dt=typesFor(S.person).find(function(t){return t.kind==='allowance'&&t.hideOnHoliday});
      if(!dt||dt.virtual)break;
      var upd={};upd[dt.id]=Math.max(0,(n-8)*8);
      try{await db.collection('years').doc(yd.id).update({allowances:upd});toast('Allowance updated')}catch(e){fail(e)}break;
    case 'save-set':saveSettings();break;
    case 'new-year':newYear();break;
  }
});
document.addEventListener('change',function(ev){
  var el=ev.target,a=el.dataset&&el.dataset.action;
  if(a==='filter-type'){S.fType=el.value;render()}
  else if(a==='filter-planned'){S.fPlanned=el.checked;render()}
  else if(a==='e-calc')recalc();
  else if(a==='pp-photo'&&el.files&&el.files[0]){var f=el.files[0];el.value='';openCrop(f)}
});
document.addEventListener('input',function(ev){
  var el=ev.target;
  if(el.id==='e-hours')manualHours=true;
  if(el.id==='crop-zoom')setZoom(parseFloat(el.value));
  if(el.dataset&&el.dataset.action==='e-calc'&&el.type==='date')recalc();
});
document.addEventListener('focusout',function(){
  setTimeout(function(){if(S.pending&&!(document.activeElement&&/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))){S.pending=false;render()}},50);
});
function readHash(){var t=location.hash.replace('#','');if(TABS.indexOf(t)>-1)S.tab=t;else if(!t)S.tab='log'}
window.addEventListener('hashchange',function(){readHash();render()});

/* ---------- data (Supabase) ---------- */
var CFG=window.PTO_CONFIG||{};
var sb=null,HID=null,rt=null;
var MAP={
  people:{table:'people',cols:{name:'name',employer:'employer',color:'color',emoji:'emoji',avatar:'avatar',created:'sort_order'}},
  types:{table:'types',cols:{person:'person_id',name:'name',color:'color',kind:'kind',description:'description',hideOnHoliday:'hide_on_holiday',order:'sort_order'}},
  years:{table:'years',cols:{person:'person_id',year:'year',carried:'carried',accrued:'accrued',future:'future',asOf:'as_of',carryCap:'carry_cap',allowances:'allowances'}},
  entries:{table:'entries',cols:{person:'person_id',year:'year',type:'type',start:'start_date',end:'end_date',hours:'hours',status:'status',reason:'reason'}},
  holidays:{table:'holidays',cols:{person:'person_id',year:'year',name:'name',date:'date'}}
};
function toRow(name,obj){
  var m=MAP[name].cols,r={};
  Object.keys(obj).forEach(function(k){
    if(m[k]===undefined)return;
    var v=obj[k];
    if(k==='asOf'&&!v)v=null;
    if(k==='created')v=Math.round(v);
    r[m[k]]=v;
  });
  return r;
}
function fromRow(name,row){
  var m=MAP[name].cols,o={id:row.id};
  Object.keys(m).forEach(function(k){
    var v=row[m[k]];
    if(k==='asOf'&&v==null)v='';
    if(k==='allowances'&&!v)v={};
    o[k]=v;
  });
  return o;
}
async function refresh(name){
  var q=sb.from(MAP[name].table).select('*').eq('household_id',HID);
  if(name==='people')q=q.order('sort_order');
  var r=await q;if(r.error)throw r.error;
  S[name]=r.data.map(function(x){return fromRow(name,x)});
  S.ready[name]=true;after(name);
}
function makeDb(){
  return {collection:function(name){
    var t=MAP[name].table;
    return {doc:function(id){
      id=id||crypto.randomUUID();
      return {id:id,
        set:async function(data){var row=toRow(name,data);row.id=id;row.household_id=HID;var r=await sb.from(t).upsert(row);if(r.error)throw r.error;await refresh(name)},
        update:async function(data){
          var d=data;
          if(name==='years'&&data.allowances){var cur=S.years.find(function(x){return x.id===id});d=Object.assign({},data,{allowances:Object.assign({},cur&&cur.allowances,data.allowances)})}
          var r=await sb.from(t).update(toRow(name,d)).eq('id',id);if(r.error)throw r.error;await refresh(name)},
        delete:async function(){var r=await sb.from(t).delete().eq('id',id);if(r.error)throw r.error;await refresh(name)}
      };
    }};
  }};
}
async function loadAll(){await Promise.all(NAMES.map(refresh))}
function watch(){
  if(rt)sb.removeChannel(rt);
  var timers={};rt=sb.channel('hh-'+HID);
  NAMES.forEach(function(n){
    rt.on('postgres_changes',{event:'*',schema:'public',table:MAP[n].table,filter:'household_id=eq.'+HID},function(){
      clearTimeout(timers[n]);timers[n]=setTimeout(function(){refresh(n).catch(function(){})},250)});
  });
  rt.subscribe();
}
document.addEventListener('visibilitychange',function(){if(!document.hidden&&HID&&db)loadAll().catch(function(){})});
window.addEventListener('online',function(){if(HID&&db)loadAll().catch(function(){})});

function pickYear(){
  var ids=allYears().map(String);if(!ids.length)return;
  if(S.year&&ids.indexOf(String(S.year))>-1)return;
  var saved=null;try{saved=localStorage.getItem('pto-year')}catch(e){}
  var cur=String(new Date().getFullYear());
  S.year=ids.indexOf(saved)>-1?saved:ids.indexOf(cur)>-1?cur:ids[ids.length-1];
}
function pickPerson(){
  if(!S.people.length)return;
  if(S.person&&personDoc(S.person))return;
  var saved=null;try{saved=localStorage.getItem('pto-person')}catch(e){}
  S.person=saved&&personDoc(saved)?saved:S.people[0].id;
}
function after(name){
  if(name==='people')pickPerson();
  if(name==='years')pickYear();
  scheduleRender();
}

/* ---------- sign-in and household ---------- */
function redirectUrl(){return location.origin+location.pathname}
async function oauth(provider){
  var r=await sb.auth.signInWithOAuth({provider:provider,options:{redirectTo:redirectUrl()}});
  if(r.error){S.authMsg=r.error.message;render()}
}
async function emailLink(){
  var em=($('#si-email')||{}).value;em=(em||'').trim();
  if(!em){S.authMsg='Enter your email address.';render();return}
  var r=await sb.auth.signInWithOtp({email:em,options:{emailRedirectTo:redirectUrl()}});
  S.authMsg=r.error?r.error.message:'Check your email for a sign-in link.';render();
}
async function hhCreate(){
  var r=await sb.rpc('create_household',{p_name:($('#hh-name')||{}).value||''});
  if(r.error){S.authMsg=r.error.message;render();return}
  S.authMsg='';await startSession();
}
async function hhJoin(){
  var code=(($('#hh-code')||{}).value||'').trim();
  if(!code){S.authMsg='Enter the invite code.';render();return}
  var r=await sb.rpc('join_household',{p_code:code});
  if(r.error){S.authMsg=r.error.message;render();return}
  S.authMsg='';await startSession();
}
async function startSession(){
  var r=await sb.from('household_members').select('household_id, households(id,name,invite_code)').limit(1);
  if(r.error){S.nodb=true;S.why=r.error.message;render();return}
  if(!r.data.length){S.needHousehold=true;render();return}
  S.needHousehold=false;HID=r.data[0].household_id;S.household=r.data[0].households;db=makeDb();
  try{await loadAll();watch()}catch(e){S.nodb=true;S.why=e.message||String(e);render()}
}
function onSession(sess){
  var uid=sess&&sess.user&&sess.user.id,prev=S.session&&S.session.user&&S.session.user.id;
  S.authReady=true;
  if(uid&&uid===prev){S.session=sess;return}
  S.session=sess||null;
  if(!sess){
    HID=null;db=null;S.household=null;S.needHousehold=false;S.person=null;S.nodb=false;
    NAMES.forEach(function(n){S[n]=[];S.ready[n]=false});
    if(rt){sb.removeChannel(rt);rt=null}
    render();return;
  }
  S.authMsg='';render();startSession();
}
function boot(){
  readHash();render();
  if(!CFG.url||!CFG.key||CFG.url.indexOf('YOUR-PROJECT')>-1){S.setup=true;render();return}
  sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  sb.auth.onAuthStateChange(function(ev,sess){setTimeout(function(){onSession(sess)},0)});
}
boot();
if('serviceWorker' in navigator&&location.protocol==='https:')window.addEventListener('load',function(){navigator.serviceWorker.register('./sw.js').catch(function(){})});
})();
