"""Newsletters and text-message preferences/drafts."""

import re
from datetime import date
from pathlib import Path
from uuid import uuid4

import document_intake
import fitz
from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from hba.routers.community import read_file
from hba.sessions import board, newsletter_editor, require, uid
from hba.supabase import rest, sb

router = APIRouter()

class Newsletter(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    issue_date: date
    body: str = Field(default="", max_length=40000)
    issue_precision: str = "day"

@router.post("/api/newsletters")
@router.put("/api/newsletters/{record_id}")
def save_newsletter(body: Newsletter, req: Request, record_id: str | None = None):
    t, _ = newsletter_editor(req)
    if not body.title.strip():
        raise HTTPException(400, "Enter an issue title.")
    if body.issue_precision not in {"day","month"}:
        raise HTTPException(400, "Choose an exact-day or month-only issue date.")
    if record_id:
        rows = rest("hba_newsletters", t, query="id=eq."+uid(record_id))
        if not rows:
            raise HTTPException(404, "Newsletter not found.")
        if rows[0]["state"] != "draft":
            raise HTTPException(409, "Return the issue to draft before editing published content.")
    result = rest("hba_newsletters", t, "PATCH" if record_id else "POST",
                  {**body.model_dump(mode="json"), "title": body.title.strip()},
                  query="id=eq."+uid(record_id) if record_id else "", representation=True)
    return result[0] if result else None

class NewsletterState(BaseModel):
    state: str

@router.put("/api/newsletters/{record_id}/state")
def newsletter_state(record_id: str, body: NewsletterState, req: Request):
    t, _ = newsletter_editor(req)
    if body.state not in {"draft", "published"}:
        raise HTTPException(400, "Choose draft or published.")
    rows = rest("hba_newsletters", t, query="id=eq."+uid(record_id))
    if not rows:
        raise HTTPException(404, "Newsletter not found.")
    if body.state == "published" and not (rows[0]["body"].strip() or rows[0]["file_path"]):
        raise HTTPException(400, "Add newsletter text or a readable PDF before publishing.")
    return rest("hba_newsletters", t, "PATCH", {"state": body.state},
                query="id=eq."+uid(record_id), representation=True)[0]

@router.post("/api/newsletters/{record_id}/file")
async def newsletter_file(record_id: str, req: Request, background: BackgroundTasks, file: UploadFile = File(...)):
    t, _ = newsletter_editor(req)
    rid = uid(record_id)
    rows = rest("hba_newsletters", t, query="id=eq."+rid)
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
    # Unique paths preserve previous files. Only administrator can physically delete.
    path = f"newsletters/{rid}/{uuid4()}.pdf"
    sb("POST", "/storage/v1/object/hba-archive/"+path, t, content=raw,
       headers={"Content-Type": "application/pdf"})
    saved=rest("hba_newsletters", t, "PATCH",
                {"file_path": path, "original_name": Path(file.filename or "newsletter.pdf").name[:200]},
                query="id=eq."+rid, representation=True)[0]
    try:
        source_id=document_intake.archive_intake_copy(raw,"Newsletter: "+saved["title"],
                       Path(file.filename or "newsletter.pdf").name[:200],t,background)
    except HTTPException:
        return {**saved,"intake_unavailable":True}
    return {**saved,"intake_document_id":source_id}

class SMSPreferences(BaseModel):
    phone: str = Field(min_length=10, max_length=30)
    topics: list[str] = Field(min_length=1, max_length=5)
    opted_in: bool
    consent: bool = False

@router.put("/api/sms/preferences")
def sms_preferences(body: SMSPreferences, req: Request):
    t, _ = require(req)
    digits = re.sub(r"\D", "", body.phone)
    if len(digits) == 10:
        digits = "1"+digits
    phone = "+"+digits
    if not re.fullmatch(r"\+1[2-9][0-9]{9}", phone):
        raise HTTPException(400, "Enter a valid 10-digit US mobile number.")
    topics = sorted(set(body.topics))
    if not set(topics) <= {"roads", "beach", "events", "speed_bumps", "general"}:
        raise HTTPException(400, "Choose the listed notification topics.")
    if body.opted_in and not body.consent:
        raise HTTPException(400, "Check the SMS consent box to sign up or change preferences.")
    rest("rpc/hba_save_sms_preferences", t, "POST",
         {"p_phone": phone, "p_topics": topics, "p_opted_in": body.opted_in, "p_consent": body.consent})
    return {"saved": True, "delivery_ready": False, "opted_in": body.opted_in}

class SMSDraft(BaseModel):
    category: str
    message: str = Field(min_length=1, max_length=1000)

@router.post("/api/sms/drafts")
@router.put("/api/sms/drafts/{record_id}")
def sms_draft(body: SMSDraft, req: Request, record_id: str | None = None):
    t, _ = board(req)
    if body.category not in {"roads", "beach", "events", "speed_bumps", "general"} or not body.message.strip():
        raise HTTPException(400, "Choose a topic and enter a message.")
    return rest("hba_sms_drafts", t, "PATCH" if record_id else "POST",
                {"category": body.category, "message": body.message.strip()},
                query="id=eq."+uid(record_id) if record_id else "", representation=True)

@router.post("/api/sms/send")
def sms_send(req: Request):
    board(req)
    raise HTTPException(503, "SMS delivery is disabled. Configure an approved sender, phone verification, unsubscribe handling and a reviewed send-confirmation flow first. No message was sent.")
