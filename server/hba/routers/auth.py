"""Sign-in, sign-up, sessions, view mode, account passwords and member administration."""

import re
import secrets
import time

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from hba import supabase
from hba.config import KEY, URL, VALID, homes
from hba.push import notify_admin
from hba.sessions import asset_auth_cache, asset_auth_lock, board, drop_session, put_session, rate, read_session, uid
from hba.supabase import rest, sb

router = APIRouter()

class ViewMode(BaseModel):
    mode:str

@router.post("/api/view-mode")
def set_view_mode(body:ViewMode,req:Request):
    s,m=read_session(req)
    if m.get("actual_role",m["role"]) not in {"board","admin"}:
        raise HTTPException(403,"Only a board account can switch between board and resident views.")
    if body.mode not in {"board","resident"}:raise HTTPException(400,"Choose board or resident view.")
    s["view_mode"]=body.mode
    put_session(req,s)
    with asset_auth_lock:asset_auth_cache.clear()
    return {"saved":True,"view_mode":body.mode}

class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=200)
    display_name: str = Field(default="", max_length=120)
    requested_household_uid: str = Field(default="", max_length=100)
    request_note: str = Field(default="", max_length=1000)
    sms_phone: str = Field(default="", max_length=20)
    sms_topics: list[str] = Field(default_factory=list, max_length=8)
    sms_consent: bool = False

SMS_TOPIC_LABELS = {"roads": "Road work & plowing", "beach": "Beach, jetty & sand updates", "events": "Events & annual supper", "speed_bumps": "Speed bumps & traffic", "votes": "Votes, polls & results", "meetings": "Meeting notices & reminders", "weather": "Severe weather & coastal flooding", "general": "General association notices"}
SMS_TOPICS = tuple(SMS_TOPIC_LABELS)

@router.get("/api/health")
def health(probe: int = 0):
    """Liveness check. probe=1 also reports whether Supabase Auth and REST answer, without revealing any credential."""
    out = {"service": "HBA community", "configured": bool(URL and KEY)}
    if probe:
        from urllib.parse import urlparse
        host = urlparse(URL).hostname or ""
        out["storage_host_kind"] = "supabase" if host.endswith("supabase.co") else "proxied"
        for name, path in (("auth", "/auth/v1/health"), ("rest", "/rest/v1/hba_public_advisories?select=category&limit=1")):
            try:
                r = supabase.client.get(URL + path, headers={"apikey": KEY})
                out[name] = f"{r.status_code} " + ("ok" if not r.is_error else r.text[:90].replace("\n", " "))
            except httpx.HTTPError as exc:
                out[name] = "error " + type(exc).__name__
    return out

@router.get("/api/session")
def session(req: Request):
    try:
        s, m = read_session(req, False)
    except HTTPException as e:
        if e.status_code == 401:
            return {"signed_in": False}
        raise
    if m.get("role") == "pending":
        home = next((p["address"].title() for p in homes["properties"] if p["uid"] == m.get("requested_household_uid")), None)
        notify_admin(s["token"], "account", "Account request", f"{m.get('display_name') or m['email']} ({m['email']}){(' · '+home) if home else ''} is waiting for approval.", dedupe="account:"+str(m["id"]))
    return {"signed_in": True, "member": m, "proof": s["proof"]}

@router.get("/api/auth/addresses")
def signup_addresses():
    """Street addresses only (public assessor data) so a resident can pick their household when requesting an account."""
    return {"addresses": sorted(({"uid": p["uid"], "address": p["address"].title()} for p in homes["properties"]), key=lambda a: (a["address"].split(" ", 1)[1], int(re.match(r"\d+", a["address"]).group()) if re.match(r"\d+", a["address"]) else 0)),
            "sms_topics": [{"value": k, "label": v} for k, v in SMS_TOPIC_LABELS.items()]}

@router.post("/api/auth/{action}")
def auth(action: str, body: Credentials, req: Request):
    rate(req)
    if action not in {"login", "signup"} or "@" not in body.email:
        raise HTTPException(400, "Enter a valid email and password.")
    email = body.email.strip().lower()
    if action == "signup":
        if body.requested_household_uid and body.requested_household_uid not in VALID:
            raise HTTPException(400, "Choose your Hamilton Beach address from the list, or leave it blank and explain in the note.")
        meta = {"display_name": body.display_name.strip(), "requested_household_uid": body.requested_household_uid, "request_note": body.request_note.strip()}
        phone = re.sub(r"\D", "", body.sms_phone)
        if phone:
            if len(phone) == 11 and phone.startswith("1"):
                phone = phone[1:]
            if len(phone) != 10 or phone[0] not in "23456789":
                raise HTTPException(400, "Enter a 10-digit US mobile number for SMS alerts, or leave it blank.")
            topics = [t for t in dict.fromkeys(body.sms_topics) if t in SMS_TOPICS]
            if not topics:
                raise HTTPException(400, "Choose at least one SMS topic, or leave the phone number blank.")
            if not body.sms_consent:
                raise HTTPException(400, "Tick the SMS consent box to request text alerts.")
            meta.update(sms_phone="+1" + phone, sms_topics=topics, sms_consent="true")
        sb("POST", "/auth/v1/signup", json={"email": email, "password": body.password, "data": meta})
        return {"message": "Check your email to confirm your address, then sign in. Your request then goes to the board for approval; you will see a waiting screen until a board member approves it and links your household." + (" Your SMS topics are saved with the request and activate on approval (texting itself is not switched on yet)." if phone else "")}
    d = sb("POST", "/auth/v1/token?grant_type=password", json={"email": email, "password": body.password}).json()
    put_session(req, {"token": d["access_token"], "refresh": d["refresh_token"],
                "expires": time.time()+d["expires_in"], "proof": secrets.token_urlsafe(32),
                "started":time.time(),"seen":time.time()})
    return session(req)

@router.post("/api/logout")
def logout(req: Request):
    s, _ = read_session(req)
    try:
        sb("POST", "/auth/v1/logout?scope=local", s["token"])
    finally:
        drop_session(req)
    return {"signed_in": False}

class MemberChange(BaseModel):
    role: str
    household_uid: str | None = None

@router.put("/api/members/{record_id}")
def update_member(record_id: str, body: MemberChange, req: Request):
    t, m = board(req)
    if body.household_uid and body.household_uid not in VALID:
        raise HTTPException(400, "Invalid mapped household.")
    if body.role not in {"pending", "resident", "board", "suspended"} or (body.role == "board" and m["role"] != "admin"):
        raise HTTPException(403, "Administrator required for board permissions.")
    rest("rpc/hba_manage_member", t, "POST", {"member_id": uid(record_id), "new_role": body.role, "new_household": body.household_uid})
    return {"saved": True}

# Temporary passwords: three short nautical words and four digits, readable aloud over the phone. Never logged or stored.
TEMP_WORDS = ["harbor", "tide", "jetty", "anchor", "buoy", "sail", "marsh", "dune", "gull", "shell", "surf", "pier", "cove",
              "kelp", "reef", "mast", "keel", "ferry", "canal", "island", "beach", "breeze", "pilgrim", "algelo", "worrall", "glen"]

def temp_password():
    words = [secrets.choice(TEMP_WORDS).capitalize() for _ in range(3)]
    return "-".join(words) + "-" + f"{secrets.randbelow(10000):04d}"

@router.delete("/api/members/{record_id}")
def delete_member(record_id: str, req: Request):
    """Board/admin: remove a resident's login and household links. Their records stay, attributed as a former resident."""
    t, m = board(req)
    if uid(record_id) == m["id"]:
        raise HTTPException(400, "You cannot delete your own account.")
    result = rest("rpc/hba_delete_member", t, "POST", {"target": uid(record_id)})
    return result or {"deleted": True}

@router.post("/api/members/{record_id}/reset-password")
def reset_member_password(record_id: str, req: Request):
    """Board/admin: issue a one-time temporary password, shown once to the board member. The resident must choose a new one at sign-in."""
    t, m = board(req)
    if uid(record_id) == m["id"]:
        raise HTTPException(400, "Use Change password for your own account.")
    temp = temp_password()
    result = rest("rpc/hba_reset_password", t, "POST", {"target": uid(record_id), "new_password": temp}) or {}
    result["temporary_password"] = temp
    return result

class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=10, max_length=200)

@router.post("/api/account/password")
def change_password(body: PasswordChange, req: Request):
    """Signed-in member changes their own password: the current (or temporary) password is checked first."""
    rate(req)
    s, m = read_session(req)
    if body.new_password == body.current_password:
        raise HTTPException(400, "Choose a new password that is different from the current one.")
    if body.new_password.lower() in {m.get("email", "").lower(), "hamiltonbeach", "hamilton beach"} or len(set(body.new_password)) < 4:
        raise HTTPException(400, "Choose a longer, less predictable password.")
    # Verify the current password against Supabase Auth before changing anything.
    try:
        check = sb("POST", "/auth/v1/token?grant_type=password", json={"email": m["email"], "password": body.current_password}).json()
    except HTTPException:
        raise HTTPException(400, "The current password is not correct.")
    try:
        sb("POST", "/auth/v1/logout?scope=local", check.get("access_token"))
    except HTTPException:
        pass
    sb("PUT", "/auth/v1/user", s["token"], json={"password": body.new_password})
    rest("rpc/hba_password_changed", s["token"], "POST", {})
    return {"changed": True}
