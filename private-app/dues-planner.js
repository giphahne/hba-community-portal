/* Dues planner and "What my dues buy": a plain-language budget tool for residents who are not financially
   minded. One slider sets the dues amount; everything on the page recalculates as it moves. The detailed
   year-by-year capital model (board-budget/) stays available to the board as the "Detailed capital model". */
(() => {
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $=(sel,root=document)=>root.querySelector(sel);
  const money=n=>(n<0?'−':'')+'$'+Math.abs(Math.round(n)).toLocaleString('en-US');
  // ---- Facts and assumptions (sources shown on screen) ------------------------------------------------
  const BASE={
    year:2026,dues:500,homes:105,homesMax:178,
    operating:32195,          // operating base, 2026 budget (board budget model)
    eventsNet:1605,           // net event proceeds, 2026 (annual meeting minutes, August 30, 2026: "about $1,600")
    reserve:53293,            // opening capital, 2026 (board budget model)
    cushion:0.20              // 20% cushion on project estimates, as in the detailed model
  };
  // Approved by the members at the annual meeting, August 30, 2026. These come out of the reserve first.
  const APPROVED=[
    {name:'Front beach nourishment (NOI application and sand)',cost:9000,vote:'47–0'},
    {name:'Side Beach sand, continuing through March 2029',cost:16000,vote:'47–0'},
    {name:'Jetty NOI application (repair two existing jetties)',cost:5000,vote:'44–0'},
    {name:'Front beach drain study and repairs',cost:5200,vote:'47–0'}
  ];
  // Future projects from the board's long-range model, in the order the members ranked them.
  const PROJECTS=[
    {id:'sand',name:'Keep adding sand',detail:'About $16,000 every two years, from 2027',cost:16000,every:2,on:true},
    {id:'jetty',name:'Rebuild the jetty',detail:'Estimated $100,000',cost:100000,on:true},
    {id:'reynolds',name:'Repave Reynolds Avenue',detail:'Overlay, estimated $22,100',cost:22100,on:true},
    {id:'algelo',name:'Repave Algelo Avenue',detail:'Estimated $33,600',cost:33600,on:true},
    {id:'worrall',name:'Worrall Avenue',detail:'Choose how much to do',cost:34600,on:true,choice:true}
  ];
  // Worrall Avenue can be done three ways. Costs are 2026 dollars from the board's model (overlay $34,600,
  // mill and repave $83,200, drainage repair $30,000); the planner adds its 20% cushion on top.
  const WORRALL=[
    {id:'overlay',name:'Overlay only',detail:'A new top layer of pavement over the road as it is',cost:34600},
    {id:'overlay-drain',name:'Overlay and fix the drains',detail:'New top layer plus the drainage repair',cost:64600},
    {id:'full',name:'Mill, drains and repave',detail:'Grind the road down, fix the drainage, lay a new road',cost:113200}
  ];
  // What a household's dues pay for. Insurance is the real 2026 figure; the other operating lines are sample
  // splits of the $32,195 operating budget until the treasurer's records fill in.
  const OPERATING_LINES=[
    {key:'insurance',label:'Liability insurance',amount:5796,source:'Governors’ minutes, July 30, 2026',color:'#8FC1B5',
      what:['The association’s liability policy for the beaches, the roads it maintains and the events it runs.','Premium paid in 2026: $5,795.76.'],
      changes:'Premiums follow the insurer’s renewal each year. Claims or new structures (a rebuilt jetty, a float) can move it.'},
    {key:'cleaning',label:'Beach cleaning (8 cleanings a season)',amount:9600,source:'Demelo & Sons agreement, September 22, 2026',color:'#E3CF8A',
      what:['Eight machine cleanings a season by Demelo & Sons at $1,200 each, fixed for 2027–2029.','The first cleaning each year is a deep clean the Thursday before Memorial Day; the last is the Thursday before Labor Day.','Seaweed is removed off site; the sand is groomed to the fence and walls at low tide.'],
      changes:'The price is fixed for three seasons ($28,800 over the term). Cleanings are rescheduled, never cancelled.'},
    {key:'security',label:'Summer security detail',amount:5000,sample:true,color:'#C98B5A',
      what:['Paid patrol hours on summer weekends and holiday nights.','Covers the beach, the entrance and the parking areas.'],
      changes:'Hours and the hourly rate set the cost. Fewer weekend hours or a shared detail with a neighbouring association would lower it.'},
    {key:'upkeep',label:'Fences, entrance sign, garden and small repairs',amount:5000,sample:true,color:'#7FA7D9',
      what:['Sand fence and beachgrass put up in October and taken down in May.','The entrance sign, the garden beside it and the picket fences.','Small repairs: stairs, signs, a broken rail, gravel for a pothole.'],
      changes:'Storm damage is the big swing. Volunteer work days keep this line small.'},
    {key:'events',label:'Event supplies and prizes',amount:4799,sample:true,color:'#C78AB9',
      what:['Hot dogs, water, prizes and craft supplies for the Summer Kickoff, Art Day, Fishing Derby and the Spooktacular.','Tent, tables, lights and food for the Spaghetti Supper; bingo cards and the Movie Night licence.'],
      changes:'Ticket sales, raffles and bingo bring back about $1,600 a year (annual meeting, August 30, 2026), so events nearly pay for themselves.'},
    {key:'admin',label:'P.O. box, postage, website and bank',amount:2000,sample:true,color:'#A9B8C6',
      what:['P.O. Box 365 in Wareham, printing and postage for the newsletter and dues notices.','This app and its hosting, the domain name and bank charges.'],
      changes:'Email and text updates instead of mailings would lower postage.'}
  ];
  const PROJECT_LINE={label:'Saved for beach, jetty and road projects',color:'#5FA392',source:'what is left after running costs',
    what:['Sand on the front beach and Side Beach, the jetty repairs, the front beach drain and, later, the roads.','The members approved $35,200 of this work on August 30, 2026 (sand $9,000 and $16,000; jetty permit $5,000; drain study and repairs $5,200).','Anything not spent stays in the reserve for the next project.'],
    changes:'This is the only line the dues amount really moves: every dollar of dues above running costs lands here.'};
  const PROJECT_COLOR='#5FA392';
  function perHousehold(due,homes=BASE.homes){
    const opTotal=OPERATING_LINES.reduce((n,l)=>n+l.amount,0);
    const scale=BASE.operating/opTotal;
    const lines=OPERATING_LINES.map(l=>({...l,perHome:l.amount*scale/homes}));
    const opPerHome=lines.reduce((n,l)=>n+l.perHome,0);
    const projects=due-opPerHome;
    return {lines,opPerHome,projects,due};
  }
  function pieSVG(due,size,opts={}){
    const b=perHousehold(due);
    const slices=[...b.lines.map(l=>({key:l.key,label:l.label,value:l.perHome,color:l.color})),{key:'projects',label:PROJECT_LINE.label,value:Math.max(0,b.projects),color:PROJECT_COLOR}];
    const total=slices.reduce((n,s)=>n+s.value,0)||1;
    const r=size/2-4,cx=size/2,cy=size/2;let a=-Math.PI/2,paths='';
    for(const s of slices){
      const frac=s.value/total;if(frac<=0)continue;
      const a2=a+frac*2*Math.PI,large=frac>.5?1:0;
      const x1=cx+r*Math.cos(a),y1=cy+r*Math.sin(a),x2=cx+r*Math.cos(a2),y2=cy+r*Math.sin(a2);
      const sel=opts.labels&&opts.selected===s.key,dim=opts.labels&&opts.selected&&!sel;
      const am0=(a+a2)/2,shift=sel?8:0,dx=shift*Math.cos(am0),dy=shift*Math.sin(am0);
      const attrs=opts.labels?` data-dp-slice-path="${s.key}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="${esc(s.label)}: ${money(s.value)} a year. Tap for details." class="dp-slice${sel?' dp-slice-on':''}${dim?' dp-slice-dim':''}" transform="translate(${dx.toFixed(1)} ${dy.toFixed(1)})"`:'';
      paths+=frac>=.999?`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.color}"${attrs}/>`:`<path d="M${cx} ${cy}L${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}Z" fill="${s.color}" stroke="#15273F" stroke-width="2"${attrs}><title>${esc(s.label)}: ${money(s.value)}</title></path>`;
      if(opts.labels&&frac>.07){const am=(a+a2)/2,lx=cx+r*.62*Math.cos(am)+dx,ly=cy+r*.62*Math.sin(am)+dy;paths+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${Math.max(12,size/16)}" font-weight="700" fill="#102A4F" pointer-events="none">${money(s.value)}</text>`;}
      a=a2;
    }
    const hole=opts.labels?0:r*.52;
    return `<svg viewBox="-10 -10 ${size+20} ${size+20}" width="${size}" height="${size}" role="${opts.labels?'group':'img'}" aria-label="Pie chart of what ${money(due)} in dues pays for${opts.labels?'. Tap a slice for details.':''}">${paths}${hole?`<circle cx="${cx}" cy="${cy}" r="${hole}" fill="#15273F"/><text x="${cx}" y="${cy-4}" text-anchor="middle" font-size="${size/7}" font-weight="700" fill="#F4F1E8" font-family="Georgia,serif">${money(due)}</text><text x="${cx}" y="${cy+size/9}" text-anchor="middle" font-size="${size/14}" fill="#C7D2DC">a year</text>`:''}</svg>`;
  }
  // ---- Planner model ------------------------------------------------------------------------------------
  function plan(due,homes,chosen){
    const duesIn=due*homes,running=BASE.operating-BASE.eventsNet,left=duesIn-running;
    const approved=APPROVED.reduce((n,a)=>n+a.cost,0);
    let reserve=BASE.reserve-approved;
    const years=[];const sand=chosen.includes('sand');
    const queue=PROJECTS.filter(p=>!p.every&&chosen.includes(p.id)).map(p=>{const w=p.choice?WORRALL.find(o=>o.id===state.worrall)||WORRALL[0]:null;const cost=w?w.cost:p.cost;return {...p,name:w?`${p.name}: ${w.name.toLowerCase()}`:p.name,cost,need:cost*(1+BASE.cushion),year:null};});
    for(let y=BASE.year+1;y<=BASE.year+30;y++){
      reserve+=left;
      let sandSpent=0;if(sand&&(y-2027)%2===0&&y>=2027){sandSpent=PROJECTS[0].cost*(1+BASE.cushion);reserve-=sandSpent;}
      // Pay for the next project in line when the reserve can cover it and still keep one year of running costs.
      for(const p of queue){if(p.year)continue;if(reserve-p.need>=running*0.5){reserve-=p.need;p.year=y;}else break;}
      years.push({y,reserve,sandSpent});
    }
    return {duesIn,running,left,approved,queue,years,sand,monthly:due/12};
  }
  // ---- Dialog -----------------------------------------------------------------------------------------
  let dialog,state={due:BASE.dues,homes:BASE.homes,chosen:PROJECTS.map(p=>p.id),tab:'planner',worrall:'overlay',slice:null};
  function ensure(){
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.id='dues-planner-dialog';dialog.className='dp-dialog';dialog.setAttribute('aria-labelledby','dp-title');
    document.body.append(dialog);
    dialog.addEventListener('close',()=>{document.body.classList.remove('dp-open');});
    dialog.addEventListener('input',e=>{
      const t=e.target;
      if(t.id==='dp-due'){state.due=Number(t.value);update();}
      else if(t.id==='dp-homes'){state.homes=Number(t.value);update();}
      else if(t.dataset.dpProject){state.chosen=t.checked?[...new Set([...state.chosen,t.dataset.dpProject])]:state.chosen.filter(x=>x!==t.dataset.dpProject);update();}
    });
    dialog.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.dpClose!==undefined){dialog.close();return;}
      if(b.dataset.dpTab){state.tab=b.dataset.dpTab;render();return;}
      if(b.dataset.dpStep){state.due=Math.min(1000,Math.max(250,state.due+Number(b.dataset.dpStep)));render();return;}
      if(b.dataset.dpPreset){state.due=Number(b.dataset.dpPreset);render();return;}
      if(b.dataset.dpDetailed!==undefined){window.openBoardBudget?.();return;}
      if(b.dataset.dpWorrall){state.worrall=b.dataset.dpWorrall;dialog.querySelectorAll('[data-dp-worrall]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.dpWorrall===state.worrall)));update();return;}
      if(b.dataset.dpSlice!==undefined){state.slice=state.slice===b.dataset.dpSlice?null:b.dataset.dpSlice;update();return;}
      if(b.dataset.dpGoto){dialog.querySelector(b.dataset.dpGoto)?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    });
    dialog.addEventListener('click',e=>{
      const sl=e.target.closest('[data-dp-slice-path]');if(!sl)return;
      state.slice=state.slice===sl.dataset.dpSlicePath?null:sl.dataset.dpSlicePath;update();
    });
    dialog.addEventListener('keydown',e=>{
      const sl=e.target.closest?.('[data-dp-slice-path]');if(!sl||(e.key!=='Enter'&&e.key!==' '))return;
      e.preventDefault();state.slice=state.slice===sl.dataset.dpSlicePath?null:sl.dataset.dpSlicePath;update();
      dialog.querySelector(`[data-dp-slice-path="${sl.dataset.dpSlicePath}"]`)?.focus();
    });
  }
  function render(){
    const tabs=[['planner','Dues planner'],['pie','What my dues buy']];
    dialog.innerHTML=`<div class="dp-shell">
      <header class="dp-head"><div><p class="dp-eyebrow">Money & planning</p><h2 id="dp-title">${state.tab==='planner'?'Dues planner':'What my dues buy'}</h2></div>
        <div class="dp-tabs" role="tablist">${tabs.map(([k,l])=>`<button type="button" role="tab" aria-selected="${state.tab===k}" data-dp-tab="${k}">${l}</button>`).join('')}</div>
        <button type="button" class="dp-close" data-dp-close>Dashboard</button></header>
      <div class="dp-body">${state.tab==='planner'?plannerHTML():pieHTML()}</div></div>`;
    update();
  }
  function sliderBlock(){
    return `<section class="dp-control" aria-label="Set the dues amount">
      <div class="dp-due-row"><button type="button" class="dp-step" data-dp-step="-25" aria-label="Lower dues by $25">−</button>
        <div class="dp-due-big"><span class="dp-due-label">Dues per household</span><output id="dp-due-out" for="dp-due">${money(state.due)}</output><span class="dp-due-sub" id="dp-due-month">${money(state.due/12)} a month</span></div>
        <button type="button" class="dp-step" data-dp-step="25" aria-label="Raise dues by $25">+</button></div>
      <input id="dp-due" type="range" min="250" max="1000" step="25" value="${state.due}" aria-label="Dues per household, 250 to 1,000 dollars">
      <div class="dp-presets">${[400,500,600,750].map(v=>`<button type="button" data-dp-preset="${v}" aria-pressed="${state.due===v}">${money(v)}${v===500?' · today':''}</button>`).join('')}</div>
    </section>`;
  }
  function plannerHTML(){
    return `${sliderBlock()}
      <section class="dp-results" id="dp-results" aria-live="polite"></section>
      <section class="dp-two">
        <div class="dp-panel"><h3>Who is paying</h3><label class="dp-homes">Paying households <strong id="dp-homes-out">${state.homes}</strong> of ${BASE.homesMax}<input id="dp-homes" type="range" min="80" max="${BASE.homesMax}" step="1" value="${state.homes}"></label><p class="dp-note">105 homes paid in 2026 (annual meeting, August 30). Slide to see what happens if more neighbors pay.</p></div>
        <div class="dp-panel"><h3>Projects to plan for</h3><ul class="dp-projects">${PROJECTS.map(p=>`<li><label><input type="checkbox" data-dp-project="${p.id}" ${state.chosen.includes(p.id)?'checked':''}><span><strong>${esc(p.name)}</strong><small>${esc(p.detail)}</small></span></label>${p.choice?`<div class="dp-choice" role="group" aria-label="How much to do on Worrall Avenue">${WORRALL.map(o=>`<button type="button" data-dp-worrall="${o.id}" aria-pressed="${state.worrall===o.id}"><strong>${esc(o.name)}</strong><small>${money(o.cost)} · ${esc(o.detail)}</small></button>`).join('')}</div>`:''}</li>`).join('')}</ul><p class="dp-note">Road costs are 2026 dollars from the board’s model; the planner adds a 20% cushion.</p></div>
      </section>
      <section class="dp-panel dp-operating" id="dp-operating"><h3>Operating expenses: what it costs to run the association</h3>
        <ol class="dp-oplist">${OPERATING_LINES.map(l=>`<li><i style="background:${l.color}"></i><span>${esc(l.label)}${l.sample?' <small>sample split</small>':` <small>${esc(l.source)}</small>`}</span><strong>${money(l.amount)}</strong><em>${money(l.amount/BASE.homes)} per home</em></li>`).join('')}
          <li class="dp-op-total"><i></i><span>Operating budget, 2026</span><strong>${money(BASE.operating)}</strong><em>${money(BASE.operating/BASE.homes)} per home</em></li>
          <li class="dp-op-credit"><i></i><span>Less what events bring back (tickets, raffles, bingo)</span><strong>− ${money(BASE.eventsNet)}</strong><em></em></li>
          <li class="dp-op-total"><i></i><span>Running costs the dues must cover</span><strong>${money(BASE.operating-BASE.eventsNet)}</strong><em>${money((BASE.operating-BASE.eventsNet)/BASE.homes)} per home</em></li></ol>
        <p class="dp-note">These costs stay about the same whatever the dues are. Insurance and beach cleaning are real 2026–2027 figures; the four lines marked sample are the treasurer’s best split of the rest of the $32,195 budget until the records are entered. Tap any line in <button type="button" class="dp-link" data-dp-tab="pie">What my dues buy</button> to see what goes into it.</p></section>
      <section class="dp-panel dp-know" id="dp-know"><h3>Good to know at this amount</h3><ul class="dp-facts" id="dp-facts"></ul></section>
      <section class="dp-panel dp-approved"><h3>Already approved by the members, August 30, 2026</h3><ul>${APPROVED.map(a=>`<li><span>${esc(a.name)}</span><strong>${money(a.cost)}</strong><small>vote ${a.vote}</small></li>`).join('')}</ul><p class="dp-note">These ${money(APPROVED.reduce((n,a)=>n+a.cost,0))} come out of the current reserve first. The planner starts after they are paid.</p></section>
      <section class="dp-panel"><h3>Reserve, year by year</h3><div class="dp-chart" id="dp-chart"></div><p class="dp-note">Bars show the money set aside at the end of each year after running costs, sand and any project paid that year. Project estimates carry a 20% cushion, as in the board’s detailed model.</p></section>
      <p class="dp-sources">Figures: 2026 operating budget $32,195, net event proceeds about $1,600 and opening reserve $53,293 from the board’s budget model; 105 paying homes and the approved projects from the August 30, 2026 annual meeting minutes. Project costs are estimates until bids are in. <button type="button" class="dp-link" data-dp-detailed>Open the detailed capital model</button></p>`;
  }
  function pieHTML(){
    return `${sliderBlock()}
      <p class="dp-hint">Tap a slice of the pie, or a line in the list, to see what goes into that cost.</p>
      <section class="dp-pie-wrap"><div class="dp-pie" id="dp-pie"></div><ol class="dp-legend" id="dp-legend"></ol></section>
      <section class="dp-detail" id="dp-detail" aria-live="polite" hidden></section>
      <p class="dp-note" id="dp-pie-note"></p>
      <p class="dp-sources">Insurance is the 2026 figure from the governors’ minutes (July 30, 2026). The other operating lines are sample splits of the $32,195 operating budget until the treasurer’s records fill in; the total is right even where the split is a sample. Per-household amounts assume ${BASE.homes} paying homes.</p>`;
  }
  function update(){
    if(!dialog)return;
    const out=$('#dp-due-out',dialog);if(out)out.value=money(state.due);
    const mo=$('#dp-due-month',dialog);if(mo)mo.textContent=money(state.due/12)+' a month';
    dialog.querySelectorAll('[data-dp-preset]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.dpPreset)===state.due)));
    const ho=$('#dp-homes-out',dialog);if(ho)ho.textContent=state.homes;
    if(state.tab==='planner'){
      const p=plan(state.due,state.homes,state.chosen);
      const share=Math.min(100,Math.max(0,100*p.running/p.duesIn));
      const projLines=p.queue.map(q=>`<li class="${q.year?'dp-ok':'dp-no'}"><span>${esc(q.name)}</span><strong>${q.year?`affordable in ${q.year}`:'not within 30 years'}</strong><small>${money(q.need)} with cushion</small></li>`).join('');
      $('#dp-results',dialog).innerHTML=`<div class="dp-big-grid">
          <div class="dp-big"><span>We collect each year</span><strong>${money(p.duesIn)}</strong><small>${state.homes} homes × ${money(state.due)}</small></div>
          <button type="button" class="dp-big dp-big-btn" data-dp-goto="#dp-operating"><span>Running the association costs</span><strong>${money(p.running)}</strong><small>insurance, cleaning, security, upkeep, less event income · see the list</small></button>
          <div class="dp-big ${p.left<0?'dp-bad':'dp-good'}"><span>${p.left<0?'Short each year by':'Left for projects each year'}</span><strong>${money(Math.abs(p.left))}</strong><small>${p.left<0?'dues do not cover running costs':`${money(p.left/state.homes)} of your ${money(state.due)}`}</small></div>
        </div>
        <div class="dp-split" aria-hidden="true"><i style="width:${share.toFixed(1)}%"></i><b>${Math.round(share)}% running costs</b><b>${Math.max(0,100-Math.round(share))}% projects</b></div>
        <p class="dp-plain">${plainWords(p)}</p>
        ${p.queue.length?`<ol class="dp-when">${projLines}</ol>`:''}
        ${p.sand?`<p class="dp-note">Sand: ${money(PROJECTS[0].cost*(1+BASE.cushion))} every two years from 2027 is taken out before anything else.</p>`:''}`;
      const facts=$('#dp-facts',dialog);if(facts){
        const breakEven=p.running/state.homes,today=plan(BASE.dues,state.homes,state.chosen),diff=state.due-BASE.dues;
        const allHomes=plan(state.due,BASE.homesMax,state.chosen);
        const yearsCushion=p.left>0?(BASE.reserve-p.approved)/p.running:0;
        facts.innerHTML=[
          `<li><strong>${money(state.due/12)} a month</strong>, or ${money(state.due/52)} a week, per household.</li>`,
          `<li><strong>Break-even is ${money(Math.ceil(breakEven/5)*5)}.</strong> Below that, dues from ${state.homes} homes do not cover running costs.</li>`,
          diff===0?`<li><strong>This is today’s amount.</strong> Dues have been $500, due May 1.</li>`:`<li><strong>${diff>0?'Up':'Down'} ${money(Math.abs(diff))} from today’s $500</strong>: ${money(Math.abs(diff*state.homes))} ${diff>0?'more':'less'} a year for the association, ${money(Math.abs(diff/12))} a month for you.</li>`,
          `<li><strong>Every $25 on the dues</strong> adds ${money(25*state.homes)} a year with ${state.homes} homes paying.</li>`,
          `<li><strong>If all ${BASE.homesMax} homes paid</strong> at this amount, projects would get ${money(allHomes.left)} a year instead of ${money(Math.max(0,p.left))}.</li>`,
          `<li><strong>Reserve after the approved work: ${money(BASE.reserve-p.approved)}</strong>, about ${yearsCushion>=1?yearsCushion.toFixed(1)+' years':Math.round(yearsCushion*12)+' months'} of running costs.</li>`
        ].join('');
      }
      const ch=$('#dp-chart',dialog);if(ch){
        const ys=p.years.slice(0,15),max=Math.max(1,...ys.map(y=>Math.abs(y.reserve)));
        ch.innerHTML=`<div class="dp-bars">${ys.map(y=>{const h=Math.max(2,Math.round(100*Math.abs(y.reserve)/max));const paid=p.queue.filter(q=>q.year===y.y);return `<div class="dp-bar ${y.reserve<0?'dp-bar-neg':''}" title="${y.y}: ${money(y.reserve)}"><i style="height:${h}%"></i><span>${String(y.y).slice(2)}</span>${paid.length?`<em title="${esc(paid.map(q=>q.name).join(', '))}">${paid.length}</em>`:''}</div>`;}).join('')}</div><p class="dp-note">Numbers over a bar mark the year a project is paid for. ${ys.some(y=>y.reserve<0)?'Red bars mean the reserve would be below zero.':''}</p>`;
      }
    }else{
      const b=perHousehold(state.due,state.homes);
      $('#dp-pie',dialog).innerHTML=pieSVG(state.due,320,{labels:true,selected:state.slice});
      const rows=[...b.lines.map(l=>({...l,v:l.perHome})),{key:'projects',...PROJECT_LINE,v:b.projects}];
      $('#dp-legend',dialog).innerHTML=rows.map(l=>`<li><button type="button" data-dp-slice="${l.key}" aria-pressed="${state.slice===l.key}"><i style="background:${l.color}"></i><span>${esc(l.label)}${l.sample?' <small>sample split</small>':l.source?` <small>${esc(l.source)}</small>`:''}</span><strong>${money(l.v)}</strong><em>${money(l.v/12)}/mo</em></button></li>`).join('');
      const det=$('#dp-detail',dialog),row=rows.find(r=>r.key===state.slice);
      if(det){det.hidden=!row;if(row){const yearly=row.key==='projects'?row.v*state.homes:row.amount*(BASE.operating/OPERATING_LINES.reduce((n,l)=>n+l.amount,0));
        det.innerHTML=`<div class="dp-detail-head" style="border-color:${row.color}"><i style="background:${row.color}"></i><div><h3>${esc(row.label)}</h3><p>${money(row.v)} of your ${money(state.due)} · ${money(row.v/12)} a month · ${money(yearly)} a year across ${state.homes} homes${row.sample?' · <b>sample split</b>':''}</p></div><button type="button" class="dp-detail-close" data-dp-slice="${row.key}" aria-label="Close details">Close</button></div>
          <h4>What goes into it</h4><ul>${(row.what||[]).map(w=>`<li>${esc(w)}</li>`).join('')}</ul>
          ${row.changes?`<h4>What changes it</h4><p>${esc(row.changes)}</p>`:''}
          ${row.source?`<p class="dp-note">Source: ${esc(row.source)}.</p>`:row.sample?`<p class="dp-note">This split is a sample until the treasurer’s records are entered; the operating total is right.</p>`:''}`;
        det.scrollIntoView({behavior:'smooth',block:'nearest'});}}
      $('#dp-pie-note',dialog).textContent=b.projects>=0?`At ${money(state.due)} a year, ${money(b.opPerHome)} of each household’s dues keeps the association running and ${money(b.projects)} goes toward sand, the jetty, drains and roads. That is ${money(b.projects*state.homes)} a year for projects from ${state.homes} homes.`:`At ${money(state.due)} a year, running costs alone come to ${money(b.opPerHome)} per household, so nothing is left for projects and the reserve shrinks by ${money(-b.projects*state.homes)} a year.`;
    }
  }
  function plainWords(p){
    if(p.left<0)return `At ${money(state.due)}, dues from ${state.homes} homes do not cover the cost of running the association. The reserve would shrink every year and no projects could be planned.`;
    const first=p.queue.find(q=>q.year),last=[...p.queue].reverse().find(q=>q.year),none=p.queue.filter(q=>!q.year);
    let s=`At ${money(state.due)} a year, ${state.homes} homes put ${money(p.left)} a year toward projects after running costs.`;
    if(first)s+=` The first project on the list, ${first.name.toLowerCase()}, becomes affordable in ${first.year}.`;
    if(last&&last!==first)s+=` Everything checked is paid for by ${last.year}.`;
    if(none.length)s+=` ${none.length===1?'One project does':none.length+' projects do'} not fit within 30 years at this amount; try a higher figure or more paying homes.`;
    return s;
  }
  function open(tab){ensure();state.tab=tab==='pie'?'pie':'planner';render();if(!dialog.open)dialog.showModal();document.body.classList.add('dp-open');$('.dp-body',dialog).scrollTop=0;}
  window.openHBADuesPlanner=open;
  window.HBADuesPlanner={open,miniPie:(due,size)=>pieSVG(due,size),perHousehold,plan,BASE,APPROVED,PROJECTS};
})();
