(() => {
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const md=x=>String(x??'').replace(/[\\|*_`<>\[\]#]/g,'\\$&').replace(/\r?\n/g,' ');
  const money=x=>Number(x).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
  const pct=x=>Number(x).toLocaleString('en-US',{maximumFractionDigits:2})+'%';
  const limitations=[
    'Planning scenario only. This is not an adopted budget, assessment, contract award, permit, or authorization to spend.',
    'Funding and scheduled years are not construction dates. Design, permits, contractor availability and board/member approvals must be confirmed separately.',
    'Opening capital, paying-household counts, event net proceeds and cost estimates are scenario assumptions, not verified current bank balances or adopted future budgets.',
    'Annual cash timing assumes income is available before modeled spending. This is not a monthly liquidity model.',
    'The separate $15,000 emergency reserve is excluded from baseline opening project capital. The cash-floor target is additional and editable in the affordability model.',
    'No unawarded grants, borrowing, interest, future storm losses, engineering fees, permitting costs or new-project maintenance are added automatically.',
    'A proposed one-time contribution is counted only in its collection year. Confirm participation and required approvals; this export creates no bills and changes no dues records.',
    'Check cleaning allowances against the operating base to avoid double counting. A sample allowance is not proof of an executed contract.',
    'This is a frozen snapshot. Re-create the output after changing inputs; downloaded copies are not recalled when access permissions change.'
  ];
  function normalizeScheduled(input){
    const {base:b,cap:c,results:r}=clone(input);
    const annual=r.rows.map((x,i)=>({year:x.y,opening:i?r.rows[i-1].close:b.open,dues:x.duesIn,events:x.ev,
      support:x.gifts+x.oneTime,operating:-x.op,recurring:-(x.sand+(x.cleaning||0)),
      projects:-(x.reynolds+x.jetty+x.algelo+x.wDrain+x.wPave),closing:x.close}));
    const names=[['reynolds','Reynolds overlay'],['jetty','One jetty'],['algelo','Algelo overlay'],['wDrain','Worrall drainage'],['wPave',c.option==='A'?'Worrall mill + pave':'Worrall overlay']];
    const projects=names.map(([key,title])=>{const row=r.rows.find(x=>x[key]<0);return {title,status:row?'Scheduled spending, not an affordability gate':'Not selected',year:row?.y??null,amount:row?-row[key]:0,source:'Scheduled simulator estimate; not a verified current quote.'};});
    const assumptions=[
      ['Model','Scheduled 2027–2041 capital model'],['Worrall option',c.option==='A'?'A: Mill + drainage':'B: Overlay'+(c.drainB?' + drainage':' without drainage')],
      ['Opening project capital',money(b.open)],['Cash-floor comparison target',money(input.cushion)],
      ['Starting annual dues per paying household',money(c.dues)],['Dues mode',c.autoDues?'Automatic recommendation, not adopted dues':'Manually selected scenario dues'],
      ['Expected paying households',String(c.hh)],['Annual dues, operating and project escalation',pct(c.esc*100)],
      ['Operating base, '+b.base+' dollars',money(b.op)],['Annual net event proceeds',money(b.events)],
      ['Paving campaign share',pct(c.fund*100)+' of Reynolds, Algelo and Worrall paving; additive to one-time support'],
      ['Nourishment',money(b.sand)+' in '+b.base+' dollars, every two years from '+b.sandFirst],
      ['Paving contingency',pct(b.cont*100)],['One-time resident contribution',c.onceEnabled?money(c.onceAmount)+' × '+c.onceHH+' households in '+c.onceYear+' only':'Excluded'],
      ['Cleaning allowance',c.cleanEnabled?money(c.cleanAmount)+(c.cleanBasis==='total'?' total over three years':' per year')+', '+c.cleanYear+'–'+(c.cleanYear+2)+', without escalation or renewal':'Excluded']
    ];
    return {kind:'scheduled',title:'HBA scheduled budget scenario',assumptions,projects,annual,
      opening:b.open,floor:input.cushion,minimum:r.low,lowYear:r.lowYear,closing:r.end,
      warnings:[
        ...(r.low<input.cushion?['Scheduled spending takes year-end capital below the modeled cash-floor target. The schedule does not postpone unaffordable work.']:[]),
        ...(c.fund>0&&c.onceEnabled?['Paving campaigns and the one-time contribution are both included. Confirm they represent different money, not the same resident pledges.']:[])
      ],sources:['Baseline: HBA Road Fund Board Dashboard model, with editable scenario inputs. Underlying estimates are not updated contractor quotes.',
        c.cleanEnabled?'Private cleaning allowance: board input or unsigned sample agreement; confirm executed terms and operating-budget overlap.':'No separate cleaning allowance included.'],
      modelNote:'The scheduled model spends in preset years even when cash is insufficient. It is not a money-driven funding queue.'};
  }
  function normalizeTimeline(input){
    const {settings:s,projects:items,source,results:r}=clone(input);
    const projects=items.map((p,i)=>{const f=r.funded.find(x=>x.id===p.id);return {title:(i+1)+'. '+p.title,
      status:!p.enabled?'Not selected':f?'Estimated funding year':p.cost<=0?'Cost required; queue blocked here':'Not funded within modeled period',
      year:f?.year??null,amount:f?.amount??null,source:(p.source||'Existing simulator estimate; not a verified current quote.')+' Base '+money(p.cost)+'; contingency '+pct(p.cont)+'; not before '+p.earliest+'.'};});
    return {kind:'timeline',title:'HBA project affordability scenario',
      assumptions:[
        ['Model','Strict-priority, money-driven project queue'],['Planning years',s.start+'–'+(s.start+s.horizon-1)],
        ['Opening project capital',money(s.opening)],['Retained project-cash floor',money(s.floor)],
        ['Starting annual dues per paying household',money(s.dues)],['Expected paying households',String(s.households)],['Annual dues increase',pct(s.duesGrowth)],
        ['Operating base, '+s.baseYear+' dollars',money(s.operating)],['Operating cost growth',pct(s.operatingGrowth)],
        ['Annual net event proceeds',money(s.events)],['Project and nourishment cost growth',pct(s.inflation)+' from '+s.baseYear],
        ['Recurring nourishment',s.sandEnabled?money(s.sand)+' every '+s.sandEvery+' years from '+s.start+', inflated from '+s.baseYear:'Excluded'],
        ['Additional cleaning allowance',s.cleanEnabled?money(s.cleanAmount)+' per year, '+s.cleanStart+'–'+(s.cleanStart+s.cleanYears-1)+'; no automatic renewal':'Excluded'],
        ['One-time resident contribution',s.onceEnabled?money(s.onceAmount)+' × '+s.onceHouseholds+' households in '+s.onceYear+' only':'Excluded'],
        ['Paving campaigns','Not added separately; only the explicitly entered one-time support is counted']
      ],projects,annual:r.rows.map(x=>({year:x.year,opening:x.opening,dues:x.dues,events:x.events,support:x.contribution,
        operating:x.operating,recurring:x.sand+x.cleaning,projects:x.paid.reduce((a,p)=>a+p.amount,0),closing:x.closing})),
      opening:s.opening,floor:s.floor,minimum:r.minimum,closing:r.closing,
      warnings:[
        ...(r.minimum<s.floor?['Operating and recurring costs push cash below the retained floor. Deferring discretionary projects alone does not repair this path.']:[]),
        ...(r.waiting.length?[r.waiting.length+' selected project(s) remain unfunded within the modeled period.']:[]),
        ...(r.waiting.some(x=>x.cost<=0)?['A selected project has no positive cost. Its place in the strict queue blocks subsequent projects.']:[])
      ],sources:[source,...items.filter(p=>p.source).map(p=>p.title+': '+p.source)],
      modelNote:'Projects are funded in strict priority order only when the year-end cash floor is preserved. A later project cannot jump ahead of an unfunded priority.'};
  }
  function markdown(s){
    const table=(headers,rows)=>['| '+headers.map(md).join(' | ')+' |','| '+headers.map(()=> '---').join(' | ')+' |',...rows.map(row=>'| '+row.map(md).join(' | ')+' |')].join('\n');
    return '# '+s.title+'\n\n'+s.audience+' | PLANNING ONLY\n\nGenerated: '+s.generated+'\n\nSnapshot: '+s.id+'\n\n'+s.modelNote+
      '\n\n## Summary\n\nOpening project capital: '+money(s.opening)+'. Lowest year-end capital: '+money(s.minimum)+'. Closing project capital: '+money(s.closing)+'. Cash-floor target: '+money(s.floor)+'.\n\n'+
      (s.warnings.length?'## Matters to resolve\n\n'+s.warnings.map(x=>'- '+md(x)).join('\n')+'\n\n':'')+
      '## Scenario assumptions\n\n'+table(['Assumption','Value'],s.assumptions)+
      '\n\n## Projects\n\n'+table(['Project','Status','Year','Modeled spending','Basis'],s.projects.map(p=>[p.title,p.status,p.year??'Not assigned',p.amount===null?'Not determined':money(p.amount),p.source]))+
      '\n\n## Annual cash flow\n\nAmounts are US dollars. Support includes modeled contributions and, for the scheduled model only, paving campaigns. Displayed values are rounded to cents; calculations retain model precision.\n\n'+
      table(['Year','Opening','Dues','Event net','Support','Operating','Nourishment + cleaning','Projects','Closing'],s.annual.map(r=>[r.year,...['opening','dues','events','support','operating','recurring','projects','closing'].map(k=>money(r[k]))]))+
      '\n\n## Local weather and wind at report generation\n\n'+weatherMarkdown(s,table)+
      '\n\n## Input provenance\n\n'+s.sources.map(x=>'- '+md(x)).join('\n')+
      '\n\n## Limits and decisions before adoption\n\n'+limitations.map(x=>'- '+x).join('\n')+'\n';
  }
  function weatherMarkdown(s,table){
    const w=s.weather;
    if(!w)return (s.weatherLoading?'Weather snapshot still loading.':md(s.weatherError||'Weather unavailable; no current conditions assumed.'))+
      '\n\nCheck the [official Hamilton Beach forecast]('+window.HBALocalWeather.source+'). This does not change financial calculations.\n';
    return 'A timestamped context snapshot, not weather for future project years. Wind direction means where wind comes from; missing gusts are not zero.\n\n'+
      table(['Weather / wind','Snapshot value'],window.HBALocalWeather.textRows(w))+
      '\n\nForecast: [National Weather Service Hamilton Beach forecast]('+w.source+'); [hourly data]('+w.forecast_source+'); [gust grid]('+w.grid_source+').'+
      (w.observation?' Observations: [NWS '+md(w.observation.station)+']('+w.observation.source+').':'')+
      '\n\n'+table(['Forecast valid from (Eastern)','Weather','Temperature','Wind from','Gust'],w.hourly.slice(0,12).map(p=>[
        window.HBALocalWeather.local(p.start),p.description,p.temperature_f==null?'Not supplied':p.temperature_f+'°F',
        p.direction+' '+p.wind,p.gust_mph==null?'Not supplied':p.gust_mph+' mph']))+
      '\n\n'+(w.warnings||[]).map(t=>'- '+md(t)).join('\n')+
      '\n\nNot a marine forecast, on-beach measurement, storm-surge prediction or swimming/shellfishing clearance. Weather is independent of astronomical tide predictions and does not alter this financial model.';
  }
  let snapshot=null,mode='report',slide=0,slides=[],lastFocus=null,weatherEpoch=0;
  const dialog=document.createElement('dialog');dialog.id='budget-output-dialog';dialog.setAttribute('aria-labelledby','budget-output-title');
  dialog.innerHTML='<div class="bo-shell"><header class="bo-header"><div><p id="bo-audience"></p><h2 id="budget-output-title">Budget scenario output</h2></div><button type="button" id="bo-close">Back to scenario</button></header><nav class="bo-toolbar" aria-label="Scenario outputs"><button type="button" id="bo-report">Report view</button><button type="button" id="bo-slides">Presentation view</button><button type="button" id="bo-download">Download report (.md)</button><button type="button" id="bo-print">Print / save PDF</button></nav><p id="bo-print-help" class="bo-note">Print uses your browser’s print dialog. Choose Save as PDF if available. Review board-private costs before sharing.</p><div class="bo-content" id="bo-content"></div><footer class="bo-footer"><div id="bo-slide-controls"><button type="button" id="bo-prev">Previous</button><span id="bo-slide-status" role="status"></span><button type="button" id="bo-next">Next</button></div><p id="bo-snapshot" class="bo-note"></p></footer></div>';
  document.body.append(dialog);
  const weatherStatus=document.createElement('p');weatherStatus.id='bo-weather-status';weatherStatus.className='bo-note';weatherStatus.setAttribute('role','status');
  dialog.querySelector('#bo-print-help').after(weatherStatus);
  const $=id=>document.getElementById(id);
  const table=(headers,rows)=>'<div class="bo-table"><table><thead><tr>'+headers.map(x=>'<th scope="col">'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map((x,i)=>'<'+(i?'td':'th scope="row"')+'>'+esc(x)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</tbody></table></div>';
  const bullets=items=>'<ul>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
  function buildSections(s){
    const rows=s.annual.map(r=>[r.year,money(r.opening),money(r.dues+r.events+r.support),money(r.operating+r.recurring),money(r.projects),money(r.closing)]);
    return [
      ['Scenario summary','<p>'+esc(s.modelNote)+'</p>'+table(['Measure','Scenario value'],[
        ['Opening project capital',money(s.opening)],['Lowest year-end capital',money(s.minimum)],['Cash-floor target',money(s.floor)],['Closing project capital',money(s.closing)]])+
        (s.warnings.length?'<h3>Matters to resolve</h3>'+bullets(s.warnings):'<p>No year-end cash-floor breach is modeled. This does not establish approval or actual affordability.</p>')],
      ...Array.from({length:Math.ceil(s.assumptions.length/7)},(_,i)=>['Scenario assumptions'+(i?' (continued)':''),table(['Assumption','Value'],s.assumptions.slice(i*7,i*7+7))]),
      ['Project schedule',table(['Project','Status','Year','Modeled spending'],s.projects.map(p=>[p.title,p.status,p.year??'Not assigned',p.amount===null?'Not determined':money(p.amount)]))+'<p>Funding or scheduled spending is not a construction approval.</p>'],
      ...Array.from({length:Math.ceil(rows.length/5)},(_,i)=>['Annual cash flow: '+rows[i*5][0]+'–'+rows[Math.min(rows.length-1,i*5+4)][0],
        table(['Year','Opening','Income + support','Operating + recurring','Projects','Closing'],rows.slice(i*5,i*5+5))+'<p>Income includes dues, net events and modeled support. Recurring costs include nourishment and any separate cleaning allowance.</p>']),
      ['Input provenance',bullets(s.sources)+table(['Project','Cost basis'],s.projects.map(p=>[p.title,p.source]))],
      ['Local weather & wind at report generation',
        '<p>Context at generation, not a forecast for future construction years. It does not change this financial scenario.</p>'+
        window.HBALocalWeather.panel(s.weather,s.weatherError||'Loading weather snapshot…')],
      ...Array.from({length:Math.ceil(limitations.length/5)},(_,i)=>['Limits and decisions before adoption'+(i?' (continued)':''),bullets(limitations.slice(i*5,i*5+5))])
    ];
  }
  function render(){
    if(!snapshot)return;
    $('budget-output-title').textContent=snapshot.title;
    $('bo-audience').textContent=snapshot.audience+' · Planning only';
    $('bo-snapshot').textContent='Frozen snapshot '+snapshot.id+' · '+snapshot.generated;
    $('bo-weather-status').textContent=snapshot.weatherLoading?'Loading local weather and wind before export…':snapshot.weather?'Weather snapshot captured; re-create the report for newer conditions.':'Weather unavailable; the report will explicitly note the missing conditions.';
    $('bo-download').disabled=!!snapshot.weatherLoading;$('bo-print').disabled=!!snapshot.weatherLoading;
    $('bo-report').setAttribute('aria-pressed',String(mode==='report'));
    $('bo-slides').setAttribute('aria-pressed',String(mode==='presentation'));
    $('bo-slide-controls').hidden=mode!=='presentation';
    $('bo-content').classList.toggle('bo-presentation',mode==='presentation');
    $('bo-content').innerHTML=slides.map(([title,body],i)=>'<section class="bo-section"'+(mode==='presentation'&&i!==slide?' hidden':'')+'><p class="bo-note">Hamilton Beach Association · '+esc(snapshot.audience)+' · Planning only</p><h3>'+esc(title)+'</h3>'+body+'</section>').join('');
    $('bo-prev').disabled=slide===0;$('bo-next').disabled=slide===slides.length-1;
    $('bo-slide-status').textContent='Slide '+(slide+1)+' of '+slides.length;
    $('bo-content').scrollTop=0;
  }
  function open(s,requested='report'){
    const board=!!window.HBACommunity?.isBoard();
    if(s.kind==='timeline'&&!board)throw Error('Board view is required for this output.');
    const own=++weatherEpoch;
    snapshot=clone({...s,audience:board?'BOARD PRIVATE':'RESIDENT WHAT-IF',generated:new Date().toLocaleString('en-US',{timeZone:'America/New_York',timeZoneName:'short'}),id:'HBA-'+new Date().toISOString(),weatherLoading:true});
    slides=buildSections(snapshot);mode=requested;slide=0;lastFocus=document.activeElement;render();if(!dialog.open)dialog.showModal();
    window.HBALocalWeather.load().then(w=>{
      if(own!==weatherEpoch||!snapshot)return;
      snapshot.weather=clone(w);
    }).catch(e=>{
      if(own===weatherEpoch&&snapshot)snapshot.weatherError=e.message;
    }).finally(()=>{
      if(own!==weatherEpoch||!snapshot)return;
      const position=$('bo-content').scrollTop;
      snapshot.weatherLoading=false;slides=buildSections(snapshot);render();$('bo-content').scrollTop=position;
    });
  }
  function download(){
    if(!snapshot)return;
    const a=document.createElement('a'),url=URL.createObjectURL(new Blob([markdown(snapshot)],{type:'text/markdown;charset=utf-8'}));
    a.href=url;a.download='HBA-'+snapshot.kind+'-'+(snapshot.audience==='BOARD PRIVATE'?'board-private':'resident-what-if')+'-'+new Date().toISOString().slice(0,10)+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('bo-report').onclick=()=>{mode='report';render();};
  $('bo-slides').onclick=()=>{mode='presentation';render();};
  $('bo-prev').onclick=()=>{slide=Math.max(0,slide-1);render();};
  $('bo-next').onclick=()=>{slide=Math.min(slides.length-1,slide+1);render();};
  $('bo-download').onclick=download;
  $('bo-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{++weatherEpoch;snapshot=null;slides=[];$('bo-content').replaceChildren();lastFocus?.focus?.({preventScroll:true});});
  document.addEventListener('keydown',e=>{
    if(!dialog.open||mode!=='presentation'||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
    e.preventDefault();slide=e.key==='Home'?0:e.key==='End'?slides.length-1:Math.max(0,Math.min(slides.length-1,slide+(e.key==='ArrowRight'?1:-1)));render();
  });
  let printDetails=[];
  function preparePrint(){
    if(!snapshot)return;
    document.body.classList.add('hba-print-budget');
    if(!printDetails.length)printDetails=[...dialog.querySelectorAll('details')].map(el=>[el,el.open]);
    printDetails.forEach(([el])=>el.open=true);
  }
  function clearPrint(){document.body.classList.remove('hba-print-budget');printDetails.forEach(([el,open])=>el.open=open);printDetails=[];}
  $('bo-print').onclick=()=>{
    if(!snapshot)return;
    preparePrint();
    try{window.print();}catch{$('bo-print-help').textContent='Printing is unavailable here. Download the report instead.';}
    finally{clearPrint();}
  };
  window.addEventListener('beforeprint',preparePrint);
  window.addEventListener('afterprint',clearPrint);
  document.addEventListener('hba-account-change',()=>{if(dialog.open)dialog.close();});
  window.HBABudgetOutputs={normalizeScheduled,normalizeTimeline,markdown,
    openScheduled:(input,requested)=>open(normalizeScheduled(input),requested),
    openTimeline:(input,requested)=>open(normalizeTimeline(input),requested)};
})();
