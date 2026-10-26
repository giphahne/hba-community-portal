"""Shared fixtures for the backend tests: the FastAPI app wired to an in-memory fake of Supabase Auth and REST.

No network, no real database. Each test gets a fresh app module, data folder and fake Supabase state.
"""
import importlib.util
import sys
from pathlib import Path
import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "tools"))
from fake_supabase import FakeSupabase  # noqa: E402
SERVER = REPO / "server"
FAKE_URL = "https://fake-project.supabase.co"


def _vapid_pem():
    from py_vapid import Vapid
    v = Vapid()
    v.generate_keys()
    return v.private_pem().decode()


SECRETS = {"HBA_SESSION_KEY": Fernet.generate_key().decode(), "HBA_VAPID_PRIVATE_KEY": _vapid_pem()}


def load_app(tmp_path, secrets=True):
    """Import server/community-api.py as a fresh module bound to a temp data dir and the fake Supabase.
    secrets=False leaves the key variables unset (the local-development path that writes key files)."""
    import os
    os.environ.update({"SUPABASE_URL": FAKE_URL, "SUPABASE_ANON_KEY": "fake-anon-key",
                       "HBA_DATA_DIR": str(tmp_path / "data"), "HBA_APP_ROOT": str(REPO / "private-app")})
    for k, v in SECRETS.items():
        if secrets:
            os.environ[k] = v
        else:
            os.environ.pop(k, None)
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
