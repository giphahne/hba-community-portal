(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const categories={deeds:'Deeds & transfers',permits:'Waterways & permit records',nourishment:'Nourishment decisions',drainage:'Drainage & sampling',plans:'Plans & island context',imagery:'Historical photographs & aerial views',other:'Supporting instruments'};
  let data,promise,view=[],current=0,lastFocus,rendered=false,images=new Map(),scrollTick=false;
  const entry=document.createElement('section');entry.className='history-entry island-history-entry';
  entry.innerHTML='<h2>Island History</h2><p>One documentary history of Hamilton Beach. Scroll through deeds, rights, permits, drainage and nourishment, one recorded event at a time.</p><button type="button" class="history-primary" id="open-island-history">Read the island history</button>';
  const anchor=document.querySelector('.history-entry');if(anchor)anchor.before(entry);else document.getElementById('panel').append(entry);
  const dialog=document.createElement('dialog');dialog.id='island-history-dialog';dialog.setAttribute('aria-labelledby','island-history-title');
  dialog.innerHTML=`<div class="ih-shell"><header class="ih-top"><div><p>Hamilton Beach · Documentary chronology</p><h2 id="island-history-title">One island. A recorded history.</h2></div><button type="button" id="island-history-close">Back to map</button></header><details class="ih-filters" id="ih-filters"><summary>Find an event · filters & date order</summary><div class="ih-filter-grid"><label>Search<input id="ih-search" type="search" placeholder="Owner, street, book/page or event"></label><label>Record type<select id="ih-category"><option value="all">All record types</option>${Object.entries(categories).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>Context<select id="ih-context"><option value="island">Mapped island / Hamilton Beach</option><option value="all">Include surrounding Wareham sites</option></select></label><label>Date order<select id="ih-order"><option value="oldest">Oldest first</option><option value="newest">Newest first</option><option value="unplaced">Unknown / conflicting dates only</option></select></label><label>Jump to year<select id="ih-year"><option value="">Choose a year</option></select></label><label class="ih-unread"><input id="ih-unread" type="checkbox"> Include unreviewed references</label></div></details><p class="ih-scope">A source-backed record chronology, not a complete title chain or proof of current ownership or permit validity. Shared instruments appear once. Uncertain dates stay unplaced; nearby Wareham projects are optional context.</p><div class="ih-reader" id="ih-reader" tabindex="0" aria-label="Scrollable island history"></div><footer class="ih-footer"><button type="button" id="ih-previous">Previous record</button><div><p id="ih-position" role="status">Loading records…</p><small id="ih-date-status"></small></div><button type="button" id="ih-next">Next record</button></footer></div>`;
  document.body.append(dialog);
  const el=id=>document.getElementById(id);
  async function load(){
    if(data)return;
    if(!promise)promise=fetch('island-history.json').then(r=>{if(!r.ok)throw Error('Timeline unavailable');return r.json();}).then(d=>{
      const existing=new Set(d.events.map(e=>e.id));
      for(const r of window.HBATownHistory?.records||[]){
        const id='town-'+r.id;if(existing.has(id))continue;
        d.events.push({id,ref:r.group,category:'permits',context:r.id.startsWith('pinehurst')?'regional':'island',
          title:r.title,date:{key:r.date,year:+r.date.slice(0,4),precision:'day',label:r.date},
          dateOriginal:r.date,dateNote:'Hearing, agenda or notice date; not necessarily permit issuance or construction.',
          summary:r.summary,location:r.location,scope:r.group,review:'Curated agenda/minutes excerpt or transcript-based finding; not a full-file review',
          reviewed:true,images:[],properties:[],notes:[r.status,r.kind],caveat:r.limit,
          sources:[...(r.sources||[]),...(r.videos||[])]});
      }data=d;
    }).catch(e=>{promise=null;throw e;});
    await promise;
  }
  async function open(){
    lastFocus=document.activeElement;
    if(!dialog.open)dialog.showModal();
    try{await load();if(!rendered){el('ih-filters').open=innerWidth>700;render();}else position();}
    catch(e){el('ih-reader').innerHTML='<div class="ih-empty"><h3>The island-history index could not load.</h3><p>The map and individual reports remain available.</p><button type="button" id="ih-retry">Retry loading</button></div>';el('ih-retry').onclick=open;}
  }
  function close(){dialog.close();lastFocus?.focus?.({preventScroll:true});}
  function card(e,n){
    const image=e.images[0],properties=e.properties||[];
    return `<article class="ih-event" data-event-position="${n}" id="ih-event-${n}"><div class="ih-event-inner"><div class="ih-event-date"><span>${esc(e.date?.label||'Date unplaced')}</span><small>${esc(categories[e.category])} · ${e.context==='regional'?'Surrounding-area context':'Mapped island record'}</small></div><h3>${esc(e.title)}</h3><p class="ih-review">${esc(e.review)}</p><p class="ih-summary">${esc(e.summary)}</p>${e.location?`<p class="ih-location">${esc(e.location)}</p>`:''}
      ${image?`<figure class="ih-evidence"><a href="${esc(image)}" target="_blank" rel="noopener" data-event-image-link="${n}"><img loading="lazy" src="${esc(image)}" alt="Attached source image for ${esc(e.ref||e.title)}" data-event-image="${n}"></a><figcaption><span data-image-position="${n}">Attached image 1 of ${e.images.length}</span><span>Research copy; open image to inspect</span></figcaption>${e.images.length>1?`<div class="ih-image-controls"><button type="button" data-image-prev="${n}">Previous image</button><button type="button" data-image-next="${n}">Next image</button></div>`:''}</figure>`:''}
      <p class="ih-caveat">${esc(e.caveat||'Review the original instrument and its parcel-specific scope before drawing a conclusion.')}</p><details class="ih-details"><summary>Read scope, date evidence & detailed notes</summary><p><strong>Date as recorded:</strong> ${esc(e.dateOriginal)}. ${esc(e.dateNote)}</p>${e.scope?`<p><strong>Parcel / site scope:</strong> ${esc(e.scope)}</p>`:''}${(e.notes||[]).map(t=>`<p>${esc(t)}</p>`).join('')}${(e.quotations||[]).map(t=>`<blockquote>${esc(t)}</blockquote>`).join('')}${e.nextRefs?.length?`<p><strong>Cited references, not certified title links:</strong> ${esc(e.nextRefs.join(', '))}</p>`:''}</details>
      <div class="ih-sources">${(e.sources||[]).map(s=>s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`:`<span class="ih-source-plain">${esc(s.label)}</span>`).join('')}</div>${properties.length?`<details class="ih-property-links"><summary>${properties.length} associated property report${properties.length===1?'':'s'}</summary><p>A linked report is context, not proof that every clause applies to that property.</p>${properties.map(p=>`<button type="button" data-ih-property="${p.index}" data-ih-ref="${esc(e.ref)}">${esc(p.address)}${p.lot?' · Lot '+esc(p.lot):''}</button>`).join('')}</details>`:''}${e.nourishSite?`<button type="button" data-ih-nourishment="${e.nourishSite}">Open nourishment decision register</button>`:''}</div></article>`;
  }
  function render(){
    rendered=true;images.clear();current=0;
    const q=el('ih-search').value.trim().toLowerCase(),kind=el('ih-category').value,context=el('ih-context').value,order=el('ih-order').value,unread=el('ih-unread').checked;
    view=data.events.filter(e=>(unread||e.reviewed)&&(kind==='all'||e.category===kind)&&(context==='all'||e.context==='island')&&(order!=='unplaced'||!e.date)&&(!q||[e.ref,e.title,e.summary,e.location,e.scope,...(e.notes||[])].join(' ').toLowerCase().includes(q)));
    view.sort((a,b)=>{if(!a.date&&!b.date)return a.title.localeCompare(b.title);if(!a.date)return 1;if(!b.date)return -1;return (order==='newest'?-1:1)*a.date.key.localeCompare(b.date.key)||a.title.localeCompare(b.title);});
    el('ih-year').innerHTML='<option value="">Choose a year</option>'+[...new Set(view.filter(e=>e.date).map(e=>e.date.year))].sort((a,b)=>order==='newest'?b-a:a-b).map(y=>`<option value="${y}">${y}</option>`).join('');
    el('ih-reader').innerHTML=view.length?view.map(card).join(''):'<div class="ih-empty"><h3>No records match this view.</h3><p>Clear the search or change the record type and context filters.</p></div>';
    el('ih-reader').scrollTop=0;
    el('ih-reader').querySelectorAll('[data-ih-property]').forEach(b=>b.onclick=()=>{dialog.close();window.openPropertyHistory(+b.dataset.ihProperty,{ref:b.dataset.ihRef,returnToIsland:true});});
    el('ih-reader').querySelectorAll('[data-ih-nourishment]').forEach(b=>b.onclick=()=>{
      dialog.close();window.openNourishmentRecords(b.dataset.ihNourishment,{resetFilters:true});
      const old=document.getElementById('nourishment-island-back');old?.remove();
      const back=document.createElement('button');back.id='nourishment-island-back';back.type='button';back.textContent='Back to island history';back.onclick=()=>{document.getElementById('nourishment-dialog').close();open();};document.querySelector('#nourishment-dialog .nourish-content').prepend(back);
    });
    for(const img of el('ih-reader').querySelectorAll('img'))img.onerror=()=>{img.hidden=true;const p=document.createElement('p');p.className='ih-image-error';p.textContent='This attached image could not load. Use the original source or property report below.';img.parentElement.append(p);};
    el('ih-reader').querySelectorAll('[data-image-prev],[data-image-next]').forEach(b=>b.onclick=()=>changeImage(+(b.dataset.imagePrev??b.dataset.imageNext),b.hasAttribute('data-image-prev')?-1:1));
    position();
  }
  function changeImage(n,delta){
    const e=view[n],index=((images.get(n)||0)+delta+e.images.length)%e.images.length;images.set(n,index);
    const img=el('ih-reader').querySelector(`[data-event-image="${n}"]`);img.hidden=false;img.parentElement.querySelector('.ih-image-error')?.remove();img.src=e.images[index];
    el('ih-reader').querySelector(`[data-event-image-link="${n}"]`).href=e.images[index];
    el('ih-reader').querySelector(`[data-image-position="${n}"]`).textContent=`Attached image ${index+1} of ${e.images.length}`;
  }
  function position(){
    el('ih-position').textContent=view.length?`Record ${current+1} of ${view.length}`:'0 records shown';
    el('ih-date-status').textContent=view[current]?.date?.label|| (view.length?'Unplaced date':'Change the filters to continue');
    el('ih-previous').disabled=!view.length||current===0;
    el('ih-next').disabled=!view.length||current===view.length-1;
  }
  function go(n){
    if(!view.length)return;
    current=Math.max(0,Math.min(view.length-1,n));
    const card=el('ih-reader').querySelector(`[data-event-position="${current}"]`);
    el('ih-reader').scrollTo({top:card.offsetTop,behavior:'instant'});position();
  }
  el('ih-reader').addEventListener('scroll',()=>{
    if(scrollTick)return;scrollTick=true;
    requestAnimationFrame(()=>{scrollTick=false;const top=el('ih-reader').getBoundingClientRect().top;const cards=el('ih-reader').querySelectorAll('.ih-event');for(let n=0;n<cards.length;n++)if(cards[n].getBoundingClientRect().bottom>top+60){current=n;break;}position();});
  },{passive:true});
  el('ih-reader').addEventListener('keydown',e=>{if(e.target!==el('ih-reader'))return;if(e.key==='ArrowRight'){e.preventDefault();go(current+1);}if(e.key==='ArrowLeft'){e.preventDefault();go(current-1);}});
  el('ih-previous').onclick=()=>go(current-1);el('ih-next').onclick=()=>go(current+1);
  el('ih-year').onchange=e=>{const n=view.findIndex(r=>r.date?.year===+e.target.value);if(n>=0)go(n);};
  ['ih-category','ih-context','ih-order','ih-unread'].forEach(id=>el(id).onchange=render);
  el('ih-search').oninput=render;
  el('island-history-close').onclick=close;el('open-island-history').onclick=open;
  dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
  window.openIslandHistory=open;
})();
