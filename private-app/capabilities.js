(() => {
  'use strict';
  // The dashboard is the permanent base layer of the app. Tools open on top of it as dialogs and
  // return straight to it. The parcel map is itself a tool ("Map & find my home") that replaces the
  // dashboard only while it is needed.
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const community=view=>Object.assign(()=>window.openHBACommunity(view),{view});
  const ill=(slug,alt,label)=>({src:`friendly/ill-${slug}.jpg`,tiny:`friendly/ill-${slug}-tiny.jpg`,alt:'Illustration from a resident photograph: '+alt,label:'Illustration from a resident photograph · '+label});
  const photo=(slug,alt,label)=>({src:`photos/${slug}.jpg`,tiny:`photos/${slug}-tiny.jpg`,alt:'Photograph: '+alt,label:'Photograph · '+label});
  // Every picture is either a real postcard, a resident's photograph, or an illustration painted from one of those photographs.
  const art={
    cottages:{src:'friendly/postcard-cottages.jpg',tiny:'friendly/postcard-cottages-tiny.jpg',alt:'1930s linen postcard: beach and cottages at Hamilton Beach',label:'1930s postcard · Tichnor Brothers no. 73258'},
    aerial:{src:'friendly/postcard-aerial.jpg',tiny:'friendly/postcard-aerial-tiny.jpg',alt:'1930s linen postcard: aerial view of the Wareham beaches',label:'1930s postcard · Tichnor Brothers no. 81056'},
    gardenAutumn:ill('garden-lane','the Hamilton Beach entrance sign in the garden beside the lane in autumn colour','the entrance sign in autumn'),
    gardenSpring:ill('garden-spring','the Hamilton Beach entrance sign with daffodils, tulips and azaleas in spring','the entrance sign in spring'),
    gardenSummer:ill('garden-summer','the Hamilton Beach entrance sign among hydrangeas and daylilies in summer','the entrance sign in summer'),
    gardenWinter:ill('garden-winter','the Hamilton Beach entrance sign with snow on the garden and the brick post','the entrance sign in winter'),
    // The entrance garden follows the calendar: winter Dec–Feb, spring Mar–May, summer Jun–Aug, autumn Sep–Nov.
    get garden(){const m=new Date().getMonth()+1;return m<=2||m===12?this.gardenWinter:m<=5?this.gardenSpring:m<=8?this.gardenSummer:this.gardenAutumn;},
    dawn:ill('sunrise-flats','low sun over the rippled sand at low tide','low sun over the flats'),
    overcast:ill('aerial-beach','the beach, cottages and moorings from the air under a grey sky','the beach from the air'),
    summer:ill('shade-moorings','the beach from under the trees with umbrellas on the sand and boats on the moorings','a summer day on the sand'),
    fence:ill('snow-fence-sun','low sun through the snow fence on the dune','sun through the snow fence'),
    storm:ill('storm-seawall','storm surf breaking against the seawall','storm at the seawall'),
    winterSun:ill('winter-sun-ice','winter sun over the frozen shore','winter sun'),
    iceJetty:ill('ice-jetty','ice and snow around the jetty','ice around the jetty'),
    supper:ill('supper-tables','red, white and green tables along the picket fence for the spaghetti supper','spaghetti supper tables'),
    supperSetup:ill('supper-tent','the supper tent at dusk with red and green lights lit, lace-covered checked tablecloths, the Hamilton Beach Spaghetti Supper sign and the harbor beyond','under the supper tent'),
    oldHouse:photo('old-house-seawall','neighbors on the seawall below a shingled cottage, undated black-and-white family copy','the seawall, undated'),
    oldJetty:photo('old-jetty-surf','swimmers off the jetty, undated black-and-white family copy','the jetty, undated')
  };
  window.HBAArt=art;
  // Card pictures: real photographs from the library, or illustrations painted from residents' photographs.
  const P=(slug,alt)=>photo(slug,alt,alt),I=(slug,alt)=>ill(slug,alt,alt);
  const pics={
    summer:P('fireworks-beach','fireworks over the beach on the Fourth'),hosting:P('supper-banner','the Spaghetti Supper banner on the picket fence'),poll:P('fireworks-sky','fireworks over the water on the Fourth'),
    newsletter:P('swan-reeds','a swan passing the reeds'),team:P('supper-street','bunting over the street for the supper'),message:P('flagpole-roses','the flagpole and beach roses'),
    issues:P('marsh-creek-fog','the marsh creek in morning fog'),volunteers:P('osprey-nest','an osprey on its nesting platform'),events:P('pier-sunset-reeds','sunset over the pier'),
    votes:P('marsh-sunrise','sunrise over the marsh'),elections:P('moonrise-dusk','moonrise at dusk'),meetings:P('lamp-pier-sunset','the lamp, wall and pier at sunset'),
    governance:P('shell-patch','the Hamilton Beach scallop-shell patch'),documents:P('old-jetty-surf','the jetty, undated'),research:P('sunrise-flats','low sun over the flats'),
    trash:P('garden-lane','the entrance garden'),townrules:P('walkers-on-ice','walkers on the ice'),town:P('ice-jetty','ice around the jetty'),
    planner:P('aerial-beach','the beach from the air'),duesbuy:P('rainbow-chairs','beach chairs'),payments:P('snow-fence-sun','sun through the snow fence'),bids:P('storm-seawall','the seawall in a storm'),
    dues:P('winter-sun-ice','winter sun'),finance:P('snow-sunset','snow at sunset'),bank:P('ice-shelf','the ice shelf'),work:P('old-jetty-surf','the jetty'),budget:P('ice-jetty','ice at the jetty'),
    island:P('benson-house-1930s','the Benson house and seawall at the end of Algelo Avenue, between 1926 and 1938'),beach:P('aerial-point-dusk','the point and sandbar from the air'),property:P('garden-lane','the entrance lane'),sand:P('sunrise-flats','the flats at sunrise'),
    practice:P('rainbow-chairs','chairs on the beach'),sms:P('moonrise-boat','moonrise over the water'),password:P('full-moon-water','moonlight on the water'),members:P('winter-sun-ice','winter sun'),appmap:P('aerial-point-dusk','the point from the air at dusk'),account:P('marsh-sunrise','the marsh at sunrise')
  };
  // Line icons for the cards and quick buttons (stroke follows the text colour).
  const ICON={
    summer:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    newsletter:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h6M7 12h10M7 16h10M15 8h2"/>',
    poll:'<path d="M5 20V10M12 20V4M19 20v-7"/><path d="M3 20h18"/>',
    hosting:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 5v4M16 5v4M10 12l5 2.5-5 2.5z"/>',
    volunteers:'<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/>',
    events:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    team:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    message:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    issues:'<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    votes:'<path d="M5 12l4 4L19 6"/><rect x="3" y="3" width="18" height="18" rx="3"/>',
    elections:'<path d="M4 11h16l-1 9H5z"/><path d="M8 11V5h8v6M12 7v2"/>',
    meetings:'<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20a6 6 0 0 1 12 0M10 20a6 6 0 0 1 12 0"/>',
    governance:'<path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 0-3 3z"/><path d="M4 4v16M8 9h7M8 13h7"/>',
    documents:'<path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    research:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5M9 9.5a2 2 0 1 1 3 1.7c-.7.4-1 .9-1 1.8M11 15h.01"/>',
    trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    townrules:'<path d="M4 5h13l3 3-3 3H4z"/><path d="M8 11v10M6 21h4"/>',
    town:'<path d="M3 21h18M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6M10 11h1M13 11h1"/>',
    planner:'<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="7" cy="17" r="2" fill="currentColor"/>',
    duesbuy:'<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M12 3a9 9 0 0 1 9 9"/>',
    payments:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
    bids:'<path d="M9 4h6v3H9z"/><path d="M7 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1"/><path d="M8 12h8M8 16h5"/>',
    dues:'<path d="M4 5h16v14H4z"/><path d="M8 10h8M8 14h5"/><path d="M4 9h16"/>',
    finance:'<path d="M4 6h16v12H4z"/><path d="M4 10h16M8 15h3M14 15h3"/>',
    bank:'<path d="M3 10l9-6 9 6"/><path d="M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"/>',
    work:'<path d="M14 4l6 6-9 9H5v-6z"/><path d="M12 6l6 6"/>',
    budget:'<path d="M4 19V5M4 19h16"/><path d="M7 15l4-5 3 3 5-7"/>',
    island:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    beach:'<path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M4 8l3-4 3 4"/>',
    property:'<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
    sand:'<path d="M3 18c3-4 6-4 9 0s6 4 9 0"/><circle cx="17" cy="7" r="3"/><path d="M4 12h6"/>',
    practice:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M12 17h.01"/>',
    account:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    sms:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    password:'<circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M17 5l2 2M14 8l2 2"/>',
    appmap:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 17.5h7M17.5 14v7"/>',
    members:'<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M17 11a3 3 0 1 0 0-6M19 20a6 6 0 0 0-3-5.2"/>'
  };
  const icon=id=>ICON[id]?`<svg class="cap-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[id]}</svg>`:'';
  const groups=[
    {id:'today',title:'Today at the beach',blurb:'What is happening, who to reach and how to help.',art:'live',tools:[
      {id:'summer',title:'Summer events sheet',desc:'The whole season on one colorful page, ready to print for the fridge.',more:['14 events','Poster or list','Print for the fridge'],who:'residents',keys:'summer events sheet print fridge schedule fishing derby bingo supper kickoff predict next year',run:()=>window.openHBASummer()},
      {id:'newsletter',title:'Newsletter',desc:'Read the March 2026 issue here, with photographs. Past issues too.',more:['March 2026 issue','Photographs','Past editions'],who:'residents',keys:'newsletter news editions issue read',run:()=>window.openHBANewsletter()},
      {id:'poll',title:'Event survey and polling',desc:'Tell us which film to show, which night works, and what you thought of an event.',more:['Movie choices','Dates that work','Event feedback'],who:'residents',keys:'poll survey vote film movie choice event feedback',run:(arg)=>window.openHBAPoll(arg)},
      {id:'hosting',title:'Host Movie Night',desc:'Offer an evening that suits you. The board approves and neighbors pick the film.',more:['Pick a date','Board approves','Neighbors choose the film'],who:'residents',keys:'movie night host hosting offer film poll',run:()=>window.openHBAHosting()},
      {id:'volunteers',title:'Volunteer board',desc:'Sign up for an event or a work day. Most events run on volunteers.',more:['Summer Kickoff roles','Work days','Live counts'],who:'residents',keys:'volunteer help tasks sign up',run:community('volunteers')},
      {id:'events',title:'Event photos',desc:'Memories from past gatherings. Add your own photographs.',more:['Past gatherings','Add your photos'],who:'residents',keys:'photos pictures memories',run:community('events')},
      {id:'team',title:'Contact our team',desc:'Officers and street governors, with phone and email.',more:['Officers','Street governors','Phone & email'],who:'residents',keys:'contact team board officers governors phone email president treasurer secretary',run:()=>window.openHBATeam()},
      {id:'message',title:'Message my governor',desc:'A note to your street governor or any officer, saved to the board inbox.',more:['Goes to the board inbox','Reply by email or phone'],who:'residents',keys:'message governor contact note question',run:()=>window.openGovernorMessage()},
      {id:'issues',title:'Report a problem',desc:'A beach, road or drainage issue, with a photo if you have one.',more:['Beach · road · drainage','Attach a photo','Tracked to closure'],who:'residents',keys:'issue problem complaint photo report',run:community('issues')}
    ]},
    {id:'governance',title:'Association & governance',blurb:'How decisions are made and recorded under the 2022 Bylaws.',art:'supperSetup',tools:[
      {id:'votes',title:'Your vote matters',desc:'Vote here on capital improvement funds, elections and motions. Live counts, quorum and proxy rules from the bylaws.',more:['Capital improvement funds','Elections & motions','Quorum & proxies'],who:'residents',keys:'vote votes poll ballot quorum proxy election motion capital improvement fund',cls:'cap-card-feature',run:community('votes')},
      {id:'elections',title:'Elections',desc:'Board of Governors terms, nominations and election years.',more:['Governor terms','Nominations','Election years'],who:'residents',keys:'election nominations governors terms',run:community('elections')},
      {id:'meetings',title:'Board meetings & minutes',desc:'Dates, agendas, access details and the approved minutes of each meeting.',more:['Next meeting','Agendas','Approved minutes'],who:'residents',keys:'meeting meetings agenda zoom minutes record secretary motions approved',run:community('meetings')},
      {id:'governance',title:'Governance guide',desc:'Bylaws, duties of governors and how the association is organised.',more:['2022 Bylaws','Duties of governors','How it is organised'],who:'residents',keys:'bylaws constitution duties governors rules',run:community('governance')},
      {id:'documents',title:'Documents',desc:'The private archive of association records.',more:['Contracts','Permits','Letters & reports'],who:'residents',keys:'documents archive files pdf',run:community('documents')},
      {id:'research',title:'Ask our documents',desc:'Plain-language questions answered from the archive, with citations.',more:['Ask in plain words','Answers cite the page'],who:'residents',keys:'ask question search documents ai',run:community('research')}
    ]},
    {id:'town',title:'Town of Wareham',blurb:'Short answers. Exact by-law wording and phone numbers inside.',art:'gardenAutumn',tools:[
      {id:'trash',title:'Trash & recycling',desc:'Tuesday pickup for our streets. Recycling every other week. Holiday weeks move to Wednesday.',more:['Tuesdays','Recycling every other week','Holiday changes'],who:'residents',keys:'trash recycling pickup garbage barrel harvey tuesday holiday transfer station',run:()=>window.openHBATownRules('trash'),live:'pickup'},
      {id:'townrules',title:'Town rules',desc:'Quiet hours, dogs, golf carts and scooters, moorings, construction. One screen each.',more:['Quiet hours','Dogs','Golf carts & scooters','Moorings'],who:'residents',keys:'wareham bylaws town rules quiet hours noise construction leash dogs golf cart scooter mooring harbor',run:()=>window.openHBATownRules()},
      {id:'town',title:'Town permits & HBA cases',desc:'Our cases in town records: Conservation Commission, DPW and meeting clips.',more:['Conservation Commission','DPW','Meeting clips'],who:'residents',keys:'permits town minutes conservation commission jetties groins seawall',run:()=>window.openHBATownHistory('hamilton')}
    ]},
    {id:'money',title:'Money & planning',blurb:'Where the money goes, and what different dues amounts would make possible.',art:'fence',tools:[
      {id:'planner',title:'Dues planner',desc:'Slide the dues amount and watch, in plain words, what it pays for and when the big projects become affordable.',more:['Start at $500','Slide and see','Operating costs & projects'],who:'residents',keys:'budget simulator planner scenarios roads jetty sand reserve dues slider',cls:'cap-card-feature',run:()=>window.openHBADuesPlanner('planner')},
      {id:'duesbuy',title:'What my dues buy',desc:'Your $500 broken down item by item, with a pie chart in dollars.',more:['Pie in dollars','Tap a slice for details','Per month too'],who:'residents',keys:'dues pie chart breakdown what do my dues buy',run:()=>window.openHBADuesPlanner('pie')},
      {id:'payments',title:'Pay dues or donate',desc:'Where to send a check, and a place to report a payment so the treasurer can match it.',more:['$500 due May 1','P.O. Box 365','Report a payment'],who:'residents',keys:'pay dues donate payment venmo check receipt',run:community('payments')},
      {id:'bids',title:'Contractor bids',desc:'Bid requests, submissions and board reviews.',more:['Open requests','Submitted bids','Board reviews'],who:'residents',keys:'bids contractors quotes',run:community('bids')},
      {id:'dues',title:'Board dues registry',desc:'Household payment statuses, corrections and audit trail.',more:['Paid & unpaid','Corrections','Audit trail'],who:'board',keys:'dues registry paid unpaid households',run:()=>window.openDuesRegistry()},
      {id:'finance',title:'Check register',desc:'Checks written and received, with supporting documents.',more:['Checks in & out','Supporting documents'],who:'board',keys:'checks register treasurer finance',run:community('finance')},
      {id:'bank',title:'Bank reconciliation',desc:'Match bank statements to the register.',more:['Statements','Matched to the register'],who:'board',keys:'bank statement reconcile',run:community('bank')},
      {id:'work',title:'Contractor work',desc:'Work orders, notes and photos of completed jobs.',more:['Work orders','Photos of finished jobs'],who:'board',keys:'work orders contractor jobs',run:community('work')},
      {id:'budget',title:'Detailed capital model',desc:'The full year-by-year model behind the planner: reserves, contingency and every project line.',more:['Year by year','Contingency','Every project line'],who:'board',keys:'budget simulator detailed model scenarios capital',run:()=>window.openBoardBudget()}
    ]},
    {id:'history',title:'History & research',blurb:'The records, organised by subject. Open a card to see what is inside.',art:'oldHouse',tools:[
      {id:'island',title:'Island story',desc:'Timeline, storms and the 1930s postcards.',more:['Timeline','Storms since 1635','1930s postcards'],who:'residents',keys:'history island timeline 1915 1922 plan storms hurricane postcards',cluster:true,sub:[
        {id:'island-timeline',label:'Island history, one event at a time',run:()=>window.openIslandHistory()},
        {id:'storms',label:'Storms & hurricanes since 1635',run:()=>window.openHBAStorms()},
        {id:'postcards',label:'Historical postcards',run:()=>document.getElementById('postcards-dialog')?.showModal()}]},
      {id:'beach',title:'Beach projects & permits',desc:'Chapter 91 licenses, nourishment records, jetties and how a project gets approved.',more:['Chapter 91 licenses','Nourishment records','Jetties & groins'],who:'residents',keys:'chapter 91 license nourishment sand permits jetties groins grants path funding',cluster:true,sub:[
        {id:'permits',label:'Beach permits & nourishment records',run:()=>window.openNourishmentRecords('all',{resetFilters:true})},
        {id:'jetties',label:'Wareham jetties & groins',run:()=>window.openHBATownHistory('jetties')},
        {id:'guide',label:'Rules, grants & suggested path',run:()=>window.openNourishmentGuide()}]},
      {id:'property',title:'Property & roads',desc:'The parcel map, your own house record and who owns the streets.',more:['Parcel map','Your house record','Who owns the streets'],who:'residents',keys:'map address deed title parcel assessor property house find layers drainage easements roads ownership right of way household family gaps',cluster:true,sub:[
        {id:'properties',label:'Map & find my home',run:()=>window.HBAShell.showMap({mode:'home'})},
        {id:'households',label:'My household record',run:community('households')},
        {id:'roads',label:'Road ownership research',run:()=>window.openResearchTools('roads')},
        {id:'gaps',label:'Research gaps',run:()=>window.openResearchTools('gaps')},
        {id:'reports',label:'All property reports (administrator)',who:'admin',run:()=>window.openPropertyHistory(178)}]},
      {id:'sand',title:'Sand School',desc:'The short version of how our beach loses sand and the four ways to keep it. Lessons if you want them.',more:['Erosion photos 1938–2025','Jetty model','Four fixes'],who:'residents',keys:'erosion sand school education wind fence jetty',run:()=>window.openSandSchool()}
    ]},
    {id:'help',title:'Help & my account',blurb:'',art:'oldJetty',tools:[
      {id:'practice',title:'How to use the app',desc:'Practice examples for residents and board members.',more:['Step-by-step examples','Residents & board'],who:'residents',keys:'help practice tutorial how to',run:()=>window.openHBAAppPractice()},
      {id:'account',title:'My account & sign-in',desc:'Your name, the house linked to your account, your role, and who to ask for changes.',more:['Your name & house','Your role','Who to ask'],who:'residents',keys:'account profile role household link sign in email',run:community('overview')},
      {id:'sms',title:'Text updates',desc:'Choose which topics you want by text. Delivery starts when the board connects a provider.',more:['Choose topics','Your mobile number'],who:'residents',keys:'sms text alerts updates phone notifications',run:community('sms')},
      {id:'password',title:'Change my password',desc:'Choose a new password. You will need your current one.',more:['Needs your current one','Save it on your device'],who:'residents',keys:'password change sign in login account security',run:()=>window.openHBAPasswordChange()},
      {id:'appmap',title:'App map',desc:'Every button in the app, where it lives, what it opens and which ones overlap. The administrator can hide any of them from residents.',more:['All buttons on one page','Overlaps flagged','Hide a button'],who:'board',keys:'app map buttons tools inventory hide redundant explore functions',run:()=>window.openHBAAppMap()},
      {id:'members',title:'Accounts',desc:'Approve new residents, link households, manage roles, reset a password or delete a resident.',more:['Approve requests','Link households','Reset a password'],who:'board',keys:'accounts requests approve roles members delete resident reset password',run:community('members')}
    ]}
  ];
  const quick=[
    {id:'payments',label:'Pay dues or donate',sub:'$500 by May 1 · checks or report a payment'},
    {id:'summer',label:'Summer events',sub:'The season on one page'},
    {id:'issues',label:'Report a problem',sub:'Beach, road or drainage'},
    {id:'team',label:'Contact our team',sub:'Officers & governors'}
  ];
  const whoLabel={residents:'Residents',board:'Board',admin:'Administrator'};
  // Residents never see board tools; the two audiences are residents and the board.
  // The administrator can hide any card or sub-button from residents (App map). Admins still see it, tagged.
  const hiddenTools=new Set();
  const isAdmin=()=>member?.role==='admin';
  const visible=t=>{if(hiddenTools.has(t.id)&&!isAdmin())return false;return t.who==='admin'?isAdmin():t.who!=='board'||board;};
  const dash=document.createElement('section');dash.id='hba-dashboard';dash.className='hba-dashboard';dash.setAttribute('aria-label','Hamilton Beach dashboard');document.body.append(dash);
  let query='',live={},board=false,member=null,loading=false,mapMode=false,loadedOnce=false;
  const api=(...a)=>window.HBACommunity.api(...a);
  const glyph=(kind,light)=>window.HBABeachScene?.glyph(kind,light,44)||'';
  function currentPainting(){
    const w=live.weather;if(!w||!window.HBABeachScene)return null;
    const cur=window.HBABeachScene.classify(w.observation?.description||w.hourly?.[0]?.description,w.observation?.wind_mph,w.observation?.gust_mph,w.hourly?.[0]?.rain_probability,window.HBABeachScene.solarElevation(new Date()));
    const sc=cur?window.HBABeachScene.scene(cur.picture):null;
    return sc?{...sc,label:sc.label+' · matched to current conditions'}:null;
  }
  function picture(key,cls='cap-art'){
    const a=key==='live'?(currentPainting()||art.cottages):art[key];if(!a)return '';
    return `<figure class="${cls}" style="background-image:url('${a.tiny}')"><img src="${a.src}" alt="${esc(a.alt)}" loading="lazy" decoding="async"><figcaption>${esc(a.label)}</figcaption></figure>`;
  }
  function liveTiles(){
    const w=live.weather,cur=w?window.HBABeachScene.classify(w.observation?.description||w.hourly?.[0]?.description,w.observation?.wind_mph,w.observation?.gust_mph,w.hourly?.[0]?.rain_probability,window.HBABeachScene.solarElevation(new Date())):null;
    const temp=w?(w.observation&&!w.observation.stale?w.observation.temperature_f:w.hourly?.[0]?.temperature_f):null;
    const desc=w?(w.observation&&!w.observation.stale?w.observation.description:w.hourly?.[0]?.description):'';
    const wind=w?(w.observation&&!w.observation.stale?w.observation.wind_mph:null):null;
    const tide=live.tides?window.HBABeachScene.tideNow(live.tides.predictions,new Date()):null;
    const alerts=live.alerts;
    const tile=(id,label,big,small,extra='')=>`<button type="button" class="cap-live" data-cap-run="${id}"><span class="cap-live-label">${label}</span><span class="cap-live-big">${big}</span><span class="cap-live-small">${small}</span>${extra}</button>`;
    const accountExtra=(live.votes?`<span class="cap-live-small">${live.votes} open vote${live.votes===1?'':'s'} or poll${live.votes===1?'':'s'}</span>`:'')+
      (board&&live.pending!==undefined?`<span class="cap-live-small">${live.pending} payment report${live.pending===1?'':'s'} waiting</span>`:'')+
      (board&&live.messages?`<span class="cap-live-small cap-live-alert">${live.messages} new message${live.messages===1?'':'s'} to governors</span>`:'');
    return `<div class="cap-live-row" aria-label="Right now">
      ${tile('bulletin','Weather now',w?`${cur?glyph(cur.kind,cur.light):''}<span>${temp===null||temp===undefined?'—':Math.round(temp)+'°'}</span>`:loading?'…':'—',w?esc(desc)+(wind!==null&&wind!==undefined?` · wind ${Math.round(wind)} mph`:''):live.weatherError?esc(live.weatherError):'Loading NWS data…')}
      ${tile('bulletin','Next tide',tide?.next?`${tide.next.type==='H'?'High':'Low'} ${new Date(tide.next.t).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'})}`:loading?'…':'—',tide?.height!==null&&tide?.height!==undefined?`now about ${tide.height.toFixed(1)} ft, ${tide.rising?'rising':'falling'} · Great Hill prediction`:live.tideError?esc(live.tideError):'NOAA Great Hill predictions')}
      ${tile('bulletin','NWS alerts',alerts?String((alerts.alerts||alerts.features||[]).length||0):loading?'…':'—',alerts?((alerts.alerts||alerts.features||[]).length?'Active alert(s) for the Hamilton Beach area':'No active alerts at last check'):live.alertError?esc(live.alertError):'Checking the National Weather Service…')}
      ${member?tile(board&&live.messages?'team':board?'members':'team','Your account',esc(member.display_name||member.email||'Member'),esc({pending:'Awaiting board approval',resident:'Resident',board:'Board member',admin:'Administrator',suspended:'Access suspended'}[member.role]||member.role||''),accountExtra):tile('signin','Your account','Sign in','Members see household, votes and archive tools')}
    </div>`;
  }
  function pic(id){const a=pics[id];return a?`<span class="cap-card-pic" style="background-image:url('${a.tiny}')"><img src="${a.src}" alt="" loading="lazy" decoding="async"><em>${esc(a.label)}</em></span>`:'';}
  const chips=t=>t.more?.length?`<span class="cap-chips">${t.more.map(m=>`<span class="cap-chip">${esc(m)}</span>`).join('')}</span>`:'';
  function card(t){
    if(t.cluster){
      const subs=t.sub.filter(visible);
      return `<div class="cap-card cap-cluster${t.cls?' '+t.cls:''}" role="group" aria-labelledby="cap-title-${t.id}">${pic(t.id)}<span class="cap-card-title" id="cap-title-${t.id}">${icon(t.id)}<span>${esc(t.title)}</span></span><span class="cap-card-desc">${esc(t.desc)}</span>${chips(t)}<span class="cap-cluster-list">${subs.map(x=>`<button type="button" class="cap-sub${hiddenTools.has(x.id)?' cap-sub-hidden':''}" data-cap-run="${x.id}">${esc(x.label)}${hiddenTools.has(x.id)?' <small>(hidden from residents)</small>':''}</button>`).join('')}</span></div>`;
    }
    const liveLine=t.live==='pickup'?(()=>{try{const n=window.hbaNextPickup?.();return n?`<span class="cap-card-live">Next: ${esc(n.label)}</span>`:'';}catch{return '';}})():'';
    return `<button type="button" class="cap-card${t.cls?' '+t.cls:''}" data-cap-run="${t.id}" aria-describedby="cap-desc-${t.id}">${pic(t.id)}<span class="cap-card-title">${icon(t.id)}<span>${esc(t.title)}</span></span><span class="cap-card-desc" id="cap-desc-${t.id}">${esc(t.desc)}</span>${liveLine}${chips(t)}${t.who==='residents'?'':`<span class="cap-tag cap-tag-${t.who}">${esc(whoLabel[t.who]||t.who)}</span>`}${hiddenTools.has(t.id)?'<span class="cap-tag cap-tag-hidden">Hidden from residents</span>':''}</button>`;
  }
  const allTools=()=>groups.flatMap(g=>g.tools.flatMap(t=>t.cluster?[t,...t.sub.map(x=>({...x,title:x.label,desc:'',keys:'',who:x.who||t.who}))]:[t]));
  const quickIds=new Set(['payments','summer','issues','team']);
  function matches(t){if(!visible(t))return false;if(!query)return !quickIds.has(t.id);const q=query.toLowerCase();return (t.title+' '+t.desc+' '+t.keys+' '+(t.sub||[]).map(x=>x.label).join(' ')).toLowerCase().includes(q);}
  function greeting(){
    const h=new Date().getHours();const part=h<5?'Good evening':h<12?'Good morning':h<17?'Good afternoon':'Good evening';
    const name=member?.display_name?.split(' ')[0];
    return name?`${part}, ${esc(name)}.`:`${part}.`;
  }
  // ---- Coming up: recorded dates, the standing board-meeting rule, the annual supper rule and newsletter tentatives ----
  // The quick view shows one year at a time; the board and residents step between years with the arrows.
  let upYear=null;
  function upcomingItems(limit=8){
    const u=live.upcoming;if(!u||!window.HBAEventDates)return null;
    const D=window.HBAEventDates,today=u.today||new Date().toLocaleDateString('en-CA'),items=[];
    for(const e of u.events||[]){const key=D.effective(e);if(key>=today)items.push({key,time:e.event_time,title:e.title,where:e.location,kind:(u.series||[]).find(s=>s.id===e.series_id)?.recurrence_rule?'supper':'event',tag:e.planning_only?(e.location||e.event_time?'Planned · usual time and place':'Planned · details pending'):'Scheduled',id:e.id});
      if(e.rain_date&&!e.use_rain_date&&e.rain_date>=today&&e.state==='scheduled')items.push({key:e.rain_date,time:e.event_time,title:'Rain backup: '+e.title,where:e.location,kind:'rain',tag:'Only if needed'});}
    for(const m of u.meetings||[])if(m.state==='scheduled'&&m.meeting_date>=today)items.push({key:m.meeting_date,time:m.meeting_time,title:m.title,where:m.location,kind:'meeting',tag:m.audience==='general'?'General meeting':'Board meeting',id:m.id});
    const rule=D.parseRule(u.board_meeting_rule);
    for(const m of D.boardMeetingsBetween(rule,today,14,u.meetings||[]).filter(m=>m.meeting_date>=today).slice(0,3))items.push({key:m.meeting_date,time:m.meeting_time,title:m.title,where:m.location,kind:'meeting',tag:'Board meeting · standing schedule',projected:true});
    const yr=Number(today.slice(0,4));
    for(const s of (u.series||[]).filter(s=>s.recurrence_rule==='august_third_saturday'))for(const y of [yr,yr+1]){const p=D.annualProjection(s,y,u.events||[]);if(p&&p.event_date>=today&&!items.some(i=>i.key===p.event_date&&i.kind==='supper'))items.push({key:p.event_date,time:p.event_time,title:p.title,where:p.location,kind:'supper',tag:p.location||p.event_time?'Annual rule · usual time and place':'Annual rule · details pending',projected:true});}
    for(const t of D.tentative2026)if(t.date>=today&&!items.some(i=>i.key===t.date&&i.title.toLowerCase().includes(t.title.toLowerCase().split(' (')[0])))items.push({key:t.date,time:t.time,title:t.title,where:t.location,kind:'tentative',tag:'Tentative · newsletter'});
    items.sort((a,b)=>a.key.localeCompare(b.key)||String(a.time||'').localeCompare(String(b.time||'')));
    const years=[...new Set(items.map(i=>i.key.slice(0,4)))].sort();
    if(!upYear||!years.includes(upYear))upYear=years[0]||today.slice(0,4);
    const inYear=items.filter(i=>i.key.startsWith(upYear));
    return {items:inYear.slice(0,limit),rule,today,total:inYear.length,years,year:upYear};
  }
  const dayDiff=(key,today)=>Math.round((new Date(key+'T12:00:00')-new Date(today+'T12:00:00'))/86400000);
  const whenLabel=(key,today)=>{const d=dayDiff(key,today);return d===0?'Today':d===1?'Tomorrow':d<7?new Date(key+'T12:00:00').toLocaleDateString('en-US',{weekday:'long'}):d<60?`In ${d} days`:new Date(key+'T12:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'});};
  const clock=t=>{const [h,mi]=String(t||'').split(':').map(Number);return Number.isInteger(h)?new Date(2000,0,1,h,mi||0).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'';};
  // One week before a board meeting whose place is not set, the administrator (or a scheduling officer) is asked to decide.
  function locationDecision(up){
    if(!up||!live.upcoming?.can_schedule)return '';
    const due=up.items.filter(i=>i.kind==='meeting'&&!i.where&&dayDiff(i.key,up.today)<=7&&dayDiff(i.key,up.today)>=0);
    if(!due.length)return '';
    const m=due[0],d=new Date(m.key+'T12:00:00');
    return `<div class="cap-decision" role="status"><strong>Decision needed: where will the board meet?</strong><span>${esc(m.title)} is ${(n=>n===0?'today':n===1?'tomorrow':`in ${n} days`)(dayDiff(m.key,up.today))}, ${d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}${m.time?' at '+clock(m.time):''}, and no location has been selected. The rule is to choose one about a week ahead.</span><button type="button" data-cap-set-location="${m.key}"${m.id?` data-cap-meeting-id="${m.id}"`:''}>Select the location</button></div>`;
  }
  function upcomingPanel(cls){
    if(!member||!['resident','board','admin'].includes(member.role))return '';
    const up=upcomingItems();
    const body=!up?(live.upcomingError?`<p class="cap-side-note">${esc(live.upcomingError)}</p>`:'<p class="cap-side-note">Loading the calendar…</p>')
      :!up.items.length?'<p class="cap-side-note">No dates on the calendar yet. The board can add events and meetings in the calendar tool.</p>'
      :`<ol class="cap-up-list">${up.items.map(i=>{const d=new Date(i.key+'T12:00:00');return `<li><button type="button" class="cap-up cap-up-${i.kind}" data-cap-day="${i.key}" aria-label="${esc(i.title+', '+d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})+(i.time?', '+clock(i.time):''))}"><span class="cap-up-date"><span>${d.toLocaleDateString('en-US',{month:'short'})}</span><strong>${d.getDate()}</strong><span>${d.toLocaleDateString('en-US',{weekday:'short'})}</span></span><span class="cap-up-body"><strong class="cap-up-title">${esc(i.title)}</strong><span>${esc(whenLabel(i.key,up.today))}${i.time?' · '+clock(i.time):''}${i.where?' · '+esc(i.where):i.kind==='meeting'?' · Location to be selected':''}</span><em>${esc(i.tag)}</em></span></button></li>`;}).join('')}</ol>`;
    const yi=up?up.years.indexOf(up.year):-1;
    const yearNav=up&&up.years.length?`<div class="cap-year-nav" role="group" aria-label="Choose a year"><button type="button" data-up-year="${esc(up.years[yi-1]||'')}"${yi>0?'':' disabled'} aria-label="Earlier year">‹</button><strong>${esc(up.year)}</strong><button type="button" data-up-year="${esc(up.years[yi+1]||'')}"${yi<up.years.length-1?'':' disabled'} aria-label="Later year">›</button></div>`:'';
    return `<aside class="${cls}" aria-labelledby="${cls}-title"><div class="cap-side-head"><h2 id="${cls}-title">Coming up</h2>${yearNav}<button type="button" data-cap-run="calendar">Open calendar</button></div>${locationDecision(up)}${body}${up?.rule?`<p class="cap-side-note">Board of Governors meetings: ${esc(window.HBAEventDates.ruleLabel(up.rule))}. Recorded meetings replace the standing date; standing dates have no agenda yet.</p>`:''}</aside>`;
  }
  // The saved position only follows scrolling the reader does (wheel, touch, keyboard, scrollbar). Any other scroll —
  // a browser scrolling a button into view when a dialog closes, or a re-render while pictures load — is put back.
  // Scroll memory. The reader's own scrolling is always accepted. Only in the short window right after a re-render
  // or after a dialog closes (when the browser may scroll a focused button into view) is the remembered position put back.
  let savedScroll=0,lastInput=0,restoreUntil=0,rendered=false;
  const noteInput=()=>{lastInput=performance.now();};
  for(const ev of ['pointerdown','wheel','touchstart','touchmove','keydown'])dash.addEventListener(ev,noteInput,{passive:true,capture:true});
  const userScrolling=()=>performance.now()-lastInput<800;
  const holdScroll=(ms=700)=>{restoreUntil=performance.now()+ms;};
  function facts(){
    const now=new Date(),parts=[now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})];
    const tide=live.tides&&window.HBABeachScene?window.HBABeachScene.tideNow(live.tides.predictions,now):null;
    if(tide?.next)parts.push(`${tide.next.type==='H'?'High':'Low'} tide ${new Date(tide.next.t).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'})}`);
    try{const n=window.hbaNextPickup?.(now);if(n)parts.push(n.label);}catch{}
    if(board&&live.requestTotal)parts.push(`${live.requestTotal} request${live.requestTotal===1?'':'s'} waiting for the board`);
    if(!member)parts.push('Sign in to see your household, calendar and board tools');
    return parts.map(esc).join(' <span class="cap-dot">·</span> ');
  }
  // ---- Dues & giving: the live picture of what came in, with sample figures until the treasurer's records fill in ----
  const DUES_SAMPLE=[{year:2022,paid:98,sample:true},{year:2023,paid:101,sample:true},{year:2024,paid:104,sample:true},{year:2025,paid:106,sample:true},{year:2026,paid:105,sample:false,source:'Annual meeting minutes, August 30, 2026'}];
  function duesYears(){
    const rows=DUES_SAMPLE.map(r=>({...r}));
    const liveRows=live.duesLive;if(liveRows){for(const [y,n] of Object.entries(liveRows)){const r=rows.find(x=>x.year===Number(y));if(r&&n>0){r.paid=n;r.sample=false;r.source='Board dues registry';}}}
    return rows;
  }
  function givingPanel(){
    if(!member||!['resident','board','admin'].includes(member.role))return '';
    const rows=duesYears(),max=Math.max(...rows.map(r=>r.paid)),DUE=500;
    const bars=rows.map(r=>`<li class="${r.sample?'cap-bar-sample':''}"><span class="cap-bar-year">${r.year}</span><span class="cap-bar-track"><i style="width:${Math.round(100*r.paid/max)}%"></i></span><span class="cap-bar-val">${r.paid} homes · ${money(r.paid*DUE)}${r.sample?'<small>sample</small>':''}</span></li>`).join('');
    const lb=live.leaderboard;const gifts=lb&&Number(lb.totals?.gifts)?`${money(lb.totals.amount)} in ${lb.totals.gifts} verified gift${lb.totals.gifts===1?'':'s'} this year`:'No verified gifts recorded this year yet';
    const pie=window.HBADuesPlanner?.miniPie?.(DUE,170)||'';
    return `<section class="cap-giving" id="cap-giving" aria-labelledby="cap-giving-title">
      <div class="cap-giving-head"><div><p class="cap-eyebrow">Dues & giving</p><h2 id="cap-giving-title">Dues are $500, due May 1</h2><p class="cap-side-note">Checks to Hamilton Beach Association, P.O. Box 365, Wareham MA 02571, or report a payment here so the treasurer can match it.</p></div>
        <div class="cap-giving-actions"><button type="button" class="cap-quick-btn" data-cap-run="payments">${icon('payments')}<strong>Pay dues or donate</strong><span>Mail a check or report a payment</span></button><button type="button" class="cap-ghost-btn" data-cap-run="planner">Try the dues planner</button></div></div>
      <div class="cap-giving-grid">
        <div class="cap-giving-col"><h3>Dues collected by year</h3><ol class="cap-bars">${bars}</ol><p class="cap-side-note">${rows.some(r=>r.sample)?'Greyed bars are sample figures until the treasurer’s records fill in. ':''}2026: 105 homes paid, reported at the annual meeting on August 30, 2026. ${gifts}.</p></div>
        <button type="button" class="cap-giving-col cap-giving-pie" data-cap-run="duesbuy" aria-label="What my dues buy: open the full breakdown"><h3>What my $500 buys</h3>${pie}<span class="cap-side-note">Tap for the item-by-item breakdown.</span></button>
      </div>
      ${leaderboard()}
    </section>`;
  }
  function render(){
    const scroll=savedScroll,focusId=document.activeElement?.id;
    if(!rendered){rendered=true;dash.dataset.fresh='1';setTimeout(()=>{delete dash.dataset.fresh;},1600);}
    holdScroll();
    const total=groups.reduce((n,g)=>n+g.tools.filter(visible).length,0),shown=groups.reduce((n,g)=>n+g.tools.filter(matches).length,0);
    const heroArt=photo('aerial-beach','the beach, cottages and moorings from the air','the beach from the air');
    dash.innerHTML=`<div class="cap-shell"><div class="cap-main"><header class="cap-hero2${query?' cap-hero2-compact':''}" style="background-image:url('${heroArt.src}'),url('${heroArt.tiny}')"><div class="cap-hero2-inner"><img class="cap-hero-badge" src="photos/shell-badge.jpg" alt="Hamilton Beach scallop shell emblem" width="240" height="240" decoding="async"><p class="cap-eyebrow">Hamilton Beach Association · Wareham</p><h1 id="capabilities-title">${greeting()}</h1><p class="cap-facts">${facts()}</p>
      <label class="cap-search"><span>Search ${total} tools</span><input id="cap-search" type="search" placeholder="Try tides, governor, deeds or dues" value="${esc(query)}" autocomplete="off"></label></div><span class="cap-hero2-credit">${esc(heroArt.label)}</span></header>
      <div class="cap-columns"><div class="cap-content">
        ${query?'':`${liveTiles()}
        <nav class="cap-quick" aria-label="Quick actions">${quick.filter(q=>!hiddenTools.has(q.id)||isAdmin()).map(q=>`<button type="button" class="cap-quick-btn" data-cap-run="${q.id}">${icon(q.id)}<strong>${esc(q.label)}</strong><span>${esc(q.sub)}</span></button>`).join('')}</nav>
        ${givingPanel()}
        ${member?`<section class="cap-inbox" id="cap-inbox" aria-labelledby="cap-inbox-title"></section>`:''}
        ${board?'<section class="cap-requests" id="cap-requests" aria-labelledby="cap-requests-title"></section>':''}
        <section class="cap-bulletin" id="cap-bulletin" aria-labelledby="waterfront-title"></section>
        ${upcomingPanel('cap-side-inline')}
        ${photoAlbum()}`}
        ${query?`<p class="cap-count" role="status">${shown} of ${total} tools match “${esc(query)}”.</p>`:''}
        ${groups.map(g=>{const tools=g.tools.filter(matches);if(!tools.length)return '';return `<section class="cap-group" aria-labelledby="cap-group-${g.id}">${query?`<h2 id="cap-group-${g.id}">${esc(g.title)}</h2>`:`<div class="cap-group-head">${picture(g.art)}<div><h2 id="cap-group-${g.id}">${esc(g.title)}</h2>${g.blurb?`<p class="cap-blurb">${esc(g.blurb)}</p>`:''}</div></div>`}<div class="cap-grid">${tools.map(card).join('')}</div></section>`;}).join('')}
        ${shown?'':'<p class="cap-empty">No tools match. Try a different word, or clear the search to see every section.</p>'}
        <p class="cap-footnote">Every picture here is a Boston Public Library postcard reproduction, a photograph shared by a resident, or an illustration painted from one of those photographs and labeled as such. Real photographs of events belong in Event photos. Nothing here replaces official town, state or NOAA notices.</p>
      </div>${query?'':upcomingPanel('cap-side')}</div></div></div>`;
    const search=dash.querySelector('#cap-search');search.oninput=()=>{query=search.value.trim();render();};
    const bulletinHost=dash.querySelector('#cap-bulletin');if(bulletinHost)window.HBABulletin?.mount(bulletinHost);
    renderRequests();
    const inboxHost=dash.querySelector('#cap-inbox');if(inboxHost)window.HBAInbox?.mount(inboxHost);
    dash.querySelectorAll('[data-cap-run]').forEach(b=>b.onclick=()=>run(b.dataset.capRun));
    dash.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>openPhoto(Number(b.dataset.photo)));
    dash.querySelectorAll('[data-lb-year]').forEach(b=>b.onclick=()=>{lbYear=b.dataset.lbYear;live.leaderboard=null;render();loadLeaderboard();});
    dash.querySelectorAll('[data-cap-day]').forEach(b=>b.onclick=()=>window.HBACommunity?.showDay?.(b.dataset.capDay));
    dash.querySelectorAll('[data-up-year]').forEach(b=>b.onclick=()=>{if(b.dataset.upYear){upYear=b.dataset.upYear;render();}});
    dash.querySelectorAll('[data-cap-set-location]').forEach(b=>b.onclick=()=>window.HBACommunity?.setMeetingLocation?.(b.dataset.capSetLocation,b.dataset.capMeetingId||''));
    const main=dash.querySelector('.cap-main');main.scrollTop=scroll;
    // Remember where the reader was so returning from any tool or the map lands on the same spot.
    main.addEventListener('scroll',()=>{if(!main.isConnected||mapMode)return;if(userScrolling()||performance.now()>restoreUntil)savedScroll=main.scrollTop;else if(Math.abs(main.scrollTop-savedScroll)>1)main.scrollTop=savedScroll;},{passive:true});
    if(focusId==='cap-search'){search.focus({preventScroll:true});const n=search.value.length;search.setSelectionRange(n,n);}
  }
  function run(id,arg){
    if(id==='signin'){window.openHBACommunity('overview');return;}
    if(id==='calendar'&&arg&&/^\d{4}-\d{2}-\d{2}$/.test(arg)){window.HBACommunity?.showDay?.(arg);return;}
    if(id==='calendar'){window.openHBACommunity('calendar');return;}// "Open calendar" has no entry in the tool list
    if(id==='bulletin'){window.openHBABulletin?.();return;}// nor do the weather, tide and alert tiles
    const t=allTools().find(x=>x.id===id);if(!t||!visible(t)||!t.run)return;
    try{t.run(arg);}catch(e){console.error(e);}
  }
  let lastLoad=0,pendingReload=false,lbYear='this';
  // Neighborhood photographs shared by residents (real photos, labelled as such; paintings stay labelled as illustrations).
  let photos=[];
  fetch('photos/manifest.json').then(r=>r.ok?r.json():[]).then(list=>{photos=Array.isArray(list)?list:[];render();}).catch(()=>{});
  function photoAlbum(){
    if(!photos.length)return '';
    return `<section class="cap-album" aria-labelledby="cap-album-title"><div class="cap-side-head"><h2 id="cap-album-title">From the neighborhood</h2><p class="cap-side-note">Photographs shared by residents. Tap one to see it full size.</p></div><ul class="cap-album-strip">${photos.map((p,i)=>`<li><button type="button" data-photo="${i}" aria-label="Open photograph: ${esc(p.caption)}"><img src="${p.src}" alt="${esc(p.caption)}" loading="lazy" decoding="async" style="background-image:url('${p.tiny}')"><span>${esc(p.caption)}</span></button></li>`).join('')}</ul></section>`;
  }
  const lightbox=document.createElement('dialog');lightbox.className='cap-lightbox';lightbox.setAttribute('aria-label','Photograph');document.body.appendChild(lightbox);
  lightbox.addEventListener('click',e=>{if(e.target===lightbox||e.target.closest('[data-lightbox-close]'))lightbox.close();});
  function openPhoto(i){const p=photos[i];if(!p)return;lightbox.innerHTML=`<figure><img src="${p.src}" alt="${esc(p.caption)}"><figcaption><strong>Photograph</strong> · ${esc(p.caption)}<br><small>${esc(p.credit||'')}</small></figcaption></figure><button type="button" data-lightbox-close aria-label="Close photograph">Close</button>`;lightbox.showModal();}
  const lbYearValue=()=>lbYear==='all'?null:new Date().getFullYear()-(lbYear==='last'?1:0);
  async function loadLeaderboard(rerender=true){
    const api=window.HBACommunity.api,y=lbYearValue();
    try{live.leaderboard=await api('/api/donations/leaderboard'+(y?'?year='+y:''),{signal:AbortSignal.timeout(25000)});live.leaderboardError='';}
    catch(e){live.leaderboard=null;live.leaderboardError=e.message;}
    if(rerender)render();
  }
  const fundNames={beach_nourishment:'Beach nourishment',jetties:'Jetties',road_replacement:'Road replacement',events:'Community events',general:'General HBA support',dues:'Dues'};
  const streetCase=t=>String(t||'').toLowerCase().replace(/(^|\s)\S/g,c=>c.toUpperCase());
  const money=n=>'$'+Number(n||0).toLocaleString('en-US',{maximumFractionDigits:0});
  function leaderboard(){
    if(!member||!['resident','board','admin'].includes(member.role))return '';
    const lb=live.leaderboard,label=lbYear==='all'?'all years':lbYear==='last'?String(new Date().getFullYear()-1):String(new Date().getFullYear());
    const tabs=`<div class="cap-lb-tabs" role="tablist" aria-label="Donor board period">${[['this','This year'],['last','Last year'],['all','All time']].map(([k,l])=>`<button type="button" role="tab" aria-selected="${lbYear===k}" data-lb-year="${k}">${l}</button>`).join('')}</div>`;
    let body;
    if(!lb)body=`<p class="cap-side-note">${esc(live.leaderboardError||'Loading verified donations…')}</p>`;
    else if(!Number(lb.totals?.gifts))body=`<p class="cap-side-note">No verified donations recorded for ${label} yet. Gifts appear here after a resident reports a payment in Pay dues or donate and the treasurer verifies it. Dues are not counted.</p>`;
    else{
      const maxF=Math.max(...lb.funds.map(f=>Number(f.total))),streets=lb.streets.filter(s=>Number(s.total)>0).slice(0,6),maxS=Math.max(1,...streets.map(s=>Number(s.total)));
      body=`<div class="cap-lb-grid">
        <div class="cap-lb-col"><h3>Totals · ${esc(label)}</h3><p class="cap-lb-big">${money(lb.totals.amount)}</p><p class="cap-side-note">${lb.totals.gifts} verified gift${lb.totals.gifts===1?'':'s'} from ${lb.totals.households} household${lb.totals.households===1?'':'s'}.</p>
          <h3>By fund</h3><ol class="cap-lb-bars">${lb.funds.map(f=>`<li><span>${esc(fundNames[f.fund]||f.fund)}</span><i style="width:${Math.max(4,Math.round(100*Number(f.total)/maxF))}%"></i><strong>${money(f.total)}</strong></li>`).join('')}</ol></div>
        <div class="cap-lb-col"><h3>By street</h3>${streets.length?`<ol class="cap-lb-bars">${streets.map((s,i)=>`<li><span>${i+1}. ${esc(streetCase(s.street))} <small>${s.donors} of ${s.households} households</small></span><i style="width:${Math.max(4,Math.round(100*Number(s.total)/maxS))}%"></i><strong>${money(s.total)}</strong></li>`).join('')}</ol>`:'<p class="cap-side-note">No street totals yet.</p>'}</div>
        <div class="cap-lb-col"><h3>Honor roll</h3>${lb.honor_roll.length?`<ol class="cap-lb-roll">${lb.honor_roll.map(h=>`<li><strong>${esc(h.name)}</strong><span>${esc(streetCase(h.street))}</span></li>`).join('')}</ol>`:''}<p class="cap-side-note">${lb.anonymous_households?`${lb.anonymous_households} household${lb.anonymous_households===1?'':'s'} gave anonymously. `:''}Names appear only when the household ticks “list my household” on its payment report; individual amounts are never shown.</p></div>
      </div>`;
    }
    return `<div class="cap-lb" aria-labelledby="cap-lb-title"><div class="cap-side-head"><h3 id="cap-lb-title" class="cap-lb-h">Donor board</h3><div class="cap-lb-actions">${tabs}<button type="button" data-cap-run="payments">Give or report a gift</button></div></div>${body}</div>`;
  }
  async function loadLive(){
    if(loading){pendingReload=true;return;}loading=true;lastLoad=Date.now();loadedOnce=true;render();
    const api=window.HBACommunity.api;
    const jobs=[
      window.HBALocalWeather.load().then(w=>{live.weather=w;live.weatherError='';}).catch(e=>{live.weatherError=e.message;}),
      api('/api/tides',{signal:AbortSignal.timeout(20000)}).then(t=>{live.tides=t;live.tideError='';}).catch(e=>{live.tideError=e.message;}),
      (member?api('/api/tool-settings',{signal:AbortSignal.timeout(20000)}).then(t=>{hiddenTools.clear();(t.hidden||[]).forEach(id=>hiddenTools.add(id));}).catch(()=>{}):Promise.resolve()),
      api('/api/weather-alerts',{signal:AbortSignal.timeout(20000)}).then(a=>{live.alerts=a;live.alertError='';}).catch(e=>{live.alertError=e.message;})
    ];
    if(member&&['resident','board','admin'].includes(member.role))jobs.push(api('/api/votes',{signal:AbortSignal.timeout(25000)}).then(v=>{live.votes=(v.votes||[]).filter(x=>['noticed','open'].includes(x.state)).length;}).catch(()=>{}));
    if(member&&['resident','board','admin'].includes(member.role))jobs.push(api('/api/upcoming',{signal:AbortSignal.timeout(25000)}).then(u=>{live.upcoming=u;live.upcomingError='';window.HBAEventDates?.setSupperDefaults?.(u.supper_defaults);}).catch(e=>{live.upcomingError=e.message;}));
    if(member&&['resident','board','admin'].includes(member.role))jobs.push(loadLeaderboard(false));
    if(board)jobs.push(api('/api/dues/'+new Date().getFullYear(),{signal:AbortSignal.timeout(20000)}).then(d=>{const n=(d.rows||[]).filter(r=>r.status==='paid').length;live.duesLive={[d.year]:n};}).catch(()=>{}));
    if(board)jobs.push(api('/api/board-notifications',{signal:AbortSignal.timeout(20000)}).then(n=>{live.pending=n.pending_payments;live.messages=n.new_governor_messages||0;live.requests=n.requests||null;live.requestTotal=n.total||0;titleBadge();}).catch(()=>{}));
    if(member?.role==='admin')jobs.push(loadPush());
    await Promise.allSettled(jobs);
    loading=false;
    if(pendingReload){pendingReload=false;return loadLive();}
    render();
  }
  // ---- Requests waiting (board) and alerts on this device (administrator) -----------------------
  const REQUEST_KINDS=[
    {key:'accounts',label:'Account requests',one:'Account request',tool:'members',hint:'New neighbours waiting for approval'},
    {key:'payments',label:'Payment reports',one:'Payment report',tool:'payments',hint:'Dues or donations to verify'},
    {key:'messages',label:'Messages to governors',one:'Message to a governor',tool:'team',hint:'Unanswered messages'},
    {key:'issues',label:'Problem reports',one:'Problem report',tool:'issues',hint:'Waiting for the next meeting'},
    {key:'stories',label:'Household stories',one:'Household story',tool:'households',hint:'Memories to publish'},
    {key:'photos',label:'Photographs',one:'Photograph',tool:'events',hint:'Photos to publish'},
    {key:'storms',label:'Storm memories',one:'Storm memory',tool:'storms',hint:'Storm stories to publish'},
    {key:'hosting',label:'Hosting offers',one:'Hosting offer',tool:'hosting',hint:'Movie Night dates to approve'}];
  const gatePush=()=>{try{return window.parent&&window.parent!==window?window.parent.HBAGatePush:null;}catch{return null;}};
  function titleBadge(){try{const t=live.requestTotal||0;const doc=window.parent&&window.parent!==window?window.parent.document:document;const base=doc.title.replace(/^\(\d+\)\s*/,'');doc.title=(t?`(${t}) `:'')+base;}catch{}}
  async function loadPush(){
    try{live.push=await api('/api/push',{signal:AbortSignal.timeout(20000)});}catch(e){live.push={error:e.message};}
    const g=gatePush();live.pushDevice=g?await g.status():{permission:'unsupported',subscribed:false};
  }
  function renderRequests(){
    const host=dash.querySelector('#cap-requests');if(!host||!board)return;
    const r=live.requests,total=live.requestTotal||0;
    const list=r?REQUEST_KINDS.filter(k=>r[k.key]>0):[];
    const body=!r?'<p class="cap-req-empty">Checking for requests…</p>':!list.length?'<p class="cap-req-empty">Nothing is waiting right now. New account requests, payment reports, messages, problem reports, stories, photographs and storm memories appear here as soon as a resident sends them.</p>':
      `<div class="cap-req-grid">${list.map(k=>`<button type="button" class="cap-req" data-cap-run="${k.tool}"><strong>${r[k.key]}</strong><span>${esc(r[k.key]===1?k.one:k.label)}</span><small>${esc(k.hint)}</small></button>`).join('')}</div>`;
    let alerts='';
    if(member?.role==='admin'){
      const p=live.push,d=live.pushDevice,g=gatePush();
      const supported=!!g&&g.supported(),homeScreen=!!g&&g.needsHomeScreen();
      let state;
      if(!g)state='Alerts are set up from the signed-in page, not this preview.';
      else if(homeScreen)state='On an iPhone or iPad, alerts work after you add this page to your Home Screen: tap Share, then “Add to Home Screen”, and open it from there.';
      else if(!supported)state='This browser cannot receive alerts. Chrome, Edge, Firefox and Safari can.';
      else if(p&&p.ready===false)state=p.note;
      else if(d?.permission==='denied')state='Alerts are blocked for this site in the browser settings. Allow notifications for this site, then try again.';
      else if(d?.subscribed)state='Alerts are on for this device. You will hear about each new request even when this page is closed.';
      else state='Alerts are off for this device. Turn them on to be told about new requests even when this page is closed.';
      const devices=(p?.devices||[]);
      alerts=`<div class="cap-alerts"><div><h3>Alerts on this device</h3><p id="cap-alert-state" role="status">${esc(state)}</p>${p?.error?`<p class="cap-req-empty">${esc(p.error)}</p>`:''}</div>
        <div class="cap-alert-actions">${supported&&!homeScreen&&d?.permission!=='denied'&&p?.ready!==false?(d?.subscribed?'<button type="button" class="cap-alert-btn" data-push="off">Turn alerts off here</button><button type="button" class="cap-alert-btn cap-alert-secondary" data-push="test">Send a test alert</button>':'<button type="button" class="cap-alert-btn" data-push="on">Turn alerts on for this device</button>'):''}</div>
        ${devices.length?`<p class="cap-alert-devices">Devices receiving alerts: ${devices.map(x=>esc(x.label||'Unnamed device')+(d?.endpoint&&x.endpoint===d.endpoint?' (this one)':'')).join(' · ')}</p>`:'<p class="cap-alert-devices">No device is receiving alerts yet.</p>'}</div>`;
    }
    host.innerHTML=`<div class="cap-req-head"><div><p class="cap-eyebrow">For the board</p><h2 id="cap-requests-title">Requests waiting${total?` <span class="cap-req-total">${total}</span>`:''}</h2></div><p class="cap-req-sub">${member?.role==='admin'?'Everything residents have sent that needs a decision. Alerts can reach your phone or computer as soon as a request arrives.':'Everything residents have sent that needs a board decision.'}</p></div>${body}${alerts}`;
    host.querySelectorAll('[data-cap-run]').forEach(b=>b.onclick=()=>run(b.dataset.capRun));
    host.querySelectorAll('[data-push]').forEach(b=>b.onclick=()=>pushAction(b.dataset.push,b));
  }
  async function pushAction(action,btn){
    const g=gatePush(),st=dash.querySelector('#cap-alert-state');if(!g)return;
    btn.disabled=true;
    try{
      if(action==='on'){if(st)st.textContent='Asking the browser for permission…';const label=(navigator.userAgentData?.platform||navigator.platform||'Device')+' · '+(/Edg\//.test(navigator.userAgent)?'Edge':/Firefox\//.test(navigator.userAgent)?'Firefox':/Chrome\//.test(navigator.userAgent)?'Chrome':/Safari\//.test(navigator.userAgent)?'Safari':'Browser');await g.enable(label);}
      else if(action==='off')await g.disable();
      else if(action==='test'){await g.test();if(st)st.textContent='Test alert sent. It should appear on this device within a few seconds.';btn.disabled=false;return;}
      await loadPush();renderRequests();
    }catch(e){if(st){st.textContent=e.message;}btn.disabled=false;}
  }
  let requestTimer=null;
  function pollRequests(){
    clearInterval(requestTimer);
    if(!board)return;
    requestTimer=setInterval(async()=>{
      if(document.hidden||!dash.isConnected||mapMode)return;
      try{const n=await api('/api/board-notifications',{signal:AbortSignal.timeout(20000)});const changed=JSON.stringify(n.requests)!==JSON.stringify(live.requests);live.pending=n.pending_payments;live.messages=n.new_governor_messages||0;live.requests=n.requests||null;live.requestTotal=n.total||0;titleBadge();if(changed)renderRequests();}catch{}
    },60000);
  }
  pollRequests();
  // ---- Shell: dashboard vs. map ----------------------------------------------------------------
  const panel=document.getElementById('panel');
  const fab=document.createElement('button');fab.type='button';fab.id='capabilities-fab';fab.className='capabilities-fab';fab.setAttribute('aria-label','Return to the dashboard');fab.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg><span>Dashboard</span>';fab.hidden=true;document.body.append(fab);
  const back=document.createElement('button');back.type='button';back.id='home-dashboard-back';back.className='home-dashboard-back';back.innerHTML='<strong>Dashboard</strong><span>All tools, weather and your account</span>';
  const mapHint=document.createElement('p');mapHint.id='home-map-hint';mapHint.className='home-map-hint';
  const sub=panel.querySelector('.sub');if(sub){sub.after(back);back.after(mapHint);}else panel.prepend(back);
  const reportsBtn=document.createElement('button');reportsBtn.type='button';reportsBtn.id='home-browse-reports';reportsBtn.className='home-browse-reports';reportsBtn.textContent='Browse all property reports';reportsBtn.onclick=()=>window.openPropertyHistory(178);
  const layersDetails=[...document.querySelectorAll('.home-archive')].find(x=>x.querySelector('summary')?.textContent.includes('Map legend'));
  if(layersDetails)layersDetails.classList.add('home-layers');
  const hints={home:'Search your address or tap your house on the map. Each house opens its photo, deeds and street governor.',layers:'Parcel colours describe rights evidence. Open the legend below for drainage easements and Chapter 91 records.',default:'Tap a house for its report. Use Dashboard to return to every other tool.'};
  let homeBounds=null,shownOnce=false;
  function showMap(opts={}){
    mapMode=true;document.body.classList.add('hba-map-mode');dash.classList.add('hba-dashboard-hidden');fab.hidden=false;
    mapHint.textContent=hints[opts.mode]||hints.default;
    if(panel.classList.contains('collapsed')&&innerWidth>700)document.getElementById('toggle')?.click();
    const searchSlot=document.getElementById('home-search-slot');if(searchSlot&&!reportsBtn.isConnected)searchSlot.after(reportsBtn);
    if(layersDetails){layersDetails.open=opts.mode==='layers';if(opts.mode==='layers')setTimeout(()=>layersDetails.scrollIntoView({block:'start',behavior:'smooth'}),50);}
    try{window.map?.invalidateSize?.({pan:false});}catch{}
    if(opts.mode==='home'||opts.mode==='layers'||!shownOnce){
      // Frame the neighbourhood whenever the map tool opens for a home search or the first time.
      try{if(window.L&&window.PARCELS){homeBounds=homeBounds||L.geoJSON(window.PARCELS).getBounds().pad(0.08);window.map?.fitBounds(homeBounds,{animate:false});}}catch{}
    }
    shownOnce=true;
    if(opts.mode==='home')setTimeout(()=>document.getElementById('search')?.focus({preventScroll:true}),80);
  }
  function showDashboard(){
    mapMode=false;document.body.classList.remove('hba-map-mode');dash.classList.remove('hba-dashboard-hidden');fab.hidden=true;
    render();relabel();
    const keep=savedScroll;holdScroll();requestAnimationFrame(()=>{const m=dash.querySelector('.cap-main');if(m)m.scrollTop=keep;});
    if(!loadedOnce||Date.now()-lastLoad>5*60000)loadLive();
  }
  function scrollToSection(id){
    const main=dash.querySelector('.cap-main'),el=dash.querySelector('#'+CSS.escape(id));if(!main||!el)return;
    const top=Math.max(0,el.getBoundingClientRect().top-main.getBoundingClientRect().top+main.scrollTop-12);
    savedScroll=top;holdScroll();main.scrollTop=top;
    el.querySelector('h2')?.setAttribute('tabindex','-1');el.querySelector('h2')?.focus({preventScroll:true});
  }
  window.HBAShell={showMap,showDashboard,isMap:()=>mapMode,refresh:()=>loadLive(),scrollToSection,runTool:run};
  window.HBACapabilities={
    inventory:()=>({groups,quick,panel:[{id:'payments',where:'Dues & giving panel',label:'Pay dues or donate'},{id:'planner',where:'Dues & giving panel',label:'Try the dues planner'}]}),
    hidden:()=>[...hiddenTools],isAdmin,visible,
    async setHidden(list){await api('/api/settings/public_hidden_tools',{method:'PUT',body:JSON.stringify({value:JSON.stringify(list)})});hiddenTools.clear();list.forEach(id=>hiddenTools.add(id));render();}
  };
  back.onclick=showDashboard;fab.onclick=showDashboard;
  // Map navigation from any tool switches to the map tool automatically.
  function hookMap(){
    const m=window.map;if(!m||m.__hbaHooked)return;m.__hbaHooked=true;
    for(const name of ['setView','fitBounds','flyTo','flyToBounds','panTo']){
      const original=m[name].bind(m);
      m[name]=(...args)=>{if(window.__hbaShellReady&&!mapMode)showMap({mode:'default'});return original(...args);};
    }
  }
  // Buttons that used to say "Back to map" now return to the dashboard unless the map tool is active.
  function relabel(){
    document.querySelectorAll('dialog button').forEach(b=>{
      const t=b.textContent.trim();
      if(/^Back to (research )?map$/i.test(t)){b.dataset.hbaOriginalLabel=t;b.textContent=mapMode?t:'Dashboard';}
      else if(b.dataset.hbaOriginalLabel&&t==='Dashboard'&&mapMode)b.textContent=b.dataset.hbaOriginalLabel;
    });
  }
  let relabelQueued=false;
  new MutationObserver(()=>{if(relabelQueued)return;relabelQueued=true;requestAnimationFrame(()=>{relabelQueued=false;relabel();});}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('hba-account-change',e=>{board=!!e.detail.board;member=e.detail.member;live={};render();if(member)loadLive();pollRequests();titleBadge();});
  window.openHBACapabilities=showDashboard;
  render();hookMap();relabel();
  setTimeout(()=>{window.__hbaShellReady=true;hookMap();},0);
  loadLive();
  setInterval(()=>{if(!mapMode&&document.visibilityState==='visible'&&Date.now()-lastLoad>10*60000)loadLive();},60000);
})();
