(() => {
  'use strict';
  // Illustrated, data-driven scene and instruments for the beach & weather bulletin.
  // Every picture is an illustration painted from a resident's photograph of Hamilton Beach and chosen to match the reported
  // conditions; nothing here is a live camera. Scenes are shared with the dashboard through window.HBABeachScene.scene().
  const SCENES={
    summer:{src:'friendly/ill-shade-moorings.jpg',tiny:'friendly/ill-shade-moorings-tiny.jpg',alt:'Illustration from a resident photograph: the beach from under the trees, umbrellas on the sand and boats on the moorings',label:'Illustration from a resident photograph · a clear summer day'},
    winterSun:{src:'friendly/ill-winter-sun-ice.jpg',tiny:'friendly/ill-winter-sun-ice-tiny.jpg',alt:'Illustration from a resident photograph: winter sun over the frozen shore',label:'Illustration from a resident photograph · winter sun'},
    dawn:{src:'friendly/ill-sunrise-flats.jpg',tiny:'friendly/ill-sunrise-flats-tiny.jpg',alt:'Illustration from a resident photograph: low sun over the flats',label:'Illustration from a resident photograph · low sun over the flats'},
    overcast:{src:'friendly/ill-aerial-beach.jpg',tiny:'friendly/ill-aerial-beach-tiny.jpg',alt:'Illustration from a resident photograph: the beach and moorings from the air under a grey sky',label:'Illustration from a resident photograph · grey day from the air'},
    storm:{src:'friendly/ill-storm-seawall.jpg',tiny:'friendly/ill-storm-seawall-tiny.jpg',alt:'Illustration from a resident photograph: storm surf against the seawall',label:'Illustration from a resident photograph · storm at the seawall'},
    snow:{src:'friendly/ill-ice-jetty.jpg',tiny:'friendly/ill-ice-jetty-tiny.jpg',alt:'Illustration from a resident photograph: ice and snow around the jetty',label:'Illustration from a resident photograph · ice around the jetty'},
    dusk:{src:'friendly/ill-dusk-moonrise.jpg',tiny:'friendly/ill-dusk-moonrise-tiny.jpg',alt:'Illustration from a resident photograph: an orange moon rising over the wooded shore at dusk, a lit house by the water',label:'Illustration from a resident photograph · moonrise at dusk'},
    night:{src:'friendly/ill-night-moon.jpg',tiny:'friendly/ill-night-moon-tiny.jpg',alt:'Illustration from a resident photograph: the full moon over the bay at night, its light on the water',label:'Illustration from a resident photograph · moonlight on the bay'}
  };
  const scene=picture=>SCENES[picture]||SCENES.night;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const LAT=41.7437,LON=-70.7098,TZ='America/New_York';
  const fmtTime=t=>new Date(t).toLocaleTimeString('en-US',{timeZone:TZ,hour:'numeric',minute:'2-digit'});
  const fmtHour=t=>new Date(t).toLocaleTimeString('en-US',{timeZone:TZ,hour:'numeric'});
  const num=(v,s='')=>v===null||v===undefined||Number.isNaN(Number(v))?null:Number(v).toLocaleString('en-US',{maximumFractionDigits:0})+s;
  const compass=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const degrees=d=>{if(d===null||d===undefined)return null;if(typeof d==='number')return d;const i=compass.indexOf(String(d).toUpperCase());return i<0?null:i*22.5;};
  const mph=s=>{if(s===null||s===undefined)return null;if(typeof s==='number')return s;const m=String(s).match(/\d+(\.\d+)?/g);return m?Math.max(...m.map(Number)):null;};
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Solar elevation (NOAA low-precision algorithm); accurate to well under a degree, used only to pick day, dusk or night art.
  function solarElevation(date){
    const rad=Math.PI/180,d=(date.getTime()/86400000)+2440587.5-2451545,g=rad*((357.529+.98560028*d)%360),q=(280.459+.98564736*d)%360;
    const L=rad*(q+1.915*Math.sin(g)+.02*Math.sin(2*g)),e=rad*(23.439-.00000036*d);
    const ra=Math.atan2(Math.cos(e)*Math.sin(L),Math.cos(L)),dec=Math.asin(Math.sin(e)*Math.sin(L));
    const gmst=(18.697374558+24.06570982441908*d)%24,lst=(gmst*15+LON)*rad,ha=lst-ra;
    return Math.asin(Math.sin(LAT*rad)*Math.sin(dec)+Math.cos(LAT*rad)*Math.cos(dec)*Math.cos(ha))/rad;
  }
  function sunTimes(date){
    // Scan the local day in 2-minute steps for the horizon crossings (-0.833° accounts for refraction and the solar disc).
    const ymd=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    const dayStart=new Date(localToMs(ymd+' 00:00'));
    let rise=null,set=null,prev=solarElevation(dayStart);
    for(let m=2;m<=1440;m+=2){const t=new Date(dayStart.getTime()+m*60000),el=solarElevation(t);if(prev<-.833&&el>=-.833)rise=t;if(prev>=-.833&&el<-.833)set=t;prev=el;}
    return {rise,set};
  }
  // Moon phase from the mean synodic month; approximate to within about a day, which is enough for an icon.
  function moonPhase(date){const days=(date.getTime()/86400000-10962.76)%29.530588853;const age=(days+29.530588853)%29.530588853;const frac=age/29.530588853;
    const name=age<1.85?'New moon':age<5.5?'Waxing crescent':age<9.2?'First quarter':age<12.9?'Waxing gibbous':age<16.6?'Full moon':age<20.3?'Waning gibbous':age<24?'Last quarter':age<27.7?'Waning crescent':'New moon';
    return {age,frac,name,illum:(1-Math.cos(2*Math.PI*frac))/2};}

  function classify(description,windMph,gustMph,rain,elevation){
    const d=String(description||'').toLowerCase();
    const light=elevation<-6?'night':elevation<6?'dusk':'day';
    let kind='clear';
    if(/thunder|storm|gale|squall|tropical|hurricane/.test(d)||(windMph||0)>=25||(gustMph||0)>=38)kind='storm';
    else if(/fog|mist|haze|smoke/.test(d))kind='fog';
    else if(/snow|sleet|flurr|freezing|wintry|ice/.test(d))kind='snow';
    else if(/rain|shower|drizzle/.test(d)&&!/slight chance|isolated/.test(d))kind='rain';
    else if(/slight chance|isolated|chance/.test(d)&&/rain|shower|drizzle/.test(d))kind=(rain||0)>=40?'rain':'overcast';
    else if(/cloudy|overcast/.test(d)&&!/partly|mostly/.test(d))kind='overcast';
    else if(/partly cloudy|partly sunny|mostly cloudy/.test(d))kind='partly';
    const now=new Date(),month=now.getMonth()+1,cold=month>=11||month<=3;
    const evening=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(now))>=12;
    const picture=kind==='storm'?'storm':kind==='snow'?'snow':(kind==='rain'||kind==='fog'||kind==='overcast')?'overcast':light==='night'?'night':light==='dusk'?(evening?'dusk':'dawn'):cold?'winterSun':'summer';
    return {kind,light,picture};
  }

  // Current conditions: prefer the nearby station observation, fall back to the first forecast hour.
  function current(weather){
    const o=weather?.observation,p=(weather?.hourly||[])[0];
    if(o&&!o.stale)return {source:'observation',description:o.description,temp:o.temperature_f,wind:o.wind_mph,gust:o.gust_mph,deg:o.wind_degrees,rain:p?.rain_probability??null,label:`${o.name} station · observed ${fmtTime(o.observed_at)}`,at:o.observed_at};
    if(p)return {source:'forecast',description:p.description,temp:p.temperature_f,wind:mph(p.wind),gust:p.gust_mph,deg:degrees(p.direction),rain:p.rain_probability,label:`NWS hourly forecast for ${fmtHour(p.start)}${o?.stale?' · station observation is old':''}`,at:p.start};
    return null;
  }

  // Tide estimate between predicted highs and lows (cosine interpolation, the standard rule-of-thumb shape).
  function tideNow(predictions,at){
    const rows=(predictions||[]).map(r=>({t:localToMs(r.t),ms:r.t,v:Number(r.v),type:r.type})).filter(r=>!Number.isNaN(r.t)&&!Number.isNaN(r.v)).sort((a,b)=>a.t-b.t);
    const t=at.getTime();let a=null,b=null;
    for(let i=0;i<rows.length-1;i++){if(rows[i].t<=t&&rows[i+1].t>=t){a=rows[i];b=rows[i+1];break;}}
    const next=rows.find(r=>r.t>t)||null;
    if(!a||!b)return {height:null,rising:null,next,rows};
    const f=(1-Math.cos(Math.PI*(t-a.t)/(b.t-a.t)))/2;
    return {height:a.v+(b.v-a.v)*f,rising:b.v>a.v,next,rows,progress:f,from:a,to:b};
  }
  function localToMs(s){// s like "2026-10-17 05:12" in America/New_York local time
    const [d,hm]=s.split(' '),[Y,M,D]=d.split('-').map(Number),[h,m]=hm.split(':').map(Number);
    const guess=Date.UTC(Y,M-1,D,h,m);const off=offsetMinutes(new Date(guess));return guess-off*60000;}
  function offsetMinutes(date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:TZ,hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(date);const g=k=>Number(parts.find(p=>p.type===k).value);return (Date.UTC(g('year'),g('month')-1,g('day'),g('hour')%24,g('minute'))-date.getTime())/60000;}

  // ---------- glyphs ----------
  function glyph(kind,light,size=56){
    const sun=`<g class="g-sun"><circle cx="32" cy="32" r="11" fill="#f6c453"/><g class="g-rays" stroke="#f6c453" stroke-width="3" stroke-linecap="round">${[0,45,90,135,180,225,270,315].map(a=>`<line x1="32" y1="12" x2="32" y2="6" transform="rotate(${a} 32 32)"/>`).join('')}</g></g>`;
    const moon=`<path class="g-moon" d="M38 12a18 18 0 1 0 14 29a14 14 0 0 1-14-29z" fill="#e9e4c9"/>`;
    const cloud=(x=0,y=0,s=1,c='#dfe7ec')=>`<g class="g-cloud" transform="translate(${x} ${y}) scale(${s})"><path d="M18 44h30a9 9 0 0 0 1-18a13 13 0 0 0-25-4a10 10 0 0 0-6 22z" fill="${c}"/></g>`;
    const drops=`<g class="g-drops" stroke="#7fc4ff" stroke-width="3" stroke-linecap="round"><line x1="22" y1="48" x2="19" y2="56"/><line x1="32" y1="48" x2="29" y2="56"/><line x1="42" y1="48" x2="39" y2="56"/></g>`;
    const flakes=`<g class="g-flakes" fill="#fff"><circle cx="22" cy="52" r="2.2"/><circle cx="33" cy="56" r="2.2"/><circle cx="43" cy="51" r="2.2"/></g>`;
    const fog=`<g class="g-fog" stroke="#cfd8dd" stroke-width="3" stroke-linecap="round"><line x1="12" y1="40" x2="52" y2="40"/><line x1="18" y1="48" x2="46" y2="48"/><line x1="14" y1="56" x2="50" y2="56"/></g>`;
    const bolt=`<path class="g-bolt" d="M34 42l-8 12h7l-3 10l10-14h-7l4-8z" fill="#ffd36b"/>`;
    const sky=light==='night'?moon:sun;
    let body='';
    switch(kind){
      case 'clear':body=sky;break;
      case 'partly':body=`<g transform="translate(-6 -6) scale(.85)">${sky}</g>${cloud(6,6,.9)}`;break;
      case 'overcast':body=cloud(0,0,1,'#c3cdd3')+cloud(10,-8,.6,'#dfe7ec');break;
      case 'rain':body=cloud(0,-8,1,'#aab8c0')+drops;break;
      case 'snow':body=cloud(0,-8,1,'#c3cdd3')+flakes;break;
      case 'fog':body=fog;break;
      case 'storm':body=cloud(0,-10,1,'#7d8d97')+bolt;break;
      default:body=sky;
    }
    return `<svg class="weather-glyph" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;
  }
  function windArrow(deg,size=28){// arrow points where the wind is going (from + 180)
    if(deg===null)return `<span class="wind-arrow wind-arrow-empty" aria-hidden="true">·</span>`;
    return `<svg class="wind-arrow" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" style="transform:rotate(${(deg+180)%360}deg)"><path d="M12 3l5 9h-3.4v9h-3.2v-9H7z" fill="currentColor"/></svg>`;
  }

  // ---------- hero ----------
  function hero({weather,tides,now=new Date(),loading=false}){
    const cur=current(weather),elev=solarElevation(now),sun=sunTimes(now),moon=moonPhase(now);
    const cls=classify(cur?.description,cur?.wind,cur?.gust,cur?.rain,elev);
    const tide=tideNow(tides?.predictions,now);
    const windSpeed=cur?.wind??0,drift=Math.max(28,Math.round(150-windSpeed*4)),fromDeg=cur?.deg??null;
    // The painted view faces the bay (roughly south): wind from the west pushes clouds toward the viewer's left.
    const eastward=fromDeg===null?1:(Math.sin(fromDeg*Math.PI/180)>=0?1:-1)*-1;
    const temp=num(cur?.temp,'°');
    const nextTide=tide.next?`${tide.next.type==='H'?'High':'Low'} tide ${fmtTime(tide.next.t)}`:'Next tide not in today’s predictions';
    const height=tide.height===null?null:tide.height.toFixed(1);
    const tempPct=cur?.temp===null||cur?.temp===undefined?0:Math.max(4,Math.min(96,(cur.temp)/100*100));
    const gulls=cls.kind!=='storm'&&cls.light!=='night'&&!reduced();
    const particles=cls.kind==='rain'||cls.kind==='storm'?rainLayer(cur?.rain,windSpeed,eastward):cls.kind==='snow'?snowLayer():'';
    return `<figure class="beach-hero beach-hero-${esc(cls.kind)} beach-light-${esc(cls.light)}" data-picture="${esc(cls.picture)}" aria-labelledby="beach-hero-caption">
      <div class="beach-art" style="background-image:url('${scene(cls.picture).tiny}')"><img src="${scene(cls.picture).src}" alt="${esc(scene(cls.picture).alt)}" decoding="async" fetchpriority="high"></div>
      <div class="beach-tint" aria-hidden="true"></div>
      <svg class="beach-layer beach-clouds" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="--drift:${drift}s;--dir:${eastward}">
        ${cls.kind==='clear'&&cls.light==='day'?'':cloudBand(cls.kind)}
      </svg>
      ${cls.kind==='fog'?`<div class="beach-fog" aria-hidden="true"><span></span><span></span><span></span></div>`:''}
      ${particles}
      ${cls.kind==='storm'?'<div class="beach-flash" aria-hidden="true"></div>':''}
      ${cls.light==='night'?stars():''}
      ${cls.kind==='clear'&&cls.light!=='night'?glints():''}
      ${gulls?`<svg class="beach-layer beach-gulls" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g class="gull gull-a"><path d="M0 0q12-12 24 0q12-12 24 0" fill="none" stroke="#3a4a52" stroke-width="3" stroke-linecap="round"/></g><g class="gull gull-b"><path d="M0 0q9-9 18 0q9-9 18 0" fill="none" stroke="#3a4a52" stroke-width="2.5" stroke-linecap="round"/></g></svg>`:''}
      <div class="beach-panel">
        <p class="beach-kicker">Now at Hamilton Beach</p>
        ${cur?`<div class="beach-now">${glyph(cls.kind,cls.light,64)}<div><p class="beach-temp">${temp??'Temp. not supplied'}</p><p class="beach-desc">${esc(cur.description)}</p></div>
          <svg class="beach-thermo" viewBox="0 0 24 110" aria-hidden="true"><rect x="9" y="6" width="6" height="86" rx="3" fill="#ffffff22" stroke="#ffffff66"/><rect class="thermo-fill" x="10.5" y="${(92-(86*tempPct/100)).toFixed(1)}" width="3" height="${(86*tempPct/100).toFixed(1)}" rx="1.5" fill="#f6c453"/><circle cx="12" cy="98" r="8" fill="#f6c453"/></svg></div>
          <dl class="beach-facts">
            <div><dt>Wind</dt><dd>${windArrow(fromDeg,26)} ${fromDeg===null?'direction not supplied':'from '+compass[Math.round(fromDeg/22.5)%16]} · ${num(cur.wind,' mph')??'speed not supplied'}${cur.gust!==null&&cur.gust!==undefined?` · gusts ${num(cur.gust,' mph')}`:''}</dd></div>
            <div><dt>Tide</dt><dd>${esc(nextTide)}${height!==null?` · now about ${height} ft, ${tide.rising?'rising':'falling'}`:''}</dd></div>
            <div><dt>Sun</dt><dd>${sun.rise?'rise '+fmtTime(sun.rise):'no sunrise'} · ${sun.set?'set '+fmtTime(sun.set):'no sunset'}</dd></div>
            <div><dt>Moon</dt><dd>${moonIcon(moon)} ${esc(moon.name)}</dd></div>
          </dl>
          <p class="beach-provenance">${esc(cur.label)}. ${cur.source==='observation'?'Station reading about 11 miles away, not an on-beach sensor.':'Forecast values are not measured conditions.'}</p>`
          :`<p class="beach-desc">${loading?'Loading live conditions from the National Weather Service…':'Live conditions are unavailable right now. The picture shows the time of day only; it is not a report of calm weather.'}</p>`}
      </div>
      <figcaption id="beach-hero-caption" class="beach-caption">${esc(scene(cls.picture).label)}. The scene is an illustration painted from a resident’s photograph of Hamilton Beach and chosen to match the reported conditions; it is not a live camera; sun and moon details are computed astronomically, tide height is estimated between NOAA predictions.</figcaption>
    </figure>`;
  }
  function moonIcon(m){
    const r=9,c=12,waxing=m.frac<.5,rx=Math.abs(Math.cos(2*Math.PI*m.frac))*r,lit='#e9e4c9',dark='#2b3a45';
    const half=waxing?`M${c} ${c-r}a${r} ${r} 0 0 1 0 ${2*r}z`:`M${c} ${c-r}a${r} ${r} 0 0 0 0 ${2*r}z`;
    return `<svg class="moon-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${r}" fill="${dark}"/><path d="${half}" fill="${lit}"/><ellipse cx="${c}" cy="${c}" rx="${rx.toFixed(2)}" ry="${r}" fill="${m.illum<.5?dark:lit}"/></svg>`;}
  function cloudBand(kind){
    const n=kind==='overcast'||kind==='rain'||kind==='snow'?5:kind==='storm'?6:kind==='partly'?3:kind==='fog'?0:2;
    const colour=kind==='storm'?'#5a6a74':kind==='rain'||kind==='overcast'||kind==='snow'?'#c9d3d8':'#ffffff';
    let s='<defs><filter id="cloud-soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="14"/></filter></defs>';
    for(let i=0;i<n;i++){const y=60+i*55+(i%2)*30,w=260+(i*97)%220,delay=-(i*37)%100;s+=`<g class="cloud" style="--y:${y}px;--delay:${delay}s;--scale:${(.8+(i%3)*.25).toFixed(2)}"><ellipse cx="0" cy="${y}" rx="${w}" ry="${34+(i%2)*14}" fill="${colour}" opacity="${kind==='storm'?.5:.55}" filter="url(#cloud-soft)"/></g>`;}
    return s;
  }
  function rainLayer(prob,wind,dir){const density=Math.max(14,Math.min(50,Math.round((prob||60)/2)));const skew=Math.min(24,Math.round((wind||5)*.7))*(dir||1);
    return `<div class="beach-rain" aria-hidden="true" style="--skew:${skew}deg;--density:${density}"><div class="rain-sheet"></div><div class="rain-sheet rain-sheet-b"></div></div>`;}
  function snowLayer(){return `<div class="beach-snow" aria-hidden="true">${Array.from({length:36},(_,i)=>`<i style="--x:${(i*53)%100}%;--d:${8+(i%5)*2}s;--delay:${-(i*1.7)%12}s;--s:${(.5+(i%3)*.3).toFixed(1)}"></i>`).join('')}</div>`;}
  function stars(){return `<div class="beach-stars" aria-hidden="true">${Array.from({length:26},(_,i)=>`<i style="--x:${(i*37+11)%100}%;--y:${(i*23+7)%44}%;--delay:${-(i*.7)%5}s"></i>`).join('')}</div>`;}
  function glints(){return `<div class="beach-glints" aria-hidden="true">${Array.from({length:18},(_,i)=>`<i style="--x:${(i*41+5)%92}%;--y:${56+(i*13)%16}%;--delay:${-(i*.9)%4}s"></i>`).join('')}</div>`;}

  // ---------- wind compass ----------
  function windCompass(weather){
    const cur=current(weather);if(!cur)return '';
    const deg=cur.deg,speed=cur.wind,gust=cur.gust;
    const ring=speed===null?0:Math.min(1,speed/40),gustRing=gust===null||gust===undefined?0:Math.min(1,gust/40);
    const spin=speed?Math.max(1.2,8-speed*.2):0;
    return `<figure class="wind-compass" aria-labelledby="wind-compass-caption">
      <svg viewBox="0 0 200 200" role="img" aria-hidden="true" style="--spin:${spin}s">
        <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" opacity=".25"/>
        <circle cx="100" cy="100" r="78" fill="none" stroke="currentColor" opacity=".12" stroke-dasharray="2 6"/>
        ${[...Array(16)].map((_,i)=>`<line x1="100" y1="10" x2="100" y2="${i%4===0?24:17}" stroke="currentColor" stroke-width="${i%4===0?2.5:1}" transform="rotate(${i*22.5} 100 100)" opacity=".7"/>`).join('')}
        ${['N','E','S','W'].map((l,i)=>`<text x="${[100,170,100,30][i]}" y="${[40,105,172,105][i]}" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">${l}</text>`).join('')}
        <circle class="speed-ring" cx="100" cy="100" r="60" fill="none" stroke="#f6c453" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="${(ring*100).toFixed(1)} 100" transform="rotate(-90 100 100)" opacity=".9"/>
        <circle class="gust-ring" cx="100" cy="100" r="68" fill="none" stroke="#f6c453" stroke-width="2" pathLength="100" stroke-dasharray="${(gustRing*100).toFixed(1)} 100" transform="rotate(-90 100 100)" opacity=".55"/>
        ${speed?`<g class="wind-streaks" style="transform-origin:100px 100px;transform:rotate(${deg===null?0:deg}deg)">${[0,1,2].map(i=>`<path d="M${86+i*14} 150q6 12 0 24" fill="none" stroke="#8fd1df" stroke-width="2" stroke-linecap="round" pathLength="10" style="--i:${i}"/>`).join('')}</g>`:''}
        ${deg===null?'':`<g class="wind-needle" style="transform-origin:100px 100px;transform:rotate(${deg}deg)"><path d="M100 30l9 30h-18z" fill="#f2b544"/><path d="M100 170l-6-30h12z" fill="currentColor" opacity=".55"/><rect x="98.5" y="60" width="3" height="80" fill="currentColor" opacity=".7"/></g>`}
        <circle cx="100" cy="100" r="6" fill="currentColor"/>
      </svg>
      <figcaption id="wind-compass-caption"><strong>${deg===null?'Wind direction not supplied':'Wind from '+compass[Math.round(deg/22.5)%16]+' ('+Math.round(deg)+'°)'}</strong><br>${num(speed,' mph')??'Speed not supplied'}${gust!==null&&gust!==undefined?' · gusts '+num(gust,' mph'):' · gust not supplied'}<br><span>${esc(cur.label)}. Gold ring fills toward 40 mph; the pointer shows where the wind comes from.</span></figcaption>
    </figure>`;
  }

  // ---------- hourly strip ----------
  function hourlyStrip(rows){
    if(!rows?.length)return '';
    const list=rows.slice(0,12),temps=list.map(r=>r.temperature_f).filter(v=>v!==null&&v!==undefined);
    const lo=Math.min(...temps,40),hi=Math.max(...temps,60);
    const w=list.length*96,pts=list.map((r,i)=>r.temperature_f===null||r.temperature_f===undefined?null:[i*96+48,70-((r.temperature_f-lo)/(hi-lo||1))*52]).filter(Boolean);
    const path=pts.length>1?'M'+pts.map(p=>p.join(',')).join(' L'):'';
    return `<div class="hourly-strip" role="group" aria-label="Illustrated hourly forecast; the table below has the same values">
      <svg class="hourly-temp" viewBox="0 0 ${w} 80" preserveAspectRatio="none" aria-hidden="true" style="width:${w}px"><path d="${path}" fill="none" stroke="#f6c453" stroke-width="2.5" stroke-linecap="round" pathLength="100" class="temp-line"/>${pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="#f6c453"/>`).join('')}</svg>
      <ol class="hourly-cards">${list.map((r,i)=>{const light=r.is_daytime===false?'night':'day';const c=classify(r.description,mph(r.wind),r.gust_mph,r.rain_probability,light==='night'?-10:30);
        return `<li style="--i:${i}"><span class="hour">${esc(fmtHour(r.start))}</span>${glyph(c.kind,light,48)}<span class="hour-temp">${num(r.temperature_f,'°')??'—'}</span><span class="hour-wind">${windArrow(degrees(r.direction),20)} ${esc(r.wind)}</span><span class="hour-rain">${r.rain_probability===null||r.rain_probability===undefined?'rain —':'rain '+r.rain_probability+'%'}</span><span class="hour-desc">${esc(r.description)}</span></li>`;}).join('')}</ol>
    </div>`;
  }

  // ---------- tide curve ----------
  function tideCurve(predictions,selectedDate,now=new Date()){
    const all=tideNow(predictions,now).rows;
    if(!all.length)return '';
    const dayStart=localToMs(selectedDate+' 00:00'),dayEnd=dayStart+86400000;
    const inDay=all.filter(r=>r.t>=dayStart&&r.t<dayEnd);
    const before=[...all].reverse().find(r=>r.t<dayStart),after=all.find(r=>r.t>=dayEnd);
    const pts=[before,...inDay,after].filter(Boolean);
    if(pts.length<2)return '<p class="waterfront-muted">Not enough predictions to draw this day.</p>';
    const W=640,H=250,padL=44,padR=16,top=58,bottom=190;const clampX=x=>Math.max(padL+34,Math.min(W-padR-34,x));
    const heights=pts.map(p=>p.v),lo=Math.min(-.5,...heights)-.3,hi=Math.max(4,...heights)+.4;
    const X=t=>padL+((t-dayStart)/86400000)*(W-padL-padR),Y=v=>bottom-((v-lo)/(hi-lo))*(bottom-top);
    // Sample the cosine curve across the day at 10-minute steps.
    const samples=[];for(let t=dayStart;t<=dayEnd;t+=600000){let a=null,b=null;for(let i=0;i<pts.length-1;i++)if(pts[i].t<=t&&pts[i+1].t>=t){a=pts[i];b=pts[i+1];break;}
      if(a&&b){const f=(1-Math.cos(Math.PI*(t-a.t)/(b.t-a.t)))/2;samples.push([X(t),Y(a.v+(b.v-a.v)*f)]);}}
    if(samples.length<2)return '<p class="waterfront-muted">Not enough predictions to draw this day.</p>';
    const line='M'+samples.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' L');
    const area=line+` L${samples[samples.length-1][0].toFixed(1)},${bottom} L${samples[0][0].toFixed(1)},${bottom} Z`;
    const isToday=now.getTime()>=dayStart&&now.getTime()<dayEnd,est=isToday?tideNow(predictions,now):null;
    const hours=[0,3,6,9,12,15,18,21,24];
    const moon=moonPhase(new Date(dayStart+43200000));
    return `<figure class="tide-figure" aria-labelledby="tide-figure-caption">
      <svg class="tide-curve" viewBox="0 0 ${W} ${H}" role="img" aria-hidden="true">
        <defs><linearGradient id="tide-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b8cbe" stop-opacity=".55"/><stop offset="1" stop-color="#0f3d55" stop-opacity=".85"/></linearGradient>
        <pattern id="tide-ripple" width="36" height="8" patternUnits="userSpaceOnUse"><path d="M0 4q9-4 18 0t18 0" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width="1.2"/></pattern></defs>
        ${[0,1,2,3,4,5,6].filter(v=>v>=lo&&v<=hi).map(v=>`<line x1="${padL}" y1="${Y(v)}" x2="${W-padR}" y2="${Y(v)}" stroke="currentColor" opacity=".12"/><text x="${padL-6}" y="${Y(v)+4}" text-anchor="end" font-size="11" fill="currentColor" opacity=".75">${v} ft</text>`).join('')}
        <path class="tide-area" d="${area}" fill="url(#tide-water)"/><path class="tide-ripples" d="${area}" fill="url(#tide-ripple)"/>
        <path class="tide-line" d="${line}" fill="none" stroke="#8fd1df" stroke-width="2.5" pathLength="100"/>
        ${hours.map(h=>`<text x="${X(dayStart+h*3600000)}" y="${bottom+18}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".75">${h===0||h===24?'12a':h===12?'12p':h<12?h+'a':(h-12)+'p'}</text>`).join('')}
        ${inDay.map(p=>`<g class="tide-point"><circle cx="${X(p.t)}" cy="${Y(p.v)}" r="5" fill="#f6c453"/><text x="${clampX(X(p.t))}" y="${p.type==='H'?Y(p.v)-14:Y(p.v)+22}" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">${p.type==='H'?'High':'Low'} ${esc(fmtTime(p.t))}</text><text x="${clampX(X(p.t))}" y="${p.type==='H'?Y(p.v)-28:Y(p.v)+36}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".8">${p.v.toFixed(1)} ft</text></g>`).join('')}
        ${est&&est.height!==null?`<g class="tide-now"><line x1="${X(now.getTime())}" y1="22" x2="${X(now.getTime())}" y2="${bottom}" stroke="#f2b544" stroke-dasharray="4 4"/><circle cx="${X(now.getTime())}" cy="${Y(est.height)}" r="7" fill="#f2b544" class="tide-now-dot"/><text x="${clampX(X(now.getTime()))}" y="16" text-anchor="middle" font-size="12" font-weight="700" fill="#f2b544">Now · about ${est.height.toFixed(1)} ft, ${est.rising?'rising ↑':'falling ↓'}</text></g>`:''}
        <text x="${W-padR}" y="${H-6}" text-anchor="end" font-size="11" fill="currentColor" opacity=".7">${esc(moon.name)}</text>
      </svg>
      <figcaption id="tide-figure-caption">${esc(selectedDate)} · ${moonIcon(moon)} ${esc(moon.name)} (approximate). The curve is a cosine estimate between NOAA's predicted highs and lows, not a measured or forecast water level; wind and pressure change the real level. Times are Eastern.</figcaption>
    </figure>`;
  }

  window.HBABeachScene={hero,windCompass,hourlyStrip,tideCurve,classify,solarElevation,sunTimes,moonPhase,tideNow,glyph,scene};
})();
