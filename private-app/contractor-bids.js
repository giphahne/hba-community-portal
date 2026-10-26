(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let selected='';
  const states={submitted:'Submitted',reviewing:'Under review',clarification:'More information needed',shortlisted:'Shortlisted',selected:'Selected for next steps',declined:'Not selected',withdrawn:'Withdrawn'};
  const tax={included:'Tax included',excluded:'Tax extra',unspecified:'Tax not specified'};
  const money=n=>Number(n).toLocaleString('en-US',{style:'currency',currency:'USD'});
  const input=(n,l,t='text',required=false)=>`<label>${l}<input name="${n}" type="${t}" ${required?'required':''} ${t==='text'?'maxlength="250"':''}></label>`;
  const area=(n,l,required=false)=>`<label>${l}<textarea name="${n}" rows="4" maxlength="12000" ${required?'required':''}></textarea></label>`;
  function render(c){
    const requests=c.data.bid_requests||[],bids=c.data.bids||[];
    if(!requests.some(r=>r.id===selected))selected=requests[0]?.id||'';
    const r=requests.find(r=>r.id===selected),rows=bids.filter(b=>b.request_id===selected);
    const open=r&&r.state==='open'&&(!r.deadline||r.deadline>=new Date().toLocaleDateString('en-CA'));
    return `<div class="community-section-head"><div><h3>Contractor bids</h3><p>${c.isBoard()?'Compare proposals and keep the decision trail in one place.':'Suggest a contractor and send a proposal to the board.'}</p></div>${c.isBoard()?'<button type="button" id="bid-add-request">Create bid request</button>':''}</div>
      <p class="community-notice">Prices, contact details and bid attachments are private. Residents see only their own submissions, never competing bids. External contractors do not receive an app login or public upload link; an approved member can submit on their behalf.</p>
      ${requests.length?`<label class="community-house-picker">Choose a project<select id="bid-request-select">${requests.map(x=>`<option value="${x.id}"${x.id===selected?' selected':''}>${esc(x.title)} · ${esc(x.state)}</option>`).join('')}</select></label>`:'<p>No bid requests have been opened yet. The board can create a request linked to a contractor work project.</p>'}
      ${r?`<article class="community-story"><span class="community-tag">${esc(r.state)} · ${r.deadline?'Due '+esc(r.deadline):'No deadline set'}</span><h4>${esc(r.title)}</h4><p>${esc(r.location||'Location to be confirmed')}</p><p class="community-prewrap">${esc(r.scope)}</p><div class="community-actions">${c.isBoard()||open?'<button type="button" id="bid-submit">Submit contractor proposal</button>':'<p>This request is closed to new resident submissions.</p>'}${c.isBoard()?`<button type="button" id="bid-edit-request">Edit request / close submissions</button>${r.work_id?'<button type="button" id="bid-open-work">Open linked work log</button>':''}${c.deleteButton('bid-request',r.id)}`:''}</div></article>
      <h3>${c.isBoard()?'Proposal comparison':'Your submissions'}</h3><p>${c.isBoard()?'Compare scope, tax treatment, exclusions and dates, not price alone.':'Submitted amounts are preserved. If the quote changes, submit a replacement proposal and explain which one it supersedes.'}</p>
      ${rows.map(b=>`<article class="community-story"><span class="community-tag">${esc(states[b.state])} · Submitted ${esc(b.created_at.slice(0,10))}</span><h4>${esc(b.contractor)}</h4><p><strong>${money(b.amount)}</strong> · ${esc(tax[b.tax_basis])}</p><p>${esc(b.contact||'Contact details not supplied')}</p><details><summary>Scope, exclusions and timing</summary><h5>Included work</h5><p class="community-prewrap">${esc(b.scope)}</p><h5>Exclusions / allowances</h5><p class="community-prewrap">${esc(b.exclusions||'Not specified; clarify before accepting')}</p><p>Timing: ${esc(b.timing||'Not specified')}</p><p>Quote valid until: ${esc(b.valid_until||'Not specified')}</p></details>
      <div class="community-actions">${c.isBoard()?`<button type="button" data-bid-review="${b.id}">Review / record decision</button>`:''}${c.isBoard()||['submitted','clarification'].includes(b.state)?`<button type="button" data-bid-upload="${b.id}">Attach proposal / photo</button>`:''}${c.deleteButton('bid',b.id)}</div>
      ${(c.data.bid_files||[]).filter(f=>f.bid_id===b.id).map(f=>`<p><button type="button" data-bid-file="${f.id}">View attachment: ${esc(f.original_name)}</button> ${esc(f.caption)} ${c.deleteButton('bid-file',f.id)}</p>`).join('')}
      ${c.isBoard()?`<details><summary>Board decision history</summary>${(c.data.bid_reviews||[]).filter(x=>x.bid_id===b.id).map(x=>`<p>${esc(x.created_at.slice(0,10))} · ${esc(states[x.previous_state])} → ${esc(states[x.new_state])}</p><p class="community-prewrap">${esc(x.note)}</p>`).join('')||'<p>No review recorded yet.</p>'}</details>`:''}</article>`).join('')||'<p>No proposals in this view yet.</p>'}`:''}
      <p class="community-footnote">A selected bid is a planning record, not a signed contract, spending approval or payment. Record the actual board authorization and signed agreement separately. Nothing here emails a contractor or posts an expense to the budget. Only the administrator can delete records; board review history is retained.</p>`;
  }
  function requestForm(c,r){
    const works=c.data.work||[];
    c.formDialog(r?'Update bid request':'Create bid request',
      input('title','Project title','text',true)+`<label>Link to contractor work project (optional)<select name="work_id"><option value="">Not linked</option>${works.map(w=>`<option value="${w.id}">${esc(w.title)}</option>`).join('')}</select></label>`+
      area('scope','Scope to be quoted (visible to residents when opened)',true)+input('location','Work location')+input('deadline','Submission deadline (optional)','date')+
      '<label>Visibility / submission status<select name="state"><option value="draft">Draft: board only</option><option value="open">Open: residents may submit</option><option value="closed">Closed: no new resident submissions</option></select></label><p>Do not include private bid prices or contractor contact information in the member-visible request.</p>',
      fd=>{const p=Object.fromEntries(fd);p.work_id||=null;p.deadline||=null;return c.mutate('/api/bid-requests'+(r?'/'+r.id:''),{method:r?'PUT':'POST',body:JSON.stringify(p)},'Bid request saved. No invitations or emails were sent.');},r);
  }
  function submitForm(c){
    c.formDialog('Submit contractor proposal',
      '<p>Private to the board and your account. Enter the actual written quote, not a budget estimate. You can attach the proposal after saving.</p>'+input('contractor','Contractor / company','text',true)+
      '<label>Contact details (private)<input name="contact" maxlength="600"></label><label>Quoted amount ($)<input name="amount" type="number" min="0.01" max="10000000" step="0.01" required></label>'+
      '<label>Tax treatment<select name="tax_basis"><option value="unspecified">Not specified</option><option value="included">Included in amount</option><option value="excluded">Extra / excluded from amount</option></select></label>'+
      area('scope','Included work / actual quote scope',true)+area('exclusions','Exclusions, allowances and conditions')+
      '<label>Proposed start / completion timing<textarea name="timing" maxlength="2000" rows="2"></textarea></label>'+input('valid_until','Quote valid until (optional)','date')+
      '<label class="community-check"><input type="checkbox" required> I have permission to share this proposal with HBA for review. I understand this is not contract acceptance.</label>',
      fd=>{const p=Object.fromEntries(fd);p.request_id=selected;p.valid_until||=null;return c.mutate('/api/bids',{method:'POST',body:JSON.stringify(p)},'Proposal submitted privately. Attach the written quote next; no contract or expense was created.');});
  }
  function bind(c,root){
    root.querySelector('#bid-request-select')?.addEventListener('change',e=>{selected=e.target.value;c.render();});
    root.querySelector('#bid-add-request')?.addEventListener('click',()=>requestForm(c));
    root.querySelector('#bid-edit-request')?.addEventListener('click',()=>requestForm(c,c.data.bid_requests.find(r=>r.id===selected)));
    root.querySelector('#bid-submit')?.addEventListener('click',()=>submitForm(c));
    root.querySelector('#bid-open-work')?.addEventListener('click',()=>window.openHBACommunity('work',c.data.bid_requests.find(r=>r.id===selected)?.work_id));
    root.querySelectorAll('[data-bid-review]').forEach(el=>el.onclick=()=>{
      const b=c.data.bids.find(x=>x.id===el.dataset.bidReview);
      c.formDialog('Review '+b.contractor,`<p>${money(b.amount)} · ${esc(tax[b.tax_basis])}. Selecting does not approve spending or notify the contractor.</p><label>Status<select name="state">${Object.entries(states).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>`+
        area('note','Reason / clarification / minutes reference (board only)',true),fd=>c.mutate('/api/bids/'+b.id+'/review',{method:'POST',body:JSON.stringify({...Object.fromEntries(fd),revision:b.revision})},'Review recorded. No contract, payment or budget entry was created.'),b);
    });
    root.querySelectorAll('[data-bid-upload]').forEach(el=>el.onclick=()=>{
      c.formDialog('Attach contractor proposal','<p>PDF, JPEG or PNG, up to 8 MB. Images are saved as a PDF with location metadata removed. Keep the original signed contract separately.</p><label>Proposal or photo<input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required></label>'+
        '<label>Attachment description<textarea name="caption" maxlength="2000" rows="2"></textarea></label><label class="community-check"><input type="checkbox" required> I have permission to share this file. It contains no bank account numbers or unrelated private records.</label>',
        fd=>c.mutate('/api/bids/'+el.dataset.bidUpload+'/files',{method:'POST',body:fd},'Attachment saved privately.'));
    });
    root.querySelectorAll('[data-bid-file]').forEach(el=>el.onclick=async()=>{
      try{await c.openFile('bid',el.dataset.bidFile);}catch(e){c.status(e.message,true);}
    });
  }
  window.HBABids={render,bind};
})();
