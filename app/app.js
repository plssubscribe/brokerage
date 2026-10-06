'use strict';
// ---------- constants ----------
const KEY = 'brokerage.v1';
const STAGES = ['New','Qualifying','Inventory requested','Inventory received','With partner','Priced / decision','Won','Dead'];
const MOMENTUM = [0.05,0.2,0.4,0.7,0.85,1,1,0];
const EXPORT = {unknown:['Unknown',0.2],now:['Within 48h',1],week:['Within a week',0.7],month:['Within a month',0.4],hard:['Hard / none',0]};
const AUTH = {ceo:['Owner / CEO',1],exec:['Executive',0.7],mgr:['Manager',0.4],other:['Other / unknown',0.2]};
const RESP = {hot:['Hot (replies fast)',1],warm:['Warm',0.6],cold:['Cold / slow',0.2]};
const SYS_TYPES = ['CRM','ERP','Email client','File storage','Spreadsheets','Accounting','HR & payroll','Team communication','Projects & knowledge','Marketing','Customer support','Website & ecommerce','Inventory & operations','Analytics & databases','Contracts & forms','Other / custom'];
// categories that tend to be most valuable as training/eval data
const RICH_TYPES = new Set(['Email client','File storage','CRM','ERP','Customer support','Team communication','Projects & knowledge','Contracts & forms','Analytics & databases']);
const DEFAULT_WEIGHTS = {authority:15,volume:20,size:12,years:8,richness:15,export:12,momentum:10,responsiveness:8};
const WEIGHT_LABELS = {authority:'Decision-maker authority',volume:'Data volume (TB, log scale)',size:'Company size (US W2 employees)',years:'Years of history',richness:'Richness (# of valuable system types)',export:'Export readiness / speed',momentum:'Pipeline stage momentum',responsiveness:'Responsiveness'};
const VALUE_KEYS = ['volume','size','years','richness'], READY_KEYS = ['export','momentum','authority','responsiveness'];
const TIERS = {t1:65,t2:40};

// ---------- state ----------
const uid = () => Math.random().toString(36).slice(2,10);
const today = () => new Date().toISOString().slice(0,10);
function freshState(){return{
  leads:[],
  partners:[{id:'p_michael',name:'Michael Fanous',org:'Data brokerage / channel partner',handle:'',notes:'Direct relationships with leading US frontier AI labs. Very large contracts. Wants yellow cells of Inventory tab completed for each business.',exclusiveFirst:true,slaHours:24,minEmployees:20,requirements:'U.S.-facing, currently operating, 20+ U.S. full-time employees. One system per row on the Inventory tab. Estimates are fine.'}],
  weights:{...DEFAULT_WEIGHTS}, tab:'today', sort:{k:'score',d:-1}};}
let S; try{S=JSON.parse(localStorage.getItem(KEY))}catch(e){}
S = Object.assign(freshState(), S||{}); S.weights = Object.assign({},DEFAULT_WEIGHTS,S.weights);
const save = () => { try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){} };

function newLead(o={}){return Object.assign({id:uid(),name:'',contact:'',authority:'other',handle:'',source:'',website:'',country:'US',desc:'',usEmployees:'',contractors:'',inboxes:'',
  usFacing:true,operating:true,volumeTB:'',years:'',whereLives:'',exportSpeed:'unknown',exportNote:'',systems:[],filesNote:'',
  stage:'New',responsiveness:'warm',vip:false,partnerId:'p_michael',submittedAt:'',price:'',decision:'pending',alsoSharedWith:'',
  nextAction:'',nextDate:'',lastContact:today(),notes:'',created:today()},o);}

// ---------- scoring ----------
const clamp = x => Math.max(0,Math.min(1,x));
const num = v => { const m=String(v??'').replace(/,/g,'').match(/-?\d+(\.\d+)?/); return m?parseFloat(m[0]):null; };
function factors(l){
  const emp=num(l.usEmployees), tb=num(l.volumeTB), yr=num(l.years);
  const rich=new Set((l.systems||[]).filter(s=>s.type&&RICH_TYPES.has(s.type)).map(s=>s.type)).size;
  return {
    authority:AUTH[l.authority]?.[1]??0.2,
    volume:tb>0?clamp(Math.log10(tb/0.1)/3):0,
    size:emp>0?clamp(Math.log10(emp/20)/Math.log10(25)):0,
    years:yr>0?clamp(yr/15):0,
    richness:clamp(rich/6),
    export:EXPORT[l.exportSpeed]?.[1]??0.2,
    momentum:MOMENTUM[STAGES.indexOf(l.stage)]??0,
    responsiveness:RESP[l.responsiveness]?.[1]??0.6};
}
function qualification(l,minEmp=20){
  const emp=num(l.usEmployees), issues=[];
  if(!l.usFacing) issues.push('Not U.S.-facing');
  if(!l.operating) issues.push('Not operating');
  if(emp!==null && emp<minEmp) issues.push(`<${minEmp} US employees`);
  return {ok:!issues.length, issues, unverified:emp===null};
}
function weighted(f,keys){const w=S.weights;let t=0,s=0;for(const k of keys){t+=w[k];s+=w[k]*f[k]}return t?s/t:0}
function score(l){
  const f=factors(l),w=S.weights,tot=Object.values(w).reduce((a,b)=>a+b,0)||1;
  let s=100*Object.keys(w).reduce((a,k)=>a+w[k]*f[k],0)/tot;
  const q=qualification(l,partnerOf(l)?.minEmployees||20);
  if(!q.ok) s*=0.3;
  if(l.vip) s+=10;
  return Math.round(Math.min(100,s));
}
const tier = s => s>=TIERS.t1?1:s>=TIERS.t2?2:3;
const partnerOf = l => S.partners.find(p=>p.id===l.partnerId);

// ---------- helpers ----------
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = s => document.querySelector(s);
const daysAgo = d => d?Math.floor((Date.now()-new Date(d))/864e5):null;
function slaInfo(l){
  if(!l.submittedAt||l.decision!=='pending') return null;
  const p=partnerOf(l), h=p?.slaHours||24, left=new Date(l.submittedAt).getTime()+h*36e5-Date.now();
  const a=Math.abs(left), hh=Math.floor(a/36e5), mm=Math.floor(a%36e5/6e4);
  return {left, text:(left<0?'overdue ':'')+`${hh}h ${mm}m`+(left<0?'':' left'), late:left<0};
}
function exclusivityBreach(l){
  const p=partnerOf(l);
  return !!(p?.exclusiveFirst && l.alsoSharedWith.trim() && (!l.submittedAt || l.decision==='pending'));
}
function toast(t){alert(t)}
function download(name,text,type='application/json'){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();
}

// ---------- rendering ----------
const TABS=[['today','Today'],['board','Board'],['matrix','Priority matrix'],['table','All leads'],['partners','Partners'],['settings','Scoring']];
function render(){
  $('#tabs').innerHTML=TABS.map(([k,v])=>`<button data-tab="${k}" class="${S.tab===k?'on':''}">${v}</button>`).join('');
  $('#main').innerHTML=({today:vToday,board:vBoard,matrix:vMatrix,table:vTable,partners:vPartners,settings:vSettings})[S.tab]();
  if(S.tab==='board') wireBoard();
}
const leadsSorted = () => S.leads.map(l=>({l,s:score(l)})).sort((a,b)=>b.s-a.s);
function badges(l,s){
  const q=qualification(l,partnerOf(l)?.minEmployees||20), sla=slaInfo(l), t=tier(s);
  return `<span class="pill t${t}">Tier ${t}</span>`+(l.vip?'<span class="pill t1">★ VIP</span>':'')
   +q.issues.map(i=>`<span class="pill bad">${esc(i)}</span>`).join('')
   +(q.ok&&q.unverified?'<span class="pill">unverified size</span>':'')
   +(sla?`<span class="pill ${sla.late?'bad':'t2'}">⏱ ${sla.text}</span>`:'')
   +(exclusivityBreach(l)?'<span class="pill bad">⚠ exclusivity</span>':'')
   +(l.decision==='yes'?'<span class="pill t1">partner: yes'+(l.price?' · '+esc(l.price):'')+'</span>':l.decision==='no'?'<span class="pill">partner: no</span>':'');
}
function card(l,s){
  return `<div class="lead t${tier(s)}" draggable="true" data-id="${l.id}" data-open="${l.id}"><span class="score">${s}</span><b>${esc(l.name||'(unnamed)')}</b>
  <small>${esc(l.contact)} ${l.handle?'· '+esc(l.handle):''}</small><div>${badges(l,s)}</div>
  ${l.nextAction?`<small>→ ${esc(l.nextAction)}${l.nextDate?' ('+esc(l.nextDate)+')':''}</small>`:''}</div>`;
}
function vToday(){
  const rows=leadsSorted().filter(x=>!['Won','Dead'].includes(x.l.stage));
  const sla=rows.filter(x=>slaInfo(x.l)).sort((a,b)=>slaInfo(a.l).left-slaInfo(b.l).left);
  const due=rows.filter(x=>x.l.nextDate&&x.l.nextDate<=today());
  const stale=rows.filter(x=>tier(x.s)===1&&daysAgo(x.l.lastContact)>=3&&!due.includes(x));
  const breach=S.leads.filter(exclusivityBreach);
  const list=(a,empty)=>a.length?a.map(x=>card(x.l,x.s)).join(''):`<p class="mute">${empty}</p>`;
  const awaiting=rows.filter(x=>x.l.stage==='Inventory requested');
  return `${breach.length?`<div class="banner warn"><b>Exclusivity warning.</b> ${breach.map(l=>esc(l.name)).join(', ')} marked as shared with another lab before the partner's decision. ${esc(S.partners.find(p=>p.exclusiveFirst)?.name||'The partner')} must see everything first.</div>`:''}
  <div class="grid2">
   <div><h2>⏱ Partner answer clocks (${sla.length})</h2>${list(sla,'Nothing submitted and awaiting a yes/no.')}</div>
   <div><h2>📅 Next actions due (${due.length})</h2>${list(due,'Nothing due today.')}</div>
   <div><h2>🔥 Tier 1 going quiet (${stale.length})</h2>${list(stale,'Every Tier 1 lead has been touched in the last 3 days.')}</div>
   <div><h2>📨 Waiting on their inventory (${awaiting.length})</h2>${list(awaiting,'None.')}</div>
  </div>${S.leads.length?'':'<p class="mute">No leads yet. Add one, paste a DM, or <a href="#" data-action="demo">load demo data</a>.</p>'}`;
}
function vBoard(){
  return `<div class="board">${STAGES.map(st=>{const c=leadsSorted().filter(x=>x.l.stage===st);
    return `<div class="col" data-stage="${st}"><h3><span>${st}</span><span>${c.length}</span></h3>${c.map(x=>card(x.l,x.s)).join('')}</div>`}).join('')}</div>`;
}
function wireBoard(){
  document.querySelectorAll('.lead').forEach(e=>e.addEventListener('dragstart',ev=>ev.dataTransfer.setData('text/plain',e.dataset.id)));
  document.querySelectorAll('.col').forEach(c=>{
    c.addEventListener('dragover',e=>{e.preventDefault();c.classList.add('over')});
    c.addEventListener('dragleave',()=>c.classList.remove('over'));
    c.addEventListener('drop',e=>{e.preventDefault();const l=S.leads.find(x=>x.id===e.dataTransfer.getData('text/plain'));
      if(l){setStage(l,c.dataset.stage)}});
  });
}
function setStage(l,st){
  l.stage=st; l.lastContact=today();
  if(st==='With partner'&&!l.submittedAt) l.submittedAt=new Date().toISOString().slice(0,16);
  save();render();
}
function vMatrix(){
  const W=900,H=560,P=50, rows=leadsSorted().map(x=>{const f=factors(x.l);return{...x,v:weighted(f,VALUE_KEYS),r:weighted(f,READY_KEYS)}});
  const X=r=>P+r*(W-P-20), Y=v=>H-P-v*(H-P-20), col=t=>t===1?'var(--t1)':t===2?'var(--t2)':'var(--t3)';
  return `<div class="card"><h2>Priority matrix — value of the data vs. how ready the deal is</h2>
  <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Scatter of leads by value and readiness">
   <rect x="${X(.5)}" y="${Y(1)}" width="${X(1)-X(.5)}" height="${Y(.5)-Y(1)}" fill="var(--t1)" opacity=".08"/>
   <line x1="${X(.5)}" x2="${X(.5)}" y1="${Y(0)}" y2="${Y(1)}" stroke="var(--line)"/><line x1="${X(0)}" x2="${X(1)}" y1="${Y(.5)}" y2="${Y(.5)}" stroke="var(--line)"/>
   <rect x="${X(0)}" y="${Y(1)}" width="${X(1)-X(0)}" height="${Y(0)-Y(1)}" fill="none" stroke="var(--line)"/>
   <text x="${X(.99)}" y="${Y(.97)}" text-anchor="end">WORK FIRST: valuable + ready</text>
   <text x="${X(.01)}" y="${Y(.97)}">NURTURE: valuable, not ready</text>
   <text x="${X(.99)}" y="${Y(.03)}" text-anchor="end">QUICK WINS: ready, smaller</text>
   <text x="${X(.01)}" y="${Y(.03)}">PARK</text>
   <text x="${(X(0)+X(1))/2}" y="${H-12}" text-anchor="middle">Readiness →</text>
   <text transform="translate(14 ${H/2}) rotate(-90)" text-anchor="middle">Value →</text>
   ${rows.map(x=>`<g class="dot" data-open="${x.l.id}"><circle cx="${X(x.r)}" cy="${Y(x.v)}" r="${6+x.s/9}" fill="${col(tier(x.s))}" fill-opacity=".75" stroke="${x.l.vip?'var(--ink)':'none'}" stroke-width="2.5"/>
     <text class="lbl" x="${x.r>.75?X(x.r)-10-x.s/9:X(x.r)+10+x.s/9}" ${x.r>.75?'text-anchor="end"':''} y="${Y(x.v)+4}">${esc((x.l.name||'?').slice(0,22))}</text></g>`).join('')}
  </svg><p class="mute">Circle size = priority score · color = tier · dark ring = VIP. Value uses volume, size, years, richness; readiness uses export speed, stage, authority, responsiveness (weights from the Scoring tab).</p></div>`;
}
function vTable(){
  const cols=[['score','Score'],['name','Company'],['contact','Contact'],['stage','Stage'],['usEmployees','US emp.'],['volumeTB','TB'],['years','Yrs'],['lastContact','Last contact'],['nextDate','Next']];
  const {k,d}=S.sort, rows=leadsSorted().sort((a,b)=>{const g=x=>k==='score'?x.s:(num(x.l[k])??x.l[k]??'');const A=g(a),B=g(b);return (A>B?1:A<B?-1:0)*d});
  return `<table><thead><tr>${cols.map(([c,t])=>`<th data-sort="${c}">${t}${k===c?(d>0?' ▲':' ▼'):''}</th>`).join('')}<th>Flags</th></tr></thead><tbody>
  ${rows.map(({l,s})=>`<tr class="row" data-open="${l.id}"><td><b>${s}</b></td><td>${esc(l.name)}</td><td>${esc(l.contact)}</td><td>${esc(l.stage)}</td><td>${esc(l.usEmployees)}</td><td>${esc(l.volumeTB)}</td><td>${esc(l.years)}</td><td>${esc(l.lastContact)}</td><td>${esc(l.nextAction)} ${esc(l.nextDate)}</td><td>${badges(l,s)}</td></tr>`).join('')||'<tr><td colspan="10" class="mute">No leads.</td></tr>'}
  </tbody></table>`;
}
function vPartners(){
  return `<p class="mute">Partners are the labs / channel partners you sell through. Their rules drive qualification, the answer clock, and the exclusivity warning.</p>
  <div class="grid2">${S.partners.map(p=>`<div class="card"><h2>${esc(p.name)}</h2>
   ${['name','org','handle'].map(k=>`<label class="fl">${k}<input data-p="${p.id}" data-k="${k}" value="${esc(p[k])}"></label>`).join('')}
   <label class="fl">Requirements<textarea data-p="${p.id}" data-k="requirements">${esc(p.requirements)}</textarea></label>
   <label class="fl">Notes<textarea data-p="${p.id}" data-k="notes">${esc(p.notes)}</textarea></label>
   <div class="f"><label class="fl">Min US employees<input type="number" data-p="${p.id}" data-k="minEmployees" value="${p.minEmployees}"></label>
   <label class="fl">Answer SLA (hours)<input type="number" data-p="${p.id}" data-k="slaHours" value="${p.slaHours}"></label></div>
   <label class="fl chk"><input type="checkbox" data-p="${p.id}" data-k="exclusiveFirst" ${p.exclusiveFirst?'checked':''}> They must see every lead before any other lab</label><br>
   <button class="btn" data-action="copy-request" data-id="${p.id}">Copy "send us your inventory" message</button>
   <p class="mute">${S.leads.filter(l=>l.partnerId===p.id).length} leads routed here.</p></div>`).join('')}
  </div><p><button class="btn" data-action="new-partner">+ Add partner</button></p>`;
}
function vSettings(){
  const w=S.weights, tot=Object.values(w).reduce((a,b)=>a+b,0);
  return `<div class="card"><h2>Priority score weights (total ${tot}; normalized to 100)</h2>
  ${Object.keys(w).map(k=>`<div class="wrow"><span>${WEIGHT_LABELS[k]}</span><input type="range" min="0" max="40" value="${w[k]}" data-w="${k}"><b>${w[k]}</b></div>`).join('')}
  <p class="mute">Gate: if a lead isn't U.S.-facing, isn't operating, or is under the partner's minimum US employees, the score is cut to 30%. VIP flag adds +10. Tier 1 ≥ ${TIERS.t1}, Tier 2 ≥ ${TIERS.t2}.</p>
  <button class="btn" data-action="reset-weights">Reset to defaults</button></div>`;
}

// ---------- lead drawer ----------
const opt = (o,v)=>Object.entries(o).map(([k,x])=>`<option value="${k}" ${k===v?'selected':''}>${x[0]}</option>`).join('');
const inp = (l,k,label,type='text',cls='')=>`<label class="fl ${cls}">${label}<input type="${type}" data-k="${k}" value="${esc(l[k])}"></label>`;
function openLead(id){
  const l=S.leads.find(x=>x.id===id); if(!l) return;
  const d=$('#drawer'); d.hidden=false; d.dataset.id=id;
  const s=score(l), q=qualification(l,partnerOf(l)?.minEmployees||20);
  d.innerHTML=`<div style="display:flex;justify-content:space-between"><h2>${esc(l.name||'New lead')} <span id="dscore" class="pill t${tier(s)}">${s} · Tier ${tier(s)}</span></h2><button class="btn" data-action="close">✕</button></div>
  <div id="dwarn">${drawerWarn(l,q)}</div>
  <fieldset><legend>Contact</legend><div class="f">${inp(l,'name','Company')}${inp(l,'contact','Contact person')}
   <label class="fl">Their authority<select data-k="authority">${opt(AUTH,l.authority)}</select></label>${inp(l,'handle','X handle / phone')}${inp(l,'source','Link to DM / source','text','full')}</div></fieldset>
  <fieldset><legend>Qualification (partner requires US-facing, operating, ${partnerOf(l)?.minEmployees||20}+ US FTE)</legend><div class="f">
   <label class="fl chk"><input type="checkbox" data-k="usFacing" ${l.usFacing?'checked':''}> U.S.-facing</label><label class="fl chk"><input type="checkbox" data-k="operating" ${l.operating?'checked':''}> Currently operating</label>
   ${inp(l,'usEmployees','Approx. W2 US employees','number')}${inp(l,'contractors','Contractors','number')}${inp(l,'inboxes','Employee email inboxes','number')}${inp(l,'website','Website')}${inp(l,'country','Country')}
   <label class="fl full">What the company does<textarea data-k="desc">${esc(l.desc)}</textarea></label></div></fieldset>
  <fieldset><legend>Headline data numbers</legend><div class="f">${inp(l,'volumeTB','Total volume (TB)','number')}${inp(l,'years','Years of history','number')}
   <label class="fl">Export speed<select data-k="exportSpeed">${opt(EXPORT,l.exportSpeed)}</select></label>${inp(l,'exportNote','Export notes (their words)')}${inp(l,'whereLives','Where the data lives','text','full')}</div></fieldset>
  <fieldset><legend>Systems &amp; tools (one per row)</legend><table class="sys"><thead><tr><th>Type</th><th>Tool</th><th>Years</th><th>Contents</th><th>Export?</th><th></th></tr></thead><tbody>
   ${l.systems.map((s,i)=>`<tr data-i="${i}"><td><select data-sk="type"><option></option>${SYS_TYPES.map(t=>`<option ${t===s.type?'selected':''}>${t}</option>`).join('')}</select></td>
   ${['tool','years','contents','export'].map(k=>`<td><input data-sk="${k}" value="${esc(s[k])}"></td>`).join('')}<td><button class="btn danger" data-action="del-sys" data-i="${i}">✕</button></td></tr>`).join('')}</tbody></table>
   <button class="btn" data-action="add-sys">+ system</button>
   <label class="fl" style="margin-top:8px">What would we find in their files?<textarea data-k="filesNote">${esc(l.filesNote)}</textarea></label></fieldset>
  <fieldset><legend>Deal</legend><div class="f">
   <label class="fl">Stage<select data-k="stage">${STAGES.map(s=>`<option ${s===l.stage?'selected':''}>${s}</option>`).join('')}</select></label>
   <label class="fl">Responsiveness<select data-k="responsiveness">${opt(RESP,l.responsiveness)}</select></label>
   <label class="fl">Partner<select data-k="partnerId">${S.partners.map(p=>`<option value="${p.id}" ${p.id===l.partnerId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>
   <label class="fl chk"><input type="checkbox" data-k="vip" ${l.vip?'checked':''}> ★ VIP (+10)</label>
   ${inp(l,'submittedAt','Submitted to partner (starts answer clock)','datetime-local')}
   <label class="fl">Partner decision<select data-k="decision">${['pending','yes','no'].map(v=>`<option ${v===l.decision?'selected':''}>${v}</option>`).join('')}</select></label>
   ${inp(l,'price','Partner price offer')}${inp(l,'alsoSharedWith','Also shared with other labs? (who)')}
   ${inp(l,'nextAction','Next action')}${inp(l,'nextDate','Next action date','date')}${inp(l,'lastContact','Last contact','date')}
   <label class="fl full">Notes<textarea data-k="notes">${esc(l.notes)}</textarea></label></div></fieldset>
  <button class="btn" data-action="copy-request" data-id="${l.partnerId}">Copy inventory-request message</button>
  <button class="btn danger" data-action="del-lead">Delete lead</button>`;
}
function drawerWarn(l,q){
  return (q.ok?'':`<div class="banner warn">Doesn't meet partner criteria: ${q.issues.join(', ')}. Score cut to 30%.</div>`)
   +(exclusivityBreach(l)?`<div class="banner warn"><b>Exclusivity:</b> ${esc(partnerOf(l).name)} must see this and answer before it goes to any other lab.</div>`:'');
}
function refreshDrawerMeta(l){
  const s=score(l),e=$('#dscore'); if(e){e.textContent=`${s} · Tier ${tier(s)}`;e.className=`pill t${tier(s)}`}
  const w=$('#dwarn'); if(w) w.innerHTML=drawerWarn(l,qualification(l,partnerOf(l)?.minEmployees||20));
}

// ---------- DM paste / JSON extraction ----------
const SCHEMA = `{"name":"company","contact":"person","authority":"ceo|exec|mgr|other","handle":"","website":"","country":"","desc":"1-2 sentences","usEmployees":number|null,"volumeTB":number|null,"years":number|null,"whereLives":"","exportSpeed":"unknown|now|week|month|hard","usFacing":true|false,"operating":true|false,"notes":"anything notable, incl. promises/terms","nextAction":"","systems":[{"type":"CRM|ERP|Email client|File storage|...","tool":"","years":"","contents":"","export":""}]}`;
function showModal(html){const m=$('#modal');m.innerHTML=`<div class="card">${html}</div>`;m.hidden=false}
function pasteDM(){
  showModal(`<h2>Paste a DM</h2><p class="mute">1) Paste the conversation. 2) Copy the prompt, give it to Claude. 3) Paste Claude's JSON reply below. (No API keys stored in this app.)</p>
  <textarea id="dm" placeholder="Paste the DM thread here..." style="min-height:140px"></textarea>
  <p><button class="btn" data-action="copy-prompt">Copy prompt for Claude</button></p>
  <textarea id="dmjson" placeholder='Paste Claude&apos;s JSON reply here...' style="min-height:120px"></textarea>
  <p><button class="btn primary" data-action="apply-json">Create / update lead</button> <button class="btn" data-action="close-modal">Cancel</button></p>`);
}
function applyJSON(txt){
  const m=txt.match(/\{[\s\S]*\}/); if(!m) return toast('No JSON found');
  let o; try{o=JSON.parse(m[0])}catch(e){return toast('Invalid JSON: '+e.message)}
  upsertLead(o); $('#modal').hidden=true;
}
function upsertLead(o){
  const key=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const ex=S.leads.find(l=>key(l.name)&&key(l.name)===key(o.name)||(o.handle&&key(l.handle)===key(o.handle)));
  const clean={}; for(const k in o) if(o[k]!==null&&o[k]!==''&&o[k]!==undefined&&!(Array.isArray(o[k])&&!o[k].length)) clean[k]=o[k];
  if(clean.systems) clean.systems=clean.systems.map(s=>({type:'',tool:'',years:'',contents:'',export:'',...s}));
  let l;
  if(ex){ const n=clean.notes; delete clean.notes; Object.assign(ex,clean); if(n&&!ex.notes.includes(n)) ex.notes=(ex.notes?ex.notes+'\n':'')+n; l=ex; l.lastContact=today(); }
  else { l=newLead(clean); S.leads.push(l); }
  save(); render(); openLead(l.id);
}

// ---------- inventory xlsx import ----------
function parseTB(v){ if(v==null||v==='') return ''; const s=String(v); const n=num(s); if(n===null) return ''; return /gb/i.test(s)?+(n/1000).toFixed(3):/pb/i.test(s)?n*1000:n; }
function speedKey(t){t=String(t||'').toLowerCase(); if(!t) return 'unknown'; if(/immediate|same day|today|now|24|48|hour|1 day|one day|1-2 day|couple/.test(t)) return 'now'; if(/week|few days|days/.test(t)) return 'week'; if(/month/.test(t)) return 'month'; if(/no|cannot|can't|not able/.test(t)) return 'hard'; return 'unknown';}
function importInventory(buf){
  const wb=XLSX.read(buf,{type:'array'}), ws=wb.Sheets['Inventory']||wb.Sheets[wb.SheetNames[0]];
  const c=a=>{const v=ws[a]?.v; return v==null?'':String(v).trim()};
  const systems=[]; for(let r=21;r<=32;r++){ const a=c('A'+r); if(/^EXAMPLE/i.test(a)) continue;
    const row={type:c('B'+r),tool:a,years:c('C'+r),contents:c('D'+r),export:c('E'+r),notes:c('F'+r)};
    if(a||row.years||row.contents||row.export) systems.push(row); }
  const files=[]; for(let r=34;r<=37;r++){const v=c('A'+r); if(v&&!/^EXAMPLE/i.test(v)) files.push(v)}
  if(!c('B4')&&!systems.length) return toast('That inventory looks blank. Nothing imported.');
  const o={name:c('B4'),website:c('B5'),country:c('B6'),desc:c('B7'),usEmployees:num(c('B8')),inboxes:num(c('B9')),contractors:num(c('B11')),
    volumeTB:parseTB(c('B14')),years:num(c('B15')),whereLives:c('B16'),exportNote:c('B17')||c('B10'),exportSpeed:speedKey(c('B17')||c('B10')),
    systems,filesNote:files.join('\n'),stage:'Inventory received'};
  if(/^(us|usa|united states)/i.test(o.country)) o.usFacing=true;
  upsertLead(o);
}

// ---------- messages ----------
function requestMessage(p){
  return `Happy to move forward. ${p.name}'s requirements: ${p.requirements||'see below'}\n\nPlease fill in the yellow cells on the Inventory tab of the attached Blank Data Inventory.xlsx and send it back. One system per row is fine — include what it's used for, the types of data, years covered, export options, approximate record/file counts, and total GB/TB. Estimates are fine.`;
}

// ---------- events ----------
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-tab],[data-action],[data-open],[data-sort]'); if(!t) return;
  if(t.dataset.tab){S.tab=t.dataset.tab;save();render();return}
  if(t.dataset.sort){S.sort={k:t.dataset.sort,d:S.sort.k===t.dataset.sort?-S.sort.d:-1};save();render();return}
  const a=t.dataset.action, d=$('#drawer'), cur=()=>S.leads.find(l=>l.id===d.dataset.id);
  if(!a){ if(t.dataset.open) openLead(t.dataset.open); return; }
  e.preventDefault();
  if(a==='new-lead'){const l=newLead();S.leads.push(l);save();render();openLead(l.id)}
  else if(a==='paste-dm') pasteDM();
  else if(a==='copy-prompt'){navigator.clipboard.writeText(`Extract a CRM record from this DM conversation with a prospective data supplier. Reply with ONLY JSON matching this shape (omit unknown fields):\n${SCHEMA}\n\nDM:\n${$('#dm').value}`).then(()=>toast('Copied'))}
  else if(a==='apply-json') applyJSON($('#dmjson').value);
  else if(a==='close-modal') $('#modal').hidden=true;
  else if(a==='close'){d.hidden=true;render()}
  else if(a==='add-sys'){const l=cur();l.systems.push({type:'',tool:'',years:'',contents:'',export:'',notes:''});save();openLead(l.id)}
  else if(a==='del-sys'){const l=cur();l.systems.splice(+t.dataset.i,1);save();openLead(l.id);refreshDrawerMeta(l)}
  else if(a==='del-lead'){if(confirm('Delete this lead?')){S.leads=S.leads.filter(l=>l.id!==d.dataset.id);d.hidden=true;save();render()}}
  else if(a==='copy-request'){navigator.clipboard.writeText(requestMessage(S.partners.find(p=>p.id===t.dataset.id)||S.partners[0])).then(()=>toast('Copied'))}
  else if(a==='new-partner'){S.partners.push({id:uid(),name:'New partner',org:'',handle:'',notes:'',requirements:'',exclusiveFirst:false,slaHours:24,minEmployees:20});save();render()}
  else if(a==='reset-weights'){S.weights={...DEFAULT_WEIGHTS};save();render()}
  else if(a==='export-json') download(`brokerage-backup-${today()}.json`,JSON.stringify(S,null,1));
  else if(a==='demo') loadDemo();
});
document.addEventListener('input',e=>{
  const t=e.target, d=$('#drawer');
  if(t.dataset.w){S.weights[t.dataset.w]=+t.value;save();t.nextElementSibling.textContent=t.value;return}
  if(t.dataset.p){const p=S.partners.find(x=>x.id===t.dataset.p);p[t.dataset.k]=t.type==='checkbox'?t.checked:t.type==='number'?+t.value:t.value;save();return}
  if(d.hidden||!d.contains(t)) return;
  const l=S.leads.find(x=>x.id===d.dataset.id); if(!l) return;
  if(t.dataset.sk){l.systems[+t.closest('tr').dataset.i][t.dataset.sk]=t.value}
  else if(t.dataset.k){l[t.dataset.k]=t.type==='checkbox'?t.checked:t.value; if(t.dataset.k==='stage') l.lastContact=l.lastContact||today();}
  save(); refreshDrawerMeta(l);
});
$('#xlsx-in').addEventListener('change',async e=>{const f=e.target.files[0];if(f){importInventory(await f.arrayBuffer());e.target.value=''}});
$('#json-in').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{S=Object.assign(freshState(),JSON.parse(await f.text()));save();render()}catch(x){toast('Bad file')}e.target.value=''});

function loadDemo(){
  const d=(o)=>S.leads.push(newLead(o));
  d({name:'Midwest Precision Mfg',contact:'Dana R.',authority:'ceo',usEmployees:140,volumeTB:12,years:14,exportSpeed:'now',stage:'Inventory received',responsiveness:'hot',vip:true,
    systems:[{type:'ERP',tool:'NetSuite',years:'10',contents:'POs, work orders',export:'CSV'},{type:'File storage',tool:'SharePoint',years:'14',contents:'CAD, SOPs, QA',export:'Yes'},{type:'Email client',tool:'Outlook',years:'8',contents:'quotes',export:'PST'}],nextAction:'Send to partner',nextDate:today()});
  d({name:'Lakeview Dental Group',contact:'Sam T.',authority:'exec',usEmployees:60,volumeTB:1.5,years:6,exportSpeed:'week',stage:'Inventory requested',lastContact:'2026-09-28',systems:[{type:'CRM',tool:'HubSpot',years:'5',contents:'',export:'Yes'}]});
  d({name:'Tiny Studio LLC',contact:'Jo',usEmployees:8,volumeTB:0.2,years:2,stage:'New',responsiveness:'cold'});
  d({name:'Harbor Logistics',contact:'Priya',authority:'mgr',usEmployees:300,volumeTB:30,years:9,exportSpeed:'month',stage:'With partner',submittedAt:new Date(Date.now()-20*36e5).toISOString().slice(0,16),responsiveness:'warm',
    systems:[{type:'ERP',tool:'SAP',years:'9',contents:'',export:''},{type:'Customer support',tool:'Zendesk',years:'6',contents:'',export:''}]});
  save();render();
}
render();
setInterval(()=>{if(S.tab==='today'&&$('#drawer').hidden&&$('#modal').hidden)render()},60000);
