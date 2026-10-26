(() => {
  'use strict';
  // Contact our team: officers and governors with contact details, "your governor" for the signed-in
  // household, resident messages to governors (stored in the private archive, never emailed automatically)
  // and the board inbox for those messages.
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STREETS=['Pilgrim','Algelo','Worrall','Surf','Turner','Glen','Reynolds'];
  const OFFICERS=['President','Vice President','Secretary','Treasurer'];
  const AT_LARGE=['Governor at Large 1','Governor at Large 2','Governor at Large 3'];
  const api=(p,o)=>window.HBACommunity.api(p,o);
  let team=null,teamAt=0,messages=null,status='',error='',loading=false;
  const dlg=document.createElement('dialog');dlg.id='team-dialog';dlg.setAttribute('aria-labelledby','team-title');document.body.append(dlg);
  const msgDlg=document.createElement('dialog');msgDlg.id='governor-message-dialog';msgDlg.setAttribute('aria-labelledby','governor-message-title');document.body.append(msgDlg);
  const editDlg=document.createElement('dialog');editDlg.id='team-edit-dialog';editDlg.setAttribute('aria-labelledby','team-edit-title');document.body.append(editDlg);
  const prettyStreet=s=>s?s.replace(/\s+AVE$/i,' Avenue').replace(/\s+RD$/i,' Road').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()):'';
  const prettyAddress=a=>a?prettyStreet(a):'';
  function streetOf(address){const m=/^\S+\s+(\S+)/.exec(address||'');const first=m?m[1]:'';return first?first[0]+first.slice(1).toLowerCase():'';}
  async function load(force=false){
    if(team&&!force&&Date.now()-teamAt<5*60000)return team;
    team=await api('/api/team',{signal:AbortSignal.timeout(20000)});teamAt=Date.now();return team;
  }
  function holder(position){return team?.officeholders.find(o=>o.position===position)||null;}
  function governorForAddress(address){
    const street=streetOf(address);
    if(STREETS.includes(street))return {position:street+' Street Governor',street,represented:true,holder:holder(street+' Street Governor')};
    return {position:null,street,represented:false,holder:null};
  }
  function telLink(p){return p?`<a class="team-link" href="tel:${esc(p.replace(/[^\d+]/g,''))}">${esc(p)}</a>`:'';}
  function mailLink(e,subject){return e?`<a class="team-link" href="mailto:${esc(e)}${subject?'?subject='+encodeURIComponent(subject):''}">${esc(e)}</a>`:'';}
  function personCard(position,o,opts={}){
    const name=o?.member_name||'Not entered yet';
    const detailLines=[];
    if(o?.address)detailLines.push(`<span class="team-line">Summer: ${esc(prettyAddress(o.address))}</span>`);
    if(o?.winter_address)detailLines.push(`<span class="team-line">Winter: ${esc(o.winter_address)}</span>`);
    if(o?.contact_phone)detailLines.push(`<span class="team-line">${telLink(o.contact_phone)}</span>`);
    if(o?.contact_email)detailLines.push(`<span class="team-line">${mailLink(o.contact_email,'Hamilton Beach: ')}</span>`);
    if(o&&!o.share_contact&&!o.contact_phone&&!o.contact_email)detailLines.push('<span class="team-line team-muted">Contact details not shared in the app. Use Message instead.</span>');
    if(!o)detailLines.push('<span class="team-line team-muted">The board has not recorded who holds this office. Messages still reach the board inbox.</span>');
    return `<article class="team-card${opts.mine?' team-card-mine':''}">${opts.mine?'<span class="team-badge">Your governor</span>':''}<p class="team-position">${esc(opts.label||position)}</p><h4>${esc(name)}</h4>${detailLines.join('')}
      <div class="team-actions"><button type="button" class="team-message" data-message-position="${esc(position)}">Message${o?' '+esc(o.member_name.split(' ')[0]):''}</button>${team?.board?`<button type="button" class="team-edit" data-edit-position="${esc(position)}">Edit details</button>`:''}</div></article>`;
  }
  function mineSection(){
    const mine=team.my_households||[];
    if(!mine.length)return `<section class="team-mine"><h3>Your governor</h3><p>Your account is not linked to a home yet, so the app cannot tell which street governor represents you. A board member can link your household in Accounts. Until then, the President and the three Governors at Large serve every member.</p><div class="team-actions"><button type="button" class="team-message" data-message-position="President">Message the President</button></div></section>`;
    return mine.map(h=>{
      const g=governorForAddress(h.address);
      if(g.represented)return `<section class="team-mine"><h3>Your governor · ${esc(prettyAddress(h.address))}</h3><p>Under the bylaws, ${esc(g.street)} Avenue elects its own Street Governor to bring residents’ questions to the Board of Governors.</p><div class="team-grid">${personCard(g.position,g.holder,{mine:true})}</div></section>`;
      return `<section class="team-mine"><h3>Your governor · ${esc(prettyAddress(h.address))}</h3><p>The bylaws name seven street governors (${STREETS.join(', ')}). ${esc(prettyStreet(h.street||'')||'Your street')} is outside the association’s current membership area, so no street governor is elected for it. Questions are welcome through the President or a Governor at Large.</p><div class="team-grid">${AT_LARGE.map(p=>personCard(p,holder(p),{mine:true,label:'Governor at Large'})).join('')}</div></section>`;
    }).join('');
  }
  function messagesSection(){
    if(!messages)return '<p class="team-muted">Loading messages…</p>';
    const rows=messages.messages||[];
    if(messages.board){
      const mineP=new Set(messages.my_positions||[]);
      return `<section class="team-inbox"><div class="team-section-head"><h3>Board inbox · messages to governors</h3><p>${rows.filter(r=>r.state==='new').length} new. Messages are stored in the private archive; nothing is emailed automatically. Mark a message read or replied once you have followed up by phone or email.</p></div>
        ${rows.length?rows.map(r=>`<article class="team-msg team-msg-${esc(r.state)}${mineP.has(r.to_position)?' team-msg-mine':''}"><div class="team-msg-head"><span class="team-tag">${esc(r.state==='new'?'New':r.state==='read'?'Read':'Replied')}</span><span class="team-tag">To ${esc(r.to_position)}${mineP.has(r.to_position)?' (you)':''}</span><span class="team-muted">${esc(new Date(r.created_at).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}))}</span></div>
          <h4>${esc(r.subject)}</h4><p class="team-from">From ${esc(r.from_name||'Resident')}${r.from_address?' · '+esc(prettyAddress(r.from_address)):''}</p><p class="team-body">${esc(r.body)}</p>
          ${r.board_note?`<p class="team-note">Board note: ${esc(r.board_note)}</p>`:''}
          <div class="team-actions">${r.state!=='read'?`<button type="button" data-msg-state="read" data-msg-id="${r.id}">Mark read</button>`:''}${r.state!=='replied'?`<button type="button" data-msg-state="replied" data-msg-id="${r.id}">Mark replied</button>`:''}<button type="button" data-msg-note="${r.id}">Add board note</button></div></article>`).join(''):'<p class="team-muted">No messages yet.</p>'}</section>`;
    }
    return `<section class="team-inbox"><div class="team-section-head"><h3>Your messages</h3><p>Saved to the board inbox in this app. “Read” and “Replied” are set by the board once they follow up.</p></div>
      ${rows.length?rows.map(r=>`<article class="team-msg team-msg-${esc(r.state)}"><div class="team-msg-head"><span class="team-tag">${esc(r.state==='new'?'Sent · not yet read':r.state==='read'?'Read by the board':'Replied')}</span><span class="team-tag">To ${esc(r.to_position)}</span><span class="team-muted">${esc(new Date(r.created_at).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}))}</span></div><h4>${esc(r.subject)}</h4><p class="team-body">${esc(r.body)}</p>${r.board_note?`<p class="team-note">Board note: ${esc(r.board_note)}</p>`:''}</article>`).join(''):'<p class="team-muted">You have not sent a message yet.</p>'}</section>`;
  }
  function render(){
    const art=window.HBAArt?.spring;
    dlg.innerHTML=`<div class="team-shell"><header class="team-head"><div><p>Hamilton Beach Association</p><h2 id="team-title">Contact our team</h2></div><div class="team-head-actions"><button type="button" id="team-refresh"${loading?' disabled':''}>Refresh</button><button type="button" id="team-close">Dashboard</button></div></header>
      <p id="team-status" role="status" aria-live="polite" class="${error?'team-error':''}">${esc(error||status)}</p>
      <div class="team-content">
        ${!team?`<div class="team-intro">${art?`<figure class="team-art" style="background-image:url('${art.tiny}')"><img src="${art.src}" alt="${esc(art.alt)}" loading="lazy"><figcaption>${esc(art.label)}</figcaption></figure>`:''}<p>${loading?'Loading the officers and governors…':'Sign in as an approved resident to see the team’s contact details.'}</p>${loading?'':'<div class="team-actions"><button type="button" id="team-signin">Sign in</button></div>'}</div>`:`
        <div class="team-intro">${art?`<figure class="team-art" style="background-image:url('${art.tiny}')"><img src="${art.src}" alt="${esc(art.alt)}" loading="lazy"><figcaption>${esc(art.label)}</figcaption></figure>`:''}<div><p class="team-lede">Officers and Governors 2025–2027. Call, email, or send a message inside the app; the board sees messages here and in their dashboard.</p><div class="team-actions"><button type="button" class="team-message team-primary" data-message-position="">Message my governor</button></div></div></div>
        ${mineSection()}
        <section><h3>Officers</h3><div class="team-grid">${OFFICERS.map(p=>personCard(p,holder(p))).join('')}</div></section>
        <section><h3>Street governors</h3><p class="team-muted">Each of the seven streets elects a governor who lives on that street. Streets not listed (${esc((team.streets_without_governor||[]).map(prettyStreet).join(', ')||'none')}) are served by the Governors at Large.</p><div class="team-grid">${STREETS.map(s=>personCard(s+' Street Governor',holder(s+' Street Governor'),{label:s+' Avenue Governor'})).join('')}</div></section>
        <section><h3>Governors at large</h3><div class="team-grid">${AT_LARGE.map(p=>personCard(p,holder(p),{label:'Governor at Large'})).join('')}</div></section>
        ${messagesSection()}
        <p class="team-footnote">Contact details are transcribed from the Officers and Governors 2025–2027 list distributed with the March 2026 newsletter. Terms run from the August 2025 election to the August 2027 election, as derived from that list’s title and the bylaws’ every-other-August cycle; exact meeting dates are not recorded here. Send corrections to the Secretary. The board can hide a person’s details with Edit details. Office records do not change app permissions.</p>`}
      </div></div>`;
    dlg.querySelector('#team-close').onclick=()=>dlg.close();
    dlg.querySelector('#team-refresh').onclick=()=>open({force:true});
    dlg.querySelector('#team-signin')?.addEventListener('click',()=>{dlg.close();window.openHBACommunity('overview');});
    dlg.querySelectorAll('[data-message-position]').forEach(b=>b.onclick=()=>openMessage({position:b.dataset.messagePosition||undefined}));
    dlg.querySelectorAll('[data-edit-position]').forEach(b=>b.onclick=()=>editForm(b.dataset.editPosition));
    dlg.querySelectorAll('[data-msg-state]').forEach(b=>b.onclick=()=>review(b.dataset.msgId,{state:b.dataset.msgState}));
    dlg.querySelectorAll('[data-msg-note]').forEach(b=>b.onclick=()=>noteForm(b.dataset.msgNote));
  }
  function noteForm(id){
    const r=(messages?.messages||[]).find(m=>m.id===id);if(!r)return;
    editDlg.innerHTML=`<form class="team-form"><header><h3 id="team-edit-title">Board note</h3><button type="button" id="te-cancel">Cancel</button></header><p>Visible to the resident who sent “${esc(r.subject)}”. Use it to say how and when you followed up.</p><label>Note<textarea name="board_note" rows="4" maxlength="3000">${esc(r.board_note||'')}</textarea></label><p id="te-status" role="status"></p><button type="submit" class="team-primary">Save note</button></form>`;
    editDlg.showModal();editDlg.querySelector('#te-cancel').onclick=()=>editDlg.close();
    const form=editDlg.querySelector('form');
    form.onsubmit=async e=>{e.preventDefault();editDlg.close();await review(id,{state:r.state==='new'?'read':r.state,board_note:form.elements.board_note.value});};
  }
  async function review(id,body){
    const r=(messages?.messages||[]).find(m=>m.id===id);if(!r)return;
    try{status='Saving…';render();await api('/api/team/messages/'+id,{method:'PUT',body:JSON.stringify({state:body.state||r.state,board_note:body.board_note??r.board_note??''})});messages=await api('/api/team/messages');status='Message updated.';error='';window.HBAShell?.refresh?.();}
    catch(e){error=e.message;}
    render();
  }
  async function open(opts={}){
    if(!dlg.open)dlg.showModal();
    loading=true;error='';status='';render();
    try{await load(opts.force);messages=await api('/api/team/messages',{signal:AbortSignal.timeout(20000)});}
    catch(e){team=null;messages=null;error=/sign in/i.test(e.message)?'':e.message;}
    loading=false;render();
  }
  // ---- Message my governor -------------------------------------------------------------------
  async function openMessage(opts={}){
    if(!msgDlg.open)msgDlg.showModal();
    msgDlg.innerHTML='<div class="team-form"><p>Loading…</p></div>';
    try{await load();}catch(e){
      msgDlg.innerHTML=`<form class="team-form" method="dialog"><header><h3 id="governor-message-title">Message my governor</h3><button type="button" id="gm-cancel">Close</button></header><p>${esc(/sign in/i.test(e.message)?'Sign in as an approved resident to message your governor.':e.message)}</p><div class="team-actions"><button type="button" id="gm-signin">Sign in</button></div></form>`;
      msgDlg.querySelector('#gm-cancel').onclick=()=>msgDlg.close();msgDlg.querySelector('#gm-signin').onclick=()=>{msgDlg.close();window.openHBACommunity('overview');};return;
    }
    const mine=(team.my_households||[]).map(h=>governorForAddress(h.address));
    const represented=mine.find(g=>g.represented);
    const defaultPosition=opts.position||represented?.position||'President';
    const positions=team.positions.map(p=>{const o=holder(p);return {p,label:p.replace(/ Street Governor$/,' Avenue Governor')+(o?' · '+o.member_name:' · not entered')};});
    const why=opts.position?'':represented?`Your street governor (${represented.street} Avenue) is selected. You can choose anyone on the team.`:mine.length?'Your street does not elect a street governor, so the President is selected. The Governors at Large also serve you.':'Your account is not linked to a home yet, so the President is selected.';
    msgDlg.innerHTML=`<form class="team-form"><header><h3 id="governor-message-title">Message my governor</h3><button type="button" id="gm-cancel">Cancel</button></header>
      <p>${esc(why)} The message is saved in the private HBA archive and shown to the board in this app. No email or text is sent automatically.</p>
      <label>To<select name="to_position">${positions.map(x=>`<option value="${esc(x.p)}"${x.p===defaultPosition?' selected':''}>${esc(x.label)}</option>`).join('')}</select></label>
      <label>Subject<input name="subject" required maxlength="180" placeholder="For example: drainage at the end of our street"></label>
      <label>Message<textarea name="body" required maxlength="6000" rows="6" placeholder="What would you like your governor to know or raise at the next Board of Governors meeting?"></textarea></label>
      <p id="gm-status" role="status"></p><button type="submit" class="team-primary">Send to the board inbox</button></form>`;
    msgDlg.querySelector('#gm-cancel').onclick=()=>msgDlg.close();
    const form=msgDlg.querySelector('form');
    form.onsubmit=async e=>{
      e.preventDefault();if(!form.reportValidity())return;
      const b=form.querySelector('[type=submit]');b.disabled=true;const st=form.querySelector('#gm-status');st.textContent='Saving…';
      try{
        const d=Object.fromEntries(new FormData(form));
        const r=await api('/api/team/messages',{method:'POST',body:JSON.stringify(d)});
        const o=holder(d.to_position);
        msgDlg.innerHTML=`<div class="team-form"><header><h3 id="governor-message-title">Message saved</h3><button type="button" id="gm-done">Done</button></header>
          <p>Your message to ${esc(o?.member_name||d.to_position)} is in the board inbox. ${esc(r.note||'')}</p>
          ${o?.contact_email?`<p>If it is urgent, you can also email directly: ${mailLink(o.contact_email,'Hamilton Beach: '+d.subject)}${o.contact_phone?' or call '+telLink(o.contact_phone):''}.</p>`:o?.contact_phone?`<p>If it is urgent, you can also call ${telLink(o.contact_phone)}.</p>`:''}
          <div class="team-actions"><button type="button" id="gm-open-team">Open Contact our team</button></div></div>`;
        msgDlg.querySelector('#gm-done').onclick=()=>msgDlg.close();
        msgDlg.querySelector('#gm-open-team').onclick=()=>{msgDlg.close();open({force:false});};
        if(dlg.open){messages=await api('/api/team/messages');render();}
        window.HBAShell?.refresh?.();
      }catch(err){st.textContent=err.message;st.className='team-error';b.disabled=false;}
    };
  }
  // ---- Board: edit office / contact details ---------------------------------------------------
  function editForm(position){
    const o=holder(position);
    editDlg.innerHTML=`<form class="team-form"><header><h3 id="team-edit-title">${esc(position)}</h3><button type="button" id="te-cancel">Cancel</button></header>
      <p>Records who holds the office and how residents may reach them. It does not elect anyone or change app permissions. Leave phone or email blank, or turn off sharing, if the person prefers not to be listed.</p>
      <label>Name<input name="member_name" required maxlength="180" value="${esc(o?.member_name||'')}"></label>
      <label>Phone<input name="contact_phone" maxlength="40" value="${esc(o?.contact_phone||'')}"></label>
      <label>Email<input name="contact_email" type="email" maxlength="254" value="${esc(o?.contact_email||'')}"></label>
      <label>Winter address (optional)<input name="winter_address" maxlength="300" value="${esc(o?.winter_address||'')}"></label>
      <label class="team-check"><input type="checkbox" name="share_contact"${o?.share_contact===false?'':' checked'}> Show phone and email to signed-in residents</label>
      <label>Source note<input name="source_note" maxlength="3000" value="${esc(o?.source_note||'')}"></label>
      <p id="te-status" role="status"></p><button type="submit" class="team-primary">Save</button></form>`;
    editDlg.showModal();
    editDlg.querySelector('#te-cancel').onclick=()=>editDlg.close();
    const form=editDlg.querySelector('form');
    form.onsubmit=async e=>{
      e.preventDefault();if(!form.reportValidity())return;
      const st=form.querySelector('#te-status');st.textContent='Saving…';
      try{
        const d=Object.fromEntries(new FormData(form));
        const body={position,member_name:d.member_name,household_uid:o?.household_uid||null,term_start:o?.term_start||null,term_end:o?.term_end||null,source_note:d.source_note||'',member_id:o?.member_id||null,contact_phone:d.contact_phone||'',contact_email:d.contact_email||'',winter_address:d.winter_address||'',share_contact:!!d.share_contact};
        await api('/api/officeholders'+(o?'/'+o.id:''),{method:o?'PUT':'POST',body:JSON.stringify(body)});
        editDlg.close();status='Office details saved.';await load(true);render();
      }catch(err){st.textContent=err.message;st.className='team-error';}
    };
  }
  window.openHBATeam=open;
  window.openGovernorMessage=openMessage;
  window.HBATeam={load,governorForAddress,holder,prettyAddress,streetOf,get data(){return team;}};
  document.addEventListener('hba-account-change',()=>{team=null;messages=null;});
})();
