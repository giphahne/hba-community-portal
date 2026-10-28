(() => {
  'use strict';
  const d=NOURISHMENT,esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statuses={approved:"Approval / determination",extension:"Extension",enforcement:"Enforcement / not authorized",unknown:"Unresolved application / agenda"};
  const sites=new Map(d.sites.map(s=>[s.id,s])),markers=new Map();
  let selected='all',filter='all',query='',lastFocus;
  const entry=document.createElement('section');entry.className='history-entry nourishment-entry';
  entry.innerHTML='<h2>Beach nourishment permits</h2><p>Wareham-wide records from your other chat, with source minutes, restrictions and approximate locations.</p><label class="nourish-layer"><input type="checkbox" id="nourish-layer" checked> Show nourishment location markers</label><div class="nourish-actions"><button type="button" id="open-nourishment">Browse 12 records</button><button type="button" id="nourish-all">View all locations</button><button type="button" id="nourish-hamilton">Return to Hamilton Beach</button></div><p>7 approximate mapped sites · 1 unmapped lead. Pins are address references, not approved sand-placement boundaries.</p>';
  const anchor=document.querySelector('.sand-school-entry');if(anchor)anchor.after(entry);else document.getElementById('panel').append(entry);
  const dialog=document.createElement('dialog');dialog.id='nourishment-dialog';dialog.setAttribute('aria-labelledby','nourishment-title');
  dialog.innerHTML=`<div class="nourish-shell"><header class="nourish-top"><div><p>Permit evidence · Reviewed ${d.reviewed}</p><h2 id="nourishment-title">Beach nourishment records</h2></div><button type="button" id="nourishment-close">Back to map</button></header><div class="nourish-controls"><label>Search<input id="nourishment-search" type="search" placeholder="Address, applicant, file or condition"></label><label>Status<select id="nourishment-status"><option value="all">All record types</option>${Object.entries(statuses).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>Location<select id="nourishment-site"><option value="all">All locations</option>${d.sites.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label></div><div class="nourish-content"><p class="nourish-scope">${esc(d.scope)}</p><p class="nourish-scope">No outright nourishment denial is established by this collection. Negative RDA determinations are not rejections; the enforcement case is not an approved nourishment project. Multiple decisions at one site stay separate, including the Pinehurst amendment and extension of the same file.</p><p id="nourish-count" role="status"></p><div id="nourish-records"></div></div></div>`;
  document.body.append(dialog);
  map.createPane('nourishment');map.getPane('nourishment').style.zIndex=650;
  const group=L.layerGroup().addTo(map);
  const checkbox=document.getElementById('nourish-layer');
  function enable(){checkbox.checked=true;group.addTo(map);}
  function focus(siteId){
    const s=sites.get(siteId);if(!s||s.lat===null)return;
    enable();dialog.close();map.invalidateSize({pan:false});map.setView([s.lat,s.lng],17,{animate:false});
    if(innerWidth<700&&!document.querySelector('.panel').classList.contains('collapsed'))document.querySelector('.collapse-btn')?.click();
    markers.get(siteId).openPopup();
  }
  function open(site='all',options={}){
    if(options.resetFilters){filter='all';query='';document.getElementById('nourishment-status').value='all';document.getElementById('nourishment-search').value='';}
    lastFocus=document.activeElement;selected=site;document.getElementById('nourishment-site').value=site;
    if(!dialog.open)dialog.showModal();render();
  }
  function close(){dialog.close();lastFocus?.focus?.({preventScroll:true});}
  function card(r){
    const s=sites.get(r.site);
    return `<article class="nourish-record" data-nourish-id="${esc(r.id)}"><div class="nourish-record-heading"><div><span class="nourish-badge ${r.status}">${esc(statuses[r.status])}</span><h3>${esc(s.name)}</h3><p>${esc(r.applicant)} · ${esc(r.file)}</p></div><span class="nourish-date">${esc(r.date)}</span></div><p><strong>Record type:</strong> ${esc(r.kind)}. <strong>Vote:</strong> ${esc(r.vote)}.</p><p><strong>Location:</strong> ${esc(s.address)}.</p><p><strong>Request:</strong> ${esc(r.request)}</p><p><strong>Conditions / restrictions:</strong> ${esc(r.conditions)}</p><p><strong>Decision context:</strong> ${esc(r.reason)}</p><p class="nourish-limit"><strong>Limits:</strong> ${esc(r.limits)}</p><details><summary>Location accuracy and source records</summary><p>${esc(s.location)} <a href="${esc(s.locationSource)}" target="_blank" rel="noopener">Location provenance</a></p><ul>${r.sources.map(src=>`<li><a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.label)}</a>${src.local?` · <a href="${esc(src.local)}" target="_blank" rel="noopener">Saved source PDF</a>`:''}</li>`).join('')}</ul></details>${s.lat===null?'<p class="nourish-unmapped">Unmapped lead: no verified location to display.</p>':`<button type="button" data-nourish-focus="${s.id}">View approximate location on map</button>`}</article>`;
  }
  function render(){
    const records=d.records.filter(r=>(selected==='all'||r.site===selected)&&(filter==='all'||r.status===filter)&&(!query||[...Object.values(r).filter(v=>typeof v==='string'),sites.get(r.site).name,sites.get(r.site).address].join(' ').toLowerCase().includes(query)));
    document.getElementById('nourish-count').textContent=`${records.length} of ${d.records.length} records shown. Date is the decision/hearing date, or review date for the current application listing.`;
    document.getElementById('nourish-records').innerHTML=records.length?records.map(card).join(''):'<p class="nourish-empty">No records match. Clear the search or choose all locations and record types.</p>';
    document.querySelectorAll('[data-nourish-focus]').forEach(b=>b.onclick=()=>focus(b.dataset.nourishFocus));
  }
  for(const s of d.sites.filter(s=>s.lat!==null)){
    const records=d.records.filter(r=>r.site===s.id);
    const marker=L.marker([s.lat,s.lng],{pane:'nourishment',title:`Nourishment records · ${s.name}`,icon:L.divIcon({className:'nourish-marker',html:'<span>N</span>',iconSize:[32,32],iconAnchor:[16,16]})}).addTo(group);
    marker.bindPopup(`<div class="nourish-popup"><h3>${esc(s.name)}</h3><p>${esc(s.address)}</p><p>${esc(s.location)}</p><p>${records.length} associated record${records.length===1?'':'s'}:</p><ul>${records.map(r=>`<li>${esc(r.date)} · ${esc(r.file)} · ${esc(statuses[r.status])}</li>`).join('')}</ul><button type="button" data-nourish-open="${s.id}">Read decisions, conditions & sources</button></div>`,{maxWidth:360,autoPanPaddingTopLeft:L.point(innerWidth>700?420:15,80),autoPanPaddingBottomRight:L.point(20,20)});
    marker.on('popupopen',e=>{
      e.popup.options.maxWidth=Math.min(360,innerWidth-80);
      e.popup.options.maxHeight=Math.min(480,innerHeight-180);
      e.popup.options.autoPanPaddingTopLeft=L.point(innerWidth>700?420:15,80);
      e.popup.update();
      e.popup.getElement().querySelector('[data-nourish-open]').onclick=()=>{filter='all';query='';document.getElementById('nourishment-status').value='all';document.getElementById('nourishment-search').value='';open(s.id);};
    });
    markers.set(s.id,marker);
  }
  checkbox.onchange=()=>{if(checkbox.checked)group.addTo(map);else map.removeLayer(group);};
  document.getElementById('open-nourishment').onclick=()=>open();
  document.getElementById('nourishment-close').onclick=close;
  dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
  document.getElementById('nourishment-search').oninput=e=>{query=e.target.value.trim().toLowerCase();render();};
  document.getElementById('nourishment-status').onchange=e=>{filter=e.target.value;render();};
  document.getElementById('nourishment-site').onchange=e=>{selected=e.target.value;render();};
  document.getElementById('nourish-all').onclick=()=>{enable();map.invalidateSize({pan:false});map.fitBounds(L.latLngBounds([...markers.values()].map(m=>m.getLatLng())),{paddingTopLeft:[innerWidth>700?430:30,90],paddingBottomRight:[40,40],maxZoom:14});if(innerWidth<700&&!document.querySelector('.panel').classList.contains('collapsed'))document.querySelector('.collapse-btn')?.click();};
  document.getElementById('nourish-hamilton').onclick=()=>{map.closePopup();map.invalidateSize({pan:false});map.fitBounds(L.geoJSON(PARCELS).getBounds(),{paddingTopLeft:[innerWidth>700?430:25,75],paddingBottomRight:[25,25]});};
  window.openNourishmentRecords=open;
})();
