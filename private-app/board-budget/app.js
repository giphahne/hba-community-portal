(() => {
'use strict';
const clone=o=>JSON.parse(JSON.stringify(o));
const usd0 = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
const usd2 = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const fmt$ = v => usd0.format(Math.round(v||0));
const fmt$2 = v => usd2.format(v||0);
const fmtK = v => { const a=Math.abs(v); return (v<0?'−':'')+(a>=1e6? '$'+(a/1e6).toFixed(2)+'M' : a>=1e4? '$'+(a/1e3).toFixed(0)+'k' : a>=1e3 ? '$'+(a/1e3).toFixed(1)+'k' : '$'+Math.round(a)); };
const pct = v => (isFinite(v)? Math.round(v*100) : 0)+'%';
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function themeColors(){
  const cs = getComputedStyle(document.documentElement);
  const g = n=>cs.getPropertyValue(n).trim();
  return { text:g('--color-text'), muted:g('--color-text-muted'), grid:g('--color-divider'), primary:g('--color-primary'), accent:g('--color-accent'), success:g('--color-success'), error:g('--color-error'), soft:g('--color-primary-soft'), surface:g('--color-surface') };
}
function isDark(){ return document.documentElement.getAttribute('data-theme')==='dark'; }

function kpi(label, value, sub, hl){ const txt = typeof value==='string' && /[A-Za-z]/.test(value) && !/^\$/.test(value); return `<div class="kpi${hl?' hl':''}${txt?' txt':''}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub||''}</div></div>`; }


function baseChartOpts(t){
  return { responsive:true, maintainAspectRatio:false, animation:{duration:350}, interaction:{mode:'index',intersect:false},
    plugins:{ legend:{ position:'bottom', labels:{ color:t.muted, boxWidth:10, boxHeight:10, font:{family:'Satoshi',size:12} } },
      tooltip:{ callbacks:{ label: c=> `${c.dataset.label}: ${fmt$(c.parsed.y)}` } } },
    scales:{ x:{ stacked:true, grid:{display:false}, ticks:{color:t.muted,font:{size:11}} },
      y:{ stacked:true, grid:{color:t.grid}, ticks:{color:t.muted,font:{size:11},callback:v=>fmtK(v)} } } };
}


// Scheduled-project cash flow matching the HBA capital budget workbook.
const CAP_BASE = {
  base:2026, op:32195, events:1605.30, open:53292.78, sand:16000, sandFirst:2027,
  jetty:100000, jettyYear:2031, cont:0.20,
  reynolds:22100, reynoldsYear:2028, algelo:33600, algeloYear:2032,
  worrallYear:2036, wMill:83200, wDrain:30000, wOverlay:34600,
};
const CAP_DEFAULT = { option:'A', drainB:false, autoDues:true, dues:650, hh:105, fund:0.2, esc:0.03, onceEnabled:false, onceAmount:1000, onceYear:2027, onceHH:105, cleanEnabled:false, cleanAmount:0, cleanBasis:'annual', cleanYear:2027 };
const CAP_CUSHION = 40000;
const CAP_YEARS = Array.from({length:15},(_,i)=>2027+i);
window.HBACapitalScenario=()=>({base:clone(CAP_BASE),cap:clone(state.cap),results:clone(capRun(state.cap.option,state.cap.dues,state.cap)),cushion:CAP_CUSHION});
function capRun(opt, dues, p){
  const B = CAP_BASE; let bal = B.open; const rows = [];
  for (const y of CAP_YEARS){
    const e = Math.pow(1+p.esc, y-B.base);
    const duesHH = dues*Math.pow(1+p.esc, y-2027);
    const r = { y, duesHH, duesIn: duesHH*p.hh, op:-B.op*e, ev:B.events,
      sand: ((y-B.sandFirst)%2===0) ? -B.sand*e : 0,
      reynolds: y===B.reynoldsYear ? -B.reynolds*(1+B.cont)*e : 0,
      jetty: y===B.jettyYear ? -B.jetty*e : 0,
      algelo: y===B.algeloYear ? -B.algelo*(1+B.cont)*e : 0,
      wDrain: 0, wPave: 0 };
    if (y===B.worrallYear){
      if (opt==='A'){ r.wPave = -B.wMill*(1+B.cont)*e; r.wDrain = -B.wDrain*e; }
      else { r.wPave = -B.wOverlay*(1+B.cont)*e; r.wDrain = p.drainB ? -B.wDrain*e : 0; }
    }
    r.gifts = -(r.reynolds + r.algelo + r.wPave)*p.fund;
    r.oneTime = p.onceEnabled && y===p.onceYear ? Math.round(p.onceAmount*100)*p.onceHH/100 : 0;
    const cleanCents=Math.round((p.cleanAmount||0)*100);
    const contractYear=y-p.cleanYear;
    r.cleaning=p.cleanEnabled&&contractYear>=0&&contractYear<3
      ? -(p.cleanBasis==='total' ? Math.floor(cleanCents/3)+(contractYear===2?cleanCents%3:0) : cleanCents)/100 : 0;
    bal += r.duesIn + r.op + r.ev + r.sand + r.reynolds + r.jetty + r.algelo + r.wDrain + r.wPave + r.gifts + r.oneTime + r.cleaning;
    r.close = bal; rows.push(r);
  }
  let low = rows[0]; rows.forEach(r=>{ if (r.close<low.close) low=r; });
  const w = rows.find(r=>r.y===B.worrallYear);
  return { rows, low:low.close, lowYear:low.y, w, gifts:rows.reduce((a,r)=>a+r.gifts,0), end:rows[rows.length-1].close };
}
function capRecommended(opt, p){
  for (let d=500; d<=1200; d+=25){ if (capRun(opt,d,p).low >= CAP_CUSHION) return d; }
  return 1200;
}
let chartCapital;
function renderCapital(){
  const c = state.cap;
  const p = {...c};
  const recA = capRecommended('A',p), recB = capRecommended('B',p);
  const rec = c.option==='A' ? recA : recB;
  if (c.autoDues) c.dues = rec;
  // sync controls
  $$('#capOption input').forEach(i=> i.checked = i.value===c.option);
  $('#capDrainB').checked = c.drainB;
  $('#capDrainB').closest('label').style.opacity = c.option==='B' ? 1 : .55;
  $('#capDrainB').disabled = c.option!=='B';
  $('#capAutoDues').checked = c.autoDues;
  if (document.activeElement !== $('#capDues')) $('#capDues').value = c.dues;
  $('#capDues').disabled = c.autoDues;
  if (document.activeElement !== $('#capHH')) $('#capHH').value = c.hh;
  $('#capFund').value = String(c.fund);
  $('#capEsc').value = String(c.esc);
  $('#capOnceEnabled').checked=c.onceEnabled;
  $('#capOnceYear').innerHTML=CAP_YEARS.map(y=>`<option value="${y}">${y}</option>`).join('');
  $('#capOnceYear').value=String(c.onceYear);
  $('#capOnceAmount').value=c.onceAmount;
  $('#capOnceHH').value=c.onceHH;
  $('#capOncePreset').value=[250,500,1000,1500,2000].includes(c.onceAmount)?String(c.onceAmount):'custom';
  ['capOncePreset','capOnceAmount','capOnceYear','capOnceHH'].forEach(id=>$('#'+id).disabled=!c.onceEnabled);
  $('#capOnceSummary').textContent=c.onceEnabled?`${fmt$2(c.onceAmount)} × ${c.onceHH} households = ${fmt$2(Math.round(c.onceAmount*100)*c.onceHH/100)} once in ${c.onceYear}.`:'Not included. Enable to model a proposed one-time payment.';
  $('#capCleanEnabled').checked=c.cleanEnabled;
  $('#capCleanAmount').value=c.cleanAmount;
  $('#capCleanBasis').value=c.cleanBasis;
  $('#capCleanYear').innerHTML=CAP_YEARS.filter(y=>y<=2039).map(y=>`<option value="${y}">${y}</option>`).join('');
  $('#capCleanYear').value=String(c.cleanYear);
  ['capCleanAmount','capCleanBasis','capCleanYear'].forEach(id=>$('#'+id).disabled=!c.cleanEnabled);
  $('#capCleanSummary').textContent=c.cleanEnabled?`${fmt$2(c.cleanAmount)} ${c.cleanBasis==='annual'?'per year':'total, spread over three years'}; 8 cleanings each year, ${c.cleanYear}–${c.cleanYear+2}. Total allowance ${fmt$2(c.cleanAmount*(c.cleanBasis==='annual'?3:1))}.`:'Cleaning allowance excluded from this scenario.';

  const cur = capRun(c.option, c.dues, p);
  const A = capRun('A', recA, p), Bo = capRun('B', recB, p);
  const label = c.option==='A' ? 'Option A: Mill + drainage' : 'Option B: Overlay';
  const wTotal = -(cur.w.wPave + cur.w.wDrain);
  $('#capKpis').innerHTML = [
    kpi('Starting 2027 dues', fmt$(c.dues), `${fmt$(c.dues-500)} more than today · ${fmt$2((c.dues-500)/12)}/month`, true),
    kpi('Worrall cost in 2036', fmt$(wTotal), c.option==='A' ? `Paving ${fmt$(-cur.w.wPave)} + drainage ${fmt$(-cur.w.wDrain)}` : (c.drainB ? `Overlay ${fmt$(-cur.w.wPave)} + drainage ${fmt$(-cur.w.wDrain)}` : 'Overlay only, no drainage repair')),
    kpi('Lowest year-end capital', fmt$(cur.low), `In ${cur.lowYear} · target at least ${fmt$(CAP_CUSHION)}`),
    kpi('Resident campaigns', fmt$(cur.gifts), `${Math.round(c.fund*100)}% of Reynolds, Algelo and Worrall paving`),
  ].join('');

  // comparison
  const wa = A.w, wb = Bo.w;
  const cmp = [
    ['Treatment', 'Mill + 3.5-inch asphalt, drainage repaired', c.drainB ? '1.5-inch overlay, drainage repaired' : '1.5-inch overlay, no drainage repair', null],
    ['Paving quote (2026 dollars)', CAP_BASE.wMill, CAP_BASE.wOverlay],
    ['Drainage repair, one time (2026 dollars)', CAP_BASE.wDrain, c.drainB ? CAP_BASE.wDrain : 0],
    ['Paving in 2036, with 20% contingency', -wa.wPave, -wb.wPave],
    ['Drainage in 2036', -wa.wDrain, -wb.wDrain],
    ['Total Worrall cost in 2036', -(wa.wPave+wa.wDrain), -(wb.wPave+wb.wDrain), 'total'],
    ['Worrall residents\u2019 campaign goal', -wa.wPave*c.fund, -wb.wPave*c.fund],
    ['Recommended starting dues', recA, recB, 'total'],
    ['Lowest year-end capital', A.low, Bo.low],
    ['Year of lowest balance', A.lowYear, Bo.lowYear, 'yr'],
    ['Closing capital, 2041', A.end, Bo.end],
  ];
  $('#capCompare').innerHTML = `<thead><tr><th>Worrall Ave</th><th class="n">Option A: Mill + drainage</th><th class="n">Option B: Overlay</th><th class="n">Difference</th></tr></thead><tbody>` +
    cmp.map(([l,a,b,k])=>{
      if (k===null) return `<tr><td>${l}</td><td class="n" style="white-space:normal">${a}</td><td class="n" style="white-space:normal">${b}</td><td class="n"></td></tr>`;
      if (k==='yr') return `<tr><td>${l}</td><td class="n">${a}</td><td class="n">${b}</td><td class="n"></td></tr>`;
      const d = a-b;
      return `<tr${k==='total'?' class="total"':''}><td>${l}</td><td class="n">${fmt$(a)}</td><td class="n">${fmt$(b)}</td><td class="n">${Math.abs(d)<0.5?'—':(d<0?'−':'+')+fmt$(Math.abs(d))}</td></tr>`;
    }).join('') + '</tbody>';
  const co = [];
  if(c.cleanEnabled)co.push(['',`Provisional beach cleaning allowance: ${fmt$2(c.cleanAmount*(c.cleanBasis==='annual'?3:1))} over ${c.cleanYear}–${c.cleanYear+2}, eight cleanings per year. Contract and exact dates pending; check for operating-budget overlap.`]);
  if(c.onceEnabled)co.push(['',`Proposed one-time contribution: ${fmt$2(c.onceAmount)} per participating household, ${fmt$2(Math.round(c.onceAmount*100)*c.onceHH/100)} total in ${c.onceYear}. Included in both options and all dues tests; not an approved charge.`]);
  co.push(['', `Mill + drainage needs ${fmt$(recA)} starting dues; the overlay needs ${fmt$(recB)}. That is ${fmt$(recA-recB)} a year (${fmt$2((recA-recB)/12)} a month) more per household for Option A.`]);
  const a625 = capRun('A', recB, p);
  if (recA>recB) co.push(['warn', `At ${fmt$(recB)} dues, Option A drops to ${fmt$(a625.low)} in ${a625.lowYear}, below the ${fmt$(CAP_CUSHION)} cushion.`]);
  if (!c.drainB) co.push(['', 'Option B leaves Worrall drainage unrepaired. Tick “Also repair drainage with the overlay” to add the same $30,000 repair.']);
  if (c.dues < rec) co.push(['bad', `Entered dues of ${fmt$(c.dues)} are below the ${fmt$(rec)} recommended for ${label}.`]);
  if (cur.low < 0) co.push(['bad', `${label} runs a deficit of ${fmt$(-cur.low)} in ${cur.lowYear} at ${fmt$(c.dues)} dues.`]);
  $('#capCallouts').innerHTML = co.map(([k,t])=>`<div class="callout ${k}">${t}</div>`).join('');

  // dues test
  const levels = [600,625,650,675,700];
  const cell = v => `<td class="n" style="color:var(${v<0?'--color-error':v<CAP_CUSHION?'--color-warning':'--color-text'})">${v<0?'−':''}${fmt$(Math.abs(v))}</td>`;
  $('#capDuesTest').innerHTML = `<thead><tr><th>Starting dues</th>${levels.map(l=>`<th class="n">${fmt$(l)}</th>`).join('')}</tr></thead><tbody>
    <tr><td>Option A: Mill + drainage</td>${levels.map(l=>cell(capRun('A',l,p).low)).join('')}</tr>
    <tr><td>Option B: Overlay${c.drainB?' + drainage':''}</td>${levels.map(l=>cell(capRun('B',l,p).low)).join('')}</tr></tbody>`;

  // cash flow for selected option
  $('#capFlowSub').textContent = `${label} at ${fmt$(c.dues)} starting dues`;
  const k$ = v => Math.abs(v)<0.5 ? '<span class="muted">—</span>' : (v<0?'−':'')+fmt$(Math.abs(v));
  $('#capFlow').innerHTML = `<thead><tr><th>Year</th><th class="n">Dues / home</th><th class="n">Dues in</th><th class="n">Operating</th><th class="n">Cleaning</th><th class="n">Sand</th><th class="n">Projects</th><th>Work</th><th class="n">Resident gifts</th><th class="n">One-time contribution</th><th class="n">Year-end capital</th></tr></thead><tbody>` +
    cur.rows.map(r=>{
      const proj = r.reynolds+r.jetty+r.algelo+r.wDrain+r.wPave;
      const work = [r.reynolds&&'Reynolds overlay', r.jetty&&'Jetty', r.algelo&&'Algelo overlay', r.wDrain&&'Worrall drainage', r.wPave&&(c.option==='A'?'Worrall mill + pave':'Worrall overlay')].filter(Boolean).join(', ');
      return `<tr><td>${r.y}</td><td class="n">${fmt$(r.duesHH)}</td><td class="n">${fmt$(r.duesIn)}</td><td class="n">${k$(r.op+r.ev)}</td><td class="n">${r.cleaning?'−'+fmt$2(-r.cleaning):'<span class="muted">None</span>'}</td><td class="n">${k$(r.sand)}</td><td class="n">${k$(proj)}</td><td>${work||'<span class="muted">Save</span>'}</td><td class="n">${k$(r.gifts)}</td><td class="n">${r.oneTime?fmt$2(r.oneTime):'<span class="muted">None</span>'}</td><td class="n" style="font-weight:700;color:var(${r.close<0?'--color-error':'--color-text'})">${r.close<0?'−':''}${fmt$(Math.abs(r.close))}</td></tr>`;
    }).join('') + '</tbody>';
  const opNote = 'Operating column is operating costs less net event proceeds.';
  $('#capFlowSub').textContent += ' · ' + opNote;

  // chart
  const t = themeColors();
  const cfg = { type:'line', data:{ labels:CAP_YEARS, datasets:[
    { label:`Option A: Mill + drainage (${fmt$(recA)} dues)`, data:A.rows.map(r=>r.close), borderColor:t.accent, backgroundColor:t.accent, tension:.15, pointRadius:3, borderWidth:2.5 },
    { label:`Option B: Overlay (${fmt$(recB)} dues)`, data:Bo.rows.map(r=>r.close), borderColor:t.primary, backgroundColor:t.primary, tension:.15, pointRadius:3, borderWidth:2.5 },
    { label:'Cushion target', data:CAP_YEARS.map(()=>CAP_CUSHION), borderColor:t.muted, borderDash:[5,4], pointRadius:0, borderWidth:1.5 },
  ]}};
  cfg.options = baseChartOpts(t);
  cfg.options.scales.x.stacked = false; cfg.options.scales.y.stacked = false;
  if (chartCapital) chartCapital.destroy();
  chartCapital = new Chart($('#chartCapital'), cfg);
}
function wireCapital(){
  const ch = fn => e => { fn(e); setDirty(); renderCapital(); };
  $$('#capOption input').forEach(i=> i.addEventListener('change', ch(()=>{ state.cap.option = i.value; })));
  $('#capDrainB').addEventListener('change', ch(e=>{ state.cap.drainB = e.target.checked; }));
  $('#capAutoDues').addEventListener('change', ch(e=>{ state.cap.autoDues = e.target.checked; }));
  $('#capDues').addEventListener('change', ch(e=>{ const v=+e.target.value; if (v>0) state.cap.dues = v; }));
  $('#capHH').addEventListener('change', ch(e=>{ const v=+e.target.value; if (v>0) state.cap.hh = v; }));
  $('#capFund').addEventListener('change', ch(e=>{ state.cap.fund = +e.target.value; }));
  $('#capEsc').addEventListener('change', ch(e=>{ state.cap.esc = +e.target.value; }));
  $('#capOnceEnabled').addEventListener('change',ch(e=>{state.cap.onceEnabled=e.target.checked;}));
  $('#capOncePreset').addEventListener('change',ch(e=>{if(e.target.value!=='custom')state.cap.onceAmount=+e.target.value;else $('#capOnceAmount').focus();}));
  const numeric=(id,key,min,max,integer=false)=>$('#'+id).addEventListener('change',ch(e=>{
    const v=+e.target.value;if(e.target.value!==''&&Number.isFinite(v)&&v>=min&&v<=max&&(!integer||Number.isInteger(v)))state.cap[key]=integer?v:Math.round(v*100)/100;
  }));
  numeric('capOnceAmount','onceAmount',0,1000000);
  numeric('capOnceHH','onceHH',0,1000,true);
  numeric('capOnceYear','onceYear',2027,2041,true);
  $('#capCleanEnabled').addEventListener('change',ch(e=>{state.cap.cleanEnabled=e.target.checked;}));
  $('#capCleanBasis').addEventListener('change',ch(e=>{state.cap.cleanBasis=e.target.value;}));
  numeric('capCleanAmount','cleanAmount',0,1000000);
  numeric('capCleanYear','cleanYear',2027,2039,true);
  $('#capReset').addEventListener('click', ch(()=>{ state.cap = clone(CAP_DEFAULT); }));
}

let state={cap:{...CAP_DEFAULT,option:'B',drainB:true,autoDues:false,dues:625}};
function setDirty(){ $('#sim-save-state').textContent='Scenario changed; save a file to keep these inputs.'; }
function preset(key){
  state.cap={...CAP_DEFAULT,option:'B',drainB:true,autoDues:false,dues:key==='lean'?600:key==='dues'?650:625,hh:105,fund:key==='dues'?0:0.2,esc:0.03};
  renderCapital();setDirty();
}
document.addEventListener('DOMContentLoaded',()=>{
  wireCapital();renderCapital();
  document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));
  $('#sim-save').onclick=()=>{
    const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({app:'hba-capital-simulator',version:3,cap:state.cap},null,2)],{type:'application/json'}));
    a.href=url;a.download='HBA-budget-scenario.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('#sim-save-state').textContent='Scenario exported. Dues registry annotations are saved separately.';
  };
  $('#sim-open').onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    try{
      const d=JSON.parse(await f.text()),c=d.cap;
      if(!c||!['A','B'].includes(c.option)||typeof c.drainB!=='boolean'||typeof c.autoDues!=='boolean'||!Number.isFinite(c.dues)||c.dues<400||c.dues>1200||!Number.isFinite(c.hh)||c.hh<50||c.hh>112||![0,.1,.2,.3].includes(c.fund)||![.02,.03,.04].includes(c.esc))throw Error('Invalid scenario inputs');
      const once={onceEnabled:c.onceEnabled??false,onceAmount:c.onceAmount??1000,onceYear:c.onceYear??2027,onceHH:c.onceHH??c.hh};
      if(typeof once.onceEnabled!=='boolean'||!Number.isFinite(once.onceAmount)||once.onceAmount<0||once.onceAmount>1000000||!Number.isInteger(once.onceYear)||once.onceYear<2027||once.onceYear>2041||!Number.isInteger(once.onceHH)||once.onceHH<0||once.onceHH>1000)throw Error('Invalid one-time contribution inputs');
      const clean=window.__privateCleaningLoaded?{cleanEnabled:c.cleanEnabled??false,cleanAmount:c.cleanAmount??0,cleanBasis:c.cleanBasis??'annual',cleanYear:c.cleanYear??2027}:{cleanEnabled:false,cleanAmount:0,cleanBasis:'annual',cleanYear:2027};
      if(typeof clean.cleanEnabled!=='boolean'||!Number.isFinite(clean.cleanAmount)||clean.cleanAmount<0||clean.cleanAmount>1000000||!['annual','total'].includes(clean.cleanBasis)||!Number.isInteger(clean.cleanYear)||clean.cleanYear<2027||clean.cleanYear>2039)throw Error('Invalid cleaning allowance inputs');
      state.cap={option:c.option,drainB:c.drainB,autoDues:c.autoDues,dues:c.dues,hh:c.hh,fund:c.fund,esc:c.esc,...once,onceAmount:Math.round(once.onceAmount*100)/100,...clean,cleanAmount:Math.round(clean.cleanAmount*100)/100};
      renderCapital();$('#sim-save-state').textContent='Scenario loaded from '+f.name;
    }catch(err){$('#sim-save-state').textContent='Could not load scenario: '+err.message;}e.target.value='';
  };
  window.addEventListener('message',e=>{
    if(e.source!==parent||!e.data)return;
    if(e.data.type==='hba-theme'&&['light','dark'].includes(e.data.theme)){document.documentElement.dataset.theme=e.data.theme;renderCapital();}
    if(e.data.type==='hba-private-cleaning'&&Number.isFinite(e.data.annualAmount)&&Number.isInteger(e.data.firstYear)){
      window.__privateCleaningLoaded=true;
      Object.assign(CAP_DEFAULT,{cleanEnabled:true,cleanAmount:e.data.annualAmount,cleanBasis:'annual',cleanYear:e.data.firstYear});
      Object.assign(state.cap,{cleanEnabled:true,cleanAmount:e.data.annualAmount,cleanBasis:'annual',cleanYear:e.data.firstYear});
      $('#cap-clean-private').hidden=false;
      renderCapital();
      $('#sim-save-state').textContent='Private board scenario: includes the unsigned sample cleaning agreement. Do not share cost-bearing exports publicly.';
    }
  });
  if(parent!==window)parent.postMessage({type:'hba-ready'},'*');
});

})();
