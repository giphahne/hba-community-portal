(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={draft:'Private draft',published:'Open for volunteers',closed:'Signup closed',complete:'Completed'};
  let category='',lastFocus,publicData=null,scrollToList=false;
  const TZ='America/New_York';
  const todayYmd=()=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const daysUntil=ymd=>Math.round((new Date(ymd+'T12:00:00').getTime()-new Date(todayYmd()+'T12:00:00').getTime())/86400000);
  // Illustrated SVG art for the two category buttons (linen-postcard feel, nautical palette). Decorative only.
  const ART={
    event:`<svg class="vol-art" viewBox="0 0 200 120" aria-hidden="true" focusable="false"><defs><linearGradient id="vol-sky-e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#13315C"/><stop offset="1" stop-color="#0B2545"/></linearGradient></defs><rect width="200" height="120" fill="url(#vol-sky-e)"/><g class="vol-waves" fill="none" stroke="#8FC1B5" stroke-width="2" stroke-linecap="round"><path d="M0 104q10-5 20 0t20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0"/><path d="M0 112q10-5 20 0t20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0" opacity=".6"/></g><path d="M40 96 60 48h80l20 48z" fill="#F4F1E8"/><path d="M40 96h120" stroke="#D9C49A" stroke-width="2"/><path d="M40 96q10-6 20 0t20 0 20 0 20 0 20 0 20 0" fill="none" stroke="#D9C49A" stroke-width="2"/><path d="M60 48h80M48 96V60M152 96V60M100 48V96" stroke="#C9A227" stroke-width="2.5" stroke-linecap="round"/><path d="M60 62h80v4H60z" fill="#C9A227" opacity=".8"/><path d="M10 26q90 18 180 0" fill="none" stroke="#D9C49A" stroke-width="2"/><g class="vol-flags"><path d="M22 28l14 1v16l-14-1z" fill="#B23A48"/><path d="M48 32h14v16H48z" fill="#F4F1E8"/><path d="M48 32h7v16h-7z" fill="#8FC1B5"/><path d="M74 34l14-1v16l-14 1z" fill="#C9A227"/><path d="M100 36h14v15h-14z" fill="#B23A48"/><path d="M100 36h14v7h-14z" fill="#F4F1E8"/><path d="M126 34l14 1v16l-14-1z" fill="#8FC1B5"/><path d="M152 32h14v16h-14z" fill="#F4F1E8"/><path d="M159 32h7v16h-7z" fill="#B23A48"/></g><g fill="none" stroke="#C9A227" stroke-width="2.2" stroke-linecap="round" transform="translate(178 86) scale(.9)"><circle cx="0" cy="-10" r="3"/><path d="M0-7v20M-8 3a8 8 0 0 0 16 0M-5 0h10"/></g></svg>`,
    maintenance:`<svg class="vol-art" viewBox="0 0 200 120" aria-hidden="true" focusable="false"><defs><linearGradient id="vol-sky-m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#13315C"/><stop offset="1" stop-color="#0B2545"/></linearGradient></defs><rect width="200" height="120" fill="url(#vol-sky-m)"/><path d="M0 120V92q50-14 100-4t100-6v38z" fill="#D9C49A"/><path d="M0 120V102q50-10 100-2t100-4v24z" fill="#C9B07E"/><g stroke="#F4F1E8" stroke-width="4" stroke-linecap="round"><path d="M30 92V62M44 90V58M58 88V56M72 86V54M86 85V53M100 84V52M114 84V52M128 85V53M142 86V54M156 88V56M170 90V58"/></g><path d="M24 66q75-14 152-2M24 82q75-14 152-2" fill="none" stroke="#D9C49A" stroke-width="2"/><g stroke="#C9A227" stroke-width="4" stroke-linecap="round" fill="none"><path d="M64 112L132 44"/><path d="M136 112L68 44"/></g><path d="M126 36l12 12-6 6-12-12z" fill="#8FC1B5" stroke="#C9A227" stroke-width="2"/><path d="M58 50l4-6 14 2-2 6-4 6-6-2-2 6-6-2 2-6z" fill="#8FC1B5" stroke="#C9A227" stroke-width="1.5"/><g transform="translate(176 24)" fill="none" stroke="#C9A227" stroke-width="1.6"><circle r="12"/><path d="M0-12l2.6 9.4L12 0l-9.4 2.6L0 12l-2.6-9.4L-12 0l9.4-2.6z" fill="#C9A227" fill-opacity=".4"/></g><rect x="3" y="3" width="194" height="114" rx="8" fill="none" stroke="#D9C49A" stroke-width="2" stroke-dasharray="6 5" opacity=".8"/></svg>`
  };
  function stats(c,cat){
    const tasks=(c.data.volunteer_tasks||[]).filter(t=>t.category===cat),counts=c.data.volunteer_counts||[];
    const cnt=t=>Number(counts.find(n=>n.task_id===t.id)?.signed_up||0);
    const open=tasks.filter(t=>t.state==='published');
    const need=open.reduce((s,t)=>s+Number(t.capacity||0),0),filled=open.reduce((s,t)=>s+Math.min(cnt(t),Number(t.capacity||0)),0);
    const td=todayYmd(),dated=open.filter(t=>t.task_date&&t.task_date>=td).sort((a,b)=>a.task_date.localeCompare(b.task_date));
    const next=dated[0]||open.find(t=>!t.task_date)||null;
    const year=td.slice(0,4),season=tasks.filter(t=>String(t.task_date||t.created_at||t.updated_at||'').slice(0,4)===year);
    const signups=season.reduce((s,t)=>s+cnt(t),0);
    const soon=!!(next?.task_date&&daysUntil(next.task_date)<=14&&filled<need);
    return {open:open.length,need,filled,next,signups,soon,year,pct:need?Math.round(100*filled/need):0};
  }
  const catMeta={event:{title:'Event volunteers',sub:'Spaghetti Supper, clean-up day, parade and other gatherings'},maintenance:{title:'Maintenance volunteers',sub:'Beach clean-up, snow fence, jetty, road and drain items'}};
  function board(c){
    return `<div class="vol-board" role="group" aria-label="Volunteer categories">${['event','maintenance'].map(cat=>{const s=stats(c,cat),m=catMeta[cat];
      return `<div class="vol-col"><button type="button" class="vol-btn vol-btn-${cat}" data-vol-cat="${cat}" aria-pressed="${category===cat}" aria-describedby="vol-stats-${cat}">${ART[cat]}<span class="vol-btn-text"><strong>${m.title}</strong><span>${m.sub}</span></span></button>
      <dl class="vol-stats" id="vol-stats-${cat}" aria-label="${m.title} live figures">${s.open?`<div><dt>Open tasks</dt><dd>${s.open}</dd></div><div class="vol-wide"><dt>Volunteer spots</dt><dd>${s.filled} of ${s.need} filled${s.soon?` <span class="vol-urgent">${s.need-s.filled} still needed soon</span>`:''}</dd><div class="vol-bar${s.soon?' vol-bar-urgent':''}" role="progressbar" aria-valuemin="0" aria-valuemax="${s.need}" aria-valuenow="${s.filled}" aria-label="${m.title}: spots filled"><span style="width:${s.pct}%"></span></div></div><div class="vol-wide"><dt>Next task</dt><dd>${esc(s.next.title)}<br><small>${esc(date(s.next))}</small></dd></div>`:`<div class="vol-wide"><dt>Open tasks</dt><dd>No open tasks yet</dd></div>`}<div><dt>Signups in ${s.year}</dt><dd>${s.signups}</dd></div></dl></div>`;}).join('')}</div>
      <p class="vol-filter" id="vol-list">${category?`Showing ${catMeta[category].title.toLowerCase()} tasks. <button type="button" class="vol-link" data-vol-cat="">Show all tasks</button>`:'Showing all tasks. Choose a category above to see just those tasks.'}</p>`;
  }
  function bindBoard(root,rerender){
    root.querySelectorAll('[data-vol-cat]').forEach(b=>b.onclick=()=>{category=b.dataset.volCat;scrollToList=true;rerender();});
    if(scrollToList){scrollToList=false;const el=root.querySelector('#vol-list');if(el)requestAnimationFrame(()=>el.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));}
  }
  const dialog=document.createElement('dialog');dialog.id='volunteer-public';dialog.setAttribute('aria-labelledby','volunteer-public-title');document.body.append(dialog);
  const date=t=>t.task_date?new Date(t.task_date+'T12:00:00').toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})+(t.task_time?' · '+t.task_time.slice(0,5)+' Eastern':''):'Date to be arranged';
  function cards(c,publicMode=false){
    const rows=(c.data.volunteer_tasks||[]).filter(t=>!category||t.category===category);
    return rows.map(t=>{
      const count=c.data.volunteer_counts?.find(n=>n.task_id===t.id)?.signed_up||0;
      const own=c.data.volunteer_signups?.find(s=>s.task_id===t.id&&s.member_id===c.member?.id);
      const members=c.data.members||[];
      const roster=(c.data.volunteer_signups||[]).filter(s=>s.task_id===t.id);
      return `<article class="community-story volunteer-task"><span class="community-tag">${esc(labels[t.state])} · ${t.category==='event'?'Event help':'Maintenance help'}</span><h3>${esc(t.title)}</h3>${t.photo_path?`<img class="volunteer-task-photo" data-volunteer-photo="${t.id}" alt="Board-provided photo for ${esc(t.title)}" loading="lazy">`:''}<p class="community-prewrap">${esc(t.description)}</p><p><strong>When:</strong> ${esc(date(t))}<br><strong>Where:</strong> ${esc(t.location||'To be arranged')}<br><strong>Volunteer places:</strong> ${count} of ${t.capacity} filled${count>=t.capacity?' · Currently full':''}</p>
      ${own?.state==='signed_up'?'<p class="community-notice">You are signed up. Contact the board about changed plans, or withdraw below.</p>':''}
      <div class="community-actions">${publicMode?'<button type="button" data-volunteer-signin>Sign in to volunteer</button>':t.state==='published'&&own?.state!=='signed_up'?`<button type="button" data-volunteer-join="${t.id}"${count>=t.capacity?' disabled':''}>Sign up to help</button>`:''}${!publicMode&&own?.state==='signed_up'?`<button type="button" data-volunteer-withdraw="${t.id}">Withdraw signup</button>`:''}
      ${!publicMode&&c.isBoard()?`${t.state==='draft'?`<button type="button" data-volunteer-edit="${t.id}">Edit task</button><button type="button" data-volunteer-photo-upload="${t.id}">${t.photo_path?'Replace':'Add'} task photo</button><button type="button" data-volunteer-state="${t.id}" data-state="published">Review & post publicly</button>`:`<button type="button" data-volunteer-state="${t.id}" data-state="draft">Return to draft</button>${t.state==='published'?`<button type="button" data-volunteer-email="${t.id}">Prepare email request</button><button type="button" data-volunteer-state="${t.id}" data-state="closed">Close signup</button>`:''}${t.state!=='complete'?`<button type="button" data-volunteer-state="${t.id}" data-state="complete">Mark completed</button>`:''}`}${c.deleteButton('volunteer-task',t.id)}`:''}</div>
      ${!publicMode&&c.isBoard()?`<details><summary>Board-only signup sheet (${roster.filter(s=>s.state==='signed_up').length} active)</summary>${roster.map(s=>{const m=members.find(m=>m.id===s.member_id);return `<div class="community-card"><div><h4>${esc(m?.display_name||'Approved member')}</h4><p>${esc(m?.email||'Contact not available')} · ${s.state==='signed_up'?'Signed up':'Withdrawn'}</p><p class="community-prewrap">${esc(s.note)}</p><small>Updated ${esc(s.updated_at.slice(0,10))}</small></div></div>`;}).join('')||'<p>No volunteer signups yet.</p>'}<p>Volunteer names, contact details and notes are not on the public board.</p></details>`:''}</article>`;
    }).join('')||'<section class="community-empty"><h3>No volunteer requests posted</h3><p>The board can draft an event or maintenance task, add its photo and publish it after review. No old newsletter event is treated as a current call for help.</p></section>';
  }
  function render(c){
    const opted=c.data.volunteer_email_preferences?.[0]?.opted_in;
    return `<div class="community-section-head"><div><h3>Volunteer board & signup sheets</h3><p>Help with association events or board-requested maintenance. Public task descriptions are separate from the private signup sheets.</p></div>${c.isBoard()?'<button type="button" id="volunteer-create">Request volunteers</button>':''}</div>
      <p class="community-notice">Only volunteer for work you can perform safely. A signup is not permission to enter private property, perform regulated shoreline work or undertake hazardous tasks. The board must arrange supervision and required permissions.</p>
      <section class="community-story"><h3>Volunteer-request emails</h3><p>${opted?'You have opted in to volunteer-request emails.':'You have not opted in to volunteer-request emails.'} Email requests are currently prepared as reviewable drafts, not sent automatically.</p><button type="button" id="volunteer-email-preference">${opted?'Opt out of volunteer emails':'Opt in to volunteer emails'}</button></section>
      ${board(c)}${cards(c)}`;
  }
  async function photos(root,api,publicMode=false){
    root.querySelectorAll('[data-volunteer-photo]').forEach(async img=>{
      try{
        const blob=publicMode?await (async()=>{const r=await fetch(publicBase()+'/api/volunteers/'+img.dataset.volunteerPhoto+'/photo',{cache:'no-store'});if(!r.ok)throw Error();return r.blob();})():await api('/api/volunteers/'+img.dataset.volunteerPhoto+'/photo',{binary:true});
        if(!img.isConnected)return;
        const u=URL.createObjectURL(blob);img.src=u;img.onload=()=>URL.revokeObjectURL(u);img.onerror=()=>{URL.revokeObjectURL(u);img.replaceWith(document.createTextNode('Task photo unavailable.'));};
      }catch{if(img.isConnected)img.replaceWith(document.createTextNode('Task photo unavailable.'));}
    });
  }
  function bind(c,root){
    const each=(sel,fn)=>root.querySelectorAll(sel).forEach(b=>b.onclick=()=>fn(b));
    const current=id=>c.data.volunteer_tasks.find(t=>t.id===id);
    function edit(t){
      const input=(name,label,type='text',value='',required=false)=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}"${required?' required':''}${type==='text'?' maxlength="180"':''}></label>`;
      c.formDialog(t?'Edit volunteer task':'Request volunteers',input('title','Task title','text',t?.title||'',true)+`<label>Category<select name="category"><option value="event">Event help</option><option value="maintenance"${t?.category==='maintenance'?' selected':''}>Maintenance help</option></select></label><label>Description, skills, tools & supervision<textarea name="description" required maxlength="12000" rows="7">${esc(t?.description||'')}</textarea></label>`+input('location','Meeting / task location','text',t?.location||'')+input('task_date','Date, if known','date',t?.task_date||'')+input('task_time','Local Eastern time, if known','time',t?.task_time?.slice(0,5)||'')+`<label>Volunteer places<input name="capacity" type="number" min="1" max="500" value="${t?.capacity||10}" required></label><p>Saved privately first. Add a suitable task photo, then review the complete public post. Do not upload contact sheets, private household details or cleaning costs as a public task/photo.</p>`,fd=>{
        const p=Object.fromEntries(fd);p.capacity=Number(p.capacity);p.task_date||=null;p.task_time||=null;
        return c.mutate('/api/volunteers'+(t?'/'+t.id:''),{method:t?'PUT':'POST',body:JSON.stringify(p)},'Volunteer task saved as a private draft.');
      },{},'Save private draft');
    }
    each('#volunteer-create',()=>edit());
    each('[data-volunteer-edit]',b=>edit(current(b.dataset.volunteerEdit)));
    each('[data-volunteer-photo-upload]',b=>c.formDialog('Add a public task photo','<p>The photo will be public when this task is published. Upload only a relevant photo you have permission to share; exclude personal contact details.</p><label>JPEG, PNG or WebP, up to 8 MB<input name="file" type="file" accept="image/jpeg,image/png,image/webp" required></label><label class="communications-check"><input type="checkbox" required> I have permission to publish this photo.</label>',fd=>c.mutate('/api/volunteers/'+b.dataset.volunteerPhotoUpload+'/photo',{method:'POST',body:fd},'Photo added to the task draft; location metadata removed.'),{},'Attach task photo'));
    each('[data-volunteer-state]',b=>{
      const t=current(b.dataset.volunteerState),publishing=b.dataset.state==='published';
      c.formDialog(publishing?'Review public volunteer request':'Update task status',`<p><strong>Audience:</strong> ${publishing?'anyone who can access the app’s public volunteer board':'this changes the task’s public availability'}.</p><h4>${esc(t.title)}</h4><p>${esc(date(t))} · ${esc(t.location)}</p><p class="community-prewrap">${esc(t.description)}</p><p>${t.capacity} volunteer places. ${t.photo_path?'The attached task photo will be public. Review it before continuing.':'No task photo attached.'}</p><label class="communications-check"><input type="checkbox" required> I reviewed this task${t.photo_path?' and its photo':''} and approve the ${publishing?'public post':'status change'}.</label>`,()=>c.mutate('/api/volunteers/'+t.id+'/state',{method:'PUT',body:JSON.stringify({state:b.dataset.state})},'Task status updated. No email was sent.'),{},publishing?'Post publicly':'Confirm status');
    });
    each('[data-volunteer-join]',b=>c.formDialog('Sign up to help',`<h4>${esc(current(b.dataset.volunteerJoin).title)}</h4><label>Optional note to the board (private)<textarea name="note" maxlength="1000" rows="4" placeholder="Availability, relevant skills or questions"></textarea></label><label class="communications-check"><input type="checkbox" required> I can help and will follow the board’s safety and access arrangements.</label>`,fd=>c.mutate('/api/volunteers/'+b.dataset.volunteerJoin+'/signup',{method:'PUT',body:JSON.stringify({join:true,note:fd.get('note')||''})},'You are signed up. Your name and note are visible only to you and the board.'),{},'Confirm signup'));
    each('[data-volunteer-withdraw]',b=>c.formDialog('Withdraw from this task','<p>Your place will be released. The board retains the signup history.</p>',()=>c.mutate('/api/volunteers/'+b.dataset.volunteerWithdraw+'/signup',{method:'PUT',body:JSON.stringify({join:false,note:''})},'Signup withdrawn; place released.'),{},'Withdraw signup'));
    each('#volunteer-email-preference',()=>{
      const enabled=!c.data.volunteer_email_preferences?.[0]?.opted_in;
      c.formDialog(enabled?'Opt in to volunteer-request emails':'Opt out of volunteer-request emails',`<p>${enabled?'I agree to receive HBA volunteer requests at my verified account email. These are separate from SMS, are optional and can be stopped here at any time. The app currently prepares email drafts; automatic delivery is not enabled.':'Stop including my account in future volunteer email-draft recipient lists. This does not withdraw existing task signups.'}</p><label class="communications-check"><input type="checkbox" required> Confirm my choice.</label>`,()=>c.mutate('/api/volunteer-email-preferences',{method:'PUT',body:JSON.stringify({opted_in:enabled})},enabled?'Volunteer email opt-in saved.':'Volunteer email opt-out saved.'),{},'Save email preference');
    });
    each('[data-volunteer-email]',async b=>{
      try{
        const p=await c.api('/api/volunteers/'+b.dataset.volunteerEmail+'/email-preview');
        c.formDialog('Review volunteer email blast',`<p><strong>Draft only:</strong> no automatic Gmail sending is enabled. The official HBA sender must be configured separately. Downloading an email draft does not send it.</p><h4>${esc(p.subject)}</h4><p class="community-prewrap">${esc(p.body)}</p><p>Photo: ${p.has_photo?'the task JPEG will be attached':'no photo attached'}</p><details><summary>Review BCC recipients (${p.recipients.length} opted-in approved members)</summary><ul>${p.recipients.map(r=>`<li>${esc(r.name||'Member')} · ${esc(r.email)}</li>`).join('')}</ul></details><p>Recipients must be rechecked before sending outside the app; a downloaded draft will not reflect later opt-outs.</p><label class="communications-check"><input type="checkbox" required> I reviewed the message, photo and recipient list.</label>`,async()=>{
          const blob=await c.api('/api/volunteers/'+b.dataset.volunteerEmail+'/email-draft',{method:'POST',binary:true});
          const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='HBA-volunteer-request.eml';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
        },{},'Download email draft, not send');
      }catch(e){c.status(e.message,true);}
    });
    bindBoard(root,()=>c.render());
    photos(root,c.api);
  }
  function publicBase(){
    const raw=window.__COMMUNITY_API_BASE__||'';
    if(!raw)throw Error('Volunteer service unavailable.');
    return new URL(raw,document.baseURI).href.replace(/\/$/,'');
  }
  async function openPublic(){
    lastFocus=document.activeElement;
    if(!dialog.open)dialog.showModal();
    const shell=body=>`<div class="community-shell"><header class="community-head"><div><p>Hamilton Beach Association · Public task board</p><h2 id="volunteer-public-title">Volunteer opportunities</h2></div><button type="button" id="volunteer-public-close">Back to map</button></header><main class="community-content">${body}</main></div>`;
    dialog.innerHTML=shell('<p role="status">Loading board-posted volunteer tasks…</p>');
    dialog.querySelector('#volunteer-public-close').onclick=()=>dialog.close();
    try{
      const r=await fetch(publicBase()+'/api/volunteers/public',{cache:'no-store'});if(!r.ok)throw Error('Could not load volunteer tasks.');
      publicData=await r.json();
      const pc={data:{volunteer_tasks:publicData.tasks,volunteer_counts:publicData.counts}};
      const paint=()=>{
        dialog.innerHTML=shell('<p>Anyone can read published requests. Approved residents sign in to volunteer; names and contact details stay off this public board.</p>'+board(pc)+cards(pc,true)+'<button type="button" id="volunteer-member-tools">Sign in · My signups & email preferences</button>');
        dialog.querySelector('#volunteer-public-close').onclick=()=>dialog.close();
        dialog.querySelectorAll('[data-volunteer-signin],#volunteer-member-tools').forEach(b=>b.onclick=()=>{dialog.close();window.openHBACommunity('volunteers');});
        bindBoard(dialog,paint);
        photos(dialog,null,true);
      };
      paint();
    }catch(e){dialog.innerHTML=shell(`<p role="status">${esc(e.message)} No signup or task status can be inferred.</p><button type="button" id="volunteer-retry">Retry</button>`);dialog.querySelector('#volunteer-public-close').onclick=()=>dialog.close();dialog.querySelector('#volunteer-retry').onclick=openPublic;}
  }
  dialog.addEventListener('close',()=>lastFocus?.focus?.({preventScroll:true}));
  window.HBAVolunteers={render,bind};
  window.openHBAVolunteers=openPublic;
})();
