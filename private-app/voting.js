(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kinds={advisory:'Advisory poll',board:'Board of Governors vote',membership:'Membership vote',capital:'Capital improvement vote',dues_increase:'Dues increase vote',election:'Election',removal_elected:'Removal vote (elected official)',removal_appointed:'Removal vote (appointed officer)',amendment:'Bylaw amendment vote'};
  const states={draft:'Draft · board only',noticed:'Notice published',open:'Voting open',closed:'Closed · awaiting Secretary certification',certified:'Certified · awaiting President',confirmed:'Decided',withdrawn:'Withdrawn',deferred:'Deferred'};
  const thresholds={majority:'Majority of Yes and No votes',two_thirds:'Two-thirds',plurality:'Most votes (plurality)',none:'No threshold · advisory'};
  const outcomes={passed:'Passed',failed:'Did not pass',no_quorum:'No quorum · no decision',tie_pending:'Tie · awaiting the President’s deciding vote',elected:'Elected',advisory:'Advisory result · not binding'};
  const electorate=v=>({governors:'Board of Governors (10 seats)',board_and_president:'Governors and the President',households:'Dues-paid households · one vote per paid property',street:`${v.street} Avenue households`,all_members:'All approved resident accounts'}[v.electorate]||v.electorate);
  const when=s=>s?new Date(s).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})+' ET':'not recorded';
  const day=s=>s?new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'date not set';
  let cache=null,loading=false,selected='',filter='active',receipts={},turnout={},wizard=null,loadError='';
  const dlg=document.createElement('dialog');dlg.id='voting-wizard';dlg.setAttribute('aria-labelledby','voting-wizard-title');document.body.append(dlg);
  async function load(c){
    loading=true;loadError='';
    try{cache=await c.api('/api/votes');}catch(e){loadError=e.message;cache=cache||null;}
    loading=false;
  }
  async function call(c,path,options,message){
    try{const r=await c.api(path,options);await load(c);c.render();if(message)c.status(message);return r;}
    catch(e){c.status(e.message,true);throw e;}
  }
  const meetingOf=(c,id)=>cache.meetings.find(m=>m.id===id);
  const result=id=>cache.results.find(r=>r.vote_id===id);
  const myUnits=id=>cache.summary[id]?.my_units||[];
  function statusLine(v){
    const s=cache.summary[v.id]||{},units=myUnits(v.id),res=result(v.id),m=v.meeting_id?meetingOf(null,v.meeting_id):null;
    const eligible=units.filter(u=>u.eligible),blocked=units.filter(u=>!u.eligible);
    const voted=(s.my_ballots||[]).map(b=>b.unit_key);
    if(['certified','confirmed'].includes(v.state)&&res)return `${outcomes[res.outcome]||res.outcome}${v.state==='certified'?' · certified by the Secretary, awaiting the President’s confirmation':' · confirmed'}`;
    if(v.state==='withdrawn'||v.state==='deferred')return `${states[v.state]} · see the record notes for the reason`;
    if(v.state==='closed')return 'Voting has closed. The Secretary certifies the count next; results appear here once confirmed.';
    const standing=!units.length?(v.electorate==='governors'||v.electorate==='board_and_president'?'You do not hold a voting seat for this vote.':v.electorate==='all_members'?'Your account was not on the roll when the poll opened.':'Your account is not linked to a household on this roll.')
      :eligible.length?`You have ${eligible.length} vote${eligible.length>1?'s':''} (${eligible.map(u=>u.label).join('; ')})${voted.length?` · ballot recorded for ${eligible.filter(u=>voted.includes(u.unit_key)).map(u=>u.label).join(', ')||'your unit'}`:''}.`
      :`Not eligible: ${blocked.map(u=>u.reason).join('; ')}.`;
    if(v.state==='draft')return 'Draft. Residents cannot see this until notice is published.';
    if(v.state==='noticed')return `${m?`Vote takes place at ${m.title} on ${day(m.meeting_date)} at ${m.meeting_time.slice(0,5)} ET`:'Opens when the Secretary opens voting'}. ${standing}`;
    if(v.state==='open')return `Open now${m?` · ${m.title}, ${day(m.meeting_date)}`:''}. ${standing}`;
    return states[v.state];
  }
  function canCastOnline(v){
    if(v.state==='noticed'&&v.kind!=='advisory')return {ok:false,why:(v.electorate==='households'||v.electorate==='street')?'How to vote: attend the meeting, or file a written proxy with the Secretary before it starts. '+(cache.procedures.confirmed_at&&cache.procedures.online_ballots_allowed?'Online ballots open when the President opens voting.':'Online ballots are not available for formal votes until the board-approved Voting Guidelines & Procedures are recorded.'):'How to vote: Governors vote at the meeting; the Secretary records each ballot.'};
    if(v.state!=='open')return {ok:false,why:''};
    if(v.kind!=='advisory'&&!(cache.procedures.confirmed_at&&cache.procedures.online_ballots_allowed))return {ok:false,why:'Online ballots for formal votes are not enabled until the board-approved Voting Guidelines & Procedures are recorded. Vote at the meeting or file a written proxy with the Secretary before it starts.'};
    const units=myUnits(v.id).filter(u=>u.eligible),voted=(cache.summary[v.id]?.my_ballots||[]).map(b=>b.unit_key);
    const open=units.filter(u=>!voted.includes(u.unit_key));
    if(!units.length)return {ok:false,why:''};
    if(!open.length)return {ok:false,why:'Your ballot has been recorded. A second ballot for the same household is not possible.'};
    return {ok:true,why:'',units:open};
  }
  function quorum(v){
    const s=cache.summary[v.id]||{},need=v.quorum_required,have=s.participating;
    if(!need)return `<small>No quorum requirement · ${s.eligible??'?'} eligible of ${s.listed??'?'} listed</small>`;
    const pct=have==null?0:Math.min(100,Math.round(have/need*100));
    return `<div class="voting-quorum" role="img" aria-label="${have==null?'Quorum of '+need+' required':have+' of '+need+' needed for quorum'}"><div style="width:${pct}%"></div></div><small>${have==null?`Quorum: ${need} required · ${s.eligible??'?'} eligible units on the frozen roll`:`${have} participating · ${need} needed for quorum · ${s.eligible} eligible`}${v.electorate==='households'||v.electorate==='street'?' · online ballots count toward quorum only if the procedures say so':''}</small>`;
  }
  function card(c,v){
    const m=v.meeting_id?meetingOf(c,v.meeting_id):null;
    return `<article class="community-card voting-card"><div><span class="community-tag">${esc(kinds[v.kind])} · ${esc(states[v.state])}${m?` · ${day(m.meeting_date)}`:''}</span><h4>${esc(v.title)}</h4><p class="voting-status">${esc(statusLine(v))}</p></div><button type="button" data-vote-open="${v.id}">${['open'].includes(v.state)&&canCastOnline(v).ok?'Vote now':'Details'}</button></article>`;
  }
  function render(c){
    if(!cache&&!loading){load(c).then(()=>c.render());return `<div class="community-section-head"><div><h3>Your vote matters</h3><p>Loading vote records…</p></div></div>`;}
    if(!cache)return `<div class="community-section-head"><div><h3>Your vote matters</h3><p>${esc(loadError||'Loading…')}</p></div></div>`;
    if(selected){const v=cache.votes.find(x=>x.id===selected);if(v)return detail(c,v);selected='';}
    const o=cache.offices,proc=cache.procedures;
    const groups={active:v=>['noticed','open','closed','certified'].includes(v.state),decided:v=>v.state==='confirmed',drafts:v=>v.state==='draft',history:v=>['withdrawn','deferred'].includes(v.state)};
    const rows=cache.votes.filter(groups[filter]||groups.active);
    const standing=cache.eligibility.map(e=>`<li><strong>${esc(e.address)}</strong>: ${e.status==='paid'?`${cache.year} dues recorded as paid · eligible for membership votes`:e.status==='unpaid'?`${cache.year} dues not recorded as paid · not eligible until the Treasurer records payment`:`${cache.year} dues status not recorded · ask the Treasurer`}</li>`).join('');
    return `<div class="community-section-head"><div><h3>Your vote matters</h3><p>Vote here on capital improvement funds, elections and motions. Under the 2022 Bylaws every capital improvement expenditure needs the members’ approval, so your vote decides what gets built. Formal votes are taken at meetings; advisory polls gather opinions only. Results are certified by the Secretary and confirmed by the President before they count.</p></div><div class="community-actions">${o.can_call?'<button type="button" id="vote-call">Call a vote or poll</button>':''}${o.admin?'<button type="button" id="vote-procedures">Procedures & settings</button>':''}</div></div>
      ${!proc.confirmed_at?`<p class="community-notice"><strong>Voting Guidelines & Procedures pending.</strong> Until the Secretary’s board-approved procedures are uploaded and recorded by the administrator, formal votes are cast in person or by written proxy at the meeting and recorded by the Secretary; online ballots are limited to advisory polls. Interpretations (majority of votes cast, proxies count toward quorum, online ballots do not) are labelled as pending.</p>`:`<p class="community-notice">Procedures in force: ${esc(proc.version_label)} adopted ${day(proc.adopted_on)} · online ballots ${proc.online_ballots_allowed?'allowed':'not allowed'} · majority measured by ${proc.majority_rule==='eligible_units'?'eligible units':'votes cast'}.</p>`}
      <section class="community-story voting-standing"><h3>Your voting standing</h3>${standing?`<ul>${standing}</ul>`:'<p>Your account is not linked to a household yet, so household votes are not available. Ask the board to link your address under Accounts.</p>'}<p class="community-muted">One vote per household plus one per additional dues-paid property (Article VII). Eligibility is frozen when each vote’s notice is published; later payments count from the next vote.${o.positions.length?` You hold: ${esc(o.positions.join(', '))}.`:''}</p>${c.member.household_uid?'<button type="button" data-jump="payments">Pay or report dues</button>':''}</section>
      <div class="community-filters voting-filters"><label>Show<select id="vote-filter">${[['active','Open & upcoming'],['decided','Decided'],...(c.isBoard()?[['drafts','Drafts']]:[]),['history','Withdrawn & deferred']].map(([v,l])=>`<option value="${v}"${filter===v?' selected':''}>${l}</option>`).join('')}</select></label></div>
      <div class="community-member-list">${rows.map(v=>card(c,v)).join('')||`<div class="community-empty"><h3>${filter==='active'?'No votes or polls are open':'Nothing here yet'}</h3><p>${filter==='active'?'When the President calls a vote and notice is published, it appears here with your eligibility.':'Decided and historical votes stay on record here.'}</p></div>`}</div>
      ${nominations(c)}`;
  }
  function nominations(c){
    const years=[...new Set([...(cache.elections||[]).map(e=>e.year),...cache.nominations.map(n=>n.election_year)])].filter(y=>y>=2027).sort();
    const rows=cache.nominations.filter(n=>c.isBoard()||n.state==='accepted'||n.created_by===c.member.id);
    return `<details class="voting-nominations"><summary>Nominations & candidate statements (${rows.filter(n=>n.state==='accepted').length} accepted)</summary><p class="community-muted">Elections are held at the August annual meeting every other year starting 2027 (President, Governors at Large; Street Governors by their street). Nominate a neighbor or yourself; the board accepts nominations per the procedures, and accepted candidates become the ballot options.</p>
      ${nominationYears().length?'<div class="community-actions"><button type="button" id="vote-nominate">Submit a nomination</button></div>':'<p class="community-muted">Nominations open when the board sets up the next election.</p>'}
      ${years.map(y=>`<h4>${y} election</h4>${rows.filter(n=>n.election_year===y).map(n=>`<article class="community-card"><div><span class="community-tag">${esc(n.position)} · ${esc(n.state)}</span><h4>${esc(n.candidate_name)}</h4>${n.statement?`<p class="community-prewrap">${esc(n.statement)}</p>`:''}<small>${esc(c.homes.properties.find(p=>p.uid===n.household_uid)?.address||'household not given')}</small></div><div class="community-actions">${c.isBoard()&&n.state==='submitted'?`<button type="button" data-nomination="${n.id}" data-state="accepted">Accept</button><button type="button" data-nomination="${n.id}" data-state="declined">Decline</button>`:''}${n.created_by===c.member.id&&['submitted','accepted'].includes(n.state)?`<button type="button" data-nomination="${n.id}" data-state="withdrawn">Withdraw</button>`:''}</div></article>`).join('')||'<p class="community-muted">No nominations yet.</p>'}`).join('')||'<p class="community-muted">No election year has nominations yet. The first election under the supplied rule is August 2027.</p>'}</details>`;
  }
  function detail(c,v){
    const o=cache.offices,s=cache.summary[v.id]||{},res=result(v.id),m=v.meeting_id?meetingOf(c,v.meeting_id):null,cast=canCastOnline(v),isBoard=c.isBoard();
    const notes=cache.annotations.filter(a=>a.vote_id===v.id),comments=cache.comments.filter(x=>x.vote_id===v.id&&(x.state==='published'||isBoard||x.created_by===c.member.id));
    const prev=v.supersedes_id?cache.votes.find(x=>x.id===v.supersedes_id):null,next=cache.votes.filter(x=>x.supersedes_id===v.id);
    const receipt=receipts[v.id];
    const tally=s.tally;
    const act=[];
    if(isBoard){
      if(v.state==='draft'){if(o.can_call)act.push('<button type="button" id="vote-edit">Edit draft</button>');act.push('<button type="button" id="vote-notice">Publish notice & freeze roll</button>');}
      if(v.state==='noticed'){if(o.can_certify)act.push('<button type="button" id="vote-refreeze">Re-freeze roll</button>');act.push('<button type="button" id="vote-open">Open voting</button>','<button type="button" id="vote-eml">Notice email draft (.eml)</button>');}
      if(v.state==='open'){if(o.can_certify)act.push('<button type="button" id="vote-record">Record meeting / proxy ballot</button>');act.push('<button type="button" id="vote-close">Close voting</button>');}
      if(['noticed','open'].includes(v.state)&&(v.electorate==='households'||v.electorate==='street')&&o.can_certify)act.push('<button type="button" id="vote-proxies">Proxy register</button>');
      if(['noticed','open','closed'].includes(v.state))act.push('<button type="button" id="vote-turnout">Turnout by street</button>');
      if(v.state==='closed'){if(o.can_certify)act.push('<button type="button" id="vote-certify">Certify results (Secretary)</button>');act.push('<button type="button" id="vote-reopen">Reopen voting</button>');}
      if(v.state==='certified'&&o.can_call){if(res?.outcome==='tie_pending')act.push('<button type="button" id="vote-tiebreak">Cast the deciding vote</button>');else act.push('<button type="button" id="vote-confirm">Confirm results (President)</button>');}
      if(v.state==='certified')act.push('<button type="button" id="vote-reopen">Reopen (discard certification)</button>');
      if(['draft','noticed','open'].includes(v.state)&&o.can_call)act.push('<button type="button" id="vote-defer">Defer</button>','<button type="button" id="vote-withdraw" class="community-danger">Withdraw</button>');
      if(!['draft'].includes(v.state))act.push('<button type="button" id="vote-note">Add record note</button>');
      if(v.state==='draft')act.push(c.deleteButton('vote',v.id));
    }
    const exports=[`<button type="button" id="vote-export">Export record (.md)</button>`,m?`<button type="button" id="vote-ics">Add to calendar (.ics)</button>`:''];
    return `<div class="community-section-head"><div><button type="button" id="vote-back" class="voting-back">← All votes</button><span class="community-tag">${esc(kinds[v.kind])} · ${esc(states[v.state])}</span><h3>${esc(v.title)}</h3><p class="voting-status">${esc(statusLine(v))}</p></div></div>
      ${v.kind==='advisory'?'<p class="community-notice">Advisory poll. Results inform the board and are never recorded as an Association decision.</p>':''}
      <section class="community-story"><h3>Motion</h3><p class="community-prewrap voting-motion">${esc(v.motion)}</p>${v.rationale?`<h4>Background</h4><p class="community-prewrap">${esc(v.rationale)}</p>`:''}${v.amount!=null?`<p>Amount: $${Number(v.amount).toLocaleString('en-US',{minimumFractionDigits:2})}</p>`:''}
        <dl class="voting-rules"><dt>Who votes</dt><dd>${esc(electorate(v))}</dd><dt>Decided by</dt><dd>${esc(thresholds[v.threshold])}${v.president_tie_break?' · President breaks an even tie':''}</dd><dt>Quorum</dt><dd>${v.quorum_required?v.quorum_required+(v.electorate==='governors'||v.electorate==='board_and_president'?' Governors present and able to vote':' households present or by written proxy'):'none set by the bylaws'}</dd><dt>Ballot</dt><dd>${v.secret_ballot?'Secret ballot · individual choices are never shown':'Recorded ballot'}</dd><dt>Meeting</dt><dd>${m?`${esc(m.title)} · ${day(m.meeting_date)} ${esc(m.meeting_time.slice(0,5))} ET${m.location?' · '+esc(m.location):''}`:'None (advisory)'}</dd>${v.proxy_deadline?`<dt>Proxies</dt><dd>Written proxies to the Secretary before the meeting starts (requested by ${when(v.proxy_deadline)})</dd>`:''}<dt>Roll</dt><dd>${v.roll_frozen_at?`${v.eligible_units} eligible of ${s.listed} listed · frozen ${when(v.roll_frozen_at)}`:'not frozen yet'}</dd></dl>
        <details><summary>Bylaw basis & cautions</summary><p>${esc(v.basis)}</p>${(v.cautions||[]).length?`<ul>${v.cautions.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${v.procedures_version?`<small>Procedures version at notice: ${esc(v.procedures_version)}</small>`:'<small>No adopted procedures were recorded when this vote was noticed; interpretations are pending.</small>'}</details>
        ${quorum(v)}</section>
      ${cast.ok?ballot(c,v,cast):cast.why?`<p class="community-notice">${esc(cast.why)}</p>`:''}
      ${receipt?`<p class="community-notice voting-receipt"><strong>Ballot recorded for ${esc(receipt.unit_label)}.</strong> Receipt code <code>${esc(receipt.receipt_code)}</code>. ${esc(receipt.message)}</p>`:''}
      ${tally&&(['certified','confirmed'].includes(v.state)||v.kind==='advisory'||isBoard)?`<section class="community-story"><h3>${['certified','confirmed'].includes(v.state)?'Result':v.kind==='advisory'?'Poll responses so far':'Count so far (board only)'}</h3>${res?`<p class="voting-outcome">${esc(outcomes[res.outcome]||res.outcome)}</p><p>${esc(res.rule_applied)}</p>`:''}<table class="voting-tally"><thead><tr><th>Choice</th><th>Votes</th></tr></thead><tbody>${Object.entries(tally.counts||{}).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<tr><td>${esc(k)}</td><td>${n}</td></tr>`).join('')||'<tr><td colspan="2">No ballots yet</td></tr>'}</tbody></table><small>${tally.units_participating} participating · ${tally.online} online · ${tally.proxies} by proxy · ${tally.recused} recused · ${tally.eligible_units} eligible</small>
        ${res?`<h4>What happened</h4><ol class="voting-history"><li>Notice published and roll frozen ${when(v.roll_frozen_at)} (${v.eligible_units} eligible).</li><li>Certified by ${esc(res.certified_label)} on ${when(res.certified_at)}.${res.notes?' Note: '+esc(res.notes):''}</li>${res.tie_break_choice?`<li>President’s deciding vote: ${esc(res.tie_break_choice)} (${when(res.tie_break_at)}).</li>`:''}<li>${res.confirmed_at?`Confirmed by ${esc(res.confirmed_label)} on ${when(res.confirmed_at)}. The record is now locked; later notes are added as annotations.`:'Awaiting the President’s confirmation. The President cannot be the certifier.'}</li></ol>`:''}</section>`:''}
      ${prev||next.length?`<section class="community-story"><h3>Motion history</h3>${prev?`<p>Follows: <button type="button" data-vote-open="${prev.id}" class="voting-link">${esc(prev.title)}</button> (${esc(states[prev.state])})</p>`:''}${next.map(n=>`<p>Followed by: <button type="button" data-vote-open="${n.id}" class="voting-link">${esc(n.title)}</button> (${esc(states[n.state])})</p>`).join('')}</section>`:''}
      ${notes.length?`<section class="community-story"><h3>Record notes</h3><ul class="voting-history">${notes.map(n=>`<li>${when(n.created_at)}: ${esc(n.note)}</li>`).join('')}</ul></section>`:''}
      ${v.state!=='draft'?`<section class="community-story"><h3>Questions & comments before the vote</h3><p class="community-muted">Comments are moderated by the board and shown with the vote; they are not ballots.</p>${comments.map(x=>`<article class="community-card"><div><span class="community-tag">${x.state==='published'?'Published':x.state==='hidden'?'Hidden by moderator':'Awaiting moderation'} · ${when(x.created_at)}</span><p class="community-prewrap">${esc(x.body)}</p></div>${isBoard?`<div class="community-actions">${x.state!=='published'?`<button type="button" data-comment="${x.id}" data-state="published">Publish</button>`:''}${x.state!=='hidden'?`<button type="button" data-comment="${x.id}" data-state="hidden">Hide</button>`:''}</div>`:''}</article>`).join('')||'<p class="community-muted">No comments yet.</p>'}${['noticed','open'].includes(v.state)?'<div class="community-actions"><button type="button" id="vote-comment">Ask a question / comment</button></div>':''}</section>`:''}
      ${turnout[v.id]?`<section class="community-story"><h3>Turnout by street</h3><p class="community-muted">${esc(turnout[v.id].note)}</p><table class="voting-tally"><thead><tr><th>Street</th><th>Eligible</th><th>Voted</th><th>By proxy</th></tr></thead><tbody>${Object.entries(turnout[v.id].streets).map(([st,t])=>`<tr><td>${esc(st)}</td><td>${t.eligible} of ${t.listed}</td><td>${t.voted}</td><td>${t.proxies}</td></tr>`).join('')}</tbody></table>${Object.values(turnout[v.id].streets).some(t=>t.not_yet.length)?`<details><summary>Eligible units without a ballot yet</summary><ul>${Object.values(turnout[v.id].streets).flatMap(t=>t.not_yet).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`:''}</section>`:''}
      <div class="community-actions voting-actions">${act.join('')}${exports.join('')}</div>`;
  }
  function ballot(c,v,cast){
    return `<section class="community-story voting-ballot"><h3>Your ballot${cast.units.length>1?'s':''}</h3><p>${cast.units.length>1?`You vote once per eligible property: ${esc(cast.units.map(u=>u.label).join(', '))}. Each ballot is cast separately.`:`Voting as ${esc(cast.units[0].label)}.`} ${v.secret_ballot?'This is a secret ballot: your choice is stored apart from your name.':'This is a recorded ballot.'}</p>
      <form id="vote-ballot-form"><fieldset><legend>Choose one</legend>${v.options.map((opt,i)=>`<label class="voting-option"><input type="radio" name="choice" value="${esc(opt)}"${i===0?' required':''}> ${esc(opt)}</label>`).join('')}</fieldset>
      <details><summary>Recuse instead (conflict of interest)</summary><label class="community-check"><input type="checkbox" name="recuse"> I recuse myself from this vote</label><label>Reason<input name="reason" maxlength="500"></label></details>
      <button type="submit">Review & cast ballot</button></form></section>`;
  }
  // ---------- president's guided wizard ----------
  function audienceFor(rules){return !rules?'':['governors','board_and_president'].includes(rules.electorate)?'board':['households','street'].includes(rules.electorate)?'general':'';}
  function openWizard(c,existing){
    const a=existing?.classification||{decision:'',title:'',motion:'',rationale:'',meeting_id:null,amount:null,emergency:false,street:'',hearing_scheduled:false,legal_review_done:false,board_determined:false,options:[],secret_ballot:null,proxy_deadline:null,supersedes_id:null};
    wizard={answers:{...a},existing,classification:null,timer:null};
    const prior=cache.votes.filter(v=>['withdrawn','deferred','confirmed','certified'].includes(v.state)&&v.id!==existing?.id);
    dlg.innerHTML=`<form class="community-form voting-wizard"><header><h3 id="voting-wizard-title">${existing?'Edit draft vote':'Call a vote or poll'}</h3><button type="button" id="voting-wizard-close">Cancel</button></header>
      <p>Answer what is being decided; the bylaws determine who votes, the threshold, quorum and ballot type. Nothing is visible to residents until you publish notice.</p>
      <label>What is being decided?<select name="decision" required><option value="">Choose…</option>${cache.decisions.map(d=>`<option value="${d.value}"${a.decision===d.value?' selected':''}>${esc(d.label)}</option>`).join('')}</select></label>
      <div id="wizard-rules" class="voting-rules-card" aria-live="polite"></div>
      <div id="wizard-fields">
        <label data-for="meeting">Meeting where the vote is taken<select name="meeting_id"><option value="">Choose a meeting…</option></select><small>Only meetings marked for the right audience are listed. Schedule one under Board meetings first if needed.</small></label>
        <label data-for="amount">Amount (dollars)<input name="amount" type="number" min="0" step="0.01" value="${a.amount??''}"></label>
        <label class="community-check" data-for="emergency"><input type="checkbox" name="emergency"${a.emergency?' checked':''}> This is emergency spending</label>
        <label data-for="street">Street<select name="street"><option value="">Choose…</option>${cache.streets.map(s=>`<option value="${s}"${a.street===s?' selected':''}>${s} Avenue</option>`).join('')}</select></label>
        <label data-for="options">Accepted candidates (one per line)<textarea name="options" rows="3">${esc((a.options||[]).join('\n'))}</textarea><small>Accepted nominations: ${esc(cache.nominations.filter(n=>n.state==='accepted').map(n=>n.candidate_name+' ('+n.position+')').join('; ')||'none yet')}</small></label>
        <label class="community-check" data-for="hearing"><input type="checkbox" name="hearing_scheduled"${a.hearing_scheduled?' checked':''}> The required hearing with the President, Governors and the officer has been scheduled</label>
        <label class="community-check" data-for="legal"><input type="checkbox" name="legal_review_done"${a.legal_review_done?' checked':''}> Outside legal counsel has reviewed the amendment (Article X)</label>
        <label class="community-check" data-for="board_determined"><input type="checkbox" name="board_determined"${a.board_determined?' checked':''}> The Board of Governors determined this issue goes to the membership</label>
        <label data-for="secret">Ballot type<select name="secret_ballot"><option value="">Bylaw default</option><option value="true"${a.secret_ballot===true?' selected':''}>Secret ballot</option><option value="false"${a.secret_ballot===false?' selected':''}>Recorded ballot</option></select></label>
        <label data-for="proxy">Requested proxy filing time (optional)<input name="proxy_deadline" type="datetime-local" value="${a.proxy_deadline?new Date(a.proxy_deadline).toISOString().slice(0,16):''}"><small>Bylaws: written proxies reach the Secretary before the meeting starts.</small></label>
      </div>
      <label>Title<input name="title" required maxlength="180" value="${esc(a.title)}"></label>
      <label>Exact motion wording<textarea name="motion" rows="4" required maxlength="12000">${esc(a.motion)}</textarea></label>
      <label>Background for residents (optional)<textarea name="rationale" rows="3" maxlength="12000">${esc(a.rationale)}</textarea></label>
      <label>Follows an earlier motion (optional)<select name="supersedes_id"><option value="">None</option>${prior.map(v=>`<option value="${v.id}"${a.supersedes_id===v.id?' selected':''}>${esc(v.title)} (${states[v.state]})</option>`).join('')}</select></label>
      <p id="voting-wizard-status" role="status"></p><button type="submit" class="community-submit" id="voting-wizard-save" disabled>${existing?'Save draft':'Save as draft'}</button></form>`;
    const form=dlg.querySelector('form');
    dlg.querySelector('#wizard-fields').hidden=true;
    dlg.querySelector('#voting-wizard-close').onclick=()=>dlg.close();
    const read=()=>{const fd=new FormData(form);const num=fd.get('amount');wizard.answers={decision:fd.get('decision'),title:fd.get('title'),motion:fd.get('motion'),rationale:fd.get('rationale'),meeting_id:fd.get('meeting_id')||null,amount:num===''?null:Number(num),emergency:fd.has('emergency'),street:fd.get('street')||'',hearing_scheduled:fd.has('hearing_scheduled'),legal_review_done:fd.has('legal_review_done'),board_determined:fd.has('board_determined'),options:String(fd.get('options')||'').split('\n').map(x=>x.trim()).filter(Boolean),secret_ballot:fd.get('secret_ballot')===''?null:fd.get('secret_ballot')==='true',proxy_deadline:fd.get('proxy_deadline')?new Date(fd.get('proxy_deadline')).toISOString():null,supersedes_id:fd.get('supersedes_id')||null};};
    async function classify(){
      read();const w=wizard;if(!w.answers.decision){dlg.querySelector('#wizard-rules').innerHTML='';dlg.querySelector('#wizard-fields').hidden=true;dlg.querySelector('#voting-wizard-save').disabled=true;return;}
      try{w.classification=await c.api('/api/votes/classify',{method:'POST',body:JSON.stringify(w.answers)});}catch(e){dlg.querySelector('#wizard-rules').innerHTML=`<p class="community-error">${esc(e.message)}</p>`;return;}
      paint();
    }
    function paint(){
      const r=wizard.classification,box=dlg.querySelector('#wizard-rules'),save=dlg.querySelector('#voting-wizard-save');
      const show=(key,on)=>{const el=dlg.querySelector(`[data-for="${key}"]`);if(el)el.hidden=!on;};
      dlg.querySelector('#wizard-fields').hidden=!!r.not_a_vote;
      if(r.not_a_vote){box.innerHTML=`<p class="community-notice"><strong>No vote is needed.</strong> ${esc(r.not_a_vote)}</p>`;save.disabled=true;Object.keys({meeting:1,amount:1,emergency:1,street:1,options:1,hearing:1,legal:1,board_determined:1,secret:1,proxy:1}).forEach(k=>show(k,false));return;}
      const ru=r.rules,aud=audienceFor(ru);
      show('meeting',ru.kind!=='advisory');show('amount',['capital','board'].includes(ru.kind));show('emergency',ru.kind==='board');show('street',ru.electorate==='street');show('options',ru.kind==='election');show('hearing',ru.kind==='removal_appointed');show('legal',ru.kind==='amendment');show('board_determined',['membership','capital','dues_increase'].includes(ru.kind));show('secret',ru.kind!=='advisory');show('proxy',['households','street'].includes(ru.electorate));
      const sel=form.elements.meeting_id,current=wizard.answers.meeting_id;
      sel.innerHTML='<option value="">Choose a meeting…</option>'+cache.meetings.filter(m=>m.audience===aud&&m.state!=='cancelled').map(m=>`<option value="${m.id}"${m.id===current?' selected':''}>${esc(m.title)} · ${day(m.meeting_date)} ${esc(m.meeting_time.slice(0,5))}</option>`).join('');
      if(aud&&sel.options.length<=1)sel.innerHTML+=`<option value="" disabled>No ${aud==='board'?'Board of Governors':'general membership'} meeting scheduled yet</option>`;
      box.innerHTML=`<p class="community-tag">${esc(r.label)}</p><dl class="voting-rules"><dt>Who votes</dt><dd>${esc(electorate({electorate:ru.electorate,street:ru.street||'(street)'}))}</dd><dt>Decided by</dt><dd>${esc(thresholds[ru.threshold])}${ru.tie_break?' · President breaks an even tie':''}</dd><dt>Quorum</dt><dd>${ru.quorum_required||'none in the bylaws'}</dd><dt>Ballot</dt><dd>${ru.secret?'Secret':'Recorded'}</dd><dt>Meeting</dt><dd>${aud==='board'?'Board of Governors meeting':aud==='general'?'General membership meeting':'None (advisory)'}</dd></dl><p>${esc(ru.basis)}</p>
        ${r.problems.length?`<ul class="voting-problems">${r.problems.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>`:'<p class="voting-ok">All bylaw requirements for calling this vote are met.</p>'}
        ${r.questions.length?`<ul class="voting-questions">${r.questions.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>`:''}
        ${r.cautions.length?`<details><summary>Cautions recorded with the vote</summary><ul>${r.cautions.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></details>`:''}`;
      save.disabled=r.problems.length>0;
    }
    form.addEventListener('input',e=>{if(['title','motion','rationale'].includes(e.target.name))return;clearTimeout(wizard.timer);wizard.timer=setTimeout(classify,250);});
    form.addEventListener('change',()=>{clearTimeout(wizard.timer);wizard.timer=setTimeout(classify,50);});
    form.onsubmit=async e=>{
      e.preventDefault();if(!form.reportValidity())return;read();
      const st=dlg.querySelector('#voting-wizard-status');st.textContent='Saving draft…';st.className='';
      try{const saved=await c.api('/api/votes'+(existing?'/'+existing.id:''),{method:existing?'PUT':'POST',body:JSON.stringify(wizard.answers)});dlg.close();selected=saved.id;await load(c);c.render();c.status('Draft saved. Publish notice when the meeting is set; residents see nothing until then.');}
      catch(err){st.textContent=err.message;st.className='community-error';}
    };
    dlg.showModal();
    if(a.decision)classify();
  }
  // ---------- forms ----------
  function proceduresForm(c){
    const p=cache.procedures,docs=c.data.documents||[],st=c.data.settings||{};
    c.formDialog('Voting procedures & public settings',`<p>Only the administrator changes these. The Secretary maintains the Voting Guidelines & Procedures (bylaws); record the board-approved document here to enable formal online ballots and settle interpretations.</p>
      <label>Procedures document (archived PDF)<select name="document_id"><option value="">Not uploaded yet</option>${docs.map(d=>`<option value="${d.id}"${p.document_id===d.id?' selected':''}>${esc(d.title)}${d.document_year?' ('+d.document_year+')':''}</option>`).join('')}</select></label>
      <label>Version label<input name="version_label" maxlength="160" value="${esc(p.version_label||'')}"></label>
      <label>Board approval date<input name="adopted_on" type="date" value="${esc(p.adopted_on||'')}"></label>
      <label class="community-check"><input type="checkbox" name="online_ballots_allowed"${p.online_ballots_allowed?' checked':''}> Procedures allow online ballots for formal votes</label>
      <label class="community-check"><input type="checkbox" name="online_counts_toward_quorum"${p.online_counts_toward_quorum?' checked':''}> Online ballots count toward the 30-household quorum</label>
      <label>Majority is measured against<select name="majority_rule"><option value="votes_cast"${p.majority_rule!=='eligible_units'?' selected':''}>Yes and No votes cast (abstentions excluded)</option><option value="eligible_units"${p.majority_rule==='eligible_units'?' selected':''}>All eligible units</option></select></label>
      <label>Note<textarea name="note" rows="2" maxlength="3000">${esc(p.note||'')}</textarea></label>
      <label class="community-check"><input type="checkbox" name="confirm"${p.confirmed_at?' checked':''}> I confirm these are the board-approved procedures (requires document, date and version)</label>
      <h4>Public Facebook group card (bulletin)</h4>
      <label>Group name<input name="public_facebook_group_name" maxlength="200" value="${esc(st.public_facebook_group_name||'')}"></label>
      <label>Group link (https://www.facebook.com/…)<input name="public_facebook_group_url" maxlength="500" value="${esc(st.public_facebook_group_url||'')}" placeholder="Copy from the group’s Share menu"></label>
      <label>Note shown with the card<textarea name="public_facebook_group_note" rows="2" maxlength="1000">${esc(st.public_facebook_group_note||'')}</textarea></label>
      <h4>Local Sands merchandise store card (bulletin)</h4>
      <label>Store name<input name="public_local_sands_name" maxlength="200" value="${esc(st.public_local_sands_name||'')}" placeholder="Local Sands"></label>
      <label>Store link (Facebook page, Instagram or web shop)<input name="public_local_sands_url" maxlength="500" value="${esc(st.public_local_sands_url||'')}" placeholder="Copy from the page’s Share menu"></label>
      <label>Note shown with the card<textarea name="public_local_sands_note" rows="2" maxlength="1000">${esc(st.public_local_sands_note||'')}</textarea></label>`,
      async fd=>{const b=Object.fromEntries(fd);const body={document_id:b.document_id||null,version_label:b.version_label,adopted_on:b.adopted_on||null,online_ballots_allowed:fd.has('online_ballots_allowed'),online_counts_toward_quorum:fd.has('online_counts_toward_quorum'),majority_rule:b.majority_rule,note:b.note,confirm:fd.has('confirm')};
        await c.api('/api/voting-procedures',{method:'PUT',body:JSON.stringify(body)});
        for(const k of ['public_facebook_group_name','public_facebook_group_url','public_facebook_group_note','public_local_sands_name','public_local_sands_url','public_local_sands_note'])if((st[k]||'')!==(b[k]||''))await c.api('/api/settings/'+k,{method:'PUT',body:JSON.stringify({value:b[k]||''})});
        await c.mutate('/api/session',{},'Procedures and settings saved.');await load(c);c.render();},{},'Save');
  }
  // Only years whose election the board has set up and not yet closed accept nominations (database rule).
  const nominationYears=()=>(cache.elections||[]).filter(e=>['planning','nominations_open','meeting_scheduled'].includes(e.state)).map(e=>e.year).sort();
  function nominateForm(c){
    const years=nominationYears();
    c.formDialog('Submit a nomination',`<label>Election year<select name="election_year">${years.map(y=>`<option value="${y}">${y} (August annual meeting)</option>`).join('')}</select></label><label>Position<select name="position">${['President',...cache.seats].map(s=>`<option value="${s}">${s}</option>`).join('')}</select></label><label>Candidate name<input name="candidate_name" required maxlength="160"></label><label>Candidate’s household<select name="household_uid"><option value="">Not given</option>${c.homes.properties.map(p=>`<option value="${p.uid}">${esc(p.address)}</option>`).join('')}</select></label><label>Candidate statement (optional)<textarea name="statement" rows="3" maxlength="4000"></textarea></label><p>Elected officials may hold one office per residence or property (Article IV). The board reviews nominations before they appear as ballot options.</p>`,
      fd=>{const b=Object.fromEntries(fd);b.election_year=+b.election_year;b.household_uid=b.household_uid||null;return call(c,'/api/nominations',{method:'POST',body:JSON.stringify(b)},'Nomination submitted for board review.');},{},'Submit');
  }
  async function voteRoll(c,v){
    try{return await c.api(`/api/votes/${v.id}/roll`);}catch(e){c.status(e.message,true);throw e;}
  }
  async function recordForm(c,v){
    const got=await voteRoll(c,v);
    const roll=got.roll.filter(r=>r.eligible),done=new Set(got.ballots.map(b=>b.unit_key)),open=roll.filter(r=>!done.has(r.unit_key));
    c.formDialog('Record a ballot taken at the meeting',`<p>${open.length} eligible units without a ballot. Proxy ballots require the written proxy to be filed in the register first.</p><label>Unit<select name="unit_key" required>${open.map(r=>`<option value="${esc(r.unit_key)}">${esc(r.label)}</option>`).join('')}</select></label><label>Source<select name="source"><option value="in_person">In person at the meeting</option><option value="proxy">Written proxy</option></select></label><label>Choice<select name="choice">${v.options.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></label><label class="community-check"><input type="checkbox" name="recuse"> Recused (conflict of interest)</label><label>Recusal reason<input name="reason" maxlength="500"></label>`,
      fd=>{const b=Object.fromEntries(fd);b.recuse=fd.has('recuse');return call(c,`/api/votes/${v.id}/record`,{method:'POST',body:JSON.stringify(b)},'Ballot recorded. Receipt code issued for the Secretary’s log.');},{},'Record ballot');
  }
  async function proxyForm(c,v){
    const got=await voteRoll(c,v);
    const roll=got.roll.filter(r=>r.eligible),list=cache.proxies.filter(p=>p.vote_id===v.id);
    c.formDialog('Proxy register',`<p>Written proxies must reach the Secretary before the meeting starts (Article VII). Filed proxies count toward quorum once the proxy ballot is recorded.</p>${list.length?`<ul class="voting-history">${list.map(p=>`<li>${esc(c.homes.properties.find(h=>h.uid===p.household_uid)?.address||p.household_uid)} · held by ${esc(p.holder_name)} · filed ${when(p.filed_at)}${p.note?' · '+esc(p.note):''} <button type="button" data-proxy-remove="${p.id}">Remove</button></li>`).join('')}</ul>`:'<p>No proxies filed.</p>'}<h4>File a proxy</h4><label>Household<select name="household_uid" required>${roll.map(r=>`<option value="${esc(r.household_uid)}">${esc(r.label)}</option>`).join('')}</select></label><label>Proxy holder (name)<input name="holder_name" required maxlength="160"></label><label>Received at<input name="filed_at" type="datetime-local" required value="${new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)}"></label><label>Note<input name="note" maxlength="1000"></label>`,
      fd=>{const b=Object.fromEntries(fd);b.filed_at=new Date(b.filed_at).toISOString();return call(c,`/api/votes/${v.id}/proxies`,{method:'POST',body:JSON.stringify(b)},'Proxy filed.');},{},'File proxy');
    document.querySelectorAll('#community-editor [data-proxy-remove]').forEach(b=>b.onclick=async()=>{await call(c,'/api/vote-proxies/'+b.dataset.proxyRemove,{method:'DELETE'},'Proxy removed.');document.getElementById('community-editor').close();});
  }
  function download(c,path,name){
    c.api(path,{binary:true}).then(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);}).catch(e=>c.status(e.message,true));
  }
  function bind(c,root){
    const click=(id,fn)=>{const b=root.querySelector('#'+id);if(b)b.onclick=()=>{const p=fn();if(p?.catch)p.catch(()=>{});};};
    root.querySelectorAll('[data-vote-open]').forEach(b=>b.onclick=()=>{selected=b.dataset.voteOpen;c.render();});
    const f=root.querySelector('#vote-filter');if(f)f.onchange=()=>{filter=f.value;c.render();};
    click('vote-back',()=>{selected='';c.render();});
    click('vote-call',()=>openWizard(c));
    click('vote-procedures',()=>proceduresForm(c));
    click('vote-nominate',()=>nominateForm(c));
    root.querySelectorAll('[data-nomination]').forEach(b=>b.onclick=()=>call(c,'/api/nominations/'+b.dataset.nomination,{method:'PUT',body:JSON.stringify({state:b.dataset.state})},'Nomination updated.').catch(()=>{}));
    root.querySelectorAll('[data-comment]').forEach(b=>b.onclick=()=>call(c,'/api/vote-comments/'+b.dataset.comment,{method:'PUT',body:JSON.stringify({state:b.dataset.state})},'Comment moderated.').catch(()=>{}));
    const v=cache?.votes.find(x=>x.id===selected);if(!v)return;
    const reason=(title,path,msg,required=true)=>c.formDialog(title,`<label>Reason${required?'':' (optional)'}<textarea name="reason" rows="3" maxlength="2000"${required?' required':''}></textarea></label><p>The reason is added to the vote’s record notes and stays visible.</p>`,fd=>call(c,path,{method:'POST',body:JSON.stringify(Object.fromEntries(fd))},msg),{},'Continue');
    click('vote-edit',()=>openWizard(c,v));
    click('vote-notice',()=>c.formDialog('Publish notice & freeze the roll',`<p>Publishing freezes eligibility from today’s dues and officeholder records, locks the motion wording, and makes the vote visible to residents. ${v.kind==='advisory'?'Advisory polls open immediately.':'Later dues payments count from the next vote unless the Secretary re-freezes before opening.'}</p><label class="community-check"><input type="checkbox" name="ok" required> Publish notice now</label>`,()=>call(c,`/api/votes/${v.id}/notice`,{method:'POST',body:'{}'},'Notice published and roll frozen. No email was sent; download the notice draft to send it yourself.'),{},'Publish'));
    click('vote-refreeze',()=>call(c,`/api/votes/${v.id}/refreeze`,{method:'POST',body:'{}'},'Roll re-frozen from current records.'));
    click('vote-open',()=>call(c,`/api/votes/${v.id}/state/open`,{method:'POST',body:'{}'},'Voting is open.'));
    click('vote-close',()=>c.formDialog('Close voting',`<p>Closing stops all ballots. The Secretary then certifies the count.</p><label class="community-check"><input type="checkbox" name="ok" required> Close voting now</label>`,()=>call(c,`/api/votes/${v.id}/state/close`,{method:'POST',body:'{}'},'Voting closed.'),{},'Close'));
    click('vote-reopen',()=>reason('Reopen voting',`/api/votes/${v.id}/state/reopen`,'Voting reopened; any certification was discarded.'));
    click('vote-withdraw',()=>reason('Withdraw this motion',`/api/votes/${v.id}/state/withdraw`,'Motion withdrawn.'));
    click('vote-defer',()=>reason('Defer this motion',`/api/votes/${v.id}/state/defer`,'Motion deferred. Propose a follow-up motion when ready.'));
    click('vote-certify',()=>c.formDialog('Certify results (Secretary)',`<p>The count, quorum and bylaw rule are computed from the frozen roll and ballots. Certification locks the count; the President then confirms (and casts a deciding vote if the Governors tied evenly).</p><label>Secretary notes (optional)<textarea name="notes" rows="3" maxlength="4000"></textarea></label><label>Supporting minutes<select name="minutes_document_id"><option value="">Not linked yet</option>${(c.data.documents||[]).filter(d=>d.category==='minutes').map(d=>`<option value="${d.id}">${esc(d.title)}</option>`).join('')}</select></label>`,fd=>{const b=Object.fromEntries(fd);b.minutes_document_id=b.minutes_document_id||null;return call(c,`/api/votes/${v.id}/certify`,{method:'POST',body:JSON.stringify(b)},'Results certified. Awaiting the President.');},{},'Certify'));
    click('vote-tiebreak',()=>c.formDialog('President’s deciding vote',`<p>Article V: when an even number of Governors vote and the result is a tie, the President casts the deciding vote.</p><label>Deciding vote<select name="choice"><option value="Yes">Yes</option><option value="No">No</option></select></label>`,fd=>call(c,`/api/votes/${v.id}/tie-break`,{method:'POST',body:JSON.stringify(Object.fromEntries(fd))},'Deciding vote recorded. Confirm the result to close the record.'),{},'Cast deciding vote'));
    click('vote-confirm',()=>c.formDialog('Confirm results (President)',`<p>Confirming locks the result permanently. Later corrections are added as annotations, never edits.</p><label>Note (optional)<textarea name="reason" rows="2" maxlength="2000"></textarea></label><label class="community-check"><input type="checkbox" name="ok" required> I confirm the certified result</label>`,fd=>call(c,`/api/votes/${v.id}/confirm`,{method:'POST',body:JSON.stringify({reason:fd.get('reason')||''})},'Result confirmed and locked.'),{},'Confirm'));
    click('vote-note',()=>c.formDialog('Add a record note',`<label>Note<textarea name="note" rows="3" required maxlength="4000"></textarea></label>`,fd=>call(c,`/api/votes/${v.id}/annotations`,{method:'POST',body:JSON.stringify(Object.fromEntries(fd))},'Note added.'),{},'Add note'));
    click('vote-comment',()=>c.formDialog('Ask a question or comment',`<label>Your comment<textarea name="body" rows="4" required maxlength="3000"></textarea></label><p>Shown after a board member publishes it. This is not a ballot.</p>`,fd=>call(c,`/api/votes/${v.id}/comments`,{method:'POST',body:JSON.stringify(Object.fromEntries(fd))},'Comment submitted for moderation.'),{},'Submit'));
    click('vote-record',()=>recordForm(c,v).catch(()=>{}));
    click('vote-proxies',()=>proxyForm(c,v).catch(()=>{}));
    click('vote-turnout',async()=>{try{turnout[v.id]=await c.api(`/api/votes/${v.id}/turnout`);c.render();}catch(e){c.status(e.message,true);}});
    click('vote-export',()=>download(c,`/api/votes/${v.id}/export.md`,`HBA-vote-${v.id.slice(0,8)}.md`));
    click('vote-ics',()=>download(c,`/api/votes/${v.id}/calendar.ics`,`HBA-vote-${v.id.slice(0,8)}.ics`));
    click('vote-eml',()=>download(c,`/api/votes/${v.id}/notice.eml`,`HBA-vote-notice-${v.id.slice(0,8)}.eml`));
    const bf=root.querySelector('#vote-ballot-form');
    if(bf)bf.onsubmit=e=>{
      e.preventDefault();const fd=new FormData(bf),recuse=fd.has('recuse'),choice=fd.get('choice')||'';
      if(!recuse&&!choice){c.status('Choose an option or recuse.',true);return;}
      c.formDialog('Confirm your ballot',`<p>${recuse?'You are recusing yourself from this vote.':`Your choice: <strong>${esc(choice)}</strong>`}</p><p>${v.secret_ballot?'Your choice is stored separately from your name and cannot be changed after casting.':'This recorded ballot cannot be changed after casting.'} You will receive a receipt code.</p><label class="community-check"><input type="checkbox" name="ok" required> Cast this ballot</label>`,
        async()=>{const r=await call(c,`/api/votes/${v.id}/ballot`,{method:'POST',body:JSON.stringify({choice,recuse,reason:fd.get('reason')||''})},'Ballot recorded.');receipts[v.id]=r;c.render();},{},'Cast ballot');
    };
  }
  window.HBAVoting={render,bind,reset(){cache=null;},get selected(){return selected;},select(id){selected=id;}};
})();
