(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const source='https://forecast.weather.gov/MapClick.php?lat=41.7437&lon=-70.7098';
  const local=t=>t?new Date(t).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'Not supplied';
  const day=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
  const number=(v,suffix)=>v===null||v===undefined?'Not supplied':Number(v).toLocaleString('en-US',{maximumFractionDigits:1})+suffix;
  const direction=n=>n===null||n===undefined?'Direction not supplied':['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(n/22.5)%16]+' ('+n+'°)';
  let cached=null,pending=null;
  const copy=w=>{const d=structuredClone(w);d.hourly=(d.hourly||[]).filter(p=>Date.parse(p.end)>Date.now());return d;};
  async function load(){
    if(cached&&Date.now()-Date.parse(cached.retrieved_at)<600000)return copy(cached);
    if(pending)return copy(await pending);
    pending=window.HBACommunity.api('/api/weather',{signal:AbortSignal.timeout(25000)});
    try{cached=await pending;return copy(cached);}finally{pending=null;}
  }
  function panel(w,error='',selected=''){
    if(!w)return `<section class="waterfront-card local-weather"><h3>Local weather & wind</h3><p role="status">${esc(error||'Loading local NWS weather…')}</p><p><a href="${source}" target="_blank" rel="noopener">Open the official Hamilton Beach forecast</a></p><p>Unavailable data does not mean calm weather or safe swimming.</p></section>`;
    const all=w.hourly||[],rows=all.filter(p=>!selected||day(p.start)===selected),p=rows[0],o=w.observation;
    return `<section class="waterfront-card local-weather" aria-label="Hamilton Beach weather and wind"><p class="waterfront-eyebrow">Hamilton Beach · National Weather Service</p><h3>Local weather & wind</h3>
      ${o?`<h4>Nearby station observation${o.stale?' · OLD OBSERVATION':''}</h4><p>${esc(o.description)} · ${number(o.temperature_f,'°F')}<br><strong>Wind from ${esc(direction(o.wind_degrees))}: ${number(o.wind_mph,' mph')}</strong><br>Reported gust: ${number(o.gust_mph,' mph')}</p><p class="weather-provenance">${esc(o.name)} (${esc(o.station)}), about ${number(o.distance_miles,' miles')} from the map reference. Observed ${esc(local(o.observed_at))}. This is not an on-beach sensor reading${selected&&selected!==day(o.observed_at)?' and is not an observation for the selected tide date':''}.</p>`:'<p>Nearby observations are unavailable. Forecast values below are not measured conditions.</p>'}
      <div class="weather-instruments">${window.HBABeachScene.windCompass(w)}<div><h4>${selected?'Illustrated forecast for '+esc(selected):'Next 12 forecast hours'}</h4>${rows.length?window.HBABeachScene.hourlyStrip(rows):'<p>No hourly forecast is available for this selected date.</p>'}<p class="weather-provenance">Glyphs summarise the NWS short forecast; arrows point where the wind is blowing toward. Exact values are in the table below.</p></div></div>
      <h4>${selected?'Forecast for '+esc(selected):'Next forecast hour'}${w.forecast_stale?' · OLD FORECAST UPDATE':''}</h4>
      ${p?`<p>${esc(local(p.start))} to ${esc(local(p.end))}: ${esc(p.description)} · ${number(p.temperature_f,'°F')}<br><strong>Wind from ${esc(p.direction)}: ${esc(p.wind)}</strong><br>Forecast gust: ${number(p.gust_mph,' mph')} · Rain chance: ${number(p.rain_probability,'%')}</p>
        <details><summary>Hourly weather and wind${rows.length>12?' (first 12 hours)':''}</summary><p class="weather-scroll-help">On a narrow screen, scroll the table sideways to see every column.</p><div class="weather-table" tabindex="0" role="region" aria-label="Hourly weather and wind table; scroll sideways for more columns"><table><thead><tr><th>Eastern time</th><th>Weather</th><th>Temp.</th><th>Wind from</th><th>Gust</th><th>Rain chance</th></tr></thead><tbody>${rows.slice(0,12).map(r=>`<tr><td>${esc(local(r.start))}</td><td>${esc(r.description)}</td><td>${number(r.temperature_f,'°F')}</td><td>${esc(r.direction)} ${esc(r.wind)}</td><td>${number(r.gust_mph,' mph')}</td><td>${number(r.rain_probability,'%')}</td></tr>`).join('')}</tbody></table></div></details>`:'<p>No hourly forecast is available for this selected date. No future values have been guessed.</p>'}
      ${(w.warnings||[]).map(t=>'<p class="weather-warning">'+esc(t)+'</p>').join('')}
      <p class="weather-provenance">Forecast updated ${esc(local(w.forecast_updated_at))}; gust grid updated ${esc(local(w.gust_updated_at))}; retrieved ${esc(local(w.retrieved_at))}. Cached up to 10 minutes. Wind direction describes where wind comes from; a missing gust is not zero.</p>
      <p><a href="${esc(w.source)}" target="_blank" rel="noopener">Official Hamilton Beach forecast</a> · <a href="${esc(w.forecast_source)}" target="_blank" rel="noopener">Hourly forecast data</a>${o?` · <a href="${esc(o.source)}" target="_blank" rel="noopener">Station observations</a>`:''}</p>
      <p class="weather-provenance">Weather and astronomical tides are separate. Wind can change actual water levels and beach conditions. This is not a marine forecast, storm-surge prediction, swimming clearance or shellfish-harvest permission.</p></section>`;
  }
  function textRows(w){
    if(!w)return [];
    const p=w.hourly?.[0],o=w.observation;
    return [
      ['Location',w.location+' ('+w.latitude+', '+w.longitude+')'],
      ['Retrieved',local(w.retrieved_at)],
      ['Forecast updated',local(w.forecast_updated_at)+(w.forecast_stale?' · OLD FORECAST UPDATE':'')],
      ['Gust grid updated',local(w.gust_updated_at)],
      ...(o?[
        ['Nearby station',o.name+' ('+o.station+'), about '+number(o.distance_miles,' miles')+' away; not a beach sensor'],
        ['Observed',local(o.observed_at)+(o.stale?' · OLD OBSERVATION':'')],
        ['Observed weather',o.description+'; '+number(o.temperature_f,'°F')],
        ['Observed wind','From '+direction(o.wind_degrees)+'; '+number(o.wind_mph,' mph')+'; gust '+number(o.gust_mph,' mph')]
      ]:[['Observation','Unavailable; forecast is not a measured beach reading']]),
      ...(p?[
        ['Forecast valid',local(p.start)+' to '+local(p.end)],
        ['Forecast weather',p.description+'; '+number(p.temperature_f,'°F')+'; rain chance '+number(p.rain_probability,'%')],
        ['Forecast wind','From '+p.direction+'; '+p.wind+'; gust '+number(p.gust_mph,' mph')]
      ]:[['Forecast','Unavailable']])
    ];
  }
  document.addEventListener('hba-account-change',()=>{cached=null;});
  window.HBALocalWeather={load,panel,textRows,source,local};
})();
