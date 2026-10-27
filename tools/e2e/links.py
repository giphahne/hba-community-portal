"""Link check: every href/src/url() in site/ and private-app/ (HTML, JS templates and data JSON) must resolve.

Internal links are fetched from the running portal while signed in (the member app needs a session). External links
get one polite HEAD (GET if HEAD is refused) per URL, a few at a time, and are reported separately. Record scans
(deeds/, ch91/, …) ship in the separate hba-portal-record-scans.zip and are listed as expected-missing.
"""
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse

import httpx

from portal import REPO
from walk import SCAN_DIRS

ROOTS = {"site": "/", "private-app": "/app/"}
SKIP_DIRS = {"node_modules", "__pycache__"}
ATTR = re.compile(r"""(?:href|src|poster|data-src)\s*=\s*["']([^"'<>\s]+)["']""", re.I)
CSS_URL = re.compile(r"""url\(\s*["']?([^"')\s]+)["']?\s*\)""", re.I)
JS_PATH = re.compile(r"""(?:fetch|open|src=|href=|location\.href\s*=)\s*\(?\s*["'`]([^"'`\s]+)["'`]""")
EXT = r"\.(?:jpe?g|png|webp|gif|svg|pdf|json|js|css|html|csv|md|webmanifest|ico|mp4|mp3)"
JSON_PATH = re.compile(r"^(?:https?://\S+|[\w./-]+" + EXT + r"(?:[?#]\S*)?)$", re.I)
# Deed and plan scan names (book_page_n.jpg) that the scripts prefix with a scans folder at run time.
SCAN_NAME = re.compile(r"(^|/)(scans/)?(plan)?\d+_\d+(_unindexed)?_\d+\.jpe?g$", re.I)
TEXT_EXT = {".html", ".js", ".css", ".json", ".webmanifest"}


def walk_json(value, out):
    if isinstance(value, str):
        if JSON_PATH.match(value.strip()):
            out.append(value.strip())
    elif isinstance(value, list):
        for v in value:
            walk_json(v, out)
    elif isinstance(value, dict):
        for v in value.values():
            walk_json(v, out)


def read_text(path):
    """Read even past Windows' 260-character path limit (deep checkouts)."""
    import os
    name = "\\\\?\\" + str(path.resolve()) if os.name == "nt" else path
    with open(name, encoding="utf-8", errors="replace") as f:
        return f.read()


def collect():
    """{url_or_path: set(source files)}, plus the count of dynamic (template) references that cannot be checked."""
    refs, dynamic = {}, 0
    for folder, prefix in ROOTS.items():
        root = REPO / folder
        for f in root.rglob("*"):
            if f.suffix.lower() not in TEXT_EXT or SKIP_DIRS & set(f.parts) or any(f"/{d}" in f.as_posix() for d in SCAN_DIRS):
                continue
            text = read_text(f)
            found = []
            if f.suffix == ".json":
                try:
                    walk_json(json.loads(text), found)
                except ValueError:
                    pass
            else:
                found += ATTR.findall(text) + CSS_URL.findall(text) + JS_PATH.findall(text)
            rel_dir = prefix + f.parent.relative_to(root).as_posix().strip(".") + "/"
            rel_dir = re.sub(r"/+", "/", rel_dir)
            if f.suffix != ".json":
                found = [u for u in found if JSON_PATH.match(u) or u.startswith(("/", "./", "../")) and "." in u.rsplit("/", 1)[-1]]
            for u in found:
                if "${" in u or "{{" in u or u.startswith(("#", "data:", "blob:", "javascript:", "mailto:", "tel:", "sms:")) or u in ("/", ""):
                    dynamic += "${" in u
                    continue
                if re.fullmatch(r"https://fonts\.(googleapis|gstatic)\.com/?", u):
                    continue   # <link rel="preconnect"> origins, not pages
                if u.startswith("/api/") or "/api/" in u[:6]:
                    continue   # API calls are exercised by the walkthrough
                full = u if u.startswith(("http://", "https://", "//")) else urljoin(rel_dir, u)
                if full.startswith("//"):
                    full = "https:" + full
                # JSON data paths are relative to the app folder, as the scripts that read them use them.
                if f.suffix == ".json" and not u.startswith(("http", "/")):
                    full = urljoin(prefix, u)
                refs.setdefault(full.split("#")[0], set()).add(f.relative_to(REPO).as_posix())
    return refs, dynamic


def check(base, cookie_client, external=True):
    external_on = external
    refs, dynamic = collect()
    internal = {u: s for u, s in refs.items() if not u.startswith("http")}
    external = {u: s for u, s in refs.items() if u.startswith("http")}
    rows = []
    for u, src in sorted(internal.items()):
        path = urlparse(u).path
        if any(path.startswith(f"/app/{d}") or f"/{d}" in path for d in SCAN_DIRS) or SCAN_NAME.search(path):
            rows.append(("internal", u, "expected-missing", "record scan (separate zip)", src))
            continue
        if path.startswith(("/home/", "/Users/", "/tmp/")):
            rows.append(("internal", u, "warn", "a workstation file path stored in data; not shown by the app", src))
            continue
        try:
            r = cookie_client.get(u, timeout=20)
            rows.append(("internal", u, "pass" if r.status_code == 200 else "fail", f"HTTP {r.status_code}", src))
        except Exception as e:
            rows.append(("internal", u, "fail", str(e)[:120], src))

    def ext(item):
        u, src = item
        headers = {"User-Agent": "HBA-portal-link-check/1.0 (+local end-to-end test; one request per link)"}
        try:
            with httpx.Client(follow_redirects=True, timeout=15, headers=headers) as c:
                r = c.head(u)
                if r.status_code in (403, 405, 400, 501) or r.status_code >= 500:
                    time.sleep(0.5)
                    r = c.get(u)
                code = r.status_code
            status = "pass" if code < 400 else ("warn" if code in (401, 403, 429) else "fail")
            return ("external", u, status, f"HTTP {code}", src)
        except Exception as e:
            return ("external", u, "fail", type(e).__name__ + ": " + str(e)[:100], src)

    if external_on:
        with ThreadPoolExecutor(max_workers=4) as pool:
            rows += list(pool.map(ext, sorted(external.items())))
    return rows, dynamic
