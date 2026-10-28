"""Ask our documents: archive search and optional AI drafting."""

import json
import re
import time

import fitz
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from hba.config import APP_ROOT, lock, rates
from hba.sessions import client_ip, require
from hba.supabase import rest, sb

router = APIRouter()

class ResearchQuery(BaseModel):
    question: str = Field(min_length=3,max_length=600)
    generate: bool = False
    include_archive: bool = True

def research_corpus(t,include_archive):
    """Explicit allowlist: never searches sessions, credentials, dues or register."""
    entries=[];limits=[]
    ledger=json.loads((APP_ROOT/"property-history.json").read_text(encoding="utf-8"))
    for p in ledger["properties"]:
        for i in p["instruments"]:
            if i["role"]=="Rejected / unrelated":
                continue
            text="\n".join(str(i.get(k) or "") for k in ["date","transfer","lot_match","quote","notes","provenance"])
            if text.strip():
                entries.append({"title":p["address"]+" · "+i["ref"],"text":text,
                                "kind":"deed","property_index":p["index"],"ref":i["ref"],"scan":i["scans"][0] if i["scans"] else None})
    for path in sorted(APP_ROOT.glob("*.md"))+sorted((APP_ROOT/"ch91").glob("*.md"))+sorted((APP_ROOT/"drains").glob("*.md")):
        text=path.read_text(encoding="utf-8")
        for n in range(0,len(text),2400):
            entries.append({"title":path.stem.replace("-"," ").title(),"text":text[n:n+2600],
                            "kind":"local_report","path":str(path.relative_to(APP_ROOT)),"section":n//2400+1})
    if include_archive:
        documents=rest("hba_documents",t,query="select=id,title,file_path&audience=eq.members&order=created_at.desc&limit=20")
        newsletters=rest("hba_newsletters",t,query="select=id,title,file_path&state=eq.published&order=issue_date.desc&limit=20")
        for kind,rows in [("document",documents),("newsletter",newsletters)]:
            for row in rows:
                if not row["file_path"]:
                    continue
                try:
                    raw=sb("GET","/storage/v1/object/authenticated/hba-archive/"+row["file_path"],t)
                    doc=fitz.open(stream=raw.content,filetype="pdf")
                    for n,page in enumerate(doc):
                        text=page.get_text()
                        if text.strip():
                            for start in range(0,len(text),2400):
                                entries.append({"title":row["title"],"text":text[start:start+2600],"kind":kind,"record_id":row["id"],"page":n+1})
                    if not any(e.get("record_id")==row["id"] for e in entries):
                        limits.append(row["title"]+": image-only or no extractable text; OCR not performed.")
                    doc.close()
                except Exception:
                    limits.append(row["title"]+": could not extract authorized PDF text.")
        limits.append("Archive scope is the latest 20 documents and latest 20 published newsletters, plus collected deed transcriptions and existing research reports. Unpublished newsletter drafts, individual dues, check registers, issue notes and raw private files are excluded.")
    return entries,limits

@router.post("/api/research")
def research(body: ResearchQuery,req: Request):
    t,m=require(req)
    entries,limits=research_corpus(t,body.include_archive)
    stop={"what","when","where","which","were","have","does","about","from","with","that","this","their","there","history","please","report","create","research"}
    words={w.lower() for w in re.findall(r"[A-Za-z0-9]+",body.question) if len(w)>2 and w.lower() not in stop}
    scored=[]
    for e in entries:
        text=(e["title"]+" "+e["text"]).lower()
        score=sum(min(5,text.count(w))*(3 if w in e["title"].lower() else 1) for w in words)
        if score:
            scored.append((score,e))
    scored.sort(key=lambda pair:pair[0],reverse=True)
    sources=[{**e,"id":"S"+str(n+1),"text":e["text"][:2600]} for n,(_,e) in enumerate(scored[:10])]
    result={"question":body.question,"sources":sources,"limitations":limits,"total_text_chunks":len(entries),"draft":None}
    if not body.generate or not sources:
        return result
    now=time.time();key=client_ip(req)+"/ai-research"
    with lock:
        q=rates[key]
        while q and q[0]<now-3600:q.popleft()
        if len(q)>=6:
            raise HTTPException(429,"Limit of six AI report attempts per hour. Document search remains available.")
        q.append(now)
    from research_ai import generate_report
    output=generate_report({"question":body.question,"sources":sources})
    result.update(output)
    saved=rest("hba_research_reports",t,"POST",{"question":body.question,"report":result},representation=True)
    result["saved_id"]=saved[0]["id"]
    result["created_at"]=saved[0]["created_at"]
    return result
