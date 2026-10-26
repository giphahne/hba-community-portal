"""The FastAPI application object and the middleware every request passes through."""

import os
from pathlib import Path

from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.middleware.gzip import GZipMiddleware

from hba.sessions import asset_member, load_cookie, write_cookie
from hba.supabase import resident_view

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

# ---- Transfer size. Text (scripts, styles, JSON data, pages, API answers) is gzip-compressed; photos, PDFs and
# scans are already compressed and pass through untouched. Files are revalidated (ETag → 304) instead of
# re-downloaded on every visit; every request is still checked against the session first.
COMPRESSIBLE={".html",".js",".css",".json",".csv",".tsv",".md",".svg",".webmanifest",".txt"}
class TextGZip:
    def __init__(self, app):
        self.app=app
        self.gzip=GZipMiddleware(app,minimum_size=1000)
    async def __call__(self, scope, receive, send):
        path=scope.get("path","") if scope["type"]=="http" else ""
        binary_api="/files/" in path or path.endswith(("/files","/photo","/file"))
        if path and (path.endswith("/") or Path(path).suffix.lower() in COMPRESSIBLE or (path.startswith("/api/") and not binary_api)):
            return await self.gzip(scope,receive,send)
        return await self.app(scope,receive,send)
app.add_middleware(TextGZip)

def file_reply(req, path, media_type=None, headers=None):
    """FileResponse that answers a matching If-None-Match with 304 Not Modified."""
    r=FileResponse(path,media_type=media_type,stat_result=os.stat(path),
                   headers={"Cache-Control":"private, no-cache","X-Content-Type-Options":"nosniff",**(headers or {})})
    tags={t.strip().removeprefix("W/") for t in req.headers.get("if-none-match","").split(",") if t.strip()}
    if r.headers.get("etag") in tags:
        return Response(status_code=304,headers={k:v for k,v in r.headers.items() if k in {"etag","last-modified","cache-control"}})
    return r
Image.MAX_IMAGE_PIXELS = 24_000_000

@app.middleware("http")
async def private_headers(request, call_next):
    saved=load_cookie(request)
    preview=bool(saved and saved.get("view_mode")=="resident")
    mode_token=resident_view.set(preview)
    path=request.url.path
    if path.startswith("/api/") and path not in {"/api/health","/api/session","/api/logout"} and not path.startswith("/api/auth/") and request.method!="OPTIONS":
        from starlette.concurrency import run_in_threadpool
        try:
            await run_in_threadpool(asset_member,request)
        except HTTPException as e:
            resident_view.reset(mode_token)
            r=JSONResponse({"detail":e.detail},status_code=e.status_code,
                           headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"})
            write_cookie(request,r)
            return r
    try:r = await call_next(request)
    finally:resident_view.reset(mode_token)
    write_cookie(request,r)
    # API answers are never cached; app and site files are revalidated (see file_reply).
    if request.url.path.startswith("/api/") or "cache-control" not in r.headers:
        r.headers["Cache-Control"] = "private, no-store"
    r.headers["X-Content-Type-Options"] = "nosniff"
    # The sign-in page frames the member app, and the app frames its learning tools: same origin only.
    r.headers["X-Frame-Options"] = "SAMEORIGIN"
    r.headers["Content-Security-Policy"] = "frame-ancestors 'self'"
    return r
