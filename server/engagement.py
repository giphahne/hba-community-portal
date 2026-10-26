"""Messages inbox, per-event volunteer sign-ups, Movie Night hosting offers and simple event polls.

Everything runs with the signed-in member's own token, so Supabase row-level security decides what each
account may read or change. When the supporting tables have not been created yet (see
community-private-data/migration-messages-signups-polls.sql) the endpoints answer with ``ready: false``
instead of failing, so the rest of the app keeps working.
"""
from datetime import date as ddate, datetime, time as dtime, timezone
from urllib.parse import quote

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

DEFAULT_CAPACITY = 10
MISSING = "Not set up yet: the board has not added this feature's storage to the database."


def setup(app, *, rest, require, board, notify_admin, uid):

    def safe(fn, fallback=None):
        try:
            return fn()
        except HTTPException as e:
            if e.status_code in (400, 404) and any(k in str(e.detail) for k in ("does not exist", "schema cache", "Could not find")):
                return fallback
            raise

    def table_ready(t, table):
        return safe(lambda: (rest(table, t, query="select=id&limit=1"), True)[1], False)

    # ---------------------------------------------------------------- messages
    class MessageIn(BaseModel):
        audience: str = Field(default="residents", pattern="^(member|residents|board)$")
        member_id: str | None = None
        subject: str = Field(min_length=1, max_length=200)
        body: str = Field(default="", max_length=4000)
        kind: str = Field(default="notice", max_length=40)
        tool: str = Field(default="", max_length=60)
        tool_arg: str = Field(default="", max_length=120)

    def send_message(t, *, audience, subject, body, kind="notice", member_id=None, tool="", tool_arg=""):
        """Insert a message with the acting member's token (RLS: board to anyone, residents to the board)."""
        row = {"audience": audience, "member_id": member_id if audience == "member" else None, "subject": subject[:200],
               "body": (body or "")[:4000], "kind": kind[:40], "tool": tool[:60], "tool_arg": tool_arg[:120]}
        return safe(lambda: rest("hba_messages", t, "POST", row, representation=True), None)

    @app.get("/api/messages")
    def list_messages(req: Request):
        t, m = require(req)
        rows = safe(lambda: rest("hba_messages", t, query="select=*&order=created_at.desc&limit=200"), None)
        if rows is None:
            return {"ready": False, "note": MISSING, "messages": []}
        reads = {r["message_id"] for r in (rest("hba_message_reads", t, query="select=message_id&member_id=eq." + m["id"]) or [])}
        for r in rows:
            r["read"] = r["id"] in reads
            r["mine"] = r.get("from_member_id") == m["id"]
        return {"ready": True, "messages": rows}

    class ReadIn(BaseModel):
        ids: list[str] = Field(default_factory=list, max_length=200)

    @app.post("/api/messages/read")
    def mark_read(body: ReadIn, req: Request):
        t, m = require(req)
        ids = {uid(i) for i in body.ids}
        if ids:
            have = {r["message_id"] for r in (rest("hba_message_reads", t, query="select=message_id&member_id=eq." + m["id"] + "&message_id=in.(" + ",".join(ids) + ")") or [])}
            new = [{"message_id": i, "member_id": m["id"]} for i in ids - have]
            if new:
                rest("hba_message_reads", t, "POST", new)
        return {"saved": len(ids)}

    @app.post("/api/messages")
    def post_message(body: MessageIn, req: Request):
        t, m = require(req)
        if m["role"] == "resident" and body.audience != "board":
            raise HTTPException(403, "Residents can write to the board; the board writes to residents.")
        member_id = uid(body.member_id) if body.audience == "member" and body.member_id else None
        if body.audience == "member" and not member_id:
            raise HTTPException(400, "Choose who the message is for.")
        saved = send_message(t, audience=body.audience, member_id=member_id, subject=body.subject, body=body.body,
                             kind=body.kind, tool=body.tool, tool_arg=body.tool_arg)
        if saved is None:
            raise HTTPException(503, MISSING)
        if body.audience == "board" and m["role"] != "admin":
            notify_admin(t, "message", "Message to the board", f"{m.get('display_name') or m['email']}: {body.subject}")
        return {"saved": True, "message": saved[0] if isinstance(saved, list) and saved else saved}

    # ------------------------------------------------------- event sign-ups
    def event_tasks(t, event_ids=None):
        q = "select=id,event_id,title,capacity,state,task_date,task_time,location&event_id=not.is.null"
        if event_ids:
            q += "&event_id=in.(" + ",".join(event_ids) + ")"
        return safe(lambda: rest("hba_volunteer_tasks", t, query=q), None)

    def ensure_task(t, event, capacity=DEFAULT_CAPACITY):
        """One published volunteer task per calendar event. Created with the board member's token."""
        existing = event_tasks(t, [event["id"]])
        if existing is None:
            return None
        if existing:
            return existing[0]
        row = {"title": "Volunteers: " + event["title"], "category": "event",
               "description": "Help set up, run and clean up " + event["title"] + ". The board will confirm times and jobs with volunteers.",
               "location": event.get("location") or "", "task_date": event.get("event_date"), "task_time": event.get("event_time"),
               "capacity": capacity, "state": "draft", "event_id": event["id"]}
        # Row security only lets the board insert drafts; publishing is a second step.
        made = rest("hba_volunteer_tasks", t, "POST", row, representation=True)
        if not made:
            return None
        pub = rest("hba_volunteer_tasks", t, "PATCH", {"state": "published"}, "id=eq." + made[0]["id"], representation=True)
        return pub[0] if pub else made[0]

    @app.get("/api/event-signups")
    def event_signups(req: Request, year: int | None = None):
        """Live counts for every event with a sign-up sheet, plus whether this member is on it."""
        t, m = require(req)
        tasks = event_tasks(t)
        if tasks is None:
            return {"ready": False, "note": MISSING, "events": {}}
        counts = {c["task_id"]: int(c.get("signed_up") or 0) for c in (rest("rpc/hba_volunteer_counts", t, "POST", {}) or [])}
        mine = {s["task_id"] for s in (rest("hba_volunteer_signups", t, query="select=task_id,state&member_id=eq." + m["id"] + "&state=eq.signed_up") or [])}
        out = {}
        for tk in tasks:
            if year and str(tk.get("task_date") or "")[:4] not in ("", str(year)):
                continue
            out[tk["event_id"]] = {"task_id": tk["id"], "signed_up": counts.get(tk["id"], 0), "capacity": tk.get("capacity") or 0,
                                   "mine": tk["id"] in mine, "state": tk.get("state")}
        return {"ready": True, "events": out, "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}

    class SignupIn(BaseModel):
        join: bool = True
        note: str = Field(default="", max_length=1000)

    @app.put("/api/events/{event_id}/signup")
    def event_signup(event_id: str, body: SignupIn, req: Request):
        t, m = require(req)
        eid = uid(event_id)
        tasks = event_tasks(t, [eid])
        if tasks is None:
            raise HTTPException(503, MISSING)
        if not tasks:
            raise HTTPException(404, "This event has no volunteer sign-up sheet yet. The board can add one from the calendar.")
        rest("rpc/hba_volunteer_signup", t, "POST", {"p_task": tasks[0]["id"], "p_join": body.join, "p_note": body.note})
        if body.join and m["role"] != "admin":
            notify_admin(t, "volunteer", "Volunteer signed up", f"{m.get('display_name') or m['email']} will help with “{tasks[0]['title'].replace('Volunteers: ', '')}”.")
        return event_signups(req)

    class SheetIn(BaseModel):
        capacity: int = Field(default=DEFAULT_CAPACITY, ge=1, le=200)

    @app.post("/api/events/{event_id}/signup-sheet")
    def create_sheet(event_id: str, body: SheetIn, req: Request):
        t, _ = board(req)
        ev = rest("hba_events", t, query="select=id,title,location,event_date,event_time&id=eq." + uid(event_id))
        if not ev:
            raise HTTPException(404, "Event not found.")
        tk = ensure_task(t, ev[0], body.capacity)
        if tk is None:
            raise HTTPException(503, MISSING)
        return {"task": tk}

    @app.post("/api/events/signup-sheets/all")
    def create_all_sheets(req: Request):
        """Board: make sure every scheduled future event has a sign-up sheet."""
        t, _ = board(req)
        today = ddate.today().isoformat()
        evs = rest("hba_events", t, query="select=id,title,location,event_date,event_time&state=eq.scheduled&event_date=gte." + today + "&order=event_date.asc&limit=200") or []
        made = 0
        for ev in evs:
            before = event_tasks(t, [ev["id"]])
            if before is None:
                raise HTTPException(503, MISSING)
            if not before:
                ensure_task(t, ev)
                made += 1
        return {"events": len(evs), "created": made}

    # ------------------------------------------------------- hosting offers
    class OfferIn(BaseModel):
        series_title: str = Field(default="Movie Night", max_length=120)
        proposed_date: str
        proposed_time: str
        location: str = Field(default="", max_length=200)
        note: str = Field(default="", max_length=2000)
        movie_choices: list[str] = Field(default_factory=list, max_length=6)

    def check_dt(d, tm):
        try:
            ddate.fromisoformat(d)
            dtime.fromisoformat(tm)
        except ValueError:
            raise HTTPException(400, "Enter a valid date and time.")

    @app.get("/api/host-offers")
    def host_offers(req: Request):
        t, m = require(req)
        rows = safe(lambda: rest("hba_event_host_offers", t, query="select=*&order=created_at.desc&limit=100"), None)
        if rows is None:
            return {"ready": False, "note": MISSING, "offers": []}
        names = {}
        if m["role"] in ("board", "admin"):
            names = {r["id"]: (r.get("display_name") or r.get("email")) + (" (former resident)" if r.get("role") == "deleted" else "") for r in (rest("hba_members", t, query="select=id,display_name,email,role") or [])}
        for r in rows:
            r["mine"] = r["member_id"] == m["id"]
            r["host_name"] = names.get(r["member_id"]) if names else ("You" if r["mine"] else "A neighbour")
        return {"ready": True, "offers": rows}

    @app.post("/api/host-offers")
    def offer_host(body: OfferIn, req: Request):
        t, m = require(req)
        check_dt(body.proposed_date, body.proposed_time)
        choices = [c.strip()[:120] for c in body.movie_choices if c and c.strip()][:6]
        row = {"series_title": body.series_title.strip() or "Movie Night", "proposed_date": body.proposed_date, "proposed_time": body.proposed_time,
               "location": body.location.strip(), "note": body.note.strip(), "movie_choices": choices, "state": "pending"}
        made = safe(lambda: rest("hba_event_host_offers", t, "POST", row, representation=True), None)
        if made is None:
            raise HTTPException(503, MISSING)
        if m["role"] != "admin":
            notify_admin(t, "host", "Offer to host " + row["series_title"],
                         f"{m.get('display_name') or m['email']} offers {body.proposed_date} at {body.proposed_time}.")
        return {"saved": True, "offer": made[0]}

    class OfferReview(BaseModel):
        state: str = Field(pattern="^(approved|declined|withdrawn)$")
        board_note: str = Field(default="", max_length=1000)
        event_time: str | None = None          # the board may adjust the time when approving
        event_date: str | None = None
        location: str | None = Field(default=None, max_length=200)
        open_poll: bool = True

    @app.put("/api/host-offers/{offer_id}")
    def review_offer(offer_id: str, body: OfferReview, req: Request):
        t, m = require(req)
        oid = uid(offer_id)
        rows = safe(lambda: rest("hba_event_host_offers", t, query="select=*&id=eq." + oid), None)
        if not rows:
            raise HTTPException(404, "Offer not found.")
        offer = rows[0]
        if body.state == "withdrawn":
            if offer["member_id"] != m["id"]:
                raise HTTPException(403, "Only the person who offered can withdraw it.")
            rest("hba_event_host_offers", t, "PATCH", {"state": "withdrawn"}, "id=eq." + oid)
            return {"saved": True, "state": "withdrawn"}
        if m["role"] not in ("board", "admin"):
            raise HTTPException(403, "Only the board reviews hosting offers.")
        patch = {"state": body.state, "board_note": body.board_note.strip(), "reviewed_by": m["id"],
                 "reviewed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        result = {"saved": True, "state": body.state}
        if body.state == "approved":
            d, tm = body.event_date or offer["proposed_date"], body.event_time or offer["proposed_time"]
            check_dt(d, tm)
            loc = body.location if body.location is not None else offer.get("location") or ""
            series = rest("hba_series", t, query="select=id,title&title=ilike." + quote(offer["series_title"], safe=""))
            if not series:
                series = rest("hba_series", t, "POST", {"title": offer["series_title"], "description": "Summer event hosted by a resident."}, representation=True)
            sid = series[0]["id"]
            same_year = rest("hba_events", t, query="select=id&series_id=eq." + sid + "&event_date=gte." + d[:4] + "-01-01&event_date=lte." + d[:4] + "-12-31&state=eq.scheduled")
            ev_row = {"series_id": sid, "title": offer["series_title"], "event_date": d, "event_time": tm[:5], "location": loc,
                      "description": "Hosted by a resident volunteer. " + (offer.get("note") or ""), "state": "scheduled", "planning_only": False}
            if same_year:
                rest("hba_events", t, "PATCH", ev_row, "id=eq." + same_year[0]["id"])
                event_id = same_year[0]["id"]
            else:
                event_id = rest("hba_events", t, "POST", ev_row, representation=True)[0]["id"]
            patch["event_id"] = event_id
            result["event_id"] = event_id
            ev = {"id": event_id, "title": offer["series_title"], "location": loc, "event_date": d, "event_time": tm[:5]}
            ensure_task(t, ev)
            nice = datetime.strptime(d, "%Y-%m-%d").strftime("%A, %B %-d, %Y") + " at " + datetime.strptime(tm[:5], "%H:%M").strftime("%-I:%M %p")
            choices = [c for c in (offer.get("movie_choices") or []) if c]
            poll_id = None
            if body.open_poll and len(choices) >= 2:
                poll = safe(lambda: rest("hba_polls", t, "POST", {"event_id": event_id, "host_offer_id": oid, "title": "Choose the film for " + offer["series_title"],
                                                                 "question": f"{offer['series_title']} is {nice}" + (f" at {loc}" if loc else "") + ". Which film should we show?",
                                                                 "options": choices, "state": "open"}, representation=True), None)
                poll_id = poll[0]["id"] if poll else None
                result["poll_id"] = poll_id
            # Tell the host, then every resident.
            send_message(t, audience="member", member_id=offer["member_id"], kind="approval", subject=f"Your offer to host {offer['series_title']} is approved",
                         body=f"Thank you. {offer['series_title']} is on the calendar for {nice}" + (f" at {loc}" if loc else "") + "." + (f" Board note: {body.board_note.strip()}" if body.board_note.strip() else ""),
                         tool="calendar", tool_arg=d)
            send_message(t, audience="residents", kind="poll" if poll_id else "event", subject=(f"Vote: which film for {offer['series_title']}?" if poll_id else f"{offer['series_title']} is on the calendar"),
                         body=f"{offer['series_title']} will be {nice}" + (f" at {loc}" if loc else "") + ", hosted by a neighbour." + (" Tap to choose the film." if poll_id else ""),
                         tool="poll" if poll_id else "calendar", tool_arg=poll_id or d)
        elif body.state == "declined":
            send_message(t, audience="member", member_id=offer["member_id"], kind="reply", subject=f"About your offer to host {offer['series_title']}",
                         body="The board could not approve this date." + (f" Note: {body.board_note.strip()}" if body.board_note.strip() else " Thank you for offering; another date may work."), tool="summer")
        rest("hba_event_host_offers", t, "PATCH", patch, "id=eq." + oid)
        return result

    # ----------------------------------------------------------------- polls
    @app.get("/api/polls")
    def polls(req: Request, poll_id: str | None = None):
        t, m = require(req)
        q = "select=*&order=created_at.desc&limit=50" + ("&id=eq." + uid(poll_id) if poll_id else "")
        rows = safe(lambda: rest("hba_polls", t, query=q), None)
        if rows is None:
            return {"ready": False, "note": MISSING, "polls": []}
        mine = {v["poll_id"]: v["choice"] for v in (rest("hba_poll_votes", t, query="select=poll_id,choice&member_id=eq." + m["id"]) or [])}
        for p in rows:
            tally = {r["choice"]: int(r["votes"]) for r in (rest("rpc/hba_poll_tally", t, "POST", {"p": p["id"]}) or [])}
            p["tally"] = [{"choice": c, "votes": tally.get(c, 0)} for c in (p.get("options") or [])]
            p["total"] = sum(tally.values())
            p["my_choice"] = mine.get(p["id"])
        return {"ready": True, "polls": rows, "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}

    class VoteIn(BaseModel):
        choice: str = Field(min_length=1, max_length=200)

    @app.post("/api/polls/{poll_id}/vote")
    def cast(poll_id: str, body: VoteIn, req: Request):
        t, m = require(req)
        pid = uid(poll_id)
        rows = safe(lambda: rest("hba_polls", t, query="select=id,state,options,closes_at&id=eq." + pid), None)
        if not rows:
            raise HTTPException(404, "Poll not found.")
        p = rows[0]
        if p["state"] != "open":
            raise HTTPException(400, "This poll is closed.")
        if body.choice not in (p.get("options") or []):
            raise HTTPException(400, "Choose one of the listed options.")
        # One answer per member: replace any earlier choice.
        rest("hba_poll_votes", t, "DELETE", None, "poll_id=eq." + pid + "&member_id=eq." + m["id"])
        rest("hba_poll_votes", t, "POST", {"poll_id": pid, "member_id": m["id"], "choice": body.choice})
        return polls(req, poll_id)

    class PollState(BaseModel):
        state: str = Field(pattern="^(open|closed)$")

    @app.put("/api/polls/{poll_id}")
    def set_poll(poll_id: str, body: PollState, req: Request):
        t, _ = board(req)
        rest("hba_polls", t, "PATCH", {"state": body.state}, "id=eq." + uid(poll_id))
        return polls(req, poll_id)

    return {"send_message": send_message, "ensure_task": ensure_task, "table_ready": table_ready}
