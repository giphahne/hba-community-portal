/* Own house only. A resident opens the full record (photo, assessor card, deeds, title timeline) for the house
   linked to their account. Every other house shows just the address and the street governor. The administrator
   sees everything. This wraps the property report and the map popups; nothing about the records themselves changes. */
(() => {
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const own=new Set();let role=null,homes=null,homesPromise=null;
  const member=()=>{try{return window.HBACommunity?.member||null;}catch{return null;}};
  const isAdmin=()=>role==='admin';
  async function refresh(){
    const m=member();role=m?.role||null;own.clear();
    if(m?.household_uid)own.add(m.household_uid);
    try{if(m&&['resident','board','admin'].includes(m.role)&&window.HBATeam?.load){await window.HBATeam.load();(window.HBATeam.data?.my_households||[]).forEach(h=>h.household_uid&&own.add(h.household_uid));}}catch{}
  }
  function index(){
    if(homes)return Promise.resolve(homes);
    return homesPromise||(homesPromise=fetch('dues-registry-data.json').then(r=>r.ok?r.json():{properties:[]}).then(x=>{homes=x;return x;}).catch(()=>({properties:[]})));
  }
  const byIndex=i=>homes?.properties?.find(p=>p.index===Number(i))||null;
  const ownsIndex=i=>{const p=byIndex(i);return !!p&&own.has(p.uid);};
  const allowed=i=>isAdmin()||ownsIndex(i);
  const ownIndexes=()=>(homes?.properties||[]).filter(p=>own.has(p.uid)).map(p=>p.index);
  // ---- Limited view: address and street governor only ------------------------------------------------
  let dialog;
  function limitedDialog(address){
    if(!dialog){dialog=document.createElement('dialog');dialog.id='house-limited-dialog';dialog.className='hp-dialog';dialog.setAttribute('aria-labelledby','hp-title');document.body.append(dialog);
      dialog.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.hpClose!==undefined)dialog.close();else if(b.dataset.hpMessage!==undefined){dialog.close();window.openGovernorMessage?.(b.dataset.hpMessage?{position:b.dataset.hpMessage}:undefined);}else if(b.dataset.hpTeam!==undefined){dialog.close();window.openHBATeam?.();}else if(b.dataset.hpMine!==undefined){dialog.close();const mine=ownIndexes();if(mine.length)window.openPropertyHistory(mine[0]);}});}
    const mine=ownIndexes();
    dialog.innerHTML=`<div class="hp-shell"><p class="hp-eyebrow">Property</p><h2 id="hp-title">${esc(prettyAddress(address)||'This house')}</h2><div id="hp-governor"><p>Looking up the street governor…</p></div>
      <p class="hp-note">${member()?`Deeds, photos and household records are shown only to the household that lives at an address and to the administrator.${mine.length?'':' Your account is not linked to a house yet; ask the board to link it.'}`:'Sign in to see your own house record.'}</p>
      <div class="hp-actions">${mine.length?'<button type="button" class="hp-primary" data-hp-mine>Open my own house record</button>':''}<button type="button" data-hp-close>Close</button></div></div>`;
    if(!dialog.open)dialog.showModal();
    governorHTML(address).then(html=>{const g=dialog.querySelector('#hp-governor');if(g)g.innerHTML=html;});
  }
  const prettyAddress=a=>window.HBATeam?.prettyAddress?window.HBATeam.prettyAddress(a):String(a||'').toLowerCase().replace(/(^|\s)\S/g,c=>c.toUpperCase());
  async function governorHTML(address){
    const T=window.HBATeam;if(!T||!address)return '<p>Street governor: sign in to see who represents this street.</p>';
    try{
      await T.load();const g=T.governorForAddress(address);
      if(g.represented&&g.holder)return `<h3>Street governor</h3><p class="hp-gov">${esc(g.holder.member_name)}<span> · ${esc(g.position.replace(' Street Governor',' Avenue Governor'))}${g.holder.address?' · '+esc(T.prettyAddress(g.holder.address)):''}</span></p><div class="hp-actions"><button type="button" data-hp-message="${esc(g.position)}">Message ${esc(g.holder.member_name.split(' ')[0])}</button><button type="button" data-hp-team>Contact our team</button></div>`;
      if(g.represented)return `<h3>Street governor</h3><p>${esc(g.position)}: seat currently vacant.</p><div class="hp-actions"><button type="button" data-hp-team>Contact our team</button></div>`;
      return `<h3>Street governor</h3><p>This street is outside the association’s current membership area.</p><div class="hp-actions"><button type="button" data-hp-team>Contact our team</button></div>`;
    }catch(e){return `<p>${esc(/sign in/i.test(e.message)?'Sign in as an approved resident to see who represents this street.':e.message)}</p>`;}
  }
  // ---- Wrap the property report -----------------------------------------------------------------------
  function wrap(){
    const original=window.openPropertyHistory;if(!original||original.__hpWrapped)return;
    const guarded=async function(i,options={}){
      await index();if(!role)await refresh();
      if(isAdmin())return original(i,options);
      const n=Number(i);
      if(ownsIndex(n))return original(n,options);
      const mine=ownIndexes();
      // The generic "browse" entry (index 178) opens the resident's own house instead of the full list.
      if(n===178&&mine.length)return original(mine[0],options);
      limitedDialog(byIndex(n)?.address||'');
    };
    guarded.__hpWrapped=true;window.openPropertyHistory=guarded;
  }
  // ---- Map popups ---------------------------------------------------------------------------------------
  function hookMap(){
    const m=window.map;if(!m||m.__hpHooked||!m.on)return;m.__hpHooked=true;
    m.on('popupopen',async e=>{
      const src=e.popup?._source,p=src?.feature?.properties;if(!p||p.audit_index===undefined)return;
      await index();if(!role)await refresh();
      if(allowed(p.audit_index)||p.cls==='beach')return;
      const addr=p.addr||byIndex(p.audit_index)?.address||'';
      e.popup.setContent(`<div class="hp-popup"><b>${esc(prettyAddress(addr)||'(vacant / no address)')}</b><div class="hp-popup-gov">Looking up the street governor…</div><small>Deeds and photos are shown only to the household at this address and to the administrator.</small>${ownIndexes().length?`<button type="button" class="history-popup" data-hp-popup-mine>Open my own house record</button>`:''}</div>`);
      governorHTML(addr).then(html=>{const el=e.popup.getElement()?.querySelector('.hp-popup-gov');if(el)el.innerHTML=html.replace(/<h3>.*?<\/h3>/,'<b>Street governor</b><br>');});
      setTimeout(()=>{const el=e.popup.getElement();if(!el)return;el.querySelector('[data-hp-popup-mine]')?.addEventListener('click',()=>{m.closePopup();window.openPropertyHistory(ownIndexes()[0]);});el.querySelectorAll('[data-hp-message]').forEach(b=>b.onclick=()=>{m.closePopup();window.openGovernorMessage?.({position:b.dataset.hpMessage});});el.querySelectorAll('[data-hp-team]').forEach(b=>b.onclick=()=>{m.closePopup();window.openHBATeam?.();});},0);
    });
  }
  // The "Browse all property reports" button in the map panel is for the administrator.
  function browseButton(){const b=document.getElementById('home-browse-reports');if(b)b.hidden=!isAdmin();}
  document.addEventListener('hba-account-change',async()=>{await refresh();browseButton();});
  // popupAllowed: whether a parcel popup keeps its full content (the same test as the popupopen handler above).
  window.HBAHousePrivacy={isAdmin,allowed:i=>allowed(i),own:()=>[...own],ownIndexes,refresh,async popupAllowed(i){await index();if(!role)await refresh();return allowed(i);}};
  wrap();hookMap();index();refresh().then(browseButton);
  setTimeout(()=>{wrap();hookMap();},0);
  const panel=document.getElementById('panel');
  new MutationObserver(()=>browseButton()).observe(panel||document.body,{childList:true,subtree:true});
})();
