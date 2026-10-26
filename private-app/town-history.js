(() => {
  'use strict';
  const d=window.HBATownHistory,esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let mode='hamilton',query='',focusBefore;
  const dialog=document.createElement('dialog');dialog.id='town-history-dialog';dialog.setAttribute('aria-labelledby','town-history-title');
  dialog.innerHTML=`<div class="town-shell"><header><div><p>Collected public evidence · reviewed ${d.reviewed}</p><h2 id="town-history-title">Hamilton Beach permit history</h2></div><button type="button" id="town-close">Back to map</button></header><div class="town-controls"><label>Collection<select id="town-mode"><option value="hamilton">Hamilton Beach permit history</option><option value="all">All collected town events</option><option value="jetties">Wareham jetties & groins</option></select></label><label>Search<input id="town-search" type="search" placeholder="Street, file, project or year"></label></div><div class="town-scroll"><p>Applications, hearings and decisions stay separate. These are collected records, not a complete inventory of all permits or a roster of everyone who has built a jetty.</p><details id="town-coverage"><summary>What was searched & what remains unverified</summary><ul>${d.coverage.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p><a href="https://www.wareham.gov/AgendaCenter" target="_blank" rel="noopener">Official town agendas & minutes</a> · <a href="https://www.wareham.gov/Archive.aspx" target="_blank" rel="noopener">Town archive</a></p></details><label><input id="town-map-layer" type="checkbox"> Show qualified town-record map references</label><p id="town-count" role="status"></p><div id="town-records"></div></div></div>`;
  document.body.append(dialog);
  const $=s=>dialog.querySelector(s),markers=new Map(),group=L.layerGroup();
  const sources=r=>`<div class="town-links">${(r.sources||[]).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join('')}${(r.videos||[]).map(v=>`<a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.label)} · watch meeting</a>`).join('')}${r.pdf?`<a href="${esc(r.pdf)}" target="_blank" rel="noopener">Read supplied license / plan PDF</a>`:''}</div>`;
  const card=r=>`<article id="town-${esc(r.id)}" class="town-record"><p class="town-meta">${esc(r.date||'Historical record')} · ${esc(r.kind||'Jetty / groin research')}</p><h3>${esc(r.title)}</h3>${r.status?`<p class="town-status">${esc(r.status)}</p>`:''}<p>${esc(r.location)}</p><p>${esc(r.summary)}</p>${r.limit?`<p class="town-limit">${esc(r.limit)}</p>`:''}${sources(r)}${r.videos?.length?'<p class="town-meta">Transcript-based locator; verify names and action in the recording and signed record.</p>':''}${r.recordIds?`<details><summary>Related hearings, decisions & sources</summary>${r.recordIds.map(id=>card(d.records.find(x=>x.id===id))).join('')}</details>`:''}${markers.has(r.id)?`<button type="button" data-town-map="${esc(r.id)}">${r.candidate?'View candidate parcel reference':'View qualified location reference'}</button>`:'<p class="town-meta">No verified structure footprint assigned.</p>'}</article>`;
  function render(){
    const all=mode==='jetties'?d.jettyRecords:d.records.filter(r=>mode==='all'||!r.id.startsWith('pinehurst'));
    const rows=all.filter(r=>!query||JSON.stringify(r).toLowerCase().includes(query));
    $('#town-history-title').textContent=mode==='jetties'?'Wareham jetties & groins':mode==='all'?'Town records & meeting history':'Hamilton Beach permit history';
    $('#town-count').textContent=`${rows.length} of ${all.length} collected records shown.`;
    $('#town-records').innerHTML=rows.length?rows.map(card).join(''):'<p>No collected records match. This does not mean no permit or project exists.</p>';
    $('#town-records').querySelectorAll('[data-town-map]').forEach(b=>b.onclick=()=>{
      const marker=markers.get(b.dataset.townMap);dialog.close();$('#town-map-layer').checked=true;group.addTo(map);
      if(innerWidth<700&&!document.getElementById('panel').classList.contains('collapsed'))document.getElementById('toggle').click();
      map.setView(marker.getLatLng(),17,{animate:false});marker.openPopup();
    });
  }
  for(const r of [...d.records,...d.jettyRecords]){
    let point;
    if(r.parcel!==undefined){
      const f=PARCELS.features.find(f=>f.properties.audit_index===r.parcel);
      if(f)point=r.candidate?L.latLng(f.geometry.coordinates[0][0][1],f.geometry.coordinates[0][0][0]):L.geoJSON(f).getBounds().getCenter();
    }else if(r.site){
      const s=NOURISHMENT.sites.find(s=>s.id===r.site);if(s?.lat!==null&&s?.lat!==undefined)point=[s.lat,s.lng];
    }
    if(!point)continue;
    const marker=L.marker(point,{title:r.title+' · location reference only',icon:L.divIcon({className:'town-map-marker',html:'<span>T</span>',iconSize:[28,28]})});
    const popup=document.createElement('div');popup.className='town-popup';popup.innerHTML=`<h3>${esc(r.title)}</h3><p>${esc(r.location)}</p><p>Parcel / address reference only. Not a surveyed structure or permit boundary.</p><button type="button">Read evidence & meeting clips</button>`;
    popup.querySelector('button').onclick=()=>{map.closePopup();open(r.jetty||d.jettyRecords.includes(r)?'jetties':'hamilton');$('#town-search').value='';query='';render();$('#town-'+r.id)?.scrollIntoView({block:'start'});};
    marker.bindPopup(popup,{maxWidth:280,maxHeight:260});marker.addTo(group);markers.set(r.id,marker);
  }
  function open(collection='hamilton'){focusBefore=document.activeElement;mode=collection;query='';$('#town-mode').value=mode;$('#town-search').value='';render();if(!dialog.open)dialog.showModal();$('.town-scroll').scrollTop=0;}
  const close=()=>{dialog.close();focusBefore?.focus?.();};
  $('#town-close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  $('#town-mode').onchange=e=>{mode=e.target.value;render();};$('#town-search').oninput=e=>{query=e.target.value.trim().toLowerCase();render();};
  $('#town-map-layer').onchange=e=>e.target.checked?group.addTo(map):map.removeLayer(group);
  window.openHBATownHistory=open;
})();
