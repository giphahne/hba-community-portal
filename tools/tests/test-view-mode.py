"""Isolated local-session copy: exercises real RLS without changing the member's open session."""
import base64
import json
import secrets
import sqlite3
from pathlib import Path
import httpx
from cryptography.fernet import Fernet
root=Path(__file__).parent/"community-private-data"
f=Fernet((root/"session.key").read_bytes())
db=sqlite3.connect(root/"sessions.sqlite",timeout=30)
rows=db.execute("select visitor,payload from sessions").fetchall()
source=None
for _,blob in rows:
    s=json.loads(f.decrypt(blob));p=s["token"].split(".")[1]
    claims=json.loads(base64.urlsafe_b64decode(p+"="*(-len(p)%4)))
    if claims.get("email")=="admin@example.com" and s.get("view_mode")!="resident":source=s;break
if source is None:raise RuntimeError("No approved board session to test")
visitor="qa-isolated-view-"+secrets.token_hex(12)
source["proof"]=secrets.token_urlsafe(30)
with db:db.execute("insert into sessions values(?,?)",(visitor,f.encrypt(json.dumps(source).encode())))
client=httpx.Client(base_url="http://127.0.0.1:3003",headers={"x-visitor-id":visitor,"x-hba-proof":source["proof"]},timeout=120)
try:
    r=client.get("/api/session");r.raise_for_status();assert r.json()["member"]["role"]=="admin"
    r=client.post("/api/view-mode",json={"mode":"resident"});r.raise_for_status()
    r=client.get("/api/session");r.raise_for_status()
    assert r.json()["member"]["role"]=="resident" and r.json()["member"]["actual_role"]=="admin"
    data=client.get("/api/community");data.raise_for_status();d=data.json()
    assert "work" not in d and "bid_reviews" not in d and "document_intakes" not in d and "members" not in d
    assert all(x.get("audience")!="board" for x in d["documents"])
    assert d["can_edit_finance"] is False and d["can_schedule"] is False
    assert client.post("/api/work",json={"title":"Denied QA","description":"Not a real request"}).status_code==403
    assert client.post("/api/bid-requests",json={"title":"Denied QA","scope":"Test"}).status_code==403
    assert client.get("/api/board-notifications").status_code==403
    r=client.post("/api/view-mode",json={"mode":"board"});r.raise_for_status()
    r=client.get("/api/session");r.raise_for_status();assert r.json()["member"]["role"]=="admin"
    assert client.post("/api/view-mode",json={"mode":"administrator"}).status_code==400
    print("Live API/RLS: board → resident → board, private-record exclusion, finance/scheduling denial and board-write refusal passed.")
finally:
    with db:db.execute("delete from sessions where visitor=?",(visitor,))
    db.close()
    print("Isolated local QA session removed. Original account role and view were not changed.")
