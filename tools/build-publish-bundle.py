"""Assemble a lean copy of the member-app backend for publishing to pplx.app.

The full project folder is about 1.5 GB (QA screenshots, source scans, git history).
The published backend only needs the FastAPI service, the gated private-app folder it
serves at /app/, and an empty private-data folder for session storage. Assessor photos
(5152 px originals, ~186 MB) are copied at 1600 px for the bundle; the originals stay here.
The Supabase URL and anon (publishable) key are written to hba-storage.json inside the bundle
so the hosted service talks to Supabase directly: the hosting credential proxy rewrites the
Authorization header, which would discard each member's own token and break row-level security.
The anon key is designed to be public; policies in PostgreSQL remain the gatekeeper.
"""
from dotenv import dotenv_values
import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).parent
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT.parent / "hba-publish").resolve()
APP_URL = sys.argv[2] if len(sys.argv) > 2 else ""  # public address used in notice and volunteer email drafts
MODULES = ["community-api.py", "document_intake.py", "local_weather.py", "weather_alerts.py",
           "voting.py", "bank_reconciliation.py", "research_ai.py", "engagement.py"]
REQUIREMENTS = """pywebpush>=2.0
fastapi>=0.115
uvicorn>=0.30
httpx>=0.27
pymupdf>=1.24
pillow>=10
cryptography>=42
python-dotenv>=1.0
pydantic>=2
python-multipart>=0.0.9
openai>=1.40
"""

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir(parents=True)
for name in MODULES:
    shutil.copy2(ROOT / name, OUT / name)
(OUT / "requirements.txt").write_text(REQUIREMENTS)
(OUT / "community-private-data").mkdir(mode=0o700)  # session key and sessions are created at first start; only the push signing key is copied
import shutil as _sh
if (ROOT / "community-private-data" / "vapid.pem").exists():
    _sh.copy2(ROOT / "community-private-data" / "vapid.pem", OUT / "community-private-data" / "vapid.pem")
if APP_URL:
    (OUT / "app-url.txt").write_text(APP_URL.strip() + "\n")
(OUT / ".gitignore").write_text("community-private-data/\n.env*\nhba-storage.json\n__pycache__/\n")
env = dotenv_values(ROOT / ".env.community")
(OUT / "hba-storage.json").write_text(json.dumps({"url": env["SUPABASE_URL"], "anon_key": env["SUPABASE_ANON_KEY"]}))
(OUT / "hba-storage.json").chmod(0o600)

def ignore(directory, names):
    skip = {"__pycache__", ".DS_Store", ".git"}
    return [n for n in names if n in skip or n.endswith((".pyc", "-tiny.psd"))]

shutil.copytree(ROOT / "private-app", OUT / "private-app", ignore=ignore)

photos = sorted((OUT / "private-app" / "assessor-photos").glob("*.jpg"))
before = sum(p.stat().st_size for p in photos)
for p in photos:
    with Image.open(p) as im:
        im = ImageOps.exif_transpose(im)
        if max(im.size) > 1600:
            im.thumbnail((1600, 1600), Image.LANCZOS)
        im.convert("RGB").save(p, "JPEG", quality=82, optimize=True, progressive=True)
after = sum(p.stat().st_size for p in photos)

total = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
print(f"bundle: {OUT}")
print(f"assessor photos: {before/1e6:.0f} MB -> {after/1e6:.0f} MB ({len(photos)} files)")
print(f"bundle total: {total/1e6:.0f} MB")
