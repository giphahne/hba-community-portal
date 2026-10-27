"""Seed realistic test data through the portal's own API, so every panel has something to show.

Each step is skipped when its record already exists (matched by title), so the seed can run before every walkthrough.
Returns a list of (step, outcome, detail) rows for the report; a failing step is a finding, not a crash.
"""
import io
import json
from datetime import date, timedelta

import httpx

from portal import Api, REPO

TODAY = date.today()
d = lambda days: (TODAY + timedelta(days=days)).isoformat()  # noqa: E731


def jpeg(text="HBA"):
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (640, 420), (19, 49, 92))
    ImageDraw.Draw(im).text((40, 180), text, fill=(244, 241, 232))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=80)
    return buf.getvalue()


def pdf(text="Hamilton Beach Association test document"):
    """A one-page PDF with real text, small enough to need no library."""
    stream = f"BT /F1 18 Tf 72 720 Td ({text}) Tj ET".encode()
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    out, offs = bytearray(b"%PDF-1.4\n"), []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + b"".join(b"%010d 00000 n \n" % o for o in offs)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)


def households():
    homes = json.loads((REPO / "private-app" / "dues-registry-data.json").read_text(encoding="utf-8"))["properties"]
    return [h["uid"] for h in homes]


def ensure_accounts(base, accts, log):
    """board@ and pending@ are created with the app's own sign-up, then the administrator approves board@ as board."""
    admin = Api(base, *accts["admin"])
    members = {m["email"]: m for m in admin.get("/api/community")["members"]}
    homes = households()
    for role, home in (("board", homes[3]), ("pending", homes[5])):
        email, pw = accts[role]
        if email not in members:
            try:
                r = httpx.post(base + "/api/auth/signup", json={"email": email, "password": pw, "display_name": f"Test {role.title()}",
                                                                "requested_household_uid": home, "request_note": "End-to-end test account"}, timeout=30)
                log.append((f"sign up {email}", "pass" if r.status_code == 200 else "fail", f"HTTP {r.status_code} {r.text[:160]}"))
            except Exception as e:
                log.append((f"sign up {email}", "fail", str(e)[:200]))
    members = {m["email"]: m for m in admin.get("/api/community")["members"]}
    b = members.get(accts["board"][0])
    if b and b["role"] != "board":
        try:
            admin.put(f"/api/members/{b['id']}", {"role": "board", "household_uid": homes[3]})
            log.append(("approve board@ as board", "pass", ""))
        except Exception as e:
            log.append(("approve board@ as board", "fail", str(e)[:200]))
    r = members.get(accts["resident"][0])
    if r and not r.get("household_uid"):
        try:
            admin.put(f"/api/members/{r['id']}", {"role": "resident", "household_uid": homes[0]})
            log.append(("link resident@ to a household", "pass", ""))
        except Exception as e:
            log.append(("link resident@ to a household", "fail", str(e)[:200]))
    return admin


def step(log, name, fn):
    try:
        out = fn()
        log.append((name, "skip" if out == "exists" else "pass", "already seeded" if out == "exists" else ""))
        return None if out == "exists" else out
    except Exception as e:
        log.append((name, "fail", str(e)[:300]))
        return None


def seed(base, accts):
    log = []
    admin = ensure_accounts(base, accts, log)
    Api(base, *accts["board"])  # board@ can sign in once approved
    resident = Api(base, *accts["resident"])
    c = admin.get("/api/community")
    have = lambda key, title: any(title == (r.get("title") or r.get("label")) for r in c.get(key, []))  # noqa: E731
    homes = households()

    def series():
        if have("series", "Summer Kickoff"):
            return "exists"
        return admin.post("/api/series", {"title": "Summer Kickoff", "description": "The season's first cookout on the beach."})
    step(log, "event series", series)
    c = admin.get("/api/community")
    sid = next((s["id"] for s in c["series"] if s["title"] == "Summer Kickoff"), None)

    def events():
        if have("events", "Summer Kickoff Cookout"):
            return "exists"
        admin.post("/api/events", {"series_id": sid, "title": "Summer Kickoff Cookout", "event_date": d(21), "event_time": "17:00",
                                   "location": "Main beach by the flagpole", "description": "Bring a side dish. Burgers and hot dogs provided.",
                                   "rain_date": d(22)})
        return admin.post("/api/events", {"series_id": sid, "title": "Beach Clean-up Morning", "event_date": d(35), "event_time": "09:00",
                                          "location": "Meet at the Algelo Ave path", "description": "Gloves and bags provided."})
    step(log, "events", events)

    def meetings():
        if have("meetings", "October Board of Governors meeting"):
            return "exists"
        admin.post("/api/meetings", {"title": "October Board of Governors meeting", "audience": "board", "meeting_date": d(10),
                                     "meeting_time": "19:00", "location": "Wareham Free Library, community room", "description": "Budget review and beach permits."})
        return admin.post("/api/meetings", {"title": "Annual meeting", "audience": "general", "meeting_date": d(45), "meeting_time": "10:00",
                                            "location": "Main beach pavilion", "description": "Elections and the annual plan."})
    step(log, "meetings", meetings)

    def agenda():
        if have("agenda", "Jetty repair estimate"):
            return "exists"
        mid = next((m["id"] for m in admin.get("/api/community")["meetings"] if m["title"].startswith("October")), None)
        return admin.post("/api/agenda", {"meeting_id": mid, "title": "Jetty repair estimate", "description": "Review two quotes.", "audience": "board"})
    step(log, "agenda item", agenda)

    def minutes():
        if have("minutes", "September board meeting minutes"):
            return "exists"
        m = admin.post("/api/minutes", {"title": "September board meeting minutes", "meeting_date": d(-30), "meeting_time": "19:00",
                                        "location": "Wareham Free Library", "called_to_order": "19:02", "adjourned": "20:15",
                                        "attendees": "President, Treasurer, Secretary, four street governors",
                                        "body": "The board reviewed the summer season and the beach nourishment permit.",
                                        "motions": "Motion to accept the treasurer's report. Passed 7-0.", "action_items": "Secretary to request jetty quotes."})
        admin.call("POST", f"/api/minutes/{m['id']}/file", None, files={"file": ("minutes.pdf", pdf("September minutes"), "application/pdf")})
        admin.put(f"/api/minutes/{m['id']}/state", {"state": "approved", "approved_on": d(-5), "approved_note": "Approved at the October meeting"})
        return m
    step(log, "minutes (with PDF, approved)", minutes)

    def newsletter():
        if have("newsletters", "Autumn 2026 newsletter"):
            return "exists"
        n = admin.post("/api/newsletters", {"title": "Autumn 2026 newsletter", "issue_date": d(-3), "issue_precision": "day",
                                            "body": "A look back at the summer, the clean-up morning and the annual meeting date."})
        admin.call("POST", f"/api/newsletters/{n['id']}/file", None, files={"file": ("newsletter.pdf", pdf("Autumn newsletter"), "application/pdf")})
        admin.put(f"/api/newsletters/{n['id']}/state", {"state": "published"})
        return n
    step(log, "newsletter (with PDF, published)", newsletter)

    def votes():
        if any(v["title"] == "Spend capital funds on jetty repair" for v in admin.get("/api/votes")["votes"]):
            return "exists"
        admin.post("/api/votes", {"decision": "opinion", "title": "Which film for the next Movie Night?",
                                  "motion": "Tell the board which film you would like to see.", "options": ["Jaws", "The Goonies", "Moana"]})
        return admin.post("/api/votes", {"decision": "capital", "title": "Spend capital funds on jetty repair",
                                         "motion": "Spend up to $12,000 from the Capital Improvement fund to repair the east jetty.", "amount": 12000,
                                         "meeting_id": next((m["id"] for m in admin.get("/api/community")["meetings"] if m["audience"] == "general"), None)})
    step(log, "votes (advisory poll + capital motion)", votes)

    def volunteers():
        if have("volunteer_tasks", "Grill crew for the Kickoff"):
            return "exists"
        t = admin.post("/api/volunteers", {"title": "Grill crew for the Kickoff", "category": "event", "description": "Two shifts at the grill.",
                                           "location": "Main beach", "task_date": d(21), "task_time": "16:30", "capacity": 4})
        admin.put(f"/api/volunteers/{t['id']}/state", {"state": "published"})
        resident.put(f"/api/volunteers/{t['id']}/signup", {"join": True, "note": "Happy to do the first shift"})
        return t
    step(log, "volunteer task (published, resident signed up)", volunteers)

    def register():
        f = admin.get(f"/api/finance/{TODAY.year}")
        if any(r["payee"] == "Wareham Sand & Gravel" for r in f["rows"]):
            return "exists"
        admin.post("/api/register", {"transaction_date": d(-20), "direction": "expense", "category_code": "sand", "payee": "Wareham Sand & Gravel",
                                     "amount": "1850.00", "reference": "Check 1042", "memo": "Spring sand delivery"})
        return admin.post("/api/register", {"transaction_date": d(-15), "direction": "income", "category_code": "dues", "payee": "Dues deposit",
                                            "amount": "2500.00", "reference": "Deposit 17", "memo": "Five households"})
    step(log, "check register entries", register)

    def dues():
        rows = admin.get(f"/api/dues/{TODAY.year}")["rows"]
        if any(r.get("status") == "paid" for r in rows):
            return "exists"
        for h in homes[:4]:
            admin.put(f"/api/dues/{TODAY.year}/{h}", {"status": "paid", "revision": 0})
        return admin.put(f"/api/dues/{TODAY.year}/{homes[4]}", {"status": "unpaid", "revision": 0})
    step(log, "dues statuses", dues)

    def payment_report():
        if c.get("payment_reports"):
            return "exists"
        return resident.post("/api/payment-reports", {"payment_kind": "dues", "fund": "dues", "payment_year": TODAY.year, "amount": 500,
                                                      "payment_date": d(-2), "payment_method": "check", "reference": "Check 311", "note": "Mailed to the P.O. box"})
    step(log, "payment report (resident)", payment_report)

    def bids():
        if have("bid_requests", "East jetty repair"):
            return "exists"
        r = admin.post("/api/bid-requests", {"title": "East jetty repair", "scope": "Reset displaced stones on the east jetty.", "location": "East jetty",
                                             "deadline": d(30), "state": "open"})
        return admin.post("/api/bids", {"request_id": r["id"], "contractor": "Buzzards Bay Marine", "contact": "office@example.org", "amount": "11400",
                                        "tax_basis": "included", "scope": "Reset 40 stones with a crane barge.", "timing": "Two weeks in April", "valid_until": d(60)})
    step(log, "bid request + bid", bids)

    def issues():
        if have("issues", "Pothole at Algelo and Shore"):
            return "exists"
        return resident.post("/api/issues", {"title": "Pothole at Algelo and Shore", "location": "Corner of Algelo Ave and Shore Ave",
                                             "description": "Deep pothole that fills with water after rain.", "category": "roads"})
    step(log, "issue (resident)", issues)

    def work():
        if have("work", "Drain cleaning on Worrall"):
            return "exists"
        w = admin.post("/api/work", {"title": "Drain cleaning on Worrall", "contractor": "Onset Drain Co.", "location": "Worrall Ave",
                                     "work_date": d(-10), "description": "Clean the two catch basins.", "state": "in_progress"})
        w = w[0] if isinstance(w, list) else w
        admin.post(f"/api/work/{w['id']}/notes", {"note": "First basin done.", "flag": "progress"})
        return w
    step(log, "contractor work + note", work)

    def documents():
        if any(x["title"] == "Beach nourishment permit 2025" for x in admin.get("/api/community")["documents"]):
            return "exists"
        return admin.call("POST", "/api/documents", None, data={"title": "Beach nourishment permit 2025", "category": "permit", "document_year": "2025",
                                                                "description": "Order of Conditions for the spring nourishment."},
                          files={"file": ("permit.pdf", pdf("Order of Conditions"), "application/pdf")})
    step(log, "document upload", documents)

    def photos():
        cc = admin.get("/api/community")
        if cc.get("photos"):
            return "exists"
        ev = next(e for e in cc["events"] if e["title"] == "Summer Kickoff Cookout")
        p = resident.call("POST", "/api/photos", None, data={"kind": "event", "parent_id": ev["id"], "caption": "Sunset at the Kickoff",
                                                              "credit": "Test Resident", "consent": "yes"},
                          files={"file": ("kickoff.jpg", jpeg("Kickoff"), "image/jpeg")})
        if p and p.get("id"):
            admin.post(f"/api/publish/photo/{p['id']}")
        return p
    step(log, "event photo (resident upload, board publishes)", photos)

    def story():
        cc = admin.get("/api/community")
        if any(h["title"] == "Our first summer here" for h in cc.get("history", [])):
            return "exists"
        home = Api(base, *accts["resident"]).member.get("household_uid") or homes[0]
        return resident.post("/api/house-history", {"household_uid": home, "title": "Our first summer here",
                                                     "story": "We bought the cottage in 1978 and the porch still has the original screens.", "history_year": 1978})
    step(log, "household story (resident)", story)

    def message():
        if any(x.get("subject") == "Speed bumps on Shore Ave" for x in admin.get("/api/team/messages").get("messages", [])):
            return "exists"
        return resident.post("/api/team/messages", {"to_position": "President", "subject": "Speed bumps on Shore Ave",
                                                    "body": "Could the board discuss speed bumps at the next meeting?"})
    step(log, "message to a governor (resident)", message)

    def storm():
        sm = admin.get("/api/storm-memories")["memories"]
        if any(m["title"] == "The water reached our steps" for m in sm):
            return "exists"
        return resident.post("/api/storm-memories", {"storm_key": "bob-1991", "storm_label": "Hurricane Bob (1991)", "event_year": 1991,
                                                      "title": "The water reached our steps", "story": "We watched the tide come up the lane.",
                                                      "where_text": "Algelo Ave"})
    step(log, "storm memory (resident)", storm)

    def officeholder():
        if admin.get("/api/team")["officeholders"]:
            return "exists"
        pos = admin.get("/api/team")["positions"][0]
        pos = pos.get("position") or pos.get("key") or pos.get("id") if isinstance(pos, dict) else pos
        return admin.post("/api/officeholders", {"position": pos, "member_name": "Pat Example", "contact_phone": "508-555-0100",
                                                 "contact_email": "president@example.org", "term_start": d(-300), "term_end": d(400)})
    step(log, "officeholder", officeholder)
    return log


if __name__ == "__main__":
    import sys
    from portal import accounts
    for row in seed(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3003", accounts()):
        print(*row, sep=" | ")
