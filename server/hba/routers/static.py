"""The member app (/app/, behind sign-in) and the public sign-in page (/)."""

import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from hba.config import APP_ROOT, SITE_ROOT
from hba.sessions import asset_member
from hba.web import file_reply

app_router = APIRouter()  # /app/: registered first, like the original
router = APIRouter()      # public site catch-all: registered last

@app_router.get("/app/")
@app_router.get("/app/{file_path:path}")
def protected_app(req:Request,file_path:str="index.html"):
    try:
        asset_member(req)
    except HTTPException as e:
        # A page opened while signed out (or before approval) goes to the sign-in page; files keep their status.
        if (not file_path or file_path.endswith(".html")) and e.status_code in {401,403}:
            return RedirectResponse("/",status_code=303)
        raise
    path=(APP_ROOT/(file_path or "index.html")).resolve()
    allowed={".html",".js",".css",".json",".csv",".tsv",".md",".pdf",".jpg",".jpeg",".png",".webp",".svg",".ico"}
    if not path.is_relative_to(APP_ROOT.resolve()) or path.suffix.lower() not in allowed or not path.is_file():
        raise HTTPException(404,"App file not found.")
    if path.suffix.lower()==".html":
        text=path.read_text(encoding="utf-8")
        rel=path.relative_to(APP_ROOT)
        guard_src="../"*(len(rel.parts)-1)+"auth-guard.js"
        root_relative="../"*len(rel.parts)
        boot="<script>window.__HBA_API_ROOT__=new URL("+json.dumps(root_relative)+",document.baseURI).href;</script><script src="+json.dumps(guard_src)+"></script>"
        text=text.replace("<head>","<head>"+boot,1)
        return HTMLResponse(text,headers={"Cache-Control":"private, no-store"})
    return file_reply(req,path)

# ---- Public sign-in page (site/). Registered last so it never shadows /api/ or /app/ routes.
SITE_TYPES={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",
            ".jpg":"image/jpeg",".png":"image/png",".svg":"image/svg+xml",".ico":"image/x-icon",
            ".webmanifest":"application/manifest+json"}

@router.get("/")
@router.get("/{file_path:path}")
def public_site(req:Request,file_path:str="index.html"):
    path=(SITE_ROOT/(file_path or "index.html")).resolve()
    if file_path.startswith(("api/","app/")) or not path.is_relative_to(SITE_ROOT.resolve()) or path.suffix.lower() not in SITE_TYPES or not path.is_file():
        raise HTTPException(404,"Not found.")
    headers={"X-Content-Type-Options":"nosniff"}
    if path.name=="sw.js":
        headers["Service-Worker-Allowed"]="/"
    return file_reply(req,path,SITE_TYPES[path.suffix.lower()],headers)
