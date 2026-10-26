/* Newsletter reader: the current issue laid out as a readable page with residents' photographs.
   The wording is the Secretary's March 2026 issue, re-flowed for the screen; the original Word file and
   PDF stay in the archive ("Original issue and past editions"). */
(() => {
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ph=(slug,caption)=>`<figure class="nl-photo"><img src="photos/${slug}.jpg" alt="${esc(caption)}" loading="lazy" decoding="async" style="background-image:url('photos/${slug}-tiny.jpg')"><figcaption>Photograph · ${esc(caption)}</figcaption></figure>`;
  const ISSUES={
    '2026-03':{
      title:'March 2026',
      hero:{slug:'snow-sunset',caption:'Snow on the shore under a pink and violet sky, with the flagpole by the water'},
      html:()=>`
        <section class="nl-lead">
          <p class="nl-kicker">From the President</p>
          <h3>Reflections on winter and community resilience</h3>
          <p class="nl-big">Wow, wow and wow. What a winter it has been.</p>
          <p>The recent storm on the island was extremely harsh and tested our resilience. The weather itself was daunting: 30 inches of snow, 60 mph winds, 8-foot drifts, a four-day power outage, and a young man whose vehicle was stuck in a snow drift on the causeway for nine hours.</p>
          <p>The most impactful moments, though, were the remarkable way neighbors united. People gave their time, energy and even endured physical strain to help each other. They cleared snow, shared gasoline for generators, prepared meals on gas stoves, welcomed others into their homes for warmth and, in some cases, offered adult drinks. This collective effort made me proud to be a resident of Hamilton Beach. My heartfelt thanks go out to all of you.</p>
          <p>For those who escaped to southern beaches and sunny weather, sending us pictures while enjoying your beverages, we look forward to discussing your experiences at the June meeting.</p>
          ${ph('walkers-on-ice','Two walkers out on the ice')}
          <h3>Looking ahead: June and future plans</h3>
          <p>As we approach June there are important topics to address regarding our plans for the island’s future. Your governor will share more details in the coming months. I encourage everyone to participate in these discussions, since this is your property and your input is vital.</p>
          <p>To provide the events, security, beach cleaning and maintenance, we need residents to pay their annual dues. Dues are payable by May 1. For the residents who have already paid, thank you. A tentative calendar of events is enclosed; please consider volunteering at an event.</p>
          <p>Looking forward to spring and seeing you all.</p>
          <p class="nl-sign">Carey</p>
        </section>
        <aside class="nl-side">
          <div class="nl-box nl-box-quiet"><p class="nl-kicker">In sympathy</p><p>We would like to express condolences to the family of Tommie Reardon on Reynolds Avenue.</p></div>
          <div class="nl-box"><p class="nl-kicker">Dues</p><p class="nl-big">$500, payable by May 1, 2026</p><p>Make checks payable to Hamilton Beach Association and mail to P.O. Box 365, Wareham, MA 02571. Note your residence on the check.</p><button type="button" class="nl-btn" data-nl-run="payments">Pay dues or report a payment</button></div>
          <div class="nl-box"><p class="nl-kicker">Updates</p><p>Please update your email address and phone number in case of an emergency; a lot of our information is out of date. Send changes to Ann at <a href="mailto:secretary@example.org">secretary@example.org</a>.</p></div>
        </aside>
        <section class="nl-band">
          ${ph('snow-fence-sun','Low sun through the snow fence on the dune')}
          <div><p class="nl-kicker">Save the date</p><h3>Spring Clean-Up Day: Saturday, May 9, 9 am</h3><p>Our annual Hamilton Beach Clean-Up Day. We will be landscaping, painting and doing a general clean-up. Meet at Ann’s house, 36 Algelo Avenue, at 9 am. Come and help make our island more beautiful. If you cannot make it that day but would like to help, check with Ann for additional projects.</p>
          <p><strong>Beach fences come down in April.</strong> We will let you know the date; we always need volunteers. Thank you.</p><button type="button" class="nl-btn" data-nl-run="volunteers">See volunteer sign-ups</button></div>
        </section>
        <section class="nl-events">
          <div class="nl-events-head"><div><p class="nl-kicker">Enclosed</p><h3>Summer events 2026 (tentative)</h3></div>${ph('shade-moorings','Shade on the sand with boats on the moorings beyond')}</div>
          <ol class="nl-event-list">
            ${[['Sat, May 9','Clean-Up Day','9 am · 36 Algelo Ave.'],['Sat, June 20','Adult Block Party','5:30 pm · 36 Algelo Ave.'],['Sun, June 28','General Meeting','10 am · Algelo & Surf'],['Sat, July 4','Beach Events and Bike Parade','from 10 am · Side Beach'],['Sat, July 11','Kids’ Fishing Derby','10 to 12 · Side Beach'],['Fri, July 17','Adult Bingo','6 pm · Pilgrim & Worrall'],['Sat, July 18','Kids’ Day','11 am · Side Beach'],['Sat, July 18','Jane and John’s Music on Surf','7 pm'],['Sat, Aug 1','Art Day · Summer Spooktacular','1 pm · 6:30 pm'],['Sat, Aug 15','Golf Tournament (rain or shine)','8 am · Southers Marsh'],['Sat, Aug 15','Spaghetti Supper','5:30 pm · rain date Aug 22'],['Sun, Aug 23','Annual Meeting','10 am · Algelo & Surf'],['August','Adult Bingo','date to be announced']].map(([d,t,w])=>`<li><span class="nl-ev-date">${d}</span><span><strong>${t}</strong><small>${w}</small></span></li>`).join('')}
          </ol>
          <p class="nl-small">Dates as printed in March 2026. The Summer events sheet in this app carries the final dates and details. <button type="button" class="nl-link" data-nl-run="summer">Open the Summer events sheet</button></p>
        </section>
        <section class="nl-roster">
          <h3>Officers and governors, 2025–2027</h3>
          <div class="nl-roster-grid">
            <ul>${[['President','Carey Paster','3 Glen Ave.'],['Vice-President','Lorrie Mardo','9 Reynolds Ave.'],['Secretary','Ann Ladouceur','36 Algelo Ave.'],['Treasurer','Tom Donelan','15 Worrall Ave.'],['Governor at Large','Thomas Keefe','77 Pilgrim Ave.'],['Governor at Large','Tracey Wise','3 Worrall Ave.'],['Governor at Large','Mark Romanowski','3 Surf Ave.']].map(([r,n,a])=>`<li><small>${r}</small><strong>${n}</strong><span>${a}</span></li>`).join('')}</ul>
            <ul>${[['Algelo Avenue','Don Ricciato','12 Algelo Ave.'],['Reynolds Avenue','Roberta Dee','14 Reynolds Ave.'],['Glen Avenue','Sue Healy','9 Glen Ave.'],['Pilgrim Avenue','David DiGennaro','59 Pilgrim Ave.'],['Surf Avenue','Earl Deagle','6 Surf Ave.'],['Turner Avenue','Mike O’Connell','14 Turner Ave.'],['Worrall Avenue','Lauren Rappoli','12 Worrall Ave.']].map(([r,n,a])=>`<li><small>${r} governor</small><strong>${n}</strong><span>${a}</span></li>`).join('')}</ul>
          </div>
          <p class="nl-small">Phone numbers and email are in <button type="button" class="nl-link" data-nl-run="team">Contact our team</button>.</p>
        </section>`
    }
  };
  let dialog;
  function ensure(){
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.id='newsletter-dialog';dialog.setAttribute('aria-labelledby','nl-title');document.body.append(dialog);
    dialog.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.nlClose!==undefined)dialog.close();
      else if(b.dataset.nlRun){dialog.close();window.HBAShell?.runTool(b.dataset.nlRun);}
      else if(b.dataset.nlArchive!==undefined){dialog.close();window.openHBACommunity('newsletter');}
    });
  }
  function open(key='2026-03'){
    ensure();const i=ISSUES[key]||ISSUES['2026-03'];
    dialog.innerHTML=`<article class="nl-shell">
      <header class="nl-mast"><button type="button" class="nl-back" data-nl-close>Dashboard</button><div class="nl-mast-text"><p class="nl-kicker">Hamilton Beach Association</p><h2 id="nl-title">Newsletter · ${esc(i.title)}</h2></div><button type="button" class="nl-archive" data-nl-archive>Original issue and past editions</button></header>
      <figure class="nl-hero"><img src="photos/${i.hero.slug}.jpg" alt="${esc(i.hero.caption)}" decoding="async" style="background-image:url('photos/${i.hero.slug}-tiny.jpg')"><figcaption>Photograph · ${esc(i.hero.caption)}</figcaption></figure>
      <div class="nl-grid">${i.html()}</div>
      <footer class="nl-foot"><p>Re-flowed from the Secretary’s ${esc(i.title)} issue for easier reading on a screen. The wording is unchanged apart from light editing for flow; the original Word file and PDF are in the archive. Photographs were shared by residents.</p><button type="button" class="nl-btn" data-nl-close>Back to the dashboard</button></footer>
    </article>`;
    if(!dialog.open)dialog.showModal();dialog.scrollTop=0;
  }
  window.openHBANewsletter=open;
})();
