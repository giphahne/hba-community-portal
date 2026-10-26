// Storms & hurricanes: a documented chronology for Hamilton Beach plus resident memories and photographs.
(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const D=window.HBAStorms;
  const kinds={hurricane:'Hurricane',gale:'Gale',noreaster:"Nor'easter",thunderstorm:'Thunderstorm',winter:'Winter storms'};
  let memories=null,photos=[],memberInfo=null,memError='',busy=false,lastFocus,loaded=false;
  const entry=document.createElement('section');entry.className='history-entry storms-entry';
  entry.innerHTML='<h2>Storms &amp; Hurricanes</h2><p>The great storms that struck Hamilton Beach and the head of Buzzards Bay, from 1635 to this fall, with what the record says about this shore, and a place for residents to add their own memories and photographs.</p><button type="button" class="history-primary" id="open-storms-history">Read the storm record</button>';
  const anchor=document.querySelector('.island-history-entry')||document.querySelector('.history-entry');
  if(anchor)anchor.after(entry);else document.body.append(entry);
  const dialog=document.createElement('dialog');dialog.id='storms-dialog';dialog.setAttribute('aria-labelledby','storms-title');
  document.body.append(dialog);
  const api=(p,o)=>window.HBACommunity.api(p,o);
  const src=k=>D.sources[k];
  const sourceLinks=keys=>`<p class="st-sources"><span>Sources:</span> ${keys.map(k=>src(k)?`<a href="${esc(src(k).url)}" target="_blank" rel="noopener noreferrer">${esc(src(k).label)}</a>`:'').filter(Boolean).join(' · ')}</p>`;
  const list=(items,cls='')=>items&&items.length?`<ul class="st-list ${cls}">${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'';
  function stormCard(s){
    return `<article class="st-storm st-${esc(s.kind)}" id="storm-${esc(s.key)}" aria-labelledby="storm-h-${esc(s.key)}">
      <header><p class="st-when">${esc(s.label)} · ${esc(kinds[s.kind]||s.kind)}${s.hamilton?' · <strong class="st-named">Hamilton Beach named in the record</strong>':''}</p><h3 id="storm-h-${esc(s.key)}">${esc(s.name)}</h3></header>
      ${s.local.length?`<h4>Here at the head of the bay</h4>${list(s.local)}`:''}
      ${s.general.length?`<h4>The storm itself</h4>${list(s.general,'st-general')}`:''}
      ${s.records?`<h4>In Hamilton Beach's own records</h4>${list(s.records,'st-records')}`:''}
      ${s.pictures?.length?`<h4>Photographs and charts</h4><div class="st-archive">${s.pictures.map(p=>p.src?`<figure class="st-arch"><a href="${esc(p.src)}" target="_blank" rel="noopener"><img src="${esc(p.src)}" alt="${esc(p.caption)}" loading="lazy" decoding="async"></a><figcaption><span class="st-arch-kind">${/radar|plotted|chart|graph/i.test(p.caption)?'Chart':'Photograph'}</span> ${esc(p.caption)} <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.credit)}</a></figcaption></figure>`:`<figure class="st-arch st-arch-link"><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer"><span class="st-arch-kind">Photograph · external</span> ${esc(p.caption)}</a><figcaption>${esc(p.credit)}. Not copied into this app because the newspaper holds the rights.</figcaption></figure>`).join('')}</div>`:''}
      <p class="st-absent">${esc(s.absent)}</p>
      ${sourceLinks(s.sources)}
      <button type="button" class="st-add" data-storm="${esc(s.key)}">Add your memory of this storm</button>
    </article>`;
  }
  function memoryCard(m){
    const mine=memberInfo&&m.created_by===memberInfo.user_id,board=window.HBACommunity.isBoard();
    const ph=photos.filter(p=>p.storm_id===m.id);
    return `<article class="st-memory${m.status==='pending'?' is-pending':''}" aria-label="${esc(m.title)}">
      <p class="st-when">${esc(m.storm_label)}${m.event_year?` · ${m.event_year}`:''}${m.where_text?` · ${esc(m.where_text)}`:''}</p>
      <h4>${esc(m.title)}</h4>
      ${m.status==='pending'?`<p class="st-pending">${mine?'Waiting for the board to publish. Only you and the board can see it for now.':'Pending · not yet published'}</p>`:''}
      <div class="st-story">${esc(m.story).split(/\n{2,}/).map(p=>`<p>${p.replace(/\n/g,'<br>')}</p>`).join('')}</div>
      ${ph.length?`<div class="st-photos">${ph.map(p=>`<figure><img data-storm-photo="${esc(p.id)}" alt="${esc(p.caption||m.title)}"><span class="st-photo-wait">Loading photograph…</span><figcaption>Photograph${p.caption?' · '+esc(p.caption):''}${p.credit?' · '+esc(p.credit):''}${p.status==='pending'?' · pending':''}</figcaption></figure>`).join('')}</div>`:''}
      <p class="st-by">Shared by ${m.show_name&&m.display_name?esc(m.display_name):'a Hamilton Beach resident'} · ${new Date(m.created_at).toLocaleDateString('en-US',{timeZone:'America/New_York',month:'long',day:'numeric',year:'numeric'})}</p>
      <div class="st-actions">${mine||board?`<button type="button" class="st-photo-btn" data-photo-for="${esc(m.id)}">Add a photograph</button>`:''}${board&&m.status==='pending'?`<button type="button" class="st-publish" data-publish="${esc(m.id)}">Publish</button>`:''}${board?ph.filter(p=>p.status==='pending').map(p=>`<button type="button" class="st-publish" data-publish-photo="${esc(p.id)}">Publish photo</button>`).join(''):''}${window.HBACommunity.member?.role==='admin'?`<button type="button" class="st-delete" data-delete="${esc(m.id)}">Delete</button>`:''}</div>
    </article>`;
  }
  const blobs=new Map();
  function loadPhotos(){
    dialog.querySelectorAll('img[data-storm-photo]').forEach(async img=>{
      const id=img.dataset.stormPhoto,wait=img.nextElementSibling;
      try{
        let url=blobs.get(id);
        if(!url){const blob=await api('/api/files/photo/'+id,{binary:true});url=URL.createObjectURL(blob);blobs.set(id,url);}
        if(!img.isConnected)return;img.src=url;img.onload=()=>{if(wait)wait.hidden=true;};
        img.onclick=()=>window.open(url,'_blank','noopener');
      }catch(e){if(img.isConnected&&wait){wait.textContent='Photograph unavailable. '+e.message;img.hidden=true;}}
    });
  }
  function render(){
    const main=dialog.querySelector('.st-main'),scroll=main?main.scrollTop:0,focus=document.activeElement?.id;
    const c=D.context;
    const mems=memories||[];
    dialog.innerHTML=`<div class="st-shell"><header class="st-top"><div><p>Hamilton Beach · Storm record</p><h2 id="storms-title">Storms &amp; hurricanes</h2></div><button type="button" id="storms-close">Back to map</button></header>
    <div class="st-main">
      <section class="st-intro"><blockquote>${esc(c.quote)}<footer>${esc(c.quoteBy)}${src(c.quoteSource)?` · <a href="${esc(src(c.quoteSource).url)}" target="_blank" rel="noopener noreferrer">read the article</a>`:''}</footer></blockquote>
        <p>${esc(c.funnel)}</p>${sourceLinks(c.funnelSources)}
        <p class="st-howread">Each storm below separates what the sources say about Wareham, Onset, Swifts Beach and Hamilton Beach from the storm-wide facts, and says plainly when nothing specific to this shore has been found. Where Hamilton Beach's own permit records fall in the years after a storm, they are listed too; the records do not name the storm as the cause.</p>
        <nav class="st-jump" aria-label="Jump to a storm">${D.storms.map(s=>`<a href="#storm-${esc(s.key)}">${esc(s.date.slice(0,4))} ${esc(s.name.replace(/^(The|Hurricane) /,''))}</a>`).join('')}<a href="#storm-memories">Your memories</a></nav>
      </section>
      ${D.storms.map(stormCard).join('')}
      <p class="st-near">${esc(D.nearMisses)} <a href="${esc(src('storms').url)}" target="_blank" rel="noopener noreferrer">${esc(src('storms').label)}</a></p>
      <section class="st-memories" id="storm-memories" aria-labelledby="st-mem-title">
        <div class="st-mem-head"><div><p class="st-when">Resident submissions</p><h3 id="st-mem-title">Your storm memories</h3></div><button type="button" id="st-share" class="history-primary">Share a memory or photograph</button></div>
        <p>Where were you, what did the water do, what did the neighbourhood look like the morning after. Memories are published after a board member reads them; you can leave your name off. Photographs are labelled as photographs and need your permission to share.</p>
        ${memError?`<p class="st-error" role="alert">${esc(memError)}</p>`:''}
        ${memories===null?'<p class="st-muted">Loading memories…</p>':mems.length?`<div class="st-mem-list">${mems.map(memoryCard).join('')}</div>`:'<p class="st-muted">No memories have been shared yet. Yours can be the first.</p>'}
      </section>
    </div></div>`;
    dialog.querySelector('#storms-close').onclick=()=>dialog.close();
    dialog.querySelector('#st-share').onclick=()=>memoryForm('');
    dialog.querySelectorAll('.st-add').forEach(b=>b.onclick=()=>memoryForm(b.dataset.storm));
    dialog.querySelectorAll('[data-publish]').forEach(b=>b.onclick=()=>act(()=>api('/api/publish/storm/'+b.dataset.publish,{method:'POST'})));
    dialog.querySelectorAll('[data-publish-photo]').forEach(b=>b.onclick=()=>act(()=>api('/api/publish/photo/'+b.dataset.publishPhoto,{method:'POST'})));
    dialog.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{if(confirm('Delete this memory and its photographs? This cannot be undone.'))act(async()=>{for(const p of photos.filter(x=>x.storm_id===b.dataset.delete))await api('/api/records/photo/'+p.id,{method:'DELETE'});await api('/api/records/storm/'+b.dataset.delete,{method:'DELETE'});});});
    dialog.querySelectorAll('[data-photo-for]').forEach(b=>b.onclick=()=>photoForm(b.dataset.photoFor));
    dialog.querySelectorAll('.st-jump a').forEach(a=>a.onclick=e=>{e.preventDefault();const t=dialog.querySelector(a.getAttribute('href'));if(t){t.scrollIntoView({block:'start'});t.querySelector('h3')?.focus?.({preventScroll:true});}});
    loadPhotos();
    const m2=dialog.querySelector('.st-main');if(m2)m2.scrollTop=scroll;
    if(focus&&dialog.querySelector('#'+CSS.escape(focus)))dialog.querySelector('#'+CSS.escape(focus)).focus({preventScroll:true});
  }
  async function act(fn){
    if(busy)return;busy=true;
    try{await fn();await load(true);}catch(e){memError=e.message;render();}
    finally{busy=false;}
  }
  async function load(force=false){
    if(loaded&&!force)return;
    if(!window.HBACommunity.member){memories=[];memError='Sign in to read and share storm memories.';render();return;}
    try{const r=await api('/api/storm-memories',{signal:AbortSignal.timeout(25000)});memories=r.memories||[];photos=r.photos||[];memberInfo=r.member;memError='';loaded=true;}
    catch(e){memories=memories||[];memError=e.message;}
    render();
  }
  function stormOptions(sel){
    return `<option value="">Choose the storm…</option>${D.storms.slice().reverse().map(s=>`<option value="${esc(s.key)}"${s.key===sel?' selected':''}>${esc(s.label)} · ${esc(s.name)}</option>`).join('')}<option value="other"${sel==='other'?' selected':''}>Another storm (describe it in the title)</option>`;
  }
  function memoryForm(stormKey){
    if(!window.HBACommunity.member){window.openHBACommunity('overview');return;}
    const s=D.storms.find(x=>x.key===stormKey);
    const fields=`<label>Which storm<select name="storm_key" required>${stormOptions(stormKey)}</select></label>
      <label>Year<input name="event_year" type="number" min="1600" max="2100" inputmode="numeric" value="${s?esc(s.date.slice(0,4)):''}"></label>
      <label>Title<input name="title" type="text" required maxlength="160" placeholder="For example: The morning after Bob on Worrall Avenue"></label>
      <label>Where you were (optional)<input name="where_text" type="text" maxlength="200" placeholder="Street, cottage, boat, or away from the beach"></label>
      <label>Your memory<textarea name="story" required maxlength="6000" rows="8" placeholder="What you saw, heard and did. Who was with you. What the water and the wind did to the beach, the road and the houses."></textarea></label>
      <label class="st-check"><input type="checkbox" name="show_name" value="1"> Show my name with this memory</label>
      <label>Name to show (only if the box above is ticked)<input name="display_name" type="text" maxlength="120" value="${esc(window.HBACommunity.member?.display_name||'')}"></label>
      ${window.HBACommunity.photoFields({label:'Photographs (optional) · JPEG, PNG or WebP · up to 6 MB each'})}
      <label>Caption for the photographs (optional)<input name="caption" type="text" maxlength="300"></label>
      <label class="st-check"><input type="checkbox" name="consent" value="yes"> I took these photographs or have permission to share them (required if photographs are attached)</label>
      <p class="st-formnote">${window.HBACommunity.isBoard()?'Board submissions publish immediately.':'A board member reads each memory before it is published to the neighbourhood.'}</p>`;
    let picker,row=null;
    const form=window.HBACommunity.formDialog('Share a storm memory',fields,async fd=>{
      const key=fd.get('storm_key');const st=D.storms.find(x=>x.key===key);
      if(picker.count()&&fd.get('consent')!=='yes')throw Error('Tick the permission box for the photographs, or remove them.');
      const body={storm_key:key,storm_label:st?`${st.name} (${st.label})`:'Another storm',event_year:fd.get('event_year')?Number(fd.get('event_year')):null,title:fd.get('title').trim(),story:fd.get('story').trim(),where_text:(fd.get('where_text')||'').trim(),show_name:fd.get('show_name')==='1',display_name:(fd.get('display_name')||'').trim()};
      if(!row)row=await api('/api/storm-memories',{method:'POST',body:JSON.stringify(body)});
      if(picker.count()&&row?.id){try{await window.HBACommunity.uploadPhotos(picker,{kind:'storm',parent_id:row.id,caption:(fd.get('caption')||'').trim()},'photograph');}catch(e){throw Error('Your memory is saved. '+e.message+' Pressing the button again only uploads the photographs still listed.');}}
      await load(true);
      const t=dialog.querySelector('#storm-memories');if(t)t.scrollIntoView({block:'start'});
    },{},'Share this memory');
    picker=window.HBACommunity.bindPhotoList(form);
  }
  function photoForm(memoryId){
    const fields=`${window.HBACommunity.photoFields({required:true,label:'Photographs · JPEG, PNG or WebP · up to 6 MB each'})}
      <label>Caption for the photographs (a photograph's own caption above replaces it)<input name="caption" type="text" maxlength="300"></label>
      <label>Credit (optional)<input name="credit" type="text" maxlength="200"></label>
      <label class="st-check"><input type="checkbox" name="consent" value="yes" required> I took these photographs or have permission to share them</label>`;
    let picker;
    const form=window.HBACommunity.formDialog('Add photographs to this memory',fields,async fd=>{
      await window.HBACommunity.uploadPhotos(picker,{kind:'storm',parent_id:memoryId,caption:(fd.get('caption')||'').trim(),credit:fd.get('credit')||''},'photograph');await load(true);
    },{},'Add photographs');
    picker=window.HBACommunity.bindPhotoList(form);
  }
  async function open(stormKey){
    lastFocus=document.activeElement;
    if(!dialog.open)dialog.showModal();
    render();
    load();
    if(stormKey){requestAnimationFrame(()=>{const t=dialog.querySelector('#storm-'+CSS.escape(stormKey)+', #'+CSS.escape(stormKey));if(t)t.scrollIntoView({block:'start'});});}
  }
  dialog.addEventListener('close',()=>lastFocus?.focus?.({preventScroll:true}));
  document.addEventListener('hba-account-change',()=>{loaded=false;memories=null;photos=[];memError='';if(dialog.open)load(true);});
  document.getElementById('open-storms-history').onclick=()=>open();
  window.openHBAStorms=open;
})();
