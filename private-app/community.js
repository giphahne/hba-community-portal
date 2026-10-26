(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dlg=document.createElement('dialog');dlg.id='community-dialog';dlg.setAttribute('aria-labelledby','community-title');
  dlg.innerHTML=`<div class="community-shell"><header class="community-head"><div><p>Hamilton Beach Association</p><h2 id="community-title">Community archive</h2></div><button type="button" id="community-close">Back to map</button></header>
    <div class="community-account"><span id="community-account-label">Checking account…</span><div><button type="button" id="community-payment-alert" hidden>Payment reports</button><button type="button" id="community-refresh">Refresh</button><button type="button" id="community-password" hidden>Change password</button><button type="button" id="community-signout" hidden>Sign out</button></div></div>
    <p id="community-status" role="status" aria-live="polite"></p>
    <section id="community-auth" hidden></section>
    <nav id="community-tabs" aria-label="Community archive" hidden></nav>
    <main id="community-content" class="community-content"></main></div>`;
  document.body.append(dlg);
  const editor=document.createElement('dialog');editor.id='community-editor';editor.setAttribute('aria-labelledby','community-editor-title');document.body.append(editor);
  const viewer=document.createElement('dialog');viewer.id='community-viewer';viewer.setAttribute('aria-label','Private archive file');document.body.append(viewer);
  let session={signed_in:false},data=null,homes=null,view='overview',busy=false,month=new Date().toLocaleDateString('en-CA').slice(0,7),selectedDay='',series='',eventYear='',eventId='',homeUid='',workId='',docCategory='',docYear='',docSearch='',issueFilter='',lastFocus;
  let apiBase,lastRenderedView='',accountEpoch=0,meetingId='',lastPaymentId='';const blobs=new Set();
  const $=s=>dlg.querySelector(s),isBoard=()=>['board','admin'].includes(session.member?.role),isAdmin=()=>session.member?.role==='admin',isMember=()=>['resident','board','admin'].includes(session.member?.role);
  function base(){
    if(apiBase)return apiBase;
    const raw=window.__COMMUNITY_API_BASE__||'';
    if(raw.startsWith('__PORT_')){
      if(!['127.0.0.1','localhost'].includes(location.hostname))throw Error('The community service is not configured.');
      return apiBase='http://127.0.0.1:3003';
    }
    if(!raw)throw Error('The community service is unavailable.');
    return apiBase=new URL(raw,document.baseURI).href.replace(/\/$/,'');
  }
  async function api(path,options={}){
    const r=await fetch(base()+path,{cache:'no-store',...options,headers:{...(options.body&&!(options.body instanceof FormData)?{'Content-Type':'application/json'}:{}),...(session.proof?{'X-HBA-Proof':session.proof}:{}),...options.headers}});
    if(!r.ok){let d;try{d=await r.json();}catch{}throw Error(d?.detail||`Service returned ${r.status}`);}
    return options.binary?r.blob():r.json();
  }
  window.HBACommunity={api,isBoard,open:openCommunity,get member(){return session.member||null;},formDialog:(...a)=>formDialog(...a),photoFields:(...a)=>photoFields(...a),bindPhotoList:(...a)=>bindPhotoList(...a),uploadPhotos:(...a)=>uploadPhotos(...a),formStatus:(...a)=>formStatus(...a),showDay:async key=>{month=key.slice(0,7);selectedDay=key;await openCommunity('calendar');},
    // Dashboard decision prompt: open the calendar on that day and the meeting form (recorded meeting, or the standing projection).
    setMeetingLocation:async(key,id)=>{month=key.slice(0,7);selectedDay=key;await openCommunity('calendar');
      const rec=id?(data.meetings||[]).find(m=>m.id===id):null;
      if(rec){meetingForm(rec);return;}
      const rule=window.HBAEventDates.parseRule(data.settings?.public_board_meeting_rule);const [yy,mm]=key.split('-').map(Number);
      const p=window.HBAEventDates.boardMeetingProjection(rule,yy,mm,data.meetings);if(p)meetingForm({...p,id:undefined});}};
  function status(text,error=false){$('#community-status').textContent=text;$('#community-status').classList.toggle('community-error',error);}
  function broadcast(){document.dispatchEvent(new CustomEvent('hba-account-change',{detail:{board:isBoard(),member:session.member||null}}));}
  function revokeBlobs(){blobs.forEach(URL.revokeObjectURL);blobs.clear();}
  function blobURL(blob){const u=URL.createObjectURL(blob);blobs.add(u);return u;}
  function opts(rows,value,label){return rows.map(r=>`<option value="${esc(value(r))}">${esc(label(r))}</option>`).join('');}
  const boardOnly=new Set(['work','members','finance']);
  const tabs=[['overview','Dashboard'],['newsletter','Newsletter'],['sms','Text alerts'],['volunteers','Volunteers'],['finance','Check register'],['bank','Bank reconciliation'],['research','Ask our documents'],['payments','Dues & donations'],['meetings','Board meetings & minutes'],['minutes','Minutes'],['votes','Your vote matters'],['elections','Elections'],['governance','Governance'],['documents','Documents'],['calendar','Calendar'],['events','Event photos'],['households','My household record'],['issues','Report an issue'],['bids','Contractor bids'],['work','Contractor work'],['members','Accounts']];
  function communicationsContext(){return {data,homes,member:session.member,isBoard,isAdmin,deleteButton,formDialog,mutate,render,api,status,openFile:showFile};}
  const byId=(rows,id)=>rows?.find(r=>r.id===id);
  const address=uid=>homes?.properties.find(p=>p.uid===uid)?.address||uid||'Not linked';
  const dateLabel=s=>s?new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Date not supplied';
  const roleLabel=r=>({pending:'Awaiting board approval',resident:'Resident',board:'Board member',admin:'Administrator',suspended:'Access suspended'}[r]||r);
  function blank(title,body){return `<div class="community-empty"><h3>${esc(title)}</h3><p>${esc(body)}</p></div>`;}
  function deleteButton(kind,id){return isAdmin()?`<button type="button" class="community-danger" data-delete-kind="${kind}" data-delete-id="${esc(id)}">Delete</button>`:'';}
  async function refresh(){
    if(busy)return;const epoch=++accountEpoch;busy=true;$('#community-refresh').disabled=true;$('#community-signout').disabled=true;status('Connecting to the private HBA archive…');
    try{
      const incoming=await api('/api/session');if(epoch!==accountEpoch)return;session=incoming;broadcast();
      if(!homes){const r=await fetch('dues-registry-data.json');if(!r.ok)throw Error('Home index unavailable.');homes=await r.json();}
      if(isMember()){const incomingData=await api('/api/community');if(epoch!==accountEpoch)return;data=incomingData;window.HBAEventDates?.setSupperDefaults?.(data.settings?.public_supper_defaults);window.HBAVoting?.reset();}else data=null;
      render();status(isMember()?'Records refreshed.':'');
    }catch(e){status(e.message,true);if(!data)render();}
    finally{if(epoch===accountEpoch){busy=false;$('#community-refresh').disabled=false;$('#community-signout').disabled=false;$('#community-auth').querySelectorAll('button,input').forEach(el=>el.disabled=false);}}
  }
  function render(){
    $('#community-account-label').textContent=session.signed_in?`${session.member.email} · ${roleLabel(session.member.role)}`:'Sign in to the HBA member archive';
    $('#community-signout').hidden=!session.signed_in;$('#community-password').hidden=!session.signed_in;
    $('#community-payment-alert').hidden=!isBoard();
    if(isBoard()&&data){const pending=data.payment_reports?.filter(r=>r.state==='pending')||[];$('#community-payment-alert').textContent=`Payment reports (${pending.length})`;lastPaymentId=pending[0]?.id||'';}
    $('#community-auth').hidden=session.signed_in;
    $('#community-tabs').hidden=!isMember();
    if(!session.signed_in){renderAuth();$('#community-content').innerHTML=blank('Preserve the island’s shared memory','Budgets, meeting minutes, governing documents, event photos and household memories stay in the member archive. Contractor reviews and household dues remain board-only.');return;}
    if(!isMember()){$('#community-content').innerHTML=blank(session.member.role==='pending'?'Your account is awaiting approval':'Member access is unavailable','A board member must approve resident access. The administrator controls board permissions. You can refresh here after approval.');return;}
    if(!data){$('#community-content').innerHTML=blank('Archive not loaded','Use Refresh to retry.');return;}
    if(boardOnly.has(view)&&!isBoard())view='overview';
    const availableTabs=tabs.filter(([v])=>!boardOnly.has(v)||isBoard());
    const tabLabel=(v,label)=>v==='issues'&&isBoard()?'Neighborhood issues':v==='bank'&&!isBoard()?'Financial updates':label;
    // With the dashboard as the base layer the tab strip is hidden, so the header names the open section.
    const current=availableTabs.find(([v])=>v===view);$('#community-title').textContent=current&&view!=='overview'?tabLabel(current[0],current[1]):'Community archive';
    $('#community-tabs').innerHTML=`<label class="community-section-chooser">Go to a section<select id="community-section-select">${availableTabs.map(([v,label])=>`<option value="${v}"${view===v?' selected':''}>${esc(tabLabel(v,label))}</option>`).join('')}</select></label><div class="community-quick-nav">${availableTabs.filter(([v])=>['overview','calendar','payments','issues'].includes(v)).map(([v,label])=>`<button type="button" data-community-view="${v}" aria-pressed="${view===v}">${esc(v==='calendar'?'Events':v==='payments'?'Dues':tabLabel(v,label))}</button>`).join('')}</div>`;
    $('#community-section-select').onchange=e=>{view=e.target.value;selectedDay='';render();};
    $('#community-tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{view=b.dataset.communityView;selectedDay='';render();});
    const quickIssue=$('#community-tabs').querySelector('[data-community-view="issues"]');if(quickIssue)quickIssue.textContent='Issues';
    revokeBlobs();
    $('#community-content').innerHTML=({overview:overview,bids:()=>window.HBABids.render(communicationsContext()),newsletter:()=>window.HBACommunications.newsletter(communicationsContext()),sms:()=>window.HBACommunications.sms(communicationsContext()),minutes:()=>window.HBAMinutes.render(communicationsContext()),votes:()=>window.HBAVoting.render(communicationsContext()),volunteers:()=>window.HBAVolunteers.render(communicationsContext()),finance:()=>window.HBAFinance.render(communicationsContext()),bank:()=>window.HBABank.render(communicationsContext()),research:()=>window.HBAResearch.render(communicationsContext()),payments:payments,meetings:meetings,elections:elections,documents:documents,calendar:calendar,events:eventPhotos,households:households,work:work,members:members,issues:issues,governance:governance}[view])();
    if(lastRenderedView!==view){$('#community-content').scrollTop=0;lastRenderedView=view;}
    bindContent();
    window.HBACommunications.bind(communicationsContext(),$('#community-content'));
    if(view==='minutes')window.HBAMinutes.bind(communicationsContext(),$('#community-content'));
    if(view==='votes')window.HBAVoting.bind(communicationsContext(),$('#community-content'));
    window.HBAVolunteers.bind(communicationsContext(),$('#community-content'));
    window.HBAFinance.bind(communicationsContext(),$('#community-content'));
    window.HBABank.bind(communicationsContext(),$('#community-content'));
    window.HBAResearch.bind(communicationsContext(),$('#community-content'));
    window.HBABids.bind(communicationsContext(),$('#community-content'));
  }
  function renderAuth(){
    $('#community-auth').innerHTML=`<form id="community-login" class="community-login"><h3>Resident & board sign-in</h3><p>Both use the same secure sign-in. Permissions are assigned by the board, never selected at registration.</p>
      <label>Email<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required minlength="8" maxlength="200"></label>
      <div class="community-actions"><button type="submit">Sign in</button></div><p>New residents request an account on the sign-in page (address, optional text-alert topics), confirm their email, and wait for board approval. The designated administrator email is recognized only after its email is verified.</p>
      <details><summary>Confirmation or password help</summary><p>After following the confirmation link in your email, return to this app to sign in. If the landing page does not load, confirmation may still have succeeded. For password recovery, contact the HBA administrator; recovery email setup is required in Supabase before broader rollout.</p></details></form>`;
    const form=$('#community-login');
    if(busy)form.querySelectorAll('button,input').forEach(el=>el.disabled=true);
    async function submit(action){
      if(!form.reportValidity())return;
      ++accountEpoch;
      busy=true;$('#community-refresh').disabled=true;
      const buttons=form.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
      status(action==='signup'?'Creating your account…':'Signing in…');
      try{
        const body=Object.fromEntries(new FormData(form));
        const r=await api('/api/auth/'+action,{method:'POST',body:JSON.stringify(body)});
        form.elements.password.value='';
        if(action==='signup'){status(r.message);return;}
        session=r;broadcast();data=isMember()?await api('/api/community'):null;window.HBAEventDates?.setSupperDefaults?.(data?.settings?.public_supper_defaults);render();status('Signed in.');if(view==='overview'&&isMember()&&!window.HBAShell?.isMap())dlg.close();
      }catch(e){status(e.message,true);}
      finally{busy=false;$('#community-refresh').disabled=false;buttons.forEach(b=>b.disabled=false);}
    }
    form.onsubmit=e=>{e.preventDefault();submit('login');};
  }
  function overview(){
    const today=new Date().toLocaleDateString('en-CA'),up=data.events.filter(e=>window.HBAEventDates.effective(e)>=today&&e.state==='scheduled').sort((a,b)=>window.HBAEventDates.effective(a).localeCompare(window.HBAEventDates.effective(b))).slice(0,4);
    const pending=data.photos.filter(p=>p.status==='pending'&&!p.issue_id&&!p.work_id).length+data.history.filter(h=>h.status==='pending').length;
    return `<div class="community-lede"><p class="community-eyebrow">HBA, through the years</p><h3>A living archive for the next generation.</h3><p>Follow upcoming dates, revisit an event by year, and preserve documents and memories. Community contributions are labeled separately from recorded deed evidence.</p></div>
      <div class="community-stats"><button type="button" data-jump="documents"><strong>${data.documents.length}</strong>Archived documents</button><button type="button" data-jump="events"><strong>${data.events.length}</strong>Event dates</button><button type="button" data-jump="households"><strong>${data.history.filter(h=>h.status==='published').length}</strong>Household stories</button>${isBoard()?`<button type="button" data-jump="members"><strong>${pending}</strong>Contributions awaiting review</button>`:''}</div>
      <section><div class="community-section-head"><h3>Coming up</h3><button type="button" data-jump="calendar">Open calendar</button></div>${up.length?up.map(eventCard).join(''):blank('No upcoming dates entered','The board can add the next meeting, supper or community work day. No dates have been assumed.')}</section>
      <section><div class="community-section-head"><h3>Board meeting planning</h3><button type="button" data-jump="meetings">Meeting dates & agendas</button></div>${(data.meetings||[]).filter(m=>m.state==='scheduled'&&m.meeting_date>=today).slice(0,3).map(m=>`<article class="community-card"><div><span class="community-tag">${dateLabel(m.meeting_date)} · ${esc(m.meeting_time.slice(0,5))} Eastern</span><h4>${esc(m.title)}</h4></div><button type="button" data-meeting-select="${m.id}">View agenda</button></article>`).join('')||'<p class="community-muted">No actual board meeting dates have been entered.</p>'}</section>
      <article class="community-card"><div><h3>Your vote matters</h3><p>Vote on capital improvement funds, elections and motions; see your eligibility and certified results.</p></div><button type="button" data-jump="votes">Open votes & polls</button></article>
      ${isBoard()?`<article class="community-card"><div><h3>New payment reports</h3><p>${(data.payment_reports||[]).filter(r=>r.state==='pending').length} awaiting receipt verification. A report is not proof that funds were received.</p></div><button type="button" data-jump="payments">Review dues & donations</button></article>`:''}
      <section><div class="community-section-head"><h3>Recently archived</h3><button type="button" data-jump="documents">Browse documents</button></div>${data.documents.length?data.documents.slice(0,3).map(documentCard).join(''):blank('Ready for the first records','Upload past budgets, meeting minutes, bylaws and other governing documents as PDFs.')}</section>
      <p class="community-footnote">${isAdmin()?'You are the administrator. Only your role can delete records.':isBoard()?'Board members can add and update official records. Only the administrator can delete.':'Residents may view records, contribute event photos and submit memories for their linked household. New contributions await board review.'}</p>`;
  }
  function documentCard(d){
    const intake=data.document_intakes?.find(i=>i.document_id===d.id);
    const category={budget:'Budget',minutes:'Meeting minutes',governing:'Governing document',history:'History',permit:'Permit',contract:'Contract',other:'Other / automatically classified'}[d.category]||d.category;
    return `<article class="community-card"><div><span class="community-tag">${esc(category)} · ${d.document_year||'Undated'} · ${d.audience==='board'?'Board only':'Member archive'}</span><h4>${esc(d.title)}</h4>${d.description?`<p>${esc(d.description)}</p>`:''}<small>Added ${esc(d.created_at.slice(0,10))}${d.source_date?' · Source date '+esc(d.source_date):''}</small>${intake?`<p>Document intake: ${esc({queued:'Waiting to read',processing:'Reading pages',ready:'Suggestions ready for review',needs_attention:'Needs source review',failed:'Extraction unfinished; original saved'}[intake.state]||intake.state)}</p>`:''}${d.source_sha256?`<details class="community-source-hash"><summary>Original source integrity</summary><small>SHA-256: ${esc(d.source_sha256)}. The uploaded source is preserved. Any viewing conversion does not alter or adopt the original.</small></details>`:''}</div><div class="community-actions"><button type="button" data-file-kind="document" data-file-id="${d.id}">View PDF</button>${d.original_path?`<button type="button" data-file-kind="original" data-file-id="${d.id}">Download original file</button>`:''}${isBoard()?`<button type="button" data-review-document="${d.id}">${intake?'Review extracted information':'Read & organize this file'}</button><button type="button" data-document-visibility="${d.id}">${d.audience==='board'?'Share file with members':'Restrict file to board'}</button>`:''}${deleteButton('document',d.id)}</div></article>`;
  }
  function documents(){
    const years=[...new Set(data.documents.map(d=>d.document_year).filter(Boolean))].sort((a,b)=>b-a);
    const rows=data.documents.filter(d=>(!docCategory||d.category===docCategory)&&(!docYear||String(d.document_year)===docYear)&&(!docSearch||[d.title,d.description].join(' ').toLowerCase().includes(docSearch.toLowerCase())));
    return `<div class="community-section-head"><div><h3>Documents</h3><p>Budgets, meeting minutes, bylaws, contracts, history and permits.</p></div>${isBoard()?'<button type="button" id="community-add-document">Upload & organize a document</button>':''}</div>
      ${isBoard()?'<p class="community-notice">New uploads are board-only. The app reads the file and proposes where its information belongs. Open “Review extracted information,” check the source, then save each useful item. Budget entries remain drafts; no payments, votes or notifications are created automatically.</p>':''}
      <div class="community-filters"><label>Category<select id="community-doc-category"><option value="">All documents</option><option value="budget">Budgets</option><option value="minutes">Meeting minutes</option><option value="governing">Bylaws & governing documents</option><option value="contract">Contracts</option><option value="history">History</option><option value="permit">Permits</option><option value="other">Other / automatic</option></select></label><label>Year<select id="community-doc-year"><option value="">All years</option>${years.map(y=>`<option>${y}</option>`).join('')}</select></label><label>Find a document<input type="search" id="community-doc-search" value="${esc(docSearch)}" placeholder="Title or description"></label></div>
      <div id="community-doc-list">${rows.length?rows.map(documentCard).join(''):blank('No matching documents','The archive is ready for your files. Uploaded records will appear here with their year and category.')}</div>
      ${isBoard()&&(data.document_facts||[]).length?'<h3>Reviewed history, governing & permit notes</h3><p>Board-only, source-linked notes. These do not establish title, current permit validity or a new bylaw adoption.</p>'+data.document_facts.map(n=>`<article class="community-card"><div><span class="community-tag">${esc(n.kind)} · ${n.fact_date||n.fact_year||'Undated'} · Board reviewed</span><h4>${esc(n.title)}</h4><p>${esc(n.detail)}</p><p>${esc(n.location)} · Source page ${n.evidence_page}</p></div><div class="community-actions"><button type="button" data-review-document="${n.document_id}">Open source & review</button>${deleteButton('document-fact',n.id)}</div></article>`).join(''):''}`;
  }
  function eventCard(e){
    const s=byId(data.series,e.series_id),when=window.HBAEventDates.effective(e);
    return `<article class="community-card"><div><span class="community-tag">${dateLabel(when)}${e.event_time?' · '+esc(e.event_time.slice(0,5)):''} · ${e.historical_calculated?'Calculated historical date · unverified':e.state==='scheduled'&&e.planning_only?'Planned date · details pending':esc(e.state)}</span><h4>${esc(e.title)}</h4>
      ${e.rain_date?`<p>${e.use_rain_date?`<strong>Moved to rain date: ${dateLabel(e.rain_date)}.</strong> Original date: ${dateLabel(e.event_date)}.`:`Rain date, only if needed: <strong>${dateLabel(e.rain_date)}</strong>. This is not a second supper.`}</p>`:''}
      ${s?.recurrence_rule?'<p>Every year: third Saturday in August; rain backup the following Saturday.</p>':''}
      <p>${esc(e.location||'Location not supplied')}${s?' · '+esc(s.title):''}</p>${e.description?`<p>${esc(e.description)}</p>`:''}
      ${!e.projected&&!e.historical_calculated&&e.state==='scheduled'&&window.HBAEventDates.effective(e)>=new Date().toLocaleDateString('en-CA')&&window.HBAEngage?window.HBAEngage.signupHTML(e.id,{board:isBoard()}):''}</div>
      <div class="community-actions">${e.projected?(isBoard()?`<button type="button" data-plan-event="${e.id}">Add this year’s event details</button>`:'<p>Annual rule only. The board has not yet added this year’s event details.</p>'):`<button type="button" data-event-photos="${e.id}">View / add photos</button>`}<button type="button" data-ical="${e.id}">Add to calendar</button>${e.rain_date&&!e.use_rain_date&&e.state==='scheduled'?`<button type="button" data-ical-rain="${e.id}">Save rain backup</button>`:''}${isBoard()&&!e.projected?`<button type="button" data-edit-event="${e.id}">Edit date / details</button>`:''}${e.projected?'':deleteButton('event',e.id)}</div></article>`;
  }
  function calendarEvents(){
    const yr=Number(month.slice(0,4)),events=[...data.events];
    if(!Number.isInteger(yr)||yr<1800||yr>2200)return events;
    for(const s of data.series.filter(s=>s.recurrence_rule==='august_third_saturday')){
      const projected=window.HBAEventDates.annualProjection(s,yr,events);
      if(projected)events.push(projected);
    }
    return events;
  }
  const eventById=id=>{
    const saved=byId(data.events,id)||byId(calendarEvents(),id);
    if(saved)return saved;
    for(const s of data.series){
      const prefix='annual-'+s.id+'-';
      if(id?.startsWith(prefix))return window.HBAEventDates.annualProjection(s,Number(id.slice(prefix.length)),data.events);
    }
  };
  const seasonArt=m=>({12:'iceJetty',1:'gardenWinter',2:'iceJetty',3:'dawn',4:'gardenSpring',5:'summer',6:'gardenSummer',7:'summer',8:'supper',9:'gardenAutumn',10:'gardenAutumn',11:'fence'}[m]);
  function tentativeFor(key){
    if(!key.startsWith('2026'))return [];
    const saved=data.events.map(e=>e.title.toLowerCase());
    return window.HBAEventDates.tentative2026.filter(t=>t.date===key&&!saved.some(x=>x.includes(t.title.toLowerCase().split(' (')[0])));
  }
  function countdown(key){
    const today=new Date().toLocaleDateString('en-CA');const d=Math.round((new Date(key+'T12:00:00')-new Date(today+'T12:00:00'))/86400000);
    return d===0?'Today':d===1?'Tomorrow':d>1?`In ${d} days`:d===-1?'Yesterday':`${-d} days ago`;
  }
  function sunMoonLine(key){
    const B=window.HBABeachScene;if(!B)return '';
    const noon=new Date(key+'T12:00:00'),sun=B.sunTimes(noon),moon=B.moonPhase(noon);
    const fmt=t=>t?t.toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}):'—';
    return `<span class="cal-sun">Sunrise ${fmt(sun.rise)} · Sunset ${fmt(sun.set)}</span><span class="cal-moon">${esc(moon.name)}</span>`;
  }
  const timeLabel=t=>{const [h,mi]=String(t||'').split(':').map(Number);return Number.isInteger(h)?new Date(2000,0,1,h,mi||0).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'';};
  function tentativeCard(t){
    const past=t.date<new Date().toLocaleDateString('en-CA');
    return `<article class="community-card cal-tentative"><div><span class="community-tag">${dateLabel(t.date)} · ${esc(t.time)} · ${past?'Newsletter listing':'Tentative'}</span><h4>${esc(t.title)}</h4><p>${esc(t.location||(past?'Location not recorded':'Location to be announced'))}${t.note?' · '+esc(t.note):''}</p><p class="community-muted">${esc(t.source)}. ${past?'The board has not recorded whether it took place.':'Not yet confirmed on the board calendar; time and place may change.'}</p></div>
      <div class="community-actions">${isBoard()?`<button type="button" data-confirm-tentative="${esc(t.id)}">Record this date</button>`:''}</div></article>`;
  }
  function calendar(){
    const [y,m]=month.split('-').map(Number),start=new Date(y,m-1,1).getDay(),days=new Date(y,m,0).getDate(),today=new Date().toLocaleDateString('en-CA');
    const eventRows=calendarEvents();
    const rule=window.HBAEventDates.parseRule(data.settings?.public_board_meeting_rule);
    const monthMeetings=[...(data.meetings||[]),...(window.HBAEventDates.boardMeetingProjection(rule,y,m,data.meetings)?[window.HBAEventDates.boardMeetingProjection(rule,y,m,data.meetings)]:[])];
    const kindOf=e=>e.meeting_date?'meeting':e.tentative?'tentative':byId(data.series,e.series_id)?.recurrence_rule?'supper':'event';
    let cells=Array.from({length:start},()=>'<div class="community-day blank" aria-hidden="true"></div>').join('');
    for(let n=1;n<=days;n++){
      const key=month+'-'+String(n).padStart(2,'0');
      const events=[...eventRows.filter(e=>window.HBAEventDates.onDay(e,key)).map(e=>({...e,kind:window.HBAEventDates.effective(e)!==key?'rain':kindOf(e),short_label:window.HBAEventDates.effective(e)!==key?'Rain':byId(data.series,e.series_id)?.recurrence_rule?'Supper':'Event',title:window.HBAEventDates.effective(e)!==key?'Rain backup: '+e.title:e.title})),
        ...monthMeetings.filter(mt=>mt.meeting_date===key).map(mt=>({...mt,kind:'meeting',short_label:'Meeting'})),
        ...tentativeFor(key).map(t=>({...t,kind:'tentative',short_label:'Tentative'}))];
      const weekend=[0,6].includes(new Date(y,m-1,n).getDay());
      cells+=`<button type="button" class="community-day${key===today?' today':''}${key===selectedDay?' selected':''}${events.length?' has-events':''}${weekend?' weekend':''}${key<today?' past':''}" data-day="${key}" style="--i:${n}" aria-label="${esc(dateLabel(key)+', '+(events.map(e=>e.title).join('; ')||'No events'))}" aria-pressed="${key===selectedDay}"><span>${n}</span>${events.slice(0,2).map(e=>`<small class="calendar-label-full cal-chip cal-chip-${e.kind}">${esc(e.title)}</small><small class="calendar-label-short cal-chip cal-chip-${e.kind}" aria-hidden="true">${esc(e.short_label||'Meeting')}</small>`).join('')}${events.length>2?`<small>+${events.length-2} more</small>`:''}</button>`;
    }
    const rows=eventRows.filter(e=>selectedDay?window.HBAEventDates.onDay(e,selectedDay):window.HBAEventDates.effective(e).startsWith(month)||(e.state==='scheduled'&&!e.use_rain_date&&e.rain_date?.startsWith(month))).sort((a,b)=>window.HBAEventDates.effective(a).localeCompare(window.HBAEventDates.effective(b)));
    const meetings=monthMeetings.filter(e=>selectedDay?e.meeting_date===selectedDay:e.meeting_date.startsWith(month));
    const tentative=(selectedDay?tentativeFor(selectedDay):window.HBAEventDates.tentative2026.filter(t=>t.date.startsWith(month)).flatMap(t=>tentativeFor(t.date).filter(x=>x.id===t.id)));
    // Upcoming strip: the next few dated items of any kind, across months.
    const horizon=[...data.events.filter(e=>e.state==='scheduled').map(e=>({key:window.HBAEventDates.effective(e),title:e.title,kind:kindOf(e)})),
      ...(data.meetings||[]).filter(mt=>mt.state==='scheduled').map(mt=>({key:mt.meeting_date,title:mt.title,kind:'meeting'})),
      ...window.HBAEventDates.boardMeetingsBetween(rule,today,13,data.meetings).map(mt=>({key:mt.meeting_date,title:mt.title,kind:'meeting'})),
      ...window.HBAEventDates.tentative2026.filter(t=>tentativeFor(t.date).some(x=>x.id===t.id)).map(t=>({key:t.date,title:t.title,kind:'tentative'}))];
    for(const s of data.series.filter(s=>s.recurrence_rule==='august_third_saturday')){for(const yr of [new Date().getFullYear(),new Date().getFullYear()+1]){const pr=window.HBAEventDates.annualProjection(s,yr,data.events);if(pr)horizon.push({key:pr.event_date,title:pr.title+' (annual rule)',kind:'supper'});}}
    // Quick view: one year at a time, the year of the month on display.
    // Count forward from the month on display when it is later than today, so August shows August onward.
    const from=month>today.slice(0,7)?month+'-01':today;
    const seenKeys=new Set();const upcoming=horizon.filter(h=>h.key>=from&&h.key.startsWith(String(y))).sort((a,b)=>a.key.localeCompare(b.key)).filter(h=>{const k=h.key+'|'+h.title.replace(' (annual rule)','');if(seenKeys.has(k))return false;seenKeys.add(k);return true;}).slice(0,6);
    const nextKey=horizon.filter(h=>h.key>=today&&h.key.startsWith(String(y+1))).map(h=>h.key).sort()[0]||null;
    const artKey=seasonArt(m),art=window.HBAArt?.[artKey];
    const focusDay=selectedDay||(month===today.slice(0,7)?today:month+'-01');
    return `<figure class="cal-hero" style="${art?`background-image:url('${art.tiny}')`:''}">${art?`<img src="${art.src}" alt="${esc(art.alt)}" loading="lazy" decoding="async">`:''}<div class="cal-hero-text"><p class="cal-eyebrow">HBA calendar</p><h3>${new Date(y,m-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'})}</h3><p class="cal-sunmoon">${selectedDay?esc(dateLabel(selectedDay))+' · ':month===today.slice(0,7)?'Today · ':''}${sunMoonLine(focusDay)}</p></div>${art?`<figcaption>${esc(art.label)}</figcaption>`:''}</figure>
      <div class="community-section-head"><div><p class="community-muted">Times are local to Wareham. Spaghetti Supper: third Saturday in August, with the following Saturday as a rain backup. Earlier years show calculated dates, not proof that a supper was held. Tentative dates come from the newsletter until the board records them.${rule?' Board of Governors meetings: '+esc(window.HBAEventDates.ruleLabel(rule))+'; recorded meetings replace the standing date.':''}</p></div>${isBoard()?'<div class="community-actions"><button type="button" id="community-add-series">Add event series</button><button type="button" id="community-add-event">Add event date</button></div>':''}</div>
      ${upcoming.length?`<div class="cal-upcoming" aria-label="Coming up in ${y}"><p class="cal-up-year">Coming up in ${y}</p>${upcoming.map(u=>`<button type="button" class="cal-up cal-up-${u.kind}" data-jump-day="${u.key}"><span class="cal-up-when">${esc(countdown(u.key))}</span><strong>${esc(u.title)}</strong><span>${esc(dateLabel(u.key))}</span></button>`).join('')}${nextKey?`<button type="button" class="cal-year-jump cal-up" data-jump-day="${nextKey}"><span class="cal-up-when">Next year</span><strong>Show ${y+1}</strong><span>${esc(dateLabel(nextKey))} onward</span></button>`:''}</div>`:nextKey?`<p class="community-muted">Nothing more is on the ${y} calendar. <button type="button" class="cal-year-jump" data-jump-day="${nextKey}">Show ${y+1}</button></p>`:''}
      <div class="community-calendar-tools"><button type="button" id="community-month-prev" aria-label="Previous month">Previous</button><label>Month<input type="month" id="community-month" value="${month}"></label><button type="button" id="community-month-next" aria-label="Next month">Next</button><button type="button" id="community-month-today">Today</button></div>
      <div class="community-calendar" aria-label="Event dates">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="community-weekday">${d}</div>`).join('')}${cells}</div>
      <p class="cal-key"><span class="cal-chip cal-chip-supper">Supper</span><span class="cal-chip cal-chip-event">Event</span><span class="cal-chip cal-chip-meeting">Meeting</span><span class="cal-chip cal-chip-tentative">Tentative</span><span class="cal-chip cal-chip-rain">Rain backup</span> Select a date for details.</p>
      <div class="community-section-head"><h3>${selectedDay?dateLabel(selectedDay):new Date(y,m-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'})}</h3>${selectedDay?'<button type="button" id="community-clear-day">Show whole month</button>':''}</div>
      ${meetings.map(mt=>mt.projected?`<article class="community-card cal-standing"><div><span class="community-tag">Board meeting · ${dateLabel(mt.meeting_date)} · ${esc(timeLabel(mt.meeting_time))} Eastern · standing schedule</span><h4>${esc(mt.title)}</h4><p class="community-muted">${esc(mt.rule_label)}. ${mt.location?esc(mt.location)+'. ':''}Shown from the standing schedule; the board has not recorded this meeting yet, so there is no agenda or location to show.</p></div>${data.can_schedule?`<button type="button" data-record-meeting="${esc(mt.meeting_date)}">Record this meeting</button>`:''}</article>`:`<article class="community-card"><div><span class="community-tag">Board meeting · ${dateLabel(mt.meeting_date)} · ${esc(timeLabel(mt.meeting_time))} Eastern · ${esc(mt.state)}</span><h4>${esc(mt.title)}</h4></div><button type="button" data-meeting-select="${mt.id}">View agenda</button></article>`).join('')}${rows.map(eventCard).join('')}${tentative.map(tentativeCard).join('')}${!rows.length&&!meetings.length&&!tentative.length?blank('No dates entered for this selection','Choose another month, or ask the board to add a documented past event or a future date.'):''}`;
  }
  function photoCard(p){
    return `<figure class="community-photo"><button type="button" class="community-photo-open" data-file-kind="photo" data-file-id="${p.id}" aria-label="Open photo: ${esc(p.caption||'event photograph')}"><img data-private-photo="${p.id}" alt="${esc(p.caption||'HBA contributed photograph')}" loading="lazy"><span data-photo-loading="${p.id}">Loading photo…</span></button><figcaption>${esc(p.caption||'No caption supplied')}${p.credit?`<small>Credit: ${esc(p.credit)}</small>`:''}<span class="community-tag">${p.status==='pending'?'Awaiting board review':'Published'}</span></figcaption><div class="community-actions">${isBoard()&&p.status==='pending'?`<button type="button" data-publish-kind="photo" data-publish-id="${p.id}">Publish photo</button>`:''}${deleteButton('photo',p.id)}</div></figure>`;
  }
  function gallery(kind,parent){const key={event:'event_id',history:'history_id',work:'work_id',issue:'issue_id'}[kind],rows=data.photos.filter(p=>p[key]===parent);return `<div class="community-gallery">${rows.map(photoCard).join('')}</div>${!rows.length?'<p class="community-muted">No photos have been added yet.</p>':''}`;}
  function eventPhotos(){
    if(!series&&data.series.length)series=data.series[0].id;
    const chosenSeries=byId(data.series,series),annual=chosenSeries?.recurrence_rule==='august_third_saturday';
    const all=data.events.filter(e=>e.series_id===series).sort((a,b)=>b.event_date.localeCompare(a.event_date));
    const firstYear=chosenSeries?.first_year||1974;
    const years=[...new Set(all.map(e=>e.event_date.slice(0,4)).concat(annual?Array.from({length:Math.max(0,new Date().getFullYear()+6-firstYear)},(_,i)=>String(new Date().getFullYear()+5-i)):[]))].sort((a,b)=>b.localeCompare(a));if(eventYear&&!years.includes(eventYear))eventYear='';
    if(eventYear&&annual){
      const projected=window.HBAEventDates.annualProjection(chosenSeries,Number(eventYear),all);
      if(projected)all.push(projected);
    }
    const rows=all.filter(e=>!eventYear||e.event_date.startsWith(eventYear));
    if(!rows.some(e=>e.id===eventId))eventId=rows[0]?.id||'';
    const event=byId(all,eventId);
    return `<div class="community-section-head"><div><h3>Event memories</h3><p>Choose an event, then a year and exact date. Residents and board members can add photos.</p></div>${isBoard()?'<div class="community-actions"><button type="button" id="community-add-series">Add event series</button>'+deleteButton('series',series)+'</div>':''}</div>
      <div class="community-filters"><label>Event series<select id="community-event-series">${opts(data.series,r=>r.id,r=>r.title)}</select></label><label>Year<select id="community-event-year"><option value="">All years</option>${years.map(y=>`<option>${y}</option>`).join('')}</select></label><label>Occurrence date<select id="community-event-id">${rows.length?opts(rows,r=>r.id,r=>dateLabel(r.event_date)+' · '+r.title):'<option value="">No dates entered</option>'}</select></label></div>
      ${annual?`<p>First Spaghetti Supper: <strong>${firstYear}</strong> (member-provided history). Choose a year from ${firstYear} onward for its calculated supper and rain dates. Calculated dates do not confirm that a supper was held. Recorded dates take priority.</p>`:''}
      ${event?eventCard(event)+(event.projected?'<p>No historical occurrence or photo album has been recorded for this year. The board can add the actual event details and then residents can contribute photos.</p>':`<div class="community-section-head"><h3>Photo gallery</h3><button type="button" data-add-photo-kind="event" data-add-photo-id="${event.id}">Add event photo</button></div>`+gallery('event',event.id)):blank('The story starts with a date','Choose a year to see its calculated annual date, or ask the board to add a documented occurrence.')}
      <p class="community-footnote">Resident photos await board review before other residents can see them. Upload only photos you have permission to share, with consent for identifiable people. Location metadata is stripped from uploaded photos. Only the administrator can delete.</p>`;
  }
  function households(){
    // Own house only: residents and board members see their own household record; the administrator sees every household.
    const ownUids=new Set([session.member.household_uid,...(window.HBAHousePrivacy?.own?.()||[])].filter(Boolean));
    const pickable=isAdmin()?homes.properties:homes.properties.filter(p=>ownUids.has(p.uid));
    if(!pickable.length)return `<div class="community-section-head"><div><h3>My household record</h3><p>Memories for future residents, kept separate from the recorded title chain.</p></div></div>${blank('No house is linked to your account yet','Ask the board to link your account to your address; then your household’s entries appear here. Other households’ records are private to them and the administrator.')}`;
    if(!pickable.some(p=>p.uid===homeUid))homeUid=pickable[0].uid;
    const rows=data.history.filter(h=>h.household_uid===homeUid);
    const canAdd=isAdmin()||ownUids.has(homeUid);
    return `<div class="community-section-head"><div><h3>Household history</h3><p>Memories for future residents, kept separate from the recorded title chain.</p></div>${canAdd?'<button type="button" id="community-add-history">Add household memory</button>':''}</div>
      ${pickable.length>1?`<label class="community-house-picker">Household address<select id="community-household">${opts(pickable,p=>p.uid,p=>p.address)}</select></label>`:`<p class="community-notice">${esc(pickable[0].address)} · your household</p>`}
      ${!session.member.household_uid&&!isBoard()?'<p class="community-notice">A board member must link your account to your address before you can add your household’s history. You may still view published memories.</p>':''}
      <p><button type="button" id="community-house-deeds">Open recorded property history</button></p>
      ${rows.length?rows.map(h=>`<article class="community-story"><span class="community-tag">${h.history_year||'Year not supplied'} · ${h.status==='pending'?'Awaiting review':'Resident-contributed history'}</span><h4>${esc(h.title)}</h4><p class="community-prewrap">${esc(h.story)}</p><small>Submitted ${h.created_at.slice(0,10)}. Personal account, not a title determination.</small><div class="community-actions">${isBoard()&&h.status==='pending'?`<button type="button" data-publish-kind="history" data-publish-id="${h.id}">Publish memory</button>`:''}${isBoard()||h.created_by===session.member.id?`<button type="button" data-add-photo-kind="history" data-add-photo-id="${h.id}">Add household photo</button>`:''}${deleteButton('history',h.id)}</div>${gallery('history',h.id)}</article>`).join(''):blank('No memories submitted for this home','Add documented dates, photographs or a personal recollection. Do not include private contact information or replace deed evidence with a family story.')}`;
  }
  const workState={planned:'Planned',in_progress:'In progress',incomplete:'Incomplete',defect:'Defect flagged',resolved:'Reported resolved',accepted:'Board accepted'};
  function work(){
    workId||=data.work?.[0]?.id||'';const w=byId(data.work,workId);
    const rows=data.work_notes?.filter(n=>n.work_id===workId)||[];
    return `<div class="community-section-head"><div><h3>Contractor work log</h3><p>Board-only documentation of scope, progress, incomplete items and reported defects.</p></div><button type="button" id="community-add-work">Add work project</button></div>
      ${data.work?.length?`<label class="community-house-picker">Project<select id="community-work-id">${opts(data.work,w=>w.id,w=>w.title+' · '+workState[w.state])}</select></label>`:''}
      ${w?`<article class="community-story"><span class="community-tag">${esc(workState[w.state])} · ${dateLabel(w.work_date)}</span><h4>${esc(w.title)}</h4><p>${esc(w.contractor||'Contractor not supplied')} · ${esc(w.location||'Location not supplied')}</p><p class="community-prewrap">${esc(w.description)}</p><div class="community-actions"><button type="button" data-edit-work="${w.id}">Update scope / status</button><button type="button" id="community-add-work-note">Add observation / flag</button><button type="button" data-add-photo-kind="work" data-add-photo-id="${w.id}">Upload work photo</button>${deleteButton('work',w.id)}</div></article>
      <h3>Observation history</h3>${rows.map(n=>`<article class="community-card"><div><span class="community-tag">${esc(n.flag)} · ${n.created_at.slice(0,10)}</span><p class="community-prewrap">${esc(n.note)}</p></div>${deleteButton('work-note',n.id)}</article>`).join('')||'<p>No observations entered yet.</p>'}<h3>Work photos</h3>${gallery('work',w.id)}`:blank('No contractor work entered','Add a project, then record scope and dated observations with photographs. Flags are board observations, not an independent engineering determination.')}
      <p class="community-footnote">Progress notes and flags remain in the log when a project status changes. Only the administrator can delete records or photos.</p>`;
  }
  function members(){
    const pendingPhotos=data.photos.filter(p=>p.status==='pending'&&!p.issue_id&&!p.work_id),pendingHistory=data.history.filter(h=>h.status==='pending');
    return `<div class="community-section-head"><div><h3>Accounts & contribution review</h3><p>Approve residents and link their household address. Only the administrator can assign board access or delete records.</p></div></div>
      ${data.members.some(m=>m.role==='pending')?`<p class="community-notice">${data.members.filter(m=>m.role==='pending').length} account request(s) waiting. Check the requested address against the deed or dues registry before approving; approval links the household and activates any text-alert topics the resident asked for.</p>`:''}
      <div class="community-member-list">${[...data.members].sort((a,b)=>(a.role==='pending'?0:1)-(b.role==='pending'?0:1)).map(m=>{const extra=(data.member_households||[]).filter(h=>h.member_id===m.id);return `<article class="community-card"><div><h4>${esc(m.display_name||m.email)}</h4><p>${esc(m.email)} · ${esc(roleLabel(m.role))}</p><small>${esc(address(m.household_uid))}${extra.length?' · also '+extra.map(h=>esc(address(h.household_uid))).join(', '):''}</small>${m.role==='pending'?`<small>Requested: ${esc(m.requested_household_uid?address(m.requested_household_uid):'no address chosen')}${m.requested_at?' · '+esc(m.requested_at.slice(0,10)):''}</small>${m.request_note?`<p class="community-prewrap">${esc(m.request_note)}</p>`:''}<small>${m.sms_request?'Asked for text alerts: '+esc((m.sms_request.topics||[]).join(', ')):'No text alerts requested'}</small>`:''}</div><div class="community-actions">${m.role!=='admin'&&(isAdmin()||m.role!=='board')?`<button type="button" data-edit-member="${m.id}">${m.role==='pending'?'Review request':'Permissions / household'}</button>`:''}${isBoard()&&m.role!=='pending'&&m.household_uid?`<button type="button" data-link-household="${m.id}">Add co-owned property</button>`:''}${extra.map(h=>isAdmin()?`<button type="button" class="community-danger" data-unlink-household="${h.member_id}/${esc(h.household_uid)}">Remove ${esc(address(h.household_uid))}</button>`:'').join('')}${canManageAccount(m)?`<button type="button" data-reset-password="${m.id}">Reset password</button><button type="button" class="community-danger" data-delete-member="${m.id}">${m.role==='pending'?'Delete request':'Delete resident'}</button>`:''}</div>${m.must_change_password?'<small class="community-account-flag">Temporary password issued; they choose a new one at their next sign-in.</small>':''}</article>`;}).join('')}</div>
      ${accountLog()}
      <h3>Photos awaiting review (${pendingPhotos.length})</h3><div class="community-gallery">${pendingPhotos.map(photoCard).join('')}</div>
      <h3>Household memories awaiting review (${pendingHistory.length})</h3>${pendingHistory.map(h=>`<article class="community-card"><div><h4>${esc(h.title)}</h4><p>${esc(address(h.household_uid))}</p><p class="community-prewrap">${esc(h.story)}</p></div><div class="community-actions"><button type="button" data-publish-kind="history" data-publish-id="${h.id}">Publish memory</button>${deleteButton('history',h.id)}</div></article>`).join('')||'<p>No household memories await review.</p>'}`;
  }
  const issueStates={pending_meeting:'Pending review for next meeting',approved:'Approved',rejected:'Rejected',further_review:'Pending further review',complete:'Project complete'};
  const issueCategories={roads:'Roads',drainage:'Drainage',beach:'Beach / shoreline',safety:'Safety',common_area:'Common areas',general:'General'};
  function issues(){
    const rows=(data.issues||[]).filter(i=>!issueFilter||i.state===issueFilter);
    return `<div class="community-section-head"><div><h3>${isBoard()?'Neighborhood issue bulletin board':'Report a neighborhood issue'}</h3><p>Describe something that needs attention and attach a photo. The bulletin board and review notes are visible only to board members.</p></div><button type="button" id="community-add-issue">Submit an issue</button></div>
      <p class="community-notice">Not monitored for emergencies. For immediate danger, use emergency services rather than this form. An Approved issue status is a workflow label, not a recorded bylaw vote or authorization to spend.</p>
      ${isBoard()?`<label class="community-house-picker">Review category<select id="community-issue-filter"><option value="">All review statuses</option>${Object.entries(issueStates).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>
      <div class="community-issue-summary">${Object.entries(issueStates).map(([v,l])=>`<span>${esc(l)}: <strong>${(data.issues||[]).filter(i=>i.state===v).length}</strong></span>`).join('')}</div>
      ${rows.length?rows.map(i=>`<article class="community-story"><span class="community-tag">${esc(issueStates[i.state])} · ${esc(issueCategories[i.category])}</span><h4>${esc(i.title)}</h4><p>${esc(i.location||'Location not supplied')} · Submitted ${i.created_at.slice(0,10)}</p><p class="community-prewrap">${esc(i.description)}</p>${i.board_note?`<h5>Board review note</h5><p class="community-prewrap">${esc(i.board_note)}</p>`:''}<div class="community-actions"><button type="button" data-review-issue="${i.id}">Review / change status</button><button type="button" data-add-photo-kind="issue" data-add-photo-id="${i.id}">Add issue photo</button>${deleteButton('issue',i.id)}</div>${gallery('issue',i.id)}</article>`).join(''):blank('No issues in this selection','Resident and board submissions will appear here for review.')}`
      :blank('Your report goes directly to the board','You will receive a receipt number after submission. Other residents cannot browse reports or the board’s review notes. The board manages the next-meeting queue and follow-up statuses.')}`;
  }
  const decisionTypes={board:'Board / operating plan',capital:'Capital expenditure',dues:'Dues increase',amendment:'Bylaw amendment',emergency:'Presidential emergency expenditure'};
  function governance(){
    const g=window.HBA_GOVERNANCE,governing=data.documents.filter(d=>d.category==='governing');
    return `<div class="community-section-head"><div><h3>Governance & responsibilities</h3><p>${esc(g.basis)}</p></div></div>
      <div class="community-notice">Software access does not confer elected office, a vote, membership, spending authority or title to land. The guide supports the supplied documents; it does not change them.</div>
      <h3>Source documents</h3>${governing.map(documentCard).join('')||blank('Governing documents are being added','The uploaded originals and readable PDF copies will be stored in the private archive.')}
      <h3>Bylaw reference guide</h3><div class="community-rules">${g.rules.map(r=>`<details><summary>${esc(r.title)}</summary><p>${esc(r.text)}</p><small>${esc(r.source)}</small></details>`).join('')}</div>
      <h3>Annual planning checkpoints</h3><ul class="community-governance-list"><li><strong>Before March 1:</strong> finalize the calendar-year operating budget.</li><li><strong>May 1:</strong> requested dues remittance date.</li><li><strong>April–September:</strong> board meetings monthly if needed.</li><li><strong>June and August:</strong> planned general meetings; elections every other August starting in 2027, as supplied by a member.</li><li><strong>Annual records:</strong> newsletter with upcoming dates, formal minutes, filings and budget reporting.</li></ul><p class="community-footnote">These are bylaw-based reminders, not scheduled meetings. Actual dates are entered separately in Calendar.</p>
      <h3>Officer & governor directory</h3><p class="community-muted">Record elected or appointed office separately from app access. “Not entered” does not mean an office is vacant.</p><div class="community-offices">${g.offices.map(position=>{const o=data.officeholders?.find(o=>o.position===position);return `<article class="community-card"><div><h4>${esc(position)}</h4><p>${esc(o?.member_name||'Not entered')}</p>${o&&(o.contact_phone||o.contact_email)&&o.share_contact!==false?`<small>${esc([o.contact_phone,o.contact_email].filter(Boolean).join(' · '))}</small>`:''}${o?`<small>Term ${o.term_start||'start not supplied'} to ${o.term_end||'end not supplied'}</small><small>${esc(o.source_note||'Appointment/election source not supplied')}</small>`:''}</div>${isBoard()?`<div class="community-actions"><button type="button" data-office-position="${esc(position)}">${o?'Update record':'Enter officeholder'}</button>${o?deleteButton('officeholder',o.id):''}</div>`:''}</article>`;}).join('')}</div>
      ${isBoard()?`<div class="community-section-head"><div><h3>Decision & approval register</h3><p>Board-only transcription of motions and supporting minutes. This is not an online vote or automatic validity check.</p></div><button type="button" id="community-add-decision">Record a motion / decision</button></div>
      ${(data.decisions||[]).map(d=>`<article class="community-story"><span class="community-tag">${esc(decisionTypes[d.decision_type])} · ${dateLabel(d.meeting_date)} · Recorded as ${esc(d.recorded_outcome)}</span><h4>${esc(d.title)}</h4><p class="community-prewrap">${esc(d.motion)}</p><p>Amount: ${d.amount===null?'not entered':'$'+Number(d.amount).toLocaleString('en-US',{minimumFractionDigits:2})} · Governors able to vote: ${d.governors_present??'not entered'} · Members/households represented: ${d.members_represented??'not entered'}</p><p>Yes: ${d.votes_yes??'not entered'} · No: ${d.votes_no??'not entered'} · Abstain: ${d.abstentions??'not entered'}</p><p class="community-prewrap">${esc(d.review_notes)}</p><div class="community-actions">${d.minutes_id?`<button type="button" data-file-kind="document" data-file-id="${d.minutes_id}">Supporting minutes</button>`:'<span class="community-tag">No supporting minutes linked</span>'}${deleteButton('decision',d.id)}</div><p class="community-footnote">Recorded outcome only. Confirm eligibility, written proxies, quorum, conflicts and the correct approval body against the source minutes and applicable rules.</p></article>`).join('')||blank('No decisions recorded','Link the actual minutes and record counts rather than treating an issue status or simulator scenario as an approval.')}`:''}
      <h3>Items still needing board confirmation</h3><ul class="community-governance-list">${g.cautions.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>`;
  }
  function bindContent(){
    const root=$('#community-content'),bind=(selector,fn)=>root.querySelectorAll(selector).forEach(el=>el.onclick=()=>{const p=fn(el);if(p?.catch)p.catch(()=>{});});
    bind('[data-jump]',el=>{view=el.dataset.jump;render();});
    bind('[data-file-kind]',el=>showFile(el.dataset.fileKind,el.dataset.fileId));
    bind('[data-open-minutes]',el=>{window.HBAMinutes.open(el.dataset.openMinutes);view='minutes';render();});
    bind('[data-write-minutes]',el=>{view='minutes';render();$('#community-content').querySelector(`[data-minutes-from="${el.dataset.writeMinutes}"]`)?.click();});
    bind('[data-event-photos]',el=>{const e=byId(data.events,el.dataset.eventPhotos);series=e.series_id;eventYear=e.event_date.slice(0,4);eventId=e.id;view='events';render();});
    bind('[data-ical]',el=>downloadCalendar(eventById(el.dataset.ical)));
    bind('[data-ical-rain]',el=>downloadCalendar(eventById(el.dataset.icalRain),true));
    bind('[data-plan-event]',el=>eventForm(eventById(el.dataset.planEvent)));
    bind('[data-edit-election]',el=>electionForm(data.elections.find(e=>e.year===Number(el.dataset.editElection))));
    bind('[data-review-document]',el=>window.HBADocumentIntake.open(el.dataset.reviewDocument,communicationsContext()));
    bind('[data-document-visibility]',el=>window.HBADocumentIntake.visibility(byId(data.documents,el.dataset.documentVisibility),communicationsContext()));
    bind('[data-delete-kind]',el=>confirmDelete(el.dataset.deleteKind,el.dataset.deleteId));
    bind('[data-edit-event]',el=>eventForm(byId(data.events,el.dataset.editEvent)));
    bind('[data-edit-work]',el=>workForm(byId(data.work,el.dataset.editWork)));
    bind('[data-edit-member]',el=>memberForm(byId(data.members,el.dataset.editMember)));
    bind('[data-reset-password]',el=>resetPasswordForm(byId(data.members,el.dataset.resetPassword)));
    bind('[data-delete-member]',el=>deleteMemberForm(byId(data.members,el.dataset.deleteMember)));
    bind('[data-link-household]',el=>{const m=byId(data.members,el.dataset.linkHousehold);formDialog('Link an additional property',`<p>${esc(m.email)} · primary household ${esc(address(m.household_uid))}</p><label>Additional property owned<select name="household_uid" required>${opts(homes.properties.filter(p=>p.uid!==m.household_uid),p=>p.uid,p=>p.address)}</select></label><label>Why (deed or registry reference)<input name="note" maxlength="300" required></label><p>Each dues-paid property is one vote (bylaws Article VII). The extra property only counts when its dues are recorded as paid.</p>`,fd=>mutate('/api/member-households',{method:'POST',body:JSON.stringify({member_id:m.id,...Object.fromEntries(fd)})},'Property linked to this account.'));});
    bind('[data-unlink-household]',el=>mutate('/api/member-households/'+el.dataset.unlinkHousehold,{method:'DELETE'},'Property link removed.'));
    bind('[data-review-issue]',el=>issueReviewForm(byId(data.issues,el.dataset.reviewIssue)));
    bind('[data-office-position]',el=>officeForm(el.dataset.officePosition));
    bind('[data-edit-meeting]',el=>meetingForm(byId(data.meetings,el.dataset.editMeeting)));
    bind('[data-edit-agenda]',el=>agendaForm(byId(data.agenda,el.dataset.editAgenda)));
    bind('[data-review-payment]',el=>paymentReviewForm(byId(data.payment_reports,el.dataset.reviewPayment)));
    bind('[data-meeting-select]',el=>{meetingId=el.dataset.meetingSelect;view='meetings';render();});
    bind('[data-add-photo-kind]',el=>photoForm(el.dataset.addPhotoKind,el.dataset.addPhotoId));
    bind('[data-publish-kind]',el=>mutate('/api/publish/'+el.dataset.publishKind+'/'+el.dataset.publishId,{method:'POST'},'Contribution published.'));
    const click=(id,fn)=>{const e=root.querySelector('#'+id);if(e)e.onclick=fn;};
    const change=(id,fn,value)=>{const e=root.querySelector('#'+id);if(e){if(value!==undefined)e.value=value;e.onchange=()=>fn(e.value);}};
    click('community-add-document',documentForm);click('community-add-event',()=>eventForm());click('community-add-series',seriesForm);
    click('community-add-history',historyForm);click('community-add-work',()=>workForm());click('community-add-work-note',workNoteForm);
    click('community-add-issue',issueForm);change('community-issue-filter',v=>{issueFilter=v;render();},issueFilter);
    click('community-add-decision',decisionForm);
    click('community-open-minutes-tab',()=>{view='minutes';render();});
    click('community-add-meeting',()=>meetingForm());
    click('community-add-agenda',()=>agendaForm());
    click('community-meeting-access',meetingAccessForm);
    click('community-meeting-invite',meetingInvitation);
    click('community-meeting-ical',()=>downloadMeetingCalendar(byId(data.meetings,meetingId)));
    click('community-payment-settings',paymentSettingsForm);
    click('community-report-payment',paymentReportForm);
    click('community-open-dues',()=>{dlg.close();window.openDuesRegistry();});
    click('community-add-advisory',advisoryForm);
    click('community-public-bulletin',()=>window.openHBABulletin());
    change('community-meeting-id',v=>{meetingId=v;render();},meetingId);
    change('community-doc-category',v=>{docCategory=v;render();},docCategory);change('community-doc-year',v=>{docYear=v;render();},docYear);
    change('community-doc-search',v=>{docSearch=v;render();},docSearch);
    change('community-event-series',v=>{series=v;eventYear='';eventId='';render();},series);
    change('community-event-year',v=>{eventYear=v;eventId='';render();},eventYear);
    change('community-event-id',v=>{eventId=v;render();},eventId);
    change('community-household',v=>{homeUid=v;render();},homeUid);
    change('community-work-id',v=>{workId=v;render();},workId);
    change('community-month',v=>{if(v){month=v;selectedDay='';render();}},month);
    const shift=n=>{const [y,m]=month.split('-').map(Number),d=new Date(y,m-1+n,1);month=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');selectedDay='';render();};
    click('community-month-prev',()=>shift(-1));click('community-month-next',()=>shift(1));
    click('community-month-today',()=>{month=new Date().toLocaleDateString('en-CA').slice(0,7);selectedDay='';render();});
    click('community-clear-day',()=>{selectedDay='';render();});
    bind('[data-day]',el=>{selectedDay=el.dataset.day;render();});
    bind('[data-jump-day]',el=>{selectedDay=el.dataset.jumpDay;month=selectedDay.slice(0,7);render();});
    // Volunteer sign-up lines: fill in live counts once they arrive and keep them fresh.
    if(window.HBAEngage&&$('#community-content').querySelector('[data-signup-for]')){const root=$('#community-content');window.HBAEngage.bindSignups(root,()=>window.HBAEngage.refreshSignupNodes(root,isBoard()));window.HBAEngage.loadSignups().then(()=>window.HBAEngage.refreshSignupNodes(root,isBoard()));}
    bind('[data-record-meeting]',el=>{const rule=window.HBAEventDates.parseRule(data.settings?.public_board_meeting_rule);const [yy,mm]=el.dataset.recordMeeting.split('-').map(Number);const p=window.HBAEventDates.boardMeetingProjection(rule,yy,mm,data.meetings);if(p)meetingForm({...p,id:undefined});});
    bind('[data-confirm-tentative]',el=>{const t=window.HBAEventDates.tentative2026.find(x=>x.id===el.dataset.confirmTentative);if(!t)return;const s=data.series.find(x=>!x.recurrence_rule)||data.series[0];eventForm({title:t.title,event_date:t.date,event_time:t.time,location:t.location,description:t.source+'.'+(t.note?' '+t.note:''),state:'scheduled',planning_only:true,series_id:s?.id,projected:true});});
    click('community-house-deeds',()=>{const p=homes.properties.find(p=>p.uid===homeUid);dlg.close();window.openPropertyHistory(p.index);});
    root.querySelectorAll('[data-private-photo]').forEach(async img=>{
      try{const blob=await api('/api/files/photo/'+img.dataset.privatePhoto,{binary:true});if(!img.isConnected)return;img.src=blobURL(blob);img.onload=()=>{const label=img.nextElementSibling;if(label)label.hidden=true;};}
      catch(e){if(img.isConnected){img.nextElementSibling.textContent='Photo unavailable. '+e.message;img.hidden=true;}}
    });
  }
  async function mutate(path,options,message){
    status('Saving…');
    try{const result=await api(path,options);data=await api('/api/community');window.HBAEventDates?.setSupperDefaults?.(data.settings?.public_supper_defaults);render();status(message);return result;}
    catch(e){status(e.message,true);throw e;}
  }
  function formDialog(title,fields,submit,initial={},button='Save'){
    editor.innerHTML=`<form class="community-form"><header><h3 id="community-editor-title">${esc(title)}</h3><button type="button" id="community-editor-close">Cancel</button></header>${fields}<p id="community-form-status" role="status"></p><button type="submit" class="community-submit">${esc(button)}</button></form>`;
    const form=editor.querySelector('form');
    Object.entries(initial).forEach(([k,v])=>{const el=form.elements[k];if(el&&v!==null&&v!==undefined)el.value=v;});
    editor.querySelector('#community-editor-close').onclick=()=>editor.close();
    form.onsubmit=async e=>{
      e.preventDefault();if(!form.reportValidity())return;const b=form.querySelector('[type=submit]');b.disabled=true;
      const message=editor.querySelector('#community-form-status');message.textContent='Saving…';
      try{await submit(new FormData(form));editor.close();}catch(err){message.textContent=err.message;message.className='community-error';}finally{b.disabled=false;}
    };
    editor.showModal();
    return form;
  }
  function formStatus(text){const m=editor.querySelector('#community-form-status');if(m){m.textContent=text;m.className='';}}
  // Multi-photo picker: several photos at once, a thumbnail list with its own caption per photo, remove buttons,
  // and sequential uploads that report progress and keep the unsent photos in the list when one fails.
  const PHOTO_TYPES=['image/jpeg','image/png','image/webp'],PHOTO_MAX=6*1024*1024;
  function photoFields({required=false,label='Photos · JPEG, PNG or WebP · up to 6 MB each'}={}){
    return `<label>${label}<input type="file" name="file" accept="image/jpeg,image/png,image/webp" multiple${required?' required':''}></label>
      <p class="community-photo-hint">You can choose several photos at once. Choose again to add more.</p>
      <ol class="community-photo-list" data-photo-list aria-live="polite"></ol>`;
  }
  function bindPhotoList(form){
    const input=form.querySelector('input[type=file][name=file]'),list=form.querySelector('[data-photo-list]');
    let items=[];
    const fmt=n=>n>=1024*1024?(n/1024/1024).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
    function draw(){
      list.innerHTML=items.map((it,i)=>`<li><img src="${it.url}" alt=""><div><strong>${esc(it.file.name)}</strong><span>${fmt(it.file.size)}${it.problem?' · '+esc(it.problem):''}</span><input type="text" maxlength="300" placeholder="Caption for this photo (optional)" data-photo-caption="${i}" value="${esc(it.caption||'')}"></div><button type="button" data-photo-remove="${i}" aria-label="Remove ${esc(it.file.name)}">Remove</button></li>`).join('');
      list.querySelectorAll('[data-photo-caption]').forEach(el=>el.oninput=()=>{items[Number(el.dataset.photoCaption)].caption=el.value;});
      list.querySelectorAll('[data-photo-remove]').forEach(b=>b.onclick=()=>{const it=items.splice(Number(b.dataset.photoRemove),1)[0];URL.revokeObjectURL(it.url);if(!items.length)input.value='';draw();});
      if(items.length)input.removeAttribute('required');else if(input.dataset.required)input.setAttribute('required','');
      formStatus(items.length?`${items.length} photo${items.length===1?'':'s'} ready to upload.`:'');
    }
    if(input.required)input.dataset.required='1';
    input.onchange=()=>{
      for(const f of input.files){
        if(items.some(it=>it.file.name===f.name&&it.file.size===f.size))continue;
        const problem=!PHOTO_TYPES.includes(f.type)?'Not a JPEG, PNG or WebP photo':f.size>PHOTO_MAX?'Larger than 6 MB':'';
        items.push({file:f,url:URL.createObjectURL(f),caption:'',problem});
      }
      draw();
    };
    return {files:()=>items.slice(),remove:it=>{const i=items.indexOf(it);if(i>=0){items.splice(i,1);URL.revokeObjectURL(it.url);}draw();},count:()=>items.length,
      clear:()=>{items.forEach(it=>URL.revokeObjectURL(it.url));items=[];input.value='';draw();}};
  }
  async function uploadPhotos(picker,{kind,parent_id,caption='',credit='',consent='yes'},noun='photo'){
    const items=picker.files();
    if(!items.length)throw Error('Choose at least one photo.');
    const bad=items.find(it=>it.problem);if(bad)throw Error(`${bad.file.name}: ${bad.problem}. Remove it or choose a different photo.`);
    let done=0;const failed=[];
    for(const it of items){
      formStatus(`Uploading ${noun} ${done+failed.length+1} of ${items.length}: ${it.file.name}…`);
      const fd=new FormData();fd.set('kind',kind);fd.set('parent_id',parent_id);fd.set('file',it.file);fd.set('caption',(it.caption||caption||'').trim());fd.set('credit',credit||'');fd.set('consent',consent);
      try{await api('/api/photos',{method:'POST',body:fd});done++;picker.remove(it);}
      catch(e){failed.push(`${it.file.name}: ${e.message}`);}
    }
    if(failed.length)throw Error(`${done} of ${items.length} ${done===1?noun:noun+'s'} uploaded. Not uploaded — ${failed.join(' · ')} Remove or replace the photo${failed.length===1?'':'s'} still listed and press the button again.`);
    return done;
  }
  function field(name,label,type='text',required=false,max=180){return `<label>${label}<input name="${name}" type="${type}"${required?' required':''}${['text','search'].includes(type)?` maxlength="${max}"`:''}></label>`;}
  const funds={dues:'Annual dues',beach_nourishment:'Beach nourishment',jetties:'Jetties',road_replacement:'Road replacement',events:'Community events',general:'General HBA support'};
  const paymentMethods={zelle:'Zelle',venmo:'Venmo',check:'Check',cash:'Cash',other:'Other',unspecified:'Not recorded'};
  function checkInfo(){
    try{const v=data.settings?.public_check_payment;const r=typeof v==='string'?(v?JSON.parse(v):null):v;return r&&r.payee&&r.address?r:null;}catch{return null;}
  }
  function payments(){
    const s=data.payment_settings||{},rows=data.payment_reports||[],ck=checkInfo();
    return `<div class="community-section-head"><div><h3>Dues & purpose-directed donations</h3><p>${ck?'Mail a check, or use HBA’s verified electronic instructions once they are enabled, then report the payment here.':'Use HBA’s verified Zelle or Venmo instructions, then report the payment here.'} No payment-service password or bank account number is collected.</p></div>${isAdmin()?'<button type="button" id="community-payment-settings">Configure verified HBA recipients</button>':''}</div>
      <article class="community-story"><h3>Pay by check</h3>${ck?`<p>Make checks payable to <strong>${esc(ck.payee)}</strong>.</p><p>Mail to:<br><strong class="community-prewrap">${esc(ck.address)}</strong></p>${ck.dues_amount?`<p>Annual dues: <strong>${esc(ck.dues_amount)}</strong> per residence${ck.due_by?`, requested by ${esc(ck.due_by)}`:''}.</p>`:''}<p>Write your Hamilton Beach address and the dues year or donation purpose on the memo line, then report the payment below so the treasurer can match it.</p>${ck.source?`<p class="community-footnote">Source: ${esc(ck.source)}.</p>`:''}`:'<p class="community-notice">Check instructions have not been entered. The administrator can add the payee and mailing address.</p>'}</article>
      <article class="community-story"><h3>Zelle payment instructions</h3>${s.enabled?`<p>Recipient account name: <strong>${esc(s.recipient_name)}</strong></p><p>Enrolled recipient email / mobile / tag: <strong>${esc(s.recipient_identifier)}</strong></p><p>Verify the recipient name in your banking app before sending. Memo: household address, dues year or chosen donation purpose.</p>`:'<p class="community-notice">Not enabled: HBA’s official enrolled Zelle recipient has not been verified. Do not send money to an address guessed from an administrator’s login. The administrator must confirm the association’s eligible account and recipient first.</p>'}<p>Payments take place in your bank’s app, not in this portal. Confirm HBA’s eligibility and recipient with the association and its bank. <a href="https://www.zelle.com/business" target="_blank" rel="noopener noreferrer">Official Zelle business-payment guidance</a>.</p></article>
      <article class="community-story"><h3>Venmo</h3>${s.venmo_enabled?`<p>Verified profile name: <strong>${esc(s.venmo_name)}</strong> · username <strong>@${esc(s.venmo_handle)}</strong></p><a class="community-primary" href="https://venmo.com/u/${encodeURIComponent(s.venmo_handle)}" target="_blank" rel="noopener noreferrer">Open HBA’s configured Venmo profile</a><p>Confirm the exact recipient in Venmo before sending. Use household address, dues year or donation purpose in the note. Choose an appropriate private transaction visibility setting; do not include sensitive financial information.</p>`:'<p class="community-notice">Not enabled: HBA’s official Venmo profile has not been configured and verified. No payment link is available and no personal administrator account is substituted.</p>'}<p>This portal does not connect to Venmo, initiate charges, verify transfers automatically, or guarantee payment-service availability or eligibility.</p></article>
      <article class="community-story"><h3>Choose where your support goes</h3><p>Beach nourishment, jetties, road replacement, community events or general association support. Record the intended event/date in your report; the board reconciles the receipt and intended use. This is not a tax receipt or promise of tax deductibility.</p>${session.member.household_uid?'<button type="button" id="community-report-payment">I sent a payment / donation: notify the board</button>':'<p>Ask the board to link your account to your household before submitting a payment report.</p>'}</article>
      <p class="community-notice">A submitted report creates a board review entry immediately. While a board member has this archive open, its payment-alert count checks for new reports every 30 seconds. This is not a bank confirmation and does not mark dues paid; email and closed-app notifications are not activated yet. The board must reconcile the payment receipt, then update the separate dues registry if appropriate.</p>
      ${isBoard()?'<div class="community-actions"><button type="button" id="community-open-dues">Open board dues registry</button></div>':''}
      <h3>${isBoard()?'Board reconciliation queue':'Your payment reports'}</h3>${rows.length?rows.map(r=>`<article class="community-card"><div><span class="community-tag">${esc({pending:'Awaiting board verification',verified:'Board verified receipt',rejected:'Not verified / rejected'}[r.state])}</span><h4>$${Number(r.amount).toLocaleString('en-US',{minimumFractionDigits:2})} · ${esc(funds[r.fund])}</h4><p>${esc(address(r.household_uid))} · ${dateLabel(r.payment_date)} · ${r.payment_year} · Method: ${esc(paymentMethods[r.payment_method]||paymentMethods.unspecified)}</p>${r.event_id?`<p>Event: ${esc(byId(data.events,r.event_id)?.title||'Linked event')}</p>`:''}<p>${esc(r.reference?'Reference: '+r.reference:'No payment reference provided')}</p><p class="community-prewrap">${esc(r.note)}</p>${r.board_note?`<p>Board reconciliation: ${esc(r.board_note)}</p>`:''}</div>${isBoard()?`<div class="community-actions"><button type="button" data-review-payment="${r.id}">Reconcile report</button>${deleteButton('payment-report',r.id)}</div>`:''}</article>`).join(''):blank('No payment reports yet','Only your own reports are visible to residents. Household payment details and board-wide reconciliation stay private.')}
      ${isBoard()?'<section class="community-story"><h3>Public waterfront bulletin</h3><p>Post a source-checked swimming or shellfish notice for all readers. Notices expire within 24 hours; expired information is not treated as current clearance.</p><div class="community-actions"><button type="button" id="community-add-advisory">Post a checked advisory</button><button type="button" id="community-public-bulletin">View public bulletin</button></div></section>':''}`;
  }
  function paymentSettingsForm(){
    formDialog('Verify HBA payment recipients',field('recipient_name','Zelle official recipient/account name')+field('recipient_identifier','Zelle enrolled email, US mobile number or tag')+
      '<label class="community-check"><input type="checkbox" name="enabled"> Enable instructions: I verified this is HBA’s eligible, enrolled recipient with its bank</label><p>No banking credentials are requested. This does not enroll HBA with Zelle, move money or enable a bank transaction feed.</p>'+
      field('venmo_name','Venmo official HBA profile name')+field('venmo_handle','Venmo username (no URL)','text',false,64)+'<label class="community-check"><input type="checkbox" name="venmo_enabled"> Enable Venmo: I have verified this is the association’s authorized profile</label>'+
      '<h4>Pay by check</h4>'+field('check_payee','Checks payable to')+'<label>Mailing address<textarea name="check_address" rows="3" maxlength="400"></textarea></label>'+field('dues_amount','Annual dues amount (for example $500)','text',false,40)+field('dues_due_by','Requested by (for example May 1)','text',false,80)+field('check_source','Source of these instructions','text',false,240),
      fd=>{const b=Object.fromEntries(fd);b.enabled=fd.has('enabled');b.venmo_enabled=fd.has('venmo_enabled');return mutate('/api/payment-settings',{method:'PUT',body:JSON.stringify(b)},'Payment instructions saved. No payment was initiated.');},{...(data.payment_settings||{}),...(c=>c?{check_payee:c.payee,check_address:c.address,dues_amount:c.dues_amount,dues_due_by:c.due_by,check_source:c.source}:{})(checkInfo())});
    editor.querySelector('[name=enabled]').checked=!!data.payment_settings?.enabled;
    editor.querySelector('[name=venmo_enabled]').checked=!!data.payment_settings?.venmo_enabled;
  }
  function paymentReportForm(){
    formDialog('Report a payment already sent',`<p>Household: ${esc(address(session.member.household_uid))}. Do not include account numbers, balances, passwords or full bank screenshots.</p><label>Purpose<select name="fund">${Object.entries(funds).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>`+
      '<label>Payment method<select name="payment_method"><option value="zelle">Zelle</option><option value="venmo">Venmo</option><option value="check">Check</option><option value="cash">Cash</option><option value="other">Other</option></select></label><label>Amount sent ($)<input name="amount" type="number" min="0.01" max="1000000" step="0.01" required></label>'+
      '<label>Dues / reporting year<input name="payment_year" type="number" min="2020" max="2100" required></label>'+
      field('payment_date','Date sent','date',true)+field('reference','Optional bank transaction reference (not account number)','text',false,100)+
      `<label>Event, if donating to an event<select name="event_id"><option value="">Not tied to a listed date</option>${opts(data.events,x=>x.id,x=>x.event_date+' · '+x.title)}</select></label>`+area('note','Optional allocation / event details')+
      '<label class="community-check"><input name="recognize_publicly" type="checkbox"> For donations: list my household by name on the donor board once verified. Leave unticked to be counted as an anonymous household; amounts are never shown individually.</label>'+
      '<label class="community-check"><input name="confirm" type="checkbox" required> I have already sent this amount; I understand the board must verify receipt.</label>',
      fd=>{const b=Object.fromEntries(fd);delete b.confirm;b.recognize_publicly=fd.has('recognize_publicly');b.payment_kind=b.fund==='dues'?'dues':'donation';b.amount=+b.amount;b.payment_year=+b.payment_year;b.event_id=b.event_id||null;if(b.event_id&&b.fund!=='events')throw Error('Select Community events when linking a specific event.');return mutate('/api/payment-reports',{method:'POST',body:JSON.stringify(b)},'Report delivered to the board review queue. Receipt is not yet verified; no dues status was changed.');},
      {payment_year:new Date().getFullYear(),payment_date:new Date().toLocaleDateString('en-CA')});
  }
  function paymentReviewForm(r){
    formDialog('Reconcile payment receipt',`<p>${esc(address(r.household_uid))} · $${Number(r.amount).toFixed(2)} · ${esc(funds[r.fund])}</p><label>Receipt status<select name="state"><option value="pending">Awaiting receipt verification</option><option value="verified">Receipt verified against HBA payment records</option><option value="rejected">Not verified / rejected</option></select></label>`+area('board_note','Reconciliation note (visible to the submitting resident)')+'<p>This does not automatically change the dues registry or treat a donation as annual dues.</p>',
      fd=>mutate('/api/payment-reports/'+r.id,{method:'PUT',body:JSON.stringify(Object.fromEntries(fd))},'Reconciliation saved. Update the dues registry separately if appropriate.'),r);
  }
  function advisoryForm(){
    formDialog('Post a source-checked waterfront advisory','<label>Type<select name="category"><option value="swimming">Swimming</option><option value="shellfishing">Shellfishing</option></select></label>'+field('location','Exact beach / growing area and scope','text',true,300)+
      '<label>Verified source status<select name="status"><option value="unverified">Not verified / check official notice</option><option value="closed">Closed / No Swimming / No Harvest</option><option value="open">Official notice currently indicates open for this scope</option></select></label>'+
      field('source_url','Official Wareham or Massachusetts notice URL','url',true)+area('note','Limits, species, area, dates and source wording',true)+
      '<label>Recheck interval<select name="hours"><option value="4">4 hours</option><option value="12">12 hours</option><option value="24">24 hours maximum</option></select></label><p>Public to everyone. This records what you checked now, not a new regulatory authorization. Shellfish and swimming statuses must never be inferred from each other.</p>',
      fd=>{const b=Object.fromEntries(fd),now=new Date();b.checked_at=now.toISOString();b.valid_until=new Date(+now+Number(b.hours)*3600000).toISOString();delete b.hours;return mutate('/api/advisories',{method:'POST',body:JSON.stringify(b)},'Source-checked advisory posted with an expiry time.');},{location:'Hamilton Beach'});
  }
  function meetings(){
    const rows=data.meetings||[],today=new Date().toLocaleDateString('en-CA');
    if(!rows.some(m=>m.id===meetingId))meetingId=rows.find(m=>m.state==='scheduled'&&m.meeting_date>=today)?.id||rows.at(-1)?.id||'';
    const m=byId(rows,meetingId),pending=(data.issues||[]).filter(i=>i.state==='pending_meeting');
    const agenda=(data.agenda||[]).filter(a=>a.meeting_id===meetingId);
    const backlog=(data.agenda||[]).filter(a=>!a.meeting_id);
    const access=byId(data.meeting_access,meetingId);
    const next=rows.find(x=>x.state==='scheduled'&&x.meeting_date>=today);
    const item=a=>`<article class="community-card"><div><span class="community-tag">${esc(a.state)} · ${a.audience==='members'?'Member-visible when included':'Board only'} · Order ${a.sort_order}</span><h4>${esc(a.title)}</h4><p class="community-prewrap">${esc(a.description)}</p></div>${isBoard()?`<div class="community-actions"><button type="button" data-edit-agenda="${a.id}">Edit / assign meeting</button>${deleteButton('agenda',a.id)}</div>`:''}</article>`;
    const minutesCount=(data.minutes||[]).filter(x=>x.state==='approved'||isBoard()).length;
    return `<div class="community-section-head"><div><h3>Board meetings & minutes</h3><p>Dates, agendas and the approved minutes of each meeting. All meeting times use America/New_York.</p></div><div class="community-actions"><button type="button" id="community-open-minutes-tab">Meeting minutes${minutesCount?` (${minutesCount})`:''}</button>${data.can_schedule?'<button type="button" id="community-add-meeting">Schedule a meeting</button>':''}${isBoard()?'<button type="button" id="community-add-agenda">Submit an agenda item</button>':''}</div></div>
      <div class="community-stats"><div class="community-card"><div><small>Next scheduled meeting</small><h4>${next?dateLabel(next.meeting_date)+' · '+esc(next.meeting_time.slice(0,5)):'No date entered'}</h4></div></div>${isBoard()?`<div class="community-card"><div><small>Neighborhood reports awaiting meeting review</small><h4>${pending.length}</h4></div></div><div class="community-card"><div><small>Unassigned future agenda items</small><h4>${backlog.length}</h4></div></div>`:''}</div>
      ${rows.length?`<label class="community-house-picker">Meeting<select id="community-meeting-id">${opts(rows,x=>x.id,x=>x.meeting_date+' · '+x.title+' · '+x.state)}</select></label>`:blank('No meetings scheduled yet','The president, secretary or administrator can enter a date. No meeting times or historical events have been assumed.')}
      ${m?`<article class="community-story"><span class="community-tag">${esc(m.state)} · ${m.audience==='general'?'General membership':'Board of Governors'} · ${dateLabel(m.meeting_date)} · ${esc(m.meeting_time.slice(0,5))} Eastern · ${m.duration_minutes} minutes</span><h3>${esc(m.title)}</h3>${(()=>{const mn=window.HBAMinutes?.minutesFor({data},m.id,m.meeting_date);return mn?`<p><button type="button" class="minutes-link" data-open-minutes="${mn.id}">${mn.state==='approved'?'Read the approved minutes':'Read the draft minutes'}</button></p>`:(data.can_edit_minutes&&m.meeting_date<=today?`<p><button type="button" class="minutes-link" data-write-minutes="${m.id}">Write the minutes for this meeting</button></p>`:'');})()}<p>${esc(m.location||'Location to be confirmed')}</p><p class="community-prewrap">${esc(m.description)}</p><div class="community-actions"><button type="button" id="community-meeting-ical">Download calendar attachment</button>${data.can_schedule?`<button type="button" data-edit-meeting="${m.id}">Edit meeting</button><button type="button" id="community-meeting-access">Zoom link & reminder plan</button><button type="button" id="community-meeting-invite">Preview board invitation</button>`:''}${deleteButton('meeting',m.id)}</div>
      ${isBoard()?`<p>${access?.zoom_url?`Participant link: <a href="${esc(access.zoom_url)}" target="_blank" rel="noopener noreferrer">Join Zoom meeting</a>`:'No Zoom participant link entered.'}</p><p class="community-notice">Gmail is connected, but this portal’s invitation delivery and timed-reminder setup are not active yet. Zoom authorization is still needed for call creation. Saving a meeting or reminder preference does not send invitations or activate a reminder.</p>`:''}</article>
      <h3>Agenda for this meeting</h3>${agenda.length?agenda.map(item).join(''):blank('No agenda items assigned','Board members can submit an item for this date, or assign an item from the future queue.')}
      ${isBoard()?`<section class="community-story"><span class="community-tag">Automatic agenda section · Board only</span><h3>Neighborhood issues for review</h3><p>This live section pulls every report marked “Pending review for next meeting” into the next scheduled meeting (${next?dateLabel(next.meeting_date):'date not set'}). It is not duplicated into every future meeting and never publishes resident reports.</p>${m.id===next?.id?(pending.length?pending.map(i=>`<article class="community-card"><div><h4>${esc(i.title)}</h4><p>${esc(i.location||'Location not supplied')}</p><p class="community-prewrap">${esc(i.description)}</p></div><button type="button" data-review-issue="${i.id}">Review issue / record follow-up</button></article>`).join(''):'<p>No reports are currently awaiting meeting review.</p>'):'<p>The live issue queue is shown on the next scheduled meeting only. Formal outcomes belong in the supporting minutes and decision register.</p>'}</section>`:''}`:''}
      ${isBoard()?`<h3>Future agenda submissions</h3>${backlog.length?backlog.map(item).join(''):blank('No unassigned items','Board members can submit topics before the next meeting date is selected.')}<p class="community-footnote">Only included agenda items explicitly marked member-visible are shown to residents. A status, agenda entry or invitation does not establish quorum, record a vote or authorize expenditure. Only the administrator can delete.</p>`:'<p class="community-footnote">Only the agenda items explicitly released for members appear here. Board submissions, neighborhood reports and Zoom access links remain board-only.</p>'}`;
  }
  function meetingForm(m){
    if(!data.can_schedule)return;
    const editing=!!(m&&m.id);
    formDialog(editing?'Edit board meeting':'Schedule a board meeting',
      field('title','Meeting title','text',true)+field('meeting_date','Date','date',true)+field('meeting_time','Start time (Eastern)','time',true)+
      '<label>Duration (minutes)<input name="duration_minutes" type="number" min="15" max="480" required value="60"></label>'+
      field('location','Location or “Zoom”','text',false,300)+area('description','Member-visible meeting details')+
      '<label>Who meets<select name="audience"><option value="board">Board of Governors meeting</option><option value="general">General membership meeting (June/August or special)</option></select></label><p>Votes link to a meeting: board votes need a Board of Governors meeting; membership votes (capital, dues, amendments, elections) need a general membership meeting.</p>'+
      '<label>Status<select name="state"><option value="scheduled">Scheduled</option><option value="held">Held</option><option value="cancelled">Cancelled</option></select></label><p>Saving schedules the portal record only. Email and Zoom call creation require connected services and a separate reviewed send.</p>',
      async fd=>{const body=Object.fromEntries(fd);body.duration_minutes=+body.duration_minutes;const saved=await mutate('/api/meetings'+(editing?'/'+m.id:''),{method:editing?'PUT':'POST',body:JSON.stringify(body)},'Meeting saved. No invitation or reminder was sent.');meetingId=saved.id;render();},m?{...m,meeting_time:m.meeting_time.slice(0,5)}:{title:'HBA Board Meeting',audience:'board'});
  }
  function agendaForm(a){
    const choices='<option value="">Future agenda queue (no meeting assigned)</option>'+opts(data.meetings||[],x=>x.id,x=>x.meeting_date+' · '+x.title);
    formDialog(a?'Edit agenda item':'Submit a future agenda item',`<label>Meeting<select name="meeting_id">${choices}</select></label>`+
      field('title','Agenda item title','text',true)+area('description','Background and requested discussion',true)+
      '<label>Workflow status<select name="state"><option value="submitted">Submitted</option><option value="included">Included in agenda</option><option value="deferred">Deferred</option><option value="addressed">Addressed</option></select></label>'+
      '<label>Visibility<select name="audience"><option value="board">Board only</option><option value="members">Visible to residents only when Included</option></select></label>'+
      '<label>Agenda order<input type="number" name="sort_order" min="0" max="999" value="10" required></label><p>Check for private household or board information before releasing an item to residents.</p>',
      fd=>{const b=Object.fromEntries(fd);b.meeting_id=b.meeting_id||null;b.sort_order=+b.sort_order;return mutate('/api/agenda'+(a?'/'+a.id:''),{method:a?'PUT':'POST',body:JSON.stringify(b)},'Agenda item saved.');},a||{meeting_id:meetingId});
  }
  function meetingAccessForm(){
    const a=byId(data.meeting_access,meetingId);
    formDialog('Zoom participant link & reminder preference',field('zoom_url','Existing Zoom participant join link','url',false)+
      '<label>Proposed follow-up reminder<select name="reminder_hours"><option value="24">24 hours before</option><option value="48">48 hours before</option><option value="2">2 hours before</option><option value="1">1 hour before</option></select></label><p>Board-only. Do not enter a host start link. This saves preferences only: Zoom creation, email delivery and timed reminders are not active until their service connections and durable delivery setup are complete.</p>',
      fd=>{const b=Object.fromEntries(fd);b.reminder_hours=+b.reminder_hours;return mutate('/api/meetings/'+meetingId+'/access',{method:'PUT',body:JSON.stringify(b)},'Zoom link and reminder preference saved. Delivery remains inactive.');},a||{reminder_hours:24});
  }
  function meetingInvitation(){
    const m=byId(data.meetings,meetingId),a=byId(data.meeting_access,meetingId),recipients=(data.members||[]).filter(x=>['board','admin'].includes(x.role));
    const agenda=(data.agenda||[]).filter(x=>x.meeting_id===meetingId&&x.state==='included');
    const text=`HBA board meeting: ${m.title}\n${dateLabel(m.meeting_date)} at ${m.meeting_time.slice(0,5)} Eastern (${m.duration_minutes} minutes)\nLocation: ${m.location||'To be confirmed'}\nZoom: ${a?.zoom_url||'Not entered'}\n\n${m.description}\n\nAgenda:\n${agenda.map((x,i)=>(i+1)+'. '+x.title+'\n'+x.description).join('\n\n')}\n\nNeighborhood issues for review: see the private board portal.\n\nProposed reminder: ${a?.reminder_hours||24} hours before, with calendar attachment.`;
    formDialog('Board invitation preview (not sent)',`<p>Recipients: ${esc(recipients.map(r=>r.email).join(', ')||'No approved board accounts')}</p><p>Subject: ${esc('HBA Board Meeting: '+m.title)}</p><pre class="community-prewrap">${esc(text)}</pre><p class="community-notice">Gmail is connected; portal send verification and durable reminder delivery are still pending. This preview does not send email or schedule an automatic reminder. Download the calendar attachment from the meeting record for a manual invitation.</p>`,async()=>{}, {},'Close preview');
  }
  function downloadMeetingCalendar(m){
    const clean=s=>String(s??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
    // Use local TZID rather than silently treating an Eastern wall-clock time as UTC.
    const start=m.meeting_date.replaceAll('-','')+'T'+m.meeting_time.slice(0,5).replace(':','')+'00';
    const a=isBoard()?byId(data.meeting_access,m.id):null;
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//HBA//Board Meetings//EN','BEGIN:VEVENT','UID:'+m.id+'@hba-board','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').split('.')[0]+'Z','DTSTART;TZID=America/New_York:'+start,'DURATION:PT'+m.duration_minutes+'M','SUMMARY:'+clean(m.title),'LOCATION:'+clean(m.location),'DESCRIPTION:'+clean(m.description+(a?.zoom_url?'\nZoom: '+a.zoom_url:'')),'STATUS:'+(m.state==='cancelled'?'CANCELLED':'CONFIRMED'),'END:VEVENT','END:VCALENDAR'];
    const u=blobURL(new Blob([lines.join('\r\n')+'\r\n'],{type:'text/calendar'})),link=document.createElement('a');link.href=u;link.download='HBA-board-'+m.meeting_date+'.ics';link.click();
  }
  function area(name,label,required=false){return `<label>${label}<textarea name="${name}" rows="4" maxlength="12000"${required?' required':''}></textarea></label>`;}
  function documentForm(){
    formDialog('Upload & organize a document',field('title','Document title','text',true)+`<label>Archive category<select name="category"><option value="other">Let the app suggest where the information belongs</option><option value="budget">Budget</option><option value="minutes">Meeting minutes</option><option value="governing">Bylaws / governing document</option><option value="contract">Contract</option><option value="history">History</option><option value="permit">Permit</option></select></label>`+field('document_year','Year, if known','number')+area('description','Description / source note')+`<label>File · up to 8 MB<input type="file" name="file" accept=".pdf,.docx,.xlsx,.txt,.csv,.jpg,.jpeg,.png" required></label><p>PDF, Word (.docx), Excel (.xlsx), text, CSV or a scanned JPG/PNG. Save older .doc files as PDF first. The original is preserved; new files and extracted suggestions are board-only. Redact bank numbers, passwords and unnecessary personal data before uploading.</p><p>The app processes up to 40 pages, with OCR for up to 12 scanned pages. It prepares suggestions, not automatic postings. Keep this app available and review extraction progress afterward.</p>`,
      async fd=>{if(!fd.get('document_year'))fd.delete('document_year');const r=await mutate('/api/documents',{method:'POST',body:fd},'File saved. Open its review to follow extraction and organize the information.');view='documents';docCategory='';docYear='';docSearch='';render();status(r.already_archived?'This exact file was already archived; its existing record was reused.':r.intake_unavailable?'File saved privately, but extraction could not start. Open Read & organize this file to retry.':'File saved privately. Extraction is queued; open Review extracted information.');}, {},'Upload & prepare suggestions');
  }
  function elections(){
    const labels={planning:'Planning',nominations_open:'Nominations open',meeting_scheduled:'August meeting scheduled',results_recorded:'Results recorded'};
    return `<div class="community-section-head"><div><h3>HBA elections</h3><p>Every two years at the August meeting. The next election year is <strong>2027</strong>, followed by 2029, 2031 and 2033.</p></div></div>
      <p class="community-notice">This is an election information and records section, not online voting. A resident login or a Paid marker does not certify voting eligibility. The Secretary must check membership, voting units, proxies, quorum and the approved Voting Guidelines & Procedures.</p>
      ${(data.elections||[]).map(e=>{const m=byId(data.meetings,e.meeting_id);return `<article class="community-story"><span class="community-tag">${e.year} · ${esc(labels[e.state])}</span><h4>August ${e.year} elections</h4><p>${m?dateLabel(m.meeting_date)+' · '+esc(m.meeting_time.slice(0,5))+' Eastern':'August meeting date: to be announced'}</p><p>${esc(e.notice)}</p><p><strong>Positions:</strong> ${esc(e.positions||'To be confirmed in the election notice')}</p><p><strong>Nominations:</strong> ${esc(e.nomination_instructions||'Instructions and deadline to be announced')}</p>${e.nomination_deadline?`<p>Nomination deadline: ${dateLabel(e.nomination_deadline)}</p>`:''}${e.results?`<h4>Recorded results</h4><p class="community-prewrap">${esc(e.results)}</p>`:''}<details><summary>Source and election safeguards</summary><p>${esc(e.source_note)}</p><p>The 2022 bylaws describe election of the President and governors. The appointed Vice President, Treasurer and Secretary follow the separate board-approval process. Recording a result here does not assign an app role, appoint an officer or certify the validity of a vote.</p></details>${isBoard()?`<button type="button" data-edit-election="${e.year}">Update election notice / records</button>`:''}</article>`;}).join('')}
      <p>Voting Guidelines & Procedures and any later bylaw amendments still need to be supplied and checked. No meeting day has been inferred from Spaghetti Supper’s separate date rule.</p>`;
  }
  function electionForm(e){
    const meetings=data.meetings.filter(m=>m.meeting_date.startsWith(e.year+'-08-'));
    formDialog('August '+e.year+' election information',`<label>August meeting<select name="meeting_id"><option value="">Date to be announced</option>${opts(meetings,m=>m.id,m=>m.meeting_date+' · '+m.title)}</select></label><p>If the meeting is missing, the President, Secretary or administrator can schedule it in Board meetings first.</p><label>Status<select name="state"><option value="planning">Planning</option><option value="nominations_open">Nominations open</option><option value="meeting_scheduled">August meeting scheduled</option><option value="results_recorded">Results recorded from minutes</option></select></label>`+area('notice','Election notice')+area('positions','Positions covered by this election')+field('nomination_deadline','Nomination deadline, if established','date')+area('nomination_instructions','How to nominate / eligibility review')+area('results','Actual results, after the election')+area('source_note','Supporting minutes / source and procedure notes')+'<p>Member-visible. Do not include private contact details or a household eligibility list. No email or SMS will be sent automatically.</p>',
      fd=>{const p=Object.fromEntries(fd);p.meeting_id||=null;p.nomination_deadline||=null;return mutate('/api/elections/'+e.year,{method:'PUT',body:JSON.stringify(p)},'Election information saved. App roles and voting eligibility were not changed.');},e);
  }
  function seriesForm(){formDialog('Add an event series',field('title','Event name','text',true)+area('description','About this event'),fd=>mutate('/api/series',{method:'POST',body:JSON.stringify(Object.fromEntries(fd))},'Event series added.'));}
  function eventForm(e){
    if(!data.series.length){seriesForm();return;}
    const editing=!!e&&!e.projected;
    formDialog(editing?'Edit event date':'Add an event date',`<label>Event series<select name="series_id">${opts(data.series,s=>s.id,s=>s.title)}</select></label>`+
      `<div id="supper-year-control" hidden><label>Spaghetti Supper year<input name="supper_year" type="number" min="1800" max="2200"></label><p id="supper-rule-preview" role="status"></p></div>`+
      field('title','Occurrence title','text',true)+field('event_date','Main date','date',true)+field('rain_date','Rain date, if applicable','date')+
      `<label class="communications-check"><input name="use_rain_date" type="checkbox"${e?.use_rain_date?' checked':''}> Board has moved this event to its rain date</label><label class="communications-check"><input name="planning_only" type="checkbox"${e?e.planning_only?' checked':'':' checked'}> Planned date; time / location / details still pending</label>`+
      field('event_time','Time, if known (Wareham local time)','time')+field('location','Location','text',false,300)+area('description','Details / source for a historical date')+`<label>Status<select name="state"><option value="scheduled">Scheduled</option><option value="held">Held</option><option value="cancelled">Cancelled</option></select></label>`,async fd=>{
      const d=Object.fromEntries(fd);delete d.supper_year;d.event_time||=null;d.rain_date||=null;d.use_rain_date=fd.has('use_rain_date');d.planning_only=fd.has('planning_only');
      await mutate('/api/events'+(editing?'/'+e.id:''),{method:editing?'PUT':'POST',body:JSON.stringify(d)},'Event date saved.');
    },e?{...e,use_rain_date:undefined,planning_only:undefined}:{series_id:series||data.series[0].id});
    const f=editor.querySelector('form'),control=f.querySelector('#supper-year-control'),preview=f.querySelector('#supper-rule-preview');
    const today=new Date().toLocaleDateString('en-CA');
    function updateRule(changeYear=false){
      const recurring=byId(data.series,f.elements.series_id.value)?.recurrence_rule==='august_third_saturday';
      const firstYear=byId(data.series,f.elements.series_id.value)?.first_year||1974;
      control.hidden=!recurring;f.elements.event_date.readOnly=false;f.elements.rain_date.readOnly=false;
      if(!recurring)return;
      f.elements.supper_year.min=firstYear;
      let y=Number(f.elements.supper_year.value);
      if(!Number.isInteger(y)||y<firstYear||y>2200){y=Number((e?.event_date||today).slice(0,4));if(!e&&window.HBAEventDates.supper(y).date<today)y++;f.elements.supper_year.value=y;}
      const dates=window.HBAEventDates.supper(y);
      const historic=dates.date<today&&(!e?.annual_rule_year||y!==e.annual_rule_year);
      f.elements.event_date.readOnly=!historic;f.elements.rain_date.readOnly=!historic;
      preview.textContent=historic?'Documented historical date: keep the actual source date. This rule is not evidence that a past supper occurred.':`Main date: ${dateLabel(dates.date)}. Rain backup: ${dateLabel(dates.rain)}.`;
      if(!historic){f.elements.event_date.value=dates.date;f.elements.rain_date.value=dates.rain;}
      else if(changeYear){f.elements.event_date.value='';f.elements.rain_date.value='';}
      if(!f.elements.title.value)f.elements.title.value='Spaghetti Supper';
    }
    f.elements.series_id.onchange=()=>updateRule();f.elements.supper_year.onchange=()=>updateRule(true);updateRule();
  }
  function historyForm(){
    formDialog('Add household history',`<p>${esc(address(homeUid))}. Personal contributions are not deed evidence. Resident submissions await board review.</p>`+field('title','Memory title','text',true)+field('history_year','Historical year, if known','number')+area('story','Memory, known dates and sources',true),async fd=>{
      const d=Object.fromEntries(fd);d.household_uid=homeUid;d.history_year=d.history_year?Number(d.history_year):null;
      await mutate('/api/house-history',{method:'POST',body:JSON.stringify(d)},isBoard()?'Household history added.':'Memory submitted for board review.');
    },{},'Submit memory');
  }
  function photoForm(kind,id){
    let picker;
    const form=formDialog('Add '+{event:'event',history:'household',work:'work',issue:'issue'}[kind]+' photos',`<p>${isBoard()?'Board uploads appear in this collection.':'Your photos will be visible to you and the board while awaiting publication.'} Photos are resized and location metadata removed.</p>`+photoFields({required:true})+area('caption','Caption for every photo (what, where and when) — a photo\'s own caption above replaces it')+field('credit','Photographer / credit','text',false,200)+`<label class="community-check"><input name="consent" type="checkbox" value="yes" required> I have permission to share these photos and the consent needed for identifiable people.</label>`,async fd=>{
      const n=await uploadPhotos(picker,{kind,parent_id:id,caption:fd.get('caption'),credit:fd.get('credit')});
      data=await api('/api/community');window.HBAEventDates?.setSupperDefaults?.(data.settings?.public_supper_defaults);render();
      status(`${n} photo${n===1?'':'s'} ${isBoard()?'added.':'submitted for board review.'}`);
    },{},'Upload photos');
    picker=bindPhotoList(form);
  }
  function issueForm(){
    let receipt=null,picker;
    const form=formDialog('Submit a neighborhood issue',field('title','Short issue title','text',true)+`<label>Issue type<select name="category">${Object.entries(issueCategories).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>`+field('location','Location / nearest address','text',true,300)+area('description','What needs attention?',true)+photoFields({label:'Optional photos · JPEG, PNG or WebP · up to 6 MB each'})+`<label class="community-check"><input name="consent" type="checkbox" value="yes"> I have permission to share the attached photos.</label><p>The board-only queue starts at “Pending review for next meeting.” Reports are not shown to other residents.</p>`,async fd=>{
      if(picker.count()&&fd.get('consent')!=='yes')throw Error('Confirm permission before sharing the attached photos.');
      if(!receipt)receipt=await api('/api/issues',{method:'POST',body:JSON.stringify({title:fd.get('title'),category:fd.get('category'),location:fd.get('location'),description:fd.get('description')})});
      if(picker.count()){try{await uploadPhotos(picker,{kind:'issue',parent_id:receipt.id,caption:fd.get('title')});}catch(e){throw Error('Report saved, receipt '+receipt.id+'. '+e.message+' You can retry this form without creating another report.');}}
      data=await api('/api/community');window.HBAEventDates?.setSupperDefaults?.(data.settings?.public_supper_defaults);render();status('Issue submitted for next-meeting review. Receipt: '+receipt.id);
    },{},'Submit to board');
    picker=bindPhotoList(form);
  }
  function issueReviewForm(i){
    formDialog('Review neighborhood issue',`<p>${esc(i.title)} · ${esc(i.location)}</p><label>Review status<select name="state">${Object.entries(issueStates).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>`+area('board_note','Board-only review note / next action'),fd=>mutate('/api/issues/'+i.id,{method:'PUT',body:JSON.stringify(Object.fromEntries(fd))},'Issue review saved.'),i);
  }
  function officeForm(position){
    const current=data.officeholders?.find(o=>o.position===position);
    formDialog('Record '+position,`<p>This records an actual election or appointment. It does not elect the person. An administrator may link the President or Secretary to an approved board account for meeting scheduling. The linked, in-term Secretary also receives newsletter publishing and editing access.</p>`+field('member_name','Officeholder name','text',true)+`<label>Verified property, if known<select name="household_uid"><option value="">Not linked</option>${opts(homes.properties,p=>p.uid,p=>p.address)}</select></label>`+field('term_start','Term start, if known','date')+field('term_end','Term end, if documented','date')+
      field('contact_phone','Phone (shown to signed-in residents)','text',false,40)+field('contact_email','Email (shown to signed-in residents)','email')+field('winter_address','Winter address, optional','text',false,300)+`<label class="communications-check"><input name="share_contact" type="checkbox"${current?.share_contact===false?'':' checked'}> Share phone and email in Contact our team</label>`+
      (isAdmin()?`<label>Approved board account<select name="member_id"><option value="">No account linked</option>${opts((data.members||[]).filter(m=>['board','admin'].includes(m.role)),m=>m.id,m=>m.display_name+' · '+m.email)}</select></label>`:'')+area('source_note','Election / appointment minutes reference'),async fd=>{
      const d=Object.fromEntries(fd);d.position=position;d.term_start||=null;d.term_end||=null;d.household_uid||=null;d.share_contact=fd.has('share_contact');d.contact_phone||='';d.contact_email||='';d.winter_address||='';
      d.member_id=isAdmin()?(d.member_id||null):(current?.member_id||null);
      if(d.household_uid&&data.officeholders?.some(o=>o.id!==current?.id&&o.household_uid===d.household_uid))throw Error('Another officeholder is recorded at this property. Article IV limits one officer/governor per residence or property; reconcile before saving.');
      await mutate('/api/officeholders'+(current?'/'+current.id:''),{method:current?'PUT':'POST',body:JSON.stringify(d)},'Officeholder directory updated.');
    },current||{});
  }
  function decisionForm(){
    const minutes=data.documents.filter(d=>d.category==='minutes');
    formDialog('Record a motion / decision',`<p>Record the actual meeting and minutes. A saved record does not certify a binding vote.</p>`+field('title','Decision title','text',true)+field('meeting_date','Actual meeting / action date','date',true)+`<label>Approval route<select name="decision_type" id="community-decision-type">${Object.entries(decisionTypes).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><p id="community-decision-guidance" class="community-notice"></p>`+area('motion','Motion / action as recorded',true)+`<label>Recorded outcome<select name="recorded_outcome"><option value="proposed">Proposed</option><option value="approved">Approved as recorded in minutes</option><option value="rejected">Rejected as recorded in minutes</option><option value="deferred">Deferred</option></select></label>`+field('amount','Amount, if applicable','number')+field('governors_present','Governors present and able to vote (not all officers)','number')+field('members_represented','Eligible members/households represented, including valid proxies','number')+field('votes_yes','Yes votes','number')+field('votes_no','No votes','number')+field('abstentions','Abstentions','number')+`<label>Supporting meeting minutes<select name="minutes_id"><option value="">Not yet linked</option>${opts(minutes,d=>d.id,d=>d.title)}</select></label>`+area('review_notes','Eligibility / written proxies / conflict disclosure / counsel / source notes'),async fd=>{
      const d=Object.fromEntries(fd);['amount','governors_present','members_represented','votes_yes','votes_no','abstentions'].forEach(k=>d[k]=d[k]===''?null:Number(d[k]));d.minutes_id||=null;
      await mutate('/api/decisions',{method:'POST',body:JSON.stringify(d)},'Decision transcribed. It is not automatically certified valid.');
    });
    const guidance={board:'Article V: at least 7 of 10 governors present and able to vote; the President decides a tie in the stated circumstance. Confirm actual voting governors, conflicts and minutes.',capital:'Article V: capital-improvement expenditures require a majority-of-membership vote. Article VII provides a 30-member/household quorum for binding general issue votes. Confirm the applicable denominator and process; do not substitute a board-only approval.',dues:'Article VII: dues increases go to members; confirm the 30-member/household quorum, eligibility and written proxies delivered before the meeting.',amendment:'Article X: outside legal-counsel review and a two-thirds membership vote with a quorum at an annual meeting. Confirm the actual process and denominator with the secretary/counsel.',emergency:'Article V: the President may spend up to $1,500 for emergency use without a governors’ vote. Record who acted, why it was an emergency and supporting expenditure records. This app does not authorize the spending.'};
    const select=editor.querySelector('#community-decision-type'),g=editor.querySelector('#community-decision-guidance');select.onchange=()=>g.textContent=guidance[select.value];select.onchange();editor.querySelector('[name=amount]').step='0.01';
  }
  function workForm(w){
    formDialog(w?'Update contractor work':'Add contractor work',field('title','Project / scope title','text',true)+field('contractor','Contractor','text',false,250)+field('location','Work location','text',false,300)+field('work_date','Work date, if known','date')+area('description','Agreed scope / observations / source')+`<label>Current status<select name="state">${Object.entries(workState).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>`,async fd=>{
      const d=Object.fromEntries(fd);d.work_date||=null;await mutate('/api/work'+(w?'/'+w.id:''),{method:w?'PUT':'POST',body:JSON.stringify(d)},'Work project saved.');
    },w||{});
  }
  function workNoteForm(){formDialog('Record a work observation',`<label>Observation / flag<select name="flag"><option value="progress">Progress update</option><option value="incomplete">Incomplete work</option><option value="defect">Defect / poor workmanship reported</option><option value="resolved">Reported resolved</option><option value="accepted">Board acceptance</option></select></label>`+area('note','Specific observation, location and requested follow-up',true),fd=>mutate('/api/work/'+workId+'/notes',{method:'POST',body:JSON.stringify(Object.fromEntries(fd))},'Observation added to the project log.'));}
  // Board account controls. Nobody manages their own login here, board members cannot touch administrators or other
  // board members, and the server also enforces the last-administrator rule.
  function canManageAccount(m){
    if(!isBoard()||!m||m.id===session.member?.id)return false;
    if(['admin','board'].includes(m.role)&&!isAdmin())return false;
    return true;
  }
  function accountLog(){
    const rows=data.account_audit||[];
    const label={delete_member:'Deleted resident',delete_request:'Deleted account request',reset_password:'Temporary password issued',change_password:'Changed own password'};
    return `<details class="community-account-log"><summary>Account changes log (${rows.length})</summary>${rows.length?`<ul>${rows.map(r=>`<li><strong>${esc(label[r.action]||r.action)}</strong> · ${esc(r.target_name||r.target_email)}${r.target_household?' · '+esc(address(r.target_household)):''} · by ${esc(r.actor_name||r.actor_email)} · ${esc(new Date(r.created_at).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}))}${r.note?`<br><span>${esc(r.note)}</span>`:''}</li>`).join('')}</ul>`:'<p>No account changes recorded yet.</p>'}</details>`;
  }
  function deleteMemberForm(m){
    const who=`<p class="community-account-who"><strong>${esc(m.display_name||'No name given')}</strong><br>${esc(m.email)}<br>${esc(m.household_uid?address(m.household_uid):m.requested_household_uid?'Requested: '+address(m.requested_household_uid):'No address linked')} · ${esc(roleLabel(m.role))}</p>`;
    formDialog(m.role==='pending'?'Delete this account request?':'Delete this resident?',who+`<p>This removes their sign-in and their household link, so they can no longer sign in. Their dues and payment history, votes, stories and photos stay in the records, shown as from a former resident. This cannot be undone.</p>
      <label>Type DELETE to confirm<input name="confirm" type="text" required autocomplete="off" pattern="DELETE" maxlength="10" spellcheck="false"></label>`,
      async fd=>{if(fd.get('confirm')!=='DELETE')throw Error('Type DELETE in capital letters to confirm.');
        const r=await mutate('/api/members/'+m.id,{method:'DELETE'},(m.display_name||m.email)+' has been removed and can no longer sign in.');return r;},{},m.role==='pending'?'Yes, delete this request':'Yes, delete this resident');
  }
  function resetPasswordForm(m){
    const who=`<p class="community-account-who"><strong>${esc(m.display_name||'No name given')}</strong><br>${esc(m.email)}<br>${esc(m.household_uid?address(m.household_uid):'No address linked')}</p>`;
    formDialog('Reset this resident’s password?',who+`<p>A one-time temporary password will be shown to you once. Give it to the resident in person or by phone; the app does not email or text it. Their current password stops working right away, and they must choose a new password the next time they sign in.</p>`,
      async()=>{
        const r=await api('/api/members/'+m.id+'/reset-password',{method:'POST'});
        data=await api('/api/community');render();
        setTimeout(()=>showTemporaryPassword(m,r),60); // after the confirmation dialog closes itself
      },{},'Yes, issue a temporary password');
  }
  function showTemporaryPassword(m,r){
    editor.innerHTML=`<div class="community-form"><header><h3>Temporary password for ${esc(m.display_name||m.email)}</h3><button type="button" id="community-editor-close">Done</button></header>
      <p>Read it to them or write it down now. It will not be shown again.</p>
      <p class="community-temp-password" id="community-temp-password">${esc(r.temporary_password)}</p>
      <div class="community-actions"><button type="button" id="community-copy-password">Copy password</button></div>
      <p id="community-form-status" role="status"></p>
      <p>${esc(m.display_name||'The resident')} signs in at the usual page with their email (${esc(m.email)}) and this password, then chooses a new password of their own.${r.email_was_unconfirmed?' Their email address is now also marked confirmed, so the sign-in works even though the confirmation email never arrived.':''}</p></div>`;
    editor.querySelector('#community-editor-close').onclick=()=>editor.close();
    editor.querySelector('#community-copy-password').onclick=async()=>{try{await navigator.clipboard.writeText(r.temporary_password);formStatus('Copied.');}catch{formStatus('Copy is not available here; write the password down.');}};
    if(editor.open)editor.close();editor.showModal();
  }
  function memberForm(m){
    formDialog(m.role==='pending'?'Review account request':'Account permissions',`<p>${esc(m.email)}${m.display_name?' · '+esc(m.display_name):''}</p>${m.role==='pending'?`<p class="community-notice">Requested address: <strong>${esc(m.requested_household_uid?address(m.requested_household_uid):'none chosen')}</strong>. ${esc(m.request_note||'No note.')} ${m.sms_request?'Text alerts requested for: '+esc((m.sms_request.topics||[]).join(', '))+'.':''}</p>`:''}<label>Access<select name="role"><option value="pending">Awaiting approval</option><option value="resident">Resident</option>${isAdmin()?'<option value="board">Board member</option>':''}<option value="suspended">Suspended</option></select></label><label>Verified household address<select name="household_uid"><option value="">Not linked</option>${opts(homes.properties,p=>p.uid,p=>p.address)}</select></label><p>Verify residency before linking an address. Household history submissions will be limited to this property. Household dues remain board-only.</p>`,fd=>mutate('/api/members/'+m.id,{method:'PUT',body:JSON.stringify(Object.fromEntries(fd))},'Account permissions saved.'),{...m,household_uid:m.household_uid||m.requested_household_uid||''});
  }
  function confirmDelete(kind,id){
    if(!isAdmin())return;
    formDialog('Delete this archive record?',`<p>This permanently removes the selected ${esc(kind)} record${['photo','document'].includes(kind)?' and its stored file':''}. This cannot be undone. If it has linked photos or notes, delete those first.</p><label class="community-check"><input name="confirm" type="checkbox" required> I want to permanently delete this record.</label>`,()=>mutate('/api/records/'+kind+'/'+id,{method:'DELETE'},'Record deleted.'),{},'Permanently delete');
  }
  async function showFile(kind,id){
    status('Opening private file…');
    try{
      const blob=await api('/api/files/'+kind+'/'+id,{binary:true}),url=blobURL(blob);
      if(kind==='original'){const a=document.createElement('a');a.href=url;a.download=byId(data.documents,id)?.original_name||'HBA-original.doc';a.click();status('Original source downloaded.');return;}
      viewer.innerHTML=`<header><h3>${kind==='photo'?'Archive photo':'Archive document'}</h3><div class="community-actions"><a download="HBA-${id}.${kind==='photo'?'jpg':'pdf'}" href="${url}">Download ${kind==='photo'?'photo':'PDF'}</a><button type="button" id="community-viewer-close">Close file</button></div></header>${kind==='photo'?`<img src="${url}" alt="Selected archive photograph">`:`<p>If the embedded PDF is unavailable in this browser, use Download PDF.</p><iframe title="Archived PDF" src="${url}"></iframe>`}`;
      viewer.querySelector('#community-viewer-close').onclick=()=>viewer.close();viewer.showModal();status('');
    }catch(e){status(e.message,true);}
  }
  function downloadCalendar(e,rainBackup=false){
    const text=window.HBAEventDates.ical(e,rainBackup);
    const u=blobURL(new Blob([text],{type:'text/calendar'})),a=document.createElement('a');a.href=u;a.download='HBA-'+(rainBackup?e.rain_date:window.HBAEventDates.effective(e))+(rainBackup?'-rain-backup':'')+'.ics';a.click();
  }
  async function openCommunity(target='overview',uid=''){
    lastFocus=document.activeElement;view=target;if(uid){if(target==='work')workId=uid;else homeUid=uid;}
    if(!dlg.open)dlg.showModal();await refresh();
  }
  $('#community-close').onclick=()=>dlg.close();dlg.addEventListener('close',()=>lastFocus?.focus?.({preventScroll:true}));
  $('#community-refresh').onclick=refresh;
  $('#community-password').onclick=()=>window.openHBAPasswordChange?.();
  $('#community-payment-alert').onclick=async()=>{view='payments';await refresh();};
  setInterval(async()=>{
    if(!dlg.open||!isBoard()||busy||document.visibilityState!=='visible')return;
    const epoch=accountEpoch;
    try{const n=await api('/api/board-notifications');if(epoch!==accountEpoch||!isBoard())return;
      $('#community-payment-alert').textContent=`Payment reports (${n.pending_payments})`;
      if(n.latest_id&&n.latest_id!==lastPaymentId)status('New payment report received. Open Payment reports to review; receipt is not yet verified.');
      lastPaymentId=n.latest_id||'';
    }catch{/* Existing manual Refresh reports connection errors; polling never claims delivery. */}
  },30000);
  $('#community-signout').onclick=async()=>{
    ++accountEpoch;
    busy=true;$('#community-refresh').disabled=true;$('#community-signout').disabled=true;
    try{await api('/api/logout',{method:'POST'});session={signed_in:false};data=null;broadcast();revokeBlobs();render();status('Signed out.');}
    catch(e){status('Sign-out could not be confirmed. '+e.message,true);}
    finally{busy=false;$('#community-refresh').disabled=false;$('#community-signout').disabled=false;$('#community-auth').querySelectorAll('button,input').forEach(el=>el.disabled=false);}
  };
  window.openHBACommunity=openCommunity;
  // Restore role information for dues privacy without opening the archive.
  const initialEpoch=accountEpoch;
  api('/api/session').then(s=>{if(initialEpoch===accountEpoch){session=s;broadcast();}}).catch(()=>{if(initialEpoch===accountEpoch){session={signed_in:false};broadcast();}});
})();
