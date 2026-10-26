"""Local preview of the whole portal with no Supabase project: the real backend, an in-memory fake database.

    python tools/dev-server.py            # then open http://127.0.0.1:3003

Sign in with one of the preview accounts below. Data panels are empty (the fake database has no rows) and
anything you save is forgotten when the server stops. Use it to check pages, navigation and permissions;
use a real (free) Supabase project to check data.
"""
import importlib.util
import os
import sys
from pathlib import Path

import httpx
import uvicorn

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "tools"))
sys.path.insert(0, str(REPO / "server"))
from fake_supabase import FakeSupabase  # noqa: E402

PREVIEW_PASSWORD = "portal-preview-1"
PREVIEW_ACCOUNTS = {"resident@example.org": "resident", "board@example.org": "board", "admin@example.org": "admin",
                    "pending@example.org": "pending"}

os.environ.setdefault("SUPABASE_URL", "https://preview.invalid")
os.environ.setdefault("SUPABASE_ANON_KEY", "preview-anon-key")
os.environ.setdefault("HBA_DATA_DIR", str(REPO / "server" / "community-private-data"))

spec = importlib.util.spec_from_file_location("community_api", REPO / "server" / "community-api.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

fake = FakeSupabase()
for email, role in PREVIEW_ACCOUNTS.items():
    fake.add_user(email, role, password=PREVIEW_PASSWORD)
api.client = httpx.Client(transport=httpx.MockTransport(fake.handle))
api.notify_admin = lambda *a, **k: None

if __name__ == "__main__":
    print("Preview accounts (password for all: see PREVIEW_PASSWORD in tools/dev-server.py):",
          ", ".join(PREVIEW_ACCOUNTS))
    uvicorn.run(api.app, host="127.0.0.1", port=int(os.environ.get("PORT", "3003")))
