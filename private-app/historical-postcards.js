(() => {
  'use strict';
  const cards=[
    {title:'Beach and cottages, Hamilton Beach, Mass.',image:'postcards/beach-and-cottages-73258.jpg',date:'Circa 1930–1945',kind:'Shoreline postcard, not an aerial',
      url:'https://commons.wikimedia.org/wiki/File:Beach_and_cottages,_Hamilton_Beach,_Mass_(73258).jpg',credit:'Boston Public Library, Tichnor Brothers Collection, no. 73258. Wikimedia Commons identifies the reproduction as public domain in the United States.'},
    {title:'Aerial view of Wareham Beaches, Cape Cod, Mass.',image:'postcards/wareham-beaches-aerial-81056.jpg',date:'Circa 1930–1945',kind:'Aerial postcard; catalog date is not an exact flight date',
      url:'https://commons.wikimedia.org/wiki/File:Aerial_view_of_Wareham_Beaches,_Cape_Cod,_Mass_(81056).jpg',credit:'Boston Public Library, Tichnor Brothers Collection, no. 81056. Wikimedia Commons identifies the reproduction as public domain in the United States.'},
    {title:"Hamilton Beach and Swift’s Neck Beach, Mass.",date:'Circa 1930–1945',kind:'Archival postcard record; image retrieval pending',
      url:'https://www.digitalcommonwealth.org/search/commonwealth:5q47s700d',credit:'Boston Public Library, Tichnor Brothers Collection, no. 77258. Catalog: no known copyright restrictions.'},
    {title:"Swift’s Neck Beach and Hamilton Beach, Wareham, Mass.",date:'Circa 1930–1945',kind:'Archival postcard record; image retrieval pending',
      url:'https://www.digitalcommonwealth.org/search/commonwealth:5q47s772n',credit:'Boston Public Library, Tichnor Brothers Collection, no. 81387. Catalog: no known copyright restrictions.'}
  ];
  const entry=document.createElement('section');entry.className='history-entry';
  entry.innerHTML='<h2>Historical postcards</h2><p>Postcards recovered from the earlier island-history research, with the original catalog dates and credits.</p><button type="button" id="postcards-open" class="history-primary">View historical postcards</button>';
  document.querySelector('.island-history-entry').after(entry);
  const dialog=document.createElement('dialog');dialog.id='postcards-dialog';dialog.setAttribute('aria-labelledby','postcards-title');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  dialog.innerHTML=`<header><h2 id="postcards-title">Historical postcards</h2><button type="button" id="postcards-close">Back to map</button></header><p>These are historical reproductions, not AI-generated scenes. Approximate catalog dates do not identify a particular flight, property boundary or house; the exact house at a modern address has not been established.</p>${cards.map(c=>`<article><h3>${esc(c.title)}</h3><p>${esc(c.date)} · ${esc(c.kind)}</p>${c.image?`<a href="${c.image}" target="_blank" rel="noopener"><img src="${c.image}" loading="lazy" alt="${esc(c.title)}"></a>`:'<p>The catalog is verified, but the image server blocked retrieval. No substitute or generated image is shown.</p>'}<p>${esc(c.credit)} <a href="${c.url}" target="_blank" rel="noopener">View archival record</a></p></article>`).join('')}<p>A separate undated Harrison “Wareham Beaches” postcard was mentioned in the earlier chat, but its exact image record is still unresolved. It has not been assigned a guessed date or substituted here.</p>`;
  document.body.append(dialog);
  const historyButton=document.createElement('button');historyButton.type='button';historyButton.textContent='Historical postcards';
  historyButton.onclick=()=>dialog.showModal();
  document.getElementById('island-history-close').before(historyButton);
  document.getElementById('postcards-open').onclick=()=>dialog.showModal();
  document.getElementById('postcards-close').onclick=()=>dialog.close();
})();
