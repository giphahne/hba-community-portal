/* Tools load the first time they are opened instead of with the page.

   Each bundle below lists a tool's scripts (in their original order) and the bundles it needs first. Until a bundle
   loads, its window.open… functions are stand-ins that load it and then open the tool, so every dashboard card, menu
   button and link keeps working unchanged. A bundle's stylesheets go back exactly where their <link> tags used to be
   (a <template data-lazy-css> placeholder in index.html), so the cascade is unchanged.

   Three things keep late-loaded tools behaving as if they had loaded with the page:
   - A tool's own window.open… assignment is kept aside, so anything that wrapped the stand-in (house-privacy.js
     guards openPropertyHistory) stays in front of it.
   - The last hba-account-change and hba-membership-change events are replayed to listeners a tool adds while loading.
   - The map-panel tools (they add map layers and panel entries) load as soon as the map is shown. */
(() => {
  'use strict';
  const BUNDLES={
    // Full earlier-deed and road-wording evidence for the parcel popups; map-summary.js covers start-up.
    'parcel-details':{js:['title-trace.js','road-wording.js']},
    property:{css:['property-history.css','research-tools.css'],js:['deed-labels.js','assessments.js','property-history.js','research-tools.js'],
      opens:['openPropertyHistory','openResearchTools']},
    sand:{css:['sand-school.css'],js:['sand-school.js'],opens:['openSandSchool']},
    nourish:{css:['nourishment.css','ch91-landmarks.css','nourishment-guide.css'],js:['nourishment-data.js','nourishment.js','ch91-landmarks.js','nourishment-guide.js'],
      opens:['openNourishmentRecords','openNourishmentGuide']},
    town:{needs:['nourish'],css:['town-history.css'],js:['town-history-data.js','town-history.js'],opens:['openHBATownHistory']},
    island:{needs:['property','town','nourish'],css:['island-history.css','historical-postcards.css'],js:['island-history.js','historical-postcards.js'],opens:['openIslandHistory']},
    storms:{css:['storms-history.css'],js:['storms-data.js','storms-history.js'],opens:['openHBAStorms']},
    // Everything that draws on the map or sits in the map panel. board-budget.js also wraps every parcel popup in
    // its home summary (address, owner, property-history and household-memory buttons).
    maptools:{needs:['property','sand','nourish','town','island','storms','budget']},
    budget:{needs:['property'],css:['board-budget.css','dues-registry.css','project-timeline.css','budget-outputs.css'],
      js:['board-budget.js','project-timeline.js','budget-outputs.js'],opens:['openBoardBudget','openDuesRegistry','toggleDuesDots']},
    engage:{css:['engagement.css'],js:['engagement.js'],opens:['openHBAPoll','openHBAHosting']},
    summer:{needs:['engage'],css:['summer-events.css'],js:['summer-events.js'],opens:['openHBASummer']},
    // The member archive's sections; community.js loads them when its dialog first shows a section.
    'community-tools':{needs:['engage'],css:['minutes.css','voting.css','document-intake.css','volunteers.css'],
      js:['governance-guide.js','communications.js','minutes.js','voting.js','volunteers.js','dues-receipts.js','finance-register.js',
        'bank-reconciliation.js','document-research.js','document-intake.js','contractor-bids.js'],opens:['openHBAVolunteers']},
    newsletter:{css:['newsletter-viewer.css'],js:['newsletter-viewer.js'],opens:['openHBANewsletter']},
    appmap:{css:['app-map.css'],js:['app-map.js'],opens:['openHBAAppMap']}
  };
  const pending={},done=new Set(),files={},real={};
  const REPLAYED=['hba-account-change','hba-membership-change'],last={};
  const captured={};  // script → [type, listener] added while it ran
  const lazyScript=()=>document.currentScript?.dataset.hbaLazy||'';

  // Remember the latest account and membership state for tools that load later.
  REPLAYED.forEach(type=>document.addEventListener(type,e=>{last[type]=e.detail;},true));
  const add=document.addEventListener;
  document.addEventListener=function(type,listener,options){
    add.call(this,type,listener,options);
    const src=lazyScript();
    if(src&&listener&&REPLAYED.includes(type))(captured[src]=captured[src]||[]).push([type,listener]);
  };
  function replay(listeners){
    for(const [type,listener] of listeners){
      if(!(type in last))continue;
      const e=new CustomEvent(type,{detail:last[type]});
      try{typeof listener==='function'?listener.call(document,e):listener.handleEvent(e);}catch(err){console.error(err);}
    }
  }

  function file(src){
    if(files[src])return files[src];
    return files[src]=new Promise((resolve,reject)=>{
      const css=src.endsWith('.css');
      const el=document.createElement(css?'link':'script');
      el.onload=resolve;
      el.onerror=()=>{el.remove();delete files[src];reject(new Error('Could not load '+src));};
      if(css){
        el.rel='stylesheet';el.href=src;
        const slot=document.querySelector(`template[data-lazy-css="${CSS.escape(src)}"]`);
        if(slot)slot.replaceWith(el);else document.head.append(el);
      }else{
        // async=false: download together, run in the listed order.
        el.src=src;el.async=false;el.dataset.hbaLazy=src;document.body.append(el);
      }
    });
  }
  function need(name){
    const b=BUNDLES[name];if(!b)return Promise.reject(new Error('Unknown tool bundle '+name));
    if(pending[name])return pending[name];
    return pending[name]=Promise.all((b.needs||[]).map(need)).then(()=>{
      return Promise.all([...(b.css||[]),...(b.js||[])].map(file)).then(()=>{
        tidyPanel();
        for(const src of b.js||[]){replay(captured[src]||[]);delete captured[src];}
        // A script that failed while running still fires onload; its open functions are then missing.
        const missing=(b.opens||[]).filter(fn=>typeof real[fn]!=='function');
        if(missing.length)throw new Error(name+' did not finish loading ('+missing.join(', ')+')');
        done.add(name);
      });
    }).catch(err=>{delete pending[name];throw err;});
  }
  // Map-panel tools insert their entries next to each other; home.js keeps those entries in a hidden container.
  function tidyPanel(){
    const legacy=document.querySelector('#panel .home-legacy');if(!legacy)return;
    document.querySelectorAll('.history-entry').forEach(e=>{if(!legacy.contains(e))legacy.append(e);});
  }

  // Stand-ins for each tool's open function.
  for(const [name,b] of Object.entries(BUNDLES)){
    for(const fn of b.opens||[]){
      let current=function(...args){
        return need(name).then(()=>{
          const target=real[fn];
          if(typeof target!=='function')throw new Error(fn+' did not load');
          return target.apply(this,args);
        },err=>{
          console.error(err);
          alert('This part of the app could not load. Please check your connection and try again.');
        });
      };
      Object.defineProperty(window,fn,{configurable:true,enumerable:true,
        get(){return current;},
        // The tool's own definition is kept aside; anything else (a wrapper) replaces what callers see.
        set(value){if(lazyScript())real[fn]=value;else current=value;}});
    }
  }

  // The property-history button in parcel popups (handled by property-history.js once it has loaded).
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-open-history]');
    if(!b||done.has('property'))return;
    need('property').then(()=>real.openPropertyHistory(+b.dataset.openHistory)).catch(err=>console.error(err));
  });

  // The map tool: load everything that draws on the map or sits in its panel when it is first shown.
  function watchMap(){
    const check=()=>{if(document.body.classList.contains('hba-map-mode')){observer.disconnect();need('maptools').catch(err=>console.error(err));}};
    const observer=new MutationObserver(check);
    observer.observe(document.body,{attributes:true,attributeFilter:['class']});check();
  }
  if(document.body)watchMap();else document.addEventListener('DOMContentLoaded',watchMap);

  window.HBALazy={need,ready:name=>done.has(name),bundles:BUNDLES};
})();
