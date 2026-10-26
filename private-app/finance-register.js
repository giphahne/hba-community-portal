(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=x=>Number(x).toLocaleString('en-US',{style:'currency',currency:'USD'});
  let year=new Date().getFullYear(),data=null,loading=false,error='',epoch=0,memberId='',lastContext;
  function render(c){
    const edit=c.data.can_edit_finance;
    return `<div id="finance-content"><div class="community-section-head"><div><h3>Treasurer’s check register</h3><p>Board-private income, expenses and reconciliation. The linked treasurer and administrator can edit; other board accounts can read.</p></div><div class="community-actions">${edit?'<button type="button" id="finance-add">Add transaction</button><button type="button" id="finance-budget">Set category budget</button>':''}<button type="button" id="finance-refresh"${loading?' disabled':''}>Refresh actuals</button></div></div>
      <p class="community-notice">These are manual records, not a bank feed. Record every item once, use a budget category, and check the bank separately. Voided entries remain in history but are excluded from totals. Net activity is not a bank balance. For a received dues check, choose Annual dues / Income, then “Credit household dues” to link the address and year. A plain register entry or payment report alone does not mark dues paid.</p>
      <label>Calendar year<input id="finance-year" type="number" min="2020" max="2100" value="${year}"></label>
      <p role="status">${error?esc(error):loading?'Loading private register…':data?'Updated '+new Date(data.refreshed_at).toLocaleString('en-US',{timeZone:'America/New_York'})+' Eastern. Refreshes every 30 seconds while this view is open.':'Loading private register…'}</p>
      ${data?`<div class="community-story"><h3>${year} recorded activity</h3><p>Income: ${money(data.rows.filter(r=>r.direction==='income'&&!r.voided).reduce((s,r)=>s+Number(r.amount),0))} · Expenses: ${money(data.rows.filter(r=>r.direction==='expense'&&!r.voided).reduce((s,r)=>s+Number(r.amount),0))} · Net activity: ${money(data.rows.filter(r=>!r.voided).reduce((s,r)=>s+(r.direction==='income'?1:-1)*Number(r.amount),0))}</p><p>Actuals include both cleared and outstanding, non-voided entries. The cleared column is shown separately. Budget totals depend on manually entered, labeled budget lines, not simulator assumptions.</p></div>
      <h3>Budget vs actual</h3><div class="finance-table-wrap"><table class="finance-table"><thead><tr><th>Budget category</th><th>Plan</th><th>Actual</th><th>Cleared</th><th>Remaining / variance</th></tr></thead><tbody>${data.summary.map(s=>`<tr><th scope="row">${esc(s.label)}<small>${esc(s.direction)} · model line ${esc(s.model_line)}</small></th><td>${s.planned===null?'Not entered':money(s.planned)+'<small>'+esc(s.basis)+'</small>'}</td><td>${money(s.actual)}</td><td>${money(s.cleared)}</td><td>${s.variance===null?'No plan':money(s.variance)+(s.direction==='expense'?' remaining':' vs plan')}</td></tr>`).join('')}</tbody></table></div>
      <h3>Check & transaction register</h3>${data.rows.length?`<div class="finance-table-wrap"><table class="finance-table"><thead><tr><th>Date / reference</th><th>Payee or payer</th><th>Category</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>${data.rows.map(r=>`<tr><td>${esc(r.transaction_date)}<small>${esc(r.reference||'No check / reference')}</small></td><td>${esc(r.payee)}${r.memo?`<details><summary>Memo</summary><p>${esc(r.memo)}</p></details>`:''}</td><td>${esc(data.categories.find(s=>s.code===r.category_code)?.label||r.category_code)}</td><td>${r.direction==='expense'?'−':'+'}${money(r.amount)}</td><td>${r.voided?'Voided':r.cleared?'Cleared':'Outstanding'}</td><td>${edit?`<button type="button" data-register-edit="${r.id}">Edit / reconcile</button>`:'Read only'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="community-empty"><h4>No entries recorded for this year</h4><p>No real check amounts, bank balances or paid dues have been invented.</p></div>'}
      <details><summary>Change history · latest 100 register and budget changes</summary>${data.audit.map(a=>`<article class="community-card"><div><h4>${esc(a.action)} · ${esc(a.record_table==='hba_check_register'?'Transaction':'Budget line')}</h4><small>${esc(new Date(a.changed_at).toLocaleString('en-US',{timeZone:'America/New_York'}))} Eastern · Account ${esc(a.changed_by)}</small><details><summary>Recorded before / after</summary><pre class="finance-audit">${esc(JSON.stringify({before:a.before_record,after:a.after_record},null,2))}</pre></details></div></article>`).join('')||'<p>No register changes recorded.</p>'}</details>`:''}</div>`;
  }
  async function refresh(c){
    if(loading||!c.isBoard())return;loading=true;error='';const serial=++epoch;
    c.render();
    try{const d=await c.api('/api/finance/'+year);if(serial!==epoch||!c.isBoard())return;data=d;}
    catch(e){if(serial!==epoch)return;error='Actuals unavailable: '+e.message;data=null;}
    finally{if(serial===epoch){loading=false;c.render();}}
  }
  function bind(c,root){
    if(!root.querySelector('#finance-content'))return;
    lastContext=c;
    if(data){
      root.querySelector('#finance-content').insertAdjacentHTML('beforeend',window.HBADuesReceipts.panel(c,data.dues_tracking));
      window.HBADuesReceipts.bindPanel(c,root,()=>refresh(c));
      root.querySelectorAll('[data-register-edit]').forEach(button=>{
        const r=data.rows.find(r=>r.id===button.dataset.registerEdit);
        if(r?.direction==='income'&&r.category_code==='dues'&&!r.voided){
          const b=document.createElement('button');b.type='button';b.textContent='Credit household dues';
          b.onclick=()=>window.HBADuesReceipts.open(c,r,false,()=>refresh(c));button.after(b);
        }
      });
    }
    if(memberId!==c.member.id){memberId=c.member.id;data=null;loading=false;}
    const click=(id,fn)=>{const b=root.querySelector('#'+id);if(b)b.onclick=fn;};
    click('finance-refresh',()=>refresh(c));
    root.querySelector('#finance-year').onchange=e=>{
      const n=Number(e.target.value);if(!Number.isInteger(n)||n<2020||n>2100){e.target.value=year;return;}
      ++epoch;loading=false;year=n;data=null;refresh(c);
    };
    function edit(r){
      if(!data)return;
      c.formDialog(r?'Edit / reconcile transaction':'Add check or transaction',`<label>Date<input name="transaction_date" type="date" value="${r?.transaction_date||new Date().toLocaleDateString('en-CA')}" required></label><label>Type<select name="direction"><option value="expense">Expense / payment</option><option value="income"${r?.direction==='income'?' selected':''}>Income / receipt</option></select></label><label>Budget category<select name="category_code" required></select></label><label>Payee / payer<input name="payee" maxlength="180" value="${esc(r?.payee||'')}" required></label><label>Amount ($, positive)<input name="amount" type="number" min=".01" max="9999999999.99" step=".01" value="${r?.amount||''}" required></label><label>Check number / transaction reference<input name="reference" maxlength="80" value="${esc(r?.reference||'')}"></label><label>Memo<textarea name="memo" maxlength="3000">${esc(r?.memo||'')}</textarea></label><label class="communications-check"><input type="checkbox" name="cleared"${r?.cleared?' checked':''}> Bank cleared / reconciled</label><label class="communications-check"><input type="checkbox" name="voided"${r?.voided?' checked':''}> Void this entry, retain history and exclude from actuals</label><p>Do not enter account/routing numbers or photographs of checks. Check the date, amount and existing entries to avoid duplicates.</p>`,async fd=>{
        const p=Object.fromEntries(fd);p.amount=fd.get('amount');p.cleared=fd.has('cleared');p.voided=fd.has('voided');p.bank_account_id=p.bank_account_id||null;
        await c.api('/api/register'+(r?'/'+r.id:''),{method:r?'PUT':'POST',body:JSON.stringify(p)});
        data=null;loading=false;await refresh(c);
      },{},'Save transaction');
      const form=document.querySelector('#community-editor form'),direction=form.elements.direction,category=form.elements.category_code;
      const bankField=document.createElement('label');bankField.innerHTML=`Bank account for reconciliation<select name="bank_account_id"><option value="">Unassigned · review before bank reconciliation</option>${(data.bank_accounts||[]).map(a=>`<option value="${a.id}"${r?.bank_account_id===a.id?' selected':''}>${esc(a.label+(a.last_four?' · ending '+a.last_four:''))}</option>`).join('')}</select>`;form.querySelector('[type=submit]').before(bankField);
      const update=()=>{category.innerHTML=data.categories.filter(x=>x.direction===direction.value).map(x=>`<option value="${x.code}">${esc(x.label)}</option>`).join('');if(r&&data.categories.find(x=>x.code===r.category_code)?.direction===direction.value)category.value=r.category_code;};
      direction.onchange=update;update();
    }
    click('finance-add',()=>edit());
    root.querySelectorAll('[data-register-edit]').forEach(b=>b.onclick=()=>edit(data.rows.find(r=>r.id===b.dataset.registerEdit)));
    click('finance-budget',()=>{
      if(!data)return;
      c.formDialog('Set annual budget category',`<p>Calendar year: ${year}. This labels a planning amount; it does not adopt a budget or authorize spending.</p><label>Category<select name="category_code">${data.categories.map(x=>`<option value="${x.code}">${esc(x.label+' · '+x.direction)}</option>`).join('')}</select></label><label>Annual planned amount ($)<input name="amount" type="number" min="0" max="9999999999.99" step=".01" required></label><label>Budget status<select name="basis"><option value="draft">Draft / planning only</option><option value="adopted">Adopted (cite actual approval)</option></select></label><label>Budget / minutes reference<textarea name="source_note" maxlength="2000"></textarea></label>`,async fd=>{
        await c.api('/api/category-budgets/'+year,{method:'PUT',body:JSON.stringify(Object.fromEntries(fd))});data=null;loading=false;await refresh(c);
      },{},'Save budget line');
    });
    if(!data&&!loading&&!error)refresh(c);
  }
  document.addEventListener('hba-account-change',e=>{
    if(!e.detail.board||e.detail.member?.id!==memberId){++epoch;data=null;loading=false;error='';memberId=e.detail.member?.id||'';}
  });
  setInterval(()=>{if(lastContext&&document.querySelector('#community-dialog[open] #finance-content')&&!document.querySelector('#community-editor[open]'))refresh(lastContext);},30000);
  window.HBAFinance={render,bind};
})();
