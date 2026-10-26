(() => {
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // The report renders inline on the dashboard (host supplied by capabilities.js), not in a dialog.
  let host=null,started=false,lastRefresh=0,again=false;
  let data=null,error='',tides=null,tideError='',weather=null,weatherError='',selected='',busy=false,official=null,officialError='';
  const links={
    tides:'https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=8447368',
    shellfish:'https://wareham.ma.us/261/Shellfish-Map-and-Information',
    map:'https://wareham.ma.us/DocumentCenter/View/1344/Shellfish-Bed-Status--PDF',
    classification:'https://www.mass.gov/info-details/shellfish-classification-areas',
    swimming:'https://www.mass.gov/info-details/interactive-beach-water-quality-dashboard'
  };
  const link=(url,label)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
  async function get(path){return window.HBACommunity.api(path,{signal:AbortSignal.timeout(25000)});}
  const fmtDT=iso=>new Date(iso).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  const fmtD=iso=>new Date(iso).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  // Official feeds read by the server: DPH beach dashboard (status and samples), DMF classification polygons, DMF notice list.
  function officialBlock(category){
    if(officialError&&!official)return `<p class="waterfront-status">Official feeds not reached: ${esc(officialError)}</p>`;
    if(!official)return '<p class="waterfront-status">Reading official feeds…</p>';
    const at=fmtDT(official.retrieved_at);
    if(category==='swimming'){
      const b=official.beach;
      if(!b)return `<p class="waterfront-status">DPH dashboard: ${esc(official.beach_error||'no data')}.</p>`;
      const st=(b.status||'').trim(),low=st.toLowerCase();
      const cls=low==='open'?'is-open':low.includes('clos')||low.includes('post')?'is-closed':'is-neutral';
      const latest=b.samples[0];
      return `<div class="waterfront-official"><p class="waterfront-official-status ${cls}"><strong>DPH status for Hamilton Beach: ${esc(st||'not listed')}</strong><span>Read ${esc(at)} Eastern from the state dashboard${low==='off-season'?'. DPH tests weekly from Memorial Day to Labor Day; outside the season there is no monitoring and no swimming determination.':''}</span></p>
        ${latest?`<p>Latest DPH sample: <strong>${esc(fmtD(latest.sampled_at))}</strong> · ${esc(latest.indicator)} ${latest.result_cfu} CFU/100 mL (single-sample limit ${b.single_sample_limit_cfu})${latest.geomean_cfu!=null?` · five-week geometric mean ${latest.geomean_cfu} (limit ${b.geomean_limit_cfu})`:''}.</p>
        <details><summary>Last ${b.samples.length} samples</summary><table><thead><tr><th>Sampled</th><th>Result</th><th>Geomean</th></tr></thead><tbody>${b.samples.map(x=>`<tr${x.exceeds_single_sample?' class="exceeds"':''}><td>${esc(fmtD(x.sampled_at))}</td><td>${x.result_cfu}${x.exceeds_single_sample?' · above limit':''}</td><td>${x.geomean_cfu??'—'}</td></tr>`).join('')}</tbody></table></details>`:'<p>No sample results listed for the current dashboard season.</p>'}
        ${b.closures.length?`<p class="waterfront-status">DPH lists a closure or posting for Hamilton Beach: ${esc(JSON.stringify(b.closures[0]))}</p>`:'<p>No current DPH closure or posting listed for Hamilton Beach.</p>'}</div>`;
    }
    const rows=official.classification||[];
    const mine=rows.find(r=>r.area==='BB36.11'),others=rows.filter(r=>r.area!=='BB36.11'&&['BB36.8','BB36.0'].includes(r.area));
    const rel=(official.notices||[]).filter(n=>n.relevant).slice(0,3);
    return `<div class="waterfront-official">${mine?`<p class="waterfront-official-status ${mine.classification==='Prohibited'?'is-closed':'is-neutral'}"><strong>DMF classification at Hamilton Beach: ${esc(mine.classification)}</strong><span>Area ${esc(mine.area)} “${esc(mine.name)}” (${mine.acres} acres, since ${esc(fmtD(mine.since))}). ${mine.classification==='Prohibited'?'Shellfish harvest for eating is not allowed here at any time.':''} Read ${esc(at)} Eastern from the state growing-area service.</span></p>`:`<p class="waterfront-status">DMF classification: ${esc(official.classification_error||'area polygon not returned')}.</p>`}
      ${others.length?`<p>Nearby: ${others.map(r=>`${esc(r.name)} (${esc(r.area)}) — ${esc(r.classification)}${r.condition?', closed under '+esc(r.condition.toLowerCase())+' conditions':''}`).join('; ')}.</p>`:''}
      ${rel.length?`<p>Latest DMF emergency notices for growing area BB36, Wareham or statewide:</p><ul>${rel.map(n=>`<li>${esc(n.date)} · ${link(n.url,n.title)}</li>`).join('')}</ul>`:`<p class="waterfront-status">Current open or closed status of the conditional areas is set by DMF emergency notices, which this server could not read automatically${official.notices_error?' ('+esc(official.notices_error)+')':''}. ${link(official.sources.notices,'Open the official DMF notice list')}.</p>`}</div>`;
  }
  function notice(category,title,url){
    const seen=new Set(),rows=(data?.advisories||[]).filter(r=>{
      if(r.category!==category)return false;
      const key=r.location.trim().toLowerCase();if(seen.has(key))return false;seen.add(key);return true;
    }),now=Date.now();
    return `<section class="waterfront-card"><p class="waterfront-eyebrow">${esc(title)}</p><h3>Check the official notice before entering the water${category==='shellfishing'?' or harvesting':''}.</h3>
      ${officialBlock(category)}
      ${rows.length?'<h4 class="waterfront-subhead">Board-posted notices</h4>':''}
      ${rows.slice(0,4).map(r=>{const valid=Date.parse(r.valid_until)>now,checked=new Date(r.checked_at).toLocaleString('en-US',{timeZone:'America/New_York'});
        return `<article class="waterfront-notice"><h4>${esc(r.location)}</h4><strong>${valid?esc({open:'Board reports official source indicates OPEN for the specified scope',closed:'Board reports CLOSED / advisory for the specified scope',unverified:'Not verified; check official source'}[r.status]):'Expired notice: current status not verified'}</strong><p>${esc(r.note)}</p><small>Source checked ${esc(checked)} Eastern. Recheck by ${esc(new Date(r.valid_until).toLocaleString('en-US',{timeZone:'America/New_York'}))} Eastern.</small><p>${link(r.source_url,'Open the cited official notice')}</p></article>`;}).join('')}
      <div class="waterfront-links">${link(url,category==='swimming'?'Massachusetts DPH swimming-advisory dashboard':'Wareham shellfish notices & regulations')}${category==='shellfishing'?link(links.map,'Official Wareham shellfish map (PDF)')+link(links.classification,'Massachusetts growing-area classifications'):''}</div>
      <p class="waterfront-muted">${category==='swimming'?`Use Town = Wareham and Beach = Hamilton Beach in the ${link(url,'DPH dashboard')}. A historic passing sample or missing entry is not current permission to swim.`:`The ${link(links.shellfish,'Wareham guidance')} warns that approved areas may be unexpectedly closed; area, species, seasonal and rainfall restrictions apply. For rainfall-management status, the town lists 508-291-3100 ext. 3184.`}</p></section>`;
  }
  function tidePanel(){
    const rows=tides?.predictions||[],dates=[...new Set(rows.map(r=>r.t.slice(0,10)))];
    if(!dates.includes(selected))selected=dates[0]||'';
    const day=rows.filter(r=>r.t.startsWith(selected));
    return `<section class="waterfront-card"><p class="waterfront-eyebrow">Great Hill · NOAA station 8447368</p><h3>Tide predictions</h3><p>Local Eastern time, feet above mean lower low water (MLLW). These are predictions, not live measured water levels. ${link(links.tides,'NOAA Great Hill chart & table')}.</p>
      ${tideError?`<p class="waterfront-status">${esc(tideError)}</p>`:''}
      ${dates.length?`<label class="waterfront-date">Prediction date<select id="waterfront-tide-day">${dates.map(x=>`<option value="${x}"${x===selected?' selected':''}>${x}</option>`).join('')}</select></label>
        ${window.HBABeachScene.tideCurve(rows,selected)}
        <table><thead><tr><th>Tide</th><th>Eastern time</th><th>Height (ft MLLW)</th></tr></thead><tbody>${day.map(r=>`<tr><td>${r.type==='H'?'High':'Low'}</td><td>${esc(r.t.slice(11))}</td><td>${Number(r.v).toFixed(2)}</td></tr>`).join('')}</tbody></table>
        <small>Retrieved ${esc(new Date(tides.retrieved_at).toLocaleString('en-US',{timeZone:'America/New_York'}))} Eastern; source refreshed on request, cached up to 6 hours.</small>`:!tideError?'<p>Loading NOAA predictions…</p>':''}
      <p class="waterfront-muted">Not for navigation. Tide predictions do not determine swimming safety or shellfish harvest permission.</p></section>`;
  }
  function facebookCard(){
    const st=data?.settings||{},name=st.public_facebook_group_name||'Quasuet Island/Hamilton Beach Friends and Family',url=st.public_facebook_group_url||'';
    let safe='';try{const u=new URL(url);if(u.protocol==='https:'&&u.hostname.endsWith('facebook.com'))safe=u.href;}catch{}
    return `<section class="waterfront-card waterfront-facebook" aria-labelledby="facebook-title"><p class="waterfront-eyebrow">Neighbors on Facebook</p><h3 id="facebook-title">${esc(name)}</h3><p>${esc(st.public_facebook_group_note||'A private Facebook group run by neighbors, not by the HBA board. Joining requires approval from the group’s administrators.')}</p>
      ${safe?`<a class="waterfront-button" href="${esc(safe)}" target="_blank" rel="noopener noreferrer">Open the private group on Facebook</a>`:'<p class="waterfront-status">Group link not yet configured by the board. Search the group name in Facebook meanwhile; no guessed link is shown here.</p>'}
      <p class="waterfront-muted">Official HBA notices, votes and records live in this portal; the Facebook group is a social space and posts there are not association decisions.</p></section>`;
  }
  function storeCard(){
    const st=data?.settings||{},name=st.public_local_sands_name||'Local Sands',url=st.public_local_sands_url||'';
    let safe='';try{const u=new URL(url);if(u.protocol==='https:')safe=u.href;}catch{}
    const onFacebook=/facebook\.com/.test(safe),onInstagram=/instagram\.com/.test(safe);
    return `<section class="waterfront-card waterfront-store" aria-labelledby="store-title"><p class="waterfront-eyebrow">Hamilton Beach merchandise</p><h3 id="store-title">${esc(name)}</h3><p>${esc(st.public_local_sands_note||'The official Hamilton Beach merchandise store: shirts, hats and beach gear with the neighbourhood name.')}</p>
      ${safe?`<a class="waterfront-button" href="${esc(safe)}" target="_blank" rel="noopener noreferrer">Open ${esc(name)} on ${onFacebook?'Facebook':onInstagram?'Instagram':'the web'}</a>`:'<p class="waterfront-status">Store link not yet configured by the board. Search “Local Sands” on Facebook meanwhile; no guessed link is shown here.</p>'}
      <p class="waterfront-muted">Purchases are made with the store, not through this portal or the HBA.</p></section>`;
  }
  // The report is a drop-down on the dashboard: closed by default with a one-line summary, open on request.
  let open=false;try{open=localStorage.getItem('hba-bulletin-open')==='1';}catch{}
  function setOpen(v){open=!!v;try{localStorage.setItem('hba-bulletin-open',open?'1':'0');}catch{}render();}
  function summaryLine(){
    const parts=[];
    if(weather){const o=weather.observation&&!weather.observation.stale?weather.observation:null,h=weather.hourly?.[0];const t=o?o.temperature_f:h?.temperature_f,d=o?o.description:h?.description;
      if(t!==null&&t!==undefined)parts.push(Math.round(t)+'°'+(d?' '+d:''));else if(d)parts.push(d);
      if(o&&o.wind_mph!==null&&o.wind_mph!==undefined)parts.push('wind '+Math.round(o.wind_mph)+' mph');}
    else if(weatherError)parts.push('weather unavailable');
    if(tides){const t=window.HBABeachScene.tideNow(tides.predictions,new Date());if(t?.next)parts.push((t.next.type==='H'?'high':'low')+' tide '+new Date(t.next.t).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}));}
    const st=window.HBAWeatherAlerts?.state?.(window.HBAWeatherAlerts.data?.(),'');const n=st?.alerts?.length;
    if(typeof n==='number')parts.push(n?`${n} NWS alert${n===1?'':'s'}`:'no NWS alerts');
    if(official?.beach?.status)parts.push('DPH beach status: '+official.beach.status.trim());
    return parts.length?parts.join(' · '):(busy?'Loading the live report…':'Open for weather, tides, alerts and beach status');
  }
  function render(){
    if(!host?.isConnected)return;
    const focus=document.activeElement?.id;
    const signedIn=!!window.HBACommunity?.member;
    host.classList.toggle('is-collapsed',!open);
    const head=`<div class="waterfront-head"><button type="button" id="waterfront-toggle" class="waterfront-toggle" aria-expanded="${open?'true':'false'}" aria-controls="waterfront-body"><span class="waterfront-eyebrow">Hamilton Beach · Live report</span><span class="waterfront-toggle-row"><h2 id="waterfront-title">Beach & weather report</h2><span class="waterfront-chevron" aria-hidden="true"></span></span><span class="waterfront-summary">${esc(summaryLine())}</span><span class="waterfront-toggle-hint">${open?'Tap to close the report':'Tap to open the full report'}</span></button>${open?`<button id="waterfront-refresh" type="button"${busy?' disabled':''}>${busy?'Refreshing…':'Refresh official data'}</button>`:''}</div>`;
    if(!open){host.innerHTML=`<div class="waterfront-inline">${head}</div>`;host.querySelector('#waterfront-toggle').onclick=()=>setOpen(true);if(focus==='waterfront-toggle')host.querySelector('#waterfront-toggle')?.focus({preventScroll:true});return;}
    host.innerHTML=`<div class="waterfront-inline">${head}<div id="waterfront-body" class="waterfront-body">
      <div class="waterfront-toolbar"><p>Swimming and shellfish harvesting have different rules and status sources. Board-posted notices and official beach status appear for signed-in members.</p></div>
      <p role="status" class="waterfront-muted">${error?esc(error):data?'Official links available; board-posted notices are time-limited.':signedIn?'Loading bulletin…':'Sign in to see board-posted notices and the official DPH beach status.'}</p>
      ${window.HBABeachScene.hero({weather,tides,loading:busy&&!weather})}
      <div id="waterfront-alerts-host"></div>
      ${window.HBALocalWeather.panel(weather,weatherError,selected)}
      <div class="waterfront-grid"><div>${tidePanel()}</div><div>${notice('swimming','Hamilton Beach swimming',links.swimming)}${notice('shellfishing','Shellfish maps & closures',links.shellfish)}</div></div>
      <section class="waterfront-card waterfront-cleaning" aria-labelledby="cleaning-title"><p class="waterfront-eyebrow">Public beach-cleaning bulletin</p><h3 id="cleaning-title">Beach cleaning: dates & conservation</h3><p class="waterfront-status">Proposed schedule only. No cleaning dates below are confirmed.</p><p>June is reserved for horseshoe-crab breeding protection: no HBA beach cleaning is planned during June. The <a href="https://www.wareham.gov/AlertCenter.aspx?AID=125" target="_blank" rel="noopener noreferrer">Town of Wareham’s 2026 notice</a> covers May 1 through June 30. For future seasons, this portal conservatively holds both May and June pending updated town/DMF guidance.</p><p>The unsigned sample agreement proposes eight Thursday cleanings per season, near low tide. Dates in the conservation hold require rescheduling; all other dates still require confirmation, permission and tide checks. The first seasonal cleaning is intended as a deep clean. Financial terms and the contract are not published here.</p>
      <details><summary>View sample dates for 2027–2029</summary>${[
        [2027,['05-27','07-01','07-15','07-29','08-12','08-19','08-26','09-02']],
        [2028,['05-25','06-29','07-13','07-20','08-03','08-17','08-24','08-31']],
        [2029,['05-24','06-28','07-12','07-26','08-09','08-16','08-23','08-30']]
      ].map(([y,dates])=>`<h4>${y} · Unconfirmed</h4><ul>${dates.map((s,i)=>`<li>${new Date(y+'-'+s+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}${i===0?' · First deep clean':''} · ${Number(s.slice(0,2))<=6?'Reschedule: conservation hold':'Proposed; not confirmed'}</li>`).join('')}</ul>`).join('')}<p>Rain-date proposal: Wednesday before or Friday after, subject to approval and conservation restrictions. The June 30, 2027 fallback for July 1 is held too. No replacement dates or official future tide times have been invented.</p></details><p>For access questions, check confirmed board notices. For a neighborhood problem, use the private issue form; reports and board review notes are not published here.</p><button id="cleaning-report" type="button">${signedIn?"Report a beach issue":"Sign in to report a beach issue"}</button></section>
      ${facebookCard()}
      ${storeCard()}
      <p class="waterfront-footer">Never treat the absence of a closure here as an “open” determination. Check current official notices and posted signs; a board transcription cannot override a closure, permit restriction or public-health advisory.</p>
      <button type="button" id="waterfront-close" class="waterfront-close">Close the report</button></div></div>`;
    host.querySelector('#waterfront-toggle').onclick=()=>setOpen(false);
    host.querySelector('#waterfront-close').onclick=()=>{setOpen(false);requestAnimationFrame(()=>window.HBAShell?.scrollToSection?.('cap-bulletin'));};
    host.querySelector('#waterfront-refresh').onclick=()=>refresh();
    host.querySelector('#cleaning-report').onclick=()=>window.openHBACommunity('issues');
    const picker=host.querySelector('#waterfront-tide-day');if(picker)picker.onchange=()=>{selected=picker.value;render();};
    window.HBAWeatherAlerts.mount(host.querySelector('#waterfront-alerts-host'));
    if(focus==='waterfront-tide-day')picker?.focus({preventScroll:true});
    else if(focus==='waterfront-refresh')host.querySelector('#waterfront-refresh')?.focus({preventScroll:true});
    else if(focus==='waterfront-toggle')host.querySelector('#waterfront-toggle')?.focus({preventScroll:true});
  }
  async function refresh(){
    if(busy)return;busy=true;lastRefresh=Date.now();error='';tideError='';weatherError='';render();window.HBAWeatherAlerts.refresh(true);
    const signedIn=!!window.HBACommunity?.member;
    if(signedIn){
      try{data=await get('/api/bulletin');}catch(e){data=null;error=e.message+' Current statuses are not verified.';}
      render();
      window.HBACommunity.api('/api/beach-status',{signal:AbortSignal.timeout(170000)}).then(o=>{official=o;officialError='';render();}).catch(e=>{official=null;officialError=e.message;render();});
    }else{data=null;official=null;officialError='';}
    try{tides=await get('/api/tides');}catch(e){tides=null;tideError=e.message;}
    render();
    try{weather=await window.HBALocalWeather.load();}catch(e){weather=null;weatherError=e.message;}
    busy=false;render();
    if(again){again=false;refresh();}
  }
  // Dashboard mounts the report into its own section on every render; data is kept between renders.
  const stale=()=>!busy&&(Date.now()-lastRefresh>10*60000||(!!window.HBACommunity?.member&&data===null&&!error));
  window.HBABulletin={mount(el){host=el;render();if(!started){started=true;refresh();}else if(stale())refresh();},refresh};
  document.addEventListener('hba-account-change',()=>{data=null;official=null;officialError='';error='';if(!started)return;if(busy)again=true;else refresh();});
  // Older callers (home page, community dialog, dashboard tiles) now land on the dashboard section.
  window.openHBABulletin=()=>{
    document.querySelectorAll('dialog[open]').forEach(x=>{try{x.close();}catch{}});
    window.HBAShell?.showDashboard?.();
    if(!open)setOpen(true);
    requestAnimationFrame(()=>window.HBAShell?.scrollToSection?.('cap-bulletin'));
    if(!busy&&Date.now()-lastRefresh>60000)refresh();
  };
})();
