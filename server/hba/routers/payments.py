"""Payment settings, public settings, payment reports, donations, notices and advisories."""

import json
import re
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from hba.config import VALID
from hba.push import notify_admin
from hba.sessions import board, require, uid
from hba.supabase import rest, sb

router = APIRouter()

class PaymentSettings(BaseModel):
    recipient_name: str = Field(default="", max_length=180)
    recipient_identifier: str = Field(default="", max_length=180)
    enabled: bool = False
    venmo_name: str = Field(default="",max_length=180)
    venmo_handle: str = Field(default="",max_length=64)
    venmo_enabled: bool = False
    # Pay by check (stored as the public setting public_check_payment; no payment table change)
    check_payee: str = Field(default="", max_length=180)
    check_address: str = Field(default="", max_length=400)
    dues_amount: str = Field(default="", max_length=40)
    dues_due_by: str = Field(default="", max_length=80)
    check_source: str = Field(default="", max_length=240)

# Board-editable public cards on the bulletin (Facebook group, Local Sands store). Links must be https and point at
# Facebook, Instagram or an ordinary web shop; anything else is refused so no guessed or unsafe link is shown.
PUBLIC_SETTING_KEYS = {"public_facebook_group_name", "public_facebook_group_url", "public_facebook_group_note",
                       "public_local_sands_name", "public_local_sands_url", "public_local_sands_note",
                       "public_hidden_tools"}
class SettingValue(BaseModel):
    value: str = Field(default="", max_length=2000)

@router.put("/api/settings/{key}")
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
        if not isinstance(ids, list) or len(ids) > 200 or any(not isinstance(i, str) or not re.fullmatch(r"[a-z0-9-]{1,40}", i) for i in ids):
            raise HTTPException(400, "Hidden tools must be a list of tool ids.")
        value = json.dumps(sorted(set(ids)))
    if key.endswith("_url") and value:
        if not re.fullmatch(r"https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/[^\s]*)?", value):
            raise HTTPException(400, "Enter a full https:// link copied from the page's Share menu.")
        if key == "public_facebook_group_url" and not re.search(r"https://([a-z0-9-]+\.)?facebook\.com/", value):
            raise HTTPException(400, "The group link must be a facebook.com address.")
    sb("POST", "/rest/v1/hba_settings?on_conflict=key", t, json={"key": key, "value": value},
       headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
    return {"saved": True, "key": key, "value": value}

@router.get("/api/tool-settings")
def tool_settings(req: Request):
    """Which dashboard buttons the administrator has hidden from residents (an empty list until one is hidden)."""
    token, _ = require(req)
    rows = rest("hba_settings", token, query="select=key,value&key=eq.public_hidden_tools")
    try:
        hidden = json.loads(rows[0]["value"]) if rows and rows[0].get("value") else []
    except ValueError:
        hidden = []
    return {"hidden": hidden if isinstance(hidden, list) else []}

@router.put("/api/payment-settings")
def payment_settings(body: PaymentSettings, req: Request):
    t, member = require(req, ("admin",))
    if body.enabled and (not body.recipient_name.strip() or not body.recipient_identifier.strip()):
        raise HTTPException(400, "Verify HBA's enrolled recipient before enabling instructions.")
    body.venmo_handle=body.venmo_handle.strip().lstrip("@")
    if body.venmo_enabled and (not body.venmo_name.strip() or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}",body.venmo_handle)):
        raise HTTPException(400,"Verify HBA's official Venmo profile and enter its username without a URL before enabling it.")
    check = {"payee": body.check_payee.strip(), "address": body.check_address.strip(), "dues_amount": body.dues_amount.strip(),
             "due_by": body.dues_due_by.strip(), "source": body.check_source.strip(), "updated_at": datetime.now(timezone.utc).isoformat()}
    core = {k: v for k, v in body.model_dump().items() if k not in {"check_payee","check_address","dues_amount","dues_due_by","check_source"}}
    rest("hba_payment_settings", t, "PATCH", {**core,"updated_by":member["id"],"updated_at":datetime.now(timezone.utc).isoformat()},
         query="id=eq.1")
    sb("POST", "/rest/v1/hba_settings?on_conflict=key", t, json={"key": "public_check_payment", "value": json.dumps(check)},
       headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
    return {"saved":True}

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

@router.post("/api/payment-reports")
def payment_report(body: PaymentReport, req: Request):
    t, m = require(req)
    if not m.get("household_uid") or m["household_uid"] not in VALID:
        raise HTTPException(400, "Ask the board to link your household before submitting payment information.")
    if body.payment_method not in {"zelle","venmo","check","cash","other","unspecified"}:
        raise HTTPException(400,"Choose a supported payment method.")
    if body.payment_kind not in {"dues","donation"} or body.fund not in {"dues","beach_nourishment","jetties","road_replacement","events","general"}:
        raise HTTPException(400, "Choose a supported payment purpose.")
    if (body.payment_kind=="dues") != (body.fund=="dues") or (body.event_id and body.fund!="events"):
        raise HTTPException(400, "Check the payment purpose and event.")
    if body.payment_date>datetime.now(timezone.utc).date():
        raise HTTPException(400, "A payment report cannot claim a future payment date.")
    saved = rest("hba_payment_reports", t, "POST",
                {**body.model_dump(mode="json"),"amount":round(body.amount,2),"household_uid":m["household_uid"]},
                representation=True)[0]
    if m["role"] != "admin":
        notify_admin(t, "payment", "Payment report to verify", f"{m.get('display_name') or m['email']}: ${round(body.amount,2):,.2f} {body.payment_kind} by {body.payment_method}, {body.payment_date}.")
    return saved

@router.get("/api/donations/leaderboard")
def donation_leaderboard(req: Request, year: int | None = None):
    """Aggregate-only donation totals: by fund, by street, and an opt-in honor roll. No individual amounts."""
    t, _ = require(req)
    if year is not None and not 2020 <= year <= 2100:
        raise HTTPException(400, "Choose a year between 2020 and 2100.")
    data = rest("rpc/hba_donation_leaderboard", t, "POST", {"p_year": year})
    if not data:
        raise HTTPException(403, "Approved residents and board members can see the donor board.")
    return {**data, "source": "Verified resident payment reports marked donation; dues are excluded."}

@router.get("/api/board-notifications")
def board_notifications(req: Request):
    t, _ = board(req)
    rows=rest("hba_payment_reports",t,query="select=id,created_at&state=eq.pending&order=created_at.desc&limit=1000")
    messages=rest("hba_governor_messages",t,query="select=id&state=eq.new&limit=1000")
    def count(table, query):
        try:
            return len(rest(table, t, query=query+"&limit=1000") or [])
        except HTTPException:
            return 0
    requests = {
        "accounts": count("hba_members", "select=id&role=eq.pending"),
        "payments": len(rows),
        "messages": len(messages),
        "issues": count("hba_issues", "select=id&state=eq.pending_meeting"),
        "stories": count("hba_house_history", "select=id&status=eq.pending"),
        "photos": count("hba_photos", "select=id&status=eq.pending&issue_id=is.null&work_id=is.null"),
        "storms": count("hba_storm_memories", "select=id&status=eq.pending"),
        "hosting": count("hba_event_host_offers", "select=id&state=eq.pending"),
    }
    return {"pending_payments":len(rows),"latest_id":rows[0]["id"] if rows else None,"new_governor_messages":len(messages),
            "requests": requests, "total": sum(requests.values())}

class PaymentReview(BaseModel):
    state: str
    board_note: str = Field(default="", max_length=3000)

@router.put("/api/payment-reports/{record_id}")
def review_payment(record_id: str, body: PaymentReview, req: Request):
    t, m = board(req)
    if body.state not in {"pending","verified","rejected"}:
        raise HTTPException(400, "Invalid reconciliation status.")
    rest("hba_payment_reports",t,"PATCH",{**body.model_dump(),"reviewed_by":m["id"],"reviewed_at":datetime.now(timezone.utc).isoformat()},
         query="id=eq."+uid(record_id))
    return {"saved":True,"dues_registry_changed":False}

class Advisory(BaseModel):
    category: str
    location: str = Field(min_length=1, max_length=300)
    status: str
    note: str = Field(default="", max_length=3000)
    source_url: str = Field(max_length=2000)
    checked_at: datetime
    valid_until: datetime

@router.post("/api/advisories")
def advisory(body: Advisory, req: Request):
    from urllib.parse import urlparse
    t, _ = board(req)
    host=urlparse(body.source_url).hostname or ""
    if body.category not in {"swimming","shellfishing"} or body.status not in {"open","closed","unverified"}:
        raise HTTPException(400,"Check advisory category and status.")
    if urlparse(body.source_url).scheme!="https" or not any(host==h or host.endswith("."+h) for h in ["mass.gov","wareham.ma.us"]):
        raise HTTPException(400,"Link the actual official Wareham or Massachusetts notice.")
    if body.checked_at.tzinfo is None or body.valid_until.tzinfo is None:
        raise HTTPException(400,"Include the advisory time zone.")
    now=datetime.now(timezone.utc)
    if body.checked_at>now+timedelta(minutes=5) or not body.checked_at<body.valid_until<=body.checked_at+timedelta(hours=24):
        raise HTTPException(400,"Use a recent source check and an expiry no more than 24 hours later.")
    return rest("hba_public_advisories",t,"POST",body.model_dump(mode="json"),representation=True)[0]
