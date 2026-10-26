"""HBA votes and advisory polls: bylaw-guided classification, frozen rolls, ballots, certification and exports.

The database (RLS, triggers and SECURITY DEFINER functions) remains the authority for who may act.
This module derives the rules a vote must satisfy from the 2022 bylaws and never certifies anything itself.
"""
from pathlib import Path
import contextvars
import math
import os
import re
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta, date
from email.message import EmailMessage
from email.policy import SMTP
from uuid import UUID

from fastapi import HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

def app_url():
    """Public address of the portal for notice drafts (same setting as community-api.py)."""
    return os.environ.get("HBA_PUBLIC_URL", "").strip().rstrip("/") or "http://127.0.0.1:3003"

GOVERNOR_SEATS = ['Pilgrim Street Governor', 'Algelo Street Governor', 'Worrall Street Governor', 'Surf Street Governor',
                  'Turner Street Governor', 'Glen Street Governor', 'Reynolds Street Governor',
                  'Governor at Large 1', 'Governor at Large 2', 'Governor at Large 3']
STREETS = ['Pilgrim', 'Algelo', 'Worrall', 'Surf', 'Turner', 'Glen', 'Reynolds']
YES_NO = ["Yes", "No", "Abstain"]

DECISIONS = {
    "opinion": {"label": "Gather resident opinions only (advisory poll, not binding)", "kind": "advisory", "electorate": "all_members",
                "threshold": "none", "quorum": 0, "secret": False, "tie_break": False,
                "basis": "Advisory only. The 2022 bylaws do not provide for binding electronic polls; results inform the board and are never recorded as an Association decision."},
    "annual_plan": {"label": "Adopt or change the annual plan / operating budget", "kind": "board", "electorate": "governors",
                    "threshold": "majority", "quorum": 7, "secret": False, "tie_break": True,
                    "basis": "Article V: the Board of Governors decides issues including adoption of the annual plan by vote; quorum is at least 7 of 10 Governors present and able to vote; the President casts the deciding vote when an even number of Governors vote and the result is a tie."},
    "board_matter": {"label": "Other operating decision for the Board of Governors", "kind": "board", "electorate": "governors",
                     "threshold": "majority", "quorum": 7, "secret": False, "tie_break": True,
                     "basis": "Article V voting process: Board of Governors quorum of 7 of 10; presidential tie-break applies only to an even number of Governors voting."},
    "capital": {"label": "Spend Capital Improvement funds", "kind": "capital", "electorate": "households",
                "threshold": "majority", "quorum": 30, "secret": False, "tie_break": False,
                "basis": "Article V: Capital Improvement fund expenditures are voted on by a majority of the membership. Article VII §II: a binding general-meeting issue vote needs 30 members/households present; written proxies filed with the Secretary before the meeting count as present."},
    "dues_increase": {"label": "Increase annual dues", "kind": "dues_increase", "electorate": "households",
                      "threshold": "majority", "quorum": 30, "secret": False, "tie_break": False,
                      "basis": "Article VII §II: dues increases are voted on by the members; 30 members/households must be present for a binding vote; written proxies count as present."},
    "membership_issue": {"label": "Put another specific issue to the general membership", "kind": "membership", "electorate": "households",
                         "threshold": "majority", "quorum": 30, "secret": False, "tie_break": False,
                         "basis": "Article VII §II: when the Board of Governors determines an issue needs a membership vote at a general meeting, a quorum of 30 members/households is required for a binding vote; proxies in writing to the Secretary before the meeting count."},
    "beach_street_improvement": {"label": "Approve a recommended beach or street improvement", "kind": "membership", "electorate": "households",
                                 "threshold": "majority", "quorum": 30, "secret": False, "tie_break": False,
                                 "basis": "Article VI: the President may recommend beach and street improvements annually for membership approval; Article VII §II quorum of 30 households applies to a binding general-meeting vote."},
    "elect_president": {"label": "Elect the President", "kind": "election", "electorate": "households",
                        "threshold": "plurality", "quorum": 0, "secret": True, "tie_break": False,
                        "basis": "Article IV and VII §II: the Association elects a President every other August at the annual meeting; one vote per household (plus one per additional dues-paid property)."},
    "elect_at_large": {"label": "Elect a Governor at Large", "kind": "election", "electorate": "households",
                       "threshold": "plurality", "quorum": 0, "secret": True, "tie_break": False,
                       "basis": "Article VIII §I: Governors at Large are elected by members attending the August annual meeting; one member of each property current in dues and assessments casts one vote."},
    "elect_street": {"label": "Elect a Street Governor", "kind": "election", "electorate": "street",
                     "threshold": "plurality", "quorum": 0, "secret": True, "tie_break": False,
                     "basis": "Article IV and VIII §I: Street Governors are elected by the members on the street they represent at the August annual meeting for two years."},
    "remove_president_or_at_large": {"label": "Remove the President or a Governor at Large", "kind": "removal_elected", "electorate": "households",
                                     "threshold": "majority", "quorum": 30, "secret": True, "tie_break": False,
                                     "basis": "Article IV: an elected official may be relieved and replaced by a majority vote of the electing body, the Association membership. Article VII §II quorum applies to a binding membership vote."},
    "remove_street_governor": {"label": "Remove a Street Governor", "kind": "removal_elected", "electorate": "street",
                               "threshold": "majority", "quorum": 0, "secret": True, "tie_break": False,
                               "basis": "Article IV: Street Governors are relieved by a majority vote of the residents of their street. The bylaws set no separate quorum for a street vote; follow the adopted Voting Guidelines & Procedures."},
    "remove_appointed": {"label": "Remove an appointed officer (VP, Treasurer or Secretary)", "kind": "removal_appointed", "electorate": "board_and_president",
                         "threshold": "majority", "quorum": 7, "secret": True, "tie_break": False,
                         "basis": "Article IV: an appointed officer may be relieved by a majority vote of the Governors and President after a scheduled hearing with the President, Board of Governors and the officer."},
    "amendment": {"label": "Amend the Constitution & Bylaws", "kind": "amendment", "electorate": "households",
                  "threshold": "two_thirds", "quorum": 30, "secret": False, "tie_break": False,
                  "basis": "Article X: Board-recommended amendments must be reviewed by outside legal counsel and approved by a two-thirds vote of the members with a quorum attending an annual meeting (June or August)."},
}
NOT_A_VOTE = {
    "emergency_spend": "Article V gives the President authority to spend up to $1,500 for emergency use without a Board vote. Record it as a presidential emergency expenditure in Governance instead of calling a vote.",
    "appoint_officer": "Article IV: the President appoints the Vice President, Treasurer and Secretary subject to Board approval. Record Board approval as a board matter vote if a formal vote is taken.",
}


class Answers(BaseModel):
    decision: str
    title: str = Field(default="", max_length=180)
    motion: str = Field(default="", max_length=12000)
    rationale: str = Field(default="", max_length=12000)
    meeting_id: UUID | None = None
    amount: float | None = Field(default=None, ge=0)
    emergency: bool = False
    street: str = Field(default="", max_length=60)
    hearing_scheduled: bool = False
    legal_review_done: bool = False
    board_determined: bool = False
    options: list[str] = Field(default_factory=list, max_length=20)
    secret_ballot: bool | None = None
    proxy_deadline: datetime | None = None
    supersedes_id: UUID | None = None


def classify(a: Answers, meetings=None):
    """Return the rules a vote must satisfy, open questions, and blocking problems. Pure function."""
    if a.decision in NOT_A_VOTE:
        return {"not_a_vote": NOT_A_VOTE[a.decision], "problems": [], "questions": [], "cautions": []}
    d = DECISIONS.get(a.decision)
    if not d:
        raise HTTPException(400, "Choose what is being decided.")
    rules = {k: d[k] for k in ("kind", "electorate", "threshold", "secret", "tie_break", "basis")}
    rules["quorum_required"] = d["quorum"]
    rules["street"] = ""
    rules["options"] = list(YES_NO)
    questions, problems, cautions = [], [], []
    if a.secret_ballot is not None:
        if d["kind"] in ("election", "removal_elected", "removal_appointed") and not a.secret_ballot:
            cautions.append("Elections and removals default to a secret ballot. A recorded (open) ballot was chosen; make sure the adopted procedures allow it.")
        rules["secret"] = a.secret_ballot
    if d["electorate"] == "street":
        street = a.street.strip().title()
        if street not in STREETS:
            problems.append("Choose which street's residents vote.")
        rules["street"] = street
    if d["kind"] == "election":
        opts = [o.strip() for o in a.options if o.strip()]
        if len(opts) < 1:
            problems.append("Enter the accepted candidates. A single candidate can still be ratified.")
        rules["options"] = (opts if len(opts) >= 2 else opts + ["No confidence / leave vacant"]) if opts else YES_NO
        cautions.append("Candidates should come from accepted nominations. One officer or governor per residence or property (Article IV).")
    if d["kind"] in ("capital", "board") and a.amount is not None:
        if a.emergency and a.amount <= 1500 and d["kind"] == "board":
            cautions.append("Up to $1,500 of emergency spending needs no Board vote (Article V). A vote is optional here.")
        if d["kind"] == "board" and a.amount > 0:
            questions.append("Is this spending inside the adopted annual plan? If it is Capital Improvement spending, choose the capital option so the membership votes.")
    if d["kind"] == "capital" and a.amount is None:
        questions.append("Enter the capital amount so the record shows what the membership approved.")
    if d["kind"] == "amendment" and not a.legal_review_done:
        problems.append("Article X requires outside legal counsel to review the recommended amendment before the membership votes.")
    if d["kind"] == "removal_appointed" and not a.hearing_scheduled:
        problems.append("Article IV requires a scheduled hearing with the President, Board of Governors and the officer before this vote.")
    if d["kind"] in ("membership", "capital", "dues_increase") and not a.board_determined:
        questions.append("Confirm the Board of Governors determined this issue goes to the membership (Article VII §II).")
    if d["electorate"] == "households":
        cautions.append("Interpretation pending the adopted procedures: 'majority' is applied to Yes and No votes cast by eligible households and proxies, and online ballots do not count toward the 30-household quorum unless the procedures say so.")
    if d["kind"] == "advisory":
        cautions.append("Results will be labelled advisory and cannot be recorded as an Association decision.")
    if meetings is not None and d["kind"] != "advisory":
        m = next((x for x in meetings if str(x["id"]) == str(a.meeting_id)), None) if a.meeting_id else None
        if not m:
            problems.append("Link the meeting where this vote will be taken.")
        else:
            want = "board" if d["electorate"] in ("governors", "board_and_president") else "general"
            if m.get("audience") != want:
                problems.append(f"This vote belongs to a {'Board of Governors' if want == 'board' else 'general membership'} meeting; the linked meeting is marked as a {m.get('audience')} meeting.")
            if m.get("state") == "cancelled":
                problems.append("The linked meeting is cancelled.")
            if d["kind"] == "amendment" and int(m["meeting_date"][5:7]) not in (6, 8):
                problems.append("Amendments are voted at an annual meeting (June or August).")
            if d["kind"] == "election" and int(m["meeting_date"][5:7]) != 8:
                cautions.append("Elections are normally held at the August annual meeting in an election year.")
    return {"rules": rules, "questions": questions, "problems": problems, "cautions": cautions, "label": d["label"]}


def outcome_for(v, t, procedures):
    counts = {k: int(x) for k, x in (t.get("counts") or {}).items()}
    participating, able = t["units_participating"], t["units_able"]
    online_counts = bool(procedures.get("online_counts_toward_quorum"))
    present = participating if online_counts else participating - (t.get("online") or 0)
    if v["electorate"] in ("governors", "board_and_president"):
        quorum_met = able >= v["quorum_required"]
        rule = f"Quorum: {able} Governors present and able to vote (need {v['quorum_required']} of 10)."
    else:
        quorum_met = present >= v["quorum_required"] if v["quorum_required"] else True
        rule = (f"Quorum: {present} households present in person or by written proxy" + ("" if online_counts else f" (online ballots: {t.get('online') or 0}, not counted toward quorum)") + f"; need {v['quorum_required']}." if v["quorum_required"] else "No quorum requirement defined in the bylaws for this electorate.")
    if v["kind"] == "advisory":
        return {"outcome": "advisory", "quorum_met": True, "rule_applied": "Advisory poll; no bylaw threshold applies."}
    if not quorum_met:
        return {"outcome": "no_quorum", "quorum_met": False, "rule_applied": rule + " Quorum not met; no binding decision."}
    if v["threshold"] == "plurality":
        ranked = sorted(counts.items(), key=lambda kv: -kv[1])
        if not ranked or ranked[0][1] == 0:
            return {"outcome": "failed", "quorum_met": True, "rule_applied": rule + " No votes were cast for any candidate."}
        if len(ranked) > 1 and ranked[0][1] == ranked[1][1]:
            return {"outcome": "failed", "quorum_met": True, "rule_applied": rule + f" Tie between {ranked[0][0]} and {ranked[1][0]}; no winner declared, a runoff is required under the adopted procedures."}
        return {"outcome": "elected", "quorum_met": True, "rule_applied": rule + f" Plurality: {ranked[0][0]} received {ranked[0][1]} of {sum(counts.values())} votes cast."}
    yes, no = counts.get("Yes", 0), counts.get("No", 0)
    if procedures.get("majority_rule") == "eligible_units":
        base, base_label = t["eligible_units"], "eligible units"
    else:
        base, base_label = yes + no, "Yes and No votes cast (abstentions excluded)"
    if v["threshold"] == "two_thirds":
        passed = base > 0 and yes * 3 >= 2 * base
        rule += f" Two-thirds of {base_label}: {yes} Yes, {no} No; needed {math.ceil(2 * base / 3) if base else 1}."
    else:
        passed = yes > base / 2
        rule += f" Majority of {base_label}: {yes} Yes, {no} No."
    if yes == no and v["president_tie_break"] and able % 2 == 0 and yes > 0:
        return {"outcome": "tie_pending", "quorum_met": True, "rule_applied": rule + " Tie with an even number of Governors voting; the President casts the deciding vote (Article V)."}
    if yes == no and v["president_tie_break"] and yes > 0:
        rule += " Tie with an odd number of Governors voting; no presidential tie-break applies."
    return {"outcome": "passed" if passed else "failed", "quorum_met": True, "rule_applied": rule}


def setup(app, *, rest, sb, require, board, homes, rate, anon_key):
    def uid(value):
        try:
            return str(UUID(str(value)))
        except ValueError:
            raise HTTPException(400, "Invalid record id.")

    def parallel(tasks):
        """Run independent storage reads concurrently; each keeps the request's context (resident-view flag)."""
        with ThreadPoolExecutor(max_workers=min(8, max(1, len(tasks)))) as pool:
            futures = {k: pool.submit(contextvars.copy_context().run, fn) for k, fn in tasks.items()}
            return {k: f.result() for k, f in futures.items()}

    def offices(token, member):
        rows = rest("hba_officeholders", token, query="select=position,member_name,member_id,household_uid,term_start,term_end")
        today = date.today().isoformat()
        mine = [o for o in rows if o.get("member_id") == member["id"] and (not o["term_start"] or o["term_start"] <= today) and (not o["term_end"] or o["term_end"] >= today)]
        admin = member["role"] == "admin"
        street = next((o["position"].split(" Street")[0] for o in mine if "Street Governor" in o["position"]), "")
        return rows, {"president": admin or any(o["position"] == "President" for o in mine),
                      "secretary": admin or any(o["position"] == "Secretary" for o in mine),
                      "governor": any("Governor" in o["position"] for o in mine), "street": street, "admin": admin,
                      "positions": [o["position"] for o in mine]}

    def display(rows, members, member_id):
        if not member_id:
            return ""
        o = next((x for x in rows if x.get("member_id") == member_id), None)
        if o:
            return f"{o['position']} · {o['member_name']}"
        m = next((x for x in (members or []) if x["id"] == member_id), None)
        return (m.get("display_name") or m.get("email")) if m else "Board account"

    def address(h):
        return next((p["address"].title() for p in homes["properties"] if p["uid"] == h), h or "")

    def vote_or_404(token, vid):
        rows = rest("hba_votes", token, query="id=eq." + uid(vid) + "&select=*")
        if not rows:
            raise HTTPException(404, "Vote not found or not visible to this account.")
        return rows[0]

    def tally(token, vid):
        return rest("rpc/hba_tally", token, "POST", {"p_vote": uid(vid)})

    def safe_tally(token, vid):
        try:
            return tally(token, vid)
        except HTTPException:
            return None

    @app.get("/api/votes")
    def list_votes(req: Request):
        token, m = require(req)
        is_board = m["role"] in ("board", "admin")
        year = date.today().year
        # Rolls grow by ~160 rows per vote, so counts come from an aggregate RPC and only the caller's own units/ballots are fetched.
        first = parallel({
            "offices": lambda: offices(token, m),
            "votes": lambda: rest("hba_votes", token, query="select=*&order=created_at.desc"),
            "results": lambda: rest("hba_vote_results", token, query="select=*"),
            "counts": lambda: rest("rpc/hba_vote_counts", token, "POST", {}),
            "roll": lambda: rest("hba_vote_roll", token, query="select=vote_id,unit_key,label,street,weight,eligible,reason,member_ids,household_uid&member_ids=cs.{" + m["id"] + "}"),
            "procedures": lambda: (rest("hba_voting_procedures", token, query="select=*") or [{}])[0],
            "eligibility": lambda: rest("rpc/hba_my_dues_status", token, "POST", {"p_year": year}),
            "members": lambda: rest("hba_members", token, query="select=id,email,display_name,role,household_uid&role=neq.deleted") if is_board else [],
            "meetings": lambda: rest("hba_meetings", token, query="select=id,title,meeting_date,meeting_time,audience,state&order=meeting_date.asc"),
            "comments": lambda: rest("hba_vote_comments", token, query="select=*&order=created_at.asc"),
            "annotations": lambda: rest("hba_vote_annotations", token, query="select=*&order=created_at.asc"),
            "nominations": lambda: rest("hba_nominations", token, query="select=*&order=election_year.asc,position.asc,created_at.asc"),
            "elections": lambda: rest("hba_elections", token, query="select=year,state,nomination_deadline,positions&order=year.asc"),
            "proxies": lambda: rest("hba_vote_proxies", token, query="select=*&order=filed_at.asc") if is_board else [],
        })
        rows, off = first["offices"]
        votes, results, roll, procedures, eligibility, members = first["votes"], first["results"], first["roll"], first["procedures"], first["eligibility"], first["members"]
        counts = {c["vote_id"]: c for c in first["counts"]}
        keys = sorted({r["unit_key"] for r in roll})
        ballot_filter = "cast_by=eq." + m["id"] if not keys else "or=(cast_by.eq." + m["id"] + ",unit_key.in.(" + ",".join('"' + k.replace('"', '') + '"' for k in keys) + "))"
        live = [v["id"] for v in votes if v["state"] in ("open", "closed") and (v["state"] in ("certified", "confirmed") or v["kind"] == "advisory" or is_board)]
        second = parallel({
            "ballots": lambda: rest("hba_ballots", token, query="select=id,vote_id,unit_key,source,choice,weight,recused,recusal_reason,cast_at,cast_by,receipt_code&" + ballot_filter),
            **{"tally:" + vid: (lambda vid=vid: safe_tally(token, vid)) for vid in live},
        })
        ballots = second["ballots"]
        summary = {}
        stored = {r["vote_id"]: r.get("tally") for r in results}
        for v in votes:
            units = [r for r in roll if r["vote_id"] == v["id"]]
            mine = [r for r in units if m["id"] in (r.get("member_ids") or [])]
            cast = [b for b in ballots if b["vote_id"] == v["id"]]
            cnt = counts.get(v["id"]) or {}
            summary[v["id"]] = {"eligible": cnt.get("eligible", 0), "listed": cnt.get("listed", 0),
                                "participating": cnt.get("ballots", 0) if is_board else None,
                                "my_units": [{"unit_key": r["unit_key"], "label": r["label"], "eligible": r["eligible"], "reason": r["reason"], "weight": r["weight"]} for r in mine],
                                "my_ballots": [b for b in cast if b.get("cast_by") == m["id"] or any(b["unit_key"] == r["unit_key"] for r in mine)]}
            if v["state"] in ("certified", "confirmed") or v["kind"] == "advisory" or is_board:
                # Certified counts are frozen in hba_vote_results; only live votes are re-counted.
                if v["state"] in ("certified", "confirmed") and stored.get(v["id"]):
                    summary[v["id"]]["tally"] = stored[v["id"]]
                elif v["state"] in ("open", "closed"):
                    summary[v["id"]]["tally"] = second.get("tally:" + v["id"])
                else:
                    summary[v["id"]]["tally"] = None
        for r in results:
            r["certified_label"] = display(rows, members, r["certified_by"]) or "Secretary"
            r["confirmed_label"] = display(rows, members, r.get("confirmed_by")) or ""
            r["tie_break_label"] = display(rows, members, r.get("tie_break_by")) or ""
        data = {"votes": votes, "results": results, "summary": summary, "procedures": procedures,
                "offices": {"can_call": off["president"], "can_certify": off["secretary"], "governor": off["governor"], "street": off["street"],
                            "positions": off["positions"], "admin": off["admin"]},
                "eligibility": [{**e, "address": address(e["household_uid"])} for e in eligibility], "year": year,
                "decisions": [{"value": k, "label": v["label"]} for k, v in DECISIONS.items()] + [{"value": k, "label": {"emergency_spend": "Emergency spending up to $1,500 (no vote needed)", "appoint_officer": "Appoint the VP, Treasurer or Secretary"}[k]} for k in NOT_A_VOTE],
                "streets": STREETS,
                "meetings": first["meetings"], "comments": first["comments"], "annotations": first["annotations"],
                "nominations": first["nominations"], "elections": first["elections"], "proxies": first["proxies"],
                "roll": roll if is_board else [], "seats": GOVERNOR_SEATS}
        if is_board:
            data["ballots"] = ballots
            data["members"] = members
        return data

    @app.get("/api/votes/{vid}/roll")
    def vote_roll(vid: str, req: Request):
        """Board only: the frozen roll and recorded ballot units for one vote (used by the Secretary's record and proxy forms)."""
        token, m = board(req)
        v = vote_or_404(token, vid)
        got = parallel({
            "roll": lambda: rest("hba_vote_roll", token, query="vote_id=eq." + v["id"] + "&select=unit_key,label,street,weight,eligible,reason,household_uid&order=label.asc"),
            "ballots": lambda: rest("hba_ballots", token, query="vote_id=eq." + v["id"] + "&select=unit_key,source,recused,cast_at"),
        })
        return got

    @app.post("/api/votes/classify")
    def classify_only(body: Answers, req: Request):
        token, m = require(req, ("board", "admin"))
        return classify(body, rest("hba_meetings", token, query="select=id,meeting_date,audience,state"))

    def build_record(body: Answers, token):
        c = classify(body, rest("hba_meetings", token, query="select=id,meeting_date,audience,state"))
        if c.get("not_a_vote"):
            raise HTTPException(400, c["not_a_vote"])
        if c["problems"]:
            raise HTTPException(400, " ".join(c["problems"]))
        if not body.title.strip() or not body.motion.strip():
            raise HTTPException(400, "Give the vote a title and the exact motion wording.")
        r = c["rules"]
        return {"kind": r["kind"], "title": body.title.strip(), "motion": body.motion.strip(), "rationale": body.rationale.strip(),
                "meeting_id": str(body.meeting_id) if body.meeting_id and r["kind"] != "advisory" else None,
                "electorate": r["electorate"], "street": r["street"], "threshold": r["threshold"], "quorum_required": r["quorum_required"],
                "secret_ballot": r["secret"], "president_tie_break": r["tie_break"], "options": r["options"],
                "amount": body.amount, "classification": body.model_dump(mode="json"), "basis": r["basis"],
                "cautions": c["cautions"] + c["questions"], "supersedes_id": str(body.supersedes_id) if body.supersedes_id else None,
                "proxy_deadline": body.proxy_deadline.isoformat() if body.proxy_deadline else None}

    @app.post("/api/votes")
    def create_vote(body: Answers, req: Request):
        token, m = board(req)
        record = build_record(body, token)
        if record["supersedes_id"]:
            old = vote_or_404(token, record["supersedes_id"])
            if old["state"] not in ("deferred", "withdrawn", "confirmed", "certified"):
                raise HTTPException(400, "A motion can only follow a deferred, withdrawn or decided vote.")
        return rest("hba_votes", token, "POST", record, representation=True)[0]

    @app.put("/api/votes/{vid}")
    def edit_vote(vid: str, body: Answers, req: Request):
        token, m = board(req)
        v = vote_or_404(token, vid)
        if v["state"] != "draft":
            raise HTTPException(409, "Only drafts can be edited. Withdraw or defer and propose a new motion instead.")
        record = build_record(body, token)
        return rest("hba_votes", token, "PATCH", record, query="id=eq." + v["id"], representation=True)[0]

    def freeze_roll(token, v):
        """Snapshot eligibility now. Later dues payments count for the next vote unless the Secretary re-freezes before opening."""
        rest("hba_vote_roll", token, "DELETE", query="vote_id=eq." + v["id"])
        members = rest("hba_members", token, query="select=id,household_uid,role,display_name,email&role=in.(resident,board,admin)")
        extra = rest("hba_member_households", token, query="select=member_id,household_uid")
        officeholders = rest("hba_officeholders", token, query="select=position,member_name,member_id,term_start,term_end,household_uid")
        today = date.today().isoformat()
        units = []
        def accounts(h):
            ids = [x["id"] for x in members if x.get("household_uid") == h] + [x["member_id"] for x in extra if x["household_uid"] == h]
            return sorted(set(ids))
        if v["electorate"] in ("governors", "board_and_president"):
            seats = GOVERNOR_SEATS + (["President"] if v["electorate"] == "board_and_president" else [])
            for seat in seats:
                o = next((x for x in officeholders if x["position"] == seat), None)
                linked = o and o.get("member_id") and (not o["term_start"] or o["term_start"] <= today) and (not o["term_end"] or o["term_end"] >= today)
                units.append({"unit_key": seat, "label": seat + (" · " + o["member_name"] if o else " · seat record missing"), "street": seat.split(" Street")[0] if "Street" in seat else "",
                              "weight": 1, "eligible": True, "household_uid": (o or {}).get("household_uid"),
                              "reason": "" if linked else ("No linked account; the Secretary records this vote at the meeting" if o else "No officeholder recorded for this seat; the Secretary must confirm who holds it"),
                              "basis": {"officeholder": bool(o), "linked_account": bool(linked)}, "member_ids": [o["member_id"]] if linked else []})
        elif v["electorate"] in ("households", "street"):
            meeting = (rest("hba_meetings", token, query="id=eq." + v["meeting_id"] + "&select=meeting_date") or [{}])[0]
            year = int((meeting.get("meeting_date") or today)[:4])
            dues = {d["uid"]: d for d in rest("hba_dues", token, query=f"select=uid,status,updated_at&year=eq.{year}")}
            for p in homes["properties"]:
                street = p["street"].title().replace(" Ave", "")
                if v["electorate"] == "street" and street != v["street"]:
                    continue
                d = dues.get(p["uid"])
                status = (d or {}).get("status", "unknown")
                units.append({"unit_key": p["uid"], "label": p["address"].title(), "street": street, "weight": 1, "household_uid": p["uid"],
                              "eligible": status == "paid",
                              "reason": "" if status == "paid" else (f"{year} dues not recorded as paid" if status == "unpaid" else f"{year} dues status not recorded; contact the Treasurer"),
                              "basis": {"dues_year": year, "dues_status": status, "dues_updated_at": (d or {}).get("updated_at")}, "member_ids": accounts(p["uid"])})
        else:  # advisory: one unit per approved household, accounts without a household count once each
            seen = set()
            for x in members:
                key = x.get("household_uid") or x["id"]
                if key in seen:
                    continue
                seen.add(key)
                units.append({"unit_key": key, "label": address(x["household_uid"]) if x.get("household_uid") else (x.get("display_name") or "Account without linked household"),
                              "street": "", "weight": 1, "household_uid": x.get("household_uid"), "eligible": True, "reason": "",
                              "basis": {"advisory": True}, "member_ids": accounts(x["household_uid"]) if x.get("household_uid") else [x["id"]]})
        for u in units:
            u["vote_id"] = v["id"]
        for i in range(0, len(units), 100):
            rest("hba_vote_roll", token, "POST", units[i:i + 100])
        return units

    @app.post("/api/votes/{vid}/notice")
    def publish_notice(vid: str, req: Request):
        token, m = board(req)
        v = vote_or_404(token, vid)
        if v["state"] != "draft":
            raise HTTPException(409, "Notice has already been published.")
        units = freeze_roll(token, v)
        eligible = sum(1 for u in units if u["eligible"])
        patch = {"roll_frozen_at": datetime.now(timezone.utc).isoformat(), "eligible_units": eligible,
                 "state": "open" if v["kind"] == "advisory" else "noticed",
                 "procedures_version": ((rest("hba_voting_procedures", token, query="select=version_label") or [{}])[0]).get("version_label", "")}
        if v["kind"] != "advisory" and eligible < v["quorum_required"]:
            patch["cautions"] = (v.get("cautions") or []) + [f"Only {eligible} eligible {'unit is' if eligible == 1 else 'units are'} on the frozen roll, fewer than the quorum of {v['quorum_required']}. A binding vote cannot reach quorum unless dues records change and the roll is re-frozen before opening."]
        saved = rest("hba_votes", token, "PATCH", patch, query="id=eq." + v["id"], representation=True)[0]
        return {"vote": saved, "eligible": eligible, "listed": len(units)}

    @app.post("/api/votes/{vid}/refreeze")
    def refreeze(vid: str, req: Request):
        token, m = board(req)
        v = vote_or_404(token, vid)
        if v["state"] != "noticed":
            raise HTTPException(409, "The roll can only be re-frozen between notice and opening.")
        units = freeze_roll(token, v)
        eligible = sum(1 for u in units if u["eligible"])
        rest("hba_votes", token, "PATCH", {"roll_frozen_at": datetime.now(timezone.utc).isoformat(), "eligible_units": eligible}, query="id=eq." + v["id"])
        rest("hba_vote_annotations", token, "POST", {"vote_id": v["id"], "note": f"Voter roll re-frozen by the Secretary before opening: {eligible} eligible of {len(units)} listed units."})
        return {"eligible": eligible, "listed": len(units)}

    class Transition(BaseModel):
        reason: str = Field(default="", max_length=2000)

    @app.post("/api/votes/{vid}/state/{action}")
    def transition(vid: str, action: str, body: Transition, req: Request):
        token, m = board(req)
        v = vote_or_404(token, vid)
        target = {"open": "open", "close": "closed", "reopen": "open", "withdraw": "withdrawn", "defer": "deferred"}.get(action)
        if not target:
            raise HTTPException(404, "Unknown action.")
        if action in ("withdraw", "defer") and not body.reason.strip():
            raise HTTPException(400, "Give the reason so the motion history stays complete.")
        if action == "reopen" and v["state"] not in ("closed", "certified"):
            raise HTTPException(409, "Only a closed, uncertified or certified-but-unconfirmed vote can be reopened.")
        if action == "reopen" and v["state"] == "certified":
            rest("hba_votes", token, "PATCH", {"state": "closed"}, query="id=eq." + v["id"])
            rest("hba_vote_results", token, "DELETE", query="vote_id=eq." + v["id"])
        saved = rest("hba_votes", token, "PATCH", {"state": target}, query="id=eq." + v["id"], representation=True)[0]
        if body.reason.strip():
            rest("hba_vote_annotations", token, "POST", {"vote_id": v["id"], "note": f"{action.title()}: {body.reason.strip()}"})
        return saved

    class Ballot(BaseModel):
        choice: str = Field(default="", max_length=200)
        recuse: bool = False
        reason: str = Field(default="", max_length=500)

    @app.post("/api/votes/{vid}/ballot")
    def cast(vid: str, body: Ballot, req: Request):
        token, m = require(req)
        if body.recuse and not body.reason.strip():
            raise HTTPException(400, "State the conflict of interest or reason for recusal.")
        rows = rest("rpc/hba_cast_ballot", token, "POST", {"p_vote": uid(vid), "p_choice": body.choice, "p_recuse": body.recuse, "p_reason": body.reason})
        r = rows[0] if isinstance(rows, list) else rows
        return {"receipt_code": r["receipt_code"], "unit_label": r["unit_label"],
                "message": "Keep this receipt code. It proves a ballot was recorded for your household; it never reveals a secret-ballot choice."}

    class Recorded(Ballot):
        unit_key: str = Field(max_length=120)
        source: str

    @app.post("/api/votes/{vid}/record")
    def record(vid: str, body: Recorded, req: Request):
        token, m = board(req)
        if body.source not in ("in_person", "proxy"):
            raise HTTPException(400, "Record in-person or proxy ballots only.")
        code = rest("rpc/hba_record_ballot", token, "POST", {"p_vote": uid(vid), "p_unit": body.unit_key, "p_choice": body.choice, "p_source": body.source, "p_recuse": body.recuse, "p_reason": body.reason})
        return {"receipt_code": code}

    class Proxy(BaseModel):
        household_uid: str = Field(max_length=100)
        holder_name: str = Field(min_length=1, max_length=160)
        filed_at: datetime
        note: str = Field(default="", max_length=1000)

    @app.post("/api/votes/{vid}/proxies")
    def file_proxy(vid: str, body: Proxy, req: Request):
        token, m = board(req)
        if body.filed_at.tzinfo is None:
            raise HTTPException(400, "Include the time zone of the filing time.")
        return rest("hba_vote_proxies", token, "POST", {"vote_id": uid(vid), **body.model_dump(mode="json")}, representation=True)[0]

    @app.delete("/api/vote-proxies/{pid}")
    def remove_proxy(pid: str, req: Request):
        token, m = board(req)
        rest("hba_vote_proxies", token, "DELETE", query="id=eq." + uid(pid))
        return {"deleted": True}

    class Certify(BaseModel):
        notes: str = Field(default="", max_length=4000)
        minutes_document_id: UUID | None = None

    @app.post("/api/votes/{vid}/certify")
    def certify(vid: str, body: Certify, req: Request):
        token, m = board(req)
        v = vote_or_404(token, vid)
        if v["state"] != "closed":
            raise HTTPException(409, "Close the vote before certifying.")
        procedures = (rest("hba_voting_procedures", token, query="select=*") or [{}])[0]
        t = tally(token, v["id"])
        o = outcome_for(v, t, procedures)
        record_ = {"vote_id": v["id"], "tally": t, "units_participating": t["units_participating"], "units_able": t["units_able"],
                   "quorum_met": o["quorum_met"], "outcome": o["outcome"], "rule_applied": o["rule_applied"], "notes": body.notes.strip(),
                   "minutes_document_id": str(body.minutes_document_id) if body.minutes_document_id else None}
        rest("hba_vote_results", token, "POST", record_)
        rest("hba_votes", token, "PATCH", {"state": "certified"}, query="id=eq." + v["id"])
        return {"outcome": o["outcome"], "tally": t, "rule_applied": o["rule_applied"]}

    class TieBreak(BaseModel):
        choice: str = Field(max_length=200)

    @app.post("/api/votes/{vid}/tie-break")
    def tie_break(vid: str, body: TieBreak, req: Request):
        token, m = board(req)
        v = vote_or_404(token, vid)
        if body.choice not in v["options"] or body.choice == "Abstain":
            raise HTTPException(400, "The deciding vote must be Yes or No.")
        rest("hba_vote_results", token, "PATCH", {"tie_break_choice": body.choice, "outcome": "passed" if body.choice == "Yes" else "failed"}, query="vote_id=eq." + v["id"])
        rest("hba_vote_annotations", token, "POST", {"vote_id": v["id"], "note": f"Presidential deciding vote cast: {body.choice} (Article V tie-break)."})
        return {"outcome": "passed" if body.choice == "Yes" else "failed"}

    @app.post("/api/votes/{vid}/confirm")
    def confirm(vid: str, body: Transition, req: Request):
        token, m = board(req)
        v = vote_or_404(token, vid)
        if v["state"] != "certified":
            raise HTTPException(409, "Results must be certified by the Secretary first.")
        rest("hba_vote_results", token, "PATCH", {"confirmed_at": datetime.now(timezone.utc).isoformat(), "confirmed_by": m["id"]}, query="vote_id=eq." + v["id"])
        rest("hba_votes", token, "PATCH", {"state": "confirmed"}, query="id=eq." + v["id"])
        if body.reason.strip():
            rest("hba_vote_annotations", token, "POST", {"vote_id": v["id"], "note": "Confirmation note: " + body.reason.strip()})
        return {"state": "confirmed"}

    class Note(BaseModel):
        note: str = Field(min_length=1, max_length=4000)

    @app.post("/api/votes/{vid}/annotations")
    def annotate(vid: str, body: Note, req: Request):
        token, m = board(req)
        return rest("hba_vote_annotations", token, "POST", {"vote_id": uid(vid), "note": body.note.strip()}, representation=True)[0]

    class Comment(BaseModel):
        body: str = Field(min_length=1, max_length=3000)

    @app.post("/api/votes/{vid}/comments")
    def comment(vid: str, body: Comment, req: Request):
        token, m = require(req)
        return rest("hba_vote_comments", token, "POST", {"vote_id": uid(vid), "body": body.body.strip()}, representation=True)[0]

    class Moderation(BaseModel):
        state: str

    @app.put("/api/vote-comments/{cid}")
    def moderate(cid: str, body: Moderation, req: Request):
        token, m = board(req)
        if body.state not in ("published", "hidden", "pending"):
            raise HTTPException(400, "Choose published, hidden or pending.")
        return rest("hba_vote_comments", token, "PATCH", {"state": body.state, "moderated_by": m["id"], "moderated_at": datetime.now(timezone.utc).isoformat()}, query="id=eq." + uid(cid), representation=True)[0]

    class Nomination(BaseModel):
        election_year: int = Field(ge=2027, le=2200)
        position: str = Field(min_length=1, max_length=80)
        candidate_name: str = Field(min_length=1, max_length=160)
        household_uid: str | None = None
        statement: str = Field(default="", max_length=4000)

    @app.post("/api/nominations")
    def nominate(body: Nomination, req: Request):
        token, m = require(req)
        if body.position not in GOVERNOR_SEATS + ["President"]:
            raise HTTPException(400, "Choose an elected position: President, a Street Governor or a Governor at Large.")
        if body.household_uid and body.household_uid not in {p["uid"] for p in homes["properties"]}:
            raise HTTPException(400, "Choose a mapped household.")
        return rest("hba_nominations", token, "POST", body.model_dump(), representation=True)[0]

    class NominationReview(BaseModel):
        state: str

    @app.put("/api/nominations/{nid}")
    def review_nomination(nid: str, body: NominationReview, req: Request):
        token, m = require(req)
        if body.state not in ("accepted", "declined", "withdrawn", "submitted"):
            raise HTTPException(400, "Invalid nomination state.")
        patch = {"state": body.state}
        if body.state in ("accepted", "declined"):
            patch.update(reviewed_by=m["id"], reviewed_at=datetime.now(timezone.utc).isoformat())
        return rest("hba_nominations", token, "PATCH", patch, query="id=eq." + uid(nid), representation=True)[0]

    class Procedures(BaseModel):
        document_id: UUID | None = None
        version_label: str = Field(default="", max_length=160)
        adopted_on: date | None = None
        online_ballots_allowed: bool = False
        online_counts_toward_quorum: bool = False
        majority_rule: str = "votes_cast"
        note: str = Field(default="", max_length=3000)
        confirm: bool = False

    @app.put("/api/voting-procedures")
    def save_procedures(body: Procedures, req: Request):
        token, m = require(req, ("admin",))
        if body.majority_rule not in ("votes_cast", "eligible_units"):
            raise HTTPException(400, "Choose how a majority is measured.")
        patch = body.model_dump(mode="json", exclude={"confirm"})
        patch["document_id"] = str(body.document_id) if body.document_id else None
        if body.confirm:
            if not (body.document_id and body.adopted_on and body.version_label.strip()):
                raise HTTPException(400, "Attach the board-approved Voting Guidelines & Procedures document, its adoption date and a version label before confirming.")
            patch.update(confirmed_by=m["id"], confirmed_at=datetime.now(timezone.utc).isoformat())
        else:
            patch.update(confirmed_by=None, confirmed_at=None)
        patch.update(updated_by=m["id"], updated_at=datetime.now(timezone.utc).isoformat())
        return rest("hba_voting_procedures", token, "PATCH", patch, query="id=eq.1", representation=True)[0]

    class HouseholdLink(BaseModel):
        member_id: UUID
        household_uid: str = Field(max_length=100)
        note: str = Field(default="", max_length=500)

    @app.post("/api/member-households")
    def link_household(body: HouseholdLink, req: Request):
        token, m = board(req)
        if body.household_uid not in {p["uid"] for p in homes["properties"]}:
            raise HTTPException(400, "Choose a mapped property.")
        target = rest("hba_members", token, query="id=eq." + str(body.member_id) + "&select=household_uid,role")
        if not target or target[0]["role"] not in ("resident", "board", "admin"):
            raise HTTPException(400, "Approve the account before linking extra properties.")
        if target[0]["household_uid"] == body.household_uid:
            raise HTTPException(400, "That is already the account's primary household.")
        rest("hba_member_households", token, "POST", {"member_id": str(body.member_id), "household_uid": body.household_uid, "note": body.note.strip()})
        return {"saved": True}

    @app.delete("/api/member-households/{member_id}/{household_uid}")
    def unlink_household(member_id: str, household_uid: str, req: Request):
        token, m = require(req, ("admin",))
        rest("hba_member_households", token, "DELETE", query="member_id=eq." + uid(member_id) + "&household_uid=eq." + re.sub(r"[^A-Za-z0-9_]", "", household_uid))
        return {"deleted": True}

    class Setting(BaseModel):
        value: str = Field(default="", max_length=2000)

    @app.put("/api/settings/{key}")
    def save_setting(key: str, body: Setting, req: Request):
        token, m = require(req, ("admin",))
        if not re.fullmatch(r"[a-z_]{3,60}", key):
            raise HTTPException(400, "Invalid setting key.")
        value = body.value.strip()
        if key == "public_facebook_group_url" and value:
            from urllib.parse import urlparse
            p = urlparse(value)
            if p.scheme != "https" or not (p.hostname or "").endswith("facebook.com") or p.username or p.password:
                raise HTTPException(400, "Enter an https://www.facebook.com/... link copied from the group's Share menu.")
        existing = rest("hba_settings", token, query="key=eq." + key + "&select=key")
        payload = {"value": value, "updated_by": m["id"], "updated_at": datetime.now(timezone.utc).isoformat()}
        if existing:
            return rest("hba_settings", token, "PATCH", payload, query="key=eq." + key, representation=True)[0]
        return rest("hba_settings", token, "POST", {"key": key, **payload}, representation=True)[0]

    # ----- exports -----
    def local(ts):
        from zoneinfo import ZoneInfo
        if not ts:
            return "not recorded"
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(ZoneInfo("America/New_York")).strftime("%b %d, %Y %I:%M %p %Z")

    @app.get("/api/votes/{vid}/export.md")
    def export_md(vid: str, req: Request):
        token, m = require(req)
        v = vote_or_404(token, vid)
        if v["state"] not in ("certified", "confirmed") and m["role"] not in ("board", "admin"):
            raise HTTPException(403, "Results are exported after certification.")
        rows, _ = offices(token, m)
        res = (rest("hba_vote_results", token, query="vote_id=eq." + v["id"]) or [None])[0]
        notes = rest("hba_vote_annotations", token, query="vote_id=eq." + v["id"] + "&order=created_at.asc")
        meeting = (rest("hba_meetings", token, query="id=eq." + v["meeting_id"] + "&select=title,meeting_date,meeting_time") or [None])[0] if v.get("meeting_id") else None
        t = None
        try:
            t = tally(token, v["id"]) if v["state"] in ("open", "closed", "certified", "confirmed") else None
        except HTTPException:
            pass
        lines = [f"# {v['title']}", "", f"Hamilton Beach Association · {'Advisory poll' if v['kind'] == 'advisory' else 'Vote'} · Status: {v['state']}", "",
                 f"**Meeting:** {meeting['title'] + ' · ' + meeting['meeting_date'] + ' ' + meeting['meeting_time'][:5] if meeting else 'None (advisory)'}",
                 f"**Electorate:** {v['electorate']}{' · ' + v['street'] if v['street'] else ''} · **Threshold:** {v['threshold']} · **Quorum:** {v['quorum_required'] or 'none'} · **Ballot:** {'secret' if v['secret_ballot'] else 'recorded'}",
                 f"**Eligible units on frozen roll:** {v.get('eligible_units') if v.get('eligible_units') is not None else 'roll not frozen'} (frozen {local(v.get('roll_frozen_at'))})",
                 "", "## Motion", "", v["motion"], ""]
        if v.get("rationale"):
            lines += ["## Background", "", v["rationale"], ""]
        lines += ["## Bylaw basis", "", v["basis"], ""]
        if v.get("cautions"):
            lines += ["## Cautions recorded at classification", ""] + [f"- {c}" for c in v["cautions"]] + [""]
        if t:
            lines += ["## Tally", "", "| Choice | Weighted votes |", "|---|---|"] + [f"| {k} | {x} |" for k, x in sorted((t.get("counts") or {}).items())]
            lines += ["", f"Units participating: {t['units_participating']} (online {t.get('online', 0)}, proxies {t.get('proxies', 0)}, recused {t.get('recused', 0)}); able to vote: {t['units_able']}; eligible: {t['eligible_units']}.", ""]
        if res:
            lines += ["## Result", "", f"**Outcome:** {res['outcome'].replace('_', ' ')}", "", res["rule_applied"], "",
                      f"Certified by {display(rows, None, res['certified_by']) or 'Secretary'} on {local(res['certified_at'])}.",
                      f"Confirmed by {display(rows, None, res.get('confirmed_by')) or '—'} on {local(res.get('confirmed_at'))}." if res.get("confirmed_at") else "Not yet confirmed by the President.",
                      f"Presidential deciding vote: {res['tie_break_choice']} ({local(res.get('tie_break_at'))})." if res.get("tie_break_choice") else "", ""]
            if res.get("notes"):
                lines += ["Secretary notes: " + res["notes"], ""]
        if notes:
            lines += ["## Record notes", ""] + [f"- {local(n['created_at'])}: {n['note']}" for n in notes] + [""]
        lines += ["---", f"Exported {local(datetime.now(timezone.utc).isoformat())}. This export reflects the app record; the signed minutes remain the official record of the Association."]
        return Response("\n".join(x for x in lines if x is not None), media_type="text/markdown; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="HBA-vote-{v["id"][:8]}.md"'})

    @app.get("/api/votes/{vid}/notice.eml")
    def notice_email(vid: str, req: Request):
        token, m = board(req)
        v = vote_or_404(token, vid)
        if v["state"] not in ("noticed", "open"):
            raise HTTPException(409, "Publish notice first.")
        roll = rest("hba_vote_roll", token, query="vote_id=eq." + v["id"] + "&eligible=eq.true&select=member_ids")
        ids = {i for r in roll for i in (r.get("member_ids") or [])}
        members = [x for x in rest("hba_members", token, query="select=id,email&role=in.(resident,board,admin)") if x["id"] in ids]
        meeting = (rest("hba_meetings", token, query="id=eq." + v["meeting_id"] + "&select=title,meeting_date,meeting_time,location") or [None])[0] if v.get("meeting_id") else None
        when = f"{meeting['title']} on {meeting['meeting_date']} at {meeting['meeting_time'][:5]} Eastern{(', ' + meeting['location']) if meeting and meeting.get('location') else ''}" if meeting else "an advisory poll (no meeting)"
        body_text = (f"Hamilton Beach Association notice of {'advisory poll' if v['kind'] == 'advisory' else 'vote'}\n\n{v['title']}\n\nMotion:\n{v['motion']}\n\nWhen: {when}\n"
                     + (f"Written proxies must reach the Secretary before the meeting starts{' (requested by ' + local(v['proxy_deadline']) + ')' if v.get('proxy_deadline') else ''}.\n" if v["electorate"] in ("households", "street") else "")
                     + f"\nWho may vote: {v['electorate'].replace('_', ' ')}{' on ' + v['street'] + ' Avenue' if v['street'] else ''}. Eligibility was frozen on {local(v.get('roll_frozen_at'))} from dues records; check your standing in the app's Votes section.\n\n"
                     f"Open the HBA app's Votes & polls section to read the full notice, ask questions before the meeting and check your eligibility:\n{app_url()}\n\n"
                     "This is a draft prepared by the board for review. It has not been sent by the app.\n")
        msg = EmailMessage(policy=SMTP)
        msg["Subject"] = f"HBA notice: {v['title']}"
        msg["To"] = "undisclosed-recipients:;"
        msg["Bcc"] = ", ".join(x["email"] for x in members) or "no-eligible-member-accounts@example.invalid"
        msg["X-Unsent"] = "1"
        msg.set_content(body_text)
        return Response(msg.as_bytes(), media_type="message/rfc822", headers={"Content-Disposition": f'attachment; filename="HBA-vote-notice-{v["id"][:8]}.eml"'})

    @app.get("/api/votes/{vid}/calendar.ics")
    def calendar(vid: str, req: Request):
        token, m = require(req)
        v = vote_or_404(token, vid)
        if not v.get("meeting_id"):
            raise HTTPException(409, "Advisory polls have no meeting to add.")
        meeting = rest("hba_meetings", token, query="id=eq." + v["meeting_id"] + "&select=title,meeting_date,meeting_time,duration_minutes,location")[0]
        start = meeting["meeting_date"].replace("-", "") + "T" + meeting["meeting_time"][:5].replace(":", "") + "00"
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        def ics(text):  # RFC 5545 TEXT escaping
            return str(text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")
        def ev(uidv, summary, dtstart, desc, duration):
            return ["BEGIN:VEVENT", f"UID:{uidv}@hba-votes", f"DTSTAMP:{stamp}", f"DTSTART;TZID=America/New_York:{dtstart}", f"DURATION:PT{duration}M",
                    f"SUMMARY:{ics(summary)}", f"DESCRIPTION:{ics(desc)}", f"LOCATION:{ics(meeting.get('location', ''))}", "END:VEVENT"]
        lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HBA//Votes//EN"]
        lines += ev(v["id"], f"HBA vote: {v['title']}", start, "Motion: " + v["motion"][:300].replace("\n", " "), meeting.get("duration_minutes") or 60)
        if v.get("proxy_deadline") and v["electorate"] in ("households", "street"):
            from zoneinfo import ZoneInfo
            pd = datetime.fromisoformat(v["proxy_deadline"].replace("Z", "+00:00")).astimezone(ZoneInfo("America/New_York"))
            lines += ev(v["id"] + "-proxy", f"HBA proxy deadline: {v['title']}", pd.strftime("%Y%m%dT%H%M%S"), "Written proxies must reach the Secretary before the meeting starts.", 30)
        lines.append("END:VCALENDAR")
        return Response("\r\n".join(lines) + "\r\n", media_type="text/calendar", headers={"Content-Disposition": f'attachment; filename="HBA-vote-{v["id"][:8]}.ics"'})

    @app.get("/api/votes/{vid}/turnout")
    def turnout(vid: str, req: Request):
        token, m = board(req)
        v = vote_or_404(token, vid)
        rows, off = offices(token, m)
        roll = rest("hba_vote_roll", token, query="vote_id=eq." + v["id"] + "&select=unit_key,street,eligible,label")
        ballots = rest("hba_ballots", token, query="vote_id=eq." + v["id"] + "&select=unit_key,source")
        cast = {b["unit_key"]: b["source"] for b in ballots}
        streets = {}
        for r in roll:
            s = r["street"] or "Other"
            if off["street"] and not off["admin"] and not off["president"] and not off["secretary"] and s != off["street"]:
                continue
            e = streets.setdefault(s, {"eligible": 0, "listed": 0, "voted": 0, "proxies": 0, "not_yet": []})
            e["listed"] += 1
            if r["eligible"]:
                e["eligible"] += 1
                if r["unit_key"] in cast:
                    e["voted"] += 1
                    e["proxies"] += cast[r["unit_key"]] == "proxy"
                elif off["street"] == s or off["admin"] or off["secretary"] or off["president"]:
                    e["not_yet"].append(r["label"])
        return {"streets": streets, "scope": off["street"] if off["street"] and not (off["admin"] or off["president"] or off["secretary"]) else "all",
                "note": "Turnout shows whether an eligible unit has voted, never how. Street Governors see only their own street."}
