(() => {
  'use strict';
  // Hosted copies send X-Frame-Options: DENY on every response, so private pages cannot be framed by URL.
  // Fetch the page (same session) and render it through srcdoc with a <base> so relative assets still resolve.
  window.hbaLoadFrame=async function(frame,url){
    const abs=new URL(url,document.baseURI).href;
    const r=await fetch(abs,{cache:'no-store'});
    if(!r.ok){let d={};try{d=await r.json();}catch{}throw Error(d.detail||('The page could not be loaded ('+r.status+').'));}
    const html=await r.text(),dir=abs.slice(0,abs.lastIndexOf('/')+1);
    frame.removeAttribute('src');
    frame.srcdoc=/<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,m=>m+'<base href="'+dir+'">'):'<base href="'+dir+'">'+html;
  };
  let locked=false,seenMember=false;
  const root=window.__HBA_API_ROOT__,approved=s=>s?.signed_in&&['resident','board','admin'].includes(s.member?.role);
  function lock(){
    if(locked)return;locked=true;
    window.parent.postMessage({type:'hba-session-ended'},'*');
    document.body.replaceChildren();
    const box=document.createElement('main');box.style.cssText='padding:32px;font:18px/1.6 sans-serif;color:#173544;background:#f7f4eb;min-height:100vh';
    const h=document.createElement('h1');h.textContent='Please sign in again.';
    const p=document.createElement('p');p.textContent='Your session ended. HBA information is locked.';
    const a=document.createElement('a');a.textContent='Return to HBA sign-in';a.href='#';a.addEventListener('click',ev=>{ev.preventDefault();try{window.top.location.reload();}catch{window.location.reload();}});
    box.append(h,p,a);document.body.append(box);
  }
  document.addEventListener('hba-account-change',e=>{
    if(e.detail?.member&&['resident','board','admin'].includes(e.detail.member.role)){seenMember=true;return;}
    if(seenMember)setTimeout(lock,0);
  });
  async function check(){
    if(locked||document.hidden)return;
    try{
      const r=await fetch(root+'api/session',{cache:'no-store'});
      if(!r.ok||!approved(await r.json()))lock();else seenMember=true;
    }catch{lock();}
  }
  document.addEventListener('DOMContentLoaded',check,{once:true});
  setInterval(check,60000);
})();
