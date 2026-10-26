(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=x=>Number(x).toLocaleString('en-US',{style:'currency',currency:'USD'});
  async function open(c,record,bankMode,after){
    try{
      const d=await c.api('/api/dues-receipts'),aid=bankMode?record.account_id:record.bank_account_id;
      const payers=d.payers.filter(p=>p.bank_account_id===aid);
      const known=bankMode&&record.payer_fingerprint?payers.find(p=>p.fingerprint===record.payer_fingerprint):null;
      const credited=d.receipts.filter(r=>r.register_id===record.id).reduce((s,r)=>s+Number(r.amount),0);
      const available=Number(record.amount)-credited;
      if(!bankMode&&available<=0){c.status('This entry has already been fully attributed. An administrator can reverse an incorrect credit.',true);return;}
      c.formDialog(bankMode?'Record dues check & credit household':'Attribute dues receipt to household',`
        <p>${esc(record.posted_date||record.transaction_date)} · ${esc(record.description||record.payee)} · ${money(record.amount)}.</p>
        <p>Choose the household that receives credit, not necessarily the person whose name is printed on the check. Verify membership and the dues year. A donation is not annual dues.</p>
        ${bankMode?'<p class="community-notice">This action books this entire bank deposit once as dues income. Use it only for one household’s single dues check. For combined deposits, enter individual checks in the register and allocate each there; do not book the combined deposit again.</p>':`<p>${money(available)} remains available on this dues entry. You can split a dues-only check between households or years without recording income twice. For a mixed dues-and-donation check, enter separate categorized portions in the register first.</p>`}
        <label>Remembered payer<select name="payer_id"><option value="">New / not identified</option>${payers.map(p=>`<option value="${p.id}"${known?.id===p.id?' selected':''}>${esc(p.label)} · ${esc(d.households.find(h=>h.uid===p.household_uid)?.address||p.household_uid)}</option>`).join('')}</select></label>
        <p>${known?'A verified payer key matched. Its household is filled in below; review it before confirming.':'No automatic payer match. Choose a saved payer if you have verified it, or select the household below. A surname, check number or equal amount is not an account match.'}</p>
        <label>Household address<select name="household_uid" required><option value="">Choose a household</option>${d.households.map(h=>`<option value="${esc(h.uid)}"${known?.household_uid===h.uid?' selected':''}>${esc(h.address)}</option>`).join('')}</select></label>
        <label>Dues year<input name="dues_year" type="number" min="2020" max="2100" value="${new Date().getFullYear()}" required></label>
        ${bankMode?'':`<label>Amount to credit from this entry<input name="amount" type="number" min=".01" step=".01" max="${available.toFixed(2)}" value="${available.toFixed(2)}" required></label>`}
        <label>Verified annual dues for this household / year<input name="annual_due" type="number" min=".01" step=".01" required></label>
        <p id="dues-credit-position" role="status">Choose an address and dues year to see prior receipt credits.</p>
        <details><summary>Remember this payer for next time</summary><p>Only save a verified one-household payer identity. Shared accounts, ownership changes and checks for someone else need manual review. The bank often supplies only a combined deposit, not the payer’s identity.</p>
        <label>Private payer label<input name="payer_label" maxlength="120" placeholder="Household joint checking" value="${esc(known?.label||'')}"></label>
        <label>Stable non-sensitive payer key (if not supplied by the bank)<input name="payer_key" maxlength="120" placeholder="payer-example-joint" pattern="[A-Za-z][A-Za-z0-9:_-]{5,119}"></label>
        <p>Use an opaque bank-provided payer ID or an internal label, never a full account/routing number, check number or last four alone. Future CSV imports can include the same optional payer_key to fill the address automatically. A manual check can use the saved payer menu above.</p>
        <label class="communications-check"><input type="checkbox" name="remember"${known?' checked':''}> Remember this verified payer-to-household link</label></details>
        ${bankMode?'<label class="communications-check"><input type="checkbox" name="single_check" required> I verified this is one household’s single dues check, not a combined or mixed deposit.</label>':''}
        <label class="communications-check"><input type="checkbox" name="confirmed" required> I verified the received check, household, year and annual amount, and checked for a prior credit. Save this receipt and update the household’s dues status.</label>`,
        async fd=>{
          const p=Object.fromEntries(fd);p.dues_year=Number(p.dues_year);p.remember=fd.has('remember');p.confirmed=fd.has('confirmed');p.single_check=fd.has('single_check');p.payer_id=p.payer_id||null;
          if(bankMode){p.bank_transaction_id=record.id;p.payee=record.description||'Confirmed dues check';}
          else p.register_id=record.id;
          const r=await c.api('/api/dues-receipts',{method:'POST',body:JSON.stringify(p)});
          await after();document.dispatchEvent(new CustomEvent('hba-dues-receipts-changed'));
          c.status(`${money(r.credited_total)} credited toward ${money(r.annual_due)} for ${r.dues_year}. ${r.status==='paid'?'Dues paid.':money(r.remaining)+' remains; partial payment recorded.'} Address memory ${p.remember?'saved or retained.':'not changed.'}`);
        },{},bankMode?'Confirm dues check & household credit':'Confirm household credit');
      const f=document.querySelector('#community-editor form'),position=f.querySelector('#dues-credit-position');
      function update(){
        const household=f.elements.household_uid.value,y=Number(f.elements.dues_year.value),target=d.targets.find(t=>t.uid===household&&t.year===y);
        const total=d.receipts.filter(r=>r.household_uid===household&&r.dues_year===y).reduce((s,r)=>s+Number(r.amount),0);
        f.elements.annual_due.value=target?.annual_due||'';f.elements.annual_due.readOnly=!!target;
        const old=d.statuses.find(s=>s.uid===household&&s.year===y);
        position.textContent=!household?'Choose an address and dues year.':old?.status==='paid'&&total===0?'Already marked paid outside this receipt ledger. Reconcile the older record before crediting; the server will block a possible duplicate.':`${money(total)} already credited${target?' toward '+money(target.annual_due):'; enter the documented annual amount, not a simulator estimate'}.`;
      }
      f.elements.payer_id.onchange=()=>{
        const payer=payers.find(p=>p.id===f.elements.payer_id.value);
        if(payer){f.elements.household_uid.value=payer.household_uid;f.elements.payer_label.value=payer.label;f.elements.remember.checked=true;}
        update();
      };
      f.elements.household_uid.onchange=update;f.elements.dues_year.onchange=update;update();
    }catch(e){c.status(e.message,true);}
  }
  function panel(c,d){
    if(!d)return '';
    const address=id=>d.households.find(h=>h.uid===id)?.address||id;
    return `<details data-dues-tracking><summary>Household dues receipts & remembered payers</summary>
      <p>Confirmed credits accumulate by household and dues year. Reaching the verified annual amount marks dues paid; a partial payment leaves a balance. This does not establish eligibility, charge a member or alter an adopted budget. Existing manual paid flags need reconciliation before a first ledger credit.</p>
      ${d.targets.map(t=>{const sum=d.receipts.filter(r=>r.household_uid===t.uid&&r.dues_year===t.year).reduce((s,r)=>s+Number(r.amount),0);return `<article class="community-story" data-target-uid="${esc(t.uid)}" data-target-year="${t.year}"><h4>${esc(address(t.uid))} · ${t.year}</h4><p>${money(sum)} credited / ${money(t.annual_due)} annual dues · ${sum>=Number(t.annual_due)?'Paid'+(sum>Number(t.annual_due)?' · '+money(sum-Number(t.annual_due))+' above the target; review its purpose':''):sum>0?'Partial payment: '+money(Number(t.annual_due)-sum)+' remaining':'No active receipt credits'}</p></article>`;}).join('')||'<p>No household receipt credits recorded yet.</p>'}
      <h4>Receipt corrections · administrator only</h4>${d.receipts.map(r=>`<p>${esc(address(r.household_uid))} · ${r.dues_year} · ${money(r.amount)} ${c.deleteButton('dues-receipt',r.id)}</p>`).join('')||'<p>No receipts.</p>'}
      <p>Reversing a receipt recalculates dues but does not remove its income entry. Review a returned check, refund or register correction separately. Income and receipts cannot be silently counted twice.</p>
      <h4>Saved payer links</h4>${d.payers.map(p=>`<p>${esc(p.label)} → ${esc(address(p.household_uid))} ${c.deleteButton('payer-household',p.id)}</p>`).join('')||'<p>No saved payer links.</p>'}
      <p>Links are board-private. Only the administrator can forget a link; never silently reassign a shared account or a previous owner’s account.</p></details>`;
  }
  function bindPanel(c,root,after){
    if(c.isAdmin())root.querySelectorAll('[data-dues-tracking] .community-story').forEach(article=>{
      const headings=article.querySelector('h4').textContent;
      const b=document.createElement('button');b.type='button';b.textContent='Correct annual amount';
      b.onclick=async()=>{
        try{
          const d=await c.api('/api/dues-receipts');
          const t=d.targets.find(t=>t.uid===article.dataset.targetUid&&t.year===Number(article.dataset.targetYear));
          if(!t)throw Error('Refresh the receipt history before correcting this amount.');
          c.formDialog('Correct verified annual dues',`<p>${esc(headings)}. This corrects the household’s verified dues target, not the adopted budget or membership rules. Existing credits are preserved and status will be recalculated.</p><label>Verified annual amount<input type="number" name="annual_due" step=".01" min=".01" value="${t.annual_due}" required></label><label>Correction reason / approved dues reference<textarea name="source_note" maxlength="1000" required></textarea></label>`,
            async fd=>{await c.api('/api/dues-targets/'+t.year+'/'+encodeURIComponent(t.uid),{method:'PUT',body:JSON.stringify(Object.fromEntries(fd))});await after();document.dispatchEvent(new CustomEvent('hba-dues-receipts-changed'));c.status('Annual amount corrected and dues status recalculated. Change history retained.');},{},'Confirm documented correction');
        }catch(e){c.status(e.message,true);}
      };
      article.append(b);
    });
    root.querySelectorAll('[data-dues-tracking] [data-delete-kind]').forEach(b=>b.onclick=()=>{
      const receipt=b.dataset.deleteKind==='dues-receipt';
      c.formDialog(receipt?'Reverse this household receipt?':'Forget this payer link?',
        `<p>${receipt?'This removes the selected household credit and recalculates its dues status. Its income entry is retained. Review any returned check or refund separately.':'Future checks will no longer fill an address from this payer link. Prior receipts remain unchanged. Verify a new link rather than reusing a previous owner or shared account.'}</p><label class="communications-check"><input type="checkbox" required> I reviewed this correction and want to proceed.</label>`,
        async()=>{await c.api('/api/records/'+b.dataset.deleteKind+'/'+b.dataset.deleteId,{method:'DELETE'});await after();document.dispatchEvent(new CustomEvent('hba-dues-receipts-changed'));c.status(receipt?'Receipt reversed and household dues recalculated. Review the income entry separately.':'Payer link forgotten; historical credits retained.');},{},receipt?'Reverse household credit':'Forget payer link');
    });
  }
  window.HBADuesReceipts={open,panel,bindPanel};
})();
