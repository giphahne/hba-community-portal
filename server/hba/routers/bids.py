"""Contractor bid requests, bids and their files."""

import hashlib
import io
from datetime import date
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

import fitz
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from hba.push import notify_admin
from hba.routers.community import read_file
from hba.sessions import board, require, uid
from hba.supabase import rest, sb

router = APIRouter()

class BidRequest(BaseModel):
    title: str = Field(min_length=1,max_length=180)
    work_id: UUID | None = None
    scope: str = Field(min_length=1,max_length=12000)
    location: str = Field(default="",max_length=300)
    deadline: date | None = None
    state: str = "draft"

class ContractorBid(BaseModel):
    request_id: UUID
    contractor: str = Field(min_length=1,max_length=250)
    contact: str = Field(default="",max_length=600)
    amount: Decimal = Field(gt=0,le=10000000,max_digits=12,decimal_places=2)
    tax_basis: str = "unspecified"
    scope: str = Field(min_length=1,max_length=12000)
    exclusions: str = Field(default="",max_length=12000)
    timing: str = Field(default="",max_length=2000)
    valid_until: date | None = None

class BidReview(BaseModel):
    state: str
    note: str = Field(min_length=1,max_length=12000)
    revision: int = Field(ge=1)

@router.post("/api/bid-requests")
@router.put("/api/bid-requests/{record_id}")
def save_bid_request(body:BidRequest,req:Request,record_id:str|None=None):
    t,_=board(req)
    if body.state not in {"draft","open","closed"}:
        raise HTTPException(400,"Choose draft, open or closed.")
    if body.work_id and not rest("hba_work",t,query="id=eq."+str(body.work_id)+"&select=id"):
        raise HTTPException(400,"Work project not found.")
    rows=rest("hba_bid_requests",t,"PATCH" if record_id else "POST",body.model_dump(mode="json"),
              query="id=eq."+uid(record_id) if record_id else "",representation=True)
    if not rows:raise HTTPException(404,"Bid request not found.")
    return rows[0]

@router.post("/api/bids")
def submit_bid(body:ContractorBid,req:Request):
    t,m=require(req)
    if body.tax_basis not in {"included","excluded","unspecified"}:
        raise HTTPException(400,"Choose a tax treatment.")
    row = rest("hba_bids",t,"POST",body.model_dump(mode="json"),representation=True)[0]
    if m["role"] != "admin":
        notify_admin(t, "bid", "Contractor bid submitted", f"{body.contractor}: ${round(float(body.amount),2):,.2f}.")
    return row

@router.post("/api/bids/{record_id}/review")
def review_bid(record_id:str,body:BidReview,req:Request):
    t,_=board(req)
    return rest("rpc/hba_review_bid",t,"POST",{"p_id":uid(record_id),"p_state":body.state,
                "p_note":body.note,"p_revision":body.revision})

@router.post("/api/bids/{record_id}/files")
async def upload_bid_file(record_id:str,req:Request,file:UploadFile=File(...),caption:str=Form("")):
    t,m=require(req);bid_id=uid(record_id)
    rows=rest("hba_bids",t,query="id=eq."+bid_id)
    if not rows:raise HTTPException(404,"Proposal not found or permission denied.")
    if m["role"]=="resident" and rows[0]["state"] not in {"submitted","clarification"}:
        raise HTTPException(403,"Attachments are accepted only for submitted proposals or requested clarification.")
    if len(caption)>2000:raise HTTPException(400,"Attachment description is too long.")
    raw=await read_file(file,8*1024*1024)
    name=Path(file.filename or "proposal.pdf").name[:250]
    suffix=Path(name).suffix.lower()
    if suffix==".pdf":
        try:
            with fitz.open(stream=raw,filetype="pdf") as pdf:
                if pdf.is_encrypted or not 1<=len(pdf)<=100:
                    raise ValueError("Use an unlocked PDF with 1–100 pages.")
        except Exception:
            raise HTTPException(400,"Use a readable, unlocked PDF with 1–100 pages.")
        saved=raw
    elif suffix in {".jpg",".jpeg",".png"}:
        try:
            with Image.open(io.BytesIO(raw)) as source:
                source.load()
                photo=ImageOps.exif_transpose(source).convert("RGB")
                photo.thumbnail((2400,2400))
                out=io.BytesIO();photo.save(out,format="PDF",resolution=150)
                saved=out.getvalue()
        except (UnidentifiedImageError,OSError,ValueError,Image.DecompressionBombError):
            raise HTTPException(400,"Use a readable JPEG or PNG below 24 megapixels.")
    else:raise HTTPException(400,"Supported proposal attachments are PDF, JPEG and PNG.")
    if len(saved)>8*1024*1024:raise HTTPException(400,"Converted file exceeds 8 MB.")
    record=str(uuid4());path="bids/"+bid_id+"/"+record+".pdf"
    # Metadata is created first so storage insertion can verify the bid's RLS scope.
    row=rest("hba_bid_files",t,"POST",{"id":record,"bid_id":bid_id,"file_path":path,
             "original_name":name,"caption":caption,"sha256":hashlib.sha256(saved).hexdigest()},representation=True)[0]
    try:sb("POST","/storage/v1/object/hba-archive/"+path,t,content=saved,headers={"Content-Type":"application/pdf"})
    except HTTPException:
        raise HTTPException(503,"File upload did not finish. A private attachment entry exists but its file is unavailable; ask the administrator to remove the failed entry before retrying.")
    return row
