(() => {
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data,selected,doc,pageNumber=0,zoom=100,rotation=0,tab='overview',sort='newest',loadPromise;
  const entry=document.createElement('section');
  entry.className='history-entry';
  entry.innerHTML='<h2>Property histories</h2><p>House-by-house evidence reports for every mapped record, starting with 60 and 61 Pilgrim. Reviewed screenshots, road wording and research gaps are kept together.</p><button type="button" class="history-primary" id="open-property-histories">Browse property reports</button><p>Historical chains remain incomplete. Map records include houses, vacant land and overlapping assessment polygons.</p>';
  document.querySelector('#panel .theme-btn').after(entry);
  const dialog=document.createElement('dialog');dialog.id='history-dialog';dialog.setAttribute('aria-labelledby','history-title');
  dialog.innerHTML=`<div class="history-shell">
    <header class="history-top"><div><h2 id="history-title">Hamilton Beach property histories</h2><p id="history-coverage">Loading the evidence index…</p></div><button id="history-close" type="button">Close</button></header>
    <div class="history-layout"><details class="history-nav" open><summary>Browse properties</summary>
      <label for="history-search">Address, assessor ID or book/page</label><input id="history-search" type="search" placeholder="60 Pilgrim or 3018/155" autocomplete="off">
      <label for="history-street">Street</label><select id="history-street"><option value="">All streets</option></select>
      <label><input type="checkbox" id="history-residential"> Residential assessment records only</label>
      <label><input type="checkbox" id="history-membership-outside" checked> Show properties outside bylaw area</label>
      <small id="history-list-count" aria-live="polite"></small><nav class="history-list" id="history-list" aria-label="Property report index"></nav>
    </details><main class="history-main" id="history-main"><div class="history-empty">Loading reviewed deeds and property records…</div></main></div></div>`;
  document.body.append(dialog);
  matchMedia('(max-width:640px)').addEventListener('change',e=>{dialog.querySelector('.history-nav').open=!e.matches;});
  const el=id=>document.getElementById(id);
  async function load(){
    if(data)return data;
    if(loadPromise)return loadPromise;
    loadPromise=fetch('property-history.json').then(r=>{if(!r.ok)throw Error('Evidence index unavailable');return r.json();}).then(x=>{
      data=x;
      el('history-coverage').textContent=`Choose an address, then read one record at a time.`;
      [...new Set(x.properties.map(p=>p.address.replace(/^\S+\s+/,'')))].sort().forEach(s=>{
        const o=document.createElement('option');o.value=s;o.textContent=s;el('history-street').append(o);
      });
      renderList();return x;
    }).catch(e=>{
      loadPromise=null;
      el('history-main').innerHTML='<div class="history-empty"><h3>The report index could not load.</h3><p>Your map remains available. Retry to reopen the property evidence.</p><button id="history-retry" type="button">Retry loading</button></div>';
      el('history-retry').onclick=()=>open(selected?.index);
      throw e;
    });
    return loadPromise;
  }
  async function open(index,options={}){
    if(!dialog.open)dialog.showModal();
    try{
      await load();
      dialog.querySelector('.history-nav').open=!matchMedia('(max-width:640px)').matches;
      selectProperty(data.properties.find(p=>p.index===Number(index))||selected||data.properties[0]);
      if(options.tab){tab=options.tab;renderReport();}
      if(options.ref){
        doc=selected.instruments.find(i=>i.ref===options.ref&&i.role!=='Rejected / unrelated')||null;
        tab='history';renderReport();
      }
      const back=document.getElementById('history-research-back');
      if(back)back.remove();
      if(options.returnToResearch){
        const b=document.createElement('button');b.id='history-research-back';b.type='button';b.textContent='Back to research';
        b.onclick=()=>{dialog.close();window.openResearchTools?.();};
        el('history-close').before(b);
      }
      document.getElementById('history-island-back')?.remove();
      if(options.returnToIsland){
        const b=document.createElement('button');b.id='history-island-back';b.type='button';b.textContent='Back to island history';
        b.onclick=()=>{dialog.close();window.openIslandHistory?.();};
        el('history-close').before(b);
      }
    }catch(e){console.warn(e.message);}
  }
  async function renderGovernor(p){
    const box=el('history-governor');if(!box||!window.HBATeam)return;
    const T=window.HBATeam,street=T.streetOf(p.address),avenue=street?street+' Avenue':'this street';
    const repEl=(html)=>{if(el('history-governor')===box)box.innerHTML=html;};
    try{
      await T.load();
      const g=T.governorForAddress(p.address),my=(T.data?.my_households||[]).some(h=>h.household_uid===p.uid);
      const label=my?'Your street governor':'Street governor for '+esc(avenue);
      if(g.represented){
        const o=g.holder;
        repEl(`<h4>${label}</h4>${o?`<p class="history-governor-name">${esc(o.member_name)} <span>· ${esc(g.position.replace(' Street Governor',' Avenue Governor'))}${o.address?' · '+esc(T.prettyAddress(o.address)):''}</span></p><p class="history-governor-contact">${o.contact_phone?`<a href="tel:${esc(o.contact_phone.replace(/[^\d+]/g,''))}">${esc(o.contact_phone)}</a>`:''}${o.contact_phone&&o.contact_email?' · ':''}${o.contact_email?`<a href="mailto:${esc(o.contact_email)}">${esc(o.contact_email)}</a>`:''}${!o.contact_phone&&!o.contact_email?'Contact details are not shared in the app; use Message.':''}</p>`:`<p>${esc(avenue)} elects its own Street Governor under the bylaws, but the board has not recorded who holds the office yet.</p>`}
          <div class="history-governor-actions"><button type="button" id="history-governor-message">Message ${o?esc(o.member_name.split(' ')[0]):'the governor'}</button><button type="button" id="history-governor-team">Contact our team</button></div>`);
      }else{
        const atLarge=['Governor at Large 1','Governor at Large 2','Governor at Large 3'].map(T.holder).filter(Boolean);
        repEl(`<h4>${label}</h4><p>The bylaws name seven street governors (Pilgrim, Algelo, Worrall, Surf, Turner, Glen and Reynolds). ${esc(avenue)} is outside the association’s current membership area (as stated by the administrator, October 2026), so no street governor is elected for it. The Governors at Large${atLarge.length?' — '+atLarge.map(o=>esc(o.member_name)).join(', ')+' —':''} and the President can take questions from this household.</p>
          <div class="history-governor-actions"><button type="button" id="history-governor-message">Message a governor</button><button type="button" id="history-governor-team">Contact our team</button></div>`);
      }
      const g2=g.represented?g.position:undefined;
      el('history-governor-message').onclick=()=>window.openGovernorMessage({position:g2});
      el('history-governor-team').onclick=()=>window.openHBATeam();
    }catch(e){
      repEl(`<h4>Street governor</h4><p>${esc(/sign in/i.test(e.message)?'Sign in as an approved resident to see who represents '+avenue+' and to message them.':e.message)}</p>`);
    }
  }
  window.openPropertyHistory=open;
  window.getPropertyHistoryData=load;
  el('open-property-histories').onclick=()=>open(178);
  el('history-close').onclick=()=>dialog.close();
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  function renderList(){
    if(!data)return;
    const q=el('history-search').value.trim().toLowerCase(),street=el('history-street').value,res=el('history-residential').checked;
    const matches=data.properties.filter(p=>(!window.HBAMembership||window.HBAMembership.visible(p.index))&&(!street||p.address.replace(/^\S+\s+/,'')===street)&&(!res||/residential/i.test(p.use||''))&&
      [p.address,p.pid,p.uid,...p.instruments.map(i=>i.ref),...p.leads].join(' ').toLowerCase().includes(q));
    el('history-list-count').textContent=`${matches.length} of ${data.stats.mapped_records} mapped records`;
    el('history-list').innerHTML=matches.length?matches.map(p=>`<button type="button" data-property="${p.index}" aria-current="${selected?.index===p.index}"><strong>${esc(p.address)}</strong><small>${p.instruments.filter(i=>i.role!=='Rejected / unrelated').length} records${window.HBAMembership?.classification(p.index).status==='review'?' · Area needs review':''}</small></button>`).join(''):
      '<div class="history-empty">No matching property. Clear the search or change the street filter.</div>';
    el('history-list').querySelectorAll('button').forEach(b=>b.onclick=()=>{
      selectProperty(data.properties.find(p=>p.index===+b.dataset.property),tab);
      if(matchMedia('(max-width:640px)').matches){dialog.querySelector('.history-nav').open=false;dialog.querySelector('.history-layout').scrollTop=0;}
    });
  }
  ['history-search','history-street','history-residential'].forEach(id=>el(id).addEventListener('input',renderList));
  el('history-membership-outside').onchange=e=>window.HBAMembership?.setShowOutside(e.target.checked);
  document.addEventListener('hba-membership-change',e=>{el('history-membership-outside').checked=e.detail.showOutside;renderList();if(selected&&!window.HBAMembership.visible(selected.index)){selected=data?.properties.find(p=>window.HBAMembership.visible(p.index));if(selected)selectProperty(selected);}});
  function selectProperty(p,nextTab='overview'){
    if(window.HBAMembership&&!window.HBAMembership.visible(p.index))p=data.properties.find(r=>window.HBAMembership.visible(r.index))||p;
    selected=p;doc=null;pageNumber=0;zoom=100;tab=nextTab;
    el('history-coverage').textContent=p.address+' · Choose an address, then read one record at a time.';
    renderReport();renderList();
    el('history-main').scrollTop=0;
    dialog.querySelector('.history-layout').scrollTop=0;
  }
  function renderReport(){
    const p=selected;
    const active=p.instruments.filter(i=>i.role!=='Rejected / unrelated'),rejected=p.instruments.filter(i=>i.role==='Rejected / unrelated');
    el('history-main').innerHTML=`<div class="history-heading"><div><div class="history-kicker">Property history</div>
      <h3>${esc(p.address)}</h3><p class="history-meta">${active.length} records · ${window.HBAMembership?esc({in_scope:'In the mapped bylaw area',outside:'Outside the mapped bylaw area',review:'Membership area needs review'}[window.HBAMembership.classification(p.index).status]):'Membership area not checked'}</p></div>
      <button id="history-map" type="button">Show on map</button></div>
      <div class="history-caution">Research is incomplete. Recorded names are not a verified current-owner list.</div>
      <div class="history-tabs" role="tablist" aria-label="Report sections">
        <button type="button" role="tab" aria-selected="${tab==='overview'}" data-history-tab="overview">Summary</button>
        <button type="button" role="tab" aria-selected="${tab==='history'}" data-history-tab="history">Deeds & photos</button>
        <button type="button" role="tab" aria-selected="${tab==='roads'}" data-history-tab="roads">Road & beach rights</button>
        <button type="button" role="tab" aria-selected="${tab==='gaps'}" data-history-tab="gaps">Research details</button>
      </div><section id="history-tab-content" role="tabpanel"></section>
      <details class="history-links"><summary>Registry & research downloads</summary><a href="https://titleview.org/plymouthdeeds/" target="_blank" rel="noopener">Plymouth Registry</a>
      <a href="property-history.json" download>Evidence ledger</a><a href="property-history-research-queue.json" download>Research queue</a></details>`;
    el('history-map').onclick=()=>{dialog.close();focusVerifiedParcel(p.index);};
    el('history-main').querySelectorAll('[data-history-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.historyTab;renderReport();});
    const content=el('history-tab-content');
    if(tab==='overview'){
      const latest=active.find(i=>i.role==='Dataset endpoint');
      const ordered=[...active].sort((a,b)=>(dateValue(b)??-Infinity)-(dateValue(a)??-Infinity));
      content.innerHTML=`<section class="history-simple-summary"><h4>The short version</h4><dl>
        <dt>Latest record</dt><dd>${esc(p.endpoint_ref||'Not found yet')}${latest?.date?' · '+esc(latest.date):''}</dd>
        <dt>Named parties</dt><dd>${esc(latest?.transfer||'Not yet transcribed')}</dd>
        <dt>House year</dt><dd>${esc(p.assessor_year||'Unknown')} · assessor estimate, not a confirmed construction date</dd></dl>
        <section class="history-governor" id="history-governor" aria-live="polite"><h4>Your street governor</h4><p>Checking the officers and governors list…</p></section>
        <p>Choose a record below to see its original images.</p><div class="history-story-list">${ordered.map(i=>`<article><h5>${esc(i.date||'Date unknown')} · ${esc(window.describeHBADeed(i).label)}</h5>${i.transfer?`<p>${esc(i.transfer)}</p>`:''}<button type="button" data-story-ref="${esc(i.ref)}">Open record ${esc(i.ref)}</button></article>`).join('')||'<p>No deed is available yet.</p>'}</div>
        <details class="history-glossary"><summary>Property scope & helpful terms</summary><p>${esc(p.scope)}</p><p>${esc(p.construction_note)}</p><p>Book/page locates a registry record. Grantor is the person transferring an interest; grantee receives it. An access right is not ownership of the road or beach.</p><p>Assessor parcel: ${esc(p.pid||p.uid)} · ${esc(p.polygon_type)}. ${window.HBAMembership?esc(window.HBAMembership.classification(p.index).reason):''}</p></details><button type="button" id="history-dated-view">View dated timeline</button></section>`;
      content.querySelectorAll('[data-story-ref]').forEach(b=>b.onclick=()=>{doc=active.find(i=>i.ref===b.dataset.storyRef);pageNumber=0;zoom=100;tab='history';renderReport();});
      window.renderHBAAssessment?.(content,p.index);
      el('history-dated-view').onclick=()=>{tab='timeline';renderReport();};
      renderGovernor(p);
      return;
    }
    if(tab==='timeline'){
      window.renderPropertyTimeline(content,p,ref=>{
        doc=active.find(i=>i.ref===ref)||null;pageNumber=0;zoom=100;tab='history';renderReport();
      });
      return;
    }
    if(tab==='gaps'){
      content.innerHTML=`<div class="history-clauses">
        ${p.follow_on_search?`<h4>Follow-on acquisition and unindexed searches</h4><p>${esc(p.follow_on_search.status)} · ${p.follow_on_search.attempts.length} recorded search attempt(s) · ${p.follow_on_search.reviewed_instruments.length} substantive instrument review(s). This is a bounded pass, not an exhaustive lifetime title search.</p>
        ${p.follow_on_search.attempts.map(a=>`<article><h4>${esc(a.kind||'Registry search')} · ${esc(typeof a.query==='object'?JSON.stringify(a.query):a.query||'')}</h4><p>${esc(a.result||'Result not recorded')}</p><p>${esc(a.limitation||'Search results alone do not establish parcel ownership.')}</p>${a.source_url?`<a href="${esc(a.source_url)}" target="_blank" rel="noopener">Registry provenance</a>`:''} ${(a.scans||[]).map((s,n)=>`<a href="${esc(s)}" target="_blank" rel="noopener">Search evidence ${n+1}</a>`).join(' · ')}</article>`).join('')}
        ${(p.follow_on_search.limitations||[]).map(x=>`<p>${esc(x)}</p>`).join('')}`:''}
        ${p.all_property_pass?`<h4>Earlier all-property tracing checkpoint</h4><p>Status at that checkpoint: ${esc(p.all_property_pass.status)} · ${p.all_property_pass.visually_reviewed_new_instruments} instrument review(s) recorded in that pass.</p><p>${esc(p.all_property_pass.next_action)}</p><p>${esc(p.all_property_pass.coverage_limitations)}</p>
        ${p.all_property_pass.attempts.length?`<details><summary>Recorded research attempts</summary>${p.all_property_pass.attempts.map(a=>`<p>${esc(typeof a==='string'?a:JSON.stringify(a))}</p>`).join('')}</details>`:''}`:''}
        <h4>What remains unproved</h4><p>${esc(p.scope)}</p><ul>${p.gaps.map(g=>`<li>${esc(g)}</li>`).join('')}</ul>
        <p>${esc(p.construction_note)}</p><p>Full lifetime coverage is not established, and the dataset endpoint has not been certified as the latest conveyance.</p>
        ${rejected.length?`<h4>Rejected records: not part of this title chain</h4>${rejected.map(i=>`<article><h4>${esc(i.ref)}</h4><p>${esc(i.lot_match)}</p><p>${esc(i.notes)}</p>${i.scans.map((s,n)=>`<a href="${esc(s)}" target="_blank" rel="noopener">Rejected evidence image ${n+1}</a>`).join(' · ')}</article>`).join('')}`:''}
        ${(p.pending_captures||[]).length?`<h4>Captured leads awaiting substantive review</h4><p>These scans are not verified title-chain evidence. They may contain adjacent instruments or duplicated pages; capture does not mean the deed has been read.</p>${p.pending_captures.map(i=>`<article><h4>${esc(i.ref)}</h4><p>${esc(i.review_status)}</p>${i.scans.map((s,n)=>`<a href="${esc(s)}" target="_blank" rel="noopener">Unreviewed capture ${n+1}</a>`).join(' · ')}</article>`).join('')}`:''}
        ${(p.research_queries||[]).length?`<h4>County-specific search evidence</h4>${p.research_queries.map(q=>`<article><h4>${esc(q.ref)} · ${esc(q.status)}</h4><p>${esc(q.notes)}</p><p>${esc(q.limitation)} ${esc(q.resolution)}</p>${q.source_url?`<a href="${esc(q.source_url)}" target="_blank" rel="noopener">Open registry search</a>`:''} ${q.scans.map((s,n)=>`<a href="${esc(s)}" target="_blank" rel="noopener">Research screenshot ${n+1}</a>`).join(' · ')}</article>`).join('')}`:''}</div>`;
      return;
    }
    if(tab==='roads'){
      content.innerHTML=`<div class="history-clauses"><h4>Road wording, not a road-owner determination</h4><p>Boundary wording, passage rights, reservations and ownership are different questions. Clauses below retain their lot and beneficiary limits.</p>
        ${p.road_records.map(r=>`<article><h4>${esc(r.ref)} · ${esc(r.review_status)}</h4><p>${esc(r.notes)}</p>${r.findings.map(f=>`<p><strong>${esc(data.roadLabels[f.category]||f.category)}</strong> · recorded page ${esc(f.recorded_page??'unverified')}</p><blockquote>${esc(f.quote)}</blockquote><p>Scope: ${esc(f.lot_scope)}<br>Beneficiaries: ${esc(f.beneficiaries)}<br>${esc(f.limitation)}</p>${f.scan?`<a href="${esc(f.scan)}" target="_blank" rel="noopener">Open clause screenshot</a>`:''}`).join('')}</article>`).join('')||
          '<p>No completed structured road-clause review is attached for this property. This is not evidence that road rights are absent.</p>'}
        ${active.filter(i=>i.newly_reviewed||['New Pilgrim review','Roadbed investigation','New all-property review'].includes(i.role)).map(i=>`<article><h4>${esc(i.ref)} · ${esc(i.role)}</h4><p>${esc(i.notes)}</p>${(i.road_quotes||[]).map(q=>`<blockquote>${esc(typeof q==='string'?q:q.quote||q.text||'')}</blockquote>${typeof q==='object'?`<p>${q.page||q.recorded_page?'Recorded page: '+esc(q.page||q.recorded_page)+'. ':''}${esc(q.scope||q.lot_scope||'')}${q.limitation?' '+esc(q.limitation):''}</p>`:''}`).join('')}<p>Parcel scope: ${esc(i.lot_match)}. No roadway fee owner is certified.</p></article>`).join('')}
      </div>`;return;
    }
    content.innerHTML=`<details class="history-summary"><summary>Read this property’s history and scope</summary>
      <p>${esc(p.scope)}</p><p>${esc(p.construction_note)}</p>
      <p>Recorded subdivision plans, for context only: ${data.plans.map(plan=>plan.images.map(s=>`<a href="${esc(s)}" target="_blank" rel="noopener">${esc(plan.ref)}</a>`).join(' · ')).join(' · ')}. A plan is not a roadbed conveyance or proof of parcel-specific rights.</p>
      ${p.focus_chain?`<p>Focused referenced sequence, newest to older: ${p.focus_chain.chain.map(esc).join(' → ')}.</p><p>${esc(p.focus_chain.gap)}</p>`:''}
      <div class="history-clauses">${active.map(i=>`<article><h4>${esc(i.ref)} · ${esc(i.date||'date unverified')}</h4><p>${esc(i.transfer||i.doc_type)}</p><p>${esc(i.lot_match)}</p>${i.quote?`<blockquote>${esc(i.quote)}</blockquote>`:''}<p>${esc(i.notes)}</p><p>${esc(i.provenance)}. ${i.next_refs.length?'Cited leads: '+i.next_refs.map(esc).join('; '):'No verified next-title reference recorded.'}</p></article>`).join('')}</div></details>
      <div class="history-evidence"><aside class="history-instruments"><label for="history-sort">Evidence order</label><select id="history-sort"><option value="newest">Newest dated first</option><option value="oldest">Oldest dated first</option></select><div id="history-instrument-list"></div></aside>
        <article class="history-document" id="history-document"></article></div>`;
    el('history-sort').value=sort;el('history-sort').onchange=e=>{sort=e.target.value;renderInstrumentList(active);};
    renderInstrumentList(active);
    if(!doc||!active.includes(doc))doc=active.find(i=>i.role==='Dataset endpoint')||active[0];
    renderDocument();
  }
  function dateValue(i){
    const m=String(i.date).match(/^(\d{4})-(\d\d)-(\d\d)|^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if(!m)return null;
    return m[1]?Date.UTC(+m[1],+m[2]-1,+m[3]):Date.UTC(+m[6],+m[4]-1,+m[5]);
  }
  function renderInstrumentList(active){
    const ordered=[...active].sort((a,b)=>{
      const av=dateValue(a),bv=dateValue(b);
      return av===null?bv===null?0:1:bv===null?-1:(av-bv)*(sort==='oldest'?1:-1);
    });
    el('history-instrument-list').innerHTML=ordered.length?ordered.map(i=>`<button type="button" data-ref="${esc(i.ref)}" aria-pressed="${doc?.ref===i.ref}"><strong>${esc(window.describeHBADeed(i).label)}</strong><small>${esc(i.date||'Date unverified')} · Book/page ${esc(i.ref)}</small><small>${esc(window.describeHBADeed(i).stage)} · ${i.scans.length} image(s)</small></button>`).join(''):
      '<p>No deed reference is supplied. Follow the missing-reference investigation in Gaps & next steps.</p>';
    el('history-instrument-list').querySelectorAll('button').forEach(b=>b.onclick=()=>{
      doc=active.find(i=>i.ref===b.dataset.ref);pageNumber=0;zoom=100;renderInstrumentList(active);renderDocument();
    });
  }
  function renderDocument(){
    rotation=0;
    if(!el('history-document'))return;
    if(!doc){el('history-document').innerHTML='<div class="history-empty">No deed screenshot is available. The property report remains in the index with a missing-record flag.</div>';return;}
    const label=window.describeHBADeed(doc);
    const ordered=selected.instruments.filter(i=>i.role!=='Rejected / unrelated').sort((a,b)=>(dateValue(b)??-Infinity)-(dateValue(a)??-Infinity));
    const position=ordered.indexOf(doc);
    el('history-document').innerHTML=`<h4>${esc(label.label)} · ${esc(doc.date||'Date unknown')}</h4><p>${esc(doc.transfer||'Named parties not yet transcribed')}</p><p class="history-meta">Registry ${esc(doc.ref)}</p>
      <div class="history-transaction-nav"><button type="button" id="history-record-prev"${position===0?' disabled':''}>Newer record</button><span>Record ${position+1} of ${ordered.length}</span><button type="button" id="history-record-next"${position>=ordered.length-1?' disabled':''}>Older record</button></div>
      <div class="history-controls"><button type="button" id="history-prev">Previous page</button><span id="history-page-label"></span><button type="button" id="history-next">Next page</button>
      <button type="button" id="history-zoom-out" aria-label="Zoom screenshot out">−</button><button type="button" id="history-zoom-in" aria-label="Zoom screenshot in">+</button><button type="button" id="history-fit">Fit width</button><button type="button" id="history-rotate" aria-pressed="false">Rotate 180°</button></div>
      <div class="history-image-stage" id="history-image-stage"></div>
      <p class="history-page-note" id="history-page-note"></p><details class="history-docnotes"><summary>Exact wording, parcel notes & evidence details</summary><p>${esc(label.meaning)}</p>
      <p><strong>Lot / parcel match:</strong> ${esc(doc.lot_match||'Unverified')}</p>
      ${doc.quote?`<blockquote>${esc(doc.quote)}</blockquote>`:''}<p>${esc(doc.notes)}</p>
      <p>${esc(doc.provenance)}. ${doc.pages_read} subject page(s) recorded as reviewed${doc.pages_total?' / '+doc.pages_total+' reported':''}; ${doc.scans.length} screenshot(s) attached${doc.excluded_count?'; '+doc.excluded_count+' duplicate/unrelated image(s) excluded':''}.</p>
      ${doc.next_refs.length?`<p><strong>Next cited leads:</strong> ${doc.next_refs.map(esc).join('; ')}. Citation alone does not establish chain continuity.</p>`:''}
      <p><a href="${esc(doc.source_url)}" target="_blank" rel="noopener">Registry provenance</a></p></details><p><a id="history-original" target="_blank" rel="noopener">Open full-size image</a></p>`;
    const changeRecord=step=>{doc=ordered[position+step];pageNumber=0;zoom=100;renderInstrumentList(selected.instruments.filter(i=>i.role!=='Rejected / unrelated'));renderDocument();};
    el('history-record-prev').onclick=()=>changeRecord(-1);el('history-record-next').onclick=()=>changeRecord(1);
    el('history-prev').onclick=()=>{if(pageNumber>0){pageNumber--;renderImage();}};
    el('history-next').onclick=()=>{if(pageNumber<doc.scans.length-1){pageNumber++;renderImage();}};
    el('history-zoom-out').onclick=()=>{zoom=Math.max(50,zoom-25);applyZoom();};
    el('history-zoom-in').onclick=()=>{zoom=Math.min(300,zoom+25);applyZoom();};
    el('history-fit').onclick=()=>{zoom=100;applyZoom();el('history-image-stage').scrollTo(0,0);};
    el('history-rotate').onclick=()=>{rotation=(rotation+180)%360;applyZoom();el('history-rotate').setAttribute('aria-pressed',String(rotation===180));};
    renderImage();
    el('history-instrument-list')?.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.ref===doc.ref)));
  }
  function applyZoom(){const image=el('history-image-stage').querySelector('img');if(image){image.style.width=zoom+'%';image.style.transform=`rotate(${rotation}deg)`;}el('history-fit').textContent=zoom===100?'Fit width':`Fit width (${zoom}%)`;}
  function renderImage(){
    const stage=el('history-image-stage'),src=doc.scans[pageNumber];
    stage.replaceChildren();stage.scrollTo(0,0);
    el('history-prev').disabled=!src||pageNumber===0;
    el('history-next').disabled=!src||pageNumber===doc.scans.length-1;
    el('history-page-label').textContent=src?`${pageNumber+1} / ${doc.scans.length} attached`:'No image';
    el('history-page-note').textContent=doc.subject_pages?.[pageNumber]?`Recorded page ${doc.subject_pages[pageNumber]}. Shared-page limits are in Evidence details.`:
      'Image sequence only. Recorded-page and review limits are in Evidence details.';
    const original=el('history-original');original.hidden=!src;if(src)original.href=src;
    if(!src){stage.innerHTML='<div class="image-message"><strong>Screenshot not available.</strong><p>This reference remains unresolved or has no usable attached image. Open Gaps & next steps for the required follow-up.</p></div>';return;}
    const skeleton=document.createElement('div');skeleton.className='history-skeleton';stage.append(skeleton);
    const image=document.createElement('img');image.alt=`${selected.address}, deed ${doc.ref}, attached image ${pageNumber+1}`;image.decoding='async';image.style.width=zoom+'%';image.hidden=true;
    image.onload=()=>{skeleton.remove();image.hidden=false;};
    // A failure can arrive after the reader turned the page or closed the report; only the current image may react.
    image.onerror=()=>{if(image.parentNode!==stage||!stage.isConnected)return;stage.innerHTML='<div class="image-message"><strong>The deed image could not load.</strong><p>The reference and reviewed notes are preserved. Retry this page or open the full-resolution image.</p><button type="button" id="history-image-retry">Retry image</button></div>';stage.querySelector('#history-image-retry').onclick=renderImage;};
    stage.append(image);image.src=src;applyZoom();
  }
  dialog.addEventListener('keydown',e=>{
    if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    if(e.key==='ArrowRight'&&el('history-next')&&!el('history-next').disabled){e.preventDefault();el('history-next').click();}
    if(e.key==='ArrowLeft'&&el('history-prev')&&!el('history-prev').disabled){e.preventDefault();el('history-prev').click();}
  });
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-open-history]');if(b)open(+b.dataset.openHistory);
  });
})();
