/* Hamilton Beach Association — App map.
   One page that lists every button on the dashboard: where it lives, who sees it, what it opens, and which buttons
   open the same screen as another one. The administrator can hide any card or sub-button from residents; the choice
   is saved as a settings row (public_hidden_tools) and takes effect for everyone on the next dashboard refresh. */
(function(){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let dialog,filter='';

  // Friendly names for the screens a button opens, keyed by the function it calls.
  const SCREENS=[
    [/openHBASummer/,'Summer events sheet'],[/openHBAPoll/,'Event survey and polling'],[/openHBANewsletter/,'Newsletter reader'],[/openHBAHosting/,'Movie Night hosting form'],
    [/openHBATeam/,'Our team (officers and governors)'],[/openGovernorMessage/,'Message form to the board inbox'],
    [/openHBATownRules\('trash'\)/,'Town rules · Trash tab'],[/openHBATownRules/,'Town rules'],
    [/openHBATownHistory\('hamilton'\)/,'Town records · HBA cases tab'],[/openHBATownHistory\('jetties'\)/,'Town records · Jetties tab'],[/openHBATownHistory/,'Town records'],
    [/openHBADuesPlanner\('planner'\)/,'Dues planner · Planner tab'],[/openHBADuesPlanner\('pie'\)/,'Dues planner · What my dues buy tab'],[/openHBADuesPlanner/,'Dues planner'],
    [/openDuesRegistry/,'Board dues registry'],[/openBoardBudget/,'Detailed capital model'],[/openSandSchool/,'Sand School'],
    [/openHBAAppPractice/,'How to use the app'],[/openHBAPasswordChange/,'Change password form'],[/openHBAAppMap/,'App map (this page)'],
    [/openIslandHistory/,'Island history timeline'],[/openHBAStorms/,'Storms & hurricanes'],[/postcards-dialog/,'Historical postcards'],
    [/openNourishmentRecords/,'Beach permits & nourishment records'],[/openNourishmentGuide/,'Nourishment rules & guide'],
    [/showMap/,'The parcel map'],[/openResearchTools\('roads'\)/,'Research tools · Roads'],[/openResearchTools\('gaps'\)/,'Research tools · Gaps'],
    [/openPropertyHistory/,'Property report'],
    [/community\('(\w+)'\)/,m=>'Community screen · '+m[1]],[/openHBACommunity\('(\w+)'\)/,m=>'Community screen · '+m[1]]
  ];
  const VIEWS={volunteers:'Volunteer board',events:'Event photos',issues:'Problem reports',votes:'Votes',elections:'Elections',meetings:'Board meetings & minutes',governance:'Governance guide',documents:'Documents',research:'Ask our documents',payments:'Pay dues or donate',bids:'Contractor bids',finance:'Check register',bank:'Bank reconciliation',work:'Contractor work',account:'My account',sms:'Text updates',members:'Accounts',calendar:'Calendar',overview:'Overview'};
  function screenOf(t){
    if(t.run&&t.run.view)return 'Community screen · '+(VIEWS[t.run.view]||t.run.view);
    const src=t.run?t.run.toString():'';
    for(const [re,name] of SCREENS){const m=src.match(re);if(m)return typeof name==='function'?name(m):name;}
    return src?'Opens a screen':'No action';
  }
  // Two buttons "overlap" when they open the same screen. Tabs of one dialog count as the same screen
  // (Town rules, Town records, Dues planner, Research tools); different community views do not.
  const SAME_DIALOG=/^(Town rules|Town records|Dues planner|Research tools) · /;
  const screenKey=t=>{const n=screenOf(t);return SAME_DIALOG.test(n)?n.replace(/ · .*$/,''):n;};

  function rows(){
    const {groups,quick,panel}=window.HBACapabilities.inventory();
    const out=[];
    quick.forEach(q=>out.push({id:q.id,label:q.label,where:'Quick actions (top of the page)',who:'residents',kind:'shortcut',dup:'Shortcut to the card of the same name'}));
    panel.forEach(p=>out.push({id:p.id,label:p.label,where:p.where,who:'residents',kind:'shortcut',dup:'Shortcut to the card of the same name'}));
    groups.forEach(g=>g.tools.forEach(t=>{
      out.push({id:t.id,label:t.title,where:g.title,who:t.who,kind:t.cluster?'cluster':'card',screen:t.cluster?'Card with sub-buttons':screenOf(t),key:t.cluster?null:screenKey(t),tool:t});
      (t.sub||[]).forEach(x=>out.push({id:x.id,label:x.label,where:g.title+' › '+t.title,who:x.who||t.who,kind:'sub',screen:screenOf(x),key:screenKey(x),tool:x}));
    }));
    out.filter(r=>r.kind==='shortcut').forEach(r=>{const c=out.find(o=>o.id===r.id&&o.kind!=='shortcut');if(c)r.screen='The “'+c.label+'” card ('+c.where+')';});
    // mark overlaps
    const byKey={};out.forEach(r=>{if(r.key&&r.kind!=='shortcut')(byKey[r.key]=byKey[r.key]||[]).push(r);});
    out.forEach(r=>{if(r.key&&byKey[r.key].length>1)r.dup='Opens the same screen as '+byKey[r.key].filter(o=>o!==r).map(o=>'“'+o.label+'”').join(' and ');});
    return out;
  }
  const whoLabel={residents:'Everyone',board:'Board only',admin:'Administrator only'};

  function html(){
    const all=rows(),hidden=new Set(window.HBACapabilities.hidden()),admin=window.HBACapabilities.isAdmin();
    const q=filter.trim().toLowerCase();
    const list=all.filter(r=>!q||(r.label+' '+r.where+' '+(r.screen||'')+' '+(r.dup||'')).toLowerCase().includes(q));
    const cards=all.filter(r=>r.kind==='card'||r.kind==='cluster'),subs=all.filter(r=>r.kind==='sub'),dups=all.filter(r=>r.dup&&r.kind!=='shortcut');
    const groupsSeen=[];list.forEach(r=>{const g=r.where.split(' › ')[0];if(!groupsSeen.includes(g))groupsSeen.push(g);});
    return `<div class="am-head"><div><p class="community-eyebrow">Help & my account</p><h2 id="app-map-title">App map</h2>
        <p class="am-lede">${cards.length} cards and ${subs.length} sub-buttons across ${window.HBACapabilities.inventory().groups.length} sections, plus ${all.filter(r=>r.kind==='shortcut').length} shortcuts. ${dups.length} buttons open a screen that another button also opens. ${hidden.size?hidden.size+' hidden from residents.':'Nothing is hidden yet.'}</p></div>
        <div class="am-actions"><button type="button" class="community-ghost" id="am-print">Print</button><button type="button" class="community-ghost" data-am-close>Dashboard</button></div></div>
      <label class="am-filter"><span>Find a button</span><input id="am-filter" type="search" value="${esc(filter)}" placeholder="Try dues, minutes, map or hidden"></label>
      ${admin?'<p class="am-note">Tick <strong>Hide from residents</strong> to take a button off the residents’ dashboard. You and the board keep seeing it, tagged “Hidden from residents”. Untick to bring it back. Nothing is deleted.</p>':'<p class="am-note">Only the administrator can hide a button. Board members see this page for reference.</p>'}
      ${groupsSeen.map(g=>`<section class="am-group"><h3>${esc(g)}</h3><table class="am-table"><thead><tr><th>Button</th><th>Who sees it</th><th>What it opens</th><th>Overlap</th>${admin?'<th>Hide</th>':''}</tr></thead><tbody>
        ${list.filter(r=>r.where.split(' › ')[0]===g).map(r=>`<tr class="am-${r.kind}${hidden.has(r.id)?' am-hidden':''}"><td><span class="am-label">${r.kind==='sub'?'↳ ':''}${esc(r.label)}</span>${r.kind==='sub'?`<small>in ${esc(r.where.split(' › ')[1]||'')}</small>`:r.kind==='shortcut'?'<small>shortcut</small>':''}${hidden.has(r.id)?'<small class="am-hid">hidden from residents</small>':''}</td>
          <td>${esc(whoLabel[r.who]||r.who)}</td><td>${esc(r.screen||'')}</td><td>${r.dup?`<span class="am-dup">${esc(r.dup)}</span>`:''}</td>
          ${admin?`<td>${r.kind==='shortcut'?'<small>follows the card</small>':`<label class="am-check"><input type="checkbox" data-am-hide="${r.id}" ${hidden.has(r.id)?'checked':''}><span>Hide from residents</span></label>`}</td>`:''}</tr>`).join('')}
      </tbody></table></section>`).join('')}
      <p class="am-status" id="am-status" aria-live="polite"></p>`;
  }
  function render(){dialog.querySelector('.am-body').innerHTML=html();}
  function ensure(){
    if(dialog)return dialog;
    dialog=document.createElement('dialog');dialog.id='app-map-dialog';dialog.className='community-dialog app-map';dialog.setAttribute('aria-labelledby','app-map-title');
    dialog.innerHTML='<div class="am-body"></div>';document.body.append(dialog);
    dialog.addEventListener('click',async e=>{
      if(e.target.closest('[data-am-close]')){dialog.close();return;}
      if(e.target.id==='am-print'){window.print();return;}
    });
    dialog.addEventListener('input',e=>{if(e.target.id==='am-filter'){filter=e.target.value;const pos=e.target.selectionStart;render();const f=dialog.querySelector('#am-filter');f.focus();f.setSelectionRange(pos,pos);}});
    dialog.addEventListener('change',async e=>{
      const box=e.target.closest('[data-am-hide]');if(!box)return;
      const hidden=new Set(window.HBACapabilities.hidden());box.checked?hidden.add(box.dataset.amHide):hidden.delete(box.dataset.amHide);
      const st=dialog.querySelector('#am-status');st.textContent='Saving…';
      try{await window.HBACapabilities.setHidden([...hidden]);st.textContent=box.checked?'Hidden from residents. It stays on your dashboard with a tag.':'Shown to residents again.';render();}
      catch(err){st.textContent='Could not save: '+err.message;box.checked=!box.checked;}
    });
    return dialog;
  }
  window.openHBAAppMap=function(){ensure();render();dialog.showModal();dialog.scrollTop=0;};
})();
