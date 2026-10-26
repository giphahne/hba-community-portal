/* Tool dialogs scroll as one page (see whole-scroll.css). Once the heading has scrolled out of view,
   a floating pair of buttons offers "Top" and "Back to dashboard". */
(function(){
  'use strict';
  const IDS=['community-dialog','team-dialog','summer-dialog','town-history-dialog','rules-dialog','storms-dialog',
    'hosting-dialog','poll-dialog','nourishment-guide-dialog','budget-output-dialog','nourishment-dialog','research-dialog','volunteer-public'];
  const SHOW_AFTER=140;
  const made=new WeakMap();
  function closeButton(dlg){
    return dlg.querySelector('button[id$="-close"]')||[...dlg.querySelectorAll('header button')].find(b=>/dashboard|back|close/i.test(b.textContent))||null;
  }
  function ensure(dlg){
    let wrap=made.get(dlg);
    if(wrap){if(!wrap.isConnected)dlg.append(wrap);return wrap;}
    wrap=document.createElement('div');wrap.className='ws-back';wrap.setAttribute('role','group');wrap.setAttribute('aria-label','Page shortcuts');
    const top=document.createElement('button');top.type='button';top.className='ws-top';top.textContent='Top';
    top.onclick=()=>{dlg.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};
    const back=document.createElement('button');back.type='button';back.className='ws-close';back.textContent='Back to dashboard';
    back.onclick=()=>{const b=closeButton(dlg);if(b)b.click();else dlg.close();
      // Any dialog still open underneath (for example the records behind a guide) is closed too, so "dashboard" means the dashboard.
      document.querySelectorAll('dialog[open]').forEach(d=>{try{d.close();}catch{}});};
    wrap.append(top,back);dlg.append(wrap);made.set(dlg,wrap);
    return wrap;
  }
  function update(dlg){
    if(!dlg.open){const w=made.get(dlg);if(w)w.classList.remove('is-on');return;}
    const on=dlg.scrollTop>SHOW_AFTER;
    const w=ensure(dlg);
    w.classList.toggle('is-on',on);
  }
  document.addEventListener('scroll',e=>{const t=e.target;if(t&&t.nodeType===1&&t.tagName==='DIALOG'&&IDS.includes(t.id))update(t);},true);
  document.addEventListener('close',e=>{const t=e.target;if(t&&t.tagName==='DIALOG'&&IDS.includes(t.id)){t.scrollTop=0;update(t);}},true);
})();
