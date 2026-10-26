"""Issues, decisions, team and officeholders, meetings, agenda, minutes and elections."""

from datetime import date, time as time_type, timedelta
from pathlib import Path
from urllib.parse import quote
from uuid import UUID, uuid4

import fitz
from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from hba.config import VALID, homes
from hba.push import notify_admin
from hba.routers.community import read_file
from hba.sessions import board, require
from hba.supabase import rest, sb

router = APIRouter()

class Issue(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    location: str = Field(default="", max_length=300)
    description: str = Field(min_length=1, max_length=12000)
    category: str = "general"

class IssueReview(BaseModel):
    state: str
    board_note: str = Field(default="", max_length=12000)

@router.post("/api/issues")
def add_issue(body: Issue, req: Request):
    t, m = require(req)
    if body.category not in {"roads", "drainage", "beach", "safety", "common_area", "general"}:
        raise HTTPException(400, "Invalid issue category.")
    rid = str(uuid4())
    rest("hba_issues", t, "POST", {**body.model_dump(), "id": rid})
    if m["role"] != "admin":
        notify_admin(t, "issue", "Problem reported", f"{m.get('display_name') or m['email']}: “{body.title}” ({body.category.replace('_', ' ')}).")
    return {"id": rid, "state": "pending_meeting"}

@router.put("/api/issues/{record_id}")
def review_issue(record_id: str, body: IssueReview, req: Request):
    t, _ = board(req)
    if body.state not in {"pending_meeting", "approved", "rejected", "further_review", "complete"}:
        raise HTTPException(400, "Invalid review state.")
    from datetime import datetime, timezone
    rest("hba_issues", t, "PATCH", {**body.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()},
         query="id=eq."+uid(record_id))
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

@router.post("/api/decisions")
def record_decision(body: Decision, req: Request):
    t, _ = board(req)
    if body.decision_type not in {"board", "capital", "dues", "amendment", "emergency"} or body.recorded_outcome not in {"proposed", "approved", "rejected", "deferred"}:
        raise HTTPException(400, "Invalid decision classification.")
    return rest("hba_decisions", t, "POST", body.model_dump(mode="json"), representation=True)[0]

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

STREET_GOVERNORS = ["Pilgrim", "Algelo", "Worrall", "Surf", "Turner", "Glen", "Reynolds"]
POSITIONS = ["President", "Vice President", "Secretary", "Treasurer",
             *[s + " Street Governor" for s in STREET_GOVERNORS], *[f"Governor at Large {n}" for n in range(1, 4)]]
HOME_STREET = {p["uid"]: p.get("street") or p["address"].split(" ", 1)[-1] for p in homes["properties"]}
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
        return {"position": street + " Street Governor", "street": street, "represented": True}
    return {"position": None, "street": street, "represented": False}

def team_rows(token, include_private):
    rows = rest("hba_officeholders", token, query="select=*")
    out = []
    for r in rows:
        shown = r.get("share_contact", True) or include_private
        out.append({"id": r["id"], "position": r["position"], "member_name": r["member_name"],
                    "household_uid": r.get("household_uid"), "address": HOME_ADDRESS.get(r.get("household_uid") or ""),
                    "term_start": r.get("term_start"), "term_end": r.get("term_end"), "source_note": r.get("source_note", ""),
                    "member_id": r.get("member_id"), "share_contact": r.get("share_contact", True),
                    "contact_phone": r.get("contact_phone", "") if shown else "",
                    "contact_email": r.get("contact_email", "") if shown else "",
                    "winter_address": r.get("winter_address", "") if shown else ""})
    order = {p: i for i, p in enumerate(POSITIONS)}
    out.sort(key=lambda r: order.get(r["position"], 99))
    return out

@router.get("/api/team")
def team(req: Request):
    token, member = require(req)
    is_board = member["role"] in {"board", "admin"}
    households = [h["household_uid"] for h in rest("hba_member_households", token, query="member_id=eq." + member["id"] + "&select=household_uid")]
    if member.get("household_uid") and member["household_uid"] not in households:
        households.insert(0, member["household_uid"])
    mine = []
    for uid in households:
        g = governor_for(uid)
        mine.append({"household_uid": uid, "address": HOME_ADDRESS.get(uid), **g})
    return {"positions": POSITIONS, "officeholders": team_rows(token, is_board), "my_households": mine, "board": is_board,
            "streets_without_governor": sorted({(HOME_STREET.get(u) or "").title() for u in HOME_STREET
                                                if street_name(u) not in STREET_GOVERNORS and HOME_STREET.get(u)})}

class GovernorMessage(BaseModel):
    to_position: str = Field(max_length=100)
    subject: str = Field(min_length=1, max_length=180)
    body: str = Field(min_length=1, max_length=6000)

@router.post("/api/team/messages")
def send_governor_message(body: GovernorMessage, req: Request):
    token, member = require(req)
    if body.to_position not in POSITIONS:
        raise HTTPException(400, "Choose an officer or governor position.")
    holder = rest("hba_officeholders", token, query="position=eq." + quote(body.to_position) + "&select=id")
    row = {"from_member_id": member["id"], "to_officeholder_id": holder[0]["id"] if holder else None,
           "to_position": body.to_position, "subject": body.subject.strip(), "body": body.body.strip()}
    saved = rest("hba_governor_messages", token, "POST", row, representation=True)[0]
    if member["role"] != "admin":
        notify_admin(token, "message", f"Message to the {body.to_position}", f"{member.get('display_name') or member['email']}: “{row['subject']}”.")
    return {"saved": True, "message": saved, "delivered_in_app": True,
            "note": "Saved to the board inbox in this app. No email or text was sent automatically."}

@router.get("/api/team/messages")
def list_governor_messages(req: Request):
    token, member = require(req)
    rows = rest("hba_governor_messages", token, query="select=*&order=created_at.desc&limit=300")
    members = {m["id"]: m for m in rest("hba_members", token, query="select=id,display_name,email,household_uid,role")} if member["role"] in {"board", "admin"} else {}
    for r in rows:
        m = members.get(r["from_member_id"]) if members else None
        r["from_name"] = (m or {}).get("display_name") or ((m or {}).get("email") if m else None) or ("You" if r["from_member_id"] == member["id"] else "Resident")
        if (m or {}).get("role") == "deleted":
            r["from_name"] += " (former resident)"
        r["from_address"] = HOME_ADDRESS.get((m or {}).get("household_uid") or "") if m else None
    mine_positions = {o["position"] for o in rest("hba_officeholders", token, query="member_id=eq." + member["id"] + "&select=position")} if member["role"] in {"board", "admin"} else set()
    return {"messages": rows, "my_positions": sorted(mine_positions), "board": member["role"] in {"board", "admin"}}

class GovernorMessageReview(BaseModel):
    state: str
    board_note: str = Field(default="", max_length=3000)

@router.put("/api/team/messages/{record_id}")
def review_governor_message(body: GovernorMessageReview, req: Request, record_id: str):
    t, _ = board(req)
    if body.state not in {"new", "read", "replied"}:
        raise HTTPException(400, "Invalid message state.")
    return rest("hba_governor_messages", t, "PATCH", {"state": body.state, "board_note": body.board_note, "updated_at": datetime.now(timezone.utc).isoformat()},
                query="id=eq." + uid(record_id), representation=True)

@router.post("/api/officeholders")
@router.put("/api/officeholders/{record_id}")
def record_officeholder(body: Officeholder, req: Request, record_id: str | None = None):
    t, member = board(req)
    positions = set(POSITIONS)
    if body.position not in positions or (body.household_uid and body.household_uid not in VALID):
        raise HTTPException(400, "Check the position and household.")
    if body.term_start and body.term_end and body.term_end < body.term_start:
        raise HTTPException(400, "Term end precedes its start.")
    if body.member_id:
        linked=rest("hba_members", t, query="id=eq."+str(body.member_id)+"&select=role")
        if not linked or linked[0]["role"] not in {"board","admin"}:
            raise HTTPException(400, "Link an approved board account.")
    old = rest("hba_officeholders", t, query="id=eq."+uid(record_id)) if record_id else []
    changed_access = (body.position in {"President","Secretary"} and str(body.member_id or "") != str(old[0].get("member_id") or "") if old else body.position in {"President","Secretary"} and body.member_id is not None)
    if changed_access and member["role"] != "admin":
        raise HTTPException(403, "Only the administrator may link a meeting-scheduler office to an account.")
    return rest("hba_officeholders", t, "PATCH" if record_id else "POST", body.model_dump(mode="json"),
                query="id=eq."+uid(record_id) if record_id else "", representation=True)

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
        raise HTTPException(403, "A linked President or Secretary account, or administrator, is required.")
    return t, m

@router.get("/api/upcoming")
def upcoming(req: Request):
    """Compact calendar feed for the dashboard: recorded events and meetings from the start of this month onward,
    plus the standing board-meeting rule. Projections (annual supper, monthly board meeting) are computed client-side."""
    token, m = require(req)
    from datetime import date as _date
    start = _date.today().replace(day=1).isoformat()
    events = rest("hba_events", token, query="select=id,series_id,title,event_date,event_time,rain_date,use_rain_date,state,planning_only,location&state=eq.scheduled&or=(event_date.gte."+start+",rain_date.gte."+start+")&order=event_date.asc")
    meetings = rest("hba_meetings", token, query="select=id,title,meeting_date,meeting_time,duration_minutes,location,audience,state&meeting_date=gte."+start+"&order=meeting_date.asc,meeting_time.asc")
    series = rest("hba_series", token, query="select=id,title,recurrence_rule,first_year")
    settings = {r["key"]: r["value"] for r in rest("hba_settings", token, query="select=key,value&key=in.(public_board_meeting_rule,public_supper_defaults)")}
    return {"today": _date.today().isoformat(), "events": events, "meetings": meetings, "series": series,
            "board_meeting_rule": settings.get("public_board_meeting_rule", ""), "supper_defaults": settings.get("public_supper_defaults", ""), "can_schedule": bool(rest("rpc/hba_can_schedule", token, "POST", {})) if m["role"] in {"board","admin"} else False}

@router.post("/api/meetings")
@router.put("/api/meetings/{record_id}")
def save_meeting(body: Meeting, req: Request, record_id: str | None = None):
    from datetime import time
    t, _ = scheduler(req)
    try:
        time.fromisoformat(body.meeting_time)
    except ValueError:
        raise HTTPException(400, "Enter a valid local meeting time.")
    if body.state not in {"scheduled","held","cancelled"}:
        raise HTTPException(400, "Invalid meeting state.")
    if body.audience not in {"board","general"}:
        raise HTTPException(400, "Choose a Board of Governors or general membership meeting.")
    return rest("hba_meetings", t, "PATCH" if record_id else "POST", body.model_dump(mode="json"),
                query="id=eq."+uid(record_id) if record_id else "", representation=True)[0]

@router.put("/api/meetings/{record_id}/access")
def save_meeting_access(record_id: str, body: MeetingAccess, req: Request):
    from urllib.parse import urlparse
    t, _ = scheduler(req)
    parsed=urlparse(body.zoom_url)
    if body.zoom_url and (parsed.scheme!="https" or not (parsed.hostname=="zoom.us" or (parsed.hostname or "").endswith(".zoom.us")) or parsed.username or parsed.password):
        raise HTTPException(400, "Use a valid HTTPS zoom.us participant link. Do not enter host/start links.")
    if parsed.path.startswith("/s/"):
        raise HTTPException(400, "Use a participant join link, not a host start link.")
    if body.reminder_hours not in {1,2,24,48}:
        raise HTTPException(400, "Choose a supported reminder interval.")
    rid=uid(record_id)
    existing=rest("hba_meeting_access", t, query="id=eq."+rid)
    rest("hba_meeting_access", t, "PATCH" if existing else "POST",
         body.model_dump() if existing else {"id":rid,**body.model_dump()},
         query="id=eq."+rid if existing else "")
    return {"saved":True, "delivery_active":False}

@router.post("/api/agenda")
@router.put("/api/agenda/{record_id}")
def save_agenda(body: AgendaItem, req: Request, record_id: str | None = None):
    t, _ = board(req)
    if body.audience not in {"board","members"} or body.state not in {"submitted","included","deferred","addressed"}:
        raise HTTPException(400, "Invalid agenda classification.")
    return rest("hba_agenda_items", t, "PATCH" if record_id else "POST", body.model_dump(mode="json"),
                query="id=eq."+uid(record_id) if record_id else "", representation=True)[0]

# ---- Meeting minutes -------------------------------------------------------------------------------
def minutes_editor(req):
    t, m = board(req)
    if not rest("rpc/hba_can_edit_minutes", t, "POST", {}):
        raise HTTPException(403, "The linked, in-term Secretary account or administrator is required to write minutes.")
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

@router.post("/api/minutes")
@router.put("/api/minutes/{record_id}")
def save_minutes(body: Minutes, req: Request, record_id: str | None = None):
    t, _ = minutes_editor(req)
    if not body.title.strip():
        raise HTTPException(400, "Enter a title, for example 'Board of Governors Meeting'.")
    if body.meeting_date > date.today() + timedelta(days=1):
        raise HTTPException(400, "Minutes record a meeting that has happened; the date cannot be in the future.")
    payload = {**body.model_dump(mode="json"), "title": body.title.strip(),
               "meeting_time": clock_or_none(body.meeting_time, "the meeting time"),
               "called_to_order": clock_or_none(body.called_to_order, "the call to order"),
               "adjourned": clock_or_none(body.adjourned, "adjournment")}
    if body.meeting_id:
        payload["meeting_id"] = uid(body.meeting_id)
        if not rest("hba_meetings", t, query="select=id&id=eq."+payload["meeting_id"]):
            raise HTTPException(404, "That recorded meeting was not found.")
    else:
        payload["meeting_id"] = None
    if record_id:
        rows = rest("hba_meeting_minutes", t, query="id=eq."+uid(record_id))
        if not rows:
            raise HTTPException(404, "Minutes not found.")
        if rows[0]["state"] != "draft":
            raise HTTPException(409, "Return the minutes to draft before editing approved text.")
    result = rest("hba_meeting_minutes", t, "PATCH" if record_id else "POST", payload,
                  query="id=eq."+uid(record_id) if record_id else "", representation=True)
    return result[0] if result else None

class MinutesState(BaseModel):
    state: str
    approved_on: date | None = None
    approved_note: str = Field(default="", max_length=400)

@router.put("/api/minutes/{record_id}/state")
def minutes_state(record_id: str, body: MinutesState, req: Request):
    t, _ = minutes_editor(req)
    if body.state not in {"draft", "approved"}:
        raise HTTPException(400, "Choose draft or approved.")
    rows = rest("hba_meeting_minutes", t, query="id=eq."+uid(record_id))
    if not rows:
        raise HTTPException(404, "Minutes not found.")
    if body.state == "approved":
        if not (rows[0]["body"].strip() or rows[0]["file_path"]):
            raise HTTPException(400, "Add minutes text or a readable PDF before marking them approved.")
        if not body.approved_on:
            raise HTTPException(400, "Enter the date the board approved these minutes.")
        if body.approved_on.isoformat() < str(rows[0]["meeting_date"]):
            raise HTTPException(400, "Approval cannot be dated before the meeting itself.")
        patch = {"state": "approved", "approved_on": body.approved_on.isoformat(), "approved_note": body.approved_note.strip()}
    else:
        patch = {"state": "draft", "approved_on": None, "approved_note": ""}
    return rest("hba_meeting_minutes", t, "PATCH", patch, query="id=eq."+uid(record_id), representation=True)[0]

@router.post("/api/minutes/{record_id}/file")
async def minutes_file(record_id: str, req: Request, background: BackgroundTasks, file: UploadFile = File(...)):
    t, _ = minutes_editor(req)
    rid = uid(record_id)
    rows = rest("hba_meeting_minutes", t, query="id=eq."+rid)
    if not rows or rows[0]["state"] != "draft":
        raise HTTPException(409, "Save a draft before attaching or replacing a PDF.")
    raw = await read_file(file, 8*1024*1024)
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
    sb("POST", "/storage/v1/object/hba-archive/"+path, t, content=raw, headers={"Content-Type": "application/pdf"})
    return rest("hba_meeting_minutes", t, "PATCH",
                {"file_path": path, "original_name": Path(file.filename or "minutes.pdf").name[:200]},
                query="id=eq."+rid, representation=True)[0]

class ElectionCycle(BaseModel):
    meeting_id: UUID | None = None
    nomination_deadline: date | None = None
    state: str = "planning"
    notice: str = Field(default="",max_length=5000)
    positions: str = Field(default="",max_length=3000)
    nomination_instructions: str = Field(default="",max_length=5000)
    results: str = Field(default="",max_length=10000)
    source_note: str = Field(default="",max_length=3000)

@router.put("/api/elections/{year}")
def save_election(year:int,body:ElectionCycle,req:Request):
    t,_=board(req)
    if year<2027 or year>2200 or (year-2027)%2:
        raise HTTPException(400,"Election years are 2027, 2029, 2031 and every two years after that.")
    if body.state not in {"planning","nominations_open","meeting_scheduled","results_recorded"}:
        raise HTTPException(400,"Choose a valid election planning status.")
    old=rest("hba_elections",t,query="year=eq."+str(year))
    values=body.model_dump(mode="json")
    if not old:values["year"]=year
    return rest("hba_elections",t,"PATCH" if old else "POST",values,
                query="year=eq."+str(year) if old else "",representation=True)[0]
