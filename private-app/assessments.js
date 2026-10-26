(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let promise;
  const load=()=>promise||(promise=fetch('assessments.json').then(r=>{if(!r.ok)throw Error('Unavailable');return r.json();}).catch(e=>{promise=null;throw e;}));
  const rows=(table)=>`<div class="assessor-table"><table>${table.map((r,n)=>`<tr>${r.map(v=>`<${n?'td':'th'}>${esc(v)}</${n?'td':'th'}>`).join('')}</tr>`).join('')}</table></div>`;
  window.renderHBAAssessment=(container,index)=>{
    const target=document.createElement('section');target.className='assessor-card';target.innerHTML='<h4>Town property card</h4><p>Loading the official assessor record…</p>';container.prepend(target);
    load().then(d=>{
      if(!target.isConnected)return;
      const r=d.records.find(x=>x.index===index);
      if(!r||r.status!=='matched'){
        target.innerHTML=`<h4>Town property card</h4><p>${esc(r?.limitation||'No matched town record is available.')}</p><a href="${esc(r?.source||'https://gis.vgsi.com/warehamma/Default.aspx')}" target="_blank" rel="noopener">Search the official assessor database</a>`;return;
      }
      const b=r.buildings[0];
      target.innerHTML=`<h4>Town property card</h4>${b?.photo?`<figure><a href="${esc(b.photo)}" target="_blank" rel="noopener"><img src="${esc(b.photo)}" alt="Town assessor photograph for ${esc(r.town_address)}" loading="lazy"></a><figcaption>Town assessor photo · photograph date not provided</figcaption></figure>`:'<p class="assessor-no-photo">No downloaded town photograph is available for this record. Vacant land may have no home photo.</p>'}
      <dl><dt>Assessor-listed owner</dt><dd>${esc(r.owner||'Not listed')}</dd>${r.coowner?`<dt>Co-owner / additional name</dt><dd>${esc(r.coowner)}</dd>`:''}<dt>Property</dt><dd>${esc(r.use)} · ${esc(r.acres||'Unknown')} acres</dd>${b?`<dt>Building</dt><dd>${esc(b.year||'Unknown')} assessor year · ${esc(b.living_area||'Unknown')} sq ft living area</dd>`:''}<dt>Town assessed value</dt><dd>${esc(r.total_value||'Not provided')}</dd></dl>
      <p class="assessor-note">Tax records, not a current-title certification. Retrieved ${esc(r.observed)}; valuation year is shown below.</p>
      <details><summary>Assessment, building details & town sale history</summary><p>Map/lot ${esc(r.mblu)} · zoning ${esc(r.zone||'Not stated')}. Town-listed last sale: ${esc(r.sale_date||'Not stated')} · ${esc(r.sale_price||'Not stated')} · book/page ${esc(r.book_page||'Not stated')}.</p>${rows(r.valuations)}${r.buildings.map((x,n)=>`<h5>${esc(x.label)}</h5>${n&&x.photo?`<img src="${esc(x.photo)}" alt="Additional town property photo" loading="lazy">`:''}${rows(x.attributes)}${rows(x.subareas)}`).join('')}<h5>Sales listed by the assessor</h5><p>These are tax-database entries, not additional visually reviewed deeds.</p>${rows(r.sales)}${r.extras.length?`<h5>Additional town attributes</h5>${rows(r.extras)}`:''}<p>${esc(r.limitation)}</p></details>
      <a href="${esc(r.source)}" target="_blank" rel="noopener">Open the official town property card</a>`;
    }).catch(()=>{if(target.isConnected)target.innerHTML='<h4>Town property card</h4><p>The imported assessor data could not load. Deed evidence remains available below.</p>';});
  };
})();
