"""Settings read once at start-up: Supabase address, secrets, content folders, the house list."""

import json
import os
from collections import defaultdict, deque
from pathlib import Path
from threading import RLock

from cryptography.fernet import Fernet
from dotenv import load_dotenv

ENGAGE = {}

ROOT = Path(__file__).resolve().parent.parent  # the server/ folder
load_dotenv(ROOT / ".env.community")
URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_ANON_KEY"]
# Only used when a secret is not supplied by the environment (local development). Hosted copies set every secret
# as an environment variable, because free container hosts wipe local files on each restart.
DATA = Path(os.environ.get("HBA_DATA_DIR") or ROOT / "community-private-data")

def dev_secret(env, filename, make):
    value = os.environ.get(env, "").strip()
    if value:
        return value.encode()
    if os.environ.get("HBA_REQUIRE_SECRETS") == "1":   # set in the Dockerfile: never invent keys in production
        raise SystemExit(f"{env} is not set. Generate it with tools/generate-secrets.py and add it to the host's "
                         "environment settings.")
    DATA.mkdir(mode=0o700, exist_ok=True)
    path = DATA / filename
    if not path.exists():
        print(f"warning: {env} is not set; generated {path} for local development only", flush=True)
        path.write_bytes(make())
        path.chmod(0o600)
    return path.read_bytes().strip()

# HBA_SESSION_KEY (a Fernet key) encrypts session cookies and also keys the payer fingerprints stored in the
# database, so keep it stable: changing it signs everyone out and stops old payer keys from matching.
SESSION_KEY = dev_secret("HBA_SESSION_KEY", "session.key", Fernet.generate_key)
cipher = Fernet(SESSION_KEY)
lock = RLock()
rates = defaultdict(deque)
def content_root(env, name):
    """Folder served to browsers: an explicit setting, server/<name> (deploy copy), else the repository's own folder."""
    if os.environ.get(env):
        return Path(os.environ[env])
    return ROOT/name if (ROOT/name).is_dir() else ROOT.parent/name
APP_ROOT=content_root("HBA_APP_ROOT","private-app")
SITE_ROOT=content_root("HBA_SITE_ROOT","site")
homes = json.loads((APP_ROOT/"dues-registry-data.json").read_text(encoding="utf-8"))
VALID = {p["uid"] for p in homes["properties"]}
# One origin: the same service serves the sign-in page (/), the member app (/app/) and the API (/api/), so no CORS.
def app_url():
    """Public address of the portal, used for links in drafted e-mails. Set HBA_PUBLIC_URL in production."""
    return os.environ.get("HBA_PUBLIC_URL", "").strip().rstrip("/") or "http://127.0.0.1:3003"
