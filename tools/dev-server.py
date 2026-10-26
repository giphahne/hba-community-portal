"""Local preview of the whole portal with no Supabase project: the real backend, an in-memory fake database.

    python tools/dev-server.py            # then open http://127.0.0.1:3003

Sign in with one of the preview accounts below. Data panels are empty (the fake database holds only placeholder settings) and
anything you save is forgotten when the server stops. Use it to check pages, navigation and permissions;
use a real (free) Supabase project to check data.
"""
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

import hba.main  # noqa: E402  (reads the settings above)
import hba.supabase  # noqa: E402

fake = FakeSupabase()
for email, role in PREVIEW_ACCOUNTS.items():
    fake.add_user(email, role, password=PREVIEW_PASSWORD)
# Rows and RPC answers a real project always has (the migrations insert the payment-settings row; the count RPCs
# return sets), so /api/community and /api/votes answer instead of failing on the empty fake.
fake.rows["hba_payment_settings"] = [{"id": 1, "recipient_name": "", "recipient_identifier": "", "enabled": False,
                                      "venmo_name": "", "venmo_handle": "", "venmo_enabled": False,
                                      "updated_by": None, "updated_at": "2026-01-01T00:00:00Z"}]
for name in ("hba_can_schedule", "hba_can_edit_newsletter", "hba_can_edit_finance", "hba_can_edit_minutes"):
    fake.rpc[name] = True
fake.rpc.update({"hba_volunteer_counts": [], "hba_sms_counts": {"opted_in": 0, "topics": {}},
                 "hba_vote_counts": [], "hba_my_dues_status": []})
hba.supabase.client = httpx.Client(transport=httpx.MockTransport(fake.handle))

if __name__ == "__main__":
    print("Preview accounts (password for all: see PREVIEW_PASSWORD in tools/dev-server.py):",
          ", ".join(PREVIEW_ACCOUNTS))
    uvicorn.run(hba.main.app, host="127.0.0.1", port=int(os.environ.get("PORT", "3003")))
