"""Private preview bridge to HBA Supabase Auth, RLS and Storage.

Only an anon key is used. Every data/storage request carries the user's JWT,
so PostgreSQL policies remain authoritative even if a UI control is bypassed.
Auth sessions are encrypted at rest and bound to the private proxy visitor.
"""

import io
import json
import os
import secrets
import re
import hashlib
import hmac
from urllib.parse import quote
from bank_reconciliation import analyze as analyze_bank
import sqlite3
import time
from pathlib import Path
from threading import RLock
from uuid import UUID, uuid4
from datetime import date, datetime, timezone, timedelta, time as time_type
from collections import defaultdict, deque
from email.message import EmailMessage
from email.policy import SMTP
from decimal import Decimal
from contextvars import ContextVar

import fitz
import httpx
from PIL import Image, ImageOps, UnidentifiedImageError
from cryptography.fernet import Fernet
from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    Request,
    HTTPException,
    UploadFile,
    File,
    Form,
    BackgroundTasks,
)
import document_intake
import local_weather
import weather_alerts
import voting
import engagement

ENGAGE = {}
from fastapi.responses import Response, FileResponse, HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env.community")
# Hosted copies read hba-storage.json (written by build-publish-bundle.py) so the service talks to Supabase directly;
# the hosting credential proxy rewrites the Authorization header, which would discard each member's own token.
_storage_cfg = ROOT / "hba-storage.json"
if _storage_cfg.exists():
    _cfg = json.loads(_storage_cfg.read_text())
    URL, KEY = _cfg["url"].rstrip("/"), _cfg["anon_key"]
else:
    URL = os.environ["SUPABASE_URL"].rstrip("/")
    KEY = os.environ["SUPABASE_ANON_KEY"]
DATA = ROOT / "community-private-data"
DATA.mkdir(mode=0o700, exist_ok=True)
key_path = DATA / "session.key"
if not key_path.exists():
    key_path.write_bytes(Fernet.generate_key())
    key_path.chmod(0o600)
cipher = Fernet(key_path.read_bytes())
db = sqlite3.connect(DATA / "sessions.sqlite", check_same_thread=False)
db.row_factory = sqlite3.Row
db.execute(
    "CREATE TABLE IF NOT EXISTS sessions(visitor TEXT PRIMARY KEY,payload BLOB NOT NULL)"
)
db.commit()
(DATA / "sessions.sqlite").chmod(0o600)
lock = RLock()
rates = defaultdict(deque)
db.execute(
    "CREATE TABLE IF NOT EXISTS push_log(key TEXT PRIMARY KEY, at REAL NOT NULL)"
)
db.commit()

# ---- Administrator alerts (Web Push). The VAPID key pair lives in community-private-data/vapid.pem and is copied
# into every published bundle so devices stay subscribed across releases. Subscriptions live in Supabase
# (hba_push_subscriptions); the server sends with the member's own token via the hba_push_targets() function.
import threading
from pywebpush import webpush, WebPushException
from py_vapid import Vapid
import base64

VAPID_PATH = DATA / "vapid.pem"


def _vapid():
    v = Vapid()
    if VAPID_PATH.exists():
        v = Vapid.from_file(str(VAPID_PATH))
    else:
        v.generate_keys()
        v.save_key(str(VAPID_PATH))
        VAPID_PATH.chmod(0o600)
    from cryptography.hazmat.primitives import serialization

    raw = v.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return v, base64.urlsafe_b64encode(raw).decode().rstrip("=")


VAPID, VAPID_PUBLIC = _vapid()
PUSH_SUBJECT = os.environ.get(
    "HBA_PUSH_SUBJECT", "mailto:hba-admin@hamiltonbeach.pplx.app"
)


def notify_admin(token, kind, title, body, dedupe=None, url="/"):
    """Send a push alert to every administrator device. Runs in the background; failures never affect the request."""
    if dedupe:
        with lock:
            if db.execute("SELECT 1 FROM push_log WHERE key=?", (dedupe,)).fetchone():
                return
            with db:
                db.execute(
                    "INSERT INTO push_log(key,at) VALUES(?,?)", (dedupe, time.time())
                )

    def run():
        try:
            targets = rest("rpc/hba_push_targets", token, "POST", {}) or []
        except Exception as e:  # noqa: BLE001
            print("push targets unavailable:", e)
            return
        payload = json.dumps(
            {
                "kind": kind,
                "title": title,
                "body": body[:300],
                "url": url,
                "at": datetime.now(timezone.utc).isoformat(),
            }
        )
        for t in targets:
            try:
                webpush(
                    {
                        "endpoint": t["endpoint"],
                        "keys": {"p256dh": t["p256dh"], "auth": t["auth"]},
                    },
                    data=payload,
                    vapid_private_key=str(VAPID_PATH),
                    vapid_claims={"sub": PUSH_SUBJECT},
                    ttl=86400,
                    timeout=15,
                )
            except WebPushException as e:  # noqa: BLE001
                print(
                    "push failed:",
                    getattr(e.response, "status_code", "?"),
                    str(e)[:160],
                )
            except Exception as e:  # noqa: BLE001
                print("push error:", str(e)[:160])

    threading.Thread(target=run, daemon=True).start()


APP_ROOT = ROOT / "private-app"
homes = json.loads((APP_ROOT / "dues-registry-data.json").read_text())
VALID = {p["uid"] for p in homes["properties"]}
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
# Browsers reach the API through the hosting proxy on the same origin as the sign-in gate; CORS is only needed for local development and Perplexity-hosted previews.
# Self-hosted copies may add their own sign-in page origin(s) with HBA_ALLOWED_ORIGINS="https://portal.example.org,https://www.example.org".
_extra_origins = [
    o.strip() for o in os.environ.get("HBA_ALLOWED_ORIGINS", "").split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(https://([a-z0-9-]+\.)?(pplx\.app|perplexity\.ai)|http://(127\.0\.0\.1|localhost)(:\d+)?)$",
    allow_origins=_extra_origins,
    allow_credentials=bool(_extra_origins),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-HBA-Proof", "X-Visitor-Id"],
)

# Visitor identity. The Perplexity host sends an x-visitor-id header for every browser. Elsewhere set
# HBA_VISITOR_MODE=cookie and the service issues its own random first-party cookie instead.
VISITOR_MODE = os.environ.get("HBA_VISITOR_MODE", "header").strip().lower()
if VISITOR_MODE == "cookie":

    @app.middleware("http")
    async def _visitor_cookie(req: Request, call_next):
        vid = req.cookies.get("hba_visitor", "")
        fresh = not re.fullmatch(r"[A-Za-z0-9_-]{32,64}", vid or "")
        if fresh:
            vid = secrets.token_urlsafe(32)
        req.state.visitor_id = vid
        resp = await call_next(req)
        if fresh:
            resp.set_cookie(
                "hba_visitor",
                vid,
                max_age=365 * 24 * 3600,
                httponly=True,
                samesite="lax",
                secure=req.url.scheme == "https",
                path="/",
            )
        return resp


PREVIEW_APP_URL = "https://www.perplexity.ai/computer/a/hamilton-beach-community-homes-IC2mb69NTpGgtcVWYsewOA"


def app_url():
    """Public address of the app for links in drafts: app-url.txt in the project root (written by build-publish-bundle.py) or the preview."""
    try:
        return (ROOT / "app-url.txt").read_text().strip() or PREVIEW_APP_URL
    except OSError:
        return PREVIEW_APP_URL


client = httpx.Client(timeout=35)
resident_view = ContextVar("hba_resident_view", default=False)
Image.MAX_IMAGE_PIXELS = 24_000_000


@app.middleware("http")
async def private_headers(request, call_next):
    preview = False
    try:
        v = visitor(request)
        with lock:
            row = db.execute(
                "SELECT payload FROM sessions WHERE visitor=?", (v,)
            ).fetchone()
        if row:
            preview = (
                json.loads(cipher.decrypt(row["payload"])).get("view_mode")
                == "resident"
            )
    except (HTTPException, ValueError, KeyError):
        pass
    mode_token = resident_view.set(preview)
    path = request.url.path
    if (
        path.startswith("/api/")
        and path not in {"/api/health", "/api/session", "/api/logout"}
        and not path.startswith("/api/auth/")
        and request.method != "OPTIONS"
    ):
        from starlette.concurrency import run_in_threadpool

        try:
            await run_in_threadpool(asset_member, request)
        except HTTPException as e:
            resident_view.reset(mode_token)
            return JSONResponse(
                {"detail": e.detail},
                status_code=e.status_code,
                headers={
                    "Cache-Control": "private, no-store",
                    "X-Content-Type-Options": "nosniff",
                },
            )
    try:
        r = await call_next(request)
    finally:
        resident_view.reset(mode_token)
    r.headers["Cache-Control"] = "private, no-store"
    r.headers["X-Content-Type-Options"] = "nosniff"
    return r


def visitor(req):
    if VISITOR_MODE == "cookie":
        v = getattr(req.state, "visitor_id", "")
        if v:
            return v
    v = req.headers.get("x-visitor-id", "")
    if v and len(v) <= 200:
        return v
    if (
        req.client
        and req.client.host in {"127.0.0.1", "::1", "testclient"}
        and req.headers.get("origin")
        in {"http://127.0.0.1:3001", "http://localhost:3001"}
    ):
        return "local-development"
    raise HTTPException(401, "Open this app through its private preview to sign in.")


def sb(method, path, token=None, **kwargs):
    # Anonymous calls send only the apikey header (Supabase treats that as the anon role); a bearer token is added
    # only for a signed-in user's JWT. Hosted copies receive the key through a credential proxy that rewrites apikey.
    headers = {
        "apikey": KEY,
        **({"Authorization": "Bearer " + token} if token and token != KEY else {}),
        **kwargs.pop("headers", {}),
    }
    if resident_view.get():
        headers["X-HBA-View"] = "resident"
    try:
        r = client.request(method, URL + path, headers=headers, **kwargs)
    except httpx.HTTPError:
        raise HTTPException(503, "The HBA storage service is unavailable. Try again.")
    if r.is_error:
        try:
            d = r.json()
        except ValueError:
            d = {}
        msg = (
            d.get("msg")
            or d.get("message")
            or d.get("error_description")
            or "Storage request failed"
        )
        if "Revision conflict" in msg:
            raise HTTPException(409, "Status changed elsewhere. Refresh and retry.")
        if r.status_code in {401, 403} or "row-level security" in msg:
            raise HTTPException(
                403, "This account does not have permission for that action."
            )
        raise HTTPException(400 if r.status_code < 500 else 503, str(msg)[:280])
    return r


def rest(table, token, method="GET", data=None, query="", representation=False):
    r = sb(
        method,
        "/rest/v1/" + table + ("?" + query if query else ""),
        token,
        json=data,
        headers={
            "Prefer": "return=representation" if representation else "return=minimal"
        },
    )
    return r.json() if r.content else None


def put_session(v, value):
    with lock, db:
        db.execute(
            "INSERT INTO sessions VALUES(?,?) ON CONFLICT(visitor) DO UPDATE SET payload=excluded.payload",
            (v, cipher.encrypt(json.dumps(value).encode())),
        )


def read_session(req, require_proof=True):
    v = visitor(req)
    with lock:
        r = db.execute("SELECT payload FROM sessions WHERE visitor=?", (v,)).fetchone()
    if not r:
        raise HTTPException(401, "Sign in to your HBA account.")
    try:
        s = json.loads(cipher.decrypt(r["payload"]))
    except Exception:
        raise HTTPException(401, "Please sign in again.")
    now = time.time()
    if now - s.get("seen", now) > 43200 or now - s.get("started", now) > 604800:
        with lock, db:
            db.execute("DELETE FROM sessions WHERE visitor=?", (v,))
        raise HTTPException(401, "Session expired. Sign in again.")
    if require_proof and not secrets.compare_digest(
        req.headers.get("x-hba-proof", ""), s["proof"]
    ):
        raise HTTPException(401, "Session check failed. Reopen the Community section.")
    if s["expires"] < time.time() + 90:
        try:
            d = sb(
                "POST",
                "/auth/v1/token?grant_type=refresh_token",
                json={"refresh_token": s["refresh"]},
            ).json()
        except HTTPException:
            with lock, db:
                db.execute("DELETE FROM sessions WHERE visitor=?", (v,))
            raise HTTPException(401, "Session expired. Sign in again.")
        s.update(
            token=d["access_token"],
            refresh=d["refresh_token"],
            expires=time.time() + d["expires_in"],
        )
        put_session(v, s)
    # Supabase Auth verifies the JWT on every protected request.
    u = sb("GET", "/auth/v1/user", s["token"]).json()
    rows = rest("hba_members", s["token"], query="id=eq." + u["id"] + "&select=*")
    m = (
        rows[0]
        if rows
        else {
            "id": u["id"],
            "role": "pending",
            "email": u["email"],
            "household_uid": None,
        }
    )
    if not u.get("email_confirmed_at"):
        raise HTTPException(403, "Confirm your email before accessing HBA records.")
    m["actual_role"] = m["role"]
    m["view_mode"] = (
        "resident"
        if s.get("view_mode") == "resident" and m["role"] in {"board", "admin"}
        else "board" if m["role"] in {"board", "admin"} else "resident"
    )
    if m["view_mode"] == "resident" and m["actual_role"] in {"board", "admin"}:
        m["role"] = "resident"
    s["seen"] = now
    s.setdefault("started", now)
    put_session(v, s)
    return s, m


def require(req, roles=("resident", "board", "admin")):
    s, m = read_session(req)
    if m.get("must_change_password"):
        raise HTTPException(403, "Choose a new password before continuing.")
    if m["role"] not in roles:
        raise HTTPException(
            403,
            (
                "Board approval is required."
                if m["role"] == "pending"
                else "Permission denied."
            ),
        )
    return s["token"], m


def board(req):
    return require(req, ("board", "admin"))


class ViewMode(BaseModel):
    mode: str


@app.post("/api/view-mode")
def set_view_mode(body: ViewMode, req: Request):
    s, m = read_session(req)
    if m.get("actual_role", m["role"]) not in {"board", "admin"}:
        raise HTTPException(
            403, "Only a board account can switch between board and resident views."
        )
    if body.mode not in {"board", "resident"}:
        raise HTTPException(400, "Choose board or resident view.")
    s["view_mode"] = body.mode
    put_session(visitor(req), s)
    with asset_auth_lock:
        asset_auth_cache.clear()
    return {"saved": True, "view_mode": body.mode}


asset_auth_cache = {}
asset_auth_lock = RLock()


def asset_member(req):
    """Session still has to exist on every asset request; short cache avoids an auth call per image."""
    v = visitor(req)
    with lock:
        row = db.execute(
            "SELECT payload FROM sessions WHERE visitor=?", (v,)
        ).fetchone()

    if not row:
        raise HTTPException(401, "Sign in before viewing HBA information.")
    try:
        saved = json.loads(cipher.decrypt(row["payload"]))
    except Exception:
        raise HTTPException(401, "Please sign in again.")
    now = time.time()
    if now - saved.get("seen", now) > 43200 or now - saved.get("started", now) > 604800:
        raise HTTPException(401, "Session expired. Sign in again.")
    key = (v, hashlib.sha256(saved["token"].encode()).hexdigest())
    with asset_auth_lock:
        cached = asset_auth_cache.get(key)
        if cached and cached[1] > now:
            return cached[0]
        s, m = read_session(req, False)
        if m["role"] not in {"resident", "board", "admin"}:
            raise HTTPException(
                403, "Your account needs board approval before viewing HBA information."
            )
        if len(asset_auth_cache) > 2000:
            asset_auth_cache.clear()
        fresh = (v, hashlib.sha256(s["token"].encode()).hexdigest())
        asset_auth_cache[fresh] = (m, now + 10)
        return m


@app.get("/app/")
@app.get("/app/{file_path:path}")
def protected_app(req: Request, file_path: str = "index.html"):
    asset_member(req)
    path = (APP_ROOT / (file_path or "index.html")).resolve()
    allowed = {
        ".html",
        ".js",
        ".css",
        ".json",
        ".csv",
        ".tsv",
        ".md",
        ".pdf",
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".svg",
        ".ico",
    }
    if (
        not path.is_relative_to(APP_ROOT.resolve())
        or path.suffix.lower() not in allowed
        or not path.is_file()
    ):
        raise HTTPException(404, "App file not found.")
    if path.suffix.lower() == ".html":
        text = path.read_text()
        rel = path.relative_to(APP_ROOT)
        guard_src = "../" * (len(rel.parts) - 1) + "auth-guard.js"
        root_relative = "../" * len(rel.parts)
        boot = (
            "<script>window.__HBA_API_ROOT__=new URL("
            + json.dumps(root_relative)
            + ",document.baseURI).href;</script><script src="
            + json.dumps(guard_src)
            + "></script>"
        )
        text = text.replace("<head>", "<head>" + boot, 1).replace("__PORT_3003__", "..")
        return HTMLResponse(text, headers={"Cache-Control": "private, no-store"})
    return FileResponse(
        path,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


def newsletter_editor(req):
    t, m = board(req)
    if not rest("rpc/hba_can_edit_newsletter", t, "POST", {}):
        raise HTTPException(
            403, "The linked, in-term Secretary account or administrator is required."
        )
    return t, m


def uid(value):
    try:
        return str(UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(400, "Invalid record ID.")


def year_ok(year):
    if not 2020 <= year <= 2100:
        raise HTTPException(400, "Year must be between 2020 and 2100.")


def rate(req):
    key = visitor(req)
    now = time.time()
    with lock:
        q = rates[key]
        while q and q[0] < now - 900:
            q.popleft()
        if len(q) >= 12:
            raise HTTPException(
                429, "Too many account attempts. Try again in 15 minutes."
            )
        q.append(now)


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=200)
    display_name: str = Field(default="", max_length=120)
    requested_household_uid: str = Field(default="", max_length=100)
    request_note: str = Field(default="", max_length=1000)
    sms_phone: str = Field(default="", max_length=20)
    sms_topics: list[str] = Field(default_factory=list, max_length=8)
    sms_consent: bool = False


SMS_TOPIC_LABELS = {
    "roads": "Road work & plowing",
    "beach": "Beach, jetty & sand updates",
    "events": "Events & annual supper",
    "speed_bumps": "Speed bumps & traffic",
    "votes": "Votes, polls & results",
    "meetings": "Meeting notices & reminders",
    "weather": "Severe weather & coastal flooding",
    "general": "General association notices",
}
SMS_TOPICS = tuple(SMS_TOPIC_LABELS)


@app.get("/api/health")
def health(probe: int = 0):
    """Liveness check. probe=1 also reports whether Supabase Auth and REST answer, without revealing any credential."""
    out = {"service": "HBA community", "configured": bool(URL and KEY)}
    if probe:
        from urllib.parse import urlparse

        host = urlparse(URL).hostname or ""
        out["storage_host_kind"] = (
            "supabase" if host.endswith("supabase.co") else "proxied"
        )
        for name, path in (
            ("auth", "/auth/v1/health"),
            ("rest", "/rest/v1/hba_public_advisories?select=category&limit=1"),
        ):
            try:
                r = client.get(URL + path, headers={"apikey": KEY})
                out[name] = f"{r.status_code} " + (
                    "ok" if not r.is_error else r.text[:90].replace("\n", " ")
                )
            except httpx.HTTPError as exc:
                out[name] = "error " + type(exc).__name__
    return out


@app.get("/api/session")
def session(req: Request):
    try:
        s, m = read_session(req, False)
    except HTTPException as e:
        if e.status_code == 401:
            return {"signed_in": False}
        raise
    if m.get("role") == "pending":
        home = next(
            (
                p["address"].title()
                for p in homes["properties"]
                if p["uid"] == m.get("requested_household_uid")
            ),
            None,
        )
        notify_admin(
            s["token"],
            "account",
            "Account request",
            f"{m.get('display_name') or m['email']} ({m['email']}){(' · '+home) if home else ''} is waiting for approval.",
            dedupe="account:" + str(m["id"]),
        )
    return {"signed_in": True, "member": m, "proof": s["proof"]}


@app.get("/api/auth/addresses")
def signup_addresses():
    """Street addresses only (public assessor data) so a resident can pick their household when requesting an account."""
    return {
        "addresses": sorted(
            (
                {"uid": p["uid"], "address": p["address"].title()}
                for p in homes["properties"]
            ),
            key=lambda a: (
                a["address"].split(" ", 1)[1],
                (
                    int(re.match(r"\d+", a["address"]).group())
                    if re.match(r"\d+", a["address"])
                    else 0
                ),
            ),
        ),
        "sms_topics": [{"value": k, "label": v} for k, v in SMS_TOPIC_LABELS.items()],
    }


@app.post("/api/auth/{action}")
def auth(action: str, body: Credentials, req: Request):
    rate(req)
    if action not in {"login", "signup"} or "@" not in body.email:
        raise HTTPException(400, "Enter a valid email and password.")
    email = body.email.strip().lower()
    if action == "signup":
        if body.requested_household_uid and body.requested_household_uid not in VALID:
            raise HTTPException(
                400,
                "Choose your Hamilton Beach address from the list, or leave it blank and explain in the note.",
            )
        meta = {
            "display_name": body.display_name.strip(),
            "requested_household_uid": body.requested_household_uid,
            "request_note": body.request_note.strip(),
        }
        phone = re.sub(r"\D", "", body.sms_phone)
        if phone:
            if len(phone) == 11 and phone.startswith("1"):
                phone = phone[1:]
            if len(phone) != 10 or phone[0] not in "23456789":
                raise HTTPException(
                    400,
                    "Enter a 10-digit US mobile number for SMS alerts, or leave it blank.",
                )
            topics = [t for t in dict.fromkeys(body.sms_topics) if t in SMS_TOPICS]
            if not topics:
                raise HTTPException(
                    400,
                    "Choose at least one SMS topic, or leave the phone number blank.",
                )
            if not body.sms_consent:
                raise HTTPException(
                    400, "Tick the SMS consent box to request text alerts."
                )
            meta.update(sms_phone="+1" + phone, sms_topics=topics, sms_consent="true")
        sb(
            "POST",
            "/auth/v1/signup",
            json={"email": email, "password": body.password, "data": meta},
        )
        return {
            "message": "Check your email to confirm your address, then sign in. Your request then goes to the board for approval; you will see a waiting screen until a board member approves it and links your household."
            + (
                " Your SMS topics are saved with the request and activate on approval (texting itself is not switched on yet)."
                if phone
                else ""
            )
        }
    d = sb(
        "POST",
        "/auth/v1/token?grant_type=password",
        json={"email": email, "password": body.password},
    ).json()
    put_session(
        visitor(req),
        {
            "token": d["access_token"],
            "refresh": d["refresh_token"],
            "expires": time.time() + d["expires_in"],
            "proof": secrets.token_urlsafe(32),
            "started": time.time(),
            "seen": time.time(),
        },
    )
    return session(req)


@app.post("/api/logout")
def logout(req: Request):
    s, _ = read_session(req)
    try:
        sb("POST", "/auth/v1/logout?scope=local", s["token"])
    finally:
        with lock, db:
            db.execute("DELETE FROM sessions WHERE visitor=?", (visitor(req),))
    return {"signed_in": False}


@app.get("/api/community")
def community(req: Request):
    token, m = require(req)
    data = {
        key: rest(table, token, query="select=*&order=" + order)
        for key, table, order in [
            ("series", "hba_series", "title.asc"),
            ("events", "hba_events", "event_date.desc"),
            (
                "documents",
                "hba_documents",
                "document_year.desc.nullslast,created_at.desc",
            ),
            (
                "history",
                "hba_house_history",
                "history_year.desc.nullslast,created_at.desc",
            ),
            ("photos", "hba_photos", "created_at.desc"),
        ]
    }
    data.update(member=m)
    data["officeholders"] = rest("hba_officeholders", token, query="select=*")
    data["elections"] = rest("hba_elections", token, query="select=*&order=year.asc")
    data["bid_requests"] = rest(
        "hba_bid_requests", token, query="select=*&order=created_at.desc"
    )
    data["bids"] = rest(
        "hba_bids", token, query="select=*&order=amount.asc,created_at.desc"
    )
    data["bid_files"] = rest(
        "hba_bid_files", token, query="select=*&order=created_at.asc"
    )
    if m["role"] in {"board", "admin"}:
        data["bid_reviews"] = rest(
            "hba_bid_reviews", token, query="select=*&order=created_at.desc"
        )
    data["meetings"] = rest(
        "hba_meetings", token, query="select=*&order=meeting_date.asc,meeting_time.asc"
    )
    data["agenda"] = rest(
        "hba_agenda_items", token, query="select=*&order=sort_order.asc,created_at.asc"
    )
    data["can_schedule"] = rest("rpc/hba_can_schedule", token, "POST", {})
    data["can_edit_newsletter"] = rest("rpc/hba_can_edit_newsletter", token, "POST", {})
    data["can_edit_finance"] = rest("rpc/hba_can_edit_finance", token, "POST", {})
    data["newsletters"] = rest(
        "hba_newsletters", token, query="select=*&order=issue_date.desc,created_at.desc"
    )
    data["can_edit_minutes"] = rest("rpc/hba_can_edit_minutes", token, "POST", {})
    data["minutes"] = rest(
        "hba_meeting_minutes",
        token,
        query="select=*&order=meeting_date.desc,created_at.desc",
    )
    data["sms_preferences"] = rest(
        "hba_sms_preferences", token, query="select=*&member_id=eq." + m["id"]
    )
    data["settings"] = {
        r["key"]: r["value"]
        for r in rest("hba_settings", token, query="select=key,value")
    }
    data["member_households"] = rest("hba_member_households", token, query="select=*")
    data["voting_procedures"] = (
        rest(
            "hba_voting_procedures",
            token,
            query="select=id,version_label,adopted_on,confirmed_at,online_ballots_allowed",
        )
        or [{}]
    )[0]
    data["sms_service"] = {
        "ready": False,
        "status": "Not activated: sender connection and phone verification are not configured.",
    }
    data["volunteer_tasks"] = rest(
        "hba_volunteer_tasks",
        token,
        query="select=*&order=task_date.asc.nullslast,created_at.desc",
    )
    data["volunteer_counts"] = rest("rpc/hba_volunteer_counts", token, "POST", {})
    data["volunteer_signups"] = rest(
        "hba_volunteer_signups", token, query="select=*&order=created_at.asc"
    )
    data["volunteer_email_preferences"] = rest(
        "hba_volunteer_email_preferences",
        token,
        query="select=*&member_id=eq." + m["id"],
    )
    data["research_reports"] = rest(
        "hba_research_reports", token, query="select=*&order=created_at.desc&limit=20"
    )
    data["bank_summaries"] = rest(
        "hba_bank_summaries",
        token,
        query="select=*&order=period_end.desc,created_at.desc&limit=20",
    )
    if m["role"] in {"board", "admin"}:
        data["document_intakes"] = rest(
            "hba_document_intakes",
            token,
            query="select=document_id,state,summary,updated_at&order=updated_at.desc",
        )
        data["document_facts"] = rest(
            "hba_document_facts", token, query="select=*&order=created_at.desc"
        )
        data["sms_counts"] = rest("rpc/hba_sms_counts", token, "POST", {})
        data["sms_drafts"] = rest(
            "hba_sms_drafts", token, query="select=*&order=updated_at.desc"
        )
    data["payment_settings"] = rest("hba_payment_settings", token, query="select=*")[0]
    data["payment_reports"] = rest(
        "hba_payment_reports", token, query="select=*&order=created_at.desc"
    )
    if m["role"] in {"board", "admin"}:
        data["work"] = rest("hba_work", token, query="select=*&order=created_at.desc")
        data["work_notes"] = rest(
            "hba_work_notes", token, query="select=*&order=created_at.desc"
        )
        data["members"] = rest(
            "hba_members",
            token,
            query="select=*&role=neq.deleted&order=created_at.desc",
        )
        data["account_audit"] = rest(
            "hba_account_audit", token, query="select=*&order=created_at.desc&limit=60"
        )
        data["issues"] = rest(
            "hba_issues", token, query="select=*&order=created_at.desc"
        )
        data["decisions"] = rest(
            "hba_decisions", token, query="select=*&order=meeting_date.desc"
        )
        data["meeting_access"] = rest("hba_meeting_access", token, query="select=*")
        data["meeting_integrations"] = {
            "zoom": False,
            "email_authorized_during_setup": True,
            "email_delivery_tested": False,
            "reminders": False,
        }
    return data


class Series(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=3000)


class Event(BaseModel):
    series_id: UUID
    title: str = Field(min_length=1, max_length=180)
    event_date: date
    event_time: str | None = None
    location: str = Field(default="", max_length=300)
    description: str = Field(default="", max_length=12000)
    state: str = "scheduled"
    rain_date: date | None = None
    use_rain_date: bool = False
    planning_only: bool = False


class Story(BaseModel):
    household_uid: str
    title: str = Field(min_length=1, max_length=180)
    story: str = Field(min_length=1, max_length=12000)
    history_year: int | None = Field(default=None, ge=1600, le=2200)


# ---- Messages center -------------------------------------------------------------------------------
# A feed of what has happened, built from the existing tables with the member's own token, so each person
# sees only what the row-level rules already allow. The browser remembers when each member last read it.
def _inbox_items(t, m):
    items = []
    role = m["role"]
    board_role = role in {"board", "admin"}
    since = (datetime.now(timezone.utc) - timedelta(days=60)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )

    def pull(table, query):
        try:
            return rest(table, t, query=query) or []
        except HTTPException:
            return []

    def add(kind, at, title, body, tool, mine=False, action=False):
        if at:
            items.append(
                {
                    "kind": kind,
                    "at": at,
                    "title": title[:200],
                    "body": (body or "")[:300],
                    "tool": tool,
                    "mine": mine,
                    "action": action,
                }
            )

    label = lambda r: (
        (r.get("display_name") or r.get("email") or "a neighbour")
        if isinstance(r, dict)
        else "a neighbour"
    )

    # Everyone: published community material
    def nice_date(d):
        try:
            return datetime.strptime(d, "%Y-%m-%d").strftime("%A, %B %-d, %Y")
        except (TypeError, ValueError):
            return d or ""

    def nice_time(x):
        try:
            return datetime.strptime(x[:5], "%H:%M").strftime("%-I:%M %p")
        except (TypeError, ValueError):
            return ""

    # Calendar items (events, meetings) are deliberately not part of the feed; the calendar and the Coming up panel show them.
    for r in pull(
        "hba_newsletters",
        f"select=id,title,issue_date,state,updated_at&state=eq.published&updated_at=gte.{since}&order=updated_at.desc&limit=10",
    ):
        add(
            "newsletter",
            r["updated_at"],
            f"Newsletter published: {r['title']}",
            f"Issue dated {nice_date(r.get('issue_date')) or 'not recorded'}",
            "newsletter",
        )
    for r in pull(
        "hba_meeting_minutes",
        f"select=id,title,meeting_date,state,updated_at&state=eq.approved&updated_at=gte.{since}&order=updated_at.desc&limit=10",
    ):
        add(
            "minutes",
            r["updated_at"],
            f"Minutes approved: {r['title']}",
            f"Meeting of {nice_date(r.get('meeting_date')) or 'date not recorded'}",
            "minutes",
        )
    for r in pull(
        "hba_votes",
        f"select=id,title,state,updated_at&state=in.(noticed,open,confirmed)&updated_at=gte.{since}&order=updated_at.desc&limit=10",
    ):
        add(
            "vote",
            r["updated_at"],
            {
                "noticed": "Vote notice posted",
                "open": "Voting is open",
                "confirmed": "Vote result confirmed",
            }.get(r["state"], "Vote update")
            + f": {r['title']}",
            "",
            "votes",
        )
    for r in pull(
        "hba_volunteer_tasks",
        f"select=id,title,task_date,state,updated_at&state=eq.published&updated_at=gte.{since}&order=updated_at.desc&limit=10",
    ):
        add(
            "volunteer",
            r["updated_at"],
            f"Volunteers wanted: {r['title']}",
            nice_date(r.get("task_date")) or "Date to be announced",
            "volunteers",
        )
    for r in pull(
        "hba_photos",
        f"select=id,caption,status,created_at,event_id,storm_id,history_id&status=eq.published&created_at=gte.{since}&issue_id=is.null&work_id=is.null&order=created_at.desc&limit=12",
    ):
        add(
            "photo",
            r["created_at"],
            "New photograph published",
            r.get("caption") or "",
            (
                "storms"
                if r.get("storm_id")
                else "households" if r.get("history_id") else "events"
            ),
        )
    for r in pull(
        "hba_storm_memories",
        f"select=id,title,storm_label,status,created_at&status=eq.published&created_at=gte.{since}&order=created_at.desc&limit=10",
    ):
        add(
            "storm",
            r["created_at"],
            f"Storm memory published: {r['title']}",
            r.get("storm_label") or "",
            "storms",
        )
    for r in pull(
        "hba_house_history",
        f"select=id,title,household_uid,status,created_at&status=eq.published&created_at=gte.{since}&order=created_at.desc&limit=10",
    ):
        home = next(
            (
                p["address"].title()
                for p in homes["properties"]
                if p["uid"] == r.get("household_uid")
            ),
            "",
        )
        add(
            "story",
            r["created_at"],
            f"Household story published: {r['title']}",
            home,
            "households",
        )
    for r in pull(
        "hba_work",
        f"select=id,title,contractor,state,created_at&created_at=gte.{since}&order=created_at.desc&limit=8",
    ):
        add(
            "work",
            r["created_at"],
            f"Contractor work recorded: {r['title']}",
            f"{r.get('contractor') or ''} · {r.get('state','').replace('_',' ')}",
            "work",
        )
    # Your own requests and their answers
    me = m["id"]
    for r in pull(
        "hba_issues",
        f"select=id,title,state,board_note,updated_at,created_at,created_by&created_by=eq.{me}&order=updated_at.desc&limit=10",
    ):
        if r["updated_at"] != r["created_at"] or r["state"] != "pending_meeting":
            add(
                "issue-reply",
                r["updated_at"],
                f"Your report “{r['title']}”: {r['state'].replace('_',' ')}",
                r.get("board_note") or "",
                "issues",
                mine=True,
            )
    for r in pull(
        "hba_governor_messages",
        f"select=id,subject,to_position,state,board_note,updated_at,from_member_id&from_member_id=eq.{me}&state=in.(read,replied)&order=updated_at.desc&limit=10",
    ):
        add(
            "message-reply",
            r["updated_at"],
            f"Your message to the {r['to_position']} was {r['state']}",
            r.get("board_note") or "",
            "team",
            mine=True,
        )
    for r in pull(
        "hba_payment_reports",
        f"select=id,amount,payment_kind,state,board_note,reviewed_at,created_by&created_by=eq.{me}&state=in.(verified,rejected)&order=reviewed_at.desc&limit=10",
    ):
        add(
            "payment-reply",
            r.get("reviewed_at"),
            f"Your ${float(r['amount']):,.2f} {r['payment_kind']} report was {r['state']}",
            r.get("board_note") or "",
            "payments",
            mine=True,
        )
    # Board: what residents have sent in
    if board_role:
        members = {
            x["id"]: x
            for x in pull(
                "hba_members",
                "select=id,email,display_name,role,requested_at,created_at,requested_household_uid",
            )
        }
        for x in members.values():
            if x["role"] == "pending":
                home = next(
                    (
                        p["address"].title()
                        for p in homes["properties"]
                        if p["uid"] == x.get("requested_household_uid")
                    ),
                    "",
                )
                add(
                    "account",
                    x.get("requested_at") or x.get("created_at"),
                    f"Account request from {label(x)}",
                    home,
                    "members",
                    action=True,
                )
        for r in pull(
            "hba_issues",
            f"select=id,title,location,state,created_at,created_by&created_at=gte.{since}&order=created_at.desc&limit=15",
        ):
            add(
                "issue",
                r["created_at"],
                f"Problem reported by {label(members.get(r['created_by']))}: {r['title']}",
                f"{r.get('location') or ''} · {r['state'].replace('_',' ')}",
                "issues",
                action=r["state"] == "pending_meeting",
            )
        for r in pull(
            "hba_governor_messages",
            f"select=id,subject,to_position,state,created_at,from_member_id&created_at=gte.{since}&order=created_at.desc&limit=15",
        ):
            add(
                "message",
                r["created_at"],
                f"Message to the {r['to_position']} from {label(members.get(r['from_member_id']))}",
                r.get("subject") or "",
                "team",
                action=r["state"] == "new",
            )
        for r in pull(
            "hba_payment_reports",
            f"select=id,amount,payment_kind,payment_method,state,created_at,created_by&created_at=gte.{since}&order=created_at.desc&limit=15",
        ):
            add(
                "payment",
                r["created_at"],
                f"Payment report from {label(members.get(r['created_by']))}: ${float(r['amount']):,.2f} {r['payment_kind']}",
                f"{r.get('payment_method') or ''} · {r['state']}",
                "payments",
                action=r["state"] == "pending",
            )
        for r in pull(
            "hba_storm_memories",
            f"select=id,title,status,created_at,created_by&status=eq.pending&order=created_at.desc&limit=10",
        ):
            add(
                "storm",
                r["created_at"],
                f"Storm memory to review from {label(members.get(r['created_by']))}: {r['title']}",
                "",
                "storms",
                action=True,
            )
        for r in pull(
            "hba_house_history",
            f"select=id,title,status,created_at,created_by&status=eq.pending&order=created_at.desc&limit=10",
        ):
            add(
                "story",
                r["created_at"],
                f"Household story to review from {label(members.get(r['created_by']))}: {r['title']}",
                "",
                "households",
                action=True,
            )
        for r in pull(
            "hba_photos",
            f"select=id,caption,status,created_at,created_by,storm_id,history_id&status=eq.pending&issue_id=is.null&work_id=is.null&order=created_at.desc&limit=10",
        ):
            add(
                "photo",
                r["created_at"],
                f"Photograph to review from {label(members.get(r['created_by']))}",
                r.get("caption") or "",
                (
                    "storms"
                    if r.get("storm_id")
                    else "households" if r.get("history_id") else "events"
                ),
                action=True,
            )
        for r in pull(
            "hba_bids",
            f"select=id,contractor,amount,state,created_at&created_at=gte.{since}&order=created_at.desc&limit=10",
        ):
            add(
                "bid",
                r["created_at"],
                f"Contractor bid: {r['contractor']} · ${float(r['amount']):,.2f}",
                r["state"],
                "bids",
                action=r["state"] == "submitted",
            )
        for r in pull(
            "hba_volunteer_signups",
            f"select=id,task_id,member_id,state,created_at&created_at=gte.{since}&order=created_at.desc&limit=10",
        ):
            add(
                "volunteer",
                r["created_at"],
                f"Volunteer signed up: {label(members.get(r['member_id']))}",
                r.get("state") or "",
                "volunteers",
            )
    items.sort(key=lambda x: x["at"], reverse=True)
    return items[:60]


@app.get("/api/inbox")
def inbox(req: Request):
    t, m = require(req)
    items = _inbox_items(t, m)
    return {
        "items": items,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "role": m["role"],
    }


class PushSubscription(BaseModel):
    endpoint: str = Field(min_length=20, max_length=2000)
    keys: dict
    label: str = Field(default="", max_length=160)


@app.get("/api/push")
def push_state(req: Request):
    t, m = require(req)
    own, ready, note = [], True, ""
    if m["role"] == "admin":
        try:
            own = rest(
                "hba_push_subscriptions",
                t,
                query="select=id,endpoint,label,created_at&order=created_at.asc",
            )
        except HTTPException:
            ready, note = (
                False,
                "Alert storage has not been set up in the database yet, so alerts cannot be turned on. The in-app Requests panel still works.",
            )
    return {
        "public_key": VAPID_PUBLIC,
        "allowed": m["role"] == "admin",
        "devices": own,
        "ready": ready,
        "note": note,
    }


@app.post("/api/push/subscribe")
def push_subscribe(body: PushSubscription, req: Request):
    t, m = require(req, ("admin",))
    p256dh, auth = str(body.keys.get("p256dh", "")), str(body.keys.get("auth", ""))
    if (
        not body.endpoint.startswith("https://")
        or not p256dh
        or not auth
        or len(p256dh) > 400
        or len(auth) > 200
    ):
        raise HTTPException(
            400, "The browser did not supply a usable push subscription."
        )
    existing = rest(
        "hba_push_subscriptions",
        t,
        query="select=id&endpoint=eq." + quote(body.endpoint, safe=""),
    )
    if existing:
        rest(
            "hba_push_subscriptions",
            t,
            "PATCH",
            {"p256dh": p256dh, "auth": auth, "label": body.label.strip()[:160]},
            "id=eq." + existing[0]["id"],
        )
    else:
        rest(
            "hba_push_subscriptions",
            t,
            "POST",
            {
                "endpoint": body.endpoint,
                "p256dh": p256dh,
                "auth": auth,
                "label": body.label.strip()[:160],
            },
        )
    return {"saved": True}


class PushEndpoint(BaseModel):
    endpoint: str = Field(min_length=20, max_length=2000)


@app.post("/api/push/unsubscribe")
def push_unsubscribe(body: PushEndpoint, req: Request):
    t, _ = require(req, ("admin",))
    rest(
        "hba_push_subscriptions",
        t,
        "DELETE",
        query="endpoint=eq." + quote(body.endpoint, safe=""),
    )
    return {"removed": True}


@app.post("/api/push/test")
def push_test(req: Request):
    t, m = require(req, ("admin",))
    notify_admin(
        t,
        "test",
        "Hamilton Beach test alert",
        f"Alerts are working on this device. Sent {datetime.now(timezone.utc).astimezone().strftime('%b %d, %I:%M %p')}.",
    )
    return {"sent": True}


class StormMemory(BaseModel):
    storm_key: str = Field(min_length=1, max_length=60)
    storm_label: str = Field(min_length=1, max_length=120)
    event_year: int | None = Field(default=None, ge=1600, le=2100)
    title: str = Field(min_length=1, max_length=160)
    story: str = Field(min_length=1, max_length=6000)
    where_text: str = Field(default="", max_length=200)
    show_name: bool = False
    display_name: str = Field(default="", max_length=120)


@app.get("/api/storm-memories")
def storm_memories(req: Request):
    """Resident memories of storms; RLS returns published rows plus the reader's own pending ones (board sees all)."""
    t, m = require(req)
    memories = rest(
        "hba_storm_memories",
        t,
        query="select=*&order=event_year.desc.nullslast,created_at.desc",
    )
    photos = (
        rest(
            "hba_photos",
            t,
            query="select=id,storm_id,caption,credit,status,created_at,created_by&storm_id=not.is.null&order=created_at.asc",
        )
        if memories
        else []
    )
    return {
        "memories": memories,
        "photos": photos,
        "member": {"role": m["role"], "user_id": m["id"]},
    }


@app.post("/api/storm-memories")
def storm_memory_add(body: StormMemory, req: Request):
    t, m = require(req)
    data = body.model_dump()
    if not data["show_name"]:
        data["display_name"] = ""
    data["status"] = "published" if m["role"] in {"board", "admin"} else "pending"
    rows = rest("hba_storm_memories", t, "POST", data, representation=True)
    if data["status"] == "pending":
        notify_admin(
            t,
            "storm",
            "Storm memory to review",
            f"{m.get('display_name') or m['email']}: “{data['title']}” ({data['storm_label']}).",
        )
    return rows[0] if rows else {"status": data["status"]}


class Work(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    contractor: str = Field(default="", max_length=250)
    location: str = Field(default="", max_length=300)
    work_date: date | None = None
    description: str = Field(default="", max_length=12000)
    state: str = "planned"


class WorkNote(BaseModel):
    note: str = Field(min_length=1, max_length=12000)
    flag: str


@app.post("/api/series")
def add_series(body: Series, req: Request):
    t, _ = board(req)
    return rest("hba_series", t, "POST", body.model_dump(), representation=True)[0]


@app.post("/api/events")
@app.put("/api/events/{record_id}")
def save_event(body: Event, req: Request, record_id: str | None = None):
    t, _ = board(req)
    if body.state not in {"scheduled", "held", "cancelled"}:
        raise HTTPException(400, "Invalid event state.")
    if body.event_time:
        from datetime import time as dtime

        try:
            dtime.fromisoformat(body.event_time)
        except ValueError:
            raise HTTPException(400, "Invalid event time.")
    saved = rest(
        "hba_events",
        t,
        "PATCH" if record_id else "POST",
        body.model_dump(mode="json", exclude_unset=bool(record_id)),
        query="id=eq." + uid(record_id) if record_id else "",
        representation=True,
    )
    # Every new scheduled event gets a volunteer sign-up sheet (when that storage exists).
    if (
        not record_id
        and saved
        and body.state == "scheduled"
        and ENGAGE.get("ensure_task")
    ):
        try:
            ENGAGE["ensure_task"](t, saved[0])
        except HTTPException:
            pass
    return saved


@app.post("/api/house-history")
def add_story(body: Story, req: Request):
    t, m = require(req)
    if body.household_uid not in VALID:
        raise HTTPException(400, "Choose a mapped household.")
    if m["role"] == "resident" and body.household_uid != m.get("household_uid"):
        raise HTTPException(
            403, "A board member must link your account to this household first."
        )
    d = body.model_dump()
    d["status"] = "published" if m["role"] in {"board", "admin"} else "pending"
    row = rest("hba_house_history", t, "POST", d, representation=True)[0]
    if d["status"] == "pending":
        notify_admin(
            t,
            "history",
            "House story to review",
            f"{m.get('display_name') or m['email']}: “{body.title}”.",
        )
    return row


@app.post("/api/work")
@app.put("/api/work/{record_id}")
def save_work(body: Work, req: Request, record_id: str | None = None):
    t, _ = board(req)
    if body.state not in {
        "planned",
        "in_progress",
        "incomplete",
        "defect",
        "resolved",
        "accepted",
    }:
        raise HTTPException(400, "Invalid work state.")
    return rest(
        "hba_work",
        t,
        "PATCH" if record_id else "POST",
        body.model_dump(mode="json"),
        query="id=eq." + uid(record_id) if record_id else "",
        representation=True,
    )


@app.post("/api/work/{record_id}/notes")
def add_work_note(record_id: str, body: WorkNote, req: Request):
    t, _ = board(req)
    if body.flag not in {"progress", "incomplete", "defect", "resolved", "accepted"}:
        raise HTTPException(400, "Invalid work flag.")
    d = body.model_dump()
    d["work_id"] = uid(record_id)
    return rest("hba_work_notes", t, "POST", d, representation=True)[0]


class MemberChange(BaseModel):
    role: str
    household_uid: str | None = None


@app.put("/api/members/{record_id}")
def update_member(record_id: str, body: MemberChange, req: Request):
    t, m = board(req)
    if body.household_uid and body.household_uid not in VALID:
        raise HTTPException(400, "Invalid mapped household.")
    if body.role not in {"pending", "resident", "board", "suspended"} or (
        body.role == "board" and m["role"] != "admin"
    ):
        raise HTTPException(403, "Administrator required for board permissions.")
    rest(
        "rpc/hba_manage_member",
        t,
        "POST",
        {
            "member_id": uid(record_id),
            "new_role": body.role,
            "new_household": body.household_uid,
        },
    )
    return {"saved": True}


# Temporary passwords: three short nautical words and four digits, readable aloud over the phone. Never logged or stored.
TEMP_WORDS = [
    "harbor",
    "tide",
    "jetty",
    "anchor",
    "buoy",
    "sail",
    "marsh",
    "dune",
    "gull",
    "shell",
    "surf",
    "pier",
    "cove",
    "kelp",
    "reef",
    "mast",
    "keel",
    "ferry",
    "canal",
    "island",
    "beach",
    "breeze",
    "pilgrim",
    "algelo",
    "worrall",
    "glen",
]


def temp_password():
    words = [secrets.choice(TEMP_WORDS).capitalize() for _ in range(3)]
    return "-".join(words) + "-" + f"{secrets.randbelow(10000):04d}"


@app.delete("/api/members/{record_id}")
def delete_member(record_id: str, req: Request):
    """Board/admin: remove a resident's login and household links. Their records stay, attributed as a former resident."""
    t, m = board(req)
    if uid(record_id) == m["id"]:
        raise HTTPException(400, "You cannot delete your own account.")
    result = rest("rpc/hba_delete_member", t, "POST", {"target": uid(record_id)})
    return result or {"deleted": True}


@app.post("/api/members/{record_id}/reset-password")
def reset_member_password(record_id: str, req: Request):
    """Board/admin: issue a one-time temporary password, shown once to the board member. The resident must choose a new one at sign-in."""
    t, m = board(req)
    if uid(record_id) == m["id"]:
        raise HTTPException(400, "Use Change password for your own account.")
    temp = temp_password()
    result = (
        rest(
            "rpc/hba_reset_password",
            t,
            "POST",
            {"target": uid(record_id), "new_password": temp},
        )
        or {}
    )
    result["temporary_password"] = temp
    return result


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=10, max_length=200)


@app.post("/api/account/password")
def change_password(body: PasswordChange, req: Request):
    """Signed-in member changes their own password: the current (or temporary) password is checked first."""
    rate(req)
    s, m = read_session(req)
    if body.new_password == body.current_password:
        raise HTTPException(
            400, "Choose a new password that is different from the current one."
        )
    if (
        body.new_password.lower()
        in {m.get("email", "").lower(), "hamiltonbeach", "hamilton beach"}
        or len(set(body.new_password)) < 4
    ):
        raise HTTPException(400, "Choose a longer, less predictable password.")
    # Verify the current password against Supabase Auth before changing anything.
    try:
        check = sb(
            "POST",
            "/auth/v1/token?grant_type=password",
            json={"email": m["email"], "password": body.current_password},
        ).json()
    except HTTPException:
        raise HTTPException(400, "The current password is not correct.")
    try:
        sb("POST", "/auth/v1/logout?scope=local", check.get("access_token"))
    except HTTPException:
        pass
    sb("PUT", "/auth/v1/user", s["token"], json={"password": body.new_password})
    rest("rpc/hba_password_changed", s["token"], "POST", {})
    return {"changed": True}


@app.post("/api/publish/{kind}/{record_id}")
def publish(kind: str, record_id: str, req: Request):
    t, _ = board(req)
    table = {
        "photo": "hba_photos",
        "history": "hba_house_history",
        "storm": "hba_storm_memories",
    }.get(kind)
    if not table:
        raise HTTPException(400, "Invalid publication type.")
    return rest(
        table,
        t,
        "PATCH",
        {"status": "published"},
        "id=eq." + uid(record_id),
        representation=True,
    )


async def read_file(file, maximum):
    data = await file.read(maximum + 1)
    if not data or len(data) > maximum:
        raise HTTPException(400, "File is empty or exceeds the upload limit.")
    return data


@app.post("/api/documents")
async def document_upload(
    req: Request,
    background: BackgroundTasks,
    title: str = Form(...),
    category: str = Form(...),
    document_year: int | None = Form(None),
    description: str = Form(""),
    file: UploadFile = File(...),
):
    t, m = board(req)
    if (
        category
        not in {
            "budget",
            "minutes",
            "governing",
            "history",
            "permit",
            "contract",
            "other",
        }
        or not 1 <= len(title.strip()) <= 180
        or len(description) > 12000
    ):
        raise HTTPException(400, "Check the document title and category.")
    if document_year is not None and not 1800 <= document_year <= 2200:
        raise HTTPException(400, "Invalid document year.")
    raw = await read_file(file, 8 * 1024 * 1024)
    digest = hashlib.sha256(raw).hexdigest()
    prior = rest(
        "hba_document_intakes", t, query="select=document_id&file_sha256=eq." + digest
    )
    if prior:
        existing = rest("hba_documents", t, query="id=eq." + prior[0]["document_id"])
        if existing:
            return {**existing[0], "already_archived": True}
    import asyncio

    pdf, suffix, mime = await asyncio.to_thread(
        document_intake.prepare_file, raw, file.filename or "document.pdf"
    )
    rid = str(uuid4())
    path = f"documents/{rid}.pdf"
    # Store bytes first; a failed metadata insert leaves an inaccessible orphan,
    # never a broken row visible as a successful document.
    sb(
        "POST",
        "/storage/v1/object/hba-archive/" + path,
        t,
        content=pdf,
        headers={"Content-Type": "application/pdf"},
    )
    row = {
        "id": rid,
        "title": title.strip(),
        "category": category,
        "document_year": document_year,
        "description": description,
        "file_path": path,
        "original_name": Path(file.filename or "document.pdf").name[:200],
        "audience": "board",
        "source_sha256": digest,
    }
    if suffix != ".pdf":
        original = f"documents/{rid}/original{suffix}"
        sb(
            "POST",
            "/storage/v1/object/hba-archive/" + original,
            t,
            content=raw,
            headers={"Content-Type": mime},
        )
        row["original_path"] = original
    saved = rest("hba_documents", t, "POST", row, representation=True)[0]
    try:
        document_intake.enqueue(saved, t, background, digest)
    except HTTPException:
        return {**saved, "intake_unavailable": True}
    return saved


@app.post("/api/photos")
async def photo_upload(
    req: Request,
    kind: str = Form(...),
    parent_id: str = Form(...),
    caption: str = Form(""),
    credit: str = Form(""),
    consent: str = Form(...),
    file: UploadFile = File(...),
):
    t, m = require(req)
    if consent != "yes":
        raise HTTPException(400, "Confirm you have permission to share this photo.")
    field = {
        "event": "event_id",
        "history": "history_id",
        "work": "work_id",
        "issue": "issue_id",
        "storm": "storm_id",
    }.get(kind)
    if not field or (kind == "work" and m["role"] not in {"board", "admin"}):
        raise HTTPException(403, "Not permitted for this photo collection.")
    parent_id = uid(parent_id)
    if len(caption) > 2000 or len(credit) > 200:
        raise HTTPException(400, "Caption or credit is too long.")
    raw = await read_file(file, 6 * 1024 * 1024)
    try:
        with Image.open(io.BytesIO(raw)) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError()
            if image.width * image.height > 24_000_000:
                raise ValueError()
            image.load()
            clean = ImageOps.exif_transpose(image).convert("RGB")
            clean.thumbnail((2400, 2400))
            output = io.BytesIO()
            clean.save(output, "JPEG", quality=87, optimize=True)
            raw = output.getvalue()
    except (UnidentifiedImageError, ValueError, OSError, Image.DecompressionBombError):
        raise HTTPException(
            400, "Choose a JPEG, PNG or WebP photo up to 6 MB and 24 megapixels."
        )
    rid = str(uuid4())
    path = f"photos/{m['id']}/{rid}.jpg"
    data = {
        "id": rid,
        field: parent_id,
        "caption": caption,
        "credit": credit,
        "file_path": path,
        "status": "published" if m["role"] in {"board", "admin"} else "pending",
    }
    # RLS requires the owner-bound metadata before the object is inserted.
    if kind == "issue" and m["role"] == "resident":
        rest("hba_photos", t, "POST", data)
        row = {"id": rid, "status": "pending"}
    else:
        row = rest("hba_photos", t, "POST", data, representation=True)[0]
    try:
        sb(
            "POST",
            "/storage/v1/object/hba-archive/" + path,
            t,
            content=raw,
            headers={"Content-Type": "image/jpeg"},
        )
        if data["status"] == "pending" and kind != "issue":
            # One alert per person, collection and ten-minute window, so a batch of photos does not ring ten times.
            notify_admin(
                t,
                "photo",
                "Photographs to review",
                f"{m.get('display_name') or m['email']} added one or more photographs to review{(' — “'+caption[:80]+'”') if caption else ''}.",
                dedupe=f"photo:{m['id']}:{parent_id}:{int(time.time() // 600)}",
            )
    except HTTPException:
        # No resident/board deletion bypass: failed metadata remains visible to
        # the board for administrator cleanup, explicitly flagged in the UI.
        raise HTTPException(
            503,
            "Photo file did not finish uploading. No image was saved; ask the administrator to remove the empty entry before retrying.",
        )
    return row


@app.get("/api/files/{kind}/{record_id}")
def read_content(kind: str, record_id: str, req: Request):
    t, _ = require(req)
    table = {
        "bid": "hba_bid_files",
        "photo": "hba_photos",
        "document": "hba_documents",
        "original": "hba_documents",
        "newsletter": "hba_newsletters",
        "newsletter-original": "hba_newsletters",
        "minutes": "hba_meeting_minutes",
    }.get(kind)
    if not table:
        raise HTTPException(404, "File not found.")
    rows = rest(table, t, query="id=eq." + uid(record_id) + "&select=*")
    if not rows:
        raise HTTPException(404, "File not found or permission denied.")
    row = rows[0]
    path = (
        row.get("original_path")
        if kind in {"original", "newsletter-original"}
        else row["file_path"]
    )
    if not path:
        raise HTTPException(404, "No file of that format is stored for this record.")
    content = sb("GET", "/storage/v1/object/authenticated/hba-archive/" + path, t)
    ext, mime = (
        ("jpg", "image/jpeg")
        if kind == "photo"
        else (
            ("doc", "application/msword")
            if kind in {"original", "newsletter-original"}
            else ("pdf", "application/pdf")
        )
    )
    if kind == "original":
        suffix = Path(path).suffix.lower()
        ext = suffix.lstrip(".")
        mime = document_intake.MIMES.get(suffix, "application/msword")
    return Response(
        content.content,
        media_type=mime,
        headers={
            "Content-Disposition": (
                "attachment"
                if kind in {"original", "newsletter-original"}
                else "inline"
            )
            + '; filename="HBA-'
            + uid(record_id)
            + "."
            + ext
            + '"'
        },
    )


@app.delete("/api/records/{kind}/{record_id}")
def delete_record(kind: str, record_id: str, req: Request):
    t, member = require(req, ("admin",))
    if kind == "dues-receipt":
        if not rest("rpc/hba_remove_dues_receipt", t, "POST", {"p_id": uid(record_id)}):
            raise HTTPException(404, "Receipt not found.")
        return {
            "deleted": True,
            "notice": "Household receipt reversed and dues status recalculated. The income entry remains; review it separately.",
        }
    if kind == "research-report":
        deleted = rest(
            "rpc/hba_admin_delete_research_report", t, "POST", {"p_id": uid(record_id)}
        )
        if not deleted:
            raise HTTPException(404, "Record not found.")
        return {"deleted": True}
    table = {
        "bid": "hba_bids",
        "bid-file": "hba_bid_files",
        "bid-request": "hba_bid_requests",
        "document-fact": "hba_document_facts",
        "photo": "hba_photos",
        "document": "hba_documents",
        "history": "hba_house_history",
        "storm": "hba_storm_memories",
        "work": "hba_work",
        "work-note": "hba_work_notes",
        "event": "hba_events",
        "series": "hba_series",
        "issue": "hba_issues",
        "decision": "hba_decisions",
        "officeholder": "hba_officeholders",
        "meeting": "hba_meetings",
        "agenda": "hba_agenda_items",
        "payment-report": "hba_payment_reports",
        "advisory": "hba_public_advisories",
        "newsletter": "hba_newsletters",
        "minutes": "hba_meeting_minutes",
        "sms-draft": "hba_sms_drafts",
        "vote": "hba_votes",
        "volunteer-task": "hba_volunteer_tasks",
        "volunteer-signup": "hba_volunteer_signups",
        "register": "hba_check_register",
        "research-report": "hba_research_reports",
        "payer-household": "hba_payer_households",
        "bank-match": "hba_bank_matches",
        "bank-summary": "hba_bank_summaries",
        "bank-transaction": "hba_bank_transactions",
        "bank-import": "hba_bank_imports",
        "bank-account": "hba_bank_accounts",
    }.get(kind)
    if not table:
        raise HTTPException(400, "Unknown record type.")
    query = "id=eq." + uid(record_id)
    rows = rest(table, t, query=query + "&select=*")
    if not rows:
        raise HTTPException(404, "Record not found.")
    if kind == "bid" and (
        rest(
            "hba_bid_files",
            t,
            query="bid_id=eq." + uid(record_id) + "&select=id&limit=1",
        )
        or rest(
            "hba_bid_reviews",
            t,
            query="bid_id=eq." + uid(record_id) + "&select=id&limit=1",
        )
    ):
        raise HTTPException(
            409,
            "This proposal has attachments or review history. Keep it and mark it withdrawn to preserve the decision trail.",
        )
    if kind == "bid-request" and rest(
        "hba_bids", t, query="request_id=eq." + uid(record_id) + "&select=id&limit=1"
    ):
        raise HTTPException(
            409, "This request has proposals. Close it instead to preserve its history."
        )
    if kind == "document" and rest(
        "hba_document_suggestions",
        t,
        query="document_id=eq."
        + uid(record_id)
        + "&state=eq.applied&select=id&limit=1",
    ):
        raise HTTPException(
            409,
            "This source supports reviewed records. Keep it in the archive to preserve their evidence.",
        )
    if kind == "document" and rest(
        "hba_decisions", t, query="minutes_id=eq." + uid(record_id) + "&select=id"
    ):
        raise HTTPException(
            409,
            "This document supports a decision record. Preserve it or remove the dependent decision first; no file was deleted.",
        )
    if kind == "meeting":
        if rest(
            "hba_agenda_items",
            t,
            query="meeting_id=eq." + uid(record_id) + "&select=id",
        ):
            raise HTTPException(
                409, "Remove or move linked agenda items before deleting the meeting."
            )
        rest("hba_meeting_access", t, "DELETE", query=query)
    if kind == "volunteer-task" and rest(
        "hba_volunteer_signups", t, query="task_id=eq." + uid(record_id) + "&select=id"
    ):
        raise HTTPException(
            409,
            "This task has signup history. Close or complete it to preserve the record; no record was deleted.",
        )
    if rows[0].get("file_path"):
        sb(
            "DELETE",
            "/storage/v1/object/hba-archive",
            t,
            json={
                "prefixes": [
                    p for p in [rows[0]["file_path"], rows[0].get("original_path")] if p
                ]
            },
        )
    if rows[0].get("photo_path"):
        sb(
            "DELETE",
            "/storage/v1/object/hba-archive",
            t,
            json={"prefixes": [rows[0]["photo_path"]]},
        )
    rest(table, t, "DELETE", query=query)
    return {"deleted": True}


class Newsletter(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    issue_date: date
    body: str = Field(default="", max_length=40000)
    issue_precision: str = "day"


@app.post("/api/newsletters")
@app.put("/api/newsletters/{record_id}")
def save_newsletter(body: Newsletter, req: Request, record_id: str | None = None):
    t, _ = newsletter_editor(req)
    if not body.title.strip():
        raise HTTPException(400, "Enter an issue title.")
    if body.issue_precision not in {"day", "month"}:
        raise HTTPException(400, "Choose an exact-day or month-only issue date.")
    if record_id:
        rows = rest("hba_newsletters", t, query="id=eq." + uid(record_id))
        if not rows:
            raise HTTPException(404, "Newsletter not found.")
        if rows[0]["state"] != "draft":
            raise HTTPException(
                409, "Return the issue to draft before editing published content."
            )
    result = rest(
        "hba_newsletters",
        t,
        "PATCH" if record_id else "POST",
        {**body.model_dump(mode="json"), "title": body.title.strip()},
        query="id=eq." + uid(record_id) if record_id else "",
        representation=True,
    )
    return result[0] if result else None


class NewsletterState(BaseModel):
    state: str


@app.put("/api/newsletters/{record_id}/state")
def newsletter_state(record_id: str, body: NewsletterState, req: Request):
    t, _ = newsletter_editor(req)
    if body.state not in {"draft", "published"}:
        raise HTTPException(400, "Choose draft or published.")
    rows = rest("hba_newsletters", t, query="id=eq." + uid(record_id))
    if not rows:
        raise HTTPException(404, "Newsletter not found.")
    if body.state == "published" and not (
        rows[0]["body"].strip() or rows[0]["file_path"]
    ):
        raise HTTPException(
            400, "Add newsletter text or a readable PDF before publishing."
        )
    return rest(
        "hba_newsletters",
        t,
        "PATCH",
        {"state": body.state},
        query="id=eq." + uid(record_id),
        representation=True,
    )[0]


@app.post("/api/newsletters/{record_id}/file")
async def newsletter_file(
    record_id: str,
    req: Request,
    background: BackgroundTasks,
    file: UploadFile = File(...),
):
    t, _ = newsletter_editor(req)
    rid = uid(record_id)
    rows = rest("hba_newsletters", t, query="id=eq." + rid)
    if not rows or rows[0]["state"] != "draft":
        raise HTTPException(409, "Save a draft before attaching or replacing a PDF.")
    raw = await read_file(file, 8 * 1024 * 1024)
    try:
        if not raw.startswith(b"%PDF-"):
            raise ValueError()
        doc = fitz.open(stream=raw, filetype="pdf")
        if doc.is_encrypted or doc.page_count < 1:
            raise ValueError()
        doc.close()
    except Exception:
        raise HTTPException(400, "Upload a readable, unencrypted PDF, up to 8 MB.")
    # Unique paths preserve previous files. Only administrator can physically delete.
    path = f"newsletters/{rid}/{uuid4()}.pdf"
    sb(
        "POST",
        "/storage/v1/object/hba-archive/" + path,
        t,
        content=raw,
        headers={"Content-Type": "application/pdf"},
    )
    saved = rest(
        "hba_newsletters",
        t,
        "PATCH",
        {
            "file_path": path,
            "original_name": Path(file.filename or "newsletter.pdf").name[:200],
        },
        query="id=eq." + rid,
        representation=True,
    )[0]
    try:
        source_id = document_intake.archive_intake_copy(
            raw,
            "Newsletter: " + saved["title"],
            Path(file.filename or "newsletter.pdf").name[:200],
            t,
            background,
        )
    except HTTPException:
        return {**saved, "intake_unavailable": True}
    return {**saved, "intake_document_id": source_id}


class SMSPreferences(BaseModel):
    phone: str = Field(min_length=10, max_length=30)
    topics: list[str] = Field(min_length=1, max_length=5)
    opted_in: bool
    consent: bool = False


@app.put("/api/sms/preferences")
def sms_preferences(body: SMSPreferences, req: Request):
    t, _ = require(req)
    digits = re.sub(r"\D", "", body.phone)
    if len(digits) == 10:
        digits = "1" + digits
    phone = "+" + digits
    if not re.fullmatch(r"\+1[2-9][0-9]{9}", phone):
        raise HTTPException(400, "Enter a valid 10-digit US mobile number.")
    topics = sorted(set(body.topics))
    if not set(topics) <= {"roads", "beach", "events", "speed_bumps", "general"}:
        raise HTTPException(400, "Choose the listed notification topics.")
    if body.opted_in and not body.consent:
        raise HTTPException(
            400, "Check the SMS consent box to sign up or change preferences."
        )
    rest(
        "rpc/hba_save_sms_preferences",
        t,
        "POST",
        {
            "p_phone": phone,
            "p_topics": topics,
            "p_opted_in": body.opted_in,
            "p_consent": body.consent,
        },
    )
    return {"saved": True, "delivery_ready": False, "opted_in": body.opted_in}


class SMSDraft(BaseModel):
    category: str
    message: str = Field(min_length=1, max_length=1000)


@app.post("/api/sms/drafts")
@app.put("/api/sms/drafts/{record_id}")
def sms_draft(body: SMSDraft, req: Request, record_id: str | None = None):
    t, _ = board(req)
    if (
        body.category not in {"roads", "beach", "events", "speed_bumps", "general"}
        or not body.message.strip()
    ):
        raise HTTPException(400, "Choose a topic and enter a message.")
    return rest(
        "hba_sms_drafts",
        t,
        "PATCH" if record_id else "POST",
        {"category": body.category, "message": body.message.strip()},
        query="id=eq." + uid(record_id) if record_id else "",
        representation=True,
    )


@app.post("/api/sms/send")
def sms_send(req: Request):
    board(req)
    raise HTTPException(
        503,
        "SMS delivery is disabled. Configure an approved sender, phone verification, unsubscribe handling and a reviewed send-confirmation flow first. No message was sent.",
    )


@app.get("/api/cleaning-plan")
def cleaning_plan(req: Request):
    t, _ = board(req)
    rows = rest("hba_cleaning_plan", t, query="select=*&id=eq.1")
    if not rows:
        raise HTTPException(404, "No private cleaning plan recorded.")
    p = rows[0]
    p["annual_amount"] = float(p["amount_per_cleaning"]) * p["cleanings_per_year"]
    p["total_amount"] = p["annual_amount"] * p["seasons"]
    return p


class VolunteerTask(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    category: str
    description: str = Field(min_length=1, max_length=12000)
    location: str = Field(default="", max_length=300)
    task_date: date | None = None
    task_time: str | None = None
    capacity: int = Field(default=10, ge=1, le=500)


@app.get("/api/volunteers/public")
def volunteer_public():
    rows = rest(
        "hba_volunteer_tasks",
        None,
        query="select=id,title,category,description,location,task_date,task_time,capacity,state,photo_path,updated_at&order=task_date.asc.nullslast,created_at.desc",
    )
    return {"tasks": rows, "counts": rest("rpc/hba_volunteer_counts", None, "POST", {})}


@app.post("/api/volunteers")
@app.put("/api/volunteers/{record_id}")
def volunteer_save(body: VolunteerTask, req: Request, record_id: str | None = None):
    t, _ = board(req)
    if (
        body.category not in {"event", "maintenance"}
        or not body.title.strip()
        or not body.description.strip()
    ):
        raise HTTPException(
            400, "Enter a title, task description and event/maintenance category."
        )
    if body.task_time and not re.fullmatch(
        r"(?:[01]\d|2[0-3]):[0-5]\d", body.task_time
    ):
        raise HTTPException(400, "Use a local time in HH:MM format.")
    if record_id:
        rows = rest("hba_volunteer_tasks", t, query="id=eq." + uid(record_id))
        if not rows or rows[0]["state"] != "draft":
            raise HTTPException(
                409, "Return the task to draft before changing public content."
            )
    result = rest(
        "hba_volunteer_tasks",
        t,
        "PATCH" if record_id else "POST",
        body.model_dump(mode="json"),
        query="id=eq." + uid(record_id) if record_id else "",
        representation=True,
    )
    return result[0] if result else None


@app.put("/api/volunteers/{record_id}/state")
def volunteer_state(record_id: str, body: NewsletterState, req: Request):
    t, _ = board(req)
    if body.state not in {"draft", "published", "closed", "complete"}:
        raise HTTPException(400, "Choose a valid task state.")
    rows = rest(
        "hba_volunteer_tasks",
        t,
        "PATCH",
        {"state": body.state},
        query="id=eq." + uid(record_id),
        representation=True,
    )
    if not rows:
        raise HTTPException(404, "Task not found.")
    return rows[0]


@app.post("/api/volunteers/{record_id}/photo")
async def volunteer_photo(record_id: str, req: Request, file: UploadFile = File(...)):
    t, _ = board(req)
    rid = uid(record_id)
    rows = rest("hba_volunteer_tasks", t, query="id=eq." + rid)
    if not rows or rows[0]["state"] != "draft":
        raise HTTPException(
            409, "Save a draft before adding or replacing its public photo."
        )
    raw = await read_file(file, 8 * 1024 * 1024)
    try:
        img = Image.open(io.BytesIO(raw))
        if img.format not in {"JPEG", "PNG", "WEBP"}:
            raise ValueError()
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((1800, 1800))
        out = io.BytesIO()
        img.save(out, "JPEG", quality=88)
    except Exception:
        raise HTTPException(
            400, "Choose a readable JPEG, PNG or WebP photo, up to 8 MB."
        )
    path = f"volunteers/{rid}/{uuid4()}.jpg"
    sb(
        "POST",
        "/storage/v1/object/hba-archive/" + path,
        t,
        content=out.getvalue(),
        headers={"Content-Type": "image/jpeg"},
    )
    return rest(
        "hba_volunteer_tasks",
        t,
        "PATCH",
        {"photo_path": path},
        query="id=eq." + rid,
        representation=True,
    )[0]


@app.get("/api/volunteers/{record_id}/photo")
def volunteer_photo_read(record_id: str, req: Request):
    # Public requests use the anon token. A board preview can also read its draft.
    t = None
    if req.headers.get("x-hba-proof"):
        t, _ = require(req)
    rows = rest(
        "hba_volunteer_tasks", t, query="id=eq." + uid(record_id) + "&select=photo_path"
    )
    if not rows or not rows[0]["photo_path"]:
        raise HTTPException(404, "No task photo available.")
    raw = sb("GET", "/storage/v1/object/hba-archive/" + rows[0]["photo_path"], t)
    return Response(raw.content, media_type="image/jpeg")


class VolunteerSignup(BaseModel):
    join: bool
    note: str = Field(default="", max_length=1000)


@app.put("/api/volunteers/{record_id}/signup")
def volunteer_signup(record_id: str, body: VolunteerSignup, req: Request):
    t, m = require(req)
    rest(
        "rpc/hba_volunteer_signup",
        t,
        "POST",
        {"p_task": uid(record_id), "p_join": body.join, "p_note": body.note},
    )
    if body.join and m["role"] != "admin":
        task = rest(
            "hba_volunteer_tasks", t, query="id=eq." + uid(record_id) + "&select=title"
        )
        notify_admin(
            t,
            "volunteer",
            "Volunteer signed up",
            f"{m.get('display_name') or m['email']} joined “{task[0]['title'] if task else 'a task'}”.",
        )
    return {"saved": True, "signed_up": body.join}


class VolunteerEmailPreference(BaseModel):
    opted_in: bool


@app.put("/api/volunteer-email-preferences")
def volunteer_email_preference(body: VolunteerEmailPreference, req: Request):
    t, m = require(req)
    old = rest("hba_volunteer_email_preferences", t, query="member_id=eq." + m["id"])
    rest(
        "hba_volunteer_email_preferences",
        t,
        "PATCH" if old else "POST",
        body.model_dump() if old else {"member_id": m["id"], **body.model_dump()},
        query="member_id=eq." + m["id"] if old else "",
    )
    return {"saved": True, "opted_in": body.opted_in}


def volunteer_email_payload(record_id, t):
    rows = rest("hba_volunteer_tasks", t, query="id=eq." + uid(record_id))
    if not rows or rows[0]["state"] != "published":
        raise HTTPException(
            409,
            "Publish and review the task before preparing a volunteer email request.",
        )
    task = rows[0]
    prefs = rest(
        "hba_volunteer_email_preferences", t, query="opted_in=eq.true&select=member_id"
    )
    allowed = {p["member_id"] for p in prefs}
    recipients = [
        {"id": m["id"], "name": m["display_name"], "email": m["email"]}
        for m in rest(
            "hba_members",
            t,
            query="role=in.(resident,board,admin)&select=id,email,display_name",
        )
        if m["id"] in allowed
    ]
    when = str(task["task_date"] or "Date to be arranged") + (
        (" at " + task["task_time"][:5] + " Eastern") if task["task_time"] else ""
    )
    body = f"Hamilton Beach Association is requesting volunteers.\n\n{task['title']}\n\n{task['description']}\n\nWhere: {task['location'] or 'To be arranged'}\nWhen: {when}\nVolunteers requested: {task['capacity']}\n\nView the HBA app's Volunteer board to sign up or withdraw:\n{app_url()}\n\nYou are receiving this request because you opted in to HBA volunteer emails. You can opt out in the app's Volunteer section.\n"
    return task, {
        "subject": "HBA volunteers needed: " + task["title"],
        "body": body,
        "recipients": recipients,
        "has_photo": bool(task["photo_path"]),
        "delivery": "draft_only",
    }


@app.get("/api/volunteers/{record_id}/email-preview")
def volunteer_email_preview(record_id: str, req: Request):
    t, _ = board(req)
    return volunteer_email_payload(record_id, t)[1]


@app.post("/api/volunteers/{record_id}/email-draft")
def volunteer_email_draft(record_id: str, req: Request):
    t, _ = board(req)
    task, p = volunteer_email_payload(record_id, t)
    if not p["recipients"]:
        raise HTTPException(
            409, "No approved members have opted in to volunteer emails yet."
        )
    msg = EmailMessage(policy=SMTP)
    msg["Subject"] = p["subject"]
    msg["To"] = "undisclosed-recipients:;"
    msg["Bcc"] = ", ".join(r["email"] for r in p["recipients"])
    msg["X-Unsent"] = "1"
    msg.set_content(p["body"])
    if task["photo_path"]:
        photo = sb(
            "GET",
            "/storage/v1/object/authenticated/hba-archive/" + task["photo_path"],
            t,
        )
        msg.add_attachment(
            photo.content,
            maintype="image",
            subtype="jpeg",
            filename="HBA-volunteer-task.jpg",
        )
    return Response(
        msg.as_bytes(),
        media_type="message/rfc822",
        headers={
            "Content-Disposition": 'attachment; filename="HBA-volunteer-request.eml"'
        },
    )


def finance_editor(req):
    t, m = board(req)
    if not rest("rpc/hba_can_edit_finance", t, "POST", {}):
        raise HTTPException(
            403, "The linked, in-term Treasurer account or administrator is required."
        )
    return t, m


@app.get("/api/finance/{year}")
def finance_data(year: int, req: Request):
    t, _ = board(req)
    year_ok(year)
    rows = rest(
        "hba_check_register",
        t,
        query=f"select=*&transaction_date=gte.{year}-01-01&transaction_date=lt.{year+1}-01-01&order=transaction_date.desc,created_at.desc",
    )
    budgets = rest("hba_category_budgets", t, query=f"select=*&year=eq.{year}")
    categories = rest(
        "hba_finance_categories", t, query="select=*&order=direction.asc,label.asc"
    )
    summary = []
    for cat in categories:
        actual = sum(
            (
                Decimal(str(r["amount"]))
                for r in rows
                if r["category_code"] == cat["code"] and not r["voided"]
            ),
            Decimal(0),
        )
        cleared = sum(
            (
                Decimal(str(r["amount"]))
                for r in rows
                if r["category_code"] == cat["code"]
                and r["cleared"]
                and not r["voided"]
            ),
            Decimal(0),
        )
        budget = next((b for b in budgets if b["category_code"] == cat["code"]), None)
        planned = Decimal(str(budget["amount"])) if budget else None
        summary.append(
            {
                **cat,
                "actual": str(actual),
                "cleared": str(cleared),
                "planned": str(planned) if planned is not None else None,
                "variance": (
                    str(
                        (planned - actual)
                        if cat["direction"] == "expense"
                        else (actual - planned)
                    )
                    if planned is not None
                    else None
                ),
                "basis": budget["basis"] if budget else None,
            }
        )
    return {
        "year": year,
        "rows": rows,
        "budgets": budgets,
        "categories": categories,
        "summary": summary,
        "bank_accounts": rest(
            "hba_bank_accounts", t, query="select=id,label,last_four"
        ),
        "audit": rest(
            "hba_finance_audit", t, query="select=*&order=changed_at.desc&limit=100"
        ),
        "dues_tracking": dues_receipts(req),
        "refreshed_at": datetime.now(timezone.utc).isoformat(),
    }


class RegisterEntry(BaseModel):
    transaction_date: date
    direction: str
    category_code: str = Field(max_length=60)
    payee: str = Field(min_length=1, max_length=180)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    reference: str = Field(default="", max_length=80)
    memo: str = Field(default="", max_length=3000)
    cleared: bool = False
    voided: bool = False
    bank_account_id: UUID | None = None


@app.post("/api/register")
@app.put("/api/register/{record_id}")
def save_register(body: RegisterEntry, req: Request, record_id: str | None = None):
    t, _ = finance_editor(req)
    if body.direction not in {"income", "expense"} or not body.payee.strip():
        raise HTTPException(400, "Choose income/expense and enter the payee or payer.")
    return rest(
        "hba_check_register",
        t,
        "PATCH" if record_id else "POST",
        body.model_dump(mode="json"),
        query="id=eq." + uid(record_id) if record_id else "",
        representation=True,
    )


class CategoryBudget(BaseModel):
    category_code: str = Field(max_length=60)
    amount: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    basis: str
    source_note: str = Field(default="", max_length=2000)


@app.put("/api/category-budgets/{year}")
def save_category_budget(year: int, body: CategoryBudget, req: Request):
    t, _ = finance_editor(req)
    year_ok(year)
    if body.basis not in {"draft", "adopted"}:
        raise HTTPException(
            400, "Label the budget as draft or adopted with a supporting source."
        )
    if body.basis == "adopted" and not body.source_note.strip():
        raise HTTPException(
            400, "Cite the adopted budget or minutes before marking this line adopted."
        )
    code = body.category_code
    if not re.fullmatch(r"[a-z_]+", code):
        raise HTTPException(400, "Choose a listed budget category.")
    query = f"year=eq.{year}&category_code=eq.{code}"
    rows = rest("hba_category_budgets", t, query=query)
    values = body.model_dump(mode="json")
    if rows:
        values.pop("category_code")
    else:
        values["year"] = year
    return rest(
        "hba_category_budgets",
        t,
        "PATCH" if rows else "POST",
        values,
        query=query if rows else "",
        representation=True,
    )


class ResearchQuery(BaseModel):
    question: str = Field(min_length=3, max_length=600)
    generate: bool = False
    include_archive: bool = True


def research_corpus(t, include_archive):
    """Explicit allowlist: never searches sessions, credentials, dues or register."""
    entries = []
    limits = []
    ledger = json.loads((APP_ROOT / "property-history.json").read_text())
    for p in ledger["properties"]:
        for i in p["instruments"]:
            if i["role"] == "Rejected / unrelated":
                continue
            text = "\n".join(
                str(i.get(k) or "")
                for k in [
                    "date",
                    "transfer",
                    "lot_match",
                    "quote",
                    "notes",
                    "provenance",
                ]
            )
            if text.strip():
                entries.append(
                    {
                        "title": p["address"] + " · " + i["ref"],
                        "text": text,
                        "kind": "deed",
                        "property_index": p["index"],
                        "ref": i["ref"],
                        "scan": i["scans"][0] if i["scans"] else None,
                    }
                )
    for path in (
        sorted(APP_ROOT.glob("*.md"))
        + sorted((APP_ROOT / "ch91").glob("*.md"))
        + sorted((APP_ROOT / "drains").glob("*.md"))
    ):
        text = path.read_text()
        for n in range(0, len(text), 2400):
            entries.append(
                {
                    "title": path.stem.replace("-", " ").title(),
                    "text": text[n : n + 2600],
                    "kind": "local_report",
                    "path": str(path.relative_to(APP_ROOT)),
                    "section": n // 2400 + 1,
                }
            )
    if include_archive:
        documents = rest(
            "hba_documents",
            t,
            query="select=id,title,file_path&audience=eq.members&order=created_at.desc&limit=20",
        )
        newsletters = rest(
            "hba_newsletters",
            t,
            query="select=id,title,file_path&state=eq.published&order=issue_date.desc&limit=20",
        )
        for kind, rows in [("document", documents), ("newsletter", newsletters)]:
            for row in rows:
                if not row["file_path"]:
                    continue
                try:
                    raw = sb(
                        "GET",
                        "/storage/v1/object/authenticated/hba-archive/"
                        + row["file_path"],
                        t,
                    )
                    doc = fitz.open(stream=raw.content, filetype="pdf")
                    for n, page in enumerate(doc):
                        text = page.get_text()
                        if text.strip():
                            for start in range(0, len(text), 2400):
                                entries.append(
                                    {
                                        "title": row["title"],
                                        "text": text[start : start + 2600],
                                        "kind": kind,
                                        "record_id": row["id"],
                                        "page": n + 1,
                                    }
                                )
                    if not any(e.get("record_id") == row["id"] for e in entries):
                        limits.append(
                            row["title"]
                            + ": image-only or no extractable text; OCR not performed."
                        )
                    doc.close()
                except Exception:
                    limits.append(
                        row["title"] + ": could not extract authorized PDF text."
                    )
        limits.append(
            "Archive scope is the latest 20 documents and latest 20 published newsletters, plus collected deed transcriptions and existing research reports. Unpublished newsletter drafts, individual dues, check registers, issue notes and raw private files are excluded."
        )
    return entries, limits


@app.post("/api/research")
def research(body: ResearchQuery, req: Request):
    t, m = require(req)
    entries, limits = research_corpus(t, body.include_archive)
    stop = {
        "what",
        "when",
        "where",
        "which",
        "were",
        "have",
        "does",
        "about",
        "from",
        "with",
        "that",
        "this",
        "their",
        "there",
        "history",
        "please",
        "report",
        "create",
        "research",
    }
    words = {
        w.lower()
        for w in re.findall(r"[A-Za-z0-9]+", body.question)
        if len(w) > 2 and w.lower() not in stop
    }
    scored = []
    for e in entries:
        text = (e["title"] + " " + e["text"]).lower()
        score = sum(
            min(5, text.count(w)) * (3 if w in e["title"].lower() else 1) for w in words
        )
        if score:
            scored.append((score, e))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    sources = [
        {**e, "id": "S" + str(n + 1), "text": e["text"][:2600]}
        for n, (_, e) in enumerate(scored[:10])
    ]
    result = {
        "question": body.question,
        "sources": sources,
        "limitations": limits,
        "total_text_chunks": len(entries),
        "draft": None,
    }
    if not body.generate or not sources:
        return result
    now = time.time()
    key = visitor(req) + "/ai-research"
    with lock:
        q = rates[key]
        while q and q[0] < now - 3600:
            q.popleft()
        if len(q) >= 6:
            raise HTTPException(
                429,
                "Limit of six AI report attempts per hour. Document search remains available.",
            )
        q.append(now)
    from research_ai import generate_report

    output = generate_report({"question": body.question, "sources": sources})
    result.update(output)
    saved = rest(
        "hba_research_reports",
        t,
        "POST",
        {"question": body.question, "report": result},
        representation=True,
    )
    result["saved_id"] = saved[0]["id"]
    result["created_at"] = saved[0]["created_at"]
    return result


class Issue(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    location: str = Field(default="", max_length=300)
    description: str = Field(min_length=1, max_length=12000)
    category: str = "general"


class IssueReview(BaseModel):
    state: str
    board_note: str = Field(default="", max_length=12000)


@app.post("/api/issues")
def add_issue(body: Issue, req: Request):
    t, m = require(req)
    if body.category not in {
        "roads",
        "drainage",
        "beach",
        "safety",
        "common_area",
        "general",
    }:
        raise HTTPException(400, "Invalid issue category.")
    rid = str(uuid4())
    rest("hba_issues", t, "POST", {**body.model_dump(), "id": rid})
    if m["role"] != "admin":
        notify_admin(
            t,
            "issue",
            "Problem reported",
            f"{m.get('display_name') or m['email']}: “{body.title}” ({body.category.replace('_', ' ')}).",
        )
    return {"id": rid, "state": "pending_meeting"}


@app.put("/api/issues/{record_id}")
def review_issue(record_id: str, body: IssueReview, req: Request):
    t, _ = board(req)
    if body.state not in {
        "pending_meeting",
        "approved",
        "rejected",
        "further_review",
        "complete",
    }:
        raise HTTPException(400, "Invalid review state.")
    from datetime import datetime, timezone

    rest(
        "hba_issues",
        t,
        "PATCH",
        {**body.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()},
        query="id=eq." + uid(record_id),
    )
    return {"saved": True}


class Decision(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    meeting_date: date
    decision_type: str
    motion: str = Field(min_length=1, max_length=12000)
    recorded_outcome: str = "proposed"
    amount: float | None = Field(default=None, ge=0)
    governors_present: int | None = Field(default=None, ge=0, le=10)
    members_represented: int | None = Field(default=None, ge=0)
    votes_yes: int | None = Field(default=None, ge=0)
    votes_no: int | None = Field(default=None, ge=0)
    abstentions: int | None = Field(default=None, ge=0)
    review_notes: str = Field(default="", max_length=12000)
    minutes_id: UUID | None = None


@app.post("/api/decisions")
def record_decision(body: Decision, req: Request):
    t, _ = board(req)
    if body.decision_type not in {
        "board",
        "capital",
        "dues",
        "amendment",
        "emergency",
    } or body.recorded_outcome not in {"proposed", "approved", "rejected", "deferred"}:
        raise HTTPException(400, "Invalid decision classification.")
    return rest(
        "hba_decisions", t, "POST", body.model_dump(mode="json"), representation=True
    )[0]


class Officeholder(BaseModel):
    position: str = Field(max_length=100)
    member_name: str = Field(min_length=1, max_length=180)
    household_uid: str | None = None
    term_start: date | None = None
    term_end: date | None = None
    source_note: str = Field(default="", max_length=3000)
    member_id: UUID | None = None
    contact_phone: str = Field(default="", max_length=40)
    contact_email: str = Field(default="", max_length=254)
    winter_address: str = Field(default="", max_length=300)
    share_contact: bool = True


STREET_GOVERNORS = [
    "Pilgrim",
    "Algelo",
    "Worrall",
    "Surf",
    "Turner",
    "Glen",
    "Reynolds",
]
POSITIONS = [
    "President",
    "Vice President",
    "Secretary",
    "Treasurer",
    *[s + " Street Governor" for s in STREET_GOVERNORS],
    *[f"Governor at Large {n}" for n in range(1, 4)],
]
HOME_STREET = {
    p["uid"]: p.get("street") or p["address"].split(" ", 1)[-1]
    for p in homes["properties"]
}
HOME_ADDRESS = {p["uid"]: p["address"] for p in homes["properties"]}


def street_name(uid):
    """'PILGRIM AVE' -> 'Pilgrim'. Returns None when the household is not linked to a mapped parcel."""
    raw = HOME_STREET.get(uid or "")
    if not raw:
        return None
    first = raw.split()[0].title()
    return first


def governor_for(uid):
    """Which officeholder position represents this household under the bylaws (seven street governors)."""
    street = street_name(uid)
    if street in STREET_GOVERNORS:
        return {
            "position": street + " Street Governor",
            "street": street,
            "represented": True,
        }
    return {"position": None, "street": street, "represented": False}


def team_rows(token, include_private):
    rows = rest("hba_officeholders", token, query="select=*")
    out = []
    for r in rows:
        shown = r.get("share_contact", True) or include_private
        out.append(
            {
                "id": r["id"],
                "position": r["position"],
                "member_name": r["member_name"],
                "household_uid": r.get("household_uid"),
                "address": HOME_ADDRESS.get(r.get("household_uid") or ""),
                "term_start": r.get("term_start"),
                "term_end": r.get("term_end"),
                "source_note": r.get("source_note", ""),
                "member_id": r.get("member_id"),
                "share_contact": r.get("share_contact", True),
                "contact_phone": r.get("contact_phone", "") if shown else "",
                "contact_email": r.get("contact_email", "") if shown else "",
                "winter_address": r.get("winter_address", "") if shown else "",
            }
        )
    order = {p: i for i, p in enumerate(POSITIONS)}
    out.sort(key=lambda r: order.get(r["position"], 99))
    return out


@app.get("/api/team")
def team(req: Request):
    token, member = require(req)
    is_board = member["role"] in {"board", "admin"}
    households = [
        h["household_uid"]
        for h in rest(
            "hba_member_households",
            token,
            query="member_id=eq." + member["id"] + "&select=household_uid",
        )
    ]
    if member.get("household_uid") and member["household_uid"] not in households:
        households.insert(0, member["household_uid"])
    mine = []
    for uid in households:
        g = governor_for(uid)
        mine.append({"household_uid": uid, "address": HOME_ADDRESS.get(uid), **g})
    return {
        "positions": POSITIONS,
        "officeholders": team_rows(token, is_board),
        "my_households": mine,
        "board": is_board,
        "streets_without_governor": sorted(
            {
                (HOME_STREET.get(u) or "").title()
                for u in HOME_STREET
                if street_name(u) not in STREET_GOVERNORS and HOME_STREET.get(u)
            }
        ),
    }


class GovernorMessage(BaseModel):
    to_position: str = Field(max_length=100)
    subject: str = Field(min_length=1, max_length=180)
    body: str = Field(min_length=1, max_length=6000)


@app.post("/api/team/messages")
def send_governor_message(body: GovernorMessage, req: Request):
    token, member = require(req)
    if body.to_position not in POSITIONS:
        raise HTTPException(400, "Choose an officer or governor position.")
    holder = rest(
        "hba_officeholders",
        token,
        query="position=eq." + quote(body.to_position) + "&select=id",
    )
    row = {
        "from_member_id": member["id"],
        "to_officeholder_id": holder[0]["id"] if holder else None,
        "to_position": body.to_position,
        "subject": body.subject.strip(),
        "body": body.body.strip(),
    }
    saved = rest("hba_governor_messages", token, "POST", row, representation=True)[0]
    if member["role"] != "admin":
        notify_admin(
            token,
            "message",
            f"Message to the {body.to_position}",
            f"{member.get('display_name') or member['email']}: “{row['subject']}”.",
        )
    return {
        "saved": True,
        "message": saved,
        "delivered_in_app": True,
        "note": "Saved to the board inbox in this app. No email or text was sent automatically.",
    }


@app.get("/api/team/messages")
def list_governor_messages(req: Request):
    token, member = require(req)
    rows = rest(
        "hba_governor_messages", token, query="select=*&order=created_at.desc&limit=300"
    )
    members = (
        {
            m["id"]: m
            for m in rest(
                "hba_members",
                token,
                query="select=id,display_name,email,household_uid,role",
            )
        }
        if member["role"] in {"board", "admin"}
        else {}
    )
    for r in rows:
        m = members.get(r["from_member_id"]) if members else None
        r["from_name"] = (
            (m or {}).get("display_name")
            or ((m or {}).get("email") if m else None)
            or ("You" if r["from_member_id"] == member["id"] else "Resident")
        )
        if (m or {}).get("role") == "deleted":
            r["from_name"] += " (former resident)"
        r["from_address"] = (
            HOME_ADDRESS.get((m or {}).get("household_uid") or "") if m else None
        )
    mine_positions = (
        {
            o["position"]
            for o in rest(
                "hba_officeholders",
                token,
                query="member_id=eq." + member["id"] + "&select=position",
            )
        }
        if member["role"] in {"board", "admin"}
        else set()
    )
    return {
        "messages": rows,
        "my_positions": sorted(mine_positions),
        "board": member["role"] in {"board", "admin"},
    }


class GovernorMessageReview(BaseModel):
    state: str
    board_note: str = Field(default="", max_length=3000)


@app.put("/api/team/messages/{record_id}")
def review_governor_message(body: GovernorMessageReview, req: Request, record_id: str):
    t, _ = board(req)
    if body.state not in {"new", "read", "replied"}:
        raise HTTPException(400, "Invalid message state.")
    return rest(
        "hba_governor_messages",
        t,
        "PATCH",
        {
            "state": body.state,
            "board_note": body.board_note,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        query="id=eq." + uid(record_id),
        representation=True,
    )


@app.post("/api/officeholders")
@app.put("/api/officeholders/{record_id}")
def record_officeholder(body: Officeholder, req: Request, record_id: str | None = None):
    t, member = board(req)
    positions = set(POSITIONS)
    if body.position not in positions or (
        body.household_uid and body.household_uid not in VALID
    ):
        raise HTTPException(400, "Check the position and household.")
    if body.term_start and body.term_end and body.term_end < body.term_start:
        raise HTTPException(400, "Term end precedes its start.")
    if body.member_id:
        linked = rest(
            "hba_members", t, query="id=eq." + str(body.member_id) + "&select=role"
        )
        if not linked or linked[0]["role"] not in {"board", "admin"}:
            raise HTTPException(400, "Link an approved board account.")
    old = (
        rest("hba_officeholders", t, query="id=eq." + uid(record_id))
        if record_id
        else []
    )
    changed_access = (
        body.position in {"President", "Secretary"}
        and str(body.member_id or "") != str(old[0].get("member_id") or "")
        if old
        else body.position in {"President", "Secretary"} and body.member_id is not None
    )
    if changed_access and member["role"] != "admin":
        raise HTTPException(
            403,
            "Only the administrator may link a meeting-scheduler office to an account.",
        )
    return rest(
        "hba_officeholders",
        t,
        "PATCH" if record_id else "POST",
        body.model_dump(mode="json"),
        query="id=eq." + uid(record_id) if record_id else "",
        representation=True,
    )


class Meeting(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    audience: str = "board"
    meeting_date: date
    meeting_time: str
    duration_minutes: int = Field(default=60, ge=15, le=480)
    location: str = Field(default="", max_length=300)
    description: str = Field(default="", max_length=12000)
    state: str = "scheduled"


class MeetingAccess(BaseModel):
    zoom_url: str = Field(default="", max_length=2000)
    reminder_hours: int = 24


class AgendaItem(BaseModel):
    meeting_id: UUID | None = None
    title: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=12000)
    audience: str = "board"
    state: str = "submitted"
    sort_order: int = Field(default=10, ge=0, le=999)


def scheduler(req):
    t, m = board(req)
    if not rest("rpc/hba_can_schedule", t, "POST", {}):
        raise HTTPException(
            403,
            "A linked President or Secretary account, or administrator, is required.",
        )
    return t, m


@app.get("/api/upcoming")
def upcoming(req: Request):
    """Compact calendar feed for the dashboard: recorded events and meetings from the start of this month onward,
    plus the standing board-meeting rule. Projections (annual supper, monthly board meeting) are computed client-side.
    """
    token, m = require(req)
    from datetime import date as _date

    start = _date.today().replace(day=1).isoformat()
    events = rest(
        "hba_events",
        token,
        query="select=id,series_id,title,event_date,event_time,rain_date,use_rain_date,state,planning_only,location&state=eq.scheduled&or=(event_date.gte."
        + start
        + ",rain_date.gte."
        + start
        + ")&order=event_date.asc",
    )
    meetings = rest(
        "hba_meetings",
        token,
        query="select=id,title,meeting_date,meeting_time,duration_minutes,location,audience,state&meeting_date=gte."
        + start
        + "&order=meeting_date.asc,meeting_time.asc",
    )
    series = rest(
        "hba_series", token, query="select=id,title,recurrence_rule,first_year"
    )
    settings = {
        r["key"]: r["value"]
        for r in rest(
            "hba_settings",
            token,
            query="select=key,value&key=in.(public_board_meeting_rule,public_supper_defaults)",
        )
    }
    return {
        "today": _date.today().isoformat(),
        "events": events,
        "meetings": meetings,
        "series": series,
        "board_meeting_rule": settings.get("public_board_meeting_rule", ""),
        "supper_defaults": settings.get("public_supper_defaults", ""),
        "can_schedule": (
            bool(rest("rpc/hba_can_schedule", token, "POST", {}))
            if m["role"] in {"board", "admin"}
            else False
        ),
    }


@app.post("/api/meetings")
@app.put("/api/meetings/{record_id}")
def save_meeting(body: Meeting, req: Request, record_id: str | None = None):
    from datetime import time

    t, _ = scheduler(req)
    try:
        time.fromisoformat(body.meeting_time)
    except ValueError:
        raise HTTPException(400, "Enter a valid local meeting time.")
    if body.state not in {"scheduled", "held", "cancelled"}:
        raise HTTPException(400, "Invalid meeting state.")
    if body.audience not in {"board", "general"}:
        raise HTTPException(
            400, "Choose a Board of Governors or general membership meeting."
        )
    return rest(
        "hba_meetings",
        t,
        "PATCH" if record_id else "POST",
        body.model_dump(mode="json"),
        query="id=eq." + uid(record_id) if record_id else "",
        representation=True,
    )[0]


@app.put("/api/meetings/{record_id}/access")
def save_meeting_access(record_id: str, body: MeetingAccess, req: Request):
    from urllib.parse import urlparse

    t, _ = scheduler(req)
    parsed = urlparse(body.zoom_url)
    if body.zoom_url and (
        parsed.scheme != "https"
        or not (
            parsed.hostname == "zoom.us" or (parsed.hostname or "").endswith(".zoom.us")
        )
        or parsed.username
        or parsed.password
    ):
        raise HTTPException(
            400,
            "Use a valid HTTPS zoom.us participant link. Do not enter host/start links.",
        )
    if parsed.path.startswith("/s/"):
        raise HTTPException(400, "Use a participant join link, not a host start link.")
    if body.reminder_hours not in {1, 2, 24, 48}:
        raise HTTPException(400, "Choose a supported reminder interval.")
    rid = uid(record_id)
    existing = rest("hba_meeting_access", t, query="id=eq." + rid)
    rest(
        "hba_meeting_access",
        t,
        "PATCH" if existing else "POST",
        body.model_dump() if existing else {"id": rid, **body.model_dump()},
        query="id=eq." + rid if existing else "",
    )
    return {"saved": True, "delivery_active": False}


@app.post("/api/agenda")
@app.put("/api/agenda/{record_id}")
def save_agenda(body: AgendaItem, req: Request, record_id: str | None = None):
    t, _ = board(req)
    if body.audience not in {"board", "members"} or body.state not in {
        "submitted",
        "included",
        "deferred",
        "addressed",
    }:
        raise HTTPException(400, "Invalid agenda classification.")
    return rest(
        "hba_agenda_items",
        t,
        "PATCH" if record_id else "POST",
        body.model_dump(mode="json"),
        query="id=eq." + uid(record_id) if record_id else "",
        representation=True,
    )[0]


class PaymentSettings(BaseModel):
    recipient_name: str = Field(default="", max_length=180)
    recipient_identifier: str = Field(default="", max_length=180)
    enabled: bool = False
    venmo_name: str = Field(default="", max_length=180)
    venmo_handle: str = Field(default="", max_length=64)
    venmo_enabled: bool = False
    # Pay by check (stored as the public setting public_check_payment; no payment table change)
    check_payee: str = Field(default="", max_length=180)
    check_address: str = Field(default="", max_length=400)
    dues_amount: str = Field(default="", max_length=40)
    dues_due_by: str = Field(default="", max_length=80)
    check_source: str = Field(default="", max_length=240)


# Board-editable public cards on the bulletin (Facebook group, Local Sands store). Links must be https and point at
# Facebook, Instagram or an ordinary web shop; anything else is refused so no guessed or unsafe link is shown.
PUBLIC_SETTING_KEYS = {
    "public_facebook_group_name",
    "public_facebook_group_url",
    "public_facebook_group_note",
    "public_local_sands_name",
    "public_local_sands_url",
    "public_local_sands_note",
    "public_hidden_tools",
}


class SettingValue(BaseModel):
    value: str = Field(default="", max_length=2000)


@app.put("/api/settings/{key}")
def save_setting(key: str, body: SettingValue, req: Request):
    t, _ = board(req)
    if key not in PUBLIC_SETTING_KEYS:
        raise HTTPException(400, "That setting cannot be changed here.")
    value = body.value.strip()
    if key == "public_hidden_tools":
        # Only the administrator decides which dashboard buttons residents see. The value is a JSON list of tool ids.
        t, _ = require(req, ("admin",))
        try:
            ids = json.loads(value or "[]")
        except ValueError:
            raise HTTPException(400, "Hidden tools must be a list.")
        if (
            not isinstance(ids, list)
            or len(ids) > 200
            or any(
                not isinstance(i, str) or not re.fullmatch(r"[a-z0-9-]{1,40}", i)
                for i in ids
            )
        ):
            raise HTTPException(400, "Hidden tools must be a list of tool ids.")
        value = json.dumps(sorted(set(ids)))
    if key.endswith("_url") and value:
        if not re.fullmatch(r"https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/[^\s]*)?", value):
            raise HTTPException(
                400, "Enter a full https:// link copied from the page's Share menu."
            )
        if key == "public_facebook_group_url" and not re.search(
            r"https://([a-z0-9-]+\.)?facebook\.com/", value
        ):
            raise HTTPException(400, "The group link must be a facebook.com address.")
    sb(
        "POST",
        "/rest/v1/hba_settings?on_conflict=key",
        t,
        json={"key": key, "value": value},
        headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
    )
    return {"saved": True, "key": key, "value": value}


@app.get("/api/tool-settings")
def tool_settings(req: Request):
    """Which dashboard buttons the administrator has hidden from residents (an empty list until one is hidden)."""
    token, _ = require(req)
    rows = rest(
        "hba_settings", token, query="select=key,value&key=eq.public_hidden_tools"
    )
    try:
        hidden = json.loads(rows[0]["value"]) if rows and rows[0].get("value") else []
    except ValueError:
        hidden = []
    return {"hidden": hidden if isinstance(hidden, list) else []}


@app.put("/api/payment-settings")
def payment_settings(body: PaymentSettings, req: Request):
    t, member = require(req, ("admin",))
    if body.enabled and (
        not body.recipient_name.strip() or not body.recipient_identifier.strip()
    ):
        raise HTTPException(
            400, "Verify HBA's enrolled recipient before enabling instructions."
        )
    body.venmo_handle = body.venmo_handle.strip().lstrip("@")
    if body.venmo_enabled and (
        not body.venmo_name.strip()
        or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", body.venmo_handle)
    ):
        raise HTTPException(
            400,
            "Verify HBA's official Venmo profile and enter its username without a URL before enabling it.",
        )
    check = {
        "payee": body.check_payee.strip(),
        "address": body.check_address.strip(),
        "dues_amount": body.dues_amount.strip(),
        "due_by": body.dues_due_by.strip(),
        "source": body.check_source.strip(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    core = {
        k: v
        for k, v in body.model_dump().items()
        if k
        not in {
            "check_payee",
            "check_address",
            "dues_amount",
            "dues_due_by",
            "check_source",
        }
    }
    rest(
        "hba_payment_settings",
        t,
        "PATCH",
        {
            **core,
            "updated_by": member["id"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        query="id=eq.1",
    )
    sb(
        "POST",
        "/rest/v1/hba_settings?on_conflict=key",
        t,
        json={"key": "public_check_payment", "value": json.dumps(check)},
        headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
    )
    return {"saved": True}


class PaymentReport(BaseModel):
    payment_kind: str
    fund: str
    event_id: UUID | None = None
    payment_year: int = Field(ge=2020, le=2100)
    amount: float = Field(gt=0, le=1000000)
    payment_date: date
    reference: str = Field(default="", max_length=100)
    note: str = Field(default="", max_length=3000)
    payment_method: str = "unspecified"
    recognize_publicly: bool = False


@app.post("/api/payment-reports")
def payment_report(body: PaymentReport, req: Request):
    t, m = require(req)
    if not m.get("household_uid") or m["household_uid"] not in VALID:
        raise HTTPException(
            400,
            "Ask the board to link your household before submitting payment information.",
        )
    if body.payment_method not in {
        "zelle",
        "venmo",
        "check",
        "cash",
        "other",
        "unspecified",
    }:
        raise HTTPException(400, "Choose a supported payment method.")
    if body.payment_kind not in {"dues", "donation"} or body.fund not in {
        "dues",
        "beach_nourishment",
        "jetties",
        "road_replacement",
        "events",
        "general",
    }:
        raise HTTPException(400, "Choose a supported payment purpose.")
    if (body.payment_kind == "dues") != (body.fund == "dues") or (
        body.event_id and body.fund != "events"
    ):
        raise HTTPException(400, "Check the payment purpose and event.")
    if body.payment_date > datetime.now(timezone.utc).date():
        raise HTTPException(400, "A payment report cannot claim a future payment date.")
    saved = rest(
        "hba_payment_reports",
        t,
        "POST",
        {
            **body.model_dump(mode="json"),
            "amount": round(body.amount, 2),
            "household_uid": m["household_uid"],
        },
        representation=True,
    )[0]
    if m["role"] != "admin":
        notify_admin(
            t,
            "payment",
            "Payment report to verify",
            f"{m.get('display_name') or m['email']}: ${round(body.amount,2):,.2f} {body.payment_kind} by {body.payment_method}, {body.payment_date}.",
        )
    return saved


@app.get("/api/donations/leaderboard")
def donation_leaderboard(req: Request, year: int | None = None):
    """Aggregate-only donation totals: by fund, by street, and an opt-in honor roll. No individual amounts."""
    t, _ = require(req)
    if year is not None and not 2020 <= year <= 2100:
        raise HTTPException(400, "Choose a year between 2020 and 2100.")
    data = rest("rpc/hba_donation_leaderboard", t, "POST", {"p_year": year})
    if not data:
        raise HTTPException(
            403, "Approved residents and board members can see the donor board."
        )
    return {
        **data,
        "source": "Verified resident payment reports marked donation; dues are excluded.",
    }


@app.get("/api/board-notifications")
def board_notifications(req: Request):
    t, _ = board(req)
    rows = rest(
        "hba_payment_reports",
        t,
        query="select=id,created_at&state=eq.pending&order=created_at.desc&limit=1000",
    )
    messages = rest(
        "hba_governor_messages", t, query="select=id&state=eq.new&limit=1000"
    )

    def count(table, query):
        try:
            return len(rest(table, t, query=query + "&limit=1000") or [])
        except HTTPException:
            return 0

    requests = {
        "accounts": count("hba_members", "select=id&role=eq.pending"),
        "payments": len(rows),
        "messages": len(messages),
        "issues": count("hba_issues", "select=id&state=eq.pending_meeting"),
        "stories": count("hba_house_history", "select=id&status=eq.pending"),
        "photos": count(
            "hba_photos", "select=id&status=eq.pending&issue_id=is.null&work_id=is.null"
        ),
        "storms": count("hba_storm_memories", "select=id&status=eq.pending"),
        "hosting": count("hba_event_host_offers", "select=id&state=eq.pending"),
    }
    return {
        "pending_payments": len(rows),
        "latest_id": rows[0]["id"] if rows else None,
        "new_governor_messages": len(messages),
        "requests": requests,
        "total": sum(requests.values()),
    }


class PaymentReview(BaseModel):
    state: str
    board_note: str = Field(default="", max_length=3000)


@app.put("/api/payment-reports/{record_id}")
def review_payment(record_id: str, body: PaymentReview, req: Request):
    t, m = board(req)
    if body.state not in {"pending", "verified", "rejected"}:
        raise HTTPException(400, "Invalid reconciliation status.")
    rest(
        "hba_payment_reports",
        t,
        "PATCH",
        {
            **body.model_dump(),
            "reviewed_by": m["id"],
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        },
        query="id=eq." + uid(record_id),
    )
    return {"saved": True, "dues_registry_changed": False}


class Advisory(BaseModel):
    category: str
    location: str = Field(min_length=1, max_length=300)
    status: str
    note: str = Field(default="", max_length=3000)
    source_url: str = Field(max_length=2000)
    checked_at: datetime
    valid_until: datetime


@app.post("/api/advisories")
def advisory(body: Advisory, req: Request):
    from urllib.parse import urlparse

    t, _ = board(req)
    host = urlparse(body.source_url).hostname or ""
    if body.category not in {"swimming", "shellfishing"} or body.status not in {
        "open",
        "closed",
        "unverified",
    }:
        raise HTTPException(400, "Check advisory category and status.")
    if urlparse(body.source_url).scheme != "https" or not any(
        host == h or host.endswith("." + h) for h in ["mass.gov", "wareham.ma.us"]
    ):
        raise HTTPException(
            400, "Link the actual official Wareham or Massachusetts notice."
        )
    if body.checked_at.tzinfo is None or body.valid_until.tzinfo is None:
        raise HTTPException(400, "Include the advisory time zone.")
    now = datetime.now(timezone.utc)
    if body.checked_at > now + timedelta(
        minutes=5
    ) or not body.checked_at < body.valid_until <= body.checked_at + timedelta(
        hours=24
    ):
        raise HTTPException(
            400, "Use a recent source check and an expiry no more than 24 hours later."
        )
    return rest(
        "hba_public_advisories",
        t,
        "POST",
        body.model_dump(mode="json"),
        representation=True,
    )[0]


_tide_cache = {}


# ---- Meeting minutes -------------------------------------------------------------------------------
def minutes_editor(req):
    t, m = board(req)
    if not rest("rpc/hba_can_edit_minutes", t, "POST", {}):
        raise HTTPException(
            403,
            "The linked, in-term Secretary account or administrator is required to write minutes.",
        )
    return t, m


class Minutes(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    meeting_date: date
    meeting_time: str | None = None
    meeting_id: str | None = None
    location: str = Field(default="", max_length=180)
    called_to_order: str | None = None
    adjourned: str | None = None
    attendees: str = Field(default="", max_length=4000)
    body: str = Field(default="", max_length=60000)
    motions: str = Field(default="", max_length=20000)
    action_items: str = Field(default="", max_length=20000)


def clock_or_none(value, label):
    value = (value or "").strip()
    if not value:
        return None
    try:
        return time_type.fromisoformat(value).isoformat(timespec="minutes")
    except ValueError:
        raise HTTPException(400, f"Enter {label} as HH:MM.")


@app.post("/api/minutes")
@app.put("/api/minutes/{record_id}")
def save_minutes(body: Minutes, req: Request, record_id: str | None = None):
    t, _ = minutes_editor(req)
    if not body.title.strip():
        raise HTTPException(
            400, "Enter a title, for example 'Board of Governors Meeting'."
        )
    if body.meeting_date > date.today() + timedelta(days=1):
        raise HTTPException(
            400,
            "Minutes record a meeting that has happened; the date cannot be in the future.",
        )
    payload = {
        **body.model_dump(mode="json"),
        "title": body.title.strip(),
        "meeting_time": clock_or_none(body.meeting_time, "the meeting time"),
        "called_to_order": clock_or_none(body.called_to_order, "the call to order"),
        "adjourned": clock_or_none(body.adjourned, "adjournment"),
    }
    if body.meeting_id:
        payload["meeting_id"] = uid(body.meeting_id)
        if not rest(
            "hba_meetings", t, query="select=id&id=eq." + payload["meeting_id"]
        ):
            raise HTTPException(404, "That recorded meeting was not found.")
    else:
        payload["meeting_id"] = None
    if record_id:
        rows = rest("hba_meeting_minutes", t, query="id=eq." + uid(record_id))
        if not rows:
            raise HTTPException(404, "Minutes not found.")
        if rows[0]["state"] != "draft":
            raise HTTPException(
                409, "Return the minutes to draft before editing approved text."
            )
    result = rest(
        "hba_meeting_minutes",
        t,
        "PATCH" if record_id else "POST",
        payload,
        query="id=eq." + uid(record_id) if record_id else "",
        representation=True,
    )
    return result[0] if result else None


class MinutesState(BaseModel):
    state: str
    approved_on: date | None = None
    approved_note: str = Field(default="", max_length=400)


@app.put("/api/minutes/{record_id}/state")
def minutes_state(record_id: str, body: MinutesState, req: Request):
    t, _ = minutes_editor(req)
    if body.state not in {"draft", "approved"}:
        raise HTTPException(400, "Choose draft or approved.")
    rows = rest("hba_meeting_minutes", t, query="id=eq." + uid(record_id))
    if not rows:
        raise HTTPException(404, "Minutes not found.")
    if body.state == "approved":
        if not (rows[0]["body"].strip() or rows[0]["file_path"]):
            raise HTTPException(
                400, "Add minutes text or a readable PDF before marking them approved."
            )
        if not body.approved_on:
            raise HTTPException(400, "Enter the date the board approved these minutes.")
        if body.approved_on.isoformat() < str(rows[0]["meeting_date"]):
            raise HTTPException(
                400, "Approval cannot be dated before the meeting itself."
            )
        patch = {
            "state": "approved",
            "approved_on": body.approved_on.isoformat(),
            "approved_note": body.approved_note.strip(),
        }
    else:
        patch = {"state": "draft", "approved_on": None, "approved_note": ""}
    return rest(
        "hba_meeting_minutes",
        t,
        "PATCH",
        patch,
        query="id=eq." + uid(record_id),
        representation=True,
    )[0]


@app.post("/api/minutes/{record_id}/file")
async def minutes_file(
    record_id: str,
    req: Request,
    background: BackgroundTasks,
    file: UploadFile = File(...),
):
    t, _ = minutes_editor(req)
    rid = uid(record_id)
    rows = rest("hba_meeting_minutes", t, query="id=eq." + rid)
    if not rows or rows[0]["state"] != "draft":
        raise HTTPException(409, "Save a draft before attaching or replacing a PDF.")
    raw = await read_file(file, 8 * 1024 * 1024)
    try:
        if not raw.startswith(b"%PDF-"):
            raise ValueError()
        doc = fitz.open(stream=raw, filetype="pdf")
        if doc.is_encrypted or doc.page_count < 1:
            raise ValueError()
        doc.close()
    except Exception:
        raise HTTPException(400, "Upload a readable, unencrypted PDF, up to 8 MB.")
    path = f"minutes/{rid}/{uuid4()}.pdf"
    sb(
        "POST",
        "/storage/v1/object/hba-archive/" + path,
        t,
        content=raw,
        headers={"Content-Type": "application/pdf"},
    )
    return rest(
        "hba_meeting_minutes",
        t,
        "PATCH",
        {
            "file_path": path,
            "original_name": Path(file.filename or "minutes.pdf").name[:200],
        },
        query="id=eq." + rid,
        representation=True,
    )[0]


@app.get("/api/weather-alerts")
def active_weather_alerts():
    try:
        return weather_alerts.snapshot(client)
    except Exception:
        raise HTTPException(
            503,
            "NWS alerts are unavailable. Current alert status could not be verified; check the official NWS forecast and local emergency notices.",
        )


@app.get("/api/weather")
def weather_report():
    try:
        return local_weather.snapshot(client)
    except Exception:
        raise HTTPException(
            503,
            "Local NWS weather is unavailable. Use the official Hamilton Beach forecast; no current conditions are assumed.",
        )


@app.get("/api/bulletin")
def public_bulletin(req: Request):
    token, _ = require(req)
    rows = rest(
        "hba_public_advisories",
        KEY,
        query="select=category,location,status,note,source_url,checked_at,valid_until&order=checked_at.desc&limit=30",
    )
    settings = {
        r["key"]: r["value"]
        for r in rest("hba_settings", token, query="select=key,value&key=like.public_*")
    }
    return {
        "advisories": rows,
        "settings": settings,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
    }


# ---- Official beach status: DPH beach water quality (Tableau public dashboard) and DMF shellfish classification/notices ----
_beach_status_cache = {}
_DPH_TOKEN_URL = "https://publicdashboardtoken.mass.gov/tokens/requestpublicaccess?connectedapp=DPH-BCEH-BDD-BD"
_DPH_HOST = "https://tableaudashboards.eohhs.mass.gov"
_DPH_VIEWS = {
    "map": "bb384ed5-0871-40c3-9539-cb4a9402fcf4",
    "results": "28ae6973-7dfc-4208-9ca9-5705396b4ed4",
    "closures": "a124523d-1744-4983-8ce7-e4b8eb7efda6",
}
_DSGA_URL = "https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/DSGA/FeatureServer/0/query"
_DMF_NOTICES_URL = (
    "https://www.mass.gov/lists/emergency-shellfish-closure-and-opening-notices"
)


def _csv_rows(text):
    import csv, io

    return list(csv.DictReader(io.StringIO(text)))


def _dph_beach():
    """Hamilton Beach rows from DPH's public dashboard. Uses the state's public-access token endpoint (the same one the
    mass.gov page uses to embed the dashboard) and Tableau's view-data export. Returns None on any failure.
    """
    tok = client.get(_DPH_TOKEN_URL, timeout=20).json().get("token")
    if not tok:
        return None
    sess = client.post(
        _DPH_HOST + "/api/3.21/auth/signin",
        json={"credentials": {"jwt": tok, "site": {"contentUrl": "eohhspublic"}}},
        headers={"Accept": "application/json"},
        timeout=30,
    ).json()["credentials"]
    h = {"X-Tableau-Auth": sess["token"]}
    base = f"{_DPH_HOST}/api/3.21/sites/{sess['site']['id']}/views/"
    try:
        status = [
            r
            for r in _csv_rows(
                client.get(
                    base + _DPH_VIEWS["map"] + "/data",
                    params={"vf_Town": "Wareham"},
                    headers=h,
                    timeout=60,
                ).text
            )
            if r.get("Beach Name", "").strip().lower() == "hamilton beach"
        ]
        samples = _csv_rows(
            client.get(
                base + _DPH_VIEWS["results"] + "/data",
                params={"vf_Name": "Hamilton Beach"},
                headers=h,
                timeout=60,
            ).text
        )
        closures = [
            r
            for r in _csv_rows(
                client.get(
                    base + _DPH_VIEWS["closures"] + "/data", headers=h, timeout=60
                ).text
            )
            if "hamilton" in json.dumps(r).lower()
            and "wareham" in json.dumps(r).lower()
        ]
    finally:
        try:
            client.post(_DPH_HOST + "/api/3.21/auth/signout", headers=h, timeout=15)
        except httpx.HTTPError:
            pass

    def when(r):
        try:
            return datetime.strptime(r["Date"], "%m/%d/%Y %I:%M:%S %p")
        except (KeyError, ValueError):
            return datetime.min

    samples = sorted([r for r in samples if r.get("Date")], key=when, reverse=True)
    out = []
    for r in samples[:8]:
        try:
            val = float(r.get("Results (CFU/100 ml)") or "")
        except ValueError:
            continue
        gm = r.get("GeoMean (CFU/100 ml)") or ""
        out.append(
            {
                "sampled_at": when(r).isoformat(),
                "indicator": r.get("Indicator", ""),
                "result_cfu": val,
                "geomean_cfu": float(gm) if gm else None,
                "exceeds_single_sample": val > 104,
            }
        )
    return {
        "status": (status[0].get("Beach Status") if status else None),
        "samples": out,
        "closures": closures,
        "single_sample_limit_cfu": 104,
        "geomean_limit_cfu": 35,
        "indicator": "Enterococci",
    }


def _dmf_classification():
    params = {
        "geometry": json.dumps(
            {
                "xmin": -70.73,
                "ymin": 41.73,
                "xmax": -70.70,
                "ymax": 41.76,
                "spatialReference": {"wkid": 4326},
            }
        ),
        "geometryType": "esriGeometryEnvelope",
        "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "NAME,GROWING_AR,AREA_DESC,CLASS,CONDITION,BEGIN_DATE,ACRES",
        "returnGeometry": "false",
        "f": "json",
    }
    feats = client.get(_DSGA_URL, params=params, timeout=40).json().get("features", [])
    rows = []
    for f in feats:
        a = f["attributes"]
        rows.append(
            {
                "area": a.get("NAME"),
                "growing_area": a.get("GROWING_AR"),
                "name": a.get("AREA_DESC"),
                "classification": a.get("CLASS"),
                "condition": a.get("CONDITION"),
                "since": (
                    datetime.fromtimestamp(a["BEGIN_DATE"] / 1000, timezone.utc)
                    .date()
                    .isoformat()
                    if a.get("BEGIN_DATE")
                    else None
                ),
                "acres": round(a.get("ACRES") or 0, 1),
            }
        )
    order = {"BB36.11": 0, "BB36.8": 1, "BB36.0": 2}
    rows.sort(key=lambda r: (order.get(r["area"], 9), r["area"] or ""))
    return rows


def _codes_in(title):
    """Growing-area codes named in a DMF notice title, expanding ranges such as BB33-BB36 or BB1 - BB58."""
    codes = set()
    for m in re.finditer(
        r"\b([A-Z]{1,4})(\d{1,2})(?:\s*[-–]\s*(?:([A-Z]{1,4}))?(\d{1,2}))?", title
    ):
        pre, a, pre2, b = m.group(1), int(m.group(2)), m.group(3), m.group(4)
        if b and (pre2 in (None, pre)):
            for n in range(min(a, int(b)), max(a, int(b)) + 1):
                codes.add(f"{pre}{n}")
        else:
            codes.add(f"{pre}{a}")
    return codes


def _dmf_notices():
    r = client.get(
        _DMF_NOTICES_URL,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
        },
        timeout=40,
    )
    r.raise_for_status()
    html = r.text
    out = []
    for m in re.finditer(
        r'<a[^>]+href="([^"]+)"[^>]*>\s*(\d{1,2}/\d{1,2}/\d{2,4})\s*:?\s*([^<]{10,220})</a>',
        html,
    ):
        href, when, title = (
            m.group(1),
            m.group(2),
            re.sub(r"\s+", " ", m.group(3)).strip(),
        )
        try:
            mm, dd, yy = [int(x) for x in when.split("/")]
            d = date(yy + 2000 if yy < 100 else yy, mm, dd)
        except ValueError:
            continue
        low = title.lower()
        codes = _codes_in(title)
        relevant = (
            "BB36" in codes
            or "wareham" in low
            or "statewide" in low
            or ("all shellfish" in low and "statewide" in low)
        )
        out.append(
            {
                "date": d.isoformat(),
                "title": title,
                "url": (
                    href if href.startswith("http") else "https://www.mass.gov" + href
                ),
                "relevant": relevant,
                "kind": (
                    "opening"
                    if re.search(r"open|rescind", low)
                    else ("closure" if "clos" in low else "notice")
                ),
            }
        )
    out.sort(key=lambda r: r["date"], reverse=True)
    return out


@app.get("/api/beach-status")
def beach_status(req: Request):
    """Official swimming and shellfish information for Hamilton Beach, cached one hour. Each part fails independently."""
    require(req)
    c = _beach_status_cache.get("data")
    if c and time.time() - c["cached_at"] < 3600:
        return c["data"]
    out = {
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "beach": None,
        "beach_error": "",
        "classification": [],
        "classification_error": "",
        "notices": [],
        "notices_error": "",
        "sources": {
            "dph": "https://www.mass.gov/info-details/interactive-beach-water-quality-dashboard",
            "dsga": "https://www.mass.gov/info-details/massgis-data-designated-shellfish-growing-areas",
            "notices": _DMF_NOTICES_URL,
            "wareham": "https://www.wareham.gov/261/Shellfish-Map-and-Information",
        },
    }
    try:
        out["beach"] = _dph_beach()
        if out["beach"] is None:
            out["beach_error"] = "DPH dashboard access token not issued."
    except Exception as e:  # network, token or format changes
        out["beach_error"] = "DPH dashboard not reached: " + type(e).__name__
    try:
        out["classification"] = _dmf_classification()
    except Exception as e:
        out["classification_error"] = (
            "DMF classification service not reached: " + type(e).__name__
        )
    try:
        out["notices"] = _dmf_notices()[:40]
    except Exception as e:
        out["notices_error"] = (
            "DMF notice list not readable from this server (mass.gov blocks automated readers): "
            + type(e).__name__
        )
    if not out["notices"] and not out["notices_error"]:
        out["notices_error"] = (
            "DMF notice list returned no entries to this server; open the official list."
        )
    if out["beach"] or out["classification"] or out["notices"]:
        _beach_status_cache["data"] = {"cached_at": time.time(), "data": out}
    return out


@app.get("/api/tides")
def tide_predictions():
    from zoneinfo import ZoneInfo

    today = datetime.now(ZoneInfo("America/New_York")).date()
    cached = _tide_cache.get(str(today))
    if cached and time.time() - cached["cached_at"] < 21600:
        return cached["data"]
    params = {
        "product": "predictions",
        "application": "HBACommunity",
        "begin_date": today.strftime("%Y%m%d"),
        "end_date": (today + timedelta(days=6)).strftime("%Y%m%d"),
        "datum": "MLLW",
        "station": "8447368",
        "time_zone": "lst_ldt",
        "units": "english",
        "interval": "hilo",
        "format": "json",
    }
    try:
        r = client.get(
            "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter", params=params
        )
        r.raise_for_status()
        rows = r.json()["predictions"]
        if not rows:
            raise ValueError("Empty predictions")
    except (httpx.HTTPError, ValueError, KeyError):
        raise HTTPException(
            503,
            "NOAA predictions are unavailable. Use the official Great Hill tide page.",
        )
    data = {
        "station": "8447368",
        "name": "Great Hill",
        "time_zone": "America/New_York",
        "datum": "MLLW",
        "units": "feet",
        "predictions": rows,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "source": "https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=8447368",
    }
    _tide_cache.clear()
    _tide_cache[str(today)] = {"cached_at": time.time(), "data": data}
    return data


_summer_tide_cache = {}


@app.get("/api/summer/tides")
def summer_tides(req: Request, year: int):
    """High/low predictions for July and August of one year (Great Hill), used to pick the Kids' Fishing Derby
    Saturday: the board wants 11 AM to fall about half way through an outgoing tide."""
    require(req)
    if year < 2000 or year > 2100:
        raise HTTPException(400, "Choose a year between 2000 and 2100.")
    cached = _summer_tide_cache.get(year)
    if cached and time.time() - cached["cached_at"] < 7 * 86400:
        return cached["data"]
    params = {
        "product": "predictions",
        "application": "HBACommunity",
        "begin_date": f"{year}0701",
        "end_date": f"{year}0831",
        "datum": "MLLW",
        "station": "8447368",
        "time_zone": "lst_ldt",
        "units": "english",
        "interval": "hilo",
        "format": "json",
    }
    try:
        r = client.get(
            "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter", params=params
        )
        r.raise_for_status()
        rows = r.json()["predictions"]
        if not rows:
            raise ValueError("Empty predictions")
    except (httpx.HTTPError, ValueError, KeyError):
        raise HTTPException(
            503,
            "NOAA predictions are unavailable right now. Try again later or use the official Great Hill tide page.",
        )
    saturdays = []
    by_day = {}
    for p in rows:
        by_day.setdefault(p["t"][:10], []).append(p)
    for day, items in by_day.items():
        d = datetime.strptime(day, "%Y-%m-%d").date()
        if d.weekday() != 5:
            continue
        tides = [
            {
                "type": p["type"],
                "time": p["t"][11:16],
                "height": round(float(p["v"]), 1),
            }
            for p in items
        ]
        # Find a morning high followed by a low: the midpoint is "mid tide going out".
        best = None
        for i in range(len(tides) - 1):
            if tides[i]["type"] == "H" and tides[i + 1]["type"] == "L":
                h = datetime.strptime(tides[i]["time"], "%H:%M")
                l = datetime.strptime(tides[i + 1]["time"], "%H:%M")
                mid = h + (l - h) / 2
                diff = (
                    abs((mid - datetime.strptime("11:00", "%H:%M")).total_seconds())
                    / 60
                )
                if best is None or diff < best["minutes_from_eleven"]:
                    best = {
                        "high": tides[i]["time"],
                        "low": tides[i + 1]["time"],
                        "mid_ebb": mid.strftime("%H:%M"),
                        "minutes_from_eleven": round(diff),
                    }
        saturdays.append({"date": day, "tides": tides, "ebb": best})
    data = {
        "station": "8447368",
        "name": "Great Hill",
        "year": year,
        "saturdays": saturdays,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "source": "https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=8447368",
    }
    _summer_tide_cache[year] = {"cached_at": time.time(), "data": data}
    return data


class Change(BaseModel):
    status: str
    revision: int = Field(ge=0)


class ImportRow(Change):
    uid: str


class ImportBatch(BaseModel):
    rows: list[ImportRow] = Field(max_length=300)


def validate_dues(home, status):
    if home not in VALID or status not in {"unknown", "paid", "unpaid"}:
        raise HTTPException(400, "Invalid mapped home or payment status.")


@app.get("/api/dues/{year}")
def dues_read(year: int, req: Request):
    t, _ = board(req)
    year_ok(year)
    return {
        "year": year,
        "rows": rest("hba_dues", t, query=f"year=eq.{year}&select=*"),
        "scope": "Shared HBA board-only registry",
    }


@app.put("/api/dues/{year}/{home}")
def dues_save(year: int, home: str, body: Change, req: Request):
    t, _ = board(req)
    year_ok(year)
    validate_dues(home, body.status)
    return rest(
        "rpc/hba_set_dues",
        t,
        "POST",
        {
            "p_year": year,
            "p_uid": home,
            "p_status": body.status,
            "p_revision": body.revision,
        },
        representation=True,
    )


@app.post("/api/dues/{year}/import")
def dues_import(year: int, body: ImportBatch, req: Request):
    t, _ = board(req)
    year_ok(year)
    if len({r.uid for r in body.rows}) != len(body.rows):
        raise HTTPException(400, "Duplicate household.")
    for r in body.rows:
        validate_dues(r.uid, r.status)
    rows = rest(
        "rpc/hba_import_dues",
        t,
        "POST",
        {"p_year": year, "p_rows": [r.model_dump() for r in body.rows]},
        representation=True,
    )
    return {"year": year, "rows": rows}


# Bank files remain board-private. No bank credentials or routing numbers accepted.
class BankAccount(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    last_four: str = Field(default="", pattern=r"^([0-9]{4})?$")


@app.post("/api/bank/accounts")
def add_bank_account(body: BankAccount, req: Request):
    t, _ = require(req, ("admin",))
    return rest("hba_bank_accounts", t, "POST", body.model_dump(), representation=True)[
        0
    ]


def bank_all(table, t, query="", order="id.asc"):
    result = []
    for offset in range(0, 20000, 1000):
        rows = rest(
            table, t, query=f"select=*&{query}&order={order}&limit=1000&offset={offset}"
        )
        result.extend(rows)
        if len(rows) < 1000:
            return result
    raise HTTPException(
        409,
        "This review exceeds 20,000 records. Narrow the period; no complete reconciliation was produced.",
    )


@app.get("/api/bank")
def bank_workspace(
    req: Request, account_id: UUID | None = None, as_of: date | None = None
):
    t, _ = board(req)
    accounts = rest("hba_bank_accounts", t, query="select=*&order=created_at.asc")
    output = {
        "accounts": accounts,
        "connection": {
            "active": False,
            "status": "Live bank feed is not configured. This workspace uses treasurer-imported statement rows only.",
        },
    }
    if not account_id:
        return output
    aid = str(account_id)
    if not any(a["id"] == aid for a in accounts):
        raise HTTPException(404, "Account reference not found.")
    cutoff = as_of or datetime.now(timezone.utc).date()
    if cutoff > datetime.now(timezone.utc).date():
        raise HTTPException(400, "Choose an as-of date no later than today.")
    imports = rest(
        "hba_bank_imports",
        t,
        query=f"select=*&account_id=eq.{aid}&period_end=lte.{cutoff}&order=period_end.desc,created_at.desc&limit=100",
    )
    statement = next((i for i in imports if i["period_end"] == str(cutoff)), None)
    register = bank_all("hba_check_register", t, f"transaction_date=lte.{cutoff}")
    transactions = bank_all(
        "hba_bank_transactions", t, f"account_id=eq.{aid}&posted_date=lte.{cutoff}"
    )
    matches = bank_all("hba_bank_matches", t)
    output.update(
        imports=imports,
        transactions=transactions,
        matches=matches,
        register=register,
        analysis=analyze_bank(
            register,
            transactions,
            matches,
            str(cutoff),
            aid,
            statement.get("statement_closing") if statement else None,
            statement.get("books_closing") if statement else None,
        ),
        refreshed_at=datetime.now(timezone.utc).isoformat(),
    )
    return output


class BankRow(BaseModel):
    posted_date: date
    amount: Decimal = Field(max_digits=14, decimal_places=2)
    description: str = Field(default="", max_length=300)
    reference: str = Field(default="", max_length=80)
    bank_transaction_id: str = Field(default="", max_length=180)
    payer_key: str = Field(default="", max_length=120)


class BankImport(BaseModel):
    account_id: UUID
    period_start: date
    period_end: date
    statement_closing: Decimal | None = Field(
        default=None, max_digits=14, decimal_places=2
    )
    books_closing: Decimal | None = Field(default=None, max_digits=14, decimal_places=2)
    source_note: str = Field(min_length=1, max_length=1000)
    rows: list[BankRow] = Field(min_length=1, max_length=1000)


@app.post("/api/bank/import")
def import_bank_rows(body: BankImport, req: Request):
    t, _ = finance_editor(req)
    if (
        body.period_end < body.period_start
        or body.period_end > datetime.now(timezone.utc).date()
    ):
        raise HTTPException(400, "Use a valid completed statement period.")
    aid = str(body.account_id)
    if not rest("hba_bank_accounts", t, query="id=eq." + aid):
        raise HTTPException(404, "Account reference not found.")
    # Exact repeated rows without bank IDs are held as possible duplicates, not
    # silently treated as separate transfers. Treasurer can supply stable IDs.
    rows = []
    for r in body.rows:
        if not body.period_start <= r.posted_date <= body.period_end or r.amount == 0:
            raise HTTPException(
                400, "Every nonzero posted row must fall within the statement period."
            )
        identity = (
            ("id:" + r.bank_transaction_id.strip())
            if r.bank_transaction_id.strip()
            else json.dumps(
                [
                    str(r.posted_date),
                    str(r.amount.quantize(Decimal(".01"))),
                    r.reference.strip(),
                    r.description.strip(),
                ],
                separators=(",", ":"),
            )
        )
        fingerprint = hashlib.sha256(identity.encode()).hexdigest()
        values = r.model_dump(mode="json")
        values.pop("bank_transaction_id")
        values.pop("payer_key")
        rows.append(
            {
                **values,
                "account_id": aid,
                "fingerprint": fingerprint,
                "payer_fingerprint": (
                    payer_fingerprint(aid, r.payer_key) if r.payer_key.strip() else None
                ),
            }
        )
    imported = rest(
        "rpc/hba_import_bank_statement",
        t,
        "POST",
        {
            "p_account": aid,
            "p_start": str(body.period_start),
            "p_end": str(body.period_end),
            "p_closing": (
                str(body.statement_closing)
                if body.statement_closing is not None
                else None
            ),
            "p_books": (
                str(body.books_closing) if body.books_closing is not None else None
            ),
            "p_note": body.source_note,
            "p_rows": rows,
        },
    )
    return {
        **imported,
        "warning": "Imported statement rows only; not a live bank sync. Review held duplicates and statement completeness.",
    }


class BankMatch(BaseModel):
    register_id: UUID
    transaction_id: UUID


@app.post("/api/bank/matches")
def confirm_bank_match(body: BankMatch, req: Request):
    t, _ = finance_editor(req)
    return rest(
        "hba_bank_matches", t, "POST", body.model_dump(mode="json"), representation=True
    )[0]


class BankSummary(BaseModel):
    period_end: date
    statement: str = Field(min_length=1, max_length=3000)


@app.post("/api/bank/summaries")
def publish_bank_summary(body: BankSummary, req: Request):
    t, _ = finance_editor(req)
    return rest(
        "hba_bank_summaries",
        t,
        "POST",
        body.model_dump(mode="json"),
        representation=True,
    )[0]


class BankBookEntry(BaseModel):
    category_code: str = Field(min_length=1, max_length=60)
    payee: str = Field(min_length=1, max_length=180)
    memo: str = Field(default="", max_length=3000)


@app.post("/api/bank/transactions/{record_id}/book")
def book_bank_transaction(record_id: str, body: BankBookEntry, req: Request):
    t, _ = finance_editor(req)
    rid = rest(
        "rpc/hba_book_bank_transaction",
        t,
        "POST",
        {
            "p_transaction_id": uid(record_id),
            "p_category": body.category_code,
            "p_payee": body.payee,
            "p_memo": body.memo,
        },
    )
    return {
        "register_id": rid,
        "notice": "Recorded once in budget actuals and matched. No adopted budget, payment or dues status was changed.",
    }


def payer_fingerprint(account_id, value):
    # Stable private HMAC, not a stored bank number. Never log the input.
    value = value.strip()
    if (
        not re.fullmatch(r"[A-Za-z][A-Za-z0-9:_-]{5,119}", value)
        or sum(c.isdigit() for c in value) > 8
    ):
        raise HTTPException(
            400,
            "Use a non-sensitive stable payer key starting with a letter (for example payer-keefe-joint). Do not use account/routing numbers, check numbers, a surname alone, or last four digits alone.",
        )
    return hmac.new(
        key_path.read_bytes(),
        ("hba-payer-v1/" + str(account_id) + "/" + value).encode(),
        hashlib.sha256,
    ).hexdigest()


@app.get("/api/dues-receipts")
def dues_receipts(req: Request):
    t, _ = board(req)
    return {
        "households": [
            {"uid": p["uid"], "address": p["address"]} for p in homes["properties"]
        ],
        "receipts": bank_all("hba_dues_receipts", t),
        "targets": bank_all("hba_dues_targets", t, order="uid.asc,year.asc"),
        "payers": bank_all("hba_payer_households", t),
        "statuses": bank_all("hba_dues", t, order="uid.asc,year.asc"),
    }


class DuesReceipt(BaseModel):
    household_uid: str = Field(max_length=100)
    dues_year: int = Field(ge=2020, le=2100)
    annual_due: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    register_id: UUID | None = None
    bank_transaction_id: UUID | None = None
    payee: str = Field(default="", max_length=180)
    memo: str = Field(default="", max_length=3000)
    remember: bool = False
    payer_id: UUID | None = None
    payer_key: str = Field(default="", max_length=120)
    payer_label: str = Field(default="", max_length=120)
    confirmed: bool = False
    single_check: bool = False


@app.post("/api/dues-receipts")
def credit_dues(body: DuesReceipt, req: Request):
    t, _ = finance_editor(req)
    if (
        not body.confirmed
        or body.household_uid not in VALID
        or bool(body.register_id) == bool(body.bank_transaction_id)
    ):
        raise HTTPException(
            400,
            "Confirm an exact household and choose one existing register entry or one unmatched bank check.",
        )
    if body.bank_transaction_id:
        if not body.single_check:
            raise HTTPException(
                400,
                "A combined or mixed deposit cannot be attributed as one household check. Enter its individual checks in the register and credit each household separately.",
            )
        rows = rest(
            "hba_bank_transactions", t, query="id=eq." + str(body.bank_transaction_id)
        )
    else:
        rows = rest("hba_check_register", t, query="id=eq." + str(body.register_id))
        if body.amount is None:
            raise HTTPException(
                400, "Enter the amount of this existing receipt to credit."
            )
    if not rows:
        raise HTTPException(404, "Transaction not found.")
    record = rows[0]
    aid = (
        record.get("account_id")
        if body.bank_transaction_id
        else record.get("bank_account_id")
    )
    fingerprint = record.get("payer_fingerprint") if body.bank_transaction_id else None
    label = body.payer_label.strip()
    if body.payer_id:
        payer = rest("hba_payer_households", t, query="id=eq." + str(body.payer_id))
        if (
            not payer
            or payer[0]["bank_account_id"] != aid
            or payer[0]["household_uid"] != body.household_uid
        ):
            raise HTTPException(
                409,
                "Saved payer does not match this account and household; review before crediting.",
            )
        if fingerprint and fingerprint != payer[0]["fingerprint"]:
            raise HTTPException(
                409,
                "The bank's stable payer key differs from the selected saved payer.",
            )
        fingerprint = payer[0]["fingerprint"]
        label = payer[0]["label"]
    if body.payer_key.strip():
        candidate = payer_fingerprint(aid, body.payer_key)
        if fingerprint and fingerprint != candidate:
            raise HTTPException(
                409,
                "The entered payer key does not match the saved or imported payer. Do not overwrite it.",
            )
        fingerprint = candidate
    if body.remember and (not aid or not fingerprint or not label):
        raise HTTPException(
            400,
            "To remember the household, choose an HBA account and supply a verified stable payer key and label.",
        )
    common = {
        "p_uid": body.household_uid,
        "p_year": body.dues_year,
        "p_annual_due": str(body.annual_due),
        "p_payer_fingerprint": fingerprint if body.remember else None,
        "p_payer_label": label if body.remember else None,
    }
    if body.bank_transaction_id:
        result = rest(
            "rpc/hba_book_bank_dues",
            t,
            "POST",
            {
                **common,
                "p_transaction": str(body.bank_transaction_id),
                "p_payee": body.payee.strip()
                or record["description"][:180]
                or "Confirmed dues check",
                "p_memo": body.memo,
                "p_remember": body.remember,
            },
        )
    else:
        result = rest(
            "rpc/hba_credit_dues_receipt",
            t,
            "POST",
            {
                **common,
                "p_register": str(body.register_id),
                "p_amount": str(body.amount),
            },
        )
    return {
        **result,
        "notice": "Household dues credited once and its status recalculated. No adopted budget changed.",
    }


class DuesTargetCorrection(BaseModel):
    annual_due: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    source_note: str = Field(min_length=1, max_length=1000)


@app.put("/api/dues-targets/{year}/{household}")
def correct_dues_target(
    year: int, household: str, body: DuesTargetCorrection, req: Request
):
    t, _ = require(req, ("admin",))
    year_ok(year)
    if household not in VALID:
        raise HTTPException(400, "Select a mapped household.")
    rest(
        "rpc/hba_correct_dues_target",
        t,
        "POST",
        {
            "p_uid": household,
            "p_year": year,
            "p_annual": str(body.annual_due),
            "p_note": body.source_note,
        },
    )
    return {
        "saved": True,
        "notice": "Verified annual amount corrected with an audit entry; household status recalculated.",
    }


document_intake.register(
    app,
    {
        "rest": rest,
        "sb": sb,
        "board": board,
        "finance_editor": finance_editor,
        "uid": uid,
        "rate": rate,
        "VALID": VALID,
    },
)


class ElectionCycle(BaseModel):
    meeting_id: UUID | None = None
    nomination_deadline: date | None = None
    state: str = "planning"
    notice: str = Field(default="", max_length=5000)
    positions: str = Field(default="", max_length=3000)
    nomination_instructions: str = Field(default="", max_length=5000)
    results: str = Field(default="", max_length=10000)
    source_note: str = Field(default="", max_length=3000)


@app.put("/api/elections/{year}")
def save_election(year: int, body: ElectionCycle, req: Request):
    t, _ = board(req)
    if year < 2027 or year > 2200 or (year - 2027) % 2:
        raise HTTPException(
            400, "Election years are 2027, 2029, 2031 and every two years after that."
        )
    if body.state not in {
        "planning",
        "nominations_open",
        "meeting_scheduled",
        "results_recorded",
    }:
        raise HTTPException(400, "Choose a valid election planning status.")
    old = rest("hba_elections", t, query="year=eq." + str(year))
    values = body.model_dump(mode="json")
    if not old:
        values["year"] = year
    return rest(
        "hba_elections",
        t,
        "PATCH" if old else "POST",
        values,
        query="year=eq." + str(year) if old else "",
        representation=True,
    )[0]


class BidRequest(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    work_id: UUID | None = None
    scope: str = Field(min_length=1, max_length=12000)
    location: str = Field(default="", max_length=300)
    deadline: date | None = None
    state: str = "draft"


class ContractorBid(BaseModel):
    request_id: UUID
    contractor: str = Field(min_length=1, max_length=250)
    contact: str = Field(default="", max_length=600)
    amount: Decimal = Field(gt=0, le=10000000, max_digits=12, decimal_places=2)
    tax_basis: str = "unspecified"
    scope: str = Field(min_length=1, max_length=12000)
    exclusions: str = Field(default="", max_length=12000)
    timing: str = Field(default="", max_length=2000)
    valid_until: date | None = None


class BidReview(BaseModel):
    state: str
    note: str = Field(min_length=1, max_length=12000)
    revision: int = Field(ge=1)


@app.post("/api/bid-requests")
@app.put("/api/bid-requests/{record_id}")
def save_bid_request(body: BidRequest, req: Request, record_id: str | None = None):
    t, _ = board(req)
    if body.state not in {"draft", "open", "closed"}:
        raise HTTPException(400, "Choose draft, open or closed.")
    if body.work_id and not rest(
        "hba_work", t, query="id=eq." + str(body.work_id) + "&select=id"
    ):
        raise HTTPException(400, "Work project not found.")
    rows = rest(
        "hba_bid_requests",
        t,
        "PATCH" if record_id else "POST",
        body.model_dump(mode="json"),
        query="id=eq." + uid(record_id) if record_id else "",
        representation=True,
    )
    if not rows:
        raise HTTPException(404, "Bid request not found.")
    return rows[0]


@app.post("/api/bids")
def submit_bid(body: ContractorBid, req: Request):
    t, m = require(req)
    if body.tax_basis not in {"included", "excluded", "unspecified"}:
        raise HTTPException(400, "Choose a tax treatment.")
    row = rest(
        "hba_bids", t, "POST", body.model_dump(mode="json"), representation=True
    )[0]
    if m["role"] != "admin":
        notify_admin(
            t,
            "bid",
            "Contractor bid submitted",
            f"{body.contractor}: ${round(float(body.amount),2):,.2f}.",
        )
    return row


@app.post("/api/bids/{record_id}/review")
def review_bid(record_id: str, body: BidReview, req: Request):
    t, _ = board(req)
    return rest(
        "rpc/hba_review_bid",
        t,
        "POST",
        {
            "p_id": uid(record_id),
            "p_state": body.state,
            "p_note": body.note,
            "p_revision": body.revision,
        },
    )


@app.post("/api/bids/{record_id}/files")
async def upload_bid_file(
    record_id: str, req: Request, file: UploadFile = File(...), caption: str = Form("")
):
    t, m = require(req)
    bid_id = uid(record_id)
    rows = rest("hba_bids", t, query="id=eq." + bid_id)
    if not rows:
        raise HTTPException(404, "Proposal not found or permission denied.")
    if m["role"] == "resident" and rows[0]["state"] not in {
        "submitted",
        "clarification",
    }:
        raise HTTPException(
            403,
            "Attachments are accepted only for submitted proposals or requested clarification.",
        )
    if len(caption) > 2000:
        raise HTTPException(400, "Attachment description is too long.")
    raw = await read_file(file, 8 * 1024 * 1024)
    name = Path(file.filename or "proposal.pdf").name[:250]
    suffix = Path(name).suffix.lower()
    if suffix == ".pdf":
        try:
            with fitz.open(stream=raw, filetype="pdf") as pdf:
                if pdf.is_encrypted or not 1 <= len(pdf) <= 100:
                    raise ValueError("Use an unlocked PDF with 1–100 pages.")
        except Exception:
            raise HTTPException(400, "Use a readable, unlocked PDF with 1–100 pages.")
        saved = raw
    elif suffix in {".jpg", ".jpeg", ".png"}:
        try:
            with Image.open(io.BytesIO(raw)) as source:
                source.load()
                photo = ImageOps.exif_transpose(source).convert("RGB")
                photo.thumbnail((2400, 2400))
                out = io.BytesIO()
                photo.save(out, format="PDF", resolution=150)
                saved = out.getvalue()
        except (
            UnidentifiedImageError,
            OSError,
            ValueError,
            Image.DecompressionBombError,
        ):
            raise HTTPException(400, "Use a readable JPEG or PNG below 24 megapixels.")
    else:
        raise HTTPException(
            400, "Supported proposal attachments are PDF, JPEG and PNG."
        )
    if len(saved) > 8 * 1024 * 1024:
        raise HTTPException(400, "Converted file exceeds 8 MB.")
    record = str(uuid4())
    path = "bids/" + bid_id + "/" + record + ".pdf"
    # Metadata is created first so storage insertion can verify the bid's RLS scope.
    row = rest(
        "hba_bid_files",
        t,
        "POST",
        {
            "id": record,
            "bid_id": bid_id,
            "file_path": path,
            "original_name": name,
            "caption": caption,
            "sha256": hashlib.sha256(saved).hexdigest(),
        },
        representation=True,
    )[0]
    try:
        sb(
            "POST",
            "/storage/v1/object/hba-archive/" + path,
            t,
            content=saved,
            headers={"Content-Type": "application/pdf"},
        )
    except HTTPException:
        raise HTTPException(
            503,
            "File upload did not finish. A private attachment entry exists but its file is unavailable; ask the administrator to remove the failed entry before retrying.",
        )
    return row


voting.setup(
    app,
    rest=rest,
    sb=sb,
    require=require,
    board=board,
    homes=homes,
    visitor=visitor,
    rate=rate,
    anon_key=KEY,
)
ENGAGE.update(
    engagement.setup(
        app, rest=rest, require=require, board=board, notify_admin=notify_admin, uid=uid
    )
)
