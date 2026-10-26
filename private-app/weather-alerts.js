(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const local=t=>t?new Date(t).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'Not supplied';
  const forecast='https://forecast.weather.gov/MapClick.php?lat=41.7437&lon=-70.7098';
  const source='https://api.weather.gov/alerts/active?point=41.7437,-70.7098';
  let host=null,data=null,error='',busy=false,lastAttempt=0,controller=null;
  const visible=()=>{if(!host?.isConnected||document.hidden)return false;const dlg=host.closest('dialog');return dlg?dlg.open:!document.body.classList.contains('hba-map-mode');};
  function state(d,err,now=Date.now()){
    const alerts=(d?.alerts||[]).filter(a=>!a.valid_until||Date.parse(a.valid_until)>now);
    const fresh=d?.status==='current'&&!err&&now-Date.parse(d.checked_at)<120000;
    return {alerts,fresh,summary:fresh?(alerts.length?`${alerts.length} active NWS alert${alerts.length===1?'':'s'} returned for the Hamilton Beach map reference.`:'No active NWS alerts returned for the Hamilton Beach map reference at the last successful check.'):'Current alert status could not be verified. Do not interpret this as no active alerts.'};
  }
  function card(a){
    return `<article class="nws-alert nws-${esc(a.severity.toLowerCase())}">
      <p class="nws-label">${a.coastal?'Coastal flooding / storm surge':'Weather / other official alert'} · ${esc(a.severity)} severity</p>
      <h4>${esc(a.event)}</h4><p class="nws-headline">${esc(a.headline)}</p>
      <p><strong>Affected area:</strong> ${esc(a.area)}</p>
      <dl class="nws-timing"><div><dt>Issued</dt><dd>${esc(local(a.sent))}</dd></div><div><dt>Hazard starts</dt><dd>${esc(local(a.onset||a.effective))}</dd></div><div><dt>Hazard ends</dt><dd>${esc(local(a.ends))}</dd></div><div><dt>Message expires</dt><dd>${esc(local(a.expires))}</dd></div></dl>
      <p class="nws-meta">Urgency: ${esc(a.urgency)}. Certainty: ${esc(a.certainty)}. Issued by ${esc(a.sender)}.</p>
      ${!a.valid_until?'<p class="nws-unverified">NWS did not supply a usable end or expiration time. Verify the current message with NWS.</p>':''}
      <h5>NWS instructions</h5><p class="nws-verbatim">${esc(a.instruction||'No separate instructions supplied. Read the complete NWS message below and follow local emergency instructions.')}</p>
      <details data-nws-id="${esc(a.id)}"><summary>Read the complete NWS description</summary><p class="nws-verbatim">${esc(a.description)}</p><p><a href="${esc(a.source)}" target="_blank" rel="noopener">Original NWS alert data</a></p></details>
    </article>`;
  }
  function render(){
    if(!host?.isConnected)return;
    const open=new Set([...host.querySelectorAll('details[open]')].map(x=>x.dataset.nwsId));
    const focused=document.activeElement?.id, focusedDetail=document.activeElement?.closest('details')?.dataset.nwsId, s=state(data,error);
    host.innerHTML=`<section class="waterfront-card nws-alerts" aria-labelledby="nws-alerts-title">
      <div class="nws-heading"><div><p class="waterfront-eyebrow">National Weather Service · Hamilton Beach area</p><h3 id="nws-alerts-title">Severe-weather & coastal-flood alerts</h3></div><button type="button" id="nws-alert-refresh"${busy?' disabled':''}>${busy?'Checking…':'Refresh alerts'}</button></div>
      <p class="nws-feed-status${!s.fresh?' nws-unverified':''}" role="status">${busy&&!data&&!error?'Checking official NWS alerts…':esc(s.summary)}</p>
      ${error||data?.error?`<p class="nws-unverified">${esc(error||data.error)}</p>`:''}
      ${data?`<p class="nws-meta">Last successful check: ${esc(local(data.checked_at))}.${data.source_updated_at?' NWS feed timestamp: '+esc(local(data.source_updated_at))+'.':''} ${s.fresh?'':'Messages below, if any, are last-known information only.'}</p>`:''}
      <p class="nws-meta">Checks about once per minute while this bulletin is open and visible; the source may be cached for up to one minute. Alerts always refer to current conditions and announced hazards, not the date selected in the tide table.</p>
      ${s.alerts.map(card).join('')}
      <p><a href="${forecast}" target="_blank" rel="noopener">Check the official Hamilton Beach forecast & warnings</a> · <a href="${source}" target="_blank" rel="noopener">NWS active-alert feed</a></p>
      <p class="nws-meta">${esc(data?.scope||'NWS point query includes county- and forecast-zone alerts for the Hamilton Beach map reference. Review each affected area; this is not a house-by-house impact assessment.')}</p>
      <p class="nws-safety">This bulletin is not an emergency notification service and does not send texts or emails. Use official emergency alerts and local instructions as well. No listed alert does not mean safe conditions, permission to swim or harvest shellfish, or permission to drive through floodwater.</p>
    </section>`;
    host.querySelectorAll('details').forEach(x=>x.open=open.has(x.dataset.nwsId));
    host.querySelector('#nws-alert-refresh').onclick=()=>refresh(true);
    if(focused==='nws-alert-refresh')host.querySelector('#nws-alert-refresh').focus({preventScroll:true});
    else if(focusedDetail)host.querySelector(`details[data-nws-id="${CSS.escape(focusedDetail)}"] summary`)?.focus({preventScroll:true});
  }
  async function refresh(force=false){
    if(busy||!visible())return;
    if(!force&&Date.now()-lastAttempt<60000){render();return;}
    busy=true;lastAttempt=Date.now();render();
    controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),15000);
    try{data=await window.HBACommunity.api('/api/weather-alerts',{signal:controller.signal});error='';}
    catch(e){error=e.name==='AbortError'?'The NWS alert check timed out. Current alerts are not verified.':e.message;}
    finally{clearTimeout(timeout);controller=null;busy=false;render();}
  }
  setInterval(()=>{if(visible())refresh();},60000);
  document.addEventListener('visibilitychange',()=>{if(visible())refresh();});
  document.addEventListener('hba-account-change',()=>{controller?.abort();data=null;error='';lastAttempt=0;});
  window.HBAWeatherAlerts={mount(el){host=el;render();refresh();},refresh,state,data:()=>data};
})();
