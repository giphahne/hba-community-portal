"""Shared fixtures for the backend tests: the FastAPI app wired to an in-memory fake of Supabase Auth and REST.

No network, no real database. Each test gets a fresh app module, data folder and fake Supabase state.
"""
import importlib.util
import json
import sys
from pathlib import Path
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi.testclient import TestClient

REPO = Path(__file__).resolve().parents[2]
SERVER = REPO / "server"
FAKE_URL = "https://fake-project.supabase.co"


class FakeSupabase:
    """Just enough of Supabase Auth + PostgREST for sign-in, session checks and simple writes."""

    def __init__(self):
        self.users = {}      # email -> {"id","email","password","role","email_confirmed_at"}
        self.tokens = {}     # access token -> email
        self.refresh = {}    # refresh token -> email
        self.writes = []     # (method, path, json) of REST writes
        self.rows = {}       # table -> list of rows returned for GET

    def add_user(self, email, role, password="correct-horse-battery", confirmed=True):
        uid = f"00000000-0000-4000-8000-{len(self.users) + 1:012d}"
        self.users[email] = {"id": uid, "email": email, "password": password, "role": role,
                             "email_confirmed_at": "2026-01-01T00:00:00Z" if confirmed else None}
        return uid

    def _issue(self, email):
        n = len(self.tokens) + 1
        access, refresh = f"access-{n}-{email}", f"refresh-{n}-{email}"
        self.tokens[access] = email
        self.refresh[refresh] = email
        return {"access_token": access, "refresh_token": refresh, "expires_in": 3600, "token_type": "bearer"}

    def _caller(self, request):
        auth = request.headers.get("authorization", "")
        return self.users.get(self.tokens.get(auth.removeprefix("Bearer "), ""))

    def handle(self, request: httpx.Request) -> httpx.Response:
        path, query = request.url.path, parse_qs(request.url.query.decode())
        body = json.loads(request.content) if request.content else None
        if path == "/auth/v1/token" and query.get("grant_type") == ["password"]:
            u = self.users.get(body["email"])
            if not u or u["password"] != body["password"]:
                return httpx.Response(400, json={"error_description": "Invalid login credentials"})
            return httpx.Response(200, json=self._issue(u["email"]))
        if path == "/auth/v1/token" and query.get("grant_type") == ["refresh_token"]:
            email = self.refresh.pop(body["refresh_token"], None)
            return httpx.Response(200, json=self._issue(email)) if email else httpx.Response(400, json={"msg": "Invalid Refresh Token"})
        if path == "/auth/v1/user":
            u = self._caller(request)
            return httpx.Response(200, json={k: u[k] for k in ("id", "email", "email_confirmed_at")}) if u else httpx.Response(401, json={"msg": "invalid JWT"})
        if path == "/auth/v1/logout":
            self.tokens.pop(request.headers.get("authorization", "").removeprefix("Bearer "), None)
            return httpx.Response(204)
        if path == "/auth/v1/signup":
            return httpx.Response(200, json={"id": "new"})
        if path.startswith("/rest/v1/"):
            table = path.removeprefix("/rest/v1/")
            if request.method != "GET":
                self.writes.append((request.method, table, body))
                return httpx.Response(201 if request.method == "POST" else 204)
            if table == "hba_members":
                uid = query.get("id", [""])[0].removeprefix("eq.")
                return httpx.Response(200, json=[{"id": u["id"], "email": u["email"], "role": u["role"],
                                                   "household_uid": None, "display_name": u["email"].split("@")[0]}
                                                  for u in self.users.values() if u["id"] == uid])
            return httpx.Response(200, json=self.rows.get(table, []))
        return httpx.Response(404, json={"msg": "not faked: " + path})


def load_app(tmp_path):
    """Import server/community-api.py as a fresh module bound to a temp data dir and the fake Supabase."""
    import os
    os.environ.update({"SUPABASE_URL": FAKE_URL, "SUPABASE_ANON_KEY": "fake-anon-key", "HBA_VISITOR_MODE": "cookie",
                       "HBA_DATA_DIR": str(tmp_path / "data"), "HBA_APP_ROOT": str(REPO / "private-app")})
    if str(SERVER) not in sys.path:
        sys.path.insert(0, str(SERVER))
    spec = importlib.util.spec_from_file_location("community_api_under_test", SERVER / "community-api.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def fake():
    return FakeSupabase()


@pytest.fixture
def api(tmp_path, fake):
    mod = load_app(tmp_path)
    mod.client = httpx.Client(transport=httpx.MockTransport(fake.handle))
    mod.notify_admin = lambda *a, **k: None   # push alerts run in a thread; not under test here
    mod.test_fake = fake
    return mod


@pytest.fixture
def web(api):
    return TestClient(api.app, base_url="http://testserver")
