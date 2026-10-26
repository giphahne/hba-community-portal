(() => {
  const sections=new Set(['','basics','seasons','beach','old','timeline','wind','jetty','fix','science']);
  const embedded=window.parent!==window;
  const context=document.createElement('section');context.className='learning-context';context.setAttribute('aria-label','Learning app context');
  context.innerHTML='<button type="button" id="learning-return">Return to property research map</button><p>Sand School, now <strong>How to Save Our Beach</strong>. Imported from your October 12 learning-app checkpoint. Estimates and demonstration layouts are not surveyed predictions, verified property rights or approved construction designs.</p>';
  document.body.prepend(context);
  document.getElementById('learning-return').onclick=()=>{
    if(embedded)window.parent.postMessage({type:'sand-school-close'},'*');
    else location.href='../index.html';
  };
  window.addEventListener('message',event=>{
    if(!embedded||event.source!==window.parent||!event.data)return;
    const d=event.data;
    if(d.type==='sand-school-jump'&&sections.has(d.section)){
      if(!d.section)window.scrollTo({top:0,behavior:'instant'});
      else document.getElementById(d.section)?.scrollIntoView({behavior:'instant',block:'start'});
    }
    if(d.type==='sand-school-theme'&&['light','dark'].includes(d.theme)&&document.documentElement.dataset.theme!==d.theme)document.getElementById('themeBtn')?.click();
  });
  document.addEventListener('keydown',event=>{
    if(embedded&&event.key==='Escape'){
      event.preventDefault();window.parent.postMessage({type:'sand-school-close'},'*');
    }
  });
  if(embedded)window.parent.postMessage({type:'sand-school-ready'},'*');
})();
