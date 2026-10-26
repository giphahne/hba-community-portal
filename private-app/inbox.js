/* Messages center: an Inbox of messages to this member (and to all residents or the board), plus a
   separate "What's new" list of things published or reported. Calendar items are never listed here;
   the calendar and the Coming up panel carry those. */
(()=>{
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let host=null,items=null,messages=null,ready=true,readyNote='',error='',busy=false,loadedFor=null,showAll=false,lastAt=0,tab='inbox';
  const KINDS={newsletter:'Newsletter',minutes:'Minutes',vote:'Vote',volunteer:'Volunteers',photo:'Photograph',storm:'Storm memory',story:'Household story',work:'Contractor work',
    'issue-reply':'Your report','message-reply':'Your message','payment-reply':'Your payment',account:'Account request',issue:'Problem report',message:'Message',payment:'Payment report',bid:'Contractor bid',
    notice:'Notice',approval:'Approved',reply:'Reply',poll:'Poll',event:'Event',host:'Hosting offer'};
  const member=()=>window.HBACommunity?.member||null;
  const isBoard=()=>!!window.HBACommunity?.isBoard?.();
  const readKey=()=>'hba-inbox-read:'+(member()?.id||'anon');
  const lastRead=()=>{try{return Number(localStorage.getItem(readKey())||0);}catch{return 0;}};
  // "Inbox" = direct messages plus personal replies and (for the board) things waiting on them.
  const inboxFeed=()=>(items||[]).filter(i=>i.mine||i.action||i.kind.endsWith('-reply'));
  const newsFeed=()=>(items||[]).filter(i=>!(i.mine||i.action||i.kind.endsWith('-reply')));
  const unreadMessages=()=>(messages||[]).filter(m=>!m.read&&!m.mine);
  const unreadFeed=list=>list.filter(i=>Date.parse(i.at)>lastRead());
  const unreadInbox=()=>unreadMessages().length+unreadFeed(inboxFeed()).length;
  const unreadNews=()=>unreadFeed(newsFeed()).length;
  function badge(){document.dispatchEvent(new CustomEvent('hba-inbox-count',{detail:{unread:unreadInbox()+unreadNews(),total:(items||[]).length+(messages||[]).length}}));}
  const fmtDay=d=>{const now=new Date(),dt=new Date(d);const sameDay=(a,b)=>a.toDateString()===b.toDateString();const y=new Date(now);y.setDate(now.getDate()-1);
    return sameDay(dt,now)?'Today':sameDay(dt,y)?'Yesterday':dt.toLocaleDateString('en-US',{timeZone:'America/New_York',weekday:'long',month:'long',day:'numeric'});};
  const fmtTime=d=>new Date(d).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'});
  async function markAll(){
    try{localStorage.setItem(readKey(),String(Date.now()));}catch{}
    const ids=unreadMessages().map(m=>m.id);
    if(ids.length){try{await window.HBACommunity.api('/api/messages/read',{method:'POST',body:JSON.stringify({ids})});ids.forEach(id=>{const m=messages.find(x=>x.id===id);if(m)m.read=true;});}catch{}}
    render();badge();
  }
  async function openMessage(m){
    if(!m.read&&!m.mine){m.read=true;render();badge();try{await window.HBACommunity.api('/api/messages/read',{method:'POST',body:JSON.stringify({ids:[m.id]})});}catch{}}
    if(m.tool==='poll'&&m.tool_arg)window.openHBAPoll?.(m.tool_arg);
    else if(m.tool==='calendar'&&m.tool_arg)window.HBACommunity?.showDay?.(m.tool_arg);
    else if(m.tool)window.HBAShell?.runTool?.(m.tool,m.tool_arg||undefined);
  }
  function compose(){
    const board=isBoard(),C=window.HBACommunity;
    C.formDialog(board?'Write to residents or the board':'Write to the board',
      (board?`<label>Send to<select name="audience"><option value="residents">All residents</option><option value="board">Board members only</option></select></label>`:'<p>Your message goes to the board members’ inbox. For a question to one governor, use Contact our team.</p>')+
      `<label>Subject<input name="subject" type="text" maxlength="200" required></label><label>Message<textarea name="body" rows="6" maxlength="4000" required></textarea></label>`,
      async fd=>{await C.api('/api/messages',{method:'POST',body:JSON.stringify({audience:board?fd.get('audience'):'board',subject:fd.get('subject'),body:fd.get('body')})});await refresh(true);},{},'Send');
  }
  function messageRow(m){
    const to=m.audience==='residents'?'To all residents':m.audience==='board'?'To the board':'To you';
    return `<button type="button" class="inbox-item inbox-msg${m.read||m.mine?'':' is-unread'}" data-inbox-msg="${esc(m.id)}"><span class="inbox-kind inbox-kind-${esc(m.kind)}">${esc(KINDS[m.kind]||m.kind)}</span><span class="inbox-text"><strong>${esc(m.subject)}</strong>${m.body?`<span class="inbox-body">${esc(m.body)}</span>`:''}<small>${esc(to)}${m.mine?' · sent by you':''}${m.tool==='poll'?' · tap to vote':m.tool?' · tap to open':''}</small></span><time datetime="${esc(m.created_at)}">${esc(fmtTime(m.created_at))}</time></button>`;
  }
  function feedRow(it,since){
    return `<button type="button" class="inbox-item${Date.parse(it.at)>since?' is-unread':''}${it.action?' is-action':''}" data-inbox-tool="${esc(it.tool)}"><span class="inbox-kind inbox-kind-${esc(it.kind.split('-')[0])}">${esc(KINDS[it.kind]||it.kind)}</span><span class="inbox-text"><strong>${esc(it.title)}</strong>${it.body?`<span class="inbox-body">${esc(it.body)}</span>`:''}</span><time datetime="${esc(it.at)}">${esc(fmtTime(it.at))}</time></button>`;
  }
  function render(){
    if(!host?.isConnected)return;
    const m=member();
    if(!m){host.innerHTML='';return;}
    const since=lastRead();
    // Merge direct messages and personal feed items into one dated inbox list.
    const inboxList=[...(messages||[]).map(x=>({at:x.created_at,msg:x})),...inboxFeed().map(x=>({at:x.at,it:x}))].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
    const news=newsFeed();
    const list=tab==='inbox'?inboxList:news.map(x=>({at:x.at,it:x}));
    const shown=showAll?list:list.slice(0,8);
    let lastDay='';const rows=[];
    for(const e of shown){const day=fmtDay(e.at);if(day!==lastDay){rows.push(`<h3 class="inbox-day">${esc(day)}</h3>`);lastDay=day;}rows.push(e.msg?messageRow(e.msg):feedRow(e.it,since));}
    const ui=unreadInbox(),un=unreadNews(),total=ui+un;
    const empty=tab==='inbox'?'Your inbox is empty. Replies to your reports and messages, approvals and notices from the board, and polls appear here.':'Nothing new has been published in the last 60 days. Newsletters, minutes, photographs, votes and volunteer requests appear here; calendar dates are in the calendar.';
    host.innerHTML=`<div class="inbox-head"><div><p class="cap-eyebrow">${m.role==='resident'?'For you':'For you and the board'}</p><h2 id="cap-inbox-title">Messages center${total?` <span class="inbox-badge">${total} new</span>`:''}</h2>
        <p class="inbox-sub">${tab==='inbox'?'Messages to you, to all residents or to the board, with answers to what you sent in.':'Everything newly published or reported, apart from calendar dates.'}</p></div>
      <div class="inbox-actions"><button type="button" id="inbox-compose">${isBoard()?'Write to residents':'Write to the board'}</button>${total?'<button type="button" id="inbox-mark">Mark all as read</button>':''}<button type="button" id="inbox-refresh"${busy?' disabled':''}>${busy?'Checking…':'Check again'}</button></div></div>
      <div class="inbox-tabs" role="tablist"><button type="button" role="tab" aria-selected="${tab==='inbox'}" data-inbox-tab="inbox">Inbox${ui?` <span class="inbox-badge">${ui}</span>`:''}</button><button type="button" role="tab" aria-selected="${tab==='news'}" data-inbox-tab="news">What’s new${un?` <span class="inbox-badge">${un}</span>`:''}</button></div>
      ${!ready&&tab==='inbox'?`<p class="inbox-empty">${esc(readyNote)}</p>`:''}
      ${error?`<p class="inbox-empty">${esc(error)}</p>`:items===null?'<p class="inbox-empty">Checking for messages…</p>':!list.length?`<p class="inbox-empty">${empty}</p>`:`<div class="inbox-list">${rows.join('')}</div>${list.length>8?`<button type="button" id="inbox-more" class="inbox-more">${showAll?'Show fewer':`Show all ${list.length}`}</button>`:''}`}`;
    host.querySelector('#inbox-mark')?.addEventListener('click',markAll);
    host.querySelector('#inbox-compose')?.addEventListener('click',compose);
    host.querySelector('#inbox-refresh')?.addEventListener('click',()=>refresh(true));
    host.querySelector('#inbox-more')?.addEventListener('click',()=>{showAll=!showAll;render();});
    host.querySelectorAll('[data-inbox-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.inboxTab;showAll=false;render();});
    host.querySelectorAll('[data-inbox-tool]').forEach(b=>b.onclick=()=>window.HBAShell?.runTool?.(b.dataset.inboxTool));
    host.querySelectorAll('[data-inbox-msg]').forEach(b=>b.onclick=()=>{const mm=(messages||[]).find(x=>x.id===b.dataset.inboxMsg);if(mm)openMessage(mm);});
  }
  async function refresh(force=false){
    const m=member();if(!m||busy)return;
    if(!force&&loadedFor===m.id&&Date.now()-lastAt<120000){render();return;}
    busy=true;error='';render();
    try{
      const [d,ms]=await Promise.all([window.HBACommunity.api('/api/inbox',{signal:AbortSignal.timeout(30000)}),window.HBACommunity.api('/api/messages',{signal:AbortSignal.timeout(30000)}).catch(e=>({ready:false,note:e.message,messages:[]}))]);
      items=d.items||[];messages=ms.messages||[];ready=ms.ready!==false;readyNote=ms.note||'';loadedFor=m.id;lastAt=Date.now();
    }catch(e){error=e.message;}
    busy=false;render();badge();
  }
  window.HBAInbox={mount(el){host=el;render();refresh();},refresh:()=>refresh(true),unread:()=>unreadInbox()+unreadNews(),compose};
  document.addEventListener('hba-account-change',()=>{items=null;messages=null;loadedFor=null;error='';showAll=false;tab='inbox';render();refresh(true);});
  document.addEventListener('hba-data-change',()=>{if(host?.isConnected&&member())refresh(true);});
  setInterval(()=>{if(!document.hidden&&host?.isConnected&&member())refresh(true);},120000);
})();
