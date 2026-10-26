"""Messages center and administrator alert subscriptions."""

from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from hba.config import homes
from hba.push import VAPID_PUBLIC, notify_admin
from hba.sessions import require
from hba.supabase import rest

router = APIRouter()

# ---- Messages center -------------------------------------------------------------------------------
# A feed of what has happened, built from the existing tables with the member's own token, so each person
# sees only what the row-level rules already allow. The browser remembers when each member last read it.
def _inbox_items(t, m):
    items = []
    role = m["role"]
    board_role = role in {"board", "admin"}
    since = (datetime.now(timezone.utc) - timedelta(days=60)).strftime("%Y-%m-%dT%H:%M:%SZ")
    def pull(table, query):
        try:
            return rest(table, t, query=query) or []
        except HTTPException:
            return []
    def add(kind, at, title, body, tool, mine=False, action=False):
        if at:
            items.append({"kind": kind, "at": at, "title": title[:200], "body": (body or "")[:300], "tool": tool, "mine": mine, "action": action})
    label = lambda r: (r.get("display_name") or r.get("email") or "a neighbour") if isinstance(r, dict) else "a neighbour"
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
    for r in pull("hba_newsletters", f"select=id,title,issue_date,state,updated_at&state=eq.published&updated_at=gte.{since}&order=updated_at.desc&limit=10"):
        add("newsletter", r["updated_at"], f"Newsletter published: {r['title']}", f"Issue dated {nice_date(r.get('issue_date')) or 'not recorded'}", "newsletter")
    for r in pull("hba_meeting_minutes", f"select=id,title,meeting_date,state,updated_at&state=eq.approved&updated_at=gte.{since}&order=updated_at.desc&limit=10"):
        add("minutes", r["updated_at"], f"Minutes approved: {r['title']}", f"Meeting of {nice_date(r.get('meeting_date')) or 'date not recorded'}", "minutes")
    for r in pull("hba_votes", f"select=id,title,state,updated_at&state=in.(noticed,open,confirmed)&updated_at=gte.{since}&order=updated_at.desc&limit=10"):
        add("vote", r["updated_at"], {"noticed": "Vote notice posted", "open": "Voting is open", "confirmed": "Vote result confirmed"}.get(r["state"], "Vote update") + f": {r['title']}", "", "votes")
    for r in pull("hba_volunteer_tasks", f"select=id,title,task_date,state,updated_at&state=eq.published&updated_at=gte.{since}&order=updated_at.desc&limit=10"):
        add("volunteer", r["updated_at"], f"Volunteers wanted: {r['title']}", nice_date(r.get('task_date')) or 'Date to be announced', "volunteers")
    for r in pull("hba_photos", f"select=id,caption,status,created_at,event_id,storm_id,history_id&status=eq.published&created_at=gte.{since}&issue_id=is.null&work_id=is.null&order=created_at.desc&limit=12"):
        add("photo", r["created_at"], "New photograph published", r.get("caption") or "", "storms" if r.get("storm_id") else "households" if r.get("history_id") else "events")
    for r in pull("hba_storm_memories", f"select=id,title,storm_label,status,created_at&status=eq.published&created_at=gte.{since}&order=created_at.desc&limit=10"):
        add("storm", r["created_at"], f"Storm memory published: {r['title']}", r.get("storm_label") or "", "storms")
    for r in pull("hba_house_history", f"select=id,title,household_uid,status,created_at&status=eq.published&created_at=gte.{since}&order=created_at.desc&limit=10"):
        home = next((p["address"].title() for p in homes["properties"] if p["uid"] == r.get("household_uid")), "")
        add("story", r["created_at"], f"Household story published: {r['title']}", home, "households")
    for r in pull("hba_work", f"select=id,title,contractor,state,created_at&created_at=gte.{since}&order=created_at.desc&limit=8"):
        add("work", r["created_at"], f"Contractor work recorded: {r['title']}", f"{r.get('contractor') or ''} · {r.get('state','').replace('_',' ')}", "work")
    # Your own requests and their answers
    me = m["id"]
    for r in pull("hba_issues", f"select=id,title,state,board_note,updated_at,created_at,created_by&created_by=eq.{me}&order=updated_at.desc&limit=10"):
        if r["updated_at"] != r["created_at"] or r["state"] != "pending_meeting":
            add("issue-reply", r["updated_at"], f"Your report “{r['title']}”: {r['state'].replace('_',' ')}", r.get("board_note") or "", "issues", mine=True)
    for r in pull("hba_governor_messages", f"select=id,subject,to_position,state,board_note,updated_at,from_member_id&from_member_id=eq.{me}&state=in.(read,replied)&order=updated_at.desc&limit=10"):
        add("message-reply", r["updated_at"], f"Your message to the {r['to_position']} was {r['state']}", r.get("board_note") or "", "team", mine=True)
    for r in pull("hba_payment_reports", f"select=id,amount,payment_kind,state,board_note,reviewed_at,created_by&created_by=eq.{me}&state=in.(verified,rejected)&order=reviewed_at.desc&limit=10"):
        add("payment-reply", r.get("reviewed_at"), f"Your ${float(r['amount']):,.2f} {r['payment_kind']} report was {r['state']}", r.get("board_note") or "", "payments", mine=True)
    # Board: what residents have sent in
    if board_role:
        members = {x["id"]: x for x in pull("hba_members", "select=id,email,display_name,role,requested_at,created_at,requested_household_uid")}
        for x in members.values():
            if x["role"] == "pending":
                home = next((p["address"].title() for p in homes["properties"] if p["uid"] == x.get("requested_household_uid")), "")
                add("account", x.get("requested_at") or x.get("created_at"), f"Account request from {label(x)}", home, "members", action=True)
        for r in pull("hba_issues", f"select=id,title,location,state,created_at,created_by&created_at=gte.{since}&order=created_at.desc&limit=15"):
            add("issue", r["created_at"], f"Problem reported by {label(members.get(r['created_by']))}: {r['title']}", f"{r.get('location') or ''} · {r['state'].replace('_',' ')}", "issues", action=r["state"] == "pending_meeting")
        for r in pull("hba_governor_messages", f"select=id,subject,to_position,state,created_at,from_member_id&created_at=gte.{since}&order=created_at.desc&limit=15"):
            add("message", r["created_at"], f"Message to the {r['to_position']} from {label(members.get(r['from_member_id']))}", r.get("subject") or "", "team", action=r["state"] == "new")
        for r in pull("hba_payment_reports", f"select=id,amount,payment_kind,payment_method,state,created_at,created_by&created_at=gte.{since}&order=created_at.desc&limit=15"):
            add("payment", r["created_at"], f"Payment report from {label(members.get(r['created_by']))}: ${float(r['amount']):,.2f} {r['payment_kind']}", f"{r.get('payment_method') or ''} · {r['state']}", "payments", action=r["state"] == "pending")
        for r in pull("hba_storm_memories", f"select=id,title,status,created_at,created_by&status=eq.pending&order=created_at.desc&limit=10"):
            add("storm", r["created_at"], f"Storm memory to review from {label(members.get(r['created_by']))}: {r['title']}", "", "storms", action=True)
        for r in pull("hba_house_history", f"select=id,title,status,created_at,created_by&status=eq.pending&order=created_at.desc&limit=10"):
            add("story", r["created_at"], f"Household story to review from {label(members.get(r['created_by']))}: {r['title']}", "", "households", action=True)
        for r in pull("hba_photos", f"select=id,caption,status,created_at,created_by,storm_id,history_id&status=eq.pending&issue_id=is.null&work_id=is.null&order=created_at.desc&limit=10"):
            add("photo", r["created_at"], f"Photograph to review from {label(members.get(r['created_by']))}", r.get("caption") or "", "storms" if r.get("storm_id") else "households" if r.get("history_id") else "events", action=True)
        for r in pull("hba_bids", f"select=id,contractor,amount,state,created_at&created_at=gte.{since}&order=created_at.desc&limit=10"):
            add("bid", r["created_at"], f"Contractor bid: {r['contractor']} · ${float(r['amount']):,.2f}", r["state"], "bids", action=r["state"] == "submitted")
        for r in pull("hba_volunteer_signups", f"select=id,task_id,member_id,state,created_at&created_at=gte.{since}&order=created_at.desc&limit=10"):
            add("volunteer", r["created_at"], f"Volunteer signed up: {label(members.get(r['member_id']))}", r.get("state") or "", "volunteers")
    items.sort(key=lambda x: x["at"], reverse=True)
    return items[:60]

@router.get("/api/inbox")
def inbox(req: Request):
    t, m = require(req)
    items = _inbox_items(t, m)
    return {"items": items, "generated_at": datetime.now(timezone.utc).isoformat(), "role": m["role"]}

class PushSubscription(BaseModel):
    endpoint: str = Field(min_length=20, max_length=2000)
    keys: dict
    label: str = Field(default="", max_length=160)

@router.get("/api/push")
def push_state(req: Request):
    t, m = require(req)
    own, ready, note = [], True, ""
    if m["role"] == "admin":
        try:
            own = rest("hba_push_subscriptions", t, query="select=id,endpoint,label,created_at&order=created_at.asc")
        except HTTPException:
            ready, note = False, "Alert storage has not been set up in the database yet, so alerts cannot be turned on. The in-app Requests panel still works."
    return {"public_key": VAPID_PUBLIC, "allowed": m["role"] == "admin", "devices": own, "ready": ready, "note": note}

@router.post("/api/push/subscribe")
def push_subscribe(body: PushSubscription, req: Request):
    t, m = require(req, ("admin",))
    p256dh, auth = str(body.keys.get("p256dh", "")), str(body.keys.get("auth", ""))
    if not body.endpoint.startswith("https://") or not p256dh or not auth or len(p256dh) > 400 or len(auth) > 200:
        raise HTTPException(400, "The browser did not supply a usable push subscription.")
    existing = rest("hba_push_subscriptions", t, query="select=id&endpoint=eq." + quote(body.endpoint, safe=""))
    if existing:
        rest("hba_push_subscriptions", t, "PATCH", {"p256dh": p256dh, "auth": auth, "label": body.label.strip()[:160]}, "id=eq." + existing[0]["id"])
    else:
        rest("hba_push_subscriptions", t, "POST", {"endpoint": body.endpoint, "p256dh": p256dh, "auth": auth, "label": body.label.strip()[:160]})
    return {"saved": True}

class PushEndpoint(BaseModel):
    endpoint: str = Field(min_length=20, max_length=2000)

@router.post("/api/push/unsubscribe")
def push_unsubscribe(body: PushEndpoint, req: Request):
    t, _ = require(req, ("admin",))
    rest("hba_push_subscriptions", t, "DELETE", query="endpoint=eq." + quote(body.endpoint, safe=""))
    return {"removed": True}

@router.post("/api/push/test")
def push_test(req: Request):
    t, m = require(req, ("admin",))
    notify_admin(t, "test", "Hamilton Beach test alert", f"Alerts are working on this device. Sent {datetime.now(timezone.utc).astimezone().strftime('%b %d, %I:%M %p')}.")
    return {"sent": True}
