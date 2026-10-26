/* Event volunteer sign-ups with live counts, offers to host Movie Night, and simple event polls.
   All data comes from the member's own session; counts refresh every 45 seconds while they are on screen. */
(() => {
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const C=()=>window.HBACommunity;
  const api=(...a)=>C().api(...a);
  const niceDate=d=>d?new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}):'';
  const niceTime=t=>{const [h,mi]=String(t||'').split(':').map(Number);return Number.isInteger(h)?new Date(2000,0,1,h,mi||0).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'';};
  const bump=()=>document.dispatchEvent(new CustomEvent('hba-data-change'));

  // ------------------------------------------------------------------ sign-ups
  const S={data:null,at:0,busy:false,timer:null,listeners:new Set()};
  async function loadSignups(force){
    if(S.busy)return S.data;
    if(!force&&S.data&&Date.now()-S.at<45000)return S.data;
    S.busy=true;
    try{S.data=await api('/api/event-signups',{signal:AbortSignal.timeout(20000)});S.at=Date.now();}
    catch(e){S.data={ready:false,note:e.message,events:{}};}
    S.busy=false;S.listeners.forEach(fn=>{try{fn();}catch{}});return S.data;
  }
  function watchSignups(fn){S.listeners.add(fn);if(!S.timer)S.timer=setInterval(()=>{if(!document.hidden&&S.listeners.size)loadSignups(true);},45000);return()=>S.listeners.delete(fn);}
  // HTML for one event's sign-up line. `compact` keeps it to one line for lists.
  function signupHTML(eventId,opts={}){
    const d=S.data;if(!d)return `<span class="signup-line is-loading" data-signup-for="${esc(eventId)}">Checking volunteer sign-ups…</span>`;
    if(d.ready===false)return opts.board?`<span class="signup-line is-off" data-signup-for="${esc(eventId)}">${esc(d.note||'Sign-ups are not available yet.')}</span>`:'';
    const s=d.events?.[eventId];
    if(!s)return opts.board?`<span class="signup-line" data-signup-for="${esc(eventId)}"><button type="button" class="signup-btn signup-secondary" data-signup-sheet="${esc(eventId)}">Open a volunteer sign-up sheet</button></span>`:'';
    const n=s.signed_up,cap=s.capacity,full=cap&&n>=cap;
    const count=`<strong class="signup-count" aria-live="polite">${n} volunteer${n===1?'':'s'} signed up${cap?` of ${cap}`:''}</strong>`;
    const btn=s.mine?`<button type="button" class="signup-btn signup-secondary" data-signup-leave="${esc(eventId)}">Withdraw my sign-up</button>`
      :full?`<span class="signup-full">Sheet is full</span>`:`<button type="button" class="signup-btn" data-signup-join="${esc(eventId)}">Volunteer for this event</button>`;
    return `<span class="signup-line${s.mine?' is-mine':''}" data-signup-for="${esc(eventId)}">${count}${s.mine?'<span class="signup-you">You are on the list.</span>':''}${btn}</span>`;
  }
  function bindSignups(root,rerender){
    root.querySelectorAll('[data-signup-join]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.signupJoin;
      C().formDialog('Volunteer for this event','<p>Thank you. The board sees your name on the private sign-up sheet and will be in touch about jobs and times.</p><label>Optional note to the board (private)<textarea name="note" maxlength="1000" rows="3" placeholder="When you can help, what you would like to do"></textarea></label>',
        async fd=>{S.data=await api('/api/events/'+id+'/signup',{method:'PUT',body:JSON.stringify({join:true,note:fd.get('note')||''})});S.at=Date.now();S.listeners.forEach(fn=>fn());rerender?.();},{},'Sign me up');
    });
    root.querySelectorAll('[data-signup-leave]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.signupLeave;
      C().formDialog('Withdraw from this event','<p>Your place will be released for someone else. The board keeps the sign-up history.</p>',
        async()=>{S.data=await api('/api/events/'+id+'/signup',{method:'PUT',body:JSON.stringify({join:false,note:''})});S.at=Date.now();S.listeners.forEach(fn=>fn());rerender?.();},{},'Withdraw');
    });
    root.querySelectorAll('[data-signup-sheet]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.signupSheet;
      C().formDialog('Open a volunteer sign-up sheet','<label>How many volunteers are needed?<input name="capacity" type="number" min="1" max="200" value="10" required></label><p>Residents will see a live count and can add their names. The sheet also appears on the Volunteers page.</p>',
        async fd=>{await api('/api/events/'+id+'/signup-sheet',{method:'POST',body:JSON.stringify({capacity:Number(fd.get('capacity'))||10})});await loadSignups(true);rerender?.();bump();},{},'Open the sheet');
    });
  }
  // Replace placeholders in a root after data arrives, without re-rendering the whole view.
  function refreshSignupNodes(root,board){
    root.querySelectorAll('[data-signup-for]').forEach(el=>{const id=el.dataset.signupFor;const t=document.createElement('template');t.innerHTML=signupHTML(id,{board});if(t.content.firstChild)el.replaceWith(t.content.firstChild);else el.remove();});
    bindSignups(root,()=>refreshSignupNodes(root,board));
  }

  // ------------------------------------------------------------------ hosting offers
  function offerForm(seriesTitle='Movie Night',year){
    const y=year||new Date().getFullYear();
    C().formDialog(`Offer to host ${seriesTitle}`,
      `<p>Pick the evening and start time you would like to host. The board reviews the offer; once approved it goes on the calendar at your time and residents are told.</p>
       <label>Date<input name="proposed_date" type="date" min="${y}-01-01" required></label>
       <label>Start time<input name="proposed_time" type="time" value="20:00" required></label>
       <label>Where (optional)<input name="location" type="text" maxlength="200" placeholder="Side Beach, our yard at 12 Glen Ave…"></label>
       <fieldset class="offer-films"><legend>Film choices for the residents’ poll (optional, up to 4)</legend>
         <input name="film1" type="text" maxlength="120" placeholder="Film 1"><input name="film2" type="text" maxlength="120" placeholder="Film 2"><input name="film3" type="text" maxlength="120" placeholder="Film 3"><input name="film4" type="text" maxlength="120" placeholder="Film 4"></fieldset>
       <label>Note to the board (optional)<textarea name="note" rows="3" maxlength="2000" placeholder="Screen, projector, seating, rain plan…"></textarea></label>`,
      async fd=>{
        const movie_choices=['film1','film2','film3','film4'].map(k=>String(fd.get(k)||'').trim()).filter(Boolean);
        await api('/api/host-offers',{method:'POST',body:JSON.stringify({series_title:seriesTitle,proposed_date:fd.get('proposed_date'),proposed_time:fd.get('proposed_time'),location:fd.get('location')||'',note:fd.get('note')||'',movie_choices})});
        bump();
      },{},'Send my offer to the board');
  }
  let hostDialog,hostFocus;
  function ensureHostDialog(){
    if(hostDialog)return;
    hostDialog=document.createElement('dialog');hostDialog.id='hosting-dialog';hostDialog.setAttribute('aria-labelledby','hosting-title');
    hostDialog.innerHTML=`<div class="eng-shell"><header><div><p class="eng-eyebrow">Summer events</p><h2 id="hosting-title">Hosting offers</h2><p class="eng-sub">Residents offer to host Movie Night at a time that suits them; the board approves, the calendar updates and residents choose the film.</p></div><button type="button" id="hosting-close">Back</button></header><div class="eng-scroll" id="hosting-body"><p>Loading…</p></div></div>`;
    document.body.append(hostDialog);
    hostDialog.querySelector('#hosting-close').onclick=()=>hostDialog.close();
    hostDialog.addEventListener('close',()=>hostFocus?.focus?.());
  }
  async function openHosting(){
    ensureHostDialog();hostFocus=document.activeElement;if(!hostDialog.open)hostDialog.showModal();
    const body=hostDialog.querySelector('#hosting-body');body.innerHTML='<p>Loading offers…</p>';
    const board=C().isBoard();
    let d;try{d=await api('/api/host-offers');}catch(e){body.innerHTML=`<p>${esc(e.message)}</p>`;return;}
    if(d.ready===false){body.innerHTML=`<p>${esc(d.note)}</p><p><button type="button" id="hosting-offer">Offer to host Movie Night</button></p>`;}
    else{
      const rows=d.offers||[],state=s=>({pending:'Waiting for the board',approved:'Approved · on the calendar',declined:'Not approved',withdrawn:'Withdrawn'}[s]||s);
      body.innerHTML=`<p><button type="button" id="hosting-offer">Offer to host Movie Night</button></p>
        ${rows.length?rows.map(o=>`<article class="eng-card eng-${esc(o.state)}"><span class="community-tag">${esc(state(o.state))}</span><h3>${esc(o.series_title)} · ${esc(niceDate(o.proposed_date))} at ${esc(niceTime(o.proposed_time))}</h3>
          <p>${board||o.mine?`Host: ${esc(o.host_name||'')}. `:''}${o.location?`Where: ${esc(o.location)}. `:''}${(o.movie_choices||[]).length?`Film choices: ${esc(o.movie_choices.join(', '))}.`:''}</p>
          ${o.note?`<p class="eng-note">“${esc(o.note)}”</p>`:''}${o.board_note?`<p class="eng-note">Board: ${esc(o.board_note)}</p>`:''}
          <div class="community-actions">${board&&o.state==='pending'?`<button type="button" data-offer-approve="${o.id}">Approve and put on the calendar</button><button type="button" data-offer-decline="${o.id}">Decline</button>`:''}${o.mine&&o.state==='pending'?`<button type="button" data-offer-withdraw="${o.id}">Withdraw my offer</button>`:''}</div></article>`).join(''):'<p class="community-muted">No offers yet.</p>'}`;
      body.querySelectorAll('[data-offer-approve]').forEach(b=>b.onclick=()=>{
        const o=rows.find(x=>x.id===b.dataset.offerApprove);
        C().formDialog('Approve this hosting offer',`<p>${esc(o.series_title)} proposed for <strong>${esc(niceDate(o.proposed_date))} at ${esc(niceTime(o.proposed_time))}</strong> by ${esc(o.host_name||'a resident')}.</p>
          <label>Date<input name="event_date" type="date" value="${esc(o.proposed_date)}" required></label><label>Start time<input name="event_time" type="time" value="${esc(String(o.proposed_time).slice(0,5))}" required></label>
          <label>Where<input name="location" type="text" maxlength="200" value="${esc(o.location||'')}"></label>
          ${(o.movie_choices||[]).length>=2?`<label class="communications-check"><input type="checkbox" name="open_poll" value="yes" checked> Open the film poll (${esc(o.movie_choices.join(', '))}) and send it to residents</label>`:'<p class="community-muted">Fewer than two film choices were offered, so no poll will open.</p>'}
          <label>Note to the host (optional)<textarea name="board_note" rows="2" maxlength="1000"></textarea></label>
          <p>On approval: the event goes on the calendar at this time, a volunteer sign-up sheet opens, the host gets a message, and residents get a message${(o.movie_choices||[]).length>=2?' with the poll':''}.</p>`,
          async fd=>{await api('/api/host-offers/'+o.id,{method:'PUT',body:JSON.stringify({state:'approved',event_date:fd.get('event_date'),event_time:fd.get('event_time'),location:fd.get('location')||'',board_note:fd.get('board_note')||'',open_poll:fd.get('open_poll')==='yes'})});bump();openHosting();},{},'Approve');
      });
      body.querySelectorAll('[data-offer-decline]').forEach(b=>b.onclick=()=>C().formDialog('Decline this offer','<label>Note to the host (optional)<textarea name="board_note" rows="3" maxlength="1000" placeholder="Another date may work…"></textarea></label>',
        async fd=>{await api('/api/host-offers/'+b.dataset.offerDecline,{method:'PUT',body:JSON.stringify({state:'declined',board_note:fd.get('board_note')||''})});openHosting();},{},'Decline'));
      body.querySelectorAll('[data-offer-withdraw]').forEach(b=>b.onclick=()=>C().formDialog('Withdraw my offer','<p>The board will no longer see this offer.</p>',async()=>{await api('/api/host-offers/'+b.dataset.offerWithdraw,{method:'PUT',body:JSON.stringify({state:'withdrawn'})});openHosting();},{},'Withdraw'));
    }
    body.querySelector('#hosting-offer').onclick=()=>offerForm('Movie Night');
  }

  // ------------------------------------------------------------------ polls
  let pollDialog,pollFocus,pollTimer,pollId=null;
  function ensurePollDialog(){
    if(pollDialog)return;
    pollDialog=document.createElement('dialog');pollDialog.id='poll-dialog';pollDialog.setAttribute('aria-labelledby','poll-title');
    pollDialog.innerHTML=`<div class="eng-shell"><header><div><p class="eng-eyebrow">Residents’ poll</p><h2 id="poll-title">Polls</h2><p class="eng-sub">One answer per account; you can change it while the poll is open. Counts are live.</p></div><button type="button" id="poll-close">Back</button></header><div class="eng-scroll" id="poll-body"><p>Loading…</p></div></div>`;
    document.body.append(pollDialog);
    pollDialog.querySelector('#poll-close').onclick=()=>pollDialog.close();
    pollDialog.addEventListener('close',()=>{clearInterval(pollTimer);pollTimer=null;pollFocus?.focus?.();});
  }
  async function openPoll(id){
    ensurePollDialog();pollFocus=document.activeElement;pollId=id||null;if(!pollDialog.open)pollDialog.showModal();
    await paintPolls();
    clearInterval(pollTimer);pollTimer=setInterval(()=>{if(!document.hidden&&pollDialog.open)paintPolls(true);},30000);
  }
  async function paintPolls(quiet){
    const body=pollDialog.querySelector('#poll-body');if(!quiet)body.innerHTML='<p>Loading polls…</p>';
    let d;try{d=await api('/api/polls'+(pollId?'?poll_id='+encodeURIComponent(pollId):''));}catch(e){body.innerHTML=`<p>${esc(e.message)}</p>`;return;}
    if(d.ready===false){body.innerHTML=`<p>${esc(d.note)}</p>`;return;}
    const board=C().isBoard(),rows=d.polls||[];
    body.innerHTML=rows.length?rows.map(p=>{const total=p.total||0,lead=Math.max(0,...p.tally.map(t=>t.votes));
      return `<article class="eng-card poll-card"><span class="community-tag">${p.state==='open'?'Open':'Closed'} · ${total} vote${total===1?'':'s'}</span><h3>${esc(p.title)}</h3>${p.question?`<p>${esc(p.question)}</p>`:''}
        <ul class="poll-options">${p.tally.map(t=>{const pct=total?Math.round(100*t.votes/total):0;return `<li class="${t.choice===p.my_choice?'is-mine':''}${t.votes===lead&&lead>0?' is-leading':''}"><button type="button" class="poll-opt" data-poll-vote="${esc(p.id)}" data-choice="${esc(t.choice)}"${p.state!=='open'?' disabled':''} aria-pressed="${t.choice===p.my_choice}"><span class="poll-bar" style="width:${pct}%"></span><span class="poll-label">${esc(t.choice)}</span><span class="poll-n">${t.votes} · ${pct}%</span></button></li>`;}).join('')}</ul>
        <p class="community-muted">${p.my_choice?`Your answer: ${esc(p.my_choice)}.`:p.state==='open'?'Tap a choice to vote.':''}${p.event_id?' <button type="button" class="poll-link" data-poll-event="'+esc(p.event_id)+'">See the event</button>':''}</p>
        ${board?`<div class="community-actions"><button type="button" data-poll-state="${esc(p.id)}" data-state="${p.state==='open'?'closed':'open'}">${p.state==='open'?'Close the poll':'Reopen the poll'}</button></div>`:''}</article>`;}).join('')
      :'<p class="community-muted">No polls right now. A poll opens when the board approves a hosted Movie Night with film choices.</p>';
    body.querySelectorAll('[data-poll-vote]').forEach(b=>b.onclick=async()=>{try{await api('/api/polls/'+b.dataset.pollVote+'/vote',{method:'POST',body:JSON.stringify({choice:b.dataset.choice})});await paintPolls(true);}catch(e){alert(e.message);}});
    body.querySelectorAll('[data-poll-state]').forEach(b=>b.onclick=async()=>{await api('/api/polls/'+b.dataset.pollState,{method:'PUT',body:JSON.stringify({state:b.dataset.state})});await paintPolls(true);});
    body.querySelectorAll('[data-poll-event]').forEach(b=>b.onclick=()=>{pollDialog.close();window.openHBASummer?.();});
  }

  window.HBAEngage={loadSignups,watchSignups,signupHTML,bindSignups,refreshSignupNodes,offerForm,openHosting,openPoll,get signups(){return S.data;}};
  window.openHBAHosting=openHosting;window.openHBAPoll=openPoll;
})();
