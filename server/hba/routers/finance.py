"""Check register, category budgets, dues, bank reconciliation and dues receipts."""

import hashlib
import hmac
import json
import re
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from bank_reconciliation import analyze as analyze_bank
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from hba.config import SESSION_KEY, VALID, homes
from hba.sessions import board, require, year_ok
from hba.supabase import rest

router = APIRouter()

def finance_editor(req):
    t,m=board(req)
    if not rest("rpc/hba_can_edit_finance",t,"POST",{}):
        raise HTTPException(403,"The linked, in-term Treasurer account or administrator is required.")
    return t,m

@router.get("/api/finance/{year}")
def finance_data(year: int,req: Request):
    t,_=board(req);year_ok(year)
    rows=rest("hba_check_register",t,query=f"select=*&transaction_date=gte.{year}-01-01&transaction_date=lt.{year+1}-01-01&order=transaction_date.desc,created_at.desc")
    budgets=rest("hba_category_budgets",t,query=f"select=*&year=eq.{year}")
    categories=rest("hba_finance_categories",t,query="select=*&order=direction.asc,label.asc")
    summary=[]
    for cat in categories:
        actual=sum((Decimal(str(r["amount"])) for r in rows if r["category_code"]==cat["code"] and not r["voided"]),Decimal(0))
        cleared=sum((Decimal(str(r["amount"])) for r in rows if r["category_code"]==cat["code"] and r["cleared"] and not r["voided"]),Decimal(0))
        budget=next((b for b in budgets if b["category_code"]==cat["code"]),None)
        planned=Decimal(str(budget["amount"])) if budget else None
        summary.append({**cat,"actual":str(actual),"cleared":str(cleared),"planned":str(planned) if planned is not None else None,
                        "variance":str((planned-actual) if cat["direction"]=="expense" else (actual-planned)) if planned is not None else None,
                        "basis":budget["basis"] if budget else None})
    return {"year":year,"rows":rows,"budgets":budgets,"categories":categories,"summary":summary,
            "bank_accounts":rest("hba_bank_accounts",t,query="select=id,label,last_four"),
            "audit":rest("hba_finance_audit",t,query="select=*&order=changed_at.desc&limit=100"),
            "dues_tracking":dues_receipts(req),
            "refreshed_at":datetime.now(timezone.utc).isoformat()}

class RegisterEntry(BaseModel):
    transaction_date: date
    direction: str
    category_code: str = Field(max_length=60)
    payee: str = Field(min_length=1,max_length=180)
    amount: Decimal = Field(gt=0,max_digits=12,decimal_places=2)
    reference: str = Field(default="",max_length=80)
    memo: str = Field(default="",max_length=3000)
    cleared: bool = False
    voided: bool = False
    bank_account_id: UUID | None = None

@router.post("/api/register")
@router.put("/api/register/{record_id}")
def save_register(body: RegisterEntry,req: Request,record_id: str | None=None):
    t,_=finance_editor(req)
    if body.direction not in {"income","expense"} or not body.payee.strip():
        raise HTTPException(400,"Choose income/expense and enter the payee or payer.")
    return rest("hba_check_register",t,"PATCH" if record_id else "POST",body.model_dump(mode="json"),
                query="id=eq."+uid(record_id) if record_id else "",representation=True)

class CategoryBudget(BaseModel):
    category_code: str = Field(max_length=60)
    amount: Decimal = Field(ge=0,max_digits=12,decimal_places=2)
    basis: str
    source_note: str = Field(default="",max_length=2000)

@router.put("/api/category-budgets/{year}")
def save_category_budget(year: int,body: CategoryBudget,req: Request):
    t,_=finance_editor(req);year_ok(year)
    if body.basis not in {"draft","adopted"}:
        raise HTTPException(400,"Label the budget as draft or adopted with a supporting source.")
    if body.basis=="adopted" and not body.source_note.strip():
        raise HTTPException(400,"Cite the adopted budget or minutes before marking this line adopted.")
    code=body.category_code
    if not re.fullmatch(r"[a-z_]+",code):
        raise HTTPException(400,"Choose a listed budget category.")
    query=f"year=eq.{year}&category_code=eq.{code}"
    rows=rest("hba_category_budgets",t,query=query)
    values=body.model_dump(mode="json")
    if rows:
        values.pop("category_code")
    else:
        values["year"]=year
    return rest("hba_category_budgets",t,"PATCH" if rows else "POST",values,query=query if rows else "",representation=True)

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

@router.get("/api/dues/{year}")
def dues_read(year: int, req: Request):
    t, _ = board(req)
    year_ok(year)
    return {"year": year, "rows": rest("hba_dues", t, query=f"year=eq.{year}&select=*"), "scope": "Shared HBA board-only registry"}

@router.put("/api/dues/{year}/{home}")
def dues_save(year: int, home: str, body: Change, req: Request):
    t, _ = board(req)
    year_ok(year)
    validate_dues(home, body.status)
    return rest("rpc/hba_set_dues", t, "POST", {"p_year": year, "p_uid": home, "p_status": body.status, "p_revision": body.revision}, representation=True)

@router.post("/api/dues/{year}/import")
def dues_import(year: int, body: ImportBatch, req: Request):
    t, _ = board(req)
    year_ok(year)
    if len({r.uid for r in body.rows}) != len(body.rows):
        raise HTTPException(400, "Duplicate household.")
    for r in body.rows:
        validate_dues(r.uid, r.status)
    rows = rest("rpc/hba_import_dues", t, "POST", {"p_year": year, "p_rows": [r.model_dump() for r in body.rows]}, representation=True)
    return {"year": year, "rows": rows}

# Bank files remain board-private. No bank credentials or routing numbers accepted.
class BankAccount(BaseModel):
    label: str = Field(min_length=1,max_length=120)
    last_four: str = Field(default="",pattern=r"^([0-9]{4})?$")

@router.post("/api/bank/accounts")
def add_bank_account(body: BankAccount,req: Request):
    t,_=require(req,("admin",))
    return rest("hba_bank_accounts",t,"POST",body.model_dump(),representation=True)[0]

def bank_all(table,t,query="",order="id.asc"):
    result=[]
    for offset in range(0,20000,1000):
        rows=rest(table,t,query=f"select=*&{query}&order={order}&limit=1000&offset={offset}")
        result.extend(rows)
        if len(rows)<1000:
            return result
    raise HTTPException(409,"This review exceeds 20,000 records. Narrow the period; no complete reconciliation was produced.")

@router.get("/api/bank")
def bank_workspace(req: Request,account_id: UUID | None=None,as_of: date | None=None):
    t,_=board(req)
    accounts=rest("hba_bank_accounts",t,query="select=*&order=created_at.asc")
    output={"accounts":accounts,"connection":{"active":False,
        "status":"Live bank feed is not configured. This workspace uses treasurer-imported statement rows only."}}
    if not account_id:
        return output
    aid=str(account_id)
    if not any(a["id"]==aid for a in accounts):
        raise HTTPException(404,"Account reference not found.")
    cutoff=as_of or datetime.now(timezone.utc).date()
    if cutoff>datetime.now(timezone.utc).date():
        raise HTTPException(400,"Choose an as-of date no later than today.")
    imports=rest("hba_bank_imports",t,query=f"select=*&account_id=eq.{aid}&period_end=lte.{cutoff}&order=period_end.desc,created_at.desc&limit=100")
    statement=next((i for i in imports if i["period_end"]==str(cutoff)),None)
    register=bank_all("hba_check_register",t,f"transaction_date=lte.{cutoff}")
    transactions=bank_all("hba_bank_transactions",t,f"account_id=eq.{aid}&posted_date=lte.{cutoff}")
    matches=bank_all("hba_bank_matches",t)
    output.update(imports=imports,transactions=transactions,matches=matches,register=register,
        analysis=analyze_bank(register,transactions,matches,str(cutoff),aid,
                              statement.get("statement_closing") if statement else None,
                              statement.get("books_closing") if statement else None),
        refreshed_at=datetime.now(timezone.utc).isoformat())
    return output

class BankRow(BaseModel):
    posted_date: date
    amount: Decimal = Field(max_digits=14,decimal_places=2)
    description: str = Field(default="",max_length=300)
    reference: str = Field(default="",max_length=80)
    bank_transaction_id: str = Field(default="",max_length=180)
    payer_key: str = Field(default="",max_length=120)

class BankImport(BaseModel):
    account_id: UUID
    period_start: date
    period_end: date
    statement_closing: Decimal | None = Field(default=None,max_digits=14,decimal_places=2)
    books_closing: Decimal | None = Field(default=None,max_digits=14,decimal_places=2)
    source_note: str = Field(min_length=1,max_length=1000)
    rows: list[BankRow] = Field(min_length=1,max_length=1000)

@router.post("/api/bank/import")
def import_bank_rows(body: BankImport,req: Request):
    t,_=finance_editor(req)
    if body.period_end<body.period_start or body.period_end>datetime.now(timezone.utc).date():
        raise HTTPException(400,"Use a valid completed statement period.")
    aid=str(body.account_id)
    if not rest("hba_bank_accounts",t,query="id=eq."+aid):
        raise HTTPException(404,"Account reference not found.")
    # Exact repeated rows without bank IDs are held as possible duplicates, not
    # silently treated as separate transfers. Treasurer can supply stable IDs.
    rows=[]
    for r in body.rows:
        if not body.period_start<=r.posted_date<=body.period_end or r.amount==0:
            raise HTTPException(400,"Every nonzero posted row must fall within the statement period.")
        identity=("id:"+r.bank_transaction_id.strip()) if r.bank_transaction_id.strip() else json.dumps(
            [str(r.posted_date),str(r.amount.quantize(Decimal(".01"))),r.reference.strip(),r.description.strip()],separators=(",",":"))
        fingerprint=hashlib.sha256(identity.encode()).hexdigest()
        values=r.model_dump(mode="json");values.pop("bank_transaction_id");values.pop("payer_key")
        rows.append({**values,"account_id":aid,"fingerprint":fingerprint,
                     "payer_fingerprint":payer_fingerprint(aid,r.payer_key) if r.payer_key.strip() else None})
    imported=rest("rpc/hba_import_bank_statement",t,"POST",{
        "p_account":aid,"p_start":str(body.period_start),"p_end":str(body.period_end),
        "p_closing":str(body.statement_closing) if body.statement_closing is not None else None,
        "p_books":str(body.books_closing) if body.books_closing is not None else None,
        "p_note":body.source_note,"p_rows":rows})
    return {**imported,
            "warning":"Imported statement rows only; not a live bank sync. Review held duplicates and statement completeness."}

class BankMatch(BaseModel):
    register_id: UUID
    transaction_id: UUID

@router.post("/api/bank/matches")
def confirm_bank_match(body: BankMatch,req: Request):
    t,_=finance_editor(req)
    return rest("hba_bank_matches",t,"POST",body.model_dump(mode="json"),representation=True)[0]

class BankSummary(BaseModel):
    period_end: date
    statement: str = Field(min_length=1,max_length=3000)

@router.post("/api/bank/summaries")
def publish_bank_summary(body: BankSummary,req: Request):
    t,_=finance_editor(req)
    return rest("hba_bank_summaries",t,"POST",body.model_dump(mode="json"),representation=True)[0]

class BankBookEntry(BaseModel):
    category_code: str = Field(min_length=1,max_length=60)
    payee: str = Field(min_length=1,max_length=180)
    memo: str = Field(default="",max_length=3000)

@router.post("/api/bank/transactions/{record_id}/book")
def book_bank_transaction(record_id: str,body: BankBookEntry,req: Request):
    t,_=finance_editor(req)
    rid=rest("rpc/hba_book_bank_transaction",t,"POST",{
        "p_transaction_id":uid(record_id),"p_category":body.category_code,
        "p_payee":body.payee,"p_memo":body.memo})
    return {"register_id":rid,"notice":"Recorded once in budget actuals and matched. No adopted budget, payment or dues status was changed."}

def payer_fingerprint(account_id, value):
    # Stable private HMAC, not a stored bank number. Never log the input.
    value=value.strip()
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9:_-]{5,119}",value) or sum(c.isdigit() for c in value)>8:
        raise HTTPException(400,"Use a non-sensitive stable payer key starting with a letter (for example payer-keefe-joint). Do not use account/routing numbers, check numbers, a surname alone, or last four digits alone.")
    return hmac.new(SESSION_KEY,("hba-payer-v1/"+str(account_id)+"/"+value).encode(),hashlib.sha256).hexdigest()

@router.get("/api/dues-receipts")
def dues_receipts(req: Request):
    t,_=board(req)
    return {"households":[{"uid":p["uid"],"address":p["address"]} for p in homes["properties"]],
            "receipts":bank_all("hba_dues_receipts",t),
            "targets":bank_all("hba_dues_targets",t,order="uid.asc,year.asc"),
            "payers":bank_all("hba_payer_households",t),
            "statuses":bank_all("hba_dues",t,order="uid.asc,year.asc")}

class DuesReceipt(BaseModel):
    household_uid: str = Field(max_length=100)
    dues_year: int = Field(ge=2020,le=2100)
    annual_due: Decimal = Field(gt=0,max_digits=12,decimal_places=2)
    amount: Decimal | None = Field(default=None,gt=0,max_digits=12,decimal_places=2)
    register_id: UUID | None = None
    bank_transaction_id: UUID | None = None
    payee: str = Field(default="",max_length=180)
    memo: str = Field(default="",max_length=3000)
    remember: bool = False
    payer_id: UUID | None = None
    payer_key: str = Field(default="",max_length=120)
    payer_label: str = Field(default="",max_length=120)
    confirmed: bool = False
    single_check: bool = False

@router.post("/api/dues-receipts")
def credit_dues(body: DuesReceipt,req: Request):
    t,_=finance_editor(req)
    if not body.confirmed or body.household_uid not in VALID or bool(body.register_id)==bool(body.bank_transaction_id):
        raise HTTPException(400,"Confirm an exact household and choose one existing register entry or one unmatched bank check.")
    if body.bank_transaction_id:
        if not body.single_check:
            raise HTTPException(400,"A combined or mixed deposit cannot be attributed as one household check. Enter its individual checks in the register and credit each household separately.")
        rows=rest("hba_bank_transactions",t,query="id=eq."+str(body.bank_transaction_id))
    else:
        rows=rest("hba_check_register",t,query="id=eq."+str(body.register_id))
        if body.amount is None:
            raise HTTPException(400,"Enter the amount of this existing receipt to credit.")
    if not rows:
        raise HTTPException(404,"Transaction not found.")
    record=rows[0]
    aid=record.get("account_id") if body.bank_transaction_id else record.get("bank_account_id")
    fingerprint=record.get("payer_fingerprint") if body.bank_transaction_id else None
    label=body.payer_label.strip()
    if body.payer_id:
        payer=rest("hba_payer_households",t,query="id=eq."+str(body.payer_id))
        if not payer or payer[0]["bank_account_id"]!=aid or payer[0]["household_uid"]!=body.household_uid:
            raise HTTPException(409,"Saved payer does not match this account and household; review before crediting.")
        if fingerprint and fingerprint!=payer[0]["fingerprint"]:
            raise HTTPException(409,"The bank's stable payer key differs from the selected saved payer.")
        fingerprint=payer[0]["fingerprint"];label=payer[0]["label"]
    if body.payer_key.strip():
        candidate=payer_fingerprint(aid,body.payer_key)
        if fingerprint and fingerprint!=candidate:
            raise HTTPException(409,"The entered payer key does not match the saved or imported payer. Do not overwrite it.")
        fingerprint=candidate
    if body.remember and (not aid or not fingerprint or not label):
        raise HTTPException(400,"To remember the household, choose an HBA account and supply a verified stable payer key and label.")
    common={"p_uid":body.household_uid,"p_year":body.dues_year,"p_annual_due":str(body.annual_due),
            "p_payer_fingerprint":fingerprint if body.remember else None,"p_payer_label":label if body.remember else None}
    if body.bank_transaction_id:
        result=rest("rpc/hba_book_bank_dues",t,"POST",{**common,"p_transaction":str(body.bank_transaction_id),
            "p_payee":body.payee.strip() or record["description"][:180] or "Confirmed dues check",
            "p_memo":body.memo,"p_remember":body.remember})
    else:
        result=rest("rpc/hba_credit_dues_receipt",t,"POST",{**common,"p_register":str(body.register_id),"p_amount":str(body.amount)})
    return {**result,"notice":"Household dues credited once and its status recalculated. No adopted budget changed."}

class DuesTargetCorrection(BaseModel):
    annual_due: Decimal = Field(gt=0,max_digits=12,decimal_places=2)
    source_note: str = Field(min_length=1,max_length=1000)

@router.put("/api/dues-targets/{year}/{household}")
def correct_dues_target(year: int,household: str,body: DuesTargetCorrection,req: Request):
    t,_=require(req,("admin",));year_ok(year)
    if household not in VALID:
        raise HTTPException(400,"Select a mapped household.")
    rest("rpc/hba_correct_dues_target",t,"POST",{"p_uid":household,"p_year":year,
        "p_annual":str(body.annual_due),"p_note":body.source_note})
    return {"saved":True,"notice":"Verified annual amount corrected with an audit entry; household status recalculated."}
