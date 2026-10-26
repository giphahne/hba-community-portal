(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=x=>Number(x).toLocaleString('en-US',{style:'currency',currency:'USD'});
  let data=null,error='',loading=false,account='',asOf=new Date().toLocaleDateString('en-CA'),epoch=0,member='';
  function render(c){
    const summaries=c.data.bank_summaries||[];
    const published=`<h3>Member financial updates</h3><p>Only summaries deliberately published by the treasurer or administrator appear here. They are not independent audit opinions; bank rows, payees and household payments remain private.</p>${summaries.map(r=>`<article class="community-story"><h4>As of ${esc(r.period_end)}</h4><p class="community-prewrap">${esc(r.statement)}</p>${c.deleteButton('bank-summary',r.id)}</article>`).join('')||'<p>No reconciliation summary has been published yet.</p>'}`;
    if(!c.isBoard())return '<section id="bank-summary">'+published+'</section>';
    const a=data?.analysis,editable=c.data.can_edit_finance;
    const tx=id=>data.transactions.find(t=>t.id===id),reg=id=>data.register.find(r=>r.id===id);
    return `<section id="bank-workspace"><div class="community-section-head"><div><h3>Bank reconciliation</h3><p>Board-private statement review, outstanding payments and book-to-bank checks.</p></div><div class="community-actions">${c.isAdmin()?'<button type="button" id="bank-add-account">Add HBA account reference</button>':''}${editable?'<button type="button" id="bank-import">Import statement CSV</button><button type="button" id="bank-publish">Publish member summary</button>':''}<button type="button" id="bank-refresh"${loading?' disabled':''}>Refresh review</button></div></div>
      <p class="community-notice">Live bank linking is not active. Secure account authorization and an HBA-only read-only data source must be verified before a live feed can be enabled. No banking password, routing number or full account number is collected here. Current data, if any, comes from a treasurer’s statement import.</p>
      <div class="community-fields"><label>HBA account<select id="bank-account"><option value="">Choose an account reference</option>${(data?.accounts||[]).map(a=>`<option value="${a.id}"${account===a.id?' selected':''}>${esc(a.label+(a.last_four?' · ending '+a.last_four:''))}</option>`).join('')}</select></label><label>Statement / as-of date<input id="bank-asof" type="date" value="${asOf}" max="${new Date().toLocaleDateString('en-CA')}"></label></div><p role="status">${loading?'Loading private reconciliation…':error?esc(error):''}</p>
      ${a?`<article class="community-story"><h3>Reconciliation at ${esc(a.as_of)}</h3><p>Payments without matched bank evidence: ${money(a.outstanding_payments)}. Receipts without matched bank evidence: ${money(a.deposits_in_transit)}.</p><p>Adjusted statement balance: ${a.adjusted_bank===null?'Not available: enter a statement closing balance for this exact date':money(a.adjusted_bank)}. Difference from supplied book closing balance: ${a.difference===null?'Not calculated':money(a.difference)}.</p><p>Unassigned register entries: ${a.unassigned_register_count}. Assign each relevant entry to the correct bank account in the check register before relying on these totals.</p><p class="community-notice">A zero difference does not certify the books. Missing opening history, imports, outstanding items, bank errors or manual entries can change the result. Unmatched does not prove uncashed. A match after the as-of date does not clear an earlier statement period.</p></article>
      <details><summary>Import coverage & balance calculation</summary><p>Adjusted bank = supplied statement closing balance + receipts without matched bank evidence − payments without matched bank evidence. Compared with the treasurer-supplied book closing balance. Fees, interest, errors and unrecorded items require investigation; they are not automatically posted.</p>${data.imports.map(i=>`<p>${esc(i.period_start)} to ${esc(i.period_end)} · imported ${esc(i.created_at)} · ${esc(i.source_note)}. Statement closing: ${i.statement_closing===null?'Not supplied':money(i.statement_closing)}; books closing: ${i.books_closing===null?'Not supplied':money(i.books_closing)}.</p>`).join('')||'<p>No statement imports on or before this date.</p>'}</details>
      <h3>Outstanding payments & deposits</h3><p>All non-voided, assigned register entries through the selected date without matched bank evidence, including older years. References are not assumed to be check numbers unless entered as such.</p>${a.outstanding.map(r=>`<article class="community-card"><div><h4>${esc(r.reference||'No check/reference')} · ${esc(r.payee)} · ${money(r.amount)}</h4><p>${esc(r.transaction_date)} · ${esc(r.direction)} · ${r.age_days} days · ${esc(r.age_band)}</p><p>${esc(r.evidence_status)}. Review older items; do not automatically void or reissue.</p></div></article>`).join('')||'<p>No unmatched assigned register entries in this scope. This is not confirmation that every check has been entered.</p>'}
      <h3>Suggested matches · treasurer confirmation required</h3><p>Suggestions require the same account, signed amount, nonempty normalized reference and a bank date on or after the register date. Amount-only matches are not suggested.</p>${a.candidates.map(m=>`<article class="community-card"><div><h4>${esc(reg(m.register_id)?.reference)} · ${money(tx(m.transaction_id)?.amount)}</h4><p>Register: ${esc(reg(m.register_id)?.payee)} · ${esc(reg(m.register_id)?.transaction_date)}. Bank: ${esc(tx(m.transaction_id)?.description)} · ${esc(tx(m.transaction_id)?.posted_date)}.</p><p>${esc(m.reason)}${m.ambiguous?' · AMBIGUOUS: more than one candidate; inspect carefully.':''}</p>${editable?`<button type="button" data-bank-match="${m.register_id}" data-bank-tx="${m.transaction_id}">Review & confirm match</button>`:''}</div></article>`).join('')||'<p>No reference-based candidates found.</p>'}
      <h3>Bank rows without matched book entries</h3>${a.unmatched_bank.map(b=>`<article class="community-card"><div><h4>${esc(b.posted_date)} · ${money(b.amount)}</h4><p>${esc(b.description)} · ${esc(b.reference||'No reference supplied')}</p><p>Possible missing entry, timing item, fee, interest or error. No entry is created automatically.</p>${editable?`<div class="community-actions"><button type="button" data-bank-existing="${b.id}">Match an existing check / entry</button><button type="button" data-bank-book="${b.id}">Review budget entry</button></div>`:''}</div></article>`).join('')||'<p>No unmatched rows in the supplied data; statement completeness is not verified.</p>'}
      <details><summary>Confirmed matches & administrator corrections</summary>${data.matches.filter(m=>tx(m.transaction_id)).map(m=>`<p>Register ${esc(reg(m.register_id)?.reference||m.register_id)} ↔ ${esc(tx(m.transaction_id)?.posted_date)} · ${money(tx(m.transaction_id)?.amount)} ${c.deleteButton('bank-match',m.id)}</p>`).join('')||'<p>No confirmed matches.</p>'}</details>`:''}${published}</section>`;
  }
  async function refresh(c){
    if(loading||!c.isBoard())return;loading=true;error='';const serial=++epoch;c.render();
    try{const r=await c.api('/api/bank'+(account?'?account_id='+encodeURIComponent(account)+'&as_of='+asOf:''));if(serial===epoch)data=r;}
    catch(e){if(serial===epoch){error=e.message;data=null;}}
    finally{if(serial===epoch){loading=false;c.render();}}
  }
  function parseCSV(text){
    const rows=[];let row=[],cell='',quoted=false;
    for(let n=0;n<text.length;n++){const ch=text[n];if(ch==='"'){if(quoted&&text[n+1]==='"'){cell+='"';n++;}else if(quoted||!cell)quoted=!quoted;else throw Error('Unexpected quote in CSV.');}
      else if(ch===','&&!quoted){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[n+1]==='\n')n++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=ch;}
    if(quoted)throw Error('Unclosed CSV quote.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
    const header=(rows.shift()||[]).map(x=>x.trim().replace(/^\uFEFF/,'').toLowerCase());
    for(const key of ['posted_date','amount','description','reference'])if(!header.includes(key))throw Error('Missing CSV column: '+key);
    if(new Set(header).size!==header.length)throw Error('Duplicate CSV column.');
    if(!rows.length||rows.length>1000)throw Error('Import 1–1,000 statement rows at a time.');
    return rows.map((r,n)=>{
      if(r.length!==header.length)throw Error('CSV row '+(n+2)+' has the wrong number of columns.');
      const v=Object.fromEntries(header.map((h,i)=>[h,r[i].trim()]));
      if(!/^\d{4}-\d{2}-\d{2}$/.test(v.posted_date)||!/-?\d/.test(v.amount)||!/^[-+]?\d+(\.\d{1,2})?$/.test(v.amount))throw Error('Use YYYY-MM-DD dates and signed decimal amounts; invalid row '+(n+2));
      return {posted_date:v.posted_date,amount:v.amount,description:v.description,reference:v.reference,bank_transaction_id:v.bank_transaction_id||'',payer_key:v.payer_key||''};
    });
  }
  function bind(c,root){
    if(!root.querySelector('#bank-workspace'))return;
    if(member!==c.member.id){member=c.member.id;data=null;account='';error='';loading=false;}
    root.querySelectorAll('[data-bank-book]').forEach(button=>{
      const r=data?.transactions.find(r=>r.id===button.dataset.bankBook);
      if(r&&Number(r.amount)>0){
        const b=document.createElement('button');b.type='button';b.textContent='Record dues check';
        b.onclick=()=>window.HBADuesReceipts.open(c,r,true,()=>refresh(c));button.after(b);
      }
    });
    const on=(id,fn)=>{const b=root.querySelector('#'+id);if(b)b.onclick=fn;};
    on('bank-refresh',()=>refresh(c));root.querySelector('#bank-account').onchange=e=>{account=e.target.value;refresh(c);};
    root.querySelector('#bank-asof').onchange=e=>{if(e.target.value){asOf=e.target.value;refresh(c);}};
    on('bank-add-account',()=>c.formDialog('Add authorized HBA account reference','<p>This labels statement imports only. It does not connect a bank or authorize access to a personal account.</p><label>Account label<input name="label" maxlength="120" required placeholder="HBA operating checking"></label><label>Last four digits only (optional)<input name="last_four" pattern="[0-9]{4}" maxlength="4"></label>',async fd=>{const r=await c.api('/api/bank/accounts',{method:'POST',body:JSON.stringify(Object.fromEntries(fd))});account=r.id;await refresh(c);},{},'Save account reference'));
    on('bank-import',()=>{
      if(!account){c.status('Choose an HBA account reference first.',true);return;}
      c.formDialog('Import posted statement transactions',`<p>Use CSV columns: posted_date, amount, description, reference, bank_transaction_id (optional), payer_key (optional). Amount is positive for deposits and negative for withdrawals. Export posted USD transactions only, not pending items. Do not include full account numbers or check images.</p><p>A payer_key is a stable non-sensitive ID such as payer-example-joint, not an account number or check number. When a treasurer has verified and remembered that payer, later imports with the same key can fill its household address. Without that identity the app cannot infer a household from a deposit or surname.</p><p>Identical rows are held as possible duplicates; genuine identical payments need distinct stable bank_transaction_id values. Existing bank IDs are not overwritten; corrections require administrator review.</p><label>Statement starts<input name="period_start" type="date" required></label><label>Statement ends<input name="period_end" type="date" value="${asOf}" required></label><label>Statement closing balance (optional)<input name="statement_closing" type="number" step=".01"></label><label>Book closing balance at same date (optional)<input name="books_closing" type="number" step=".01"></label><label>Statement source / completeness note<input name="source_note" maxlength="1000" required></label><label>CSV file<input name="csv" type="file" accept=".csv,text/csv" required></label><label class="communications-check"><input name="confirmed" type="checkbox" required> I am authorized to import this HBA account, checked the amount signs and removed unrelated personal/account information.</label>`,async fd=>{
        const file=fd.get('csv');if(file.size>2000000)throw Error('CSV must be under 2 MB.');
        const p=Object.fromEntries(fd);delete p.csv;delete p.confirmed;p.account_id=account;p.rows=parseCSV(await file.text());
        for(const k of ['statement_closing','books_closing'])p[k]=p[k]||null;
        const r=await c.api('/api/bank/import',{method:'POST',body:JSON.stringify(p)});asOf=p.period_end;await refresh(c);c.status(`${r.added} rows imported; ${r.possible_duplicates_held} possible duplicates held. No register entries or dues statuses changed.`);
      },{},'Import for review');
    });
    root.querySelectorAll('[data-bank-match]').forEach(b=>b.onclick=()=>{
      const r=data.register.find(r=>r.id===b.dataset.bankMatch),t=data.transactions.find(t=>t.id===b.dataset.bankTx);
      c.formDialog('Confirm statement-to-register match',`<p>Register: ${esc(r.payee)} · ${esc(r.reference)} · ${money(r.amount)}. Bank: ${esc(t.description)} · ${esc(t.posted_date)} · ${money(t.amount)}.</p><label class="communications-check"><input type="checkbox" required name="confirm"> I inspected the original statement and register, confirmed the exact payment and checked for duplicates. This is not merely an amount match.</label>`,async()=>{await c.api('/api/bank/matches',{method:'POST',body:JSON.stringify({register_id:r.id,transaction_id:t.id})});await refresh(c);},{},'Confirm match');
    });
    root.querySelectorAll('[data-bank-book]').forEach(b=>b.onclick=async()=>{
      const t=data.transactions.find(t=>t.id===b.dataset.bankBook),direction=Number(t.amount)>0?'income':'expense';
      try{
        const finance=await c.api('/api/finance/'+t.posted_date.slice(0,4));
        c.formDialog('Add missing bank payment to budget actuals',`<p>${esc(t.posted_date)} · ${esc(t.description)} · ${money(t.amount)}. This records an actual transaction; it does not change an adopted budget or authorize spending.</p><label>Payee / payer<input name="payee" maxlength="180" value="${esc(t.description.slice(0,180))}" required></label><label>Budget category<select name="category_code">${finance.categories.filter(x=>x.direction===direction).map(x=>`<option value="${x.code}">${esc(x.label)}</option>`).join('')}</select></label><label>Review note<textarea name="memo" maxlength="3000"></textarea></label><label class="communications-check"><input type="checkbox" required> I checked the existing register and original statement. This is a missing book entry, not an existing check waiting to be matched.</label>`,async fd=>{
          await c.api('/api/bank/transactions/'+t.id+'/book',{method:'POST',body:JSON.stringify(Object.fromEntries(fd))});
          await refresh(c);c.status('Recorded once in budget actuals and linked to the bank row. No adopted budget or dues status changed.');
        },{},'Confirm budget category & record actual');
      }catch(e){c.status(e.message,true);}
    });
    root.querySelectorAll('[data-bank-existing]').forEach(b=>b.onclick=()=>{
      const t=data.transactions.find(t=>t.id===b.dataset.bankExisting);
      const rows=data.register.filter(r=>r.bank_account_id===account&&!r.voided&&r.transaction_date<=t.posted_date
        &&Math.round(Number(r.amount)*100)*(r.direction==='income'?1:-1)===Math.round(Number(t.amount)*100)
        &&!data.matches.some(m=>m.register_id===r.id));
      if(!rows.length){c.status('No unmatched entry has the same account, amount and valid date. Check the register, assign the right account, or record a genuinely missing entry.',true);return;}
      c.formDialog('Match a bank row to an existing entry',`<p>Bank: ${esc(t.description)} · ${esc(t.posted_date)} · ${money(t.amount)}. Different references can be matched only after you inspect the original records.</p><label>Existing register entry<select name="register_id" required>${rows.map(r=>`<option value="${r.id}">${esc(r.reference||'No reference')} · ${esc(r.payee)} · ${esc(r.transaction_date)} · ${money(r.amount)}</option>`).join('')}</select></label><label class="communications-check"><input type="checkbox" required> I checked the original statement and exact payee/check. This is the same payment, not just the same amount.</label>`,async fd=>{
        await c.api('/api/bank/matches',{method:'POST',body:JSON.stringify({register_id:fd.get('register_id'),transaction_id:t.id})});await refresh(c);
      },{},'Confirm existing entry match');
    });
    on('bank-publish',()=>c.formDialog('Publish a financial summary to members','<p>This text becomes visible to all approved members. Exclude payees, household dues, account numbers and private contract prices. Do not describe an incomplete reconciliation as an audit.</p><label>As-of date<input type="date" name="period_end" value="'+asOf+'" required></label><label>Member summary<textarea name="statement" maxlength="3000" required></textarea></label><label class="communications-check"><input type="checkbox" required name="confirm"> I reviewed this text for member disclosure.</label>',async fd=>{await c.mutate('/api/bank/summaries',{method:'POST',body:JSON.stringify({period_end:fd.get('period_end'),statement:fd.get('statement')})},'Financial summary published to approved members.');},{},'Publish member summary'));
    if(!data&&!loading&&!error)refresh(c);
  }
  document.addEventListener('hba-account-change',e=>{if(!e.detail.board||e.detail.member?.id!==member){++epoch;data=null;error='';loading=false;account='';member=e.detail.member?.id||'';}});
  window.HBABank={render,bind,parseCSV};
})();
