(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const topics={roads:'Road closures & repairs',beach:'Beach closures & updates',events:'Event updates',speed_bumps:'Speed-bump installation',votes:'Votes, polls & results',meetings:'Meeting notices & reminders',weather:'Severe weather & coastal flooding',general:'Other board notices'};
  let year='',selected='';
  // ---- Suggested alerts built from data the app already pulls from the internet (NWS, NOAA, HBA calendar) ----
  let suggest={state:'idle',items:[],sources:[],at:null,errors:[]};
  const TZ='America/New_York';
  const fmtTime=iso=>{const d=new Date(iso);return Number.isNaN(d)?'':d.toLocaleTimeString('en-US',{timeZone:TZ,hour:'numeric',minute:'2-digit'});};
  const fmtDay=iso=>{const d=new Date(iso);return Number.isNaN(d)?'':d.toLocaleDateString('en-US',{timeZone:TZ,weekday:'long',month:'short',day:'numeric'});};
  const fmtWhen=iso=>fmtDay(iso)+' at '+fmtTime(iso);
  const fmtKey=key=>new Date(key+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  const clock=t=>{const [h,mi]=String(t||'').split(':').map(Number);return Number.isInteger(h)?new Date(2000,0,1,h,mi||0).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'';};
  const mphOf=w=>{const m=String(w||'').match(/(\d+)(?:\s*to\s*(\d+))?/);return m?Number(m[2]||m[1]):null;};
  const trim=(t,n=300)=>{t=String(t).replace(/\s+/g,' ').trim();return t.length<=n?t:t.slice(0,n-1).replace(/\s+\S*$/,'')+'…';};
  const localMs=s=>{const [d,hm]=s.split(' '),[Y,M,D]=d.split('-').map(Number),[h,m]=hm.split(':').map(Number);const guess=Date.UTC(Y,M-1,D,h,m);const parts=new Intl.DateTimeFormat('en-US',{timeZone:TZ,hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(guess));const g=k=>Number(parts.find(p=>p.type===k).value);return guess-(Date.UTC(g('year'),g('month')-1,g('day'),g('hour')%24,g('minute'))-guess);};
  function buildSuggestions(weather,tides,alerts,upcoming){
    const out=[],now=Date.now(),H=36e5,todayKey=new Date().toLocaleDateString('en-CA',{timeZone:TZ});
    const hourly=(weather?.hourly||[]).filter(p=>{const t=Date.parse(p.start);return t>=now-H&&t<=now+48*H;});
    // 1. Active NWS alerts, one suggestion each.
    for(const a of alerts?.alerts||[]){
      const until=a.valid_until?` until ${fmtWhen(a.valid_until)}`:'';
      const instr=(a.instruction||'').split(/(?<=\.)\s+/)[0]||'Read the full NWS notice before going near the water.';
      out.push({category:'weather',title:`NWS ${a.event}`,message:trim(`NWS ${a.event} in effect${until}. ${instr} This is a board notice, not an emergency service; call 911 for emergencies.`),basis:`NWS alert "${a.headline}" (${a.severity} severity), issued ${fmtWhen(a.sent)}`});
    }
    // 2. High tide coinciding with strong forecast wind, or a coastal alert.
    const highs=(tides?.predictions||[]).filter(r=>r.type==='H').map(r=>({...r,ms:localMs(r.t),v:Number(r.v)})).filter(r=>r.ms>now&&r.ms<now+48*H);
    const coastal=(alerts?.alerts||[]).some(a=>a.coastal);
    for(const h of highs){
      const near=hourly.filter(p=>Math.abs(Date.parse(p.start)-h.ms)<=2*H);
      const gust=Math.max(0,...near.map(p=>p.gust_mph||0)),wind=Math.max(0,...near.map(p=>mphOf(p.wind)||0));
      const dir=near.find(p=>p.direction&&p.direction!=='Not supplied')?.direction;
      if(coastal||gust>=30||wind>=25){
        out.push({category:'weather',title:'High tide with strong wind',message:trim(`High tide at Great Hill ${fmtWhen(new Date(h.ms).toISOString())}, predicted ${h.v.toFixed(1)} ft MLLW, with NWS winds of ${wind||'—'} mph${gust?` gusting ${gust} mph`:''}${dir?` from the ${dir}`:''}. Please secure boats, kayaks and beach furniture along the shore.${coastal?' A coastal alert is in effect.':''}`),basis:`NOAA Great Hill tide prediction ${h.t} and the NWS hourly forecast within two hours of it`});
        break;
      }
    }
    // 3. Strong wind on its own.
    const windy=hourly.filter(p=>(p.gust_mph||0)>=35).sort((a,b)=>(b.gust_mph||0)-(a.gust_mph||0))[0];
    if(windy&&!out.some(o=>o.title==='High tide with strong wind'))out.push({category:'weather',title:'Wind heads-up',message:trim(`NWS forecasts gusts to ${windy.gust_mph} mph around ${fmtWhen(windy.start)} (${windy.description}). Secure loose items on porches, docks and the beach, and check boat lines.`),basis:`NWS hourly forecast period starting ${fmtWhen(windy.start)}`});
    // 4. Freeze or heat.
    const temps=hourly.map(p=>p.temperature_f).filter(t=>typeof t==='number');
    const month=new Date().getMonth()+1;
    if(temps.length&&Math.min(...temps)<=32&&(month>=10||month<=4)){const p=hourly.find(x=>x.temperature_f===Math.min(...temps));out.push({category:'general',title:'Freeze forecast',message:trim(`NWS forecasts a low near ${Math.round(Math.min(...temps))}°F around ${fmtWhen(p.start)}. If your cottage is closed for the season, confirm the water is shut off and lines are drained.`),basis:`NWS hourly forecast, coldest period in the next 48 hours`});}
    if(temps.length&&Math.max(...temps)>=90){const p=hourly.find(x=>x.temperature_f===Math.max(...temps));out.push({category:'beach',title:'Heat day',message:trim(`NWS forecasts about ${Math.round(Math.max(...temps))}°F around ${fmtWhen(p.start)}. Check on neighbors who live alone, bring water to the beach and keep dogs off hot sand midday.`),basis:`NWS hourly forecast, warmest period in the next 48 hours`});}
    // 5. Calendar: events within 14 days (with the rain outlook when the forecast reaches that day) and meetings within 7 days.
    const D=window.HBAEventDates,days=key=>Math.round((new Date(key+'T12:00:00')-new Date(todayKey+'T12:00:00'))/864e5);
    for(const e of upcoming?.events||[]){
      if(e.state!=='scheduled')continue;const key=D?D.effective(e):e.event_date,d=days(key);if(d<0||d>14)continue;
      const dayPeriods=(weather?.hourly||[]).filter(p=>new Date(p.start).toLocaleDateString('en-CA',{timeZone:TZ})===key&&p.is_daytime!==false);
      const rain=dayPeriods.length?Math.max(...dayPeriods.map(p=>p.rain_probability||0)):null;
      const rainNote=e.rain_date&&!e.use_rain_date?` Rain date: ${fmtKey(e.rain_date)}.`:'';
      const outlook=rain!==null?` NWS currently gives up to ${rain}% chance of rain that day; watch for a final call from the board.`:'';
      out.push({category:'events',title:e.title,message:trim(`${e.title} is ${d===0?'today':d===1?'tomorrow':fmtKey(key)}${e.event_time?` at ${clock(e.event_time)}`:''}${e.location?` at ${e.location}`:''}.${e.planning_only?' Details are still being planned.':''}${rainNote}${outlook}`),basis:`HBA calendar event${rain!==null?' and the NWS forecast for '+fmtKey(key):''}`});
    }
    const rule=D?D.parseRule(upcoming?.board_meeting_rule):null;
    const meetings=[...(upcoming?.meetings||[]).filter(m=>m.state==='scheduled').map(m=>({...m,projected:false})),...(rule&&D?D.boardMeetingsBetween(rule,todayKey,2,upcoming?.meetings||[]).map(m=>({...m,projected:true})):[])];
    for(const m of meetings){const d=days(m.meeting_date);if(d<0||d>7)continue;
      out.push({category:'meetings',title:m.title,message:trim(`Reminder: ${m.title} ${d===0?'today':d===1?'tomorrow':fmtKey(m.meeting_date)} at ${clock(m.meeting_time)}${m.location?`, ${m.location}`:', location to be announced'}.${m.projected?' Standing monthly date; the board will confirm the agenda and location.':''}`),basis:m.projected?'Standing third-Tuesday schedule set by the administrator (not yet recorded by the board)':'Recorded HBA meeting'});}
    return out;
  }
  async function loadSuggestions(c){
    if(suggest.state==='loading')return;suggest={state:'loading',items:[],sources:[],at:null,errors:[]};c.render();
    const api=c.api||window.HBACommunity.api,errors=[];
    const grab=(label,p)=>p.then(v=>({label,v})).catch(e=>{errors.push(`${label}: ${e.message}`);return {label,v:null};});
    const [w,t,a,u]=await Promise.all([grab('NWS forecast',window.HBALocalWeather.load()),grab('NOAA tides',api('/api/tides')),grab('NWS alerts',api('/api/weather-alerts')),grab('HBA calendar',api('/api/upcoming'))]);
    const sources=[w.v&&`NWS forecast updated ${fmtWhen(w.v.forecast_updated_at||w.v.retrieved_at)}${w.v.forecast_stale?' (stale)':''}`,t.v&&`NOAA Great Hill predictions retrieved ${fmtWhen(t.v.retrieved_at)}`,a.v&&`NWS alerts (${(a.v.alerts||[]).length} active) checked ${fmtWhen(a.v.retrieved_at||a.v.checked_at||new Date().toISOString())}`,u.v&&`HBA calendar for ${u.v.today}`].filter(Boolean);
    let items=[];try{items=buildSuggestions(w.v,t.v,a.v,u.v);}catch(e){errors.push('Suggestion builder: '+e.message);}
    suggest={state:'ready',items,sources,at:new Date().toISOString(),errors};c.render();
  }
  function suggestionsPanel(c){
    const body=suggest.state==='idle'||suggest.state==='loading'?'<p class="community-muted">Reading the NWS forecast, NWS alerts, NOAA tide predictions and the HBA calendar…</p>'
      :`${suggest.items.length?suggest.items.map((s,i)=>`<article class="community-card communications-suggest"><div><span class="community-tag">${esc(topics[s.category])} · Suggested</span><h4>${esc(s.title)}</h4><p class="communications-sms-preview">HBA: ${esc(s.message)}</p><small>Based on: ${esc(s.basis)}. ${s.message.length} characters.</small></div><div class="community-actions"><button type="button" data-sms-suggest="${i}">Use this draft</button></div></article>`).join(''):'<p class="community-muted">Nothing to suggest right now: no active NWS alerts, no strong wind or temperature extremes in the 48-hour forecast, and no calendar dates in the next two weeks.</p>'}
      <p class="community-muted">Sources: ${suggest.sources.map(esc).join(' · ')||'none reached'}.${suggest.errors.length?` Not reached: ${suggest.errors.map(esc).join('; ')}.`:''} Beach status is not used for suggested texts yet; the Beach & weather report reads the DPH dashboard and DMF classification directly, or check the <a href="https://www.mass.gov/info-details/interactive-beach-water-quality-dashboard" target="_blank" rel="noopener">DPH swimming dashboard</a> or <a href="https://wareham.ma.us/261/Shellfish-Map-and-Information" target="_blank" rel="noopener">Wareham shellfish notices</a> before drafting a beach notice.</p>`;
    return `<section class="community-story"><div class="community-section-head"><div><h3>Suggested alerts from live data</h3><p>Written automatically from what the app already pulls from the internet. Review and edit before saving; saving creates a draft only and nothing is sent.</p></div><button type="button" id="sms-suggest-refresh"${suggest.state==='loading'?' disabled':''}>Refresh suggestions</button></div>${body}</section>`;
  }
  const date=s=>new Date(s+'T12:00:00').toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  const issueDate=n=>n.issue_precision==='month'?new Date(n.issue_date+'T12:00:00').toLocaleDateString('en-US',{year:'numeric',month:'long'}):date(n.issue_date);
  const empty=(h,p)=>`<section class="community-empty"><h3>${esc(h)}</h3><p>${esc(p)}</p></section>`;
  function newsletter(c){
    const all=c.data.newsletters||[],years=[...new Set(all.map(n=>n.issue_date.slice(0,4)))].sort().reverse();
    const rows=all.filter(n=>!year||n.issue_date.startsWith(year));
    if(!rows.some(n=>n.id===selected))selected=rows[0]?.id||'';
    const n=rows.find(n=>n.id===selected),edit=c.data.can_edit_newsletter;
    return `<div class="community-section-head"><div><h3>HBA newsletter</h3><p>Association updates, archived by issue date. Published issues are available to approved residents and board members.</p></div>${edit?'<button type="button" id="news-create">Create newsletter draft</button>':''}</div>
      <p class="community-notice">${edit?'You can prepare drafts, attach a PDF, preview and publish to the member archive. Only the administrator can delete.':'The linked secretary account and administrator manage newsletter content. Other members have read-only access.'}</p>
      <div class="community-filters"><label>Year<select id="news-year"><option value="">All years</option>${years.map(y=>`<option value="${y}"${year===y?' selected':''}>${y}</option>`).join('')}</select></label><label>Issue<select id="news-issue">${rows.length?rows.map(n=>`<option value="${n.id}"${selected===n.id?' selected':''}>${esc(n.issue_date+' · '+n.title+(n.state==='draft'?' · Draft':''))}</option>`).join(''):'<option value="">No issues yet</option>'}</select></label></div>
      ${n?`<article class="community-story news-reader"><span class="community-tag">${n.state==='draft'?'Private draft':'Published to members'} · ${issueDate(n)}</span><h3>${esc(n.title)}</h3><p class="community-prewrap">${esc(n.body||'This issue is provided as an attached PDF.')}</p><div class="community-actions">${n.file_path?`<button type="button" data-file-kind="newsletter" data-file-id="${n.id}">Read newsletter PDF</button>`:''}${n.original_path?`<button type="button" data-file-kind="newsletter-original" data-file-id="${n.id}">Download original Word issue</button>`:''}${edit?`${n.state==='draft'?`<button type="button" id="news-edit">Edit draft</button><button type="button" id="news-file">${n.file_path?'Replace':'Attach'} PDF</button><button type="button" id="news-publish">Review & publish</button>`:'<button type="button" id="news-unpublish">Return to draft to edit</button>'}${c.deleteButton('newsletter',n.id)}`:''}</div><small>Last updated ${esc(n.updated_at.slice(0,10))}. Publication here does not send an email or text.</small></article>`:empty('Ready for your last newsletter','No newsletter has been invented. Once you supply the reference issue, it can be added with its original date and PDF.')}`;
  }
  function sms(c){
    const p=c.data.sms_preferences?.[0],counts=c.data.sms_counts||{opted_in:0,topics:{}};
    return `<div class="community-section-head"><div><h3>Neighborhood text alerts</h3><p>Choose which board notices you want by SMS. Signup is optional and separate from association membership.</p></div></div>
      <p class="community-notice" role="status"><strong>Text delivery is not active.</strong> Preferences can be saved now, but no texts are being sent. A sender connection, phone verification and unsubscribe handling must be configured before launch. This is not an emergency service.</p>
      <section class="community-story"><h3>Your signup & preferences</h3><p>${p?.opted_in?'Signup recorded; awaiting service activation and phone verification.':p?'You have opted out. No SMS messages should be sent to this account.':'You have not signed up for text alerts.'}</p>${p?`<p>Mobile: ${esc(p.phone)}</p><p>Selected topics: ${p.topics.map(t=>esc(topics[t])).join(', ')}</p><small>Updated ${esc(p.updated_at.slice(0,10))}. Your number is private to your account; board tools show aggregate signup counts, not a phone list.</small>`:''}<div class="community-actions"><button type="button" id="sms-preferences">${p?'Change preferences / sign up':'Sign up for text alerts'}</button>${p?.opted_in?'<button type="button" id="sms-opt-out">Opt out of all text alerts</button>':''}</div></section>
      ${c.isBoard()?`<section class="community-story"><div class="community-section-head"><div><h3>Board alert drafts</h3><p>${counts.opted_in} accounts opted in, pending activation. These are consent records, not verified reachable phones.</p></div><button type="button" id="sms-compose">Compose alert draft</button></div><ul class="communications-topics">${Object.entries(topics).map(([k,l])=>`<li><strong>${esc(l)}:</strong> ${counts.topics[k]||0} signups</li>`).join('')}</ul><p>No recipient import or automatic sending is enabled. Prepare the notice, check the location and timing, and review the exact message before any future send.</p>
      ${suggestionsPanel(c)}<h4 class="communications-drafts-head">Saved drafts</h4>
      ${(c.data.sms_drafts||[]).map(d=>`<article class="community-card"><div><span class="community-tag">${esc(topics[d.category])} · Draft, not sent</span><p class="community-prewrap">${esc(d.message)}</p><small>Updated ${esc(d.updated_at.slice(0,10))}</small><details><summary>Preview text message</summary><p class="communications-sms-preview">HBA: ${esc(d.message)}</p><p>${counts.topics[d.category]||0} opted-in accounts for this topic; phone verification and current consent must be rechecked before sending.</p></details></div><div class="community-actions"><button type="button" data-sms-edit="${d.id}">Edit draft</button><button type="button" disabled title="SMS service has not been activated">Send unavailable</button>${c.deleteButton('sms-draft',d.id)}</div></article>`).join('')||empty('No alert drafts yet','Examples: road repair closures, beach access changes, event updates or speed-bump installation dates. These examples are not current neighborhood notices.')}</section>`:''}`;
  }
  function bind(c,root){
    const click=(id,fn)=>{const b=root.querySelector('#'+id);if(b)b.onclick=fn;};
    const field=(name,label,type='text',value='',max=180)=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" required maxlength="${max}"></label>`;
    function editNewsletter(n){
      c.formDialog(n?'Edit newsletter draft':'Create newsletter draft',field('title','Issue title','text',n?.title||'')+field('issue_date','Issue date (use first day for a month-only source)','date',n?.issue_date||new Date().toLocaleDateString('en-CA'))+`<label>Source date precision<select name="issue_precision"><option value="day">Exact date known</option><option value="month"${n?.issue_precision==='month'?' selected':''}>Month only; do not display a specific day</option></select></label><label>Newsletter text<textarea name="body" rows="14" maxlength="40000">${esc(n?.body||'')}</textarea></label><p>Plain text is supported. Save the draft first, then optionally attach a PDF. Nothing is published automatically.</p>`,async fd=>{
        const saved=await c.mutate('/api/newsletters'+(n?'/'+n.id:''),{method:n?'PUT':'POST',body:JSON.stringify(Object.fromEntries(fd))},'Newsletter draft saved. Not published or emailed.');
        selected=saved.id;c.render();
      },{},'Save draft');
    }
    const current=c.data.newsletters?.find(n=>n.id===selected);
    click('news-create',()=>editNewsletter());
    click('news-edit',()=>editNewsletter(current));
    click('news-file',()=>c.formDialog('Attach newsletter PDF','<p>The PDF is stored privately. Only members who can read this issue can open it. Replaced files remain retained for administrator-only deletion.</p><label>PDF, up to 8 MB<input type="file" name="file" accept=".pdf,application/pdf" required></label>',fd=>c.mutate('/api/newsletters/'+current.id+'/file',{method:'POST',body:fd},'PDF attached to the draft.'),{},'Attach PDF'));
    click('news-publish',()=>c.formDialog('Review newsletter publication',`<p><strong>Audience:</strong> all approved HBA residents and board accounts in this app. This does not post to the public web or send email/SMS.</p><h4>${esc(current.title)}</h4><p>Issue date: ${date(current.issue_date)}</p><p class="community-prewrap">${esc(current.body)}</p>${current.file_path?'<p>The attached PDF will also become readable to members. Review it before proceeding.</p>':''}<label class="communications-check"><input type="checkbox" required> I reviewed the text${current.file_path?' and attached PDF':''} and approve publication to members.</label>`,()=>c.mutate('/api/newsletters/'+current.id+'/state',{method:'PUT',body:JSON.stringify({state:'published'})},'Newsletter published to the member archive.'),{},'Publish to members'));
    click('news-unpublish',()=>c.formDialog('Return newsletter to draft','<p>This removes the issue from resident view while it is edited. It does not delete the issue or its files.</p>',()=>c.mutate('/api/newsletters/'+current.id+'/state',{method:'PUT',body:JSON.stringify({state:'draft'})},'Issue returned to private draft.'),{},'Return to draft'));
    const y=root.querySelector('#news-year');if(y)y.onchange=()=>{year=y.value;selected='';c.render();};
    const i=root.querySelector('#news-issue');if(i)i.onchange=()=>{selected=i.value;c.render();};
    click('sms-preferences',()=>{
      const p=c.data.sms_preferences?.[0];
      c.formDialog('Text-alert signup',field('phone','Your US mobile number','tel',p?.phone||'',30)+`<fieldset><legend>Choose your topics</legend>${Object.entries(topics).map(([v,l])=>`<label class="communications-check"><input name="topics" value="${v}" type="checkbox"${p?.topics.includes(v)?' checked':''}> ${esc(l)}</label>`).join('')}</fieldset><label class="communications-check"><input type="checkbox" name="consent" required> I agree to receive HBA automated neighborhood text alerts at this number for my selected topics. Frequency varies; message and data rates may apply. Signup is optional, not a condition of membership, and I can opt out in this app at any time.</label><p>Delivery is not active yet. Phone verification and STOP/HELP instructions must be provided before activation. Do not use this service for emergencies. No cleaning costs or individual dues statuses belong in neighborhood alerts.</p>`,async fd=>{
        if(!fd.getAll('topics').length)throw Error('Select at least one topic.');
        await c.mutate('/api/sms/preferences',{method:'PUT',body:JSON.stringify({phone:fd.get('phone'),topics:fd.getAll('topics'),consent:fd.has('consent'),opted_in:true})},'Signup saved. Text delivery is not active yet.');
      },{},'Save signup & consent');
    });
    click('sms-opt-out',()=>{
      const p=c.data.sms_preferences[0];
      c.formDialog('Opt out of text alerts','<p>This immediately records your opt-out for all topics. Your consent history is retained; opting out does not delete your account or affect membership.</p>',()=>c.mutate('/api/sms/preferences',{method:'PUT',body:JSON.stringify({phone:p.phone,topics:p.topics,opted_in:false,consent:false})},'Opted out of all text alerts.'),{},'Confirm opt-out');
    });
    function compose(d){
      c.formDialog(d?.id?'Edit alert draft':'Compose board alert',`<label>Notification topic<select name="category">${Object.entries(topics).map(([v,l])=>`<option value="${v}"${d?.category===v?' selected':''}>${esc(l)}</option>`).join('')}</select></label><label>Message<textarea name="message" rows="6" required maxlength="1000" placeholder="Example only: road section, date, time, access arrangements and board contact.">${esc(d?.message||'')}</textarea></label><p>For road closures, beach closures, event updates, speed-bump dates or other board notices. Include the location, exact date/time and what residents should do. Do not include private household or cleaning-financial information. Saving creates a draft only; no text is sent.</p>`,fd=>c.mutate('/api/sms/drafts'+(d?.id?'/'+d.id:''),{method:d?.id?'PUT':'POST',body:JSON.stringify(Object.fromEntries(fd))},'Board alert draft saved. No text was sent.'),{},'Save draft only');
    }
    click('sms-compose',()=>compose());
    click('sms-suggest-refresh',()=>loadSuggestions(c));
    root.querySelectorAll('[data-sms-suggest]').forEach(b=>b.onclick=()=>{const sug=suggest.items[Number(b.dataset.smsSuggest)];if(sug)compose({category:sug.category,message:sug.message});});
    if(c.isBoard()&&root.querySelector('#sms-suggest-refresh')&&suggest.state==='idle')loadSuggestions(c);
    root.querySelectorAll('[data-sms-edit]').forEach(b=>b.onclick=()=>compose(c.data.sms_drafts.find(d=>d.id===b.dataset.smsEdit)));
  }
  window.HBACommunications={newsletter,sms,bind};
})();
