(() => {
  'use strict';
  const panel=document.getElementById('panel');
  panel.querySelector('h1').textContent='Hamilton Beach';
  panel.querySelector('.sub').textContent='Homes, island history, beach records and association planning';
  document.title='Hamilton Beach · Homes, History & Planning';
  const moduleEntries=[...panel.querySelectorAll('.history-entry')];
  const original=[...panel.children].filter(e=>!e.matches('#toggle,.logo,h1,.sub,#theme')&&!moduleEntries.includes(e));
  const main=document.createElement('section');main.className='home-main';
  main.innerHTML=`<p class="home-welcome">Welcome to Hamilton Beach. Choose what you would like to do.</p><label class="home-search-label" for="search">Find an address</label><div id="home-search-slot"></div>
    <nav class="home-nav" aria-label="Explore Hamilton Beach">
      <button type="button" id="home-properties">Find my home<span>Photo, property card & deeds</span></button>
      <button type="button" id="home-history">Island history<span>One recorded event at a time</span></button>
      <button type="button" id="home-budget">Budget simulator<span>Road, jetty and sand scenarios</span></button>
      <button type="button" id="home-community">Sign in / my HBA<span>Documents & member tools</span></button>
      <button type="button" id="home-events">Events & photos<span>Calendar and community memories</span></button>
      <button type="button" id="home-issues">Report a problem<span>Tell the board · Add a photo</span></button>
      <button type="button" id="home-newsletter">Newsletter<span>Current issue & past editions</span></button>
      <button type="button" id="home-text-alerts">Text alerts<span>Optional signup · Delivery not active</span></button>
      <button type="button" id="home-volunteers">Volunteer board<span>Event & maintenance opportunities</span></button>
      <button type="button" id="home-dues" hidden>Board dues registry<span>Private household payment statuses</span></button>
      <button type="button" id="home-sand">Sand School<span>How erosion and sand move</span></button>
      <button type="button" id="home-permits">Beach permits<span>Chapter 91 landmarks & nourishment</span></button>
      <button type="button" id="home-town-history">Town permit history<span>HBA cases, minutes & meeting clips</span></button>
      <button type="button" id="home-jetties">Wareham jetties & groins<span>Historical records & proposed work</span></button>
      <button type="button" id="home-bulletin">Beach & weather<span>Cleaning dates, tides & notices</span></button>
      <button type="button" id="home-payments">Pay dues or donate<span>Payment instructions & receipt reports</span></button>
    </nav><label class="home-dues-switch" id="home-dues-control" hidden><input type="checkbox" id="home-dues-dots"> Show selected dues statuses on homes</label>
    <p class="home-short-note">Parcel colors describe rights evidence; dots describe selected dues status. Names and records are not a current-title certification.</p>`;
  const research=document.createElement('details');research.className='home-archive';research.innerHTML='<summary>Research archive & downloads</summary><p>Detailed title searches, clause counts, research gaps and source notes. Original evidence remains available here and in each property report.</p><div class="home-archive-actions"><button type="button" id="home-roads">Road ownership research</button><button type="button" id="home-gaps">Research gaps</button></div>';
  const layers=document.createElement('details');layers.className='home-archive';layers.innerHTML='<summary>Map legend, drainage & license records</summary>';
  const legacy=document.createElement('div');legacy.className='home-legacy';legacy.hidden=true;
  moduleEntries.forEach(e=>legacy.append(e));
  for(const e of original){
    if(e.id==='search'||e.id==='search-results')continue;
    if(e.matches('label[for=search]')){e.remove();continue;}
    if(e.id==='legend'){layers.append(e);continue;}
    if(e.querySelector?.('#ch91-heading')||e.querySelector?.('#drain-heading')){
      const d=document.createElement('details');d.className='home-inner-details';const s=document.createElement('summary');s.textContent=e.querySelector('#ch91-heading')?'Chapter 91 licenses and plans':'Drainage and easement records';d.append(s,e);layers.append(d);
    }else research.append(e);
  }
  panel.append(main,layers,research,legacy);
  main.querySelector('#home-search-slot').append(document.getElementById('search'),document.getElementById('search-results'));
  const daily=['home-bulletin','home-payments','home-events','home-issues','home-properties','home-community'];
  const navigation=main.querySelector('.home-nav');
  const updates=document.createElement('details');updates.className='home-archive home-group';updates.innerHTML='<summary>News, volunteers & text alerts</summary><div class="home-nav"></div>';
  const planning=document.createElement('details');planning.className='home-archive home-group';planning.innerHTML='<summary>Island history, permits & planning</summary><p>Explore the original records and educational models at your own pace.</p><div class="home-nav"></div>';
  for(const id of ['home-newsletter','home-volunteers','home-text-alerts','home-dues'])updates.querySelector('.home-nav').append(document.getElementById(id));
  for(const b of [...navigation.children])if(!daily.includes(b.id))planning.querySelector('.home-nav').append(b);
  daily.forEach(id=>navigation.append(document.getElementById(id)));
  navigation.after(updates,planning);
  document.documentElement.classList.add('hba-large-text');
  document.getElementById('search').placeholder='Try 60 Pilgrim, a deed or permit number';
  const handlers={
    'home-properties':()=>window.openPropertyHistory(178),
    'home-history':()=>window.openIslandHistory(),
    'home-budget':()=>window.openBoardBudget(),
    'home-dues':()=>window.openDuesRegistry(),
    'home-community':()=>window.openHBACommunity(),
    'home-events':()=>window.openHBACommunity('calendar'),
    'home-issues':()=>window.openHBACommunity('issues'),
    'home-newsletter':()=>window.openHBACommunity('newsletter'),
    'home-text-alerts':()=>window.openHBACommunity('sms'),
    'home-volunteers':()=>window.openHBAVolunteers(),
    'home-payments':()=>window.openHBACommunity('payments'),
    'home-bulletin':()=>window.openHBABulletin(),
    'home-sand':()=>window.openSandSchool(),
    'home-permits':()=>window.openNourishmentRecords('all',{resetFilters:true}),
    'home-town-history':()=>window.openHBATownHistory('hamilton'),
    'home-jetties':()=>window.openHBATownHistory('jetties'),
    'home-roads':()=>window.openResearchTools('roads'),
    'home-gaps':()=>window.openResearchTools('gaps')
  };
  Object.entries(handlers).forEach(([id,fn])=>document.getElementById(id).onclick=fn);
  document.getElementById('home-dues-dots').onchange=e=>window.toggleDuesDots(e.target.checked);
  document.addEventListener('hba-account-change',e=>{
    document.getElementById('home-dues').hidden=!e.detail.board;
    document.getElementById('home-dues-control').hidden=!e.detail.board;
    document.getElementById('home-community').querySelector('span').textContent=e.detail.member?'Archive, events & '+(e.detail.board?'board tools':'household memories'):'Sign in · Archive, events & memories';
  });
  const showBoard=!!window.HBACommunity?.isBoard();document.getElementById('home-dues').hidden=!showBoard;document.getElementById('home-dues-control').hidden=!showBoard;
  const mapToggle=document.getElementById('toggle');
  const labelMapToggle=()=>{const collapsed=panel.classList.contains('collapsed');mapToggle.textContent=collapsed?'Menu':'View map';mapToggle.setAttribute('aria-label',collapsed?'Open the main menu':'Close the menu to view the map');mapToggle.setAttribute('aria-expanded',String(!collapsed));};
  labelMapToggle();new MutationObserver(labelMapToggle).observe(panel,{attributes:true,attributeFilter:['class']});
  map.fitBounds(L.geoJSON(PARCELS).getBounds(),{paddingTopLeft:[innerWidth>700?430:25,90],paddingBottomRight:[30,30],animate:false});
})();
