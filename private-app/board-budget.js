(() => {
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={unknown:'Unknown',paid:'Paid',unpaid:'Not paid'},symbols={unknown:'?',paid:'✓',unpaid:'!'};
  const dialog=document.createElement('dialog');dialog.id='board-budget-dialog';dialog.setAttribute('aria-labelledby','board-budget-title');
  dialog.innerHTML=`<div class="bb-shell"><header class="bb-header"><div><p>Hamilton Beach Association</p><h2 id="board-budget-title">Budget & dues</h2></div><button type="button" id="bb-close">Back to map</button></header>
    <nav class="bb-tabs" aria-label="Association tools"><button type="button" data-bb-view="simulator" aria-pressed="true">Budget simulator</button><button type="button" data-bb-view="timeline" aria-pressed="false" hidden>Affordability timeline</button><button type="button" data-bb-view="dues" aria-pressed="false">Homeowner dues registry</button></nav>
    <section id="bb-timeline" class="bb-scroll" hidden></section>
    <section id="bb-simulator"><p class="bb-warning">What-if planning, not adopted dues or construction approval. The simulator and actual dues annotations are separate.</p><div class="bb-export-actions"><button type="button" id="bb-report">Create report</button><button type="button" id="bb-presentation">Presentation view</button><span id="bb-export-status" role="status">Uses the scenario currently displayed below.</span></div><div class="bb-frame-wrap"><p id="bb-load" role="status">Loading budget simulator…</p><iframe title="HBA Budget Simulator" id="bb-frame" sandbox="allow-scripts allow-same-origin allow-downloads"></iframe></div></section>
    <section id="bb-dues" class="bb-scroll" hidden>
      <div class="dues-intro"><h3>Homeowner dues registry</h3><p>Deed-listed grantees are shown where transcribed; other names are labeled assessor leads. These records do not certify present ownership, HBA membership or a dues liability.</p></div>
      <div class="dues-filters"><label>Dues year<input type="number" id="dues-year" min="2020" max="2100" step="1" value="2026"></label><label>Find a home or name<input type="search" id="dues-search" placeholder="Address, name or deed"></label><label>Street<select id="dues-street"><option value="">All streets</option></select></label><label>Payment status<select id="dues-filter"><option value="">All statuses</option><option value="unknown">Unknown</option><option value="paid">Paid</option><option value="unpaid">Not paid</option></select></label></div>
      <div class="dues-toolbar"><button type="button" id="dues-refresh">Refresh statuses</button><button type="button" id="dues-export">Export backup</button><label class="dues-file" for="dues-import">Restore backup<input hidden type="file" id="dues-import" accept=".json,application/json"></label><button type="button" id="dues-csv">Export CSV</button><label class="dues-toggle"><input type="checkbox" id="dues-show-dots"> Show dues dots on map</label></div>
      <p class="dues-storage">Private shared board registry. Confirmed household receipts update statuses when credited in the check register or bank review; manual overrides are also available. Partial receipts remain Not paid until the verified annual amount is reached. New rows start Unknown. The detailed receipt history is in Check register. These records do not process payments.</p>
      <p id="dues-save-status" role="status">Loading home records…</p><div id="dues-import-review" hidden></div>
      <p id="dues-count" role="status"></p><div class="dues-key"><span class="dues-dot paid">✓</span> Paid <span class="dues-dot unpaid">!</span> Not paid <span class="dues-dot unknown">?</span> Unknown</div>
      <div class="dues-table-wrap"><table class="dues-table"><thead><tr><th>Home</th><th>Owner / grantee and evidence</th><th>Selected status</th><th>Open</th></tr></thead><tbody id="dues-rows"></tbody></table></div>
      <details class="dues-scope"><summary>Roster and ownership limits</summary><p id="dues-scope-text"></p><p id="dues-name-count"></p><p>One row per mapped improved residential property. Vacant, accessory, municipal and tax-title-only records are excluded. A multiple-house parcel is still one mapped row; reconcile actual memberships before billing. The broader research map is not the HBA service boundary: check 2022 bylaws Articles I and III before billing or certifying voting units. Dot locations are parcel centers, not surveyed rooftops. Trustees and life-estate capacities are preserved, not converted into separate bills.</p></details>
    </section></div>`;
  document.body.append(dialog);
  const $=s=>dialog.querySelector(s),frame=$('#bb-frame');
  let source,sourcePromise,year=2026,states=new Map(),loadedYear=null,requestSerial=0,ready=false,started=false,frameTimer,lastFocus,currentView='simulator',loadError='',pending=new Set();
  const markers=new Map(),group=L.layerGroup();
  map.createPane('duesMarkers');map.getPane('duesMarkers').style.zIndex=680;
  const key=document.createElement('div');key.className='dues-map-key';key.hidden=true;key.innerHTML='<strong>Dues annotations · <span id="dues-map-year">2026</span></strong><div><span class="dues-dot paid">✓</span> Paid <span class="dues-dot unpaid">!</span> Not paid <span class="dues-dot unknown">?</span> Unknown</div><small>Selected statuses, not membership certification</small>';
  const keyControl=L.control({position:'bottomright'});keyControl.onAdd=()=>{L.DomEvent.disableClickPropagation(key);return key;};keyControl.addTo(map);
  function status(uid){return states.get(uid)||{uid,status:'unknown',revision:0,updated_at:''};}
  function row(uid){return source?.properties.find(p=>p.uid===uid);}
  function options(value){return Object.entries(labels).map(([v,l])=>`<option value="${v}"${v===value?' selected':''}>${l}</option>`).join('');}
  function setMessage(text,error=false){const e=$('#dues-save-status');e.textContent=text;e.classList.toggle('dues-error',error);}
  async function call(path,options={}){
    if(!window.HBACommunity?.isBoard())throw Error('Sign in with a board account to view household dues.');
    return window.HBACommunity.api(path,options);
  }
  async function getSource(){
    if(source)return source;
    try{
      sourcePromise||=fetch('dues-registry-data.json').then(r=>{if(!r.ok)throw Error('Home registry unavailable');return r.json();});
      source=await sourcePromise;
      $('#dues-street').innerHTML='<option value="">All streets</option>'+[...new Set(source.properties.map(p=>p.street))].sort().map(s=>`<option>${esc(s)}</option>`).join('');
      $('#dues-scope-text').textContent=source.scope+' '+source.owner_caution;
      $('#dues-name-count').textContent=`${source.stats.deed_names} home rows have transcribed endpoint grantees; ${source.stats.assessor_leads} retain assessor-name leads pending deed-name confirmation.`;
      setupMarkers();render();return source;
    }catch(e){sourcePromise=null;throw e;}
  }
  async function loadStatuses(){
    const serial=++requestSerial,requestedYear=year;loadedYear=null;loadError='';
    setMessage(`Loading ${year} annotations…`);render();
    try{
      await getSource();const d=await call(`/api/dues/${requestedYear}`);
      if(serial!==requestSerial)return;
      states=new Map(d.rows.map(r=>[r.uid,r]));loadedYear=requestedYear;loadError='';
      setMessage(`${year} annotations loaded. Select Paid, Not paid or Unknown to record a status.`);
    }catch(e){if(serial!==requestSerial)return;loadError=e.message;setMessage('Statuses unavailable; editing disabled. '+e.message+' Use Refresh statuses to retry.',true);}
    render();updateMarkers();
  }
  function dot(s){return L.divIcon({className:'dues-marker',html:`<span class="dues-dot ${s}">${symbols[s]}</span>`,iconSize:[24,24],iconAnchor:[12,12]});}
  function setupMarkers(){
    for(const p of source.properties){
      const feature=PARCELS.features.find(f=>f.properties.uid===p.uid);
      if(!feature)continue;
      const point=L.geoJSON(feature).getBounds().getCenter(),m=L.marker(point,{pane:'duesMarkers',icon:dot('unknown'),title:p.address+' · dues status'});
      m.__hbaMembershipIndex=p.index;
      m.on('click',()=>{m.bindPopup(popup(p),{maxWidth:310}).openPopup();bindPopup(m,p);});
      m.on('popupopen',()=>bindPopup(m,p));m.addTo(group);markers.set(p.uid,m);
    }
    refreshBasePopups();
  }
  function popup(p){
    const s=status(p.uid),can=loadedYear===year&&!pending.has(p.uid);
    return `<div class="dues-popup"><strong>${esc(p.address)}</strong><p>${esc(p.owner_name)}<br><small>${esc(p.owner_label)} · deed ${esc(p.deed_ref)}</small></p><label>${year} dues annotation<select data-dues-popup="${esc(p.uid)}"${can?'':' disabled'}>${options(s.status)}</select></label><p data-dues-popup-msg>${loadedYear===year?'A manual status, not a payment receipt.':'Open registry to load/edit statuses.'}</p><button type="button" data-open-dues="${esc(p.uid)}">Open dues registry</button><button type="button" data-open-history="${p.index}">Property records</button></div>`;
  }
  function bindPopup(m,p){
    const e=m.getPopup()?.getElement(),select=e?.querySelector('[data-dues-popup]');if(!select)return;
    select.onchange=async()=>{select.disabled=true;const ok=await save(p.uid,select.value);select.value=status(p.uid).status;select.disabled=loadedYear!==year;e.querySelector('[data-dues-popup-msg]').textContent=ok?'Status saved in the shared board registry.':'Not saved. Open registry to refresh or retry.';};
  }
  function updateMarkers(){
    const unavailable=loadedYear!==year;
    for(const [uid,m] of markers){const s=unavailable?'unknown':status(uid).status;m.options.title=`${row(uid).address} · ${year} · ${unavailable?'Status not loaded':labels[s]}`;m.setIcon(dot(s));m.getElement()?.setAttribute('aria-label',m.options.title);}
    document.getElementById('dues-map-year').textContent=year+(unavailable?' · not loaded':'');refreshBasePopups();
  }
  const baseContents=new Map();
  function refreshBasePopups(){
    if(!source)return;
    for(const p of source.properties){
      const t=targets[p.index]?.target,popup=t?.getPopup();if(!popup)continue;
      if(!baseContents.has(p.index))baseContents.set(p.index,popup.getContent());
    const s=loadedYear===year?labels[status(p.uid).status]:'Not loaded';
      popup.setContent(`<div class="home-summary"><strong>${esc(p.address)}</strong><p>${esc(p.owner_name)}<br><small>${esc(p.owner_label)}</small></p>${window.HBACommunity?.isBoard()?`<p>${year} dues: <strong>${esc(s)}</strong></p>`:''}<div><button type="button" data-open-history="${p.index}">Property history</button> <button type="button" data-home-memory="${esc(p.uid)}">Household memories</button>${window.HBACommunity?.isBoard()?` <button type="button" data-open-dues="${esc(p.uid)}">Dues status</button>`:''}</div><details><summary>Detailed deed & rights evidence</summary>${baseContents.get(p.index)}</details></div>`);
    }
  }
  function showDots(on){
    on=on&&!!window.HBACommunity?.isBoard();
    $('#dues-show-dots').checked=on;
    const homeToggle=document.getElementById('home-dues-dots');if(homeToggle)homeToggle.checked=on;
    on?group.addTo(map):map.removeLayer(group);key.hidden=!on;
  }
  async function save(uid,value){
    if(loadedYear!==year||pending.has(uid))return false;
    const saveYear=year,old=status(uid);pending.add(uid);setMessage('Saving '+row(uid).address+'…');render();
    try{
      const d=await call(`/api/dues/${saveYear}/${encodeURIComponent(uid)}`,{method:'PUT',body:JSON.stringify({status:value,revision:old.revision})});
      if(year===saveYear){states.set(uid,d);setMessage(`${row(uid).address}: ${labels[d.status]} saved for ${saveYear}.`);}
      return true;
    }catch(e){setMessage('Not saved. '+e.message+' Refresh statuses before retrying.',true);return false;}
    finally{pending.delete(uid);render();updateMarkers();}
  }
  function render(){
    if(!source)return;
    const focused=document.activeElement?.dataset?.duesStatus;
    const q=$('#dues-search').value.trim().toLowerCase(),street=$('#dues-street').value,filter=$('#dues-filter').value,available=loadedYear===year;
    const rows=source.properties.filter(p=>(!q||[p.address,p.owner_name,p.deed_ref,p.pid].join(' ').toLowerCase().includes(q))&&(!street||p.street===street)&&(!filter||available&&status(p.uid).status===filter));
    const OUTSIDE=['BROAD MARSH AVE','SMITH AVE','ALLEN AVE','POINT RD'];// outside the association's current membership area (administrator, October 2026)
    const counts={paid:0,unpaid:0,unknown:0},outside=source.properties.filter(p=>OUTSIDE.includes(p.street)).length;
    source.properties.forEach(p=>{if(!OUTSIDE.includes(p.street))counts[available?status(p.uid).status:'unknown']++;});
    $('#dues-count').textContent=`${rows.length} of ${source.properties.length} mapped home rows (${source.properties.length-outside} on member streets, ${outside} on Broad Marsh, Smith, Allen and Point Road outside current membership) · ${year}: ${available?`${counts.paid} Paid · ${counts.unpaid} Not paid · ${counts.unknown} Unknown on member streets`:'statuses not loaded'}`;
    $('#dues-export').disabled=!available;$('#dues-csv').disabled=!available;
    $('#dues-rows').innerHTML=rows.length?rows.map(p=>{
      const s=status(p.uid),value=available?s.status:'unknown';
      return `<tr data-dues-home="${esc(p.uid)}"><td><strong>${esc(p.address)}</strong><small>Parcel ${esc(p.pid)} · Lot ${esc(p.lot)}</small></td><td>${esc(p.owner_name)}<small class="${p.owner_basis==='assessor_lead'?'dues-unverified':''}">${esc(p.owner_label)}</small><small>Deed ${esc(p.deed_ref)}${p.deed_date?' · '+esc(p.deed_date):''}</small></td><td><div class="dues-status-cell"><span class="dues-dot ${value}" aria-hidden="true">${symbols[value]}</span><select data-dues-status="${esc(p.uid)}" aria-label="${esc(p.address)} dues status"${available&&!pending.has(p.uid)?'':' disabled'}>${options(value)}</select></div><small>${pending.has(p.uid)?'Saving…':s.updated_at?'Updated '+esc(s.updated_at.slice(0,10)):'No payment status recorded'}</small></td><td><div class="dues-row-actions"><button type="button" data-dues-deed="${esc(p.uid)}">Deed</button><button type="button" data-dues-map="${esc(p.uid)}">Map</button></div></td></tr>`;
    }).join(''):'<tr><td colspan="4">No matching homes. Clear the search or filters.</td></tr>';
    $('#dues-rows').querySelectorAll('[data-dues-status]').forEach(e=>e.onchange=()=>save(e.dataset.duesStatus,e.value));
    $('#dues-rows').querySelectorAll('[data-dues-map]').forEach(e=>e.onclick=()=>focusHome(e.dataset.duesMap));
    $('#dues-rows').querySelectorAll('[data-dues-deed]').forEach(e=>e.onclick=()=>openDeed(e.dataset.duesDeed));
    if(focused)$('#dues-rows').querySelector(`[data-dues-status="${CSS.escape(focused)}"]`)?.focus();
  }
  function focusHome(uid){const m=markers.get(uid);if(!m)return;showDots(true);close();map.invalidateSize();map.setView(m.getLatLng(),19);if(innerWidth<700)collapseMobilePanel();m.fire('click');}
  function openDeed(uid){
    const p=row(uid);close();window.openPropertyHistory(p.index,{ref:p.deed_ref});
    document.getElementById('history-dues-back')?.remove();const b=document.createElement('button');b.id='history-dues-back';b.type='button';b.textContent='Back to dues registry';b.onclick=()=>{document.getElementById('history-dialog').close();open('dues');};document.getElementById('history-close').before(b);
  }
  function exportFile(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function sendTheme(){if(ready)frame.contentWindow.postMessage({type:'hba-theme',theme:document.documentElement.dataset.theme||'light'},'*');}
  let planEpoch=0,privatePlanLoaded=false;
  async function loadPrivateCleaning(){
    const epoch=++planEpoch;
    if(!ready||!window.HBACommunity?.isBoard())return;
    try{
      const p=await window.HBACommunity.api('/api/cleaning-plan');
      if(epoch!==planEpoch||!ready||!window.HBACommunity?.isBoard())return;
      frame.contentWindow.postMessage({type:'hba-private-cleaning',annualAmount:p.annual_amount,firstYear:p.first_year},'*');
      privatePlanLoaded=true;
    }catch(e){$('#bb-load').hidden=false;$('#bb-load').textContent='Private cleaning allowance was not loaded: '+e.message;}
  }
  function startFrame(){
    ++planEpoch;privatePlanLoaded=false;
    ready=false;$('#bb-load').hidden=false;$('#bb-load').textContent='Loading budget simulator…';clearTimeout(frameTimer);window.hbaLoadFrame(frame,'board-budget/dashboard.html').catch(e=>{$('#bb-load').textContent='The simulator could not be loaded: '+e.message;});
    frameTimer=setTimeout(()=>{if(ready)return;$('#bb-load').textContent='The simulator did not finish loading. ';const b=document.createElement('button');b.textContent='Retry simulator';b.onclick=startFrame;$('#bb-load').append(b);},15000);
  }
  function select(view){
    if(view==='timeline'&&!window.HBACommunity?.isBoard())view='simulator';
    currentView=view;$('#bb-simulator').hidden=view!=='simulator';$('#bb-dues').hidden=view!=='dues';$('#bb-timeline').hidden=view!=='timeline';
    dialog.querySelectorAll('[data-bb-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.bbView===view)));
    if(view==='timeline'){window.HBAProjectTimeline.render();return;}
    if(view==='simulator'){if(!started){started=true;startFrame();}else sendTheme();}
    else{getSource().then(()=>showDots(true)).catch(e=>setMessage(e.message,true));if(loadedYear!==year)loadStatuses();}
  }
  function open(view='simulator',uid=''){
    if(view==='dues'&&!window.HBACommunity?.isBoard()){window.openHBACommunity();return;}
    lastFocus=document.activeElement;if(!dialog.open)dialog.showModal();select(view);
    if(uid)getSource().then(()=>{$('#dues-search').value=row(uid)?.address||'';$('#dues-street').value='';$('#dues-filter').value='';render();});
  }
  function close(){dialog.close();lastFocus?.focus?.({preventScroll:true});}
  $('#bb-close').onclick=close;dialog.querySelectorAll('[data-bb-view]').forEach(b=>b.onclick=()=>select(b.dataset.bbView));
  for(const mode of ['report','presentation'])$('#bb-'+mode).onclick=()=>{
    const snapshot=ready&&frame.contentWindow?.HBACapitalScenario?.();
    if(!snapshot){$('#bb-export-status').textContent='Wait for the simulator to load, then try again.';return;}
    window.HBABudgetOutputs.openScheduled(snapshot,mode);
    $('#bb-export-status').textContent='Snapshot created from the displayed scenario. Later input changes do not change this snapshot.';
  };
  $('#dues-refresh').onclick=loadStatuses;
  $('#dues-year').onchange=()=>{const n=Number($('#dues-year').value);if(!Number.isInteger(n)||n<2020||n>2100){$('#dues-year').value=year;return;}year=n;states=new Map();$('#dues-import-review').hidden=true;updateMarkers();loadStatuses();};
  ['dues-search','dues-street','dues-filter'].forEach(id=>$('#'+id).addEventListener(id==='dues-search'?'input':'change',render));
  $('#dues-show-dots').onchange=e=>showDots(e.target.checked);
  $('#dues-export').onclick=()=>exportFile(`HBA-dues-${year}.json`,JSON.stringify({app:'hba-dues-registry',version:1,year,rows:source.properties.map(p=>({uid:p.uid,address:p.address,status:status(p.uid).status}))},null,2),'application/json');
  $('#dues-csv').onclick=()=>{
    const cell=x=>{let s=String(x??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    const rows=[['year','address','owner_name','owner_basis','deed_ref','deed_date','selected_status'],...source.properties.map(p=>[year,p.address,p.owner_name,p.owner_label,p.deed_ref,p.deed_date,labels[status(p.uid).status]])];
    exportFile(`HBA-dues-${year}.csv`,rows.map(r=>r.map(cell).join(',')).join('\n'),'text/csv');
  };
  $('#dues-import').onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    try{
      if(loadedYear!==year)throw Error('Load this year’s statuses before restoring a backup.');
      const d=JSON.parse(await f.text());if(d.app!=='hba-dues-registry'||d.year!==year||!Array.isArray(d.rows)||d.rows.length>source.properties.length||new Set(d.rows.map(r=>r.uid)).size!==d.rows.length||d.rows.some(r=>!row(r.uid)||!Object.hasOwn(labels,r.status)))throw Error('Invalid backup or different year. Choose the backup’s dues year first.');
      const review=$('#dues-import-review');review.hidden=false;review.replaceChildren(document.createTextNode(`Restore ${d.rows.length} selected statuses for ${year}? Existing values for these homes will be replaced; names and deed evidence will not change. `));
      const b=document.createElement('button');b.textContent='Apply backup';review.append(b);
      b.onclick=async()=>{b.disabled=true;try{const v=await call(`/api/dues/${year}/import`,{method:'POST',body:JSON.stringify({rows:d.rows.map(r=>({uid:r.uid,status:r.status,revision:status(r.uid).revision}))})});v.rows.forEach(r=>states.set(r.uid,r));review.hidden=true;setMessage('Backup applied.');render();updateMarkers();}catch(err){b.disabled=false;setMessage('Backup not applied. '+err.message,true);}};
    }catch(err){setMessage('Backup not loaded. '+err.message,true);}e.target.value='';
  };
  window.addEventListener('message',e=>{if(e.source===frame.contentWindow&&e.data?.type==='hba-ready'){ready=true;clearTimeout(frameTimer);$('#bb-load').hidden=true;sendTheme();loadPrivateCleaning();}});
  new MutationObserver(sendTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  document.addEventListener('click',e=>{const b=e.target.closest('[data-open-dues]');if(b)open('dues',b.dataset.openDues);const h=e.target.closest('[data-home-memory]');if(h)window.openHBACommunity('households',h.dataset.homeMemory);});
  document.addEventListener('hba-account-change',e=>{
    ++planEpoch;
    if(!e.detail.board&&privatePlanLoaded)startFrame();
    else if(e.detail.board&&ready&&!privatePlanLoaded)loadPrivateCleaning();
    dialog.querySelector('[data-bb-view="dues"]').hidden=!e.detail.board;
    dialog.querySelector('[data-bb-view="timeline"]').hidden=!e.detail.board;
    $('#board-budget-title').textContent=e.detail.board?'Budget & dues':'Budget simulator';
    if(!e.detail.board){states=new Map();loadedYear=null;showDots(false);if(['dues','timeline'].includes(currentView))select('simulator');}
    refreshBasePopups();render();
  });
  document.addEventListener('hba-membership-change',()=>{
    if(map.hasLayer(group))markers.forEach((m,uid)=>{
      if(window.HBAMembership.visible(row(uid)?.index)){if(!map.hasLayer(m))m.addTo(map);}
      else if(map.hasLayer(m))map.removeLayer(m);
    });
  });
  document.addEventListener('hba-dues-receipts-changed',()=>{
    if(window.HBACommunity?.isBoard()&&(loadedYear!==null||map.hasLayer(group)))loadStatuses();
  });
  dialog.querySelector('[data-bb-view="dues"]').hidden=!window.HBACommunity?.isBoard();
  document.getElementById('history-dialog').addEventListener('close',()=>document.getElementById('history-dues-back')?.remove());
  window.openBoardBudget=()=>open('simulator');
  window.openDuesRegistry=uid=>open('dues',uid);
  window.toggleDuesDots=async on=>{if(on&&!window.HBACommunity?.isBoard()){window.openHBACommunity();return;}try{await getSource();if(on&&loadedYear!==year)await loadStatuses();showDots(on);}catch(e){setMessage(e.message,true);}};
  getSource().catch(()=>{});
})();
