"""Encrypted cookie sessions, sign-in checks, role gates and small request helpers."""

import hashlib
import json
import os
import secrets
import time
from threading import RLock
from uuid import UUID

from fastapi import HTTPException

from hba.config import cipher, lock, rates
from hba.supabase import rest, sb

# ---- Sessions. The whole session (Supabase access + refresh token, CSRF proof, timestamps, view mode) is
# Fernet-encrypted into one HttpOnly cookie. Handlers stage changes on request.state; private_headers writes them.
SESSION_COOKIE="hba_session"
IDLE_LIMIT,ABSOLUTE_LIMIT=43200,604800

def load_cookie(req):
    """The current session dict (including changes staged earlier in this request), or None."""
    staged=getattr(req.state,"hba_session",None)
    if staged is not None:
        return staged or None
    raw=req.cookies.get(SESSION_COOKIE,"")
    if not raw:
        return None
    try:
        return json.loads(cipher.decrypt(raw.encode()))
    except Exception:
        return None

def put_session(req, value):
    req.state.hba_session=value

def drop_session(req):
    req.state.hba_session={}

def write_cookie(req, resp):
    staged=getattr(req.state,"hba_session",None)
    if staged is None:
        return
    secure=req.url.scheme=="https" or req.headers.get("x-forwarded-proto","").split(",")[0].strip()=="https"
    if staged:
        resp.set_cookie(SESSION_COOKIE,cipher.encrypt(json.dumps(staged,separators=(",",":")).encode()).decode(),
                        max_age=ABSOLUTE_LIMIT,httponly=True,samesite="lax",secure=secure,path="/")
    else:
        resp.delete_cookie(SESSION_COOKIE,httponly=True,samesite="lax",secure=secure,path="/")

def client_ip(req):
    """Caller address for rate limits. Behind the host's proxy the last X-Forwarded-For hop is the one it added."""
    fwd=[h.strip() for h in req.headers.get("x-forwarded-for","").split(",") if h.strip()]
    return fwd[-1] if fwd else (req.client.host if req.client else "unknown")

def read_session(req, require_proof=True):
    s = load_cookie(req)
    if not s:
        if req.cookies.get(SESSION_COOKIE):
            drop_session(req)
            raise HTTPException(401, "Please sign in again.")
        raise HTTPException(401, "Sign in to your HBA account.")
    now=time.time()
    if now-s.get("seen",now)>IDLE_LIMIT or now-s.get("started",now)>ABSOLUTE_LIMIT:
        drop_session(req)
        raise HTTPException(401, "Session expired. Sign in again.")
    if require_proof and not secrets.compare_digest(req.headers.get("x-hba-proof", ""), s["proof"]):
        raise HTTPException(401, "Session check failed. Reopen the Community section.")
    if s["expires"] < time.time() + 90:
        try:
            d = sb("POST", "/auth/v1/token?grant_type=refresh_token", json={"refresh_token": s["refresh"]}).json()
        except HTTPException:
            drop_session(req)
            raise HTTPException(401, "Session expired. Sign in again.")
        s.update(token=d["access_token"], refresh=d["refresh_token"], expires=time.time()+d["expires_in"])
        put_session(req, s)
    # Supabase Auth verifies the JWT on every protected request.
    u = sb("GET", "/auth/v1/user", s["token"]).json()
    rows = rest("hba_members", s["token"], query="id=eq." + u["id"] + "&select=*")
    m = rows[0] if rows else {"id": u["id"], "role": "pending", "email": u["email"], "household_uid": None}
    if not u.get("email_confirmed_at"):
        raise HTTPException(403, "Confirm your email before accessing HBA records.")
    m["actual_role"]=m["role"]
    m["view_mode"]="resident" if s.get("view_mode")=="resident" and m["role"] in {"board","admin"} else "board" if m["role"] in {"board","admin"} else "resident"
    if m["view_mode"]=="resident" and m["actual_role"] in {"board","admin"}:
        m["role"]="resident"
    s.setdefault("started",now)
    # Re-issue the cookie for activity at most once a minute, not on every request.
    if now-s.get("seen",0)>60 or getattr(req.state,"hba_session",None) is not None:
        s["seen"]=now
        put_session(req,s)
    return s, m

def require(req, roles=("resident", "board", "admin")):
    s, m = read_session(req)
    if m.get("must_change_password"):
        raise HTTPException(403, "Choose a new password before continuing.")
    if m["role"] not in roles:
        raise HTTPException(403, "Board approval is required." if m["role"] == "pending" else "Permission denied.")
    return s["token"], m

def board(req):
    return require(req, ("board", "admin"))

asset_auth_cache={}
asset_auth_lock=RLock()
def asset_member(req):
    """Session still has to exist on every asset request; short cache avoids an auth call per image."""
    saved=load_cookie(req)
    if not saved:
        raise HTTPException(401,"Sign in before viewing HBA information.")
    now=time.time()
    if now-saved.get("seen",now)>IDLE_LIMIT or now-saved.get("started",now)>ABSOLUTE_LIMIT:
        raise HTTPException(401,"Session expired. Sign in again.")
    key=(hashlib.sha256(saved["token"].encode()).hexdigest(),saved.get("view_mode"))
    with asset_auth_lock:
        cached=asset_auth_cache.get(key)
        if cached and cached[1]>now:
            return cached[0]
        s,m=read_session(req,False)
        if m["role"] not in {"resident","board","admin"}:
            raise HTTPException(403,"Your account needs board approval before viewing HBA information.")
        if len(asset_auth_cache)>2000:
            asset_auth_cache.clear()
        fresh=(hashlib.sha256(s["token"].encode()).hexdigest(),s.get("view_mode"))
        asset_auth_cache[fresh]=(m,now+10)
        return m

def newsletter_editor(req):
    t, m = board(req)
    if not rest("rpc/hba_can_edit_newsletter", t, "POST", {}):
        raise HTTPException(403, "The linked, in-term Secretary account or administrator is required.")
    return t, m

def uid(value):
    try:
        return str(UUID(value))
    except (ValueError,TypeError,AttributeError):
        raise HTTPException(400, "Invalid record ID.")

def year_ok(year):
    if not 2020 <= year <= 2100:
        raise HTTPException(400, "Year must be between 2020 and 2100.")

# Sign-in and sign-up attempts allowed per address in 15 minutes. The end-to-end walkthrough raises it on its own
# local server, which signs the four test accounts in many times.
AUTH_ATTEMPTS = int(os.environ.get("HBA_AUTH_ATTEMPTS") or 12)

def rate(req):
    key = client_ip(req)
    now = time.time()
    with lock:
        q = rates[key]
        while q and q[0] < now - 900:
            q.popleft()
        if len(q) >= AUTH_ATTEMPTS:
            raise HTTPException(429, "Too many account attempts. Try again in 15 minutes.")
        q.append(now)
