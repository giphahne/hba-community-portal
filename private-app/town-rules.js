/* Wareham rules & town services: plain-language summaries with the exact by-law wording and sources. */
(() => {
  'use strict';
  const D=window.HBATownRules,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let dialog,focusBefore;
  function ensure(){
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.id='rules-dialog';dialog.setAttribute('aria-labelledby','rules-title');
    dialog.innerHTML=`<div class="rules-shell"><header><div><p class="rules-eyebrow">Town of Wareham · checked ${esc(D.checked)}</p><h2 id="rules-title">Wareham rules & town services</h2><p class="rules-sub">Quiet hours, construction, dogs, golf carts, moorings and the trash schedule for our streets, in plain language with the exact by-law wording underneath. Not legal advice; the linked town documents govern.</p></div><button type="button" id="rules-close">Back</button></header>
      <nav class="rules-nav" aria-label="Topics">${D.topics.map(t=>`<button type="button" data-rules-jump="${esc(t.id)}">${esc(t.title)}</button>`).join('')}<button type="button" data-rules-jump="rules-contacts">Phone numbers</button></nav>
      <div class="rules-scroll">${D.topics.map(topic).join('')}
        <section class="rules-topic" id="rules-contacts"><h3>Phone numbers</h3><dl class="rules-contacts">${D.contacts.map(c=>`<div><dt>${esc(c.label)}</dt><dd>${esc(c.value)}</dd></div>`).join('')}</dl>
        <p class="rules-small">Main source: <a href="${esc(D.bylawsUrl)}" target="_blank" rel="noopener">${esc(D.bylawsLabel)}</a>. Town by-laws change at Town Meeting; the “checked” date above is when these entries were last compared with the town’s documents.</p></section></div></div>`;
    document.body.append(dialog);
    dialog.querySelector('#rules-close').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>focusBefore?.focus?.());
    dialog.querySelectorAll('[data-rules-jump]').forEach(b=>b.onclick=()=>{const id=b.dataset.rulesJump;const el=dialog.querySelector('#'+(id.startsWith('rules-')?id:'rules-'+id));el?.scrollIntoView({block:'start',behavior:'smooth'});el?.querySelector('h3')?.focus?.();});
  }
  // Trash schedule panel: live "next pickup" worked out from the Harvey calendar data, plus the rules at a glance.
  const DAY=86400000,fmtLong=d=>d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}),fmtShort=d=>d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parse=t=>{const [y,m,d]=t.split('-').map(Number);return new Date(y,m-1,d);};
  function pickups(sc,from,count){
    const out=[];const hol=new Map(sc.holidays2026.map(([d,n])=>[d,n]));const rec=new Set(sc.recycling2026);
    const last=parse(sc.recycling2026[sc.recycling2026.length-1]);
    const start=new Date(from.getFullYear(),from.getMonth(),from.getDate());
    // Tuesday of the current week (Mon-Sun week).
    const mon=new Date(start);mon.setDate(start.getDate()-((start.getDay()+6)%7));
    let tue=new Date(mon);tue.setDate(mon.getDate()+sc.weekday-1);
    for(let i=0;out.length<count&&i<60;i++){
      const weekMon=new Date(tue);weekMon.setDate(tue.getDate()-(sc.weekday-1));
      let delay=null;
      if(tue.getFullYear()===2026){for(let k=0;k<sc.weekday;k++){const d=new Date(weekMon);d.setDate(weekMon.getDate()+k);const n=hol.get(iso(d));if(n)delay=n;}}
      const actual=new Date(tue);if(delay)actual.setDate(tue.getDate()+1);
      let recycling=false,projected=false;
      if(rec.has(iso(tue)))recycling=true;
      else if(tue>last){const weeks=Math.round((tue-last)/(7*DAY));recycling=weeks%2===0;projected=true;}
      if(actual>=start)out.push({tue,actual,delay,recycling,projected,known:tue.getFullYear()===2026});
      tue=new Date(tue);tue.setDate(tue.getDate()+7);
    }
    return out;
  }
  function scheduleHTML(sc){
    const now=new Date();const list=pickups(sc,now,6);const next=list[0];const today=iso(now);
    const when=next?(iso(next.actual)===today?'Today, '+fmtLong(next.actual):fmtLong(next.actual)):'';
    const what=next?(next.recycling?'Trash and recycling':'Trash only'):'';
    const delayNote=next?.delay?`<p class="rules-sched-delay">Moved from Tuesday to Wednesday: ${esc(next.delay)} falls earlier that week.</p>`:'';
    const projNote=next?.projected?`<p class="rules-sched-delay">Recycling week projected from the 2026 pattern; the 2027 Harvey calendar is not published yet.</p>`:'';
    const rows=list.slice(1).map(p=>`<tr><td>${esc(fmtShort(p.actual))}${p.delay?` <span class="rules-sched-tagline">moved a day for ${esc(p.delay)}</span>`:''}</td><td>${p.recycling?'<strong>Trash + recycling</strong>':'Trash only'}${p.projected?' <span class="rules-sched-tagline">projected</span>':''}</td></tr>`).join('');
    const holidayRows=sc.holidays2026.filter(([d])=>{const h=parse(d);return h>=new Date(now.getFullYear(),now.getMonth(),now.getDate())&&(h.getDay()>=1&&h.getDay()<=sc.weekday);}).map(([d,n])=>`<li>${esc(fmtShort(parse(d)))} (${esc(n)}): pickup moves to Wednesday</li>`).join('');
    return `<div class="rules-sched">
      <div class="rules-sched-next"><p class="rules-sched-label">Next pickup for Hamilton Beach streets</p><p class="rules-sched-date">${esc(when)}</p><p class="rules-sched-what">${esc(what)} · barrels out by ${esc(sc.outBy)}</p>${delayNote}${projNote}</div>
      <div class="rules-sched-tiles">
        <div><span>Your pickup day</span><strong>${esc(sc.dayName)}</strong><small>every week, trash</small></div>
        <div><span>Recycling</span><strong>Every other ${esc(sc.dayName)}</strong><small>Week ${esc(sc.recyclingWeek)}, the shaded weeks on the Harvey calendar</small></div>
        <div><span>Out by</span><strong>${esc(sc.outBy)}</strong><small>lids closed, nothing outside the barrel</small></div>
      </div>
      <h4>Coming up</h4>
      <table class="rules-sched-table"><tbody>${rows}</tbody></table>
      <h4>Holiday weeks still ahead in 2026</h4>
      <p class="rules-sched-plain">Rule: when a holiday falls on the Monday or Tuesday of a week, that week’s pickup moves to Wednesday.</p>
      ${holidayRows?`<ul class="rules-sched-list">${holidayRows}</ul>`:'<p class="rules-sched-plain">None left this year: the remaining 2026 holidays fall after Tuesday, so pickup stays on Tuesday.</p>'}
      <h4>Streets on this schedule</h4>
      <p class="rules-sched-plain">${sc.streets.map(esc).join(' · ')}. ${esc(sc.splitStreet)}</p>
      <h4>Who to call</h4>
      <dl class="rules-contacts rules-sched-calls">${sc.calls.map(c=>`<div><dt>${esc(c.label)}</dt><dd>${esc(c.value)}</dd></div>`).join('')}</dl>
      <h4>Good to know</h4>
      <ul class="rules-sched-list"><li>${esc(sc.bins)}.</li><li>${esc(sc.cost)}</li><li>${esc(sc.transfer)}</li><li>${esc(sc.banned)}</li></ul>
      <p class="rules-note">${esc(sc.unpublished)}</p>
    </div>`;
  }
  function topic(t){
    return `<section class="rules-topic" id="rules-${esc(t.id)}"><p class="rules-tag">${esc(t.tag)}</p><h3 tabindex="-1">${esc(t.title)}</h3>
      ${t.schedule?`<div class="rules-sched-slot" data-sched="${esc(t.id)}">${scheduleHTML(t.schedule)}</div>`:`<ul class="rules-summary">${t.summary.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`}
      ${t.note?`<p class="rules-note">${esc(t.note)}</p>`:''}
      ${t.gap?`<p class="rules-gap"><strong>Not found or not confirmed:</strong> ${esc(t.gap)}</p>`:''}
      ${t.quotes?.length?`<details class="rules-quotes"><summary>Exact wording (${t.quotes.length})</summary>${t.quotes.map(q=>`<blockquote><p>“${esc(q.text)}”</p><cite>${esc(q.cite)}</cite></blockquote>`).join('')}</details>`:''}
      <p class="rules-sources">Sources: ${t.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join(' · ')}</p></section>`;
  }
  function refresh(){dialog.querySelectorAll('.rules-sched-slot').forEach(el=>{const t=D.topics.find(x=>x.id===el.dataset.sched);if(t?.schedule)el.innerHTML=scheduleHTML(t.schedule);});}
  function open(id){ensure();refresh();focusBefore=document.activeElement;if(!dialog.open)dialog.showModal();const el=id?dialog.querySelector('#rules-'+id):null;(el||dialog.querySelector('.rules-scroll')).scrollIntoView?.({block:'start'});if(!id)dialog.querySelector('.rules-scroll').scrollTop=0;}
  window.openHBATownRules=open;
  // Next pickup for the dashboard facts line: {actual:Date, recycling:boolean, delay:string|null, label:string}.
  window.hbaNextPickup=function(from=new Date()){
    const t=D.topics.find(x=>x.schedule);if(!t)return null;
    const n=pickups(t.schedule,from,1)[0];if(!n)return null;
    const today=iso(from);const day=iso(n.actual)===today?'today':fmtShort(n.actual);
    return {...n,label:`${n.recycling?'Trash and recycling':'Trash'} ${day}${n.delay?' ('+n.delay+' week)':''}`};
  };
})();
