(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const destinations={event:'Events & photos',budget:'Draft budget line',agenda:'Board agenda backlog',decision:'Governance decisions',work:'Contractor work log',house_history:'Household history (pending)',history:'History notes',governing:'Governing-document notes',permit:'Permit history notes'};
  const shown={event:['series_title','event_date','event_time','rain_date','location','state','planning_only'],budget:['year','category_code','amount'],agenda:[],decision:['meeting_date','decision_type','recorded_outcome'],work:['contractor','location','work_date'],house_history:['address','history_year'],history:['fact_date','fact_year','location'],governing:['fact_date','fact_year','location'],permit:['fact_date','fact_year','location']};
  const labels={series_title:'Event series',event_date:'Main date',event_time:'Start time',rain_date:'Rain backup',planning_only:'Details still pending',category_code:'Budget category',recorded_outcome:'Recorded outcome',fact_date:'Source date',fact_year:'Source year'};
  const dialog=document.createElement('dialog');dialog.id='intake-dialog';dialog.className='intake-dialog';document.body.append(dialog);
  const source=document.createElement('dialog');source.className='intake-source';source.setAttribute('aria-label','Source document page');document.body.append(source);
  let current=null,ctx=null,timer=null,epoch=0,sourceURL=null;
  const stop=()=>{clearTimeout(timer);timer=null;};
  dialog.addEventListener('close',()=>{stop();++epoch;current=null;dialog.innerHTML='';});
  source.addEventListener('close',()=>{if(sourceURL)URL.revokeObjectURL(sourceURL);sourceURL=null;source.innerHTML='';});
  document.addEventListener('hba-account-change',()=>{if(!ctx?.isBoard()){dialog.close();source.close();}});
  const f=(name,label,type='text',required=false)=>`<label>${label}<input name="${name}" type="${type}"${required?' required':''}${type==='number'?' step="any"':''}></label>`;
  const select=(name,label,rows)=>`<label>${label}<select name="${name}">${rows.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>`;
  const messages={queued:'Waiting to read the file',processing:'Reading pages and preparing suggestions',ready:'Ready for board review',needs_attention:'No supported suggestions; inspect the original',failed:'Needs attention: file saved, extraction unfinished'};
  async function open(id,c){
    if(!c.isBoard())return;
    ctx=c;current={document:{id}};++epoch;
    dialog.innerHTML='<p role="status">Loading document review…</p>';
    if(!dialog.open)dialog.showModal();
    await refresh();
  }
  async function refresh(){
    stop();const own=epoch,id=current?.document.id;
    if(!id||!dialog.open)return;
    try{
      const r=await ctx.api('/api/document-intake/'+id);
      if(own!==epoch||!dialog.open)return;
      current=r;render();
      if(['queued','processing'].includes(r.intake?.state))timer=setTimeout(refresh,3500);
    }catch(e){if(own===epoch){dialog.innerHTML=`<button type="button" id="intake-close">Close</button><p role="alert">${esc(e.message)}</p>`;dialog.querySelector('button').onclick=()=>dialog.close();}}
  }
  function render(){
    const {document:d,intake:i,items}=current;
    const pending=items.filter(x=>x.state==='pending');
    dialog.innerHTML=`<div class="intake-shell"><header class="community-section-head"><div><h2>Review this document</h2><p>${esc(d.title)} · Board only</p></div><button type="button" id="intake-close">Close</button></header>
      <p class="community-notice">Upload → read pages → review suggestions → save to the right section. Nothing changes a budget, event or decision until an authorized person saves it. No messages are sent.</p>
      <p role="status"><strong>${esc(messages[i?.state]||'This older upload has not been extracted yet')}</strong></p>
      ${i?.summary?`<p>${esc(i.summary)}</p>`:''}
      <div class="community-actions"><button type="button" data-intake-source="1">Open original page</button><button type="button" id="intake-refresh">Refresh progress</button>${!i||['failed','needs_attention','processing','queued'].includes(i.state)?'<button type="button" id="intake-process">Start / retry extraction</button>':''}</div>
      ${i?`<p>${i.pages?.length||0} pages with extracted text · ${pending.length} suggestions awaiting review. OCR and AI may make mistakes; compare every suggested fact with the source.</p>`:''}
      ${(i?.limitations||[]).length?`<details open><summary>Missing or uncertain information</summary><ul>${i.limitations.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></details>`:''}
      ${items.map(item=>`<article class="community-card intake-item"><div><span class="community-tag">${esc(destinations[item.kind])} · ${esc(item.state)} · ${esc(item.confidence)} confidence (AI estimate)</span><h3>${esc(item.payload.title)}</h3><p>${esc(item.payload.detail||'')}</p><dl>${Object.entries(item.payload).filter(([k,v])=>shown[item.kind]?.includes(k)&&v!==null&&v!=='').map(([k,v])=>`<div><dt>${esc(labels[k]||k.replaceAll('_',' '))}</dt><dd>${esc(typeof v==='boolean'?v?'Yes':'No':v)}</dd></div>`).join('')}</dl>
      <blockquote>${esc(item.evidence_quote)}</blockquote><button type="button" data-intake-source="${item.evidence_page}">Check page ${item.evidence_page}</button>
      ${item.state==='applied'?`<p>Saved to ${esc(destinations[item.kind])}. Reviewer and source are recorded.</p>`:''}</div>
      ${item.state==='pending'?`<div class="community-actions"><button type="button" data-intake-edit="${item.id}"${item.kind==='budget'&&!ctx.data.can_edit_finance?' disabled':''}>Review & save</button><button type="button" data-intake-dismiss="${item.id}">Dismiss suggestion</button>${item.kind==='budget'&&!ctx.data.can_edit_finance?'<p>The Treasurer or administrator must save financial suggestions.</p>':''}</div>`:''}</article>`).join('')}
      ${i?.pages?.length?`<details><summary>Read extracted text with page numbers</summary>${i.pages.map(p=>`<section><h3>Page ${p.page} · ${esc(p.method)}</h3><p class="community-prewrap">${esc(p.text)}</p></section>`).join('')}</details>`:''}
      <p class="community-footnote">Files and suggestions remain private to the board by default. Saving a suggested event makes those reviewed details member-visible; household memories remain pending. Historical/permit/governing notes stay in the board archive, not on the public map. No check, dues payment, adoption, legal conclusion or live permit status is created automatically.</p></div>`;
    dialog.querySelector('#intake-close').onclick=()=>dialog.close();
    dialog.querySelector('#intake-refresh').onclick=refresh;
    const process=dialog.querySelector('#intake-process');
    if(process)process.onclick=async()=>{process.disabled=true;try{await ctx.api('/api/document-intake/'+d.id+'/process',{method:'POST'});await refresh();}catch(e){alert(e.message);process.disabled=false;}};
    dialog.querySelectorAll('[data-intake-source]').forEach(b=>b.onclick=()=>openSource(+b.dataset.intakeSource));
    dialog.querySelectorAll('[data-intake-edit]').forEach(b=>b.onclick=()=>review(items.find(i=>i.id===b.dataset.intakeEdit)));
    dialog.querySelectorAll('[data-intake-dismiss]').forEach(b=>b.onclick=async()=>{
      b.disabled=true;try{await ctx.mutate('/api/document-suggestions/'+b.dataset.intakeDismiss+'/review',{method:'POST',body:JSON.stringify({action:'dismiss'})},'Suggestion dismissed; original document retained.');await refresh();}catch{b.disabled=false;}
    });
  }
  async function openSource(page){
    try{
      const own=epoch,id=current?.document.id;
      if(!id||!ctx.isBoard()||!dialog.open)return;
      const blob=await ctx.api('/api/files/document/'+id,{binary:true});
      if(own!==epoch||!dialog.open||!ctx.isBoard())return;
      if(sourceURL)URL.revokeObjectURL(sourceURL);
      sourceURL=URL.createObjectURL(blob);
      source.innerHTML=`<button type="button">Close source</button> <a href="${sourceURL}" download="HBA-source.pdf">Download source PDF</a><p>Source PDF, page ${page}. For Word/Excel/text uploads this is the viewing conversion; the uploaded original is retained. If the preview is blank on your phone, download the PDF.</p><iframe title="Document source page ${page}" src="${sourceURL}#page=${page}"></iframe>`;
      source.querySelector('button').onclick=()=>source.close();source.showModal();
    }catch(e){alert(e.message);}
  }
  function review(item){
    const p={...item.payload};let fields=f('title','Title','text',true);
    if(item.kind==='budget'){
      fields+=f('year','Budget year','number',true)+select('category_code','Budget category',current.categories.map(c=>[c.code,c.label+' ('+c.direction+')']))+f('amount','Planned amount for this category and year','number',true);
      fields+='<p>Saved as a draft, never an adopted budget or a check. An existing line will not be overwritten. Older budgets outside 2020–2100 can remain in History notes.</p>';
    }else if(item.kind==='event'){
      fields+=select('series_id','Event series',[['','Select the matching series'],...ctx.data.series.map(s=>[s.id,s.title])])+f('event_date','Documented event date','date',true)+f('event_time','Start time, if documented','time')+f('rain_date','Rain date, if documented','date')+f('location','Location');
      fields+='<p>Choose only a matching event series. If it is missing, cancel, add the series in Calendar, then return here. A cleaning date must not be assigned to Spaghetti Supper.</p>';
      fields+=select('state','What does the document establish?',[['scheduled','Scheduled / planned'],['held','Actually held'],['cancelled','Cancelled']]);
      fields+='<label><input type="checkbox" name="details_confirmed"> Source confirms the event details (not just an annual date calculation)</label>';
      p.series_id=ctx.data.series.find(s=>s.title.toLowerCase()===(p.series_title||'').toLowerCase())?.id||'';
    }else if(item.kind==='decision'){
      fields+=f('meeting_date','Actual meeting / action date','date',true)+select('decision_type','Decision type',[['board','Board'],['capital','Capital'],['dues','Dues'],['amendment','Amendment'],['emergency','Emergency']])+select('recorded_outcome','Recorded outcome',[['proposed','Proposed'],['approved','Approved in the source'],['rejected','Rejected'],['deferred','Deferred']]);
      fields+='<p>This records what the document says, not independent certification that a vote was valid.</p>';
    }else if(item.kind==='work'){
      fields+=f('contractor','Contractor')+f('location','Work location')+f('work_date','Documented work date','date');
      fields+='<p>Saved as planned work, not completed or board-accepted work.</p>';
    }else if(item.kind==='house_history'){
      fields+=select('household_uid','Exact household',[['','Select a verified address'],...ctx.homes.properties.map(h=>[h.uid,h.address])])+f('history_year','Historical year','number');
      p.household_uid=ctx.homes.properties.find(h=>h.address.toLowerCase()===String(p.address||'').toLowerCase())?.uid||'';
    }else if(['history','governing','permit'].includes(item.kind)){
      fields+=f('fact_date','Exact date, if documented','date')+f('fact_year','Year, if documented','number')+f('location','Location / parcel scope');
      fields+='<p>Saved as a board-only source note in Documents. No title, membership boundary, permit validity or map geometry will be inferred.</p>';
    }else fields+='<p>Saved to the board-only, unassigned agenda backlog. Assign a meeting in Board meetings.</p>';
    fields+='<label>Details / exact scope<textarea name="detail" rows="5" required maxlength="10000"></textarea></label>';
    fields+=`<p>Evidence: page ${item.evidence_page}</p><blockquote>${esc(item.evidence_quote)}</blockquote>`;
    if(['event','house_history'].includes(item.kind))fields+='<label><input name="share_confirmed" type="checkbox" required> I checked for sensitive information. These reviewed details are suitable for the member archive.</label>';
    fields+='<label><input name="checked_source" type="checkbox" required> I checked the source page, date, scope and destination.</label>';
    ctx.formDialog('Save to '+destinations[item.kind],fields,async fd=>{
      const body=Object.fromEntries(fd);delete body.checked_source;
      const share=fd.has('share_confirmed');delete body.share_confirmed;
      if(item.kind==='event'){body.planning_only=!fd.has('details_confirmed');delete body.details_confirmed;}
      for(const key of ['event_time','rain_date','work_date','history_year','fact_date','fact_year'])if(body[key]==='')body[key]=null;
      await ctx.mutate('/api/document-suggestions/'+item.id+'/review',{method:'POST',body:JSON.stringify({action:'apply',payload:body,share_confirmed:share})},'Reviewed information saved with its source. No notifications sent.');
      await refresh();
    },p,'Save reviewed information');
  }
  window.HBADocumentIntake={open,visibility:(d,c)=>{
    c.formDialog(d.audience==='board'?'Share this file with members?':'Restrict this file to the board?',
      d.audience==='board'?'<p>Review the entire original and viewing PDF for bank details, household dues, contract prices and personal information. Redact and upload a replacement if needed. Sharing affects the full file, not just its extracted notes.</p><label><input name="privacy" type="checkbox" required> I have checked and redacted the file and approve member access.</label>':'<p>This restricts the source file, but does not retract facts already copied into events or other sections. Review those separately.</p>',
      fd=>c.mutate('/api/documents/'+d.id+'/visibility',{method:'PUT',body:JSON.stringify({audience:d.audience==='board'?'members':'board',reviewed_for_privacy:fd.has('privacy')})},'Document visibility updated.'));
  }};
})();
