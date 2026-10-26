(() => {
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let result=null,busy=false,error='',question='',includeArchive=true,epoch=0;
  function render(c){
    const saved=c.data.research_reports||[];
    return `<section><h3>Ask the HBA document archive</h3><p>Search collected deed notes, HBA research and permitted archive documents. Then create a short, source-linked historical report using only the matching excerpts.</p><form id="research-form"><label>Your historical question<textarea id="research-question" maxlength="600" rows="3" required placeholder="For example: What do our records say about the Worrall Avenue drainage easement?">${esc(question)}</textarea></label><label class="communications-check"><input type="checkbox" id="research-private"${includeArchive?' checked':''}> Include permitted archive PDFs and published newsletters</label><div class="community-actions"><button type="submit"${busy?' disabled':''}>Search our documents</button><button type="button" id="research-generate"${busy?' disabled':''}>Create AI research report</button></div></form><p role="status">${busy?'Searching authorized records and preparing your request…':error?esc(error):''}</p><p class="community-notice">Only HBA’s collected documents are used; no web research. AI reports are drafts, not legal or title opinions. Searchable text and transcribed notes are not the same as reading every deed image. Selected excerpts are sent to the AI service only when you request a report. No report is published or emailed automatically.</p>
      ${saved.length?`<label>Your saved reports<select id="research-saved"><option value="">Choose a previous report</option>${saved.map(r=>`<option value="${r.id}">${esc(r.created_at.slice(0,10)+' · '+r.question)}</option>`).join('')}</select></label>`:''}
      ${result?`<section class="community-story">${result.draft?`<span class="community-tag">AI draft · saved privately to your account</span><h3>${esc(result.draft.title)}</h3>${result.draft.paragraphs.map(p=>`<p>${esc(p.text)} ${p.source_ids.map(id=>`<button type="button" class="research-citation" data-research-source="${id}">${esc(id)}</button>`).join(' ')}</p>`).join('')}<h4>What remains uncertain</h4><ul>${(result.draft.gaps||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><button type="button" id="research-export">Download draft report</button>`:`<h3>${result.sources.length?'Matching document excerpts':'No matching text found'}</h3><p>${result.sources.length?'Review the excerpts below before creating a report.':'Try a street, book/page, person or specific topic. No match does not prove a right or historical event is absent.'}</p>`}
      <h4>Evidence excerpts</h4>${result.sources.map(s=>`<details id="research-source-${s.id}" class="research-source"><summary>${esc(s.id+' · '+s.title+(s.page?' · page '+s.page:''))}</summary><p class="community-prewrap">${esc(s.text)}</p><div class="community-actions">${s.kind==='deed'?`<button type="button" data-research-property="${s.property_index}" data-ref="${esc(s.ref)}">Open deed evidence</button>`:s.record_id?`<button type="button" data-file-kind="${s.kind}" data-file-id="${s.record_id}">Read source PDF</button>`:s.path?`<a href="${esc(s.path)}" target="_blank" rel="noopener">Read collected report</a>`:''}</div></details>`).join('')}<details><summary>Search coverage & limits</summary><p>${result.total_text_chunks} searchable chunks considered; the ten highest keyword matches are supplied at most.</p><ul>${result.limitations.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>Document instructions are treated as evidence, not commands. Archived schedules do not prove an event occurred. A use right does not establish roadbed ownership.</p></details></section>`:''}</section>`;
  }
  function bind(c,root){
    const form=root.querySelector('#research-form');if(!form)return;
    async function submit(generate){
      if(busy||!form.reportValidity())return;
      question=root.querySelector('#research-question').value.trim();includeArchive=root.querySelector('#research-private').checked;
      const serial=++epoch;busy=true;error='';c.render();
      try{
        const value=await c.api('/api/research',{method:'POST',body:JSON.stringify({question,include_archive:includeArchive,generate})});
        if(serial!==epoch)return;result=value;
        if(value.saved_id)c.data.research_reports.unshift({id:value.saved_id,created_at:value.created_at,question,report:value});
      }catch(e){if(serial===epoch)error=e.message;}
      finally{if(serial===epoch){busy=false;c.render();}}
    }
    form.onsubmit=e=>{e.preventDefault();submit(false);};
    root.querySelector('#research-generate').onclick=()=>submit(true);
    const saved=root.querySelector('#research-saved');if(saved)saved.onchange=()=>{const r=c.data.research_reports.find(r=>r.id===saved.value);if(r){result=r.report;question=r.question;c.render();}};
    root.querySelectorAll('[data-research-source]').forEach(b=>b.onclick=()=>{const target=root.querySelector('#research-source-'+b.dataset.researchSource);if(target){target.open=true;target.scrollIntoView({block:'nearest',behavior:'smooth'});}});
    root.querySelectorAll('[data-research-property]').forEach(b=>b.onclick=()=>window.openPropertyHistory(Number(b.dataset.researchProperty),{ref:b.dataset.ref}));
    const exp=root.querySelector('#research-export');if(exp)exp.onclick=()=>{
      const d=result.draft;
      const text='# '+d.title+'\n\nAI research draft; not a title or legal opinion.\n\n'+d.paragraphs.map(p=>p.text+' '+p.source_ids.map(s=>'['+s+']').join(' ')).join('\n\n')+'\n\n## Evidence excerpts\n\n'+result.sources.map(s=>'### '+s.id+': '+s.title+(s.page?' (page '+s.page+')':'')+'\n\n'+s.text).join('\n\n')+'\n\n## Gaps\n\n'+d.gaps.map(x=>'- '+x).join('\n');
      const u=URL.createObjectURL(new Blob([text],{type:'text/markdown'})),a=document.createElement('a');a.href=u;a.download='HBA-document-research-draft.md';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
    };
  }
  document.addEventListener('hba-account-change',e=>{++epoch;busy=false;result=null;question='';error='';});
  window.HBAResearch={render,bind};
})();
