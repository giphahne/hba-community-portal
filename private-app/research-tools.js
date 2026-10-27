(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const canonical=r=>String(r).replace(/^(\d+)\/0+(\d+)$/,'$1/$2');
  const link=(url,label)=>url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`:'';
  function dated(i){
    const s=String(i.date||i.executed_date||''),m=s.match(/^(\d{4})-(\d\d)-(\d\d)|^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if(m)return m[1]?Date.UTC(+m[1],+m[2]-1,+m[3]):Date.UTC(+m[6],+m[4]-1,+m[5]);
    const y=s.match(/^(\d{4})$/);return y?Date.UTC(+y[1],0,1):null;
  }
  function lane(i){
    const type=i.doc_type||'',t=type+' '+(i.transfer||'')+' '+(i.quote||'');
    const conveyance=/deed|conveyance|transfer/i.test(type);
    if((/certificate|declaration|homestead|notice|authorization/i.test(type)||(!conveyance&&/mortgage|judgment|decree|easement|taking|assignment of tax/i.test(type)))&&!/foreclosure deed/i.test(type))return 'Supporting / other interests';
    if(/life estate|life owner|remainder|undivided|one.half|partial interest|half interest/i.test(t))return 'Partial interests / life estates';
    if(/trust|trustee/i.test(t))return 'Trust / capacity transfers';
    return 'Conveyance evidence';
  }
  window.renderPropertyTimeline=(container,p,jump)=>{
    const active=p.instruments.filter(i=>i.role!=='Rejected / unrelated'),rejected=p.instruments.filter(i=>i.role==='Rejected / unrelated');
    const known=new Map(active.map(i=>[canonical(i.ref),i])),wrong=new Set(rejected.map(i=>canonical(i.ref)));
    const datedDocs=active.filter(i=>dated(i)!==null).sort((a,b)=>dated(a)-dated(b)),undated=active.filter(i=>dated(i)===null);
    function card(i){
      const leads=[...new Set((i.next_refs||[]).map(canonical))].filter(r=>/^\d+\/\d+$/.test(r)&&!['2/640','3/511'].includes(r)&&!wrong.has(r));
      return `<article class="rt-node"><div class="rt-node-date">${esc(i.date||i.executed_date||'Date unverified')}<span>${esc(lane(i))}</span></div><div class="rt-node-body">
        <h4>${esc(window.describeHBADeed(i).label)} <span class="rt-badge">Book/page ${esc(i.ref)}</span></h4><p>${esc(window.describeHBADeed(i).meaning)}</p>
        <p>${esc(i.transfer||'Parties or transfer not transcribed in this ledger; read the instrument.')}</p>
        <p class="rt-muted">Parcel: ${esc(i.lot_match||'Exact lot match remains unverified')}</p>
        <p class="rt-muted">${esc(i.review_status)} · ${i.pages_read||0} subject pages recorded as read · ${i.scans.length} attached images</p>
        ${i.scans[0]?`<button class="rt-document-open" type="button" data-timeline-ref="${esc(i.ref)}"><img loading="lazy" src="${esc(i.scans[0])}" alt="First attached scan for ${esc(i.ref)}"><span>Read instrument & all screenshots</span></button>`:`<button type="button" data-timeline-ref="${esc(i.ref)}">Read instrument notes</button>`}
        ${leads.length?`<div class="rt-citations"><strong>Cited references, not certified title links</strong>${leads.map(r=>known.has(r)?`<button type="button" data-timeline-ref="${esc(known.get(r).ref)}">${esc(r)} · evidence attached</button>`:`<span class="rt-gap-chip">${esc(r)} · review / continuity gap</span>`).join('')}</div>`:'<p class="rt-muted">No numerical next-title citation recorded. Intervening transfers remain unproved.</p>'}
        <details><summary>Scope, quotation & review notes</summary>${i.quote?`<blockquote>${esc(i.quote)}</blockquote>`:''}<p>${esc(i.notes)}</p><p>${esc(i.provenance)}</p>${link(i.source_url,'Registry provenance')}</details>
      </div></article>`;
    }
    container.innerHTML=`<section class="rt-timeline"><div class="rt-section-heading"><h4>Document chronology</h4><p>A visual index of the attached evidence, not a certified chain of ownership. Date order does not prove that one owner conveyed to the next; only recorded citations are shown as links.</p></div>
      <div class="rt-lane-key"><span>Conveyances</span><span>Partial interests / life estates</span><span>Trust / capacity transfers</span><span>Supporting records</span></div>
      <p class="rt-muted">Interest labels come from the recorded instrument type and transcribed parties. They do not allocate untranscribed fractional shares. Multi-lot scope stays with each instrument.</p>
      <label class="rt-timeline-order">Timeline view<select id="timeline-order"><option value="chronological">Chronological evidence</option><option value="interests">Separate interest categories</option></select></label><div id="timeline-records"></div>
      ${rejected.length?`<details class="rt-excluded"><summary>${rejected.length} rejected / unrelated records excluded from this timeline</summary>${rejected.map(i=>`<p><strong>${esc(i.ref)}</strong>: ${esc(i.lot_match)} ${esc(i.notes)}</p>`).join('')}</details>`:''}
      <p class="rt-final-note">Missing intervals, later transfers, probate and frontage-specific roadbed title remain open. An original developer deed does not establish a complete history.</p></section>`;
    const renderNodes=()=>{
      const section=(docs,title)=>`<section>${title?`<h4 class="rt-undated">${esc(title)}</h4>`:''}${docs.filter(i=>dated(i)!==null).map(card).join('')}${docs.some(i=>dated(i)===null)?`<h4 class="rt-undated">Date unverified: not placed in chronological order</h4>${docs.filter(i=>dated(i)===null).map(card).join('')}`:''}</section>`;
      const records=container.querySelector('#timeline-records'),view=container.querySelector('#timeline-order').value;
      const all=[...datedDocs,...undated];
      records.innerHTML=all.length?(view==='interests'?['Conveyance evidence','Partial interests / life estates','Trust / capacity transfers','Supporting / other interests'].map(k=>{const docs=all.filter(i=>lane(i)===k);return docs.length?section(docs,k):'';}).join(''):section(all,'')):'<div class="rt-empty">No dated or undated instruments are attached. Use Gaps & next steps to locate the acquisition record.</div>';
      records.querySelectorAll('[data-timeline-ref]').forEach(b=>b.onclick=()=>jump(b.dataset.timelineRef));
      records.querySelectorAll('img').forEach(img=>img.onerror=()=>{img.hidden=true;});
    };
    container.querySelector('#timeline-order').onchange=renderNodes;
    renderNodes();
  };

  let data,hist,promise,mode='roads',streetId='pilgrim',gapPage=0,lastFocus,roadQuery='',gapState=null;
  const entry=document.createElement('section');entry.className='history-entry rt-entry';
  entry.innerHTML='<h2>Research tools</h2><p>Separate road ownership from access rights. Follow document timelines and prioritize the remaining record searches.</p><div class="rt-entry-actions"><button type="button" data-research-mode="roads">Road ownership register</button><button type="button" id="open-title-timelines">Title-chain timelines</button><button type="button" data-research-mode="gaps">Research-gap dashboard</button></div>';
  document.querySelector('.history-entry').after(entry);
  const dialog=document.createElement('dialog');dialog.id='research-dialog';dialog.setAttribute('aria-labelledby','research-title');
  dialog.innerHTML=`<div class="rt-shell"><header class="rt-top"><div><div class="rt-eyebrow">Hamilton Beach research workspace</div><h2 id="research-title">Roads, title & next steps</h2></div><button type="button" id="research-close">Close</button></header>
    <nav class="rt-tabs" aria-label="Research sections"><button type="button" data-mode="roads" aria-pressed="true">Road ownership register</button><button type="button" data-mode="gaps" aria-pressed="false">Research gaps</button><button type="button" id="research-timelines">Property timelines</button></nav>
    <div id="research-content" class="rt-content"><p>Loading the evidence register…</p></div></div>`;
  document.body.append(dialog);
  const el=id=>document.getElementById(id);
  async function load(){
    if(data)return;
    if(!promise)promise=Promise.all([fetch('research-tools.json').then(r=>{if(!r.ok)throw Error('Register unavailable');return r.json();}),window.getPropertyHistoryData()]).then(([d,h])=>{data=d;hist=h;}).catch(e=>{promise=null;throw e;});
    await promise;
  }
  async function open(nextMode){
    lastFocus=document.activeElement;
    if(nextMode)mode=nextMode;
    if(!dialog.open)dialog.showModal();
    try{await load();render();}
    catch(e){el('research-content').innerHTML='<div class="rt-empty"><h3>The research workspace could not load.</h3><p>The map and existing reports remain available. Retry to load the evidence register.</p><button type="button" id="research-retry">Retry</button></div>';el('research-retry').onclick=()=>open(mode);}
  }
  window.openResearchTools=open;
  function close(){dialog.close();lastFocus?.focus?.({preventScroll:true});}
  el('research-close').onclick=close;
  dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
  document.querySelectorAll('[data-research-mode]').forEach(b=>b.onclick=()=>open(b.dataset.researchMode));
  el('open-title-timelines').onclick=()=>window.openPropertyHistory(178,{tab:'timeline'});
  dialog.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;render();});
  el('research-timelines').onclick=()=>report(178,'timeline');
  function report(index,tab='timeline',ref){
    if(mode==='gaps'&&el('gap-search'))gapState={q:el('gap-search').value,street:el('gap-street').value,kind:el('gap-kind').value,sort:el('gap-sort').value,page:gapPage};
    if(mode==='roads'&&el('road-search'))roadQuery=el('road-search').value;
    const p=hist?.properties.find(p=>p.index===Number(index));
    if(ref&&p&&!p.instruments.some(i=>i.ref===ref&&i.role!=='Rejected / unrelated')){tab='roads';ref=undefined;}
    dialog.close();window.openPropertyHistory(Number(index),{tab,ref,returnToResearch:true});
  }
  function bindReports(root){
    root.querySelectorAll('[data-rt-property]').forEach(b=>b.onclick=()=>report(b.dataset.rtProperty,b.dataset.reportTab||'timeline',b.dataset.reportRef));
    root.querySelectorAll('[data-rt-map]').forEach(b=>b.onclick=()=>{close();window.focusVerifiedParcel?.(+b.dataset.rtMap);});
    root.querySelectorAll('img').forEach(img=>img.onerror=()=>{const p=document.createElement('p');p.className='rt-muted';p.textContent='Image unavailable here. Open the linked full-resolution scan to retry.';img.replaceWith(p);});
  }
  function render(){
    dialog.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    if(mode==='roads')roads();else gaps();
  }
  function coreCard(c){
    return `<article class="rt-core"><h4>${esc(c.ref)} · ${esc(c.title)}</h4><p class="rt-muted">${esc(c.date)} · ${esc(c.type)}</p><p>${esc(c.scope)}</p>${c.quote?`<blockquote>${esc(c.quote)}</blockquote>`:''}<p>${esc(c.notes)}</p><p class="rt-muted">${esc(c.provenance)}</p><details><summary>Read ${c.images.length} attached evidence images</summary><div class="rt-scans">${c.images.map((s,n)=>`<figure><a href="${esc(s)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(s)}" alt="${esc(c.ref)}, attached evidence image ${n+1}"><figcaption>Image ${n+1} · open full resolution</figcaption></a></figure>`).join('')}</div></details>${link(c.source_url,'Registry provenance')}</article>`;
  }
  function roads(){
    el('research-content').innerHTML=`<div class="rt-intro"><p class="rt-eyebrow">${data.stats.road_corridors} street indexes · ${data.stats.road_segments} scoped research entries</p><h3>Who owns the road is not the same as who may use it.</h3><p>This register separates fee title, access rights, municipal status and maintenance. No corridor-wide roadbed owner is established here. Named streets and addresses are evidence indexes, not surveyed fee boundaries.</p></div>
      <div class="rt-road-layout"><details class="rt-road-nav" open><summary>Choose a street</summary><label for="road-search">Street, address or cited reference</label><input type="search" id="road-search" placeholder="Pilgrim, 60 Pilgrim or 2875/470"><small id="road-count" aria-live="polite"></small><nav id="road-list" aria-label="Street register"></nav></details><main id="road-detail"></main></div>`;
    el('road-search').oninput=renderRoadList;
    el('research-content').scrollTop=0;
    el('road-search').value=roadQuery;
    renderRoadList();roadDetail();
    if(matchMedia('(max-width:640px)').matches)el('research-content').querySelector('.rt-road-nav').open=false;
  }
  function renderRoadList(){
    const q=el('road-search').value.toLowerCase().trim();
    roadQuery=el('road-search').value;
    const rows=data.road_register.filter(r=>[r.name,...r.properties.map(p=>p.address),...r.evidence.map(e=>e.ref),...r.segments.flatMap(s=>s.core_refs)].join(' ').toLowerCase().includes(q));
    el('road-count').textContent=rows.length+' matching streets';
    el('road-list').innerHTML=rows.length?rows.map(r=>`<button type="button" data-road="${esc(r.id)}" aria-pressed="${streetId===r.id}"><strong>${esc(r.name)}</strong><span>${r.properties.length} address records · ${r.evidence.length} wording entries</span></button>`).join(''):'<p class="rt-empty">No matching street. Clear the search or use a property report.</p>';
    el('road-list').querySelectorAll('button').forEach(b=>b.onclick=()=>{streetId=b.dataset.road;renderRoadList();roadDetail();if(matchMedia('(max-width:640px)').matches){el('research-content').querySelector('.rt-road-nav').open=false;el('road-detail').scrollIntoView({block:'start'});}});
  }
  function roadDetail(){
    const r=data.road_register.find(r=>r.id===streetId)||data.road_register[0];streetId=r.id;
    el('road-detail').innerHTML=`<header class="rt-road-heading"><p class="rt-eyebrow">Street evidence register</p><h3>${esc(r.name)}</h3><p class="rt-status">Roadbed fee title unresolved</p><p>${esc(r.scope)}</p></header>
      <section class="rt-municipal"><h4>Municipal status</h4><p>${esc(r.municipal_status)}</p><p class="rt-muted">Reused prior reviewed municipal records; not a fresh certification of today's status.</p>${r.municipal_sources.map((s,n)=>link(s,(n?'Town accepted-streets list':'Town street listing')+(s.includes('web.archive.org')?' (archived copy)':''))).join(' · ')}</section>
      <h4>Scoped segments & interests</h4>${r.segments.map(s=>`<article class="rt-segment"><h4>${esc(s.title)}</h4><p>${esc(s.extent)}</p><dl><dt>Fee title</dt><dd>${esc(s.fee_owner)}. ${esc(s.claim)}</dd><dt>Parties / claims</dt><dd>${esc(s.parties)}</dd><dt>Use / access rights</dt><dd>${esc(s.rights)}</dd><dt>Maintenance</dt><dd>${esc(s.maintenance)}</dd></dl>${s.core_refs.length?`<details><summary>Read segment evidence (${s.core_refs.join(', ')})</summary>${s.core_refs.map(ref=>data.core_evidence.find(c=>c.ref===ref)).filter(Boolean).map(coreCard).join('')}</details>`:''}</article>`).join('')}
      <details class="rt-wording"><summary>${r.evidence.length} parcel-scoped road wording entries</summary><p>Boundary references, privileges and reservations are not fee conveyances. Keep each quotation with its parcel and beneficiary limits.</p>${r.evidence.map(e=>`<article><h4>${esc(e.ref)} · ${esc(e.address)}</h4><p class="rt-muted">${esc(e.kind)}${e.page?' · recorded page '+esc(e.page):''}</p><blockquote>${esc(e.quote)}</blockquote><p>Scope: ${esc(e.scope)}</p><p>Beneficiaries: ${esc(e.beneficiaries)}</p><p>${esc(e.limitation)} ${esc(e.association)}</p><button type="button" data-rt-property="${e.property_index}" data-report-tab="history" data-report-ref="${esc(e.ref)}">Open property evidence</button> ${e.images.map((s,n)=>link(s,'Attached scan '+(n+1))).join(' · ')}</article>`).join('')||'<p>No completed named-street clause review is attached. This is not evidence of absent rights.</p>'}</details>
      <details><summary>${r.properties.length} associated address records</summary><p>Address associations do not establish frontage geometry or road fee ownership.</p><div class="rt-property-links">${r.properties.map(p=>`<button type="button" data-rt-property="${p.index}">${esc(p.address)} · ${esc(p.pid)}<span>Open document timeline</span></button>`).join('')}</div></details>
      <details class="rt-core-context"><summary>Parcel-specific HBA records: separate from whole-road ownership</summary><p>The Lots 1040/1041 and Lot 1049 branches do not establish ownership of every road. Geometry, later conveyances and retained rights require parcel-specific comparison.</p>${data.core_evidence.filter(c=>['3147/122','3329/428','4100/130','8008/136','3147/123','3329/429','4100/131'].includes(c.ref)).map(coreCard).join('')}</details>
      <footer class="rt-footer"><button type="button" id="road-to-gaps">Prioritize roadbed searches</button><a href="research-tools.json" download>Download register & research tasks</a></footer>`;
    el('road-to-gaps').onclick=()=>{mode='gaps';gapState=null;gaps(r.short_name,'roadbed');dialog.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));};
    bindReports(el('road-detail'));
  }
  function gaps(defaultStreet='',defaultKind=''){
    gapPage=0;
    el('research-content').innerHTML=`<div class="rt-intro"><p class="rt-eyebrow">Evidence-led research queue</p><h3>Make the next search count.</h3><p>${data.stats.properties} mapped records remain uncertified as complete histories. Tasks below are derived from the existing ledger, not a new title opinion. A cited lead may be a restriction, supporting record or transfer.</p></div>
      <div class="rt-gap-filters"><label>Address, assessor ID or reference<input type="search" id="gap-search" placeholder="61 Pilgrim or 9293/349"></label><label>Street<select id="gap-street"><option value="">All streets</option>${[...new Set(data.tasks.map(t=>t.street))].sort().map(s=>`<option>${esc(s)}</option>`).join('')}</select></label><label>Research category<select id="gap-kind"><option value="">All categories</option>${Object.entries(data.task_labels).map(([k,v])=>`<option value="${esc(k)}">${esc(v)}</option>`).join('')}</select></label><label>Order<select id="gap-sort"><option value="priority">Research priority</option><option value="roadbed">Roadbed title first</option><option value="missing">Missing records first</option><option value="address">Address</option><option value="blockers">Most tasks per property</option></select></label></div>
      <div class="rt-results-bar"><p id="gap-result-count" aria-live="polite"></p><button type="button" id="gap-reset">Reset filters</button><button type="button" id="gap-export">Export filtered CSV</button></div><p class="rt-muted">${esc(data.priority_note)} All tasks remain unresolved; this is a read-only queue, not a completion checklist.</p><div id="gap-results"></div><nav class="rt-pagination" aria-label="Research task pages"><button type="button" id="gap-prev">Previous</button><span id="gap-page" aria-live="polite"></span><button type="button" id="gap-next">Next</button></nav>`;
    el('gap-street').value=defaultStreet;el('gap-kind').value=defaultKind;
    el('research-content').scrollTop=0;
    if(gapState&&!defaultStreet&&!defaultKind){el('gap-search').value=gapState.q;el('gap-street').value=gapState.street;el('gap-kind').value=gapState.kind;el('gap-sort').value=gapState.sort;gapPage=gapState.page;}
    ['gap-search','gap-street','gap-kind','gap-sort'].forEach(id=>el(id).oninput=()=>{gapPage=0;gapResults();});
    el('gap-reset').onclick=()=>{el('gap-search').value='';el('gap-street').value='';el('gap-kind').value='';el('gap-sort').value='priority';gapPage=0;gapResults();};
    el('gap-prev').onclick=()=>{gapPage--;gapResults();el('gap-results').scrollIntoView({block:'start'});};
    el('gap-next').onclick=()=>{gapPage++;gapResults();el('gap-results').scrollIntoView({block:'start'});};
    el('gap-export').onclick=()=>{
      const rows=[['Address','Assessor ID','Category','Research priority','Status','Cited references','Next action'],...filteredTasks().map(t=>[t.address,t.pid,data.task_labels[t.kind],t.priority,t.status,t.refs.join('; '),t.action])];
      const csv=rows.map(r=>r.map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
      const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download='hamilton-beach-filtered-research-tasks.csv';a.click();
    };
    gapResults();
  }
  function filteredTasks(){
    const q=el('gap-search').value.trim().toLowerCase(),s=el('gap-street').value,k=el('gap-kind').value,order=el('gap-sort').value;
    const rows=data.tasks.filter(t=>(!s||t.street===s)&&(!k||t.kind===k)&&[t.address,t.pid,t.title,t.refs.join(' ')].join(' ').toLowerCase().includes(q));
    const counts=new Map();data.tasks.forEach(t=>counts.set(t.property_index,(counts.get(t.property_index)||0)+1));
    return rows.sort((a,b)=>{
      let diff=0;
      if(order==='roadbed')diff=Number(b.kind==='roadbed')-Number(a.kind==='roadbed');
      if(order==='missing')diff=Number(/missing_reference|predecessor|scan_review|probate_county/.test(b.kind))-Number(/missing_reference|predecessor|scan_review|probate_county/.test(a.kind));
      if(order==='blockers')diff=counts.get(b.property_index)-counts.get(a.property_index);
      if(order!=='address'&&!diff)diff=b.priority-a.priority;
      return diff||a.address.localeCompare(b.address,undefined,{numeric:true})||a.property_index-b.property_index;
    });
  }
  function gapResults(){
    const rows=filteredTasks(),pages=Math.max(1,Math.ceil(rows.length/30));gapPage=Math.max(0,Math.min(gapPage,pages-1));
    el('gap-result-count').textContent=`${rows.length} unresolved tasks · ${new Set(rows.map(t=>t.property_index)).size} mapped records`;
    el('gap-results').innerHTML=rows.length?rows.slice(gapPage*30,gapPage*30+30).map(t=>{
      const p=hist.properties.find(p=>p.index===t.property_index),known=new Set(p.instruments.filter(i=>i.role!=='Rejected / unrelated').map(i=>canonical(i.ref)));
      return `<article class="rt-task"><div><p class="rt-eyebrow">${esc(data.task_labels[t.kind])} · research priority ${t.priority}</p><h4>${esc(t.address)} <span>${esc(t.pid||'ID unavailable')}</span></h4><p><strong>${esc(t.title)}</strong></p><p>${esc(t.action)}</p>
        ${t.refs.length?`<p class="rt-task-refs">Cited leads: ${t.refs.map(r=>known.has(canonical(r))?`<button type="button" data-rt-property="${t.property_index}" data-report-tab="history" data-report-ref="${esc(p.instruments.find(i=>i.role!=='Rejected / unrelated'&&canonical(i.ref)===canonical(r)).ref)}">${esc(r)} · inspect evidence</button>`:`<span>${esc(r)} · retrieval / review needed</span>`).join(' ')}</p>`:''}
        <details><summary>Parcel scope & task basis</summary><p>${esc(t.scope)}</p><p>${esc(t.basis)}</p></details></div><div class="rt-task-actions"><span class="rt-status">${esc(t.status)}</span><button type="button" data-rt-property="${t.property_index}">Title timeline</button><button type="button" data-rt-property="${t.property_index}" data-report-tab="gaps">Search logs & gaps</button></div></article>`;
    }).join(''):'<div class="rt-empty"><h4>No matching research tasks</h4><p>This filter has no results. Reset the filters to return to the full research queue.</p></div>';
    el('gap-page').textContent=rows.length?`Page ${gapPage+1} of ${pages}`:'0 matching tasks';
    el('gap-prev').disabled=gapPage===0;el('gap-next').disabled=gapPage>=pages-1;el('gap-export').disabled=!rows.length;
    bindReports(el('gap-results'));
    gapState={q:el('gap-search').value,street:el('gap-street').value,kind:el('gap-kind').value,sort:el('gap-sort').value,page:gapPage};
  }
})();
