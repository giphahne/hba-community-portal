"""Cleaning plan and volunteer tasks."""

import io
import re
from datetime import date
from email.message import EmailMessage
from email.policy import SMTP
from uuid import uuid4

from PIL import Image, ImageOps
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from hba.config import app_url
from hba.push import notify_admin
from hba.routers.community import read_file
from hba.routers.newsletters import NewsletterState
from hba.sessions import board, require, uid
from hba.supabase import rest, sb

router = APIRouter()

@router.get("/api/cleaning-plan")
def cleaning_plan(req: Request):
    t, _ = board(req)
    rows = rest("hba_cleaning_plan", t, query="select=*&id=eq.1")
    if not rows:
        raise HTTPException(404, "No private cleaning plan recorded.")
    p = rows[0]
    p["annual_amount"] = float(p["amount_per_cleaning"])*p["cleanings_per_year"]
    p["total_amount"] = p["annual_amount"]*p["seasons"]
    return p

class VolunteerTask(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    category: str
    description: str = Field(min_length=1, max_length=12000)
    location: str = Field(default="", max_length=300)
    task_date: date | None = None
    task_time: str | None = None
    capacity: int = Field(default=10, ge=1, le=500)

@router.get("/api/volunteers/public")
def volunteer_public():
    rows = rest("hba_volunteer_tasks", None, query="select=id,title,category,description,location,task_date,task_time,capacity,state,photo_path,updated_at&order=task_date.asc.nullslast,created_at.desc")
    return {"tasks":rows,"counts":rest("rpc/hba_volunteer_counts",None,"POST",{})}

@router.post("/api/volunteers")
@router.put("/api/volunteers/{record_id}")
def volunteer_save(body: VolunteerTask, req: Request, record_id: str | None = None):
    t, _ = board(req)
    if body.category not in {"event","maintenance"} or not body.title.strip() or not body.description.strip():
        raise HTTPException(400, "Enter a title, task description and event/maintenance category.")
    if body.task_time and not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d",body.task_time):
        raise HTTPException(400, "Use a local time in HH:MM format.")
    if record_id:
        rows=rest("hba_volunteer_tasks",t,query="id=eq."+uid(record_id))
        if not rows or rows[0]["state"]!="draft":
            raise HTTPException(409,"Return the task to draft before changing public content.")
    result=rest("hba_volunteer_tasks",t,"PATCH" if record_id else "POST",body.model_dump(mode="json"),
                query="id=eq."+uid(record_id) if record_id else "",representation=True)
    return result[0] if result else None

@router.put("/api/volunteers/{record_id}/state")
def volunteer_state(record_id: str, body: NewsletterState, req: Request):
    t,_=board(req)
    if body.state not in {"draft","published","closed","complete"}:
        raise HTTPException(400,"Choose a valid task state.")
    rows=rest("hba_volunteer_tasks",t,"PATCH",{"state":body.state},query="id=eq."+uid(record_id),representation=True)
    if not rows:
        raise HTTPException(404,"Task not found.")
    return rows[0]

@router.post("/api/volunteers/{record_id}/photo")
async def volunteer_photo(record_id: str, req: Request, file: UploadFile = File(...)):
    t,_=board(req);rid=uid(record_id)
    rows=rest("hba_volunteer_tasks",t,query="id=eq."+rid)
    if not rows or rows[0]["state"]!="draft":
        raise HTTPException(409,"Save a draft before adding or replacing its public photo.")
    raw=await read_file(file,8*1024*1024)
    try:
        img=Image.open(io.BytesIO(raw))
        if img.format not in {"JPEG","PNG","WEBP"}:
            raise ValueError()
        img=ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((1800,1800))
        out=io.BytesIO();img.save(out,"JPEG",quality=88)
    except Exception:
        raise HTTPException(400,"Choose a readable JPEG, PNG or WebP photo, up to 8 MB.")
    path=f"volunteers/{rid}/{uuid4()}.jpg"
    sb("POST","/storage/v1/object/hba-archive/"+path,t,content=out.getvalue(),headers={"Content-Type":"image/jpeg"})
    return rest("hba_volunteer_tasks",t,"PATCH",{"photo_path":path},query="id=eq."+rid,representation=True)[0]

@router.get("/api/volunteers/{record_id}/photo")
def volunteer_photo_read(record_id: str, req: Request):
    # Public requests use the anon token. A board preview can also read its draft.
    t=None
    if req.headers.get("x-hba-proof"):
        t,_=require(req)
    rows=rest("hba_volunteer_tasks",t,query="id=eq."+uid(record_id)+"&select=photo_path")
    if not rows or not rows[0]["photo_path"]:
        raise HTTPException(404,"No task photo available.")
    raw=sb("GET","/storage/v1/object/hba-archive/"+rows[0]["photo_path"],t)
    return Response(raw.content,media_type="image/jpeg")

class VolunteerSignup(BaseModel):
    join: bool
    note: str = Field(default="",max_length=1000)

@router.put("/api/volunteers/{record_id}/signup")
def volunteer_signup(record_id: str, body: VolunteerSignup, req: Request):
    t,m=require(req)
    rest("rpc/hba_volunteer_signup",t,"POST",{"p_task":uid(record_id),"p_join":body.join,"p_note":body.note})
    if body.join and m["role"] != "admin":
        task = rest("hba_volunteer_tasks", t, query="id=eq."+uid(record_id)+"&select=title")
        notify_admin(t, "volunteer", "Volunteer signed up", f"{m.get('display_name') or m['email']} joined “{task[0]['title'] if task else 'a task'}”.")
    return {"saved":True,"signed_up":body.join}

class VolunteerEmailPreference(BaseModel):
    opted_in: bool

@router.put("/api/volunteer-email-preferences")
def volunteer_email_preference(body: VolunteerEmailPreference,req: Request):
    t,m=require(req)
    old=rest("hba_volunteer_email_preferences",t,query="member_id=eq."+m["id"])
    rest("hba_volunteer_email_preferences",t,"PATCH" if old else "POST",
         body.model_dump() if old else {"member_id":m["id"],**body.model_dump()},
         query="member_id=eq."+m["id"] if old else "")
    return {"saved":True,"opted_in":body.opted_in}

def volunteer_email_payload(record_id,t):
    rows=rest("hba_volunteer_tasks",t,query="id=eq."+uid(record_id))
    if not rows or rows[0]["state"]!="published":
        raise HTTPException(409,"Publish and review the task before preparing a volunteer email request.")
    task=rows[0]
    prefs=rest("hba_volunteer_email_preferences",t,query="opted_in=eq.true&select=member_id")
    allowed={p["member_id"] for p in prefs}
    recipients=[{"id":m["id"],"name":m["display_name"],"email":m["email"]} for m in rest("hba_members",t,query="role=in.(resident,board,admin)&select=id,email,display_name") if m["id"] in allowed]
    when=str(task["task_date"] or "Date to be arranged")+((" at "+task["task_time"][:5]+" Eastern") if task["task_time"] else "")
    body=f"Hamilton Beach Association is requesting volunteers.\n\n{task['title']}\n\n{task['description']}\n\nWhere: {task['location'] or 'To be arranged'}\nWhen: {when}\nVolunteers requested: {task['capacity']}\n\nView the HBA app's Volunteer board to sign up or withdraw:\n{app_url()}\n\nYou are receiving this request because you opted in to HBA volunteer emails. You can opt out in the app's Volunteer section.\n"
    return task,{"subject":"HBA volunteers needed: "+task["title"],"body":body,"recipients":recipients,"has_photo":bool(task["photo_path"]),"delivery":"draft_only"}

@router.get("/api/volunteers/{record_id}/email-preview")
def volunteer_email_preview(record_id: str,req: Request):
    t,_=board(req)
    return volunteer_email_payload(record_id,t)[1]

@router.post("/api/volunteers/{record_id}/email-draft")
def volunteer_email_draft(record_id: str,req: Request):
    t,_=board(req)
    task,p=volunteer_email_payload(record_id,t)
    if not p["recipients"]:
        raise HTTPException(409,"No approved members have opted in to volunteer emails yet.")
    msg=EmailMessage(policy=SMTP)
    msg["Subject"]=p["subject"]
    msg["To"]="undisclosed-recipients:;"
    msg["Bcc"]=", ".join(r["email"] for r in p["recipients"])
    msg["X-Unsent"]="1"
    msg.set_content(p["body"])
    if task["photo_path"]:
        photo=sb("GET","/storage/v1/object/authenticated/hba-archive/"+task["photo_path"],t)
        msg.add_attachment(photo.content,maintype="image",subtype="jpeg",filename="HBA-volunteer-task.jpg")
    return Response(msg.as_bytes(),media_type="message/rfc822",
                    headers={"Content-Disposition":'attachment; filename="HBA-volunteer-request.eml"'})
