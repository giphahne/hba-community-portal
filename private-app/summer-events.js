/* Summer events: the standing pattern behind the yearly schedule, a predicted schedule for any year,
   a tide-based pick for the Kids' Fishing Derby, and a one-page printable sheet for the fridge.
   The pattern was taken from the 2026 Summer Events sheet supplied by the board (October 2026). */
(() => {
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad=n=>String(n).padStart(2,'0');
  const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const nth=(y,m,wd,ord)=>window.HBAEventDates.nthWeekday(y,m,wd,ord);
  // The usual pattern, as data. The administrator can change it in the app (Edit usual events); it is stored in the
  // public_summer_rules setting. These defaults are the 2026 Summer Events sheet supplied by the board.
  // rule: 'nth' = ordinal weekday of a month (ordinal -1 = last), 'fixed' = month/day, 'tide' = Fishing Derby pick,
  // 'tbd' = date set each summer. Weekdays: 0 Sunday … 6 Saturday.
  const DEFAULT_RULES=[
    {key:'welcome',title:'Adult Welcome Back Party',rule:'nth',month:6,weekday:6,ordinal:3,time:'17:30',location:'36 Algelo Ave.',icon:'chairs',
      details:'Come and catch up with your neighbors. Bring an appetizer or dessert to share, the beverage of your choice, and a chair.'},
    {key:'assoc',title:'Association Meeting',rule:'nth',month:6,weekday:0,ordinal:-1,time:'10:00',location:'Algelo & Surf',icon:'sun',
      details:'Bring a chair and participate in the first meeting of the year.'},
    {key:'july4',title:'July 4th Beach Events & Bike Parade',rule:'fixed',month:7,day:4,time:'10:00',location:'Side Beach',icon:'flag',
      details:'Games for children of all ages, then a bike (carriage, scooter, etc.) parade around the island starting at Reynolds and Worrall. Decorate your “vehicle” and celebrate the 4th. A cool treat is offered at the end.'},
    {key:'derby',title:'Kids’ Fishing Derby',rule:'tide',time:'10:00',end:'12:00',location:'Side Beach',icon:'fish',
      details:'Kids of all ages bring a fishing pole to the point. Extra poles are available and worms are supplied. Prizes awarded. Hot dogs and water after the event.'},
    {key:'bingo1',title:'Adult Bingo',rule:'nth',month:7,weekday:5,ordinal:3,time:'18:00',location:'Corner of Pilgrim & Worrall',icon:'bingo',
      details:'Registration at 5:45, games start at 6:00. Bingo cards 10 for $20 (cash). Bring a chair, a pen or marker, beverage and snacks. Items to bid on, so bring some extra cash.'},
    {key:'kickoff',title:'Summer Kickoff',rule:'nth',month:6,weekday:6,ordinal:2,time:'11:00',location:'Side Beach',icon:'ball',
      when_note:'from 2027; Kids’ Day was the third Saturday of July through 2026',
      legacy:{until:2026,title:'Kids’ Day',when:'Third Saturday of July',details:'Games for all ages with prizes. Hot dogs and water served.',month:7,weekday:6,ordinal:3},
      details:'The season opens with games for all ages on Side Beach: limbo, long jump, water relay, water balloon toss, obstacle course, hula hoop contest, a musical-chairs scavenger hunt, Simon Says and tug of war (parents join the second round). Prizes for every game. Hot dogs and water served.'},
    {key:'music',title:'Jane & John’s Music Night',rule:'nth',month:7,weekday:6,ordinal:3,time:'19:00',end:'22:00',location:'On Surf',icon:'music',
      details:'Come dance in the street. Thee Midnight Society performs. Bring a chair, your beverage and snacks. Donations accepted.'},
    {key:'art',title:'Art Day',rule:'nth',month:8,weekday:6,ordinal:1,time:'13:00',location:'Algelo & Surf',icon:'palette',
      details:'Art projects for children of all ages: tie-dye (bring your own shirt), shell painting, sand art, corn husk dolls, foam animals, rainbow postcards and cookie decorating. Supplies and water provided.'},
    {key:'spook',title:'Summer Spooktacular',rule:'nth',month:8,weekday:6,ordinal:1,time:'18:30',end:'19:30',location:'Island parade',icon:'pumpkin',when_note:'same day as Art Day',
      details:'Children parade around the island in costume from 6:30 to 7:30. Homeowners may set up a candy table near the street; children will not knock on doors. No prizes.'},
    {key:'golf',title:'Golf Tournament',rule:'nth',month:8,weekday:6,ordinal:3,time:'07:30',location:'Southers Marsh, Plymouth',icon:'golf',
      details:'Sign up by August 1. $90 per player; foursomes and individuals welcome. Checks to HBA. Rain or shine.'},
    {key:'supper',title:'Spaghetti Supper',rule:'nth',month:8,weekday:6,ordinal:3,rain_offset_days:7,time:'17:30',location:'Algelo & Glen',icon:'pasta',
      details:'Bring your table, chairs, beverages and snacks; a DJ plays all night. Dinner $7 adults, $4 children. Raffle tickets: kids’ table 20 for $5, adult 10 for $10.'},
    {key:'bingo2',title:'Adult Bingo',rule:'nth',month:8,weekday:5,ordinal:-1,time:'18:00',location:'Corner of Pilgrim & Worrall',icon:'bingo',
      details:'Registration at 5:45, games start at 6:00. Bingo cards 10 for $20 (cash). Bring a chair, a pen or marker, beverage and snacks.'},
    {key:'annual',title:'Annual Meeting',rule:'nth',month:8,weekday:0,ordinal:4,time:'10:00',location:'Algelo & Surf',icon:'anchor',details:''},
    {key:'movie',title:'Movie Night',rule:'tbd',location:'',details:'More information each summer.',icon:'popcorn'}
  ];
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const ORDINALS={1:'First',2:'Second',3:'Third',4:'Fourth',5:'Fifth','-1':'Last'};
  // The plain-English "when" printed on the sheet, written from the rule so it always matches the dates.
  function whenText(r){
    let w=r.rule==='nth'?`${ORDINALS[r.ordinal]} ${WEEKDAYS[r.weekday]} of ${MONTHS[r.month-1]}`
      :r.rule==='fixed'?`${MONTHS[r.month-1]} ${r.day}`
      :r.rule==='tide'?'A Saturday in July or August when 11 AM is about mid tide, going out':'Date set each summer';
    if(r.rain_offset_days)w+=r.rain_offset_days===7?'; the following Saturday is the rain date':`; rain date ${r.rain_offset_days} days later`;
    return r.when_note?`${w} (${r.when_note})`:w;
  }
  // Turn stored rules into the shape the schedule uses (date and rain-date functions).
  function compile(list){
    return list.map(r=>{
      const date=r.rule==='nth'?y=>nth(y,r.month,r.weekday,r.ordinal):r.rule==='fixed'?y=>new Date(y,r.month-1,r.day):null;
      const lg=r.legacy?{...r.legacy,date:y=>nth(y,r.legacy.month,r.legacy.weekday,r.legacy.ordinal)}:null;
      return {...r,when:whenText(r),date:lg?y=>(y<=lg.until?lg.date(y):date(y)):date,
        rain:r.rain_offset_days&&date?y=>{const d=date(y);return new Date(d.getFullYear(),d.getMonth(),d.getDate()+r.rain_offset_days);}:null,
        end:r.end||undefined,time:r.time||null,tide:r.rule==='tide',tbd:r.rule==='tbd',legacy:lg};
    });
  }
  let storedRules=null;// the administrator's saved pattern, when there is one
  let RULES=compile(DEFAULT_RULES);
  function useStoredRules(settings){
    let list=null;try{const v=JSON.parse(settings?.public_summer_rules||'null');if(Array.isArray(v)&&v.length)list=v;}catch{}
    storedRules=list;RULES=compile(list||DEFAULT_RULES);
  }
  // The 2026 sheet as printed, so this year's sheet matches it exactly (including the derby date the board chose).
  const KNOWN={2026:{welcome:'2026-06-20',assoc:'2026-06-28',july4:'2026-07-04',derby:'2026-07-11',bingo1:'2026-07-17',kickoff:'2026-07-18',music:'2026-07-18',art:'2026-08-01',spook:'2026-08-01',golf:'2026-08-15',supper:'2026-08-15',bingo2:'2026-08-28',annual:'2026-08-23'}};
  const fmtTime=t=>{if(!t)return '';const [h,m]=t.split(':').map(Number);return new Date(2000,0,1,h,m).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});};
  const fmtRange=(a,b)=>b?`${fmtTime(a).replace(' PM','').replace(' AM','')}–${fmtTime(b)}`:fmtTime(a);
  const dayName=k=>new Date(k+'T12:00:00').toLocaleDateString('en-US',{weekday:'short'});
  const monthDay=k=>new Date(k+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}).toUpperCase();
  const longDate=k=>new Date(k+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  // Tide pick: Saturdays in July/August where the midpoint between a morning high and the next low is closest to 11 AM.
  // Saturdays already carrying another morning event are listed but not chosen automatically.
  function derbyCandidates(year,tideData,schedule){
    const busy=new Map();
    for(const e of schedule){if(e.key==='derby'||!e.date||!e.time)continue;const h=Number(e.time.slice(0,2));if(h<13)busy.set(e.date,(busy.get(e.date)||[]).concat(e.title));}
    return (tideData?.saturdays||[]).filter(s=>s.ebb).map(s=>{
      const notes=[];
      if(busy.has(s.date))notes.push('Same morning as '+busy.get(s.date).join(' and '));
      if(/-07-0[1-6]$/.test(s.date))notes.push('July 4th weekend');
      const fit=s.ebb.minutes_from_eleven<=45?'Good fit':s.ebb.minutes_from_eleven<=90?'Fair fit':'Poor fit';
      return {...s,notes,fit,conflict:busy.has(s.date)};
    }).sort((a,b)=>a.ebb.minutes_from_eleven-b.ebb.minutes_from_eleven);
  }
  // Board decision (October 2026): the best tide fit wins even when another kids' event shares the morning;
  // the clash is still listed so the board can see it.
  function pickDerby(cands){
    return cands[0]||null;
  }
  // The schedule for one year: recorded events from the calendar when they exist, otherwise the rule.
  function schedule(year,events,tideData){
    year=Number(year);
    const recorded=(events||[]).filter(e=>e.state==='scheduled'&&e.event_date.startsWith(year+'-')&&e.event_date>=`${year}-05-15`&&e.event_date<=`${year}-09-30`);
    const used=new Set();
    const norm=s=>String(s||'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim();
    const match=rule=>{
      const words=norm(rule.title).split(' ').filter(w=>w.length>2&&!['the','and'].includes(w));
      const titles=[rule.title,rule.legacy?.title].filter(Boolean).map(norm);
      const exact=recorded.filter(e=>!used.has(e.id)&&titles.includes(norm(e.title)));
      const timeOk=e=>rule.time?Math.abs(Number(e.event_time?.slice(0,2)??rule.time.slice(0,2))-Number(rule.time.slice(0,2)))<=2:true;
      const pool=exact.length?exact:recorded.filter(e=>!used.has(e.id)&&words.filter(w=>norm(e.title).split(' ').includes(w)).length/words.length>=0.75);
      return pool.filter(timeOk).sort((a,b)=>a.event_date.localeCompare(b.event_date))[0]||null;
    };
    const out=RULES.map((r,i)=>{
      const rec=match(r);
      if(rec){used.add(rec.id);return {key:r.key,icon:r.icon,n:i+1,title:rec.title,date:window.HBAEventDates.effective(rec),rain:rec.rain_date||null,time:rec.event_time?rec.event_time.slice(0,5):r.time,end:r.end,location:rec.location||r.location,details:(rec.planning_only||!rec.description)?r.details:rec.description,source:rec.planning_only?'planned':'recorded',when:r.when,record:rec};}
      let date=null;
      if(KNOWN[year]?.[r.key])date=KNOWN[year][r.key];
      else if(r.date){const d=r.date(year);date=d?iso(d):null;}
      const lg=r.legacy&&year<=r.legacy.until?r.legacy:null;
      return {key:r.key,icon:r.icon,n:i+1,title:lg?.title||r.title,date,rain:r.rain?iso(r.rain(year)):null,time:r.time,end:r.end,location:r.location,details:lg?.details||r.details,source:r.tbd?'tbd':KNOWN[year]?.[r.key]?'printed':'predicted',when:lg?.when||r.when,tide:r.tide};
    });
    const derby=out.find(x=>x.key==='derby');
    if(derby){
      const cands=derbyCandidates(year,tideData,out);derby.candidates=cands;
      if(!derby.date&&derby.source==='predicted'){const pick=pickDerby(cands);if(pick){derby.date=pick.date;derby.pick=pick;derby.source='tide';}}
      // A recorded or printed derby date still shows that Saturday's tide when NOAA predictions cover it.
      else if(derby.date){const sat=cands.find(c=>c.date===derby.date);if(sat)derby.pick=sat;}
    }
    // Leftover recorded summer events that are not part of the standing pattern
    for(const e of recorded){if(used.has(e.id))continue;out.push({key:'extra-'+e.id,title:e.title,date:window.HBAEventDates.effective(e),rain:e.rain_date||null,time:e.event_time?e.event_time.slice(0,5):null,location:e.location,details:e.description,source:e.planning_only?'planned':'recorded',record:e});}
    out.sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||String(a.time||'').localeCompare(String(b.time||'')));
    out.forEach((x,i)=>x.n=x.date?i+1:null);
    return out;
  }
  // ---- Dialog -------------------------------------------------------------------------------------
  let dialog,year=new Date().getFullYear(),events=[],tides={},status='',busy=false,focusBefore;
  const thisYear=new Date().getFullYear();
  const summerOver=new Date()>new Date(thisYear,8,1);
  if(summerOver)year=thisYear+1;
  function ensure(){
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.id='summer-dialog';dialog.setAttribute('aria-labelledby','summer-title');
    dialog.innerHTML=`<div class="summer-shell"><header><div><p class="summer-eyebrow">Hamilton Beach Association</p><h2 id="summer-title">Summer events sheet</h2><p class="summer-sub">One page for the fridge. Dates for future summers are predicted from the usual pattern until the board records them.</p></div><button type="button" id="summer-close">Back</button></header>
      <div class="summer-controls"><label>Summer<select id="summer-year"></select></label><button type="button" id="summer-print">Print or save as PDF</button><span class="summer-view" role="group" aria-label="Sheet style"><button type="button" id="summer-view-poster" aria-pressed="true">Poster</button><button type="button" id="summer-view-list" aria-pressed="false">List</button></span><button type="button" id="summer-details-toggle" hidden>Show event details</button><span id="summer-board-actions"></span></div>
      <p id="summer-status" class="summer-status" aria-live="polite"></p>
      <div class="summer-scroll"><div id="summer-sheet-host"></div><div id="summer-notes"></div></div></div>`;
    document.body.append(dialog);
    dialog.querySelector('#summer-close').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{focusBefore?.focus?.();});
    dialog.querySelector('#summer-print').onclick=()=>{const st=document.getElementById('summer-print-style')||Object.assign(document.createElement('style'),{id:'summer-print-style'});st.textContent=sheetView==='poster'?'@media print{@page{size:letter landscape;margin:.3in}}':'@media print{@page{size:letter portrait;margin:.3in}}';document.head.append(st);window.print();};
    dialog.querySelector('#summer-details-toggle').onclick=e=>{document.body.classList.toggle('summer-show-details');e.target.textContent=document.body.classList.contains('summer-show-details')?'Hide event details':'Show event details';};
    dialog.querySelector('#summer-view-poster').onclick=()=>setView('poster');dialog.querySelector('#summer-view-list').onclick=()=>setView('list');
    const sel=dialog.querySelector('#summer-year');
    for(let y=thisYear-1;y<=thisYear+3;y++){const o=document.createElement('option');o.value=y;o.textContent=y+(y===thisYear?' (this year)':y===thisYear+1?' (next summer)':'');sel.append(o);}
    sel.value=year;sel.onchange=()=>{year=Number(sel.value);load();};
  }
  function setView(v){sheetView=v;dialog.querySelector('#summer-view-poster').setAttribute('aria-pressed',String(v==='poster'));dialog.querySelector('#summer-view-list').setAttribute('aria-pressed',String(v==='list'));dialog.querySelector('#summer-details-toggle').hidden=v!=='list';render();}
  async function load(){
    busy=true;status='Checking the calendar and tide predictions…';render();
    try{
      const C=window.HBACommunity;
      const [d,t]=await Promise.all([C.api('/api/community'),C.api('/api/summer/tides?year='+year).catch(e=>({error:e.message}))]);
      events=d.events||[];window.HBASummer.series=d.series||[];useStoredRules(d.settings);tides[year]=t;status=t.error?('Tide predictions unavailable: '+t.error):'';
    }catch(e){status=e.message;}
    busy=false;render();
  }
  function listHTML(rows,y){
    const predicted=rows.some(r=>['predicted','tide','planned'].includes(r.source));
    return `<article class="summer-sheet summer-sheet-list" aria-label="Summer events ${y}">
      <header class="summer-sheet-head"><p>Hamilton Beach Association · Wareham, Massachusetts</p><h1>Summer Events <span>${y}</span></h1></header>
      <ol class="summer-list">${rows.map(r=>`<li class="summer-row${r.date?'':' is-tbd'}${r.key==='supper'?' is-supper':''}">
        <span class="summer-num">${r.n??'·'}</span>
        <span class="summer-date">${r.date?`<strong>${esc(monthDay(r.date))}</strong><small>${esc(dayName(r.date))}</small>`:'<strong>TBD</strong>'}</span>
        <span class="summer-what"><span class="summer-line"><strong>${esc(r.title)}</strong>${r.time?` <span class="summer-time">· ${esc(fmtRange(r.time,r.end))}</span>`:''}${['predicted','tide','planned'].includes(r.source)?'<sup class="summer-flag">*</sup>':''}</span>
          ${(()=>{const bits=[r.location||'',r.rain?`Rain date ${monthDay(r.rain)}`:'',r.key==='derby'&&r.pick?`High tide ${fmtTime(r.pick.ebb.high)}, low ${fmtTime(r.pick.ebb.low)}`:''].filter(Boolean);return bits.length?`<small>${esc(bits.join(' · '))}</small>`:'';})()}
          ${r.details?`<span class="summer-details">${esc(r.details)}</span>`:''}</span></li>`).join('')}</ol>
      <footer class="summer-sheet-foot"><p><strong>Thank you to our amazing neighbors and volunteers.</strong> Volunteers are needed to run most events. Together we make our community the best place to be.</p>
      <p class="summer-foot-note">${predicted?'* Planned from the usual schedule and not yet confirmed by the board. Fishing Derby chosen for an outgoing mid tide near 11 AM (NOAA Great Hill predictions). ':''}Printed from the Hamilton Beach Association app, ${esc(new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}))}.</p>
      </footer></article>`;
  }

  // ---- Poster sheet: colored tiles with hand-drawn icons, like the printed 2026 poster ----------------------
  const ICON={
    chairs:'<path d="M14 40 L14 20 Q14 16 18 16 L24 16 Q28 16 28 20 L28 40" fill="none" stroke="#0B2545" stroke-width="3"/><path d="M10 30 H32 M12 40 V46 M30 40 V46" stroke="#0B2545" stroke-width="3" fill="none"/><path d="M36 40 L36 20 Q36 16 40 16 L46 16 Q50 16 50 20 L50 40" fill="none" stroke="#0B2545" stroke-width="3"/><path d="M32 30 H54 M34 40 V46 M52 40 V46" stroke="#0B2545" stroke-width="3" fill="none"/>',
    sun:'<circle cx="32" cy="30" r="11" fill="#F2B134" stroke="#0B2545" stroke-width="2.5"/><g stroke="#0B2545" stroke-width="2.5" stroke-linecap="round"><path d="M32 8v6M32 46v6M10 30h6M48 30h6M16 14l4 4M44 42l4 4M16 46l4-4M44 18l4-4"/></g>',
    flag:'<rect x="14" y="12" width="26" height="18" fill="#B23A48" stroke="#0B2545" stroke-width="2"/><rect x="14" y="12" width="11" height="9" fill="#2E6DB4"/><g stroke="#fff" stroke-width="2"><path d="M25 17h15M25 22h15M14 27h26"/></g><path d="M14 12v42" stroke="#0B2545" stroke-width="3"/><circle cx="46" cy="48" r="6" fill="none" stroke="#0B2545" stroke-width="2.5"/><circle cx="30" cy="48" r="6" fill="none" stroke="#0B2545" stroke-width="2.5"/><path d="M30 48l6-10h8l2 10" fill="none" stroke="#0B2545" stroke-width="2.5"/>',
    fish:'<path d="M10 32 Q24 16 40 24 L52 16 L48 32 L52 48 L40 40 Q24 48 10 32Z" fill="#3C8D4F" stroke="#0B2545" stroke-width="2.5"/><circle cx="20" cy="30" r="2.5" fill="#0B2545"/><path d="M28 24 Q30 32 28 40" stroke="#0B2545" stroke-width="2" fill="none"/>',
    bingo:'<circle cx="22" cy="24" r="11" fill="#B23A48" stroke="#0B2545" stroke-width="2"/><circle cx="42" cy="26" r="11" fill="#2E6DB4" stroke="#0B2545" stroke-width="2"/><circle cx="32" cy="42" r="11" fill="#F2B134" stroke="#0B2545" stroke-width="2"/><text x="22" y="28" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Arial">B</text><text x="42" y="30" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Arial">I</text><text x="32" y="46" text-anchor="middle" font-size="11" font-weight="700" fill="#0B2545" font-family="Arial">N</text>',
    ball:'<circle cx="32" cy="32" r="20" fill="#fff" stroke="#0B2545" stroke-width="2.5"/><path d="M32 12 Q20 32 32 52 Q44 32 32 12Z" fill="#B23A48"/><path d="M14 24 Q32 30 50 24 L52 32 Q32 36 12 32Z" fill="#2E6DB4" opacity=".9"/><path d="M16 42 Q32 36 48 42" stroke="#F2B134" stroke-width="5" fill="none"/>',
    music:'<path d="M24 44 V16 L48 10 V38" fill="none" stroke="#0B2545" stroke-width="3.5"/><circle cx="18" cy="45" r="7" fill="#6B4FA3" stroke="#0B2545" stroke-width="2"/><circle cx="42" cy="39" r="7" fill="#6B4FA3" stroke="#0B2545" stroke-width="2"/>',
    palette:'<path d="M32 10 C16 10 8 22 10 34 C12 46 24 52 34 50 C40 49 36 42 40 40 C46 38 54 40 54 30 C54 18 44 10 32 10Z" fill="#F7E7C6" stroke="#0B2545" stroke-width="2.5"/><circle cx="22" cy="24" r="4" fill="#B23A48"/><circle cx="34" cy="18" r="4" fill="#2E6DB4"/><circle cx="44" cy="24" r="4" fill="#3C8D4F"/><circle cx="20" cy="36" r="4" fill="#F2B134"/>',
    pumpkin:'<path d="M20 20 Q10 22 10 36 Q10 50 24 50 Q32 54 40 50 Q54 50 54 36 Q54 22 44 20 Q32 16 20 20Z" fill="#E07A2F" stroke="#0B2545" stroke-width="2.5"/><path d="M32 18 V10" stroke="#3C8D4F" stroke-width="4"/><path d="M22 30 L27 36 L17 36Z M42 30 L47 36 L37 36Z M22 42 Q32 48 42 42" fill="#0B2545"/>',
    golf:'<path d="M26 54 V12" stroke="#0B2545" stroke-width="3"/><path d="M26 12 L46 18 L26 26Z" fill="#B23A48" stroke="#0B2545" stroke-width="2"/><ellipse cx="30" cy="54" rx="16" ry="4" fill="#3C8D4F"/><circle cx="42" cy="46" r="5" fill="#fff" stroke="#0B2545" stroke-width="2"/>',
    pasta:'<path d="M8 32 H56 Q54 50 32 52 Q10 50 8 32Z" fill="#F7E7C6" stroke="#0B2545" stroke-width="2.5"/><path d="M12 32 Q20 20 32 24 Q44 16 52 32" fill="#F2B134" stroke="#0B2545" stroke-width="2"/><circle cx="32" cy="26" r="6" fill="#B23A48" stroke="#0B2545" stroke-width="2"/><circle cx="24" cy="30" r="3" fill="#B23A48"/><circle cx="41" cy="30" r="3" fill="#B23A48"/>',
    anchor:'<circle cx="32" cy="12" r="5" fill="none" stroke="#0B2545" stroke-width="3"/><path d="M32 17 V52 M20 28 H44 M12 38 Q16 54 32 54 Q48 54 52 38 L46 40 M12 38 L18 40" fill="none" stroke="#0B2545" stroke-width="3" stroke-linecap="round"/>',
    popcorn:'<path d="M16 24 L20 54 H44 L48 24Z" fill="#fff" stroke="#0B2545" stroke-width="2.5"/><path d="M22 24 V54 M32 24 V54 M42 24 V54" stroke="#B23A48" stroke-width="4"/><circle cx="22" cy="18" r="6" fill="#F2B134" stroke="#0B2545" stroke-width="2"/><circle cx="33" cy="14" r="6" fill="#F2B134" stroke="#0B2545" stroke-width="2"/><circle cx="43" cy="19" r="6" fill="#F2B134" stroke="#0B2545" stroke-width="2"/>',
    star:'<path d="M32 8 L38 24 L55 25 L42 36 L46 53 L32 44 L18 53 L22 36 L9 25 L26 24Z" fill="#F2B134" stroke="#0B2545" stroke-width="2.5"/>'
  };
  const ICON_FOR={welcome:'chairs',assoc:'sun',july4:'flag',derby:'fish',bingo1:'bingo',bingo2:'bingo',kickoff:'ball',music:'music',art:'palette',spook:'pumpkin',golf:'golf',supper:'pasta',annual:'anchor',movie:'popcorn'};
  const BANDS=['#E07A2F','#1D8A8A','#B23A48','#3C8D4F','#6B4FA3','#2E6DB4','#C9A227'];
  const icon=(name,size=56)=>`<svg class="poster-icon" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${ICON[name]||ICON[ICON_FOR[name]]||ICON.star}</svg>`;
  function posterHTML(rows,y){
    const predicted=rows.some(r=>['predicted','tide','planned'].includes(r.source));
    const tile=(r,i)=>{const c=BANDS[i%BANDS.length];const bits=[r.location||'',r.rain?`Rain date ${monthDay(r.rain)}`:''].filter(Boolean);
      return `<li class="poster-tile${r.date?'':' is-tbd'}" style="--band:${c}"><div class="poster-band"><span class="poster-num">${r.n??'·'}</span><h3>${esc(r.title)}${['predicted','tide','planned'].includes(r.source)?'<sup class="summer-flag">*</sup>':''}</h3></div>
        <div class="poster-body">${icon(r.icon||r.key)}<p class="poster-when"><strong>${r.date?esc(dayName(r.date)+', '+monthDay(r.date)):'Date to be announced'}</strong>${r.time?`<span>${esc(fmtRange(r.time,r.end))}</span>`:''}${bits.length?`<span>${esc(bits.join(' · '))}</span>`:''}</p>${r.details?`<p class="poster-details">${esc(r.details)}</p>`:''}</div></li>`;};
    return `<article class="summer-sheet summer-poster" aria-label="Summer events ${y}">
      <header class="poster-head"><p>${icon('annual',22)} Hamilton Beach Association ${icon('annual',22)}</p><h1>Summer Events <span>${y}</span></h1></header>
      <ol class="poster-grid">${rows.map(tile).join('')}</ol>
      <footer class="summer-sheet-foot poster-foot"><p><strong>Thank you to our amazing neighbors and volunteers.</strong> Volunteers are needed to run most events. Together we make our community the best place to be.</p>
      <p class="summer-foot-note">${predicted?'* Planned from the usual schedule and not yet confirmed by the board. Fishing Derby chosen for an outgoing mid tide near 11 AM (NOAA Great Hill predictions). ':''}Printed from the Hamilton Beach Association app, ${esc(new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}))}.</p></footer></article>`;
  }
  let sheetView='poster';
  const sheetHTML=(rows,y)=>sheetView==='list'?listHTML(rows,y):posterHTML(rows,y);
  // Volunteer roles for the Summer Kickoff, from the Kids' Day run-of-show (games) and the Art Day crafts plan.
  const KICKOFF_ROLES=[
    {role:'Setup crew (3 to 4 people)',when:'9:30 to 11:00',what:'Carry tables, coolers, the rope and the water barrels to Side Beach; mark the long-jump line in the sand; lay out the obstacle course (cones, hula hoops, pool noodles) and the limbo pole.'},
    {role:'Welcome and check-in (1 to 2)',when:'10:45 to 11:30',what:'Greet families, hand out name tags, point parents to the shade and water, and keep a count for the board.'},
    {role:'Games leader (1) and helpers (3 to 4)',when:'11:00 to 1:00',what:'Run the games in order: limbo, long jump, water relay, water balloon toss, obstacle course, hula hoop contest, musical-chairs scavenger hunt, Simon Says and tug of war. Helpers refill the water buckets, fill balloons and reset the course between rounds. Parents join the second round of tug of war.'},
    {role:'Prize table (1 to 2)',when:'11:00 to 1:00',what:'Keep the prizes sorted by game, hand one to each winner and make sure every child goes home with something.'},
    {role:'Grill crew (2)',when:'11:30 to 1:00',what:'Hot dogs, buns, condiments and water. Bring the grill and propane; the association covers the food.'},
    {role:'Craft corner (2)',when:'11:00 to 1:00',what:'A quiet table for younger children: shell painting and sand art while the big games run. Supplies from the Art Day crafts plan.'},
    {role:'Photographer (1)',when:'All morning',what:'Pictures for Event photos and the newsletter. Only post children with a parent’s go-ahead.'},
    {role:'Cleanup crew (3 to 4)',when:'1:00 to 1:45',what:'Collect balloon pieces from the sand (every one), stack tables, return the rope and cones, and bag the trash for Tuesday pickup.'}
  ];
  const KICKOFF_SUPPLIES='Limbo pole, tape measure and marker flags, water buckets and sponges, water balloons (two bags), cones, hula hoops and pool noodles, a playlist and speaker, shell and sand-art supplies, prizes sorted by game, hot dogs and water, first-aid kit.';
  function kickoffNotes(y){
    if(y<=2026)return '';
    return `<section class="summer-kickoff" aria-label="Summer Kickoff volunteer roles"><h3>Summer Kickoff volunteer roles</h3><p class="summer-small">Summer Kickoff replaces Kids’ Day from 2027 and opens the season on the second Saturday of June. The games follow the Kids’ Day run-of-show; the craft corner uses the Art Day plan. Times are suggestions until the board sets the final run-of-show.</p>
      <ul class="summer-roles">${KICKOFF_ROLES.map(r=>`<li><strong>${esc(r.role)}</strong><small>${esc(r.when)}</small><span>${esc(r.what)}</span></li>`).join('')}</ul>
      <p class="summer-small"><strong>Supplies to bring:</strong> ${esc(KICKOFF_SUPPLIES)}</p></section>`;
  }
  // ---- Editing the usual pattern (administrator only; the database also refuses anyone else) ---------------
  let editing=null;// working copy while the editor is open
  const isAdmin=()=>window.HBACommunity?.member?.role==='admin';
  const ICON_LABELS={chairs:'Chairs',sun:'Sun',flag:'Flag',fish:'Fish',bingo:'Bingo balls',ball:'Beach ball',music:'Music',palette:'Paint palette',pumpkin:'Pumpkin',golf:'Golf flag',pasta:'Pasta',anchor:'Anchor',popcorn:'Popcorn',star:'Star'};
  const opt=(value,label,current)=>`<option value="${esc(value)}"${String(value)===String(current??'')?' selected':''}>${esc(label)}</option>`;
  function previewText(r){
    try{
      const [c]=compile([r]),y=new Date().getFullYear()+(summerOver?1:0);
      const d=c.date?.(y);
      return `${c.when}${d?` · ${y}: ${d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}`:''}`;
    }catch{return 'Choose the date rule';}
  }
  function rowHTML(r,i,count){
    const rule=r.rule||'nth';
    const nthFields=rule==='nth'?`<label>Week<select data-f="ordinal">${Object.entries(ORDINALS).sort((a,b)=>(+a[0]<0)-(+b[0]<0)||a[0]-b[0]).map(([v,l])=>opt(v,l,r.ordinal)).join('')}</select></label>
        <label>Day<select data-f="weekday">${WEEKDAYS.map((w,n)=>opt(n,w,r.weekday)).join('')}</select></label>
        <label>Month<select data-f="month">${MONTHS.map((m,n)=>opt(n+1,m,r.month)).join('')}</select></label>`:'';
    const fixedFields=rule==='fixed'?`<label>Month<select data-f="month">${MONTHS.map((m,n)=>opt(n+1,m,r.month)).join('')}</select></label>
        <label>Day<input data-f="day" type="number" min="1" max="31" value="${esc(r.day??'')}" required></label>`:'';
    const dated=rule==='nth'||rule==='fixed';
    return `<li class="summer-edit-row" data-i="${i}"><fieldset><legend>${i+1}. ${esc(r.title||'New event')}</legend>
      <label class="summer-edit-wide">Event name<input data-f="title" maxlength="120" value="${esc(r.title||'')}" required></label>
      <div class="summer-edit-grid">
        <label>Date rule<select data-f="rule" data-rerender>${opt('nth','A weekday of a month (e.g. third Saturday of July)',rule)}${opt('fixed','The same date every year (e.g. July 4)',rule)}${opt('tide','Fishing Derby: chosen by the tides',rule)}${opt('tbd','Date set each summer',rule)}</select></label>
        ${nthFields}${fixedFields}
        ${dated?`<label>Rain date, days later<input data-f="rain_offset_days" type="number" min="1" max="60" placeholder="None" value="${esc(r.rain_offset_days??'')}"></label>`:''}
        <label>Starts<input data-f="time" type="time" value="${esc(r.time||'')}"></label>
        <label>Ends (optional)<input data-f="end" type="time" value="${esc(r.end||'')}"></label>
        <label>Picture<select data-f="icon">${Object.entries(ICON_LABELS).map(([v,l])=>opt(v,l,r.icon||'star')).join('')}</select></label>
      </div>
      <label class="summer-edit-wide">Location<input data-f="location" maxlength="200" value="${esc(r.location||'')}"></label>
      <label class="summer-edit-wide">Details printed on the sheet<textarea data-f="details" rows="3" maxlength="2000">${esc(r.details||'')}</textarea></label>
      <label class="summer-edit-wide">Note after the date (optional)<input data-f="when_note" maxlength="300" value="${esc(r.when_note||'')}" placeholder="e.g. same day as Art Day"></label>
      ${r.legacy?`<p class="summer-small">Earlier name kept for past sheets: ${esc(r.legacy.title)} until ${esc(r.legacy.until)}.</p>`:''}
      <p class="summer-edit-preview" aria-live="polite"><strong>Prints as:</strong> ${esc(previewText(r))}</p>
      <div class="summer-edit-row-actions">
        <button type="button" data-move="-1"${i===0?' disabled':''}>Move up</button>
        <button type="button" data-move="1"${i===count-1?' disabled':''}>Move down</button>
        <button type="button" data-remove>Remove</button>
      </div></fieldset></li>`;
  }
  function editorHTML(){
    return `<form id="summer-editor" class="summer-editor" novalidate>
      <h3>Edit the usual summer events</h3>
      <p class="summer-small">This pattern predicts each summer’s dates and fills the printed sheet. Dates recorded in the Calendar always take priority. Everyone sees your changes once you save.</p>
      <ol class="summer-edit-list">${editing.map((r,i)=>rowHTML(r,i,editing.length)).join('')}</ol>
      <p><button type="button" id="summer-edit-add">Add an event</button></p>
      <p id="summer-edit-status" class="summer-status" role="status"></p>
      <div class="summer-edit-actions">
        <button type="submit" id="summer-edit-save">Save for everyone</button>
        <button type="button" id="summer-edit-cancel">Cancel</button>
        <button type="button" id="summer-edit-reset">Restore the standard 14 events</button>
      </div></form>`;
  }
  // Copy what is typed in the editor back into the working list.
  function readEditor(){
    const form=dialog.querySelector('#summer-editor');if(!form)return;
    form.querySelectorAll('.summer-edit-row').forEach(li=>{
      const r=editing[Number(li.dataset.i)];
      li.querySelectorAll('[data-f]').forEach(el=>{
        const f=el.dataset.f,v=el.value.trim();
        if(['month','weekday','ordinal','day','rain_offset_days'].includes(f))r[f]=v===''?undefined:Number(v);
        else r[f]=v;
      });
    });
  }
  function cleanRule(r){
    const out={key:r.key,title:r.title,rule:r.rule,icon:r.icon||'star',location:r.location||'',details:r.details||''};
    if(r.rule==='nth')Object.assign(out,{month:r.month??6,weekday:r.weekday??6,ordinal:r.ordinal||1});
    if(r.rule==='fixed')Object.assign(out,{month:r.month??7,day:r.day});
    if((r.rule==='nth'||r.rule==='fixed')&&r.rain_offset_days)out.rain_offset_days=r.rain_offset_days;
    if(r.time)out.time=r.time;if(r.time&&r.end)out.end=r.end;
    if(r.when_note)out.when_note=r.when_note;
    if(r.legacy)out.legacy=r.legacy;
    return out;
  }
  function renderEditor(message){
    readEditor();
    const host=dialog.querySelector('#summer-sheet-host');
    host.innerHTML=editorHTML();dialog.querySelector('#summer-notes').innerHTML='';
    dialog.querySelector('#summer-board-actions').innerHTML='';
    const form=host.querySelector('#summer-editor'),say=t=>{form.querySelector('#summer-edit-status').textContent=t||'';};
    say(message);
    form.querySelectorAll('[data-rerender]').forEach(el=>el.onchange=()=>renderEditor());
    form.addEventListener('input',e=>{const li=e.target.closest('.summer-edit-row');if(!li)return;readEditor();
      const r=editing[Number(li.dataset.i)];li.querySelector('.summer-edit-preview').innerHTML=`<strong>Prints as:</strong> ${esc(previewText(cleanRule(r)))}`;
      if(e.target.dataset.f==='title')li.querySelector('legend').textContent=`${Number(li.dataset.i)+1}. ${r.title||'New event'}`;});
    form.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{readEditor();const i=Number(b.closest('.summer-edit-row').dataset.i),j=i+Number(b.dataset.move);
      [editing[i],editing[j]]=[editing[j],editing[i]];renderEditor();dialog.querySelector(`.summer-edit-row[data-i="${j}"] [data-move]`)?.focus();});
    form.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{readEditor();const i=Number(b.closest('.summer-edit-row').dataset.i);
      if(!confirm(`Remove “${editing[i].title||'this event'}” from the usual summer events? Dates already in the Calendar stay there.`))return;
      editing.splice(i,1);renderEditor('Removed. Save to apply it for everyone.');});
    form.querySelector('#summer-edit-add').onclick=()=>{readEditor();
      editing.push({key:'e-'+Date.now().toString(36),title:'',rule:'nth',month:7,weekday:6,ordinal:1,icon:'star',location:'',details:''});
      renderEditor();const last=dialog.querySelector('.summer-edit-row:last-child [data-f="title"]');last?.focus();last?.scrollIntoView({block:'center'});};
    form.querySelector('#summer-edit-cancel').onclick=()=>{editing=null;render();};
    form.querySelector('#summer-edit-reset').onclick=()=>{editing=JSON.parse(JSON.stringify(DEFAULT_RULES));renderEditor('The standard 14 events are back in the editor. Save to apply them for everyone.');};
    form.onsubmit=async e=>{
      e.preventDefault();readEditor();
      const missing=editing.findIndex(r=>!r.title||(r.rule==='fixed'&&!r.day));
      if(missing>=0){say(`Event ${missing+1}: give it a name${editing[missing].rule==='fixed'?' and a day':''}.`);dialog.querySelector(`.summer-edit-row[data-i="${missing}"] [data-f="title"]`)?.focus();return;}
      const save=form.querySelector('#summer-edit-save');save.disabled=true;say('Saving…');
      try{
        const res=await window.HBACommunity.api('/api/content/summer-events',{method:'PUT',body:JSON.stringify({events:editing.map(cleanRule)})});
        storedRules=res.events;RULES=compile(storedRules);editing=null;status='Usual summer events saved. Everyone now sees the new pattern.';
        document.dispatchEvent(new CustomEvent('hba-data-change'));render();
      }catch(err){say(err.message);save.disabled=false;}
    };
  }
  function openEditor(){editing=JSON.parse(JSON.stringify(storedRules||DEFAULT_RULES));renderEditor();dialog.querySelector('#summer-editor [data-f="title"]')?.focus();}
  function render(){
    if(!dialog?.open)return;
    if(editing){renderEditor();return;}
    const rows=schedule(year,events,tides[year]);
    dialog.querySelector('#summer-status').textContent=status;
    dialog.querySelector('#summer-sheet-host').innerHTML=sheetHTML(rows,year);
    const derby=rows.find(r=>r.key==='derby');
    const board=window.HBACommunity?.isBoard?.();
    const notes=[];
    const predicted=rows.filter(r=>r.source==='predicted'||r.source==='tide');
    if(predicted.length)notes.push(`<p><strong>${predicted.length} date${predicted.length===1?'':'s'} predicted</strong> from the usual pattern (marked *). ${board?'Record them into the calendar when the board agrees; recorded dates replace predictions on this sheet.':'The board confirms each date before the summer.'}</p>`);
    if(derby?.candidates?.length){
      notes.push(`<h3>Fishing Derby Saturdays, ${year}</h3><p>Rule from the board: a Saturday morning in July or August when 11 AM is about mid tide on the way out. Times are NOAA predictions for Great Hill.</p><table class="summer-tides"><thead><tr><th>Saturday</th><th>High</th><th>Low</th><th>Mid tide (ebb)</th><th>Fit</th><th>Notes</th></tr></thead><tbody>${derby.candidates.map(c=>`<tr${c.date===derby.date?' class="is-pick"':''}><td>${esc(longDate(c.date))}${c.date===derby.date?' · chosen':''}</td><td>${esc(fmtTime(c.ebb.high))}</td><td>${esc(fmtTime(c.ebb.low))}</td><td>${esc(fmtTime(c.ebb.mid_ebb))}</td><td>${esc(c.fit)}</td><td>${esc(c.notes.join('; '))}</td></tr>`).join('')}</tbody></table>`);
    }else if(derby&&!derby.date&&derby.source!=='printed'){notes.push(`<p><strong>Fishing Derby:</strong> no Saturday could be chosen because tide predictions were not available. Try again later.</p>`);}
    notes.push(`<h3>The usual pattern</h3><ul class="summer-rules">${RULES.map(r=>`<li><strong>${esc(r.title)}</strong> — ${esc(r.when)}${r.time?`, ${esc(fmtRange(r.time,r.end))}`:''}${r.location?`, ${esc(r.location)}`:''}</li>`).join('')}</ul><p class="summer-small">Pattern taken from the 2026 Summer Events sheet. If the board changes a habit (for example the Annual Meeting Sunday), record the real date in the calendar and the sheet follows it.</p>`);
    // Volunteer sign-ups for this summer's recorded events, with live counts, and the Movie Night hosting offer.
    const E=window.HBAEngage,me=window.HBACommunity?.member;
    if(E&&me){
      const dated=rows.filter(r=>r.record?.id);
      const movie=rows.find(r=>r.key==='movie');
      notes.unshift(`<section class="summer-signups" aria-label="Volunteer sign-ups"><h3>Volunteer sign-ups, ${year}</h3><p class="summer-small">Counts are live. Add your name and the board will be in touch about jobs and times.</p>
        ${movie&&!movie.record?`<p><button type="button" class="signup-btn" id="summer-offer-host">Offer to host Movie Night</button> <button type="button" class="signup-btn signup-secondary" id="summer-offers">See hosting offers</button></p>`:movie?.record?`<p>Movie Night is set for ${esc(longDate(movie.date))}${movie.time?' at '+esc(fmtTime(movie.time)):''}. <button type="button" class="signup-btn signup-secondary" id="summer-offers">Hosting offers</button> <button type="button" class="signup-btn signup-secondary" id="summer-poll">Film poll</button></p>`:''}
        ${dated.length?`<ul>${dated.map(r=>`<li><strong class="ev">${esc(r.title)}<br><small>${esc(monthDay(r.date))}</small></strong>${E.signupHTML(r.record.id,{board})}</li>`).join('')}</ul>`:'<p class="summer-small">No recorded events for this summer yet, so there are no sign-up sheets.</p>'}</section>`);
    }
    notes.push(kickoffNotes(year));
    dialog.querySelector('#summer-notes').innerHTML=notes.join('');
    if(E&&me){const root=dialog.querySelector('#summer-notes');
      root.querySelector('#summer-offer-host')?.addEventListener('click',()=>E.offerForm('Movie Night',year));
      root.querySelector('#summer-offers')?.addEventListener('click',()=>E.openHosting());
      root.querySelector('#summer-poll')?.addEventListener('click',()=>E.openPoll());
      E.bindSignups(root,()=>E.refreshSignupNodes(root,board));E.loadSignups().then(()=>{if(dialog.open)E.refreshSignupNodes(root,board);});}
    const act=dialog.querySelector('#summer-board-actions');
    act.innerHTML=(board&&predicted.length?`<button type="button" id="summer-record"${busy?' disabled':''}>Record ${predicted.length} predicted date${predicted.length===1?'':'s'} in the calendar</button>`:'')
      +(isAdmin()?'<button type="button" id="summer-edit">Edit usual events</button>':'');
    act.querySelector('#summer-edit')?.addEventListener('click',openEditor);
    act.querySelector('#summer-record')?.addEventListener('click',()=>recordAll(predicted));
  }
  async function recordAll(predicted){
    if(!confirm(`Record ${predicted.length} ${year} dates in the calendar as planned events? They will show as “planned” until the board confirms details, and can be edited or cancelled in the Calendar.`))return;
    busy=true;render();
    const C=window.HBACommunity;let done=0,errors=[];
    try{
      let series=window.HBASummer.series||[];
      for(const r of predicted){
        if(!r.date)continue;
        let s=series.find(x=>x.title.toLowerCase()===r.title.toLowerCase());
        if(!s){s=await C.api('/api/series',{method:'POST',body:JSON.stringify({title:r.title,description:r.when})});series.push(s);}
        try{
          await C.api('/api/events',{method:'POST',body:JSON.stringify({series_id:s.id,title:r.title,event_date:r.date,event_time:r.time||null,location:r.location||'',description:(r.details||'')+(r.key==='derby'&&r.pick?`\nChosen for the tide: high ${fmtTime(r.pick.ebb.high)}, low ${fmtTime(r.pick.ebb.low)} at Great Hill (NOAA prediction).`:''),state:'scheduled',rain_date:r.rain||null,use_rain_date:false,planning_only:true})});
          done++;
        }catch(e){errors.push(r.title+': '+e.message);}
      }
      status=`${done} event${done===1?'':'s'} recorded for ${year}.`+(errors.length?' Problems: '+errors.join('; '):'');
      document.dispatchEvent(new CustomEvent('hba-data-change'));
    }catch(e){status=e.message;}
    busy=false;await load();
  }
  function open(y){ensure();focusBefore=document.activeElement;if(y){year=Number(y);dialog.querySelector('#summer-year').value=year;}if(!dialog.open)dialog.showModal();load();}
  document.addEventListener('hba-data-change',()=>{if(dialog?.open)load();});
  window.HBASummer={open,schedule,get RULES(){return RULES;},DEFAULT_RULES,whenText,derbyCandidates,pickDerby,series:[],KICKOFF_ROLES};
  window.openHBASummer=open;
})();
