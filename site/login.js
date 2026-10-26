(() => {
  'use strict';
  // The sign-in page is never shown inside the member app's frame (e.g. after a session ends mid-load).
  if(window.top!==window){window.top.location.replace('/');return;}
  const $=id=>document.getElementById(id),form=$('login-form');
  const base='';// the backend serves this page, so the API is on the same origin
  let session=null,signup=false,busy=false,epoch=0,frame=null;
  const approved=s=>s?.signed_in&&['resident','board','admin'].includes(s.member?.role);
  const mustChange=s=>!!(s?.signed_in&&s.member?.must_change_password);
  function status(message,error=false){$('login-status').textContent=message;$('login-status').classList.toggle('error',error);}
  // ---- "Save my password on this device": the email is kept in this browser; the password goes to the device's own
  // password keeper through the Credential Management API where it exists (Chrome, Edge, Android), and through the
  // form's autocomplete hints everywhere else (Safari and iCloud Keychain). The app itself never stores the password.
  const SAVE_KEY='hba-save-login',EMAIL_KEY='hba-login-email',saveBox=$('save-password');
  // Kept in a first-party cookie for a year (the preview sandbox has no local storage; cookies work everywhere).
  const store=(k,v)=>{try{document.cookie=k+'='+(v===null?'; max-age=0':encodeURIComponent(v)+'; max-age=31536000')+'; path=/; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');}catch{}};
  const read=k=>{try{const m=document.cookie.match(new RegExp('(?:^|; )'+k+'=([^;]*)'));return m?decodeURIComponent(m[1]):null;}catch{return null;}};
  const credAPI=()=>'credentials' in navigator&&typeof window.PasswordCredential==='function';
  const within=(p,ms)=>Promise.race([p,new Promise(r=>setTimeout(()=>r(null),ms))]);
  saveBox.checked=read(SAVE_KEY)==='1';$('save-password-help').hidden=!saveBox.checked;
  if(saveBox.checked&&read(EMAIL_KEY))form.elements.email.value=read(EMAIL_KEY);
  saveBox.onchange=()=>{$('save-password-help').hidden=!saveBox.checked;if(!saveBox.checked){store(SAVE_KEY,null);store(EMAIL_KEY,null);if(credAPI())navigator.credentials.preventSilentAccess?.().catch(()=>{});}};
  async function rememberLogin(email,password){
    if(!saveBox.checked){store(SAVE_KEY,null);store(EMAIL_KEY,null);return;}
    store(SAVE_KEY,'1');store(EMAIL_KEY,email);
    if(credAPI()){try{await within(navigator.credentials.store(new PasswordCredential({id:email,password,name:email})),2500);}catch{}}
  }
  let autoTried=false;
  async function autoSignIn(){
    if(autoTried||busy||session?.signed_in||!saveBox.checked||!credAPI())return;autoTried=true;
    let cred=null;try{cred=await within(navigator.credentials.get({password:true,mediation:'optional'}),4000);}catch{}
    if(!cred||cred.type!=='password'||!cred.password)return;
    busy=true;++epoch;$('login-submit').disabled=true;status('Signing in as '+cred.id+'…');
    try{const result=await api('/api/auth/login',{email:cred.id,password:cred.password});session=result;show();status(approved(session)?'':'Your account must be approved before viewing any data.');}
    catch(err){form.elements.email.value=cred.id;status('Saved sign-in did not work: '+err.message+' Type your password to continue.',true);}
    finally{busy=false;$('login-submit').disabled=false;}
  }
  function conceal(){if(frame){frame.src='about:blank';frame.remove();frame=null;}$('app-screen').hidden=true;$('login-screen').hidden=false;document.body.classList.remove('portal-open');document.title='Sign in · Hamilton Beach Association';}
  function show(){
    $('forgot-help').hidden=true;
    if(mustChange(session)){
      conceal();form.hidden=true;$('pending-account').hidden=true;$('password-change').hidden=false;
      $('login-title').textContent='Choose a new password.';$('login-intro').textContent='Signed in as '+(session.member.email||'')+'.';
      return;
    }
    $('password-change').hidden=true;
    if(!signup){$('login-title').textContent='Welcome back.';$('login-intro').textContent='Sign in to view the map, island history and association information.';}
    if(approved(session)){
      $('login-screen').hidden=true;$('app-screen').hidden=false;document.body.classList.add('portal-open');
      document.title='Hamilton Beach Association';
      $('portal-role').textContent=session.member.role==='resident'?'Resident portal':'Board portal';
      const canSwitch=['board','admin'].includes(session.member.actual_role||session.member.role);
      $('portal-view-switch').hidden=!canSwitch;
      $('portal-board-view').setAttribute('aria-pressed',String(session.member.view_mode!=='resident'));
      $('portal-resident-view').setAttribute('aria-pressed',String(session.member.view_mode==='resident'));
      if(canSwitch&&session.member.view_mode==='resident')$('portal-role').textContent='Resident view preview';
      if(!frame){frame=document.createElement('iframe');frame.id='hba-private-app';frame.title='Hamilton Beach member app';frame.setAttribute('allow','clipboard-write');$('app-frame-slot').append(frame);loadApp(frame);}
      return;
    }
    conceal();form.hidden=!!session?.signed_in;$('pending-account').hidden=!session?.signed_in;
  }
  // Same origin as the backend, so the member app loads by URL; the session cookie authorizes it.
  function loadApp(target){target.src='/app/';}
  async function api(path,body){
    const r=await fetch(base+path,{cache:'no-store',method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(session?.proof?{'X-HBA-Proof':session.proof}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{};}catch{}
    if(r.status===503&&!raw)throw Error('This browser is still pointed at an older copy of the site, which can happen when the site has just been updated. Wait a few minutes and try again; if it continues, open the site in a different browser or from another network.');
    if(!r.ok)throw Error(d.detail||'The sign-in service is unavailable. Try again.');
    return d;
  }
  async function check(){
    if(busy)return;const own=++epoch;
    try{const next=await api('/api/session');if(own!==epoch)return;session=next;show();status(approved(session)?'':session.signed_in?'Your account is awaiting approval.':'');if(!session?.signed_in)autoSignIn();}
    catch(e){if(own===epoch){session=null;show();status(e.message,true);}}
  }
  let signupOptionsLoaded=false;
  async function loadSignupOptions(){
    if(signupOptionsLoaded)return;
    try{
      const d=await api('/api/auth/addresses');
      const select=form.elements.requested_household_uid;
      for(const a of d.addresses){const o=document.createElement('option');o.value=a.uid;o.textContent=a.address;select.append(o);}
      $('sms-topic-menu').innerHTML=d.sms_topics.map(t=>`<label><input type="checkbox" name="sms_topics" value="${t.value}"> ${t.label}</label>`).join('');
      signupOptionsLoaded=true;
    }catch(e){status('Address list unavailable right now; you can still request an account and describe your address in the note. '+e.message,true);}
  }
  function signupBody(fd){
    const body={email:fd.get('email'),password:fd.get('password'),display_name:fd.get('display_name')||'',requested_household_uid:fd.get('requested_household_uid')||'',request_note:fd.get('request_note')||'',sms_phone:fd.get('sms_phone')||'',sms_topics:fd.getAll('sms_topics'),sms_consent:fd.get('sms_consent')==='yes'};
    if(body.sms_phone&&!body.sms_topics.length)throw Error('Choose at least one text alert topic, or clear the mobile number.');
    if(body.sms_phone&&!body.sms_consent)throw Error('Tick the consent box to request text alerts, or clear the mobile number.');
    return body;
  }
  form.onsubmit=async e=>{
    e.preventDefault();if(busy||!form.reportValidity())return;
    busy=true;++epoch;$('login-submit').disabled=true;$('login-mode').disabled=true;
    status(signup?'Requesting your account…':'Signing in…');
    const submitLabel=$('login-submit').textContent;$('login-submit').textContent=signup?'Sending your request…':'Signing in…';
    try{
      const fd=new FormData(form);
      const body=signup?signupBody(fd):{email:fd.get('email'),password:fd.get('password')};
      const result=await api('/api/auth/'+(signup?'signup':'login'),body);
      if(!signup)await rememberLogin(body.email,body.password);
      form.elements.password.value='';$('show-password').checked=false;form.elements.password.type='password';
      if(signup){requestSent(body);return;}
      session=result;show();status(approved(session)?'':'Your account must be approved before viewing any data.');
    }catch(err){form.elements.password.value='';status(err.message,true);}
    finally{busy=false;$('login-submit').disabled=false;$('login-mode').disabled=false;
      if(/…$/.test($('login-submit').textContent))$('login-submit').textContent=submitLabel;}
  };
  $('login-mode').onclick=()=>{
    signup=!signup;$('signup-name').hidden=!signup;$('signup-fields').hidden=!signup;$('signup-sms').hidden=!signup;form.elements.display_name.required=signup;$('save-password-row').hidden=signup;$('save-password-help').hidden=signup||!saveBox.checked;
    if(signup)loadSignupOptions();
    form.elements.password.autocomplete=signup?'new-password':'current-password';
    $('login-title').textContent=signup?'Request access.':'Welcome back.';
    $('login-intro').textContent=signup?'Three steps: create your account, confirm your email, then a board member approves the request and links your household. No HBA information opens before approval.':'Sign in to view the map, island history and association information.';
    $('login-submit').textContent=signup?'Request an account':'Sign in';
    $('login-mode').textContent=signup?'Already registered? Sign in':'New resident? Request an account';
    status('');
  };
  // A clear "request sent" page replaces the form, so nobody is left wondering whether the request went through.
  function requestSent(body){
    for(const name of ['password','display_name','request_note','sms_phone'])form.elements[name].value='';
    form.elements.requested_household_uid.selectedIndex=0;form.elements.sms_consent.checked=false;
    form.querySelectorAll('input[name=sms_topics]').forEach(i=>i.checked=false);
    form.hidden=true;status('');
    $('login-title').textContent='Request sent.';$('login-intro').textContent='';
    $('signup-done-email').textContent=body.email;$('signup-done-sms').hidden=!body.sms_phone;
    const done=$('signup-done');done.hidden=false;
    $('login-title').scrollIntoView({block:'start'});done.focus({preventScroll:true});
  }
  $('signup-done-signin').onclick=()=>{
    $('signup-done').hidden=true;form.hidden=false;
    if(signup)$('login-mode').onclick();
    form.elements.password.focus();
  };
  $('show-password').onchange=e=>form.elements.password.type=e.target.checked?'text':'password';
  $('login-forgot').onclick=()=>{form.hidden=true;$('forgot-help').hidden=false;status('');};
  $('forgot-close').onclick=()=>{$('forgot-help').hidden=true;form.hidden=false;form.elements.email.focus();};
  const pw=$('password-change');
  $('show-new-passwords').onchange=e=>pw.querySelectorAll('input[name$=password]').forEach(i=>i.type=e.target.checked?'text':'password');
  pw.onsubmit=async e=>{
    e.preventDefault();if(busy||!pw.reportValidity())return;
    const fd=new FormData(pw);
    if(fd.get('new_password')!==fd.get('repeat_password')){status('The two new passwords do not match. Type the same new password in both boxes.',true);return;}
    busy=true;++epoch;$('password-change-submit').disabled=true;status('Saving your new password…');
    try{
      await api('/api/account/password',{current_password:fd.get('current_password'),new_password:fd.get('new_password')});
      pw.reset();$('show-new-passwords').checked=false;pw.querySelectorAll('input[name$=password]').forEach(i=>i.type='password');
      busy=false;session=await api('/api/session');show();status(approved(session)?'Your new password is saved.':'Your new password is saved. Your account is awaiting approval.');
    }catch(err){status(err.message,true);}
    finally{busy=false;$('password-change-submit').disabled=false;}
  };
  $('password-change-signout').onclick=logout;
  async function logout(){
    if(busy)return;busy=true;++epoch;conceal();$('portal-signout').disabled=true;$('login-submit').disabled=true;status('Signing out…');
    try{await api('/api/logout',{});session=null;autoTried=true;if(credAPI())navigator.credentials.preventSilentAccess?.().catch(()=>{});show();status('You are signed out.');}
    catch(e){session=null;show();status('Sign-out could not be confirmed. Close this window and try signing in again. '+e.message,true);}
    finally{busy=false;$('portal-signout').disabled=false;$('login-submit').disabled=false;}
  }
  $('portal-signout').onclick=logout;$('pending-signout').onclick=logout;$('login-refresh').onclick=check;
  async function changeView(mode){
    if(busy)return;busy=true;++epoch;conceal();$('login-submit').disabled=true;status('Switching to '+mode+' view…');
    try{await api('/api/view-mode',{mode});session=await api('/api/session');show();status('');}
    catch(e){session=null;show();status('Could not change view. '+e.message,true);}
    finally{busy=false;$('login-submit').disabled=false;}
  }
  $('portal-board-view').onclick=()=>changeView('board');
  $('portal-resident-view').onclick=()=>changeView('resident');
  window.addEventListener('message',e=>{
    if(e.source!==frame?.contentWindow||e.data?.type!=='hba-session-ended')return;
    ++epoch;session=null;show();status('Your session ended. Sign in to continue.');
  });
  // ---- Administrator alerts (Web Push). The member app runs in a same-origin frame and calls these helpers so the
  // service worker is registered at the site root, where notification clicks can bring this page back.
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const b64=k=>{const pad='='.repeat((4-k.length%4)%4),raw=atob((k+pad).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));};
  async function swReg(){
    if(!('serviceWorker' in navigator))throw Error('This browser cannot receive alerts.');
    const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
    await navigator.serviceWorker.ready;return reg;
  }
  window.HBAGatePush={
    supported:()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window,
    ios,standalone,
    needsHomeScreen:()=>ios&&!standalone,
    async status(){
      if(!this.supported())return {permission:'unsupported',subscribed:false,endpoint:null};
      try{const reg=await navigator.serviceWorker.getRegistration('/');const sub=reg?await reg.pushManager.getSubscription():null;
        return {permission:Notification.permission,subscribed:!!sub,endpoint:sub?.endpoint||null};}
      catch(e){return {permission:Notification.permission,subscribed:false,endpoint:null,error:e.message};}
    },
    async enable(label){
      if(!this.supported())throw Error(ios?'On an iPhone or iPad, first add this page to your Home Screen (Share → Add to Home Screen), open it from there, then turn alerts on.':'This browser cannot receive alerts. Try Chrome, Edge, Firefox or Safari.');
      if(this.needsHomeScreen())throw Error('On an iPhone or iPad, alerts only work after you add this page to your Home Screen: tap Share, then “Add to Home Screen”, open it from there and turn alerts on.');
      const info=await api('/api/push');
      if(!info.allowed)throw Error('Only the administrator account can receive these alerts.');
      const permission=await Notification.requestPermission();
      if(permission!=='granted')throw Error(permission==='denied'?'Alerts are blocked for this site in the browser settings. Allow notifications for this site, then try again.':'Alerts were not allowed.');
      const reg=await swReg();
      let sub=await reg.pushManager.getSubscription();
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(info.public_key)});
      const j=sub.toJSON();
      await api('/api/push/subscribe',{endpoint:j.endpoint,keys:j.keys,label:label||''});
      return {subscribed:true,endpoint:j.endpoint};
    },
    async disable(){
      const reg=await navigator.serviceWorker?.getRegistration('/');const sub=reg?await reg.pushManager.getSubscription():null;
      if(sub){try{await api('/api/push/unsubscribe',{endpoint:sub.endpoint});}catch{}await sub.unsubscribe();}
      return {subscribed:false};
    },
    test:()=>api('/api/push/test',{})
  };
  setInterval(()=>{if(!document.hidden&&approved(session))check();},60000);
  window.addEventListener('pageshow',check);
  check();
})();
