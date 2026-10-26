(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const records=[
    {id:'DPW003102',name:'Olive Green pier, jetties & sand replacement',pdf:'ch91/DPW003102-user-supplied.pdf',plan:5,status:'Unmapped · modern parcel unresolved',note:CH91_GREEN_HISTORY.detail},
    {id:'DEP005655',name:'Pirolli seawall & stone erosion barrier',parcel:33,pdf:'ch91/DEP005655.pdf',plan:6,status:'Strong historical lot match · parcel reference only',note:CH91_SUPPLIED.find(d=>d.id==='DEP005655').detail},
    {id:'NOI-2020-PLAN',name:'1A Worrall groin & deck repair plan',parcel:80,pdf:'ch91/NOI-Plan-JETTI-6-25-20.pdf',plan:1,status:'Confirmed address/locus · application plan, not approval',note:CH91_SUPPLIED.find(d=>d.id==='NOI-2020-PLAN').detail},
    {id:'DPW003146',name:'HBA five-jetty historical license',parcel:70,candidate:true,pdf:'ch91/DPW003146.pdf',plan:5,status:'Candidate Association parcel · five footprints unresolved',note:CH91_SUPPLIED.find(d=>d.id==='DPW003146').detail},
    {id:'DPW003540',name:'Dorothy Day seawall, riprap & jetty',parcel:63,pdf:'ch91/DPW003540.pdf',plan:5,status:'Strong historical lot match · parcel reference only',note:CH91_SUPPLIED.find(d=>d.id==='DPW003540').detail},
    {id:'DPW003455',name:'Besse ditch filling & drainage conditions',pdf:'ch91/DPW003455.pdf',plan:5,status:'Unmapped · modern parcel unresolved',note:CH91_SUPPLIED.find(d=>d.id==='DPW003455').detail}
  ];
  const markers=new Map(),group=L.layerGroup();
  let showMarkers=true;
  function syncLayer(){if(showMarkers&&map.getZoom()>=17)group.addTo(map);else{group.eachLayer(l=>l.closePopup());map.removeLayer(group);}}
  map.on('zoomend',syncLayer);
  function sizePopup(popup){
    popup.options.maxWidth=Math.min(360,innerWidth-65);
    popup.options.maxHeight=Math.min(400,innerHeight-220);
    popup.options.autoPanPaddingTopLeft=L.point(12,innerWidth<=640?85:12);
    popup.options.autoPanPaddingBottomRight=L.point(12,12);
    popup.update();
  }
  let priorFocus;
  const dialog=document.createElement('dialog');
  dialog.id='ch91-landmark-dialog';dialog.setAttribute('aria-labelledby','ch91-landmark-title');
  dialog.innerHTML=`<div class="c91-shell"><header><div><p>Six supplied records · attachments checked October 17, 2026</p><h2 id="ch91-landmark-title">Chapter 91 landmarks & plans</h2></div><button type="button" data-c91-close>Back to map</button></header><div class="c91-scroll"><p>Four parcel-reference markers: two strong historical lot matches, one confirmed address/locus and one candidate Association parcel. Two records remain unpinned. Markers are not surveyed structures, title findings or certification of present permit validity. The 2020 NOI plan is an application, not an issued Chapter 91 approval.</p><label class="c91-switch"><input id="c91-landmark-layer" type="checkbox" checked> Show four qualified parcel-reference markers</label><div class="c91-records">${records.map(r=>`<article id="c91-record-${r.id}" data-c91-record="${r.id}"><p class="c91-status">${esc(r.status)}</p><h3>${esc(r.name)}</h3><p class="c91-id">${r.id}</p><a href="${r.pdf}#page=${r.plan}" target="_blank" rel="noopener" aria-label="Open ${r.id} plan page ${r.plan}"><img src="ch91/previews/${r.id}.jpg" alt="${esc(r.name)}: supplied plan, PDF page ${r.plan}" width="800" height="600" loading="lazy"></a><p>${esc(r.note)}</p><div class="c91-actions"><a href="${r.pdf}" target="_blank" rel="noopener">Open attached PDF</a><a href="${r.pdf}#page=${r.plan}" target="_blank" rel="noopener">Plan page ${r.plan}</a><a href="${r.pdf}" download>Download PDF</a>${r.parcel!==undefined?`<button type="button" data-c91-focus="${r.id}">${r.candidate?'View candidate parcel':'View parcel location'}</button>`:'<span>Location unresolved: no guessed pin</span>'}</div><details><summary>Location evidence and limitations</summary><p>${esc(CH91_VERIFICATION[r.id]?.match|| (r.id==='NOI-2020-PLAN'?CH91_VERIFICATION.DEP005305.match:'The historical plan has not been reconciled to a current mapped parcel.'))}</p><p>Source: your supplied PDF, reattached October 17, 2026. ${r.candidate?'The marker uses a representative boundary vertex of the candidate Association parcel, not the location of any of the five jetties.':'Mapped markers use the matched parcel bounds center, not a structure footprint.'} ${r.parcel===undefined?'No coordinate is assigned to this record.':''}</p></details></article>`).join('')}</div></div></div>`;
  document.body.append(dialog);
  const close=()=>{dialog.close();priorFocus?.focus?.();};
  dialog.querySelector('[data-c91-close]').onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  function open(id){
    priorFocus=document.activeElement;
    if(!dialog.open)dialog.showModal();
    const scroll=dialog.querySelector('.c91-scroll');
    scroll.scrollTop=0;
    if(id)dialog.querySelector('#c91-record-'+id)?.scrollIntoView({block:'start'});
  }
  function enable(){showMarkers=true;document.getElementById('c91-landmark-layer').checked=true;syncLayer();}
  function focus(id){
    const marker=markers.get(id);if(!marker)return;
    dialog.close();enable();
    if(matchMedia('(max-width:640px)').matches&&!document.getElementById('panel').classList.contains('collapsed'))document.getElementById('toggle').click();
    map.setView(marker.getLatLng(),18,{animate:false});marker.openPopup();
  }
  for(const r of records.filter(r=>r.parcel!==undefined)){
    const parcel=PARCELS.features.find(f=>f.properties.audit_index===r.parcel);
    if(!parcel)throw Error('Missing landmark parcel '+r.parcel);
    const coordinates=r.candidate?L.latLng(parcel.geometry.coordinates[0][0][1],parcel.geometry.coordinates[0][0][0]):L.geoJSON(parcel).getBounds().getCenter();
    const marker=L.marker(coordinates,{pane:'ch91',title:r.id+' · '+r.status,icon:L.divIcon({className:'c91-landmark-marker'+(r.candidate?' candidate':''),html:`<span>${r.candidate?'91?':r.id==='NOI-2020-PLAN'?'NOI':r.id.replace(/\D/g,'').replace(/^0+/,'')}</span>`,iconSize:[46,44],iconAnchor:[23,22]})}).addTo(group);
    marker.bindTooltip(r.name+' · '+r.status);
    const popup=document.createElement('div');popup.className='c91-landmark-popup';
    popup.innerHTML=`<h3>${esc(r.name)}</h3><p><strong>${esc(r.status)}</strong></p><p>${esc(r.candidate?'Representative point on candidate Association parcel 50F/1049; not any individual jetty location.':'Parcel-reference point only; no surveyed structure footprint inferred.')}</p><p>${esc(r.note)}</p><p><a href="${r.pdf}" target="_blank" rel="noopener">Open attached PDF</a> · <a href="${r.pdf}#page=${r.plan}" target="_blank" rel="noopener">View plan</a></p><button type="button">All six records & attachments</button>`;
    popup.querySelector('button').onclick=()=>{map.closePopup();open(r.id);};
    marker.bindPopup(popup,{maxWidth:innerWidth<=640?270:360,maxHeight:innerWidth<=640?280:400});
    marker.on('popupopen',()=>sizePopup(marker.getPopup()));
    markers.set(r.id,marker);
  }
  let resizeFrame;
  window.addEventListener('resize',()=>{
    cancelAnimationFrame(resizeFrame);
    resizeFrame=requestAnimationFrame(()=>{
      map.invalidateSize({pan:false});
      for(const marker of markers.values()){
        const popup=marker.getPopup();
        if(map.hasLayer(popup)){map.setView(marker.getLatLng(),map.getZoom(),{animate:false});sizePopup(popup);}
      }
    });
  });
  dialog.querySelectorAll('[data-c91-focus]').forEach(b=>b.onclick=()=>focus(b.dataset.c91Focus));
  document.getElementById('c91-landmark-layer').parentElement.append(document.createTextNode(' · Visible when zoomed in to neighborhood detail.'));
  document.getElementById('c91-landmark-layer').onchange=e=>{showMarkers=e.target.checked;syncLayer();};
  dialog.querySelectorAll('img').forEach(img=>img.onerror=()=>{const p=document.createElement('p');p.textContent='Plan preview unavailable. Open the attached PDF to view the original.';img.replaceWith(p);});
  const button=document.createElement('button');button.type='button';button.id='open-ch91-landmarks';button.textContent='Chapter 91 landmarks & attached plans';button.onclick=()=>open();
  document.getElementById('ch91-heading').after(button);
  const permitsButton=document.createElement('button');permitsButton.type='button';permitsButton.id='nourish-ch91-landmarks';permitsButton.textContent='Chapter 91 landmarks & plans';permitsButton.onclick=()=>{document.getElementById('nourishment-dialog').close();open();};
  document.querySelector('.nourish-top').append(permitsButton);
  document.getElementById('search').addEventListener('input',e=>{
    const q=e.target.value.trim().toLowerCase();if(!q)return;
    for(const r of records.filter(r=>[r.id,r.name,r.status].join(' ').toLowerCase().includes(q))){
      const b=document.createElement('button');b.type='button';b.textContent=r.name+' · landmark & attachment';b.onclick=()=>r.parcel!==undefined?focus(r.id):open(r.id);document.getElementById('search-results').prepend(b);
    }
  });
  window.openChapter91Landmarks=open;
})();
