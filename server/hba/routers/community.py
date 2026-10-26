"""The member dashboard feed, events, house history, storm memories, documents and photos."""

import hashlib
import io
import time
from datetime import date
from pathlib import Path
from uuid import UUID, uuid4

import document_intake
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from hba.config import ENGAGE, VALID
from hba.push import notify_admin
from hba.sessions import board, require, uid
from hba.supabase import rest, sb

router = APIRouter()

@router.get("/api/community")
def community(req: Request):
    token, m = require(req)
    data = {key: rest(table, token, query="select=*&order=" + order) for key, table, order in [
        ("series", "hba_series", "title.asc"), ("events", "hba_events", "event_date.desc"),
        ("documents", "hba_documents", "document_year.desc.nullslast,created_at.desc"),
        ("history", "hba_house_history", "history_year.desc.nullslast,created_at.desc"),
        ("photos", "hba_photos", "created_at.desc")]}
    data.update(member=m)
    data["officeholders"] = rest("hba_officeholders", token, query="select=*")
    data["elections"] = rest("hba_elections",token,query="select=*&order=year.asc")
    data["bid_requests"] = rest("hba_bid_requests",token,query="select=*&order=created_at.desc")
    data["bids"] = rest("hba_bids",token,query="select=*&order=amount.asc,created_at.desc")
    data["bid_files"] = rest("hba_bid_files",token,query="select=*&order=created_at.asc")
    if m["role"] in {"board","admin"}:
        data["bid_reviews"] = rest("hba_bid_reviews",token,query="select=*&order=created_at.desc")
    data["meetings"] = rest("hba_meetings", token, query="select=*&order=meeting_date.asc,meeting_time.asc")
    data["agenda"] = rest("hba_agenda_items", token, query="select=*&order=sort_order.asc,created_at.asc")
    data["can_schedule"] = rest("rpc/hba_can_schedule", token, "POST", {})
    data["can_edit_newsletter"] = rest("rpc/hba_can_edit_newsletter", token, "POST", {})
    data["can_edit_finance"] = rest("rpc/hba_can_edit_finance", token, "POST", {})
    data["newsletters"] = rest("hba_newsletters", token, query="select=*&order=issue_date.desc,created_at.desc")
    data["can_edit_minutes"] = rest("rpc/hba_can_edit_minutes", token, "POST", {})
    data["minutes"] = rest("hba_meeting_minutes", token, query="select=*&order=meeting_date.desc,created_at.desc")
    data["sms_preferences"] = rest("hba_sms_preferences", token, query="select=*&member_id=eq."+m["id"])
    data["settings"] = {r["key"]:r["value"] for r in rest("hba_settings", token, query="select=key,value")}
    data["member_households"] = rest("hba_member_households", token, query="select=*")
    data["voting_procedures"] = (rest("hba_voting_procedures", token, query="select=id,version_label,adopted_on,confirmed_at,online_ballots_allowed") or [{}])[0]
    data["sms_service"] = {"ready": False, "status": "Not activated: sender connection and phone verification are not configured."}
    data["volunteer_tasks"] = rest("hba_volunteer_tasks", token, query="select=*&order=task_date.asc.nullslast,created_at.desc")
    data["volunteer_counts"] = rest("rpc/hba_volunteer_counts", token, "POST", {})
    data["volunteer_signups"] = rest("hba_volunteer_signups", token, query="select=*&order=created_at.asc")
    data["volunteer_email_preferences"] = rest("hba_volunteer_email_preferences", token, query="select=*&member_id=eq."+m["id"])
    data["research_reports"] = rest("hba_research_reports",token,query="select=*&order=created_at.desc&limit=20")
    data["bank_summaries"] = rest("hba_bank_summaries",token,query="select=*&order=period_end.desc,created_at.desc&limit=20")
    if m["role"] in {"board", "admin"}:
        data["document_intakes"] = rest("hba_document_intakes",token,query="select=document_id,state,summary,updated_at&order=updated_at.desc")
        data["document_facts"] = rest("hba_document_facts",token,query="select=*&order=created_at.desc")
        data["sms_counts"] = rest("rpc/hba_sms_counts", token, "POST", {})
        data["sms_drafts"] = rest("hba_sms_drafts", token, query="select=*&order=updated_at.desc")
    data["payment_settings"] = rest("hba_payment_settings", token, query="select=*")[0]
    data["payment_reports"] = rest("hba_payment_reports", token, query="select=*&order=created_at.desc")
    if m["role"] in {"board", "admin"}:
        data["work"] = rest("hba_work", token, query="select=*&order=created_at.desc")
        data["work_notes"] = rest("hba_work_notes", token, query="select=*&order=created_at.desc")
        data["members"] = rest("hba_members", token, query="select=*&role=neq.deleted&order=created_at.desc")
        data["account_audit"] = rest("hba_account_audit", token, query="select=*&order=created_at.desc&limit=60")
        data["issues"] = rest("hba_issues", token, query="select=*&order=created_at.desc")
        data["decisions"] = rest("hba_decisions", token, query="select=*&order=meeting_date.desc")
        data["meeting_access"] = rest("hba_meeting_access", token, query="select=*")
        data["meeting_integrations"] = {"zoom": False, "email_authorized_during_setup": True, "email_delivery_tested": False, "reminders": False}
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

class StormMemory(BaseModel):
    storm_key: str = Field(min_length=1, max_length=60)
    storm_label: str = Field(min_length=1, max_length=120)
    event_year: int | None = Field(default=None, ge=1600, le=2100)
    title: str = Field(min_length=1, max_length=160)
    story: str = Field(min_length=1, max_length=6000)
    where_text: str = Field(default="", max_length=200)
    show_name: bool = False
    display_name: str = Field(default="", max_length=120)

@router.get("/api/storm-memories")
def storm_memories(req: Request):
    """Resident memories of storms; RLS returns published rows plus the reader's own pending ones (board sees all)."""
    t, m = require(req)
    memories = rest("hba_storm_memories", t, query="select=*&order=event_year.desc.nullslast,created_at.desc")
    photos = rest("hba_photos", t, query="select=id,storm_id,caption,credit,status,created_at,created_by&storm_id=not.is.null&order=created_at.asc") if memories else []
    return {"memories": memories, "photos": photos, "member": {"role": m["role"], "user_id": m["id"]}}

@router.post("/api/storm-memories")
def storm_memory_add(body: StormMemory, req: Request):
    t, m = require(req)
    data = body.model_dump()
    if not data["show_name"]:
        data["display_name"] = ""
    data["status"] = "published" if m["role"] in {"board", "admin"} else "pending"
    rows = rest("hba_storm_memories", t, "POST", data, representation=True)
    if data["status"] == "pending":
        notify_admin(t, "storm", "Storm memory to review", f"{m.get('display_name') or m['email']}: “{data['title']}” ({data['storm_label']}).")
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

@router.post("/api/series")
def add_series(body: Series, req: Request):
    t, _ = board(req)
    return rest("hba_series", t, "POST", body.model_dump(), representation=True)[0]

@router.post("/api/events")
@router.put("/api/events/{record_id}")
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
    saved = rest("hba_events", t, "PATCH" if record_id else "POST", body.model_dump(mode="json",exclude_unset=bool(record_id)),
                 query="id=eq."+uid(record_id) if record_id else "", representation=True)
    # Every new scheduled event gets a volunteer sign-up sheet (when that storage exists).
    if not record_id and saved and body.state == "scheduled" and ENGAGE.get("ensure_task"):
        try:
            ENGAGE["ensure_task"](t, saved[0])
        except HTTPException:
            pass
    return saved

@router.post("/api/house-history")
def add_story(body: Story, req: Request):
    t, m = require(req)
    if body.household_uid not in VALID:
        raise HTTPException(400, "Choose a mapped household.")
    if m["role"] == "resident" and body.household_uid != m.get("household_uid"):
        raise HTTPException(403, "A board member must link your account to this household first.")
    d = body.model_dump()
    d["status"] = "published" if m["role"] in {"board", "admin"} else "pending"
    row = rest("hba_house_history", t, "POST", d, representation=True)[0]
    if d["status"] == "pending":
        notify_admin(t, "history", "House story to review", f"{m.get('display_name') or m['email']}: “{body.title}”.")
    return row

@router.post("/api/work")
@router.put("/api/work/{record_id}")
def save_work(body: Work, req: Request, record_id: str | None = None):
    t, _ = board(req)
    if body.state not in {"planned", "in_progress", "incomplete", "defect", "resolved", "accepted"}:
        raise HTTPException(400, "Invalid work state.")
    return rest("hba_work", t, "PATCH" if record_id else "POST", body.model_dump(mode="json"),
                query="id=eq."+uid(record_id) if record_id else "", representation=True)

@router.post("/api/work/{record_id}/notes")
def add_work_note(record_id: str, body: WorkNote, req: Request):
    t, _ = board(req)
    if body.flag not in {"progress", "incomplete", "defect", "resolved", "accepted"}:
        raise HTTPException(400, "Invalid work flag.")
    d = body.model_dump()
    d["work_id"] = uid(record_id)
    return rest("hba_work_notes", t, "POST", d, representation=True)[0]

@router.post("/api/publish/{kind}/{record_id}")
def publish(kind: str, record_id: str, req: Request):
    t, _ = board(req)
    table = {"photo": "hba_photos", "history": "hba_house_history", "storm": "hba_storm_memories"}.get(kind)
    if not table:
        raise HTTPException(400, "Invalid publication type.")
    return rest(table, t, "PATCH", {"status": "published"}, "id=eq."+uid(record_id), representation=True)

async def read_file(file, maximum):
    data = await file.read(maximum+1)
    if not data or len(data) > maximum:
        raise HTTPException(400, "File is empty or exceeds the upload limit.")
    return data

@router.post("/api/documents")
async def document_upload(req: Request, background: BackgroundTasks, title: str = Form(...), category: str = Form(...),
                          document_year: int | None = Form(None), description: str = Form(""),
                          file: UploadFile = File(...)):
    t, m = board(req)
    if category not in {"budget", "minutes", "governing", "history", "permit", "contract", "other"} or not 1 <= len(title.strip()) <= 180 or len(description) > 12000:
        raise HTTPException(400, "Check the document title and category.")
    if document_year is not None and not 1800 <= document_year <= 2200:
        raise HTTPException(400, "Invalid document year.")
    raw = await read_file(file, 8*1024*1024)
    digest=hashlib.sha256(raw).hexdigest()
    prior=rest("hba_document_intakes",t,query="select=document_id&file_sha256=eq."+digest)
    if prior:
        existing=rest("hba_documents",t,query="id=eq."+prior[0]["document_id"])
        if existing:
            return {**existing[0],"already_archived":True}
    import asyncio
    pdf,suffix,mime=await asyncio.to_thread(document_intake.prepare_file,raw,file.filename or "document.pdf")
    rid = str(uuid4())
    path = f"documents/{rid}.pdf"
    # Store bytes first; a failed metadata insert leaves an inaccessible orphan,
    # never a broken row visible as a successful document.
    sb("POST", "/storage/v1/object/hba-archive/"+path, t, content=pdf, headers={"Content-Type": "application/pdf"})
    row = {"id": rid, "title": title.strip(), "category": category, "document_year": document_year,
           "description": description, "file_path": path, "original_name": Path(file.filename or "document.pdf").name[:200],
           "audience":"board","source_sha256":digest}
    if suffix!=".pdf":
        original=f"documents/{rid}/original{suffix}"
        sb("POST","/storage/v1/object/hba-archive/"+original,t,content=raw,headers={"Content-Type":mime})
        row["original_path"]=original
    saved=rest("hba_documents",t,"POST",row,representation=True)[0]
    try:
        document_intake.enqueue(saved,t,background,digest)
    except HTTPException:
        return {**saved,"intake_unavailable":True}
    return saved

@router.post("/api/photos")
async def photo_upload(req: Request, kind: str = Form(...), parent_id: str = Form(...),
                       caption: str = Form(""), credit: str = Form(""), consent: str = Form(...),
                       file: UploadFile = File(...)):
    t, m = require(req)
    if consent != "yes":
        raise HTTPException(400, "Confirm you have permission to share this photo.")
    field = {"event": "event_id", "history": "history_id", "work": "work_id", "issue": "issue_id", "storm": "storm_id"}.get(kind)
    if not field or (kind == "work" and m["role"] not in {"board", "admin"}):
        raise HTTPException(403, "Not permitted for this photo collection.")
    parent_id = uid(parent_id)
    if len(caption) > 2000 or len(credit) > 200:
        raise HTTPException(400, "Caption or credit is too long.")
    raw = await read_file(file, 6*1024*1024)
    try:
        with Image.open(io.BytesIO(raw)) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError()
            if image.width*image.height > 24_000_000:
                raise ValueError()
            image.load()
            clean = ImageOps.exif_transpose(image).convert("RGB")
            clean.thumbnail((2400, 2400))
            output = io.BytesIO()
            clean.save(output, "JPEG", quality=87, optimize=True)
            raw = output.getvalue()
    except (UnidentifiedImageError, ValueError, OSError, Image.DecompressionBombError):
        raise HTTPException(400, "Choose a JPEG, PNG or WebP photo up to 6 MB and 24 megapixels.")
    rid = str(uuid4())
    path = f"photos/{m['id']}/{rid}.jpg"
    data = {"id": rid, field: parent_id, "caption": caption, "credit": credit, "file_path": path,
            "status": "published" if m["role"] in {"board", "admin"} else "pending"}
    # RLS requires the owner-bound metadata before the object is inserted.
    if kind == "issue" and m["role"] == "resident":
        rest("hba_photos", t, "POST", data)
        row = {"id": rid, "status": "pending"}
    else:
        row = rest("hba_photos", t, "POST", data, representation=True)[0]
    try:
        sb("POST", "/storage/v1/object/hba-archive/"+path, t, content=raw, headers={"Content-Type": "image/jpeg"})
        if data["status"] == "pending" and kind != "issue":
            # One alert per person, collection and ten-minute window, so a batch of photos does not ring ten times.
            notify_admin(t, "photo", "Photographs to review", f"{m.get('display_name') or m['email']} added one or more photographs to review{(' — “'+caption[:80]+'”') if caption else ''}.",
                         dedupe=f"photo:{m['id']}:{parent_id}:{int(time.time() // 600)}")
    except HTTPException:
        # No resident/board deletion bypass: failed metadata remains visible to
        # the board for administrator cleanup, explicitly flagged in the UI.
        raise HTTPException(503, "Photo file did not finish uploading. No image was saved; ask the administrator to remove the empty entry before retrying.")
    return row

@router.get("/api/files/{kind}/{record_id}")
def read_content(kind: str, record_id: str, req: Request):
    t, _ = require(req)
    table = {"bid":"hba_bid_files","photo": "hba_photos", "document": "hba_documents", "original": "hba_documents", "newsletter": "hba_newsletters", "newsletter-original": "hba_newsletters", "minutes": "hba_meeting_minutes"}.get(kind)
    if not table:
        raise HTTPException(404, "File not found.")
    rows = rest(table, t, query="id=eq."+uid(record_id)+"&select=*")
    if not rows:
        raise HTTPException(404, "File not found or permission denied.")
    row = rows[0]
    path = row.get("original_path") if kind in {"original","newsletter-original"} else row["file_path"]
    if not path:
        raise HTTPException(404, "No file of that format is stored for this record.")
    content = sb("GET", "/storage/v1/object/authenticated/hba-archive/"+path, t)
    ext, mime = ("jpg", "image/jpeg") if kind == "photo" else ("doc", "application/msword") if kind in {"original","newsletter-original"} else ("pdf", "application/pdf")
    if kind=="original":
        suffix=Path(path).suffix.lower()
        ext=suffix.lstrip(".")
        mime=document_intake.MIMES.get(suffix,"application/msword")
    return Response(content.content, media_type=mime,
                    headers={"Content-Disposition": ('attachment' if kind in {"original","newsletter-original"} else 'inline')+'; filename="HBA-'+uid(record_id)+'.'+ext+'"'})

@router.delete("/api/records/{kind}/{record_id}")
def delete_record(kind: str, record_id: str, req: Request):
    t, member = require(req, ("admin",))
    if kind=="dues-receipt":
        if not rest("rpc/hba_remove_dues_receipt",t,"POST",{"p_id":uid(record_id)}):
            raise HTTPException(404,"Receipt not found.")
        return {"deleted":True,"notice":"Household receipt reversed and dues status recalculated. The income entry remains; review it separately."}
    if kind=="research-report":
        deleted=rest("rpc/hba_admin_delete_research_report",t,"POST",{"p_id":uid(record_id)})
        if not deleted:
            raise HTTPException(404,"Record not found.")
        return {"deleted":True}
    table = {"bid":"hba_bids","bid-file":"hba_bid_files","bid-request":"hba_bid_requests","document-fact":"hba_document_facts","photo": "hba_photos", "document": "hba_documents", "history": "hba_house_history",
             "storm": "hba_storm_memories", "work": "hba_work", "work-note": "hba_work_notes", "event": "hba_events", "series": "hba_series", "issue": "hba_issues",
             "decision": "hba_decisions", "officeholder": "hba_officeholders",
             "meeting": "hba_meetings", "agenda": "hba_agenda_items",
             "payment-report": "hba_payment_reports", "advisory": "hba_public_advisories",
             "newsletter": "hba_newsletters", "minutes": "hba_meeting_minutes", "sms-draft": "hba_sms_drafts", "vote": "hba_votes",
             "volunteer-task": "hba_volunteer_tasks", "volunteer-signup": "hba_volunteer_signups",
             "register":"hba_check_register","research-report":"hba_research_reports","payer-household":"hba_payer_households",
             "bank-match":"hba_bank_matches","bank-summary":"hba_bank_summaries",
             "bank-transaction":"hba_bank_transactions","bank-import":"hba_bank_imports",
             "bank-account":"hba_bank_accounts"}.get(kind)
    if not table:
        raise HTTPException(400, "Unknown record type.")
    query = "id=eq."+uid(record_id)
    rows = rest(table, t, query=query+"&select=*")
    if not rows:
        raise HTTPException(404, "Record not found.")
    if kind=="bid" and (rest("hba_bid_files",t,query="bid_id=eq."+uid(record_id)+"&select=id&limit=1") or
                       rest("hba_bid_reviews",t,query="bid_id=eq."+uid(record_id)+"&select=id&limit=1")):
        raise HTTPException(409,"This proposal has attachments or review history. Keep it and mark it withdrawn to preserve the decision trail.")
    if kind=="bid-request" and rest("hba_bids",t,query="request_id=eq."+uid(record_id)+"&select=id&limit=1"):
        raise HTTPException(409,"This request has proposals. Close it instead to preserve its history.")
    if kind=="document" and rest("hba_document_suggestions",t,query="document_id=eq."+uid(record_id)+"&state=eq.applied&select=id&limit=1"):
        raise HTTPException(409,"This source supports reviewed records. Keep it in the archive to preserve their evidence.")
    if kind == "document" and rest("hba_decisions", t, query="minutes_id=eq."+uid(record_id)+"&select=id"):
        raise HTTPException(409, "This document supports a decision record. Preserve it or remove the dependent decision first; no file was deleted.")
    if kind == "meeting":
        if rest("hba_agenda_items", t, query="meeting_id=eq."+uid(record_id)+"&select=id"):
            raise HTTPException(409, "Remove or move linked agenda items before deleting the meeting.")
        rest("hba_meeting_access", t, "DELETE", query=query)
    if kind == "volunteer-task" and rest("hba_volunteer_signups", t, query="task_id=eq."+uid(record_id)+"&select=id"):
        raise HTTPException(409, "This task has signup history. Close or complete it to preserve the record; no record was deleted.")
    if rows[0].get("file_path"):
        sb("DELETE", "/storage/v1/object/hba-archive", t, json={"prefixes": [p for p in [rows[0]["file_path"],rows[0].get("original_path")] if p]})
    if rows[0].get("photo_path"):
        sb("DELETE", "/storage/v1/object/hba-archive", t, json={"prefixes":[rows[0]["photo_path"]]})
    rest(table, t, "DELETE", query=query)
    return {"deleted": True}
