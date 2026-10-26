(() => {
  const entry=document.createElement('section');
  entry.className='history-entry sand-school-entry';
  entry.innerHTML='<h2>Sand School</h2><p>How to Save Our Beach: your interactive erosion guide, historical photos, winter fences and jetty/sand-placement demonstrations.</p><button class="history-primary" id="open-sand-school" type="button">How to Save Our Beach</button><p>Teaching models are separate from property rights and approved engineering plans.</p>';
  document.querySelector('.rt-entry').after(entry);
  const dialog=document.createElement('dialog');dialog.id='sand-school-dialog';dialog.setAttribute('aria-labelledby','sand-school-title');
  dialog.innerHTML=`<div class="sand-school-shell"><header class="sand-school-top"><div><p>Sand School · Learning section</p><h2 id="sand-school-title">How to Save Our Beach</h2></div><div class="sand-school-navigation"><label for="sand-school-lesson">Jump to</label><select id="sand-school-lesson"><option value="">Introduction</option><option value="basics">Erosion basics</option><option value="seasons">Seasonal beach changes</option><option value="beach">Eroding areas</option><option value="old">1938 / 1971 photo comparisons</option><option value="timeline">Year-by-year sand movement</option><option value="wind">NE / NW fence demonstrations</option><option value="jetty">Jetties & pre-dumped sand</option><option value="fix">What helps</option><option value="science">Scientific references</option></select><button id="sand-school-close" type="button">Back to research map</button></div></header><p class="sand-school-scope">Imported from your latest Sand School chat. Model outputs and fence/jetty positions are illustrative, not surveyed predictions, property-rights findings or approved designs.</p><div class="sand-school-body"><p id="sand-school-loading" role="status">Loading the learning app…</p><iframe id="sand-school-frame" title="How to Save Our Beach: interactive erosion learning app" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads"></iframe></div></div>`;
  document.body.append(dialog);
  const frame=document.getElementById('sand-school-frame'),select=document.getElementById('sand-school-lesson'),loading=document.getElementById('sand-school-loading');
  let loaded=false,ready=false,lastFocus,timer;
  const send=message=>{if(ready)frame.contentWindow.postMessage(message,'*');};
  function theme(){send({type:'sand-school-theme',theme:document.documentElement.dataset.theme||'light'});}
  function close(){dialog.close();lastFocus?.focus?.({preventScroll:true});}
  function start(){
    ready=false;loading.hidden=false;loading.textContent='Loading the learning app…';
    clearTimeout(timer);
    window.hbaLoadFrame(frame,'sand-school/learn.html').catch(e=>{clearTimeout(timer);loading.textContent='The learning app could not be loaded: '+e.message;});
    timer=setTimeout(()=>{
      if(ready)return;
      loading.replaceChildren(document.createTextNode('The learning app is taking longer to load. '));
      const b=document.createElement('button');b.type='button';b.textContent='Retry loading';b.onclick=start;loading.append(b);
    },15000);
  }
  function open(){
    lastFocus=document.activeElement;
    if(!dialog.open)dialog.showModal();
    if(!loaded){loaded=true;start();}else theme();
  }
  window.openSandSchool=open;
  document.getElementById('open-sand-school').onclick=open;
  document.getElementById('sand-school-close').onclick=close;
  dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
  select.onchange=()=>send({type:'sand-school-jump',section:select.value});
  window.addEventListener('message',e=>{
    if(e.source!==frame.contentWindow||!e.data)return;
    if(e.data.type==='sand-school-ready'){ready=true;clearTimeout(timer);loading.hidden=true;theme();if(select.value)send({type:'sand-school-jump',section:select.value});}
    if(e.data.type==='sand-school-close')close();
  });
  new MutationObserver(theme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
})();
