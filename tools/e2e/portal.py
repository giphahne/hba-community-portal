"""Shared settings for the end-to-end walkthrough: where the portal runs, the test accounts, and a small API client.

Everything here talks to a *local* Supabase started with the Supabase CLI (`npx supabase start`). Nothing in this
folder may be pointed at the real association database: the walkthrough creates and edits records.
"""
import os
import re
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx

REPO = Path(__file__).resolve().parents[2]
SERVER = REPO / "server"
OUT = Path(os.environ.get("HBA_E2E_OUT") or REPO / "tools" / "e2e" / "out")

# The Supabase CLI's standard local address and its published demo anon key. Both only work against a local stack.
LOCAL_SUPABASE_URL = "http://127.0.0.1:54321"
LOCAL_ANON_KEY = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5"
                  "ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0")
ROLES = ("admin", "board", "resident", "pending")


def accounts():
    """The four local test accounts. The password comes from HBA_E2E_PASSWORD or from the accounts file the local
    Supabase folder keeps (HBA_E2E_ACCOUNTS, default ../hba-local-supabase/test-accounts.txt); it is never stored here."""
    pw = os.environ.get("HBA_E2E_PASSWORD", "")
    if not pw:
        f = Path(os.environ.get("HBA_E2E_ACCOUNTS") or REPO.parent / "hba-local-supabase" / "test-accounts.txt")
        if f.exists():
            m = re.search(r"password[^:\n]*:\s*(\S+)", f.read_text(encoding="utf-8"), re.I)
            pw = m.group(1) if m else ""
    if not pw:
        raise SystemExit("Set HBA_E2E_PASSWORD (or HBA_E2E_ACCOUNTS) to the local test accounts' password.")
    return {r: (f"{r}@hba.test", pw) for r in ROLES}


def _free(port):
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def start_portal(port):
    """Run this checkout's backend against the local Supabase on 127.0.0.1:<port>. Returns the process."""
    if not _free(port):
        raise SystemExit(f"Port {port} is in use. Pass --port, or --base-url to test a portal that is already running.")
    url = os.environ.get("HBA_E2E_SUPABASE_URL", LOCAL_SUPABASE_URL)
    if not re.match(r"https?://(127\.0\.0\.1|localhost)[:/]", url):
        raise SystemExit("The walkthrough writes test records, so it only runs against a local Supabase.")
    data = OUT / "portal-data"
    data.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "SUPABASE_URL": url, "SUPABASE_ANON_KEY": os.environ.get("HBA_E2E_ANON_KEY", LOCAL_ANON_KEY),
           "HBA_DATA_DIR": str(data), "HBA_PUBLIC_URL": f"http://127.0.0.1:{port}",
           "HBA_PUSH_SUBJECT": "mailto:admin@hba.test", "PYTHONUTF8": "1", "HBA_AUTH_ATTEMPTS": "500"}
    for k in ("HBA_SESSION_KEY", "HBA_VAPID_PRIVATE_KEY", "OPENAI_API_KEY"):   # local keys only, no AI calls
        env.pop(k, None)
    log = open(OUT / "portal.log", "w", encoding="utf-8")
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "hba.main:app", "--host", "127.0.0.1", "--port", str(port)],
                            cwd=SERVER, env=env, stdout=log, stderr=subprocess.STDOUT)
    for _ in range(120):
        if proc.poll() is not None:
            raise SystemExit(f"The portal stopped during start-up; see {OUT / 'portal.log'}")
        try:
            if httpx.get(f"http://127.0.0.1:{port}/api/health", timeout=1).json().get("configured"):
                return proc
        except Exception:
            pass
        time.sleep(0.5)
    proc.kill()
    raise SystemExit("The portal did not answer /api/health within a minute.")


class Api:
    """Signed-in API client for one test account (cookie session + the X-HBA-Proof header the app sends)."""

    def __init__(self, base, email, password):
        self.base = base.rstrip("/")
        self.c = httpx.Client(base_url=self.base, timeout=60)
        r = self.c.post("/api/auth/login", json={"email": email, "password": password})
        r.raise_for_status()
        self.proof = r.json().get("proof", "")
        self.member = r.json().get("member", {})

    def call(self, method, path, body=None, ok=(200, 201), **kw):
        r = self.c.request(method, path, json=body, headers={"X-HBA-Proof": self.proof}, **kw)
        if ok and r.status_code not in ok:
            raise RuntimeError(f"{method} {path} -> {r.status_code}: {r.text[:300]}")
        try:
            return r.json()
        except Exception:
            return r.text

    def get(self, path, **kw):
        return self.call("GET", path, **kw)

    def post(self, path, body=None, **kw):
        return self.call("POST", path, body, **kw)

    def put(self, path, body=None, **kw):
        return self.call("PUT", path, body, **kw)
