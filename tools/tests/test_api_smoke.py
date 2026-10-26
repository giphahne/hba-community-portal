"""Smoke tests for sign-in, sessions, permission gating and the protected app folder.

These pin the behaviour the hosting refactor must keep. Supabase is faked (see conftest.py).
Run: pytest tools/tests
"""
import os
from pathlib import Path

import pytest

PASSWORD = "correct-horse-battery"
SNAPSHOT = Path(__file__).with_name("routes.snapshot.txt")


def sign_in(web, email, password=PASSWORD):
    r = web.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def proof(session):
    return {"X-HBA-Proof": session["proof"]}


def test_signed_out_by_default(web):
    assert web.get("/api/session").json() == {"signed_in": False}


def test_login_then_session(web, fake):
    fake.add_user("res@example.org", "resident")
    s = sign_in(web, "res@example.org")
    assert s["signed_in"] and s["member"]["role"] == "resident" and s["proof"]
    again = web.get("/api/session").json()
    assert again["signed_in"] and again["member"]["email"] == "res@example.org"


def test_wrong_password_rejected(web, fake):
    fake.add_user("res@example.org", "resident")
    r = web.post("/api/auth/login", json={"email": "res@example.org", "password": "wrong-password"})
    assert r.status_code == 400
    assert web.get("/api/session").json() == {"signed_in": False}


def test_unconfirmed_email_blocked(web, fake):
    fake.add_user("new@example.org", "resident", confirmed=False)
    r = web.post("/api/auth/login", json={"email": "new@example.org", "password": PASSWORD})
    assert r.status_code == 403


def test_app_requires_sign_in(web, fake):
    assert web.get("/app/").status_code in (401, 302, 303, 307)
    assert web.get("/app/home.js").status_code == 401
    fake.add_user("res@example.org", "resident")
    sign_in(web, "res@example.org")
    page = web.get("/app/")
    assert page.status_code == 200 and "auth-guard.js" in page.text
    assert web.get("/app/home.js").status_code == 200


def test_pending_member_cannot_open_app(web, fake):
    fake.add_user("wait@example.org", "pending")
    s = sign_in(web, "wait@example.org")
    assert s["member"]["role"] == "pending"
    assert web.get("/app/home.js").status_code == 403


def test_app_rejects_path_escape_and_odd_types(web, fake):
    fake.add_user("res@example.org", "resident")
    sign_in(web, "res@example.org")
    assert web.get("/app/../server/community-api.py").status_code == 404
    assert web.get("/app/%2e%2e/README.md").status_code == 404


def test_board_only_action_gated(web, fake):
    fake.add_user("res@example.org", "resident")
    fake.add_user("board@example.org", "board")
    s = sign_in(web, "res@example.org")
    url, body = "/api/settings/public_facebook_group_name", {"value": "Hamilton Beach friends"}
    assert web.put(url, json=body, headers=proof(s)).status_code == 403
    web.post("/api/logout", json={}, headers=proof(s))
    s = sign_in(web, "board@example.org")
    assert web.put(url, json=body, headers=proof(s)).status_code == 200
    assert any(t.startswith("hba_settings") for _, t, _ in fake.writes)


def test_proof_header_required_for_api(web, fake):
    fake.add_user("board@example.org", "board")
    sign_in(web, "board@example.org")
    r = web.put("/api/settings/public_facebook_group_name", json={"value": "x"})
    assert r.status_code == 401


def test_view_mode_preview(web, fake):
    fake.add_user("admin@example.org", "admin")
    s = sign_in(web, "admin@example.org")
    assert web.post("/api/view-mode", json={"mode": "resident"}, headers=proof(s)).status_code == 200
    m = web.get("/api/session").json()["member"]
    assert m["role"] == "resident" and m["actual_role"] == "admin" and m["view_mode"] == "resident"
    r = web.put("/api/settings/public_facebook_group_name", json={"value": "x"}, headers=proof(s))
    assert r.status_code == 403
    web.post("/api/view-mode", json={"mode": "board"}, headers=proof(s))
    assert web.get("/api/session").json()["member"]["role"] == "admin"


def test_resident_cannot_switch_view(web, fake):
    fake.add_user("res@example.org", "resident")
    s = sign_in(web, "res@example.org")
    assert web.post("/api/view-mode", json={"mode": "board"}, headers=proof(s)).status_code == 403


def test_logout(web, fake):
    fake.add_user("res@example.org", "resident")
    s = sign_in(web, "res@example.org")
    assert web.post("/api/logout", json={}, headers=proof(s)).status_code == 200
    assert web.get("/api/session").json() == {"signed_in": False}
    assert web.get("/app/home.js").status_code == 401


def test_idle_session_expires(web, fake, api, monkeypatch):
    fake.add_user("res@example.org", "resident")
    sign_in(web, "res@example.org")
    real = api.time.time
    monkeypatch.setattr(api.time, "time", lambda: real() + 13 * 3600)
    assert web.get("/api/session").json() == {"signed_in": False}


def test_access_token_refreshed(web, fake, api, monkeypatch):
    fake.add_user("res@example.org", "resident")
    sign_in(web, "res@example.org")
    first = set(fake.tokens)
    real = api.time.time
    monkeypatch.setattr(api.time, "time", lambda: real() + 3550)   # within 90 s of the 1 h expiry
    assert web.get("/api/session").json()["signed_in"]
    assert set(fake.tokens) - first, "expected a refreshed access token"


def test_health(web):
    r = web.get("/api/health")
    assert r.status_code == 200 and r.json()["configured"]


def route_table(app):
    rows = set()
    for r in app.routes:
        for m in sorted(getattr(r, "methods", None) or []):
            if m not in {"HEAD", "OPTIONS"}:
                rows.add(f"{m} {r.path}")
    return sorted(rows)


def test_route_table_unchanged(api):
    """The backend refactor must not add, drop or rename any endpoint. Regenerate deliberately with
    UPDATE_ROUTE_SNAPSHOT=1 when a route change is intended, and review the diff."""
    current = route_table(api.app)
    if os.environ.get("UPDATE_ROUTE_SNAPSHOT") == "1" or not SNAPSHOT.exists():
        SNAPSHOT.write_text("\n".join(current) + "\n")
        pytest.skip("route snapshot written")
    assert current == [line for line in SNAPSHOT.read_text().splitlines() if line]
