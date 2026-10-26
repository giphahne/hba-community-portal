(() => {
  'use strict';
  const d=window.HBA_MEMBERSHIP_AREA;
  let showOutside=true,applying=false;
  const classification=index=>d.parcels[String(index)]||{status:'review',reason:'No membership-area classification available.'};
  const visible=index=>showOutside||classification(index).status!=='outside';
  const outline=L.geoJSON(d.outline,{interactive:false,style:{color:'#ee8e46',weight:3,dashArray:'8 6',fill:false}}).addTo(map);
  const controls=document.createElement('section');controls.className='membership-controls';
  controls.innerHTML=`<h2>HBA service area</h2><label><input id="membership-outline" type="checkbox" checked> Show bylaw-area outline</label><label><input id="membership-outside" type="checkbox" checked> Show properties outside bylaw area</label><p id="membership-map-status" role="status"></p><details><summary>How the area is mapped</summary><p>${d.bylaw_text}</p><p>Source: ${d.source}.</p><p>${d.qualification}</p><p>The outline follows the mapped in-scope parcels and fills road gaps for display. Its shape is approximate and is not used to decide ownership or membership.</p></details>`;
  document.querySelector('.home-main').append(controls);
  function label(){
    document.getElementById('membership-map-status').textContent=`${showOutside?'All mapped properties shown.':d.counts.outside+' outside-area records hidden.'} ${d.counts.in_scope} in-scope; ${d.counts.review} need review and remain visible. Membership also requires ownership and current dues.`;
  }
  function apply(){
    if(applying)return;applying=true;
    Object.entries(targets).forEach(([index,t])=>{
      t.layer.__hbaMembershipIndex=Number(index);
      t.layer.eachLayer(child=>{child.__hbaMembershipIndex=Number(index);});
      if(!visible(index)){if(map.hasLayer(t.layer))map.removeLayer(t.layer);}
      else{
        const cls=window.HBA_MAP_SUMMARY.trace[index]?.approved_classification||DEED_AUDIT[index]?.cls;
        const legend=document.querySelector(`[data-layer="${cls}"]`);
        if(legend&&!legend.classList.contains('off')&&!map.hasLayer(t.layer))t.layer.addTo(map);
      }
    });
    label();applying=false;
  }
  window.HBAMembership={classification,visible,get showOutside(){return showOutside;},setShowOutside(value){
    showOutside=!!value;document.getElementById('membership-outside').checked=showOutside;apply();
    document.dispatchEvent(new CustomEvent('hba-membership-change',{detail:{showOutside}}));
    document.getElementById('search')?.dispatchEvent(new Event('input'));
  },explainHidden(){document.getElementById('membership-map-status').textContent='That property is outside the bylaw area and is hidden. Select “Show properties outside bylaw area” to display it.';}};
  document.getElementById('membership-outline').onchange=e=>e.target.checked?outline.addTo(map):map.removeLayer(outline);
  document.getElementById('membership-outside').onchange=e=>window.HBAMembership.setShowOutside(e.target.checked);
  map.on('layeradd',e=>{
    if(applying)return;
    const index=e.layer.__hbaMembershipIndex;
    if(index!==undefined&&!visible(index))map.removeLayer(e.layer);
  });
  apply();
})();
