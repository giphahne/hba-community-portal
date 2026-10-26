/* Hamilton Beach Association — alerts for the administrator. Nothing is cached here; the worker only shows
   notifications sent by the association's own server and brings the site back when one is tapped. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{};}catch{d={body:e.data?e.data.text():''};}
  const title=d.title||'Hamilton Beach Association';
  e.waitUntil(self.registration.showNotification(title,{
    body:d.body||'A new request is waiting in the member app.',
    icon:'/icons/icon-192.png',badge:'/icons/badge-96.png',
    tag:d.kind?'hba-'+d.kind:'hba',renotify:true,
    data:{url:d.url||'/',kind:d.kind||'',at:d.at||''}
  }));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const target=new URL(e.notification.data?.url||'/',self.location.origin).href;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    const open=list.find(c=>c.url.startsWith(self.location.origin));
    if(open){return open.focus().then(c=>c&&'navigate' in c&&c.url!==target?c.navigate(target):c);}
    return self.clients.openWindow(target);
  }));
});
