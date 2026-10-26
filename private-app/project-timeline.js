(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=x=>Number(x).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
  const defaults=()=>({start:2027,horizon:15,baseYear:2026,opening:53292.78,floor:40000,households:105,dues:500,duesGrowth:0,operating:32195,operatingGrowth:3,events:1605.30,inflation:3,sandEnabled:true,sand:16000,sandEvery:2,cleanEnabled:false,cleanAmount:0,cleanStart:2027,cleanYears:3,onceEnabled:false,onceAmount:1000,onceHouseholds:105,onceYear:2027});
  const projectDefaults=()=>[
    {id:'reynolds',title:'Reynolds overlay',cost:22100,cont:20,enabled:true,earliest:2027,original:2028},
    {id:'algelo',title:'Algelo overlay',cost:33600,cont:20,enabled:true,earliest:2027,original:2032},
    {id:'drainage',title:'Worrall drainage',cost:30000,cont:0,enabled:true,earliest:2027,original:2036},
    {id:'worrall',title:'Worrall overlay',cost:34600,cont:20,enabled:true,earliest:2027,original:2036},
    {id:'jetty',title:'One jetty',cost:100000,cont:0,enabled:true,earliest:2027,original:2031}
  ];
  let settings=defaults(),projects=projectDefaults(),source='Current-dues scenario: $500 is the announced 2026 newsletter dues amount. Household count, opening project capital, operating costs, event net and project costs are inherited planning assumptions, not verified live balances or adopted future budgets.',bids=[],loaded=false,epoch=0;
  function cents(n){return Math.round(Number(n)*100);}
  function calculate(s,items){
    const waiting=items.filter(p=>p.enabled).map(p=>({...p})),funded=[],rows=[];
    let cash=cents(s.opening),minimum=cash;
    for(let i=0;i<s.horizon;i++){
      const year=s.start+i,opening=cash,dues=cents(s.dues*Math.pow(1+s.duesGrowth/100,i)*s.households),
        events=cents(s.events),operating=cents(s.operating*Math.pow(1+s.operatingGrowth/100,year-s.baseYear)),
        sand=s.sandEnabled&&i%s.sandEvery===0?cents(s.sand*Math.pow(1+s.inflation/100,year-s.baseYear)):0,
        cleaning=s.cleanEnabled&&year>=s.cleanStart&&year<s.cleanStart+s.cleanYears?cents(s.cleanAmount):0,
        contribution=s.onceEnabled&&year===s.onceYear?cents(s.onceAmount)*s.onceHouseholds:0;
      cash+=dues+events+contribution-operating-sand-cleaning;
      const paid=[];
      while(waiting.length){
        const p=waiting[0];
        if(p.earliest>year||!Number.isFinite(p.cost)||p.cost<=0)break;
        const amount=cents(p.cost*(1+p.cont/100)*Math.pow(1+s.inflation/100,year-s.baseYear));
        if(cash-amount<cents(s.floor))break;
        waiting.shift();cash-=amount;const result={...p,year,amount:amount/100};funded.push(result);paid.push(result);
      }
      minimum=Math.min(minimum,cash);
      rows.push({year,opening:opening/100,dues:dues/100,events:events/100,operating:operating/100,sand:sand/100,cleaning:cleaning/100,contribution:contribution/100,paid,closing:cash/100});
    }
    return {rows,funded,waiting,minimum:minimum/100,closing:cash/100};
  }
  const number=(key,label,min=0,max=10000000,step='0.01')=>`<label>${label}<input type="number" data-tl="${key}" value="${settings[key]}" min="${min}" max="${max}" step="${step}" required></label>`;
  function render(){
    const host=document.getElementById('bb-timeline');if(!host)return;
    if(!window.HBACommunity?.isBoard()){host.innerHTML='<p>Board view is required for the affordability timeline.</p>';return;}
    const result=calculate(settings,projects);
    host.innerHTML=`<h3>When can we afford each project?</h3><p>Money sets the funding year instead of forcing a construction date. Select projects, set priority, and change the funding assumptions. This is a board-private annual planning model.</p>
      <div class="community-actions"><button type="button" id="tl-current">Current-dues path</button><button type="button" id="tl-simulator">Use current simulator inputs</button><button type="button" id="tl-bids">Load selected contractor bids</button><button type="button" id="tl-save">Download this scenario</button><button type="button" id="tl-report">Create report</button><button type="button" id="tl-presentation">Presentation view</button></div>
      <p id="tl-source" class="tl-source">${esc(source)}</p>
      <details open><summary>Money available each year</summary><form id="tl-form"><div class="tl-inputs">
      ${number('start','First planning year',2027,2100,1)}${number('horizon','Years to model',1,40,1)}
      ${number('opening','Opening project capital ($)')}${number('floor','Keep at least this much project cash ($)')}
      ${number('households','Expected paying households',0,1000,1)}${number('dues','Annual dues per paying household ($)')}
      ${number('duesGrowth','Annual dues increase (%)',0,25)}${number('operating','Annual operating base ($), in 2026 dollars')}
      ${number('operatingGrowth','Operating cost growth (%)',0,25)}${number('events','Annual net event proceeds ($)',-1000000)}
      ${number('inflation','Project / sand cost growth (%)',0,25)}
      </div><p>The existing simulator’s separate $15,000 emergency reserve is already excluded from opening project capital. The project-cash floor here is an additional cushion, not a new reserve deduction. All figures can be changed; zero is an assumption, not missing data.</p>
      <label class="tl-check"><input type="checkbox" data-tl="sandEnabled"${settings.sandEnabled?' checked':''}> Include recurring nourishment before discretionary projects</label><div class="tl-inputs">${number('sand','Nourishment allowance per cycle ($)')}${number('sandEvery','Cycle, every N years from first planning year',1,20,1)}</div>
      <label class="tl-check"><input type="checkbox" data-tl="cleanEnabled"${settings.cleanEnabled?' checked':''}> Add private cleaning allowance outside operating base (avoid double counting)</label><div class="tl-inputs">${number('cleanAmount','Cleaning per year ($)')}${number('cleanStart','First cleaning-contract year',2020,2100,1)}${number('cleanYears','Contract years; no automatic renewal',1,10,1)}</div>
      <label class="tl-check"><input type="checkbox" data-tl="onceEnabled"${settings.onceEnabled?' checked':''}> Include a proposed one-time resident contribution</label><div class="tl-inputs">${number('onceAmount','One-time amount per household ($)')}${number('onceHouseholds','Expected contributors',0,1000,1)}${number('onceYear','Collection year',2027,2100,1)}</div>
      <button type="submit">Update affordability timeline</button></form></details>
      <h3>Select projects and priority</h3><p>The queue is strict: a higher-priority project is funded first, and lower-priority projects wait behind it. Move an item down or turn it off to test a different path. Amounts include the contingency you set, then inflate from 2026.</p>
      <div class="tl-projects">${projects.map((p,i)=>`<article class="tl-project"><label class="tl-check"><input type="checkbox" data-tl-project="${p.id}"${p.enabled?' checked':''}><strong>${esc(p.title)}</strong></label><div class="tl-inputs"><label>2026 base cost ($)<input type="number" data-tl-cost="${p.id}" min="0" max="10000000" step="0.01" value="${p.cost}"></label><label>Contingency (%)<input type="number" data-tl-cont="${p.id}" min="0" max="100" step="0.01" value="${p.cont}"></label><label>Not before year<input type="number" data-tl-earliest="${p.id}" min="2027" max="2140" step="1" value="${p.earliest}"></label></div><p>Original scheduled-model target: ${p.original||'Not specified'}. ${esc(p.source||'Existing simulator estimate; not a current verified quote.')}</p>${bids.length?`<label>Use a selected proposal (explicit assignment)<select data-tl-bid="${p.id}"><option value="">Keep entered estimate</option>${bids.map(b=>`<option value="${b.id}">${esc(b.request_title)} · ${esc(b.contractor)} · ${money(b.amount)} · ${esc(b.tax_basis)}</option>`).join('')}</select></label>`:''}<div class="community-actions"><button type="button" data-tl-up="${p.id}"${i===0?' disabled':''}>Move earlier</button><button type="button" data-tl-down="${p.id}"${i===projects.length-1?' disabled':''}>Move later</button></div></article>`).join('')}</div>
      <h3>Money-driven funding timeline</h3><p role="status" id="tl-summary">${result.funded.length} of ${projects.filter(p=>p.enabled).length} selected projects funded within ${settings.start}–${settings.start+settings.horizon-1}. Ending project capital: ${money(result.closing)}.</p>
      ${result.minimum<settings.floor?'<p class="tl-alert">Operating and recurring costs push cash below the retained floor. Postponing projects alone does not repair this path; change income, operating costs or the recurring commitments.</p>':''}
      <ol class="tl-results">${projects.filter(p=>p.enabled).map(p=>{const r=result.funded.find(r=>r.id===p.id);return `<li><strong>${esc(p.title)}</strong><span>${r?'Funded in '+r.year+' · '+money(r.amount):p.cost<=0?'Cost required; queue blocked here':'Not funded within modeled period'}</span></li>`;}).join('')||'<li>No projects selected. Cash accumulation is still shown below.</li>'}</ol>
      <details><summary>Year-by-year cash flow</summary><div class="tl-table"><table><thead><tr><th>Year</th><th>Opening</th><th>Dues + event net</th><th>One-time support</th><th>Operating</th><th>Nourishment + cleaning</th><th>Projects funded</th><th>Closing</th></tr></thead><tbody>${result.rows.map(r=>`<tr><th>${r.year}</th><td>${money(r.opening)}</td><td>${money(r.dues+r.events)}</td><td>${money(r.contribution)}</td><td>${money(r.operating)}</td><td>${money(r.sand+r.cleaning)}</td><td>${r.paid.map(p=>esc(p.title)+' '+money(p.amount)).join('<br>')||'None'}</td><td>${money(r.closing)}</td></tr>`).join('')}</tbody></table></div></details>
      <p class="tl-source">Funding years are annual, end-of-year affordability estimates, not construction dates or approval. Revenue is assumed received before spending within the year; monthly cash timing is not modeled. No debt, interest, grants, storms, engineering, permitting, recurring new-project maintenance or work completion is assumed. One-time contributions are hypothetical and counted once; no bills or dues records are changed. Changing priority does not authorize a contract. Downloaded scenarios can contain confidential bid and cleaning prices.</p>`;
    bind(host);
  }
  function readInputs(host){
    for(const el of host.querySelectorAll('[data-tl]'))settings[el.dataset.tl]=el.type==='checkbox'?el.checked:Number(el.value);
  }
  function commitInputs(host){
    if(!host.querySelector('#tl-form').reportValidity())return false;
    for(const el of host.querySelectorAll('.tl-project input'))if(!el.reportValidity())return false;
    readInputs(host);
    for(const p of projects){
      p.enabled=host.querySelector('[data-tl-project="'+p.id+'"]').checked;
      for(const key of ['cost','cont','earliest'])p[key]=Number(host.querySelector('[data-tl-'+key+'="'+p.id+'"]').value);
    }
    return true;
  }
  function bind(host){
    host.querySelector('#tl-form').onsubmit=e=>{e.preventDefault();if(!commitInputs(host))return;render();};
    for(const type of ['cost','cont','earliest','project'])host.querySelectorAll('[data-tl-'+type+']').forEach(el=>el.onchange=()=>{
      if(!commitInputs(host))return;const p=projects.find(p=>p.id===el.dataset['tl'+type[0].toUpperCase()+type.slice(1)]);
      p[type==='project'?'enabled':type]=type==='project'?el.checked:Number(el.value);
      if(type==='project')render();
    });
    for(const direction of ['up','down'])host.querySelectorAll('[data-tl-'+direction+']').forEach(el=>el.onclick=()=>{
      if(!commitInputs(host))return;const i=projects.findIndex(p=>p.id===el.dataset['tl'+(direction==='up'?'Up':'Down')]),j=i+(direction==='up'?-1:1);
      [projects[i],projects[j]]=[projects[j],projects[i]];render();
    });
    host.querySelector('#tl-current').onclick=()=>{settings=defaults();projects=projectDefaults();source='Current-dues path: $500 announced in the March 2026 newsletter; no future dues increases assumed. All other starting figures are inherited simulator assumptions and remain editable, not live bank balances.';render();};
    host.querySelector('#tl-simulator').onclick=()=>{
      const current=document.getElementById('bb-frame')?.contentWindow?.HBACapitalScenario?.();
      if(!current){host.querySelector('#tl-source').textContent='Open Budget simulator first and wait for it to load, then retry.';return;}
      const c=current.cap,b=current.base;settings={...defaults(),dues:c.dues,households:c.hh,duesGrowth:c.esc*100,operatingGrowth:c.esc*100,inflation:c.esc*100,
        onceEnabled:c.onceEnabled,onceAmount:c.onceAmount,onceYear:c.onceYear,onceHouseholds:c.onceHH,cleanEnabled:c.cleanEnabled,
        cleanAmount:c.cleanBasis==='total'?c.cleanAmount/3:c.cleanAmount,cleanStart:c.cleanYear};
      projects=projectDefaults();projects.find(p=>p.id==='worrall').cost=c.option==='A'?b.wMill:b.wOverlay;
      projects.find(p=>p.id==='worrall').title=c.option==='A'?'Worrall mill + pave':'Worrall overlay';
      projects.find(p=>p.id==='drainage').enabled=c.option==='A'||c.drainB;
      source='Copied the currently displayed simulator inputs. Recommended or preset dues remain a scenario, not adopted dues. Paving fundraising shares are intentionally not copied: only the explicitly entered one-time contribution is counted here, so the same resident money is not counted twice.';render();
    };
    host.querySelector('#tl-bids').onclick=async()=>{
      const own=++epoch;try{const d=await window.HBACommunity.api('/api/community');if(own!==epoch||!window.HBACommunity.isBoard())return;
        bids=d.bids.filter(b=>b.state==='selected').map(b=>({...b,request_title:d.bid_requests.find(r=>r.id===b.request_id)?.title||'Project'}));loaded=true;
        source=bids.length?'Selected proposals loaded. Assign each to the correct project explicitly, check taxes/exclusions and edit the contingency. A selected quote is not a signed contract.':'No selected contractor proposals are available. Existing estimates are unchanged.';render();
      }catch(e){host.querySelector('#tl-source').textContent='Bid costs were not loaded: '+e.message;}
    };
    host.querySelectorAll('[data-tl-bid]').forEach(el=>el.onchange=()=>{
      const b=bids.find(b=>b.id===el.value);if(!b||!commitInputs(host))return;
      const p=projects.find(p=>p.id===el.dataset.tlBid);p.cost=Number(b.amount);
      p.source='Explicitly assigned proposal '+b.id+'; '+b.contractor+'; tax '+b.tax_basis+'. Check exclusions and quote validity. Contingency remains separate.';
      render();
    });
    host.querySelector('#tl-save').onclick=()=>{
      if(!commitInputs(host))return;const blob=new Blob([JSON.stringify({type:'HBA private affordability scenario',version:1,saved_at:new Date().toISOString(),settings,projects,source,results:calculate(settings,projects)},null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='HBA-private-project-affordability.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    for(const mode of ['report','presentation'])host.querySelector('#tl-'+mode).onclick=()=>{
      if(!window.HBACommunity?.isBoard()||!commitInputs(host))return;
      window.HBABudgetOutputs.openTimeline({settings,projects,source,results:calculate(settings,projects)},mode);
    };
  }
  document.addEventListener('hba-account-change',e=>{if(!e.detail.board){++epoch;settings=defaults();projects=projectDefaults();bids=[];loaded=false;render();}});
  window.HBAProjectTimeline={render,calculate};
})();
