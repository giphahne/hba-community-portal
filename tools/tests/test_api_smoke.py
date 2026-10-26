"""Smoke tests for sign-in, sessions, permission gating and the protected app folder.

These pin the behaviour the hosting refactor must keep. Supabase is faked (see conftest.py).
Run: pytest tools/tests
"""
import os
import time
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
    assert web.get("/app/", follow_redirects=False).status_code == 303
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


def test_idle_session_expires(web, fake, monkeypatch):
    fake.add_user("res@example.org", "resident")
    sign_in(web, "res@example.org")
    real = time.time
    monkeypatch.setattr(time, "time", lambda: real() + 13 * 3600)
    assert web.get("/api/session").json() == {"signed_in": False}


def test_access_token_refreshed(web, fake, monkeypatch):
    fake.add_user("res@example.org", "resident")
    sign_in(web, "res@example.org")
    first = set(fake.tokens)
    real = time.time
    monkeypatch.setattr(time, "time", lambda: real() + 3550)   # within 90 s of the 1 h expiry
    assert web.get("/api/session").json()["signed_in"]
    assert set(fake.tokens) - first, "expected a refreshed access token"


def test_health(web):
    r = web.get("/api/health")
    assert r.status_code == 200 and r.json()["configured"]


def flat_routes(routes):
    """Routes in matching order; included routers are expanded in place."""
    for r in routes:
        if hasattr(r, "original_router"):
            yield from flat_routes(r.original_router.routes)
        else:
            yield r


def route_table(app):
    rows = set()
    for r in flat_routes(app.routes):
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


# ---- Stateless hosting: everything a restart would lose must live in the cookie or the environment.

def fresh_app(tmp_path, fake, secrets=True):
    import httpx
    from conftest import load_app
    mod = load_app(tmp_path, secrets=secrets)
    mod.supabase.client = httpx.Client(transport=httpx.MockTransport(fake.handle))
    return mod


def test_session_survives_restart(web, fake, tmp_path):
    from fastapi.testclient import TestClient
    fake.add_user("res@example.org", "resident")
    sign_in(web, "res@example.org")
    restarted = TestClient(fresh_app(tmp_path / "other", fake).app, cookies=dict(web.cookies))
    assert restarted.get("/api/session").json()["signed_in"]


def test_no_files_written_when_secrets_set(web, fake, tmp_path):
    fake.add_user("res@example.org", "resident")
    sign_in(web, "res@example.org")
    web.get("/app/home.js")
    data = tmp_path / "data"
    assert not data.exists() or not any(data.iterdir())


def test_dev_mode_generates_and_reuses_keys(fake, tmp_path):
    first = fresh_app(tmp_path, fake, secrets=False)
    second = fresh_app(tmp_path, fake, secrets=False)
    assert (tmp_path / "data" / "session.key").exists() and (tmp_path / "data" / "vapid.pem").exists()
    assert first.config.SESSION_KEY == second.config.SESSION_KEY
    assert first.push.VAPID_PUBLIC == second.push.VAPID_PUBLIC


def test_session_cookie_flags_and_size(tmp_path):
    from fastapi.testclient import TestClient
    from fake_supabase import FakeSupabase
    fake = FakeSupabase(token_padding=1400)   # a Supabase JWT with user metadata is roughly 1–1.5 KB
    web = TestClient(fresh_app(tmp_path, fake).app)
    fake.add_user("res@example.org", "resident")
    r = web.post("/api/auth/login", json={"email": "res@example.org", "password": PASSWORD})
    header = r.headers["set-cookie"]
    assert "hba_session=" in header and "httponly" in header.lower() and "samesite=lax" in header.lower()
    assert len(header) < 4000, len(header)


def test_tampered_cookie_signs_out(web, fake):
    fake.add_user("res@example.org", "resident")
    sign_in(web, "res@example.org")
    web.cookies.clear()
    web.cookies.set("hba_session", "gAAAAAB-not-a-real-token")
    assert web.get("/api/session").json() == {"signed_in": False}
    assert web.get("/app/home.js").status_code == 401


def test_generated_secrets_are_accepted(fake, tmp_path, monkeypatch):
    import subprocess, sys
    from conftest import REPO, SECRETS
    out = subprocess.run([sys.executable, str(REPO / "tools" / "generate-secrets.py")], capture_output=True,
                         text=True, check=True).stdout
    values = dict(line.split("=", 1) for line in out.splitlines())
    assert set(values) == set(SECRETS)
    monkeypatch.setattr("conftest.SECRETS", values)
    mod = fresh_app(tmp_path, fake)
    assert mod.push.VAPID_PUBLIC and not (tmp_path / "data").exists()


# ---- One origin: sign-in page, member app and API from the same service.

def test_sign_in_page_served(web):
    r = web.get("/")
    assert r.status_code == 200 and "login.js" in r.text and "__PORT_" not in r.text
    assert web.get("/login.js").headers["content-type"].startswith("text/javascript")
    assert web.get("/manifest.webmanifest").headers["content-type"].startswith("application/manifest+json")
    assert web.get("/sw.js").headers.get("service-worker-allowed") == "/"
    assert web.get("/icons/icon-192.png").status_code == 200


def test_site_route_does_not_shadow_api_or_leak_files(web):
    assert web.get("/api/no-such-endpoint").status_code in (401, 404)
    assert web.get("/../server/community-api.py").status_code == 404
    assert web.get("/README.md").status_code == 404


def test_signed_out_app_page_redirects_to_sign_in(web):
    r = web.get("/app/", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/"
    assert web.get("/app/sand-school/learn.html", follow_redirects=False).status_code == 303


def test_framing_limited_to_same_origin(web, fake):
    fake.add_user("res@example.org", "resident")
    sign_in(web, "res@example.org")
    r = web.get("/app/")
    assert r.headers["x-frame-options"] == "SAMEORIGIN"
    assert "frame-ancestors 'self'" in r.headers["content-security-policy"]
    assert "__PORT_" not in r.text and "<base" not in r.text


# ---- Transfer size: compressed text, revalidated files.

def test_text_is_compressed_and_photos_are_not(web, fake):
    fake.add_user("res@example.org", "resident")
    sign_in(web, "res@example.org")
    js = web.get("/app/road-wording.js", headers={"Accept-Encoding": "gzip"})
    assert js.status_code == 200 and js.headers.get("content-encoding") == "gzip"
    photo = web.get("/app/photos/aerial-beach.jpg", headers={"Accept-Encoding": "gzip"})
    assert photo.status_code == 200 and "content-encoding" not in photo.headers


def test_files_revalidate_with_304(web, fake):
    fake.add_user("res@example.org", "resident")
    sign_in(web, "res@example.org")
    first = web.get("/app/home.js")
    assert first.headers["cache-control"] == "private, no-cache" and first.headers.get("etag")
    again = web.get("/app/home.js", headers={"If-None-Match": first.headers["etag"]})
    assert again.status_code == 304 and not again.content
    site = web.get("/login.js")
    assert web.get("/login.js", headers={"If-None-Match": site.headers["etag"]}).status_code == 304


def test_revalidation_still_requires_sign_in(web, fake):
    fake.add_user("res@example.org", "resident")
    s = sign_in(web, "res@example.org")
    etag = web.get("/app/home.js").headers["etag"]
    web.post("/api/logout", json={}, headers=proof(s))
    assert web.get("/app/home.js", headers={"If-None-Match": etag}).status_code == 401


def test_api_answers_never_cached(web):
    assert web.get("/api/session").headers["cache-control"] == "private, no-store"


def test_admin_push_alert_is_signed_with_vapid_key(api, fake, monkeypatch):
    """Alerts send from a background thread whose errors are only logged, so check the send itself."""
    sent = []
    fake.rpc["hba_push_targets"] = [{"endpoint": "https://push.example/abc", "p256dh": "k", "auth": "a"}]
    monkeypatch.setattr(api.push, "webpush", lambda info, **kw: sent.append((info, kw)))

    class Inline:
        def __init__(self, target, daemon=None):
            self.target = target

        def start(self):
            self.target()
    monkeypatch.setattr(api.push.threading, "Thread", Inline)
    api.push.notify_admin("token", "test", "Title", "Body")
    assert len(sent) == 1
    info, kw = sent[0]
    assert info["endpoint"] == "https://push.example/abc"
    assert kw["vapid_private_key"] is api.push.VAPID and kw["vapid_claims"]["sub"].startswith("mailto:")


def test_entry_point_serves_the_package_app(api):
    """`uvicorn community-api:app` must keep working for hosts and the README's run command."""
    import importlib.util
    from conftest import SERVER
    spec = importlib.util.spec_from_file_location("community_api_entry", SERVER / "community-api.py")
    entry = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(entry)
    assert entry.app is api.app


def test_production_refuses_to_invent_secrets(fake, tmp_path, monkeypatch):
    monkeypatch.setenv("HBA_REQUIRE_SECRETS", "1")
    with pytest.raises(SystemExit, match="HBA_SESSION_KEY is not set"):
        fresh_app(tmp_path, fake, secrets=False)
    assert not (tmp_path / "data").exists()
