(() => {
  'use strict';
  // Meeting minutes: the linked Secretary (or administrator) writes a draft, the board approves it at a later
  // meeting, and approved minutes become readable to every approved resident. Drafts are visible to the board.
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let year='',selected='';
  const longDate=s=>s?new Date(s+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}):'Date not supplied';
  const clock=t=>{if(!t)return '';const [h,mi]=String(t).split(':').map(Number);return Number.isInteger(h)?new Date(2000,0,1,h,mi||0).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'';};
  const paragraphs=t=>String(t||'').trim().split(/\n{2,}/).map(p=>`<p>${esc(p).replace(/\n/g,'<br>')}</p>`).join('');
  const bullets=t=>{const lines=String(t||'').split('\n').map(l=>l.replace(/^\s*[-*•]\s*/,'').trim()).filter(Boolean);return lines.length?`<ul>${lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`:'';};
  function minutesFor(c,meetingId,dateKey){return (c.data.minutes||[]).find(m=>(meetingId&&m.meeting_id===meetingId)||(dateKey&&m.meeting_date===dateKey));}
  function render(c){
    const all=c.data.minutes||[],edit=!!c.data.can_edit_minutes,board=c.isBoard();
    const years=[...new Set(all.map(m=>m.meeting_date.slice(0,4)))].sort().reverse();
    const rows=all.filter(m=>!year||m.meeting_date.startsWith(year));
    if(!rows.some(m=>m.id===selected))selected=rows[0]?.id||'';
    const m=rows.find(r=>r.id===selected);
    const unminuted=edit?(c.data.meetings||[]).filter(mt=>mt.state!=='cancelled'&&mt.meeting_date<=new Date().toLocaleDateString('en-CA')&&!all.some(x=>x.meeting_id===mt.id)).sort((a,b)=>b.meeting_date.localeCompare(a.meeting_date)).slice(0,6):[];
    return `<div class="community-section-head"><div><h3>Meeting minutes</h3><p>The official record of what the board discussed and decided. ${edit?'You can write drafts, attach a scanned PDF and mark minutes approved once the board votes to accept them.':board?'Board accounts can read drafts under review; residents see approved minutes only.':'Approved minutes are shared with all approved residents. Drafts under board review are not shown.'}</p></div><div class="community-actions"><button type="button" id="minutes-back-meetings">Meetings & agendas</button>${edit?'<button type="button" id="minutes-create">Write new minutes</button>':''}</div></div>
      ${edit&&unminuted.length?`<p class="community-notice">Recorded meetings without minutes yet: ${unminuted.map(mt=>`<button type="button" class="minutes-link" data-minutes-from="${mt.id}">${esc(mt.title)} · ${esc(new Date(mt.meeting_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))}</button>`).join(' ')}</p>`:''}
      <div class="community-filters"><label>Year<select id="minutes-year"><option value="">All years</option>${years.map(y=>`<option value="${y}"${year===y?' selected':''}>${y}</option>`).join('')}</select></label><label>Meeting<select id="minutes-pick">${rows.length?rows.map(r=>`<option value="${r.id}"${selected===r.id?' selected':''}>${esc(r.meeting_date+' · '+r.title+(r.state==='draft'?' · Draft':''))}</option>`).join(''):'<option value="">No minutes yet</option>'}</select></label></div>
      ${m?`<article class="community-story minutes-reader"><span class="community-tag">${m.state==='approved'?`Approved by the board${m.approved_on?' on '+esc(longDate(m.approved_on)):''}`:'Draft · awaiting board approval'}</span>
        <h3>${esc(m.title)}</h3>
        <p class="minutes-meta">${esc(longDate(m.meeting_date))}${m.meeting_time?' · '+esc(clock(m.meeting_time)):''}${m.location?' · '+esc(m.location):''}</p>
        ${(m.called_to_order||m.adjourned||m.attendees)?`<dl class="minutes-facts">${m.called_to_order?`<div><dt>Called to order</dt><dd>${esc(clock(m.called_to_order))}</dd></div>`:''}${m.adjourned?`<div><dt>Adjourned</dt><dd>${esc(clock(m.adjourned))}</dd></div>`:''}${m.attendees?`<div class="minutes-wide"><dt>Present</dt><dd>${esc(m.attendees)}</dd></div>`:''}</dl>`:''}
        ${m.body.trim()?`<section class="minutes-section"><h4>Minutes</h4>${paragraphs(m.body)}</section>`:'<p class="community-muted">No typed minutes; see the attached PDF.</p>'}
        ${m.motions.trim()?`<section class="minutes-section"><h4>Motions and votes</h4>${bullets(m.motions)}</section>`:''}
        ${m.action_items.trim()?`<section class="minutes-section"><h4>Action items</h4>${bullets(m.action_items)}</section>`:''}
        ${m.approved_note?`<p class="community-muted">Approval note: ${esc(m.approved_note)}</p>`:''}
        <div class="community-actions">${m.file_path?`<button type="button" data-file-kind="minutes" data-file-id="${m.id}">Open scanned PDF</button>`:''}
          ${edit?`${m.state==='draft'?`<button type="button" id="minutes-edit">Edit draft</button><button type="button" id="minutes-file">${m.file_path?'Replace':'Attach'} PDF</button><button type="button" id="minutes-approve">Mark approved</button>`:'<button type="button" id="minutes-unapprove">Return to draft</button>'}${c.deleteButton('minutes',m.id)}`:''}</div>
        <small>Written ${esc(m.created_at.slice(0,10))}, last changed ${esc(m.updated_at.slice(0,10))}.</small></article>`
      :`<section class="community-empty"><h3>No minutes on file${year?' for '+esc(year):''}</h3><p>${edit?'Use "Write new minutes" after a meeting, or start from a recorded meeting above.':'Minutes appear here once the Secretary records them and the board approves them.'}</p></section>`}`;
  }
  function bind(c,root){
    const click=(id,fn)=>{const b=root.querySelector('#'+id);if(b)b.onclick=fn;};
    const y=root.querySelector('#minutes-year');if(y)y.onchange=()=>{year=y.value;selected='';c.render();};
    const p=root.querySelector('#minutes-pick');if(p)p.onchange=()=>{selected=p.value;c.render();};
    const current=(c.data.minutes||[]).find(m=>m.id===selected);
    const text=(name,label,value,rows,max,hint)=>`<label>${label}<textarea name="${name}" rows="${rows}" maxlength="${max}" placeholder="${esc(hint||'')}">${esc(value||'')}</textarea></label>`;
    function editMinutes(m,from){
      const meetings=(c.data.meetings||[]).filter(mt=>mt.state!=='cancelled').sort((a,b)=>b.meeting_date.localeCompare(a.meeting_date));
      const link=m?.meeting_id||from?.id||'';
      c.formDialog(m?'Edit minutes draft':'Write meeting minutes',`
        <label>Recorded meeting (optional)<select name="meeting_id"><option value="">Not linked to a calendar entry</option>${meetings.map(mt=>`<option value="${mt.id}"${link===mt.id?' selected':''}>${esc(mt.meeting_date+' · '+mt.title)}</option>`).join('')}</select></label>
        <label>Title<input name="title" required maxlength="180" value="${esc(m?.title||from?.title||'HBA Board of Governors Meeting')}"></label>
        <div class="community-filters"><label>Meeting date<input name="meeting_date" type="date" required value="${esc(m?.meeting_date||from?.meeting_date||'')}"></label><label>Start time<input name="meeting_time" type="time" value="${esc((m?.meeting_time||from?.meeting_time||'').slice(0,5))}"></label></div>
        <label>Location<input name="location" maxlength="180" value="${esc(m?.location||from?.location||'')}"></label>
        <div class="community-filters"><label>Called to order<input name="called_to_order" type="time" value="${esc((m?.called_to_order||'').slice(0,5))}"></label><label>Adjourned<input name="adjourned" type="time" value="${esc((m?.adjourned||'').slice(0,5))}"></label></div>
        ${text('attendees','Present (officers, governors, guests)',m?.attendees,3,4000,'Names and roles, for example: Sue Healy (Glen Ave governor), ...')}
        ${text('body','Minutes',m?.body,14,60000,'Call to order, approval of prior minutes, treasurer report, old business, new business, adjournment. Leave a blank line between topics.')}
        ${text('motions','Motions and votes (one per line)',m?.motions,5,20000,'Motion to approve the September minutes, moved by ..., seconded by ..., passed unanimously.')}
        ${text('action_items','Action items (one per line)',m?.action_items,4,20000,'Who will do what, by when.')}
        <p>Saving stores a private draft that the board can read. Residents see minutes only after they are marked approved. Do not include private household finances or dues statuses.</p>`,
        async fd=>{const saved=await c.mutate('/api/minutes'+(m?'/'+m.id:''),{method:m?'PUT':'POST',body:JSON.stringify(Object.fromEntries(fd))},'Minutes draft saved. Not yet visible to residents.');selected=saved.id;year='';c.render();},{},'Save draft');
    }
    click('minutes-back-meetings',()=>window.openHBACommunity('meetings'));
    click('minutes-create',()=>editMinutes());
    root.querySelectorAll('[data-minutes-from]').forEach(b=>b.onclick=()=>editMinutes(null,(c.data.meetings||[]).find(mt=>mt.id===b.dataset.minutesFrom)));
    click('minutes-edit',()=>editMinutes(current));
    click('minutes-file',()=>c.formDialog('Attach scanned minutes PDF','<p>The PDF is stored privately with the minutes. Replaced files are retained for administrator-only deletion.</p><label>PDF, up to 8 MB<input type="file" name="file" accept=".pdf,application/pdf" required></label>',fd=>c.mutate('/api/minutes/'+current.id+'/file',{method:'POST',body:fd},'PDF attached to the minutes.'),{},'Attach PDF'));
    click('minutes-approve',()=>c.formDialog('Mark minutes approved',`<p><strong>${esc(current.title)}</strong>, ${esc(longDate(current.meeting_date))}.</p><p>Approval is normally voted at the next board meeting. Once approved, these minutes become readable to every approved resident and cannot be edited unless returned to draft.</p><label>Date the board approved them<input name="approved_on" type="date" required></label><label>Approval note (optional)<input name="approved_note" maxlength="400" placeholder="Approved as written / approved with corrections to ..."></label><label class="communications-check"><input type="checkbox" required> I confirm the board voted to approve these minutes.</label>`,fd=>c.mutate('/api/minutes/'+current.id+'/state',{method:'PUT',body:JSON.stringify({state:'approved',approved_on:fd.get('approved_on'),approved_note:fd.get('approved_note')||''})},'Minutes marked approved and shared with residents.'),{},'Mark approved'));
    click('minutes-unapprove',()=>c.formDialog('Return minutes to draft','<p>This hides the minutes from residents while they are corrected. The approval date is cleared; nothing is deleted.</p>',()=>c.mutate('/api/minutes/'+current.id+'/state',{method:'PUT',body:JSON.stringify({state:'draft'})},'Minutes returned to draft.'),{},'Return to draft'));
  }
  window.HBAMinutes={render,bind,minutesFor,open:id=>{selected=id;year='';}};
})();
