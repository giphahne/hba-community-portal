"""End-to-end walkthrough of the HBA portal against a local Supabase. One command:

    python tools/e2e/run.py

starts this checkout's portal on 127.0.0.1:3013, seeds test data through the API, checks every link, walks every tool
for each role (and at phone width), and writes tools/e2e/REPORT.md. See CONTRIBUTING.md ("End-to-end walkthrough").
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import links  # noqa: E402
import seed as seeding  # noqa: E402
from portal import OUT, REPO, Api, accounts, start_portal  # noqa: E402
from walk import Result, Walker, bad  # noqa: E402

HERE = Path(__file__).resolve().parent
BOARD_ONLY = {"dues", "finance", "bank", "work", "budget", "appmap", "members", "reports"}
PHONE_FLOWS = ["issues", "payments", "message", "calendar", "summer", "volunteers", "votes"]


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def walk_role(browser, base, role, creds, run_id, results, created, explore=True, only=None, mobile=False):
    w = Walker(browser, base, role, *creds, run_id=run_id, mobile=mobile, results=results, created=created)
    try:
        if not w.sign_in():
            return w
        visible = w.tool_ids()
        listed = w.all_tool_ids()
        for tid in listed:
            if tid not in visible:
                w.add("open", tid, tid, "fail", "listed in capabilities.js for this role but has no visible dashboard button")
        if role in ("resident",):
            leaked = sorted(set(visible) & BOARD_ONLY)
            w.add("flow", "dashboard", "board-only tools hidden from residents", "fail" if leaked else "pass", ", ".join(leaked))
        ids = [t for t in visible if not only or t in only]
        if mobile:
            ids = [t for t in ids if t in PHONE_FLOWS] if only is None and explore else ids
        for tid in ids:
            log(role, "@375" if mobile else "", "tool", tid)
            st = w.check_open(tid)
            if st and explore:
                w.explore(tid, lambda t=tid: w.open_tool(t), budget=25 if st["map"] else 40, seconds=60 if st["map"] else 100)
        if not mobile and not only:
            for view, label in w.archive_views():
                log(role, "archive", view)
                w.watch.mark()
                st = w.open_archive(view)
                errors = w.watch.mark()
                text_bad = re.search(r"could not (load|open)|not loaded|failed to load|something went wrong", st["text"], re.I)
                w.add("archive", "archive:" + view, label, "fail" if bad(errors) or text_bad else "pass",
                      text_bad.group(0) if text_bad else f"{len(st['text'])} characters shown", errors)
                if explore:
                    w.explore("archive:" + view, lambda v=view: w.open_archive(v), budget=30, seconds=75)
    except Exception as e:
        w.add("flow", "walker", "walkthrough stopped early", "fail", f"{type(e).__name__}: {str(e)[:300]}")
    finally:
        w.ctx.close()
    return w


def board_as_resident(browser, base, creds, run_id, results):
    w = Walker(browser, base, "board-as-resident", *creds, run_id=run_id, results=results)
    try:
        if not w.sign_in():
            return
        w.page.click("#portal-resident-view")
        time.sleep(1.5)
        w.wait_dashboard()
        visible = w.tool_ids()
        leaked = sorted(set(visible) & BOARD_ONLY)
        bar = w.page.inner_text("#portal-role")
        w.add("flow", "view switch", "Resident view hides board tools in the member app", "fail" if leaked else "pass",
              f"portal bar: {bar}; board tools still shown: {', '.join(leaked)}" if leaked else f"portal bar: {bar}", bad(w.watch.mark()))
        for tid in visible:
            log("board-as-resident tool", tid)
            w.check_open(tid)
        w.page.click("#portal-board-view")
        time.sleep(1.5)
        w.wait_dashboard()
        back = sorted(set(w.tool_ids()) & BOARD_ONLY)
        w.add("flow", "view switch", "Board view brings the board tools back", "pass" if back else "fail", ", ".join(back))
    except Exception as e:
        w.add("flow", "walker", "walkthrough stopped early", "fail", f"{type(e).__name__}: {str(e)[:300]}")
    finally:
        w.ctx.close()


class _SlowFile:
    """A local server that serves one file of the app 2.5 s late, standing in for a slow phone connection.
    (Sleeping inside a Playwright route handler stalls every other request too, so the delay lives here.)"""

    def __init__(self, path):
        self.body = read_bytes(path)

    def __enter__(self):
        import http.server
        import threading
        body = self.body

        class H(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                time.sleep(2.5)
                self.send_response(200)
                self.send_header("Content-Type", "text/javascript; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *a):
                pass

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        return f"http://127.0.0.1:{self.server.server_address[1]}/late.js"

    def __exit__(self, *a):
        self.server.shutdown()


def read_bytes(path):
    import os
    with open("\\\\?\\" + str(path.resolve()) if os.name == "nt" else path, "rb") as f:
        return f.read()


def slow_start(browser, base, creds, run_id, results):
    """When the dashboard script arrives late (a slow phone connection), the dashboard must still show the board
    member's account and tools. It once stayed on the signed-out layout for good: the account was announced before the
    dashboard was listening."""
    name = "dashboard shows the board account when its script loads late"
    ctx = browser.new_context()
    try:
        page = ctx.new_page()
        late = _SlowFile(REPO / "private-app" / "capabilities.js")
        late_url = late.__enter__()
        page.route("**/app/capabilities.js*", lambda route: route.continue_(url=late_url))
        page.goto(base + "/")
        page.wait_for_selector("#login-form:not([hidden])", timeout=20000)
        page.fill("input[name=email]", creds[0])
        page.fill("input[name=password]", creds[1])
        page.click("#login-submit")
        page.wait_for_selector("#hba-private-app", timeout=20000)
        state, end = None, time.time() + 30
        while time.time() < end:
            try:
                app = page.query_selector("#hba-private-app").content_frame()
                state = app and app.evaluate("""() => ({ready: document.readyState, member: !!(window.HBACommunity && HBACommunity.member),
                    board: !!document.querySelector('#hba-dashboard [data-cap-run="finance"]')})""")
            except Exception:
                state = None
            if state and state["board"]:
                break
            time.sleep(1)
        ok = bool(state and state["board"])
        results.append(Result("board", "flow", "slow connection", name, "pass" if ok else "fail",
                              "" if ok else f"after 30 s: {state}"))
    except Exception as e:
        results.append(Result("board", "flow", "slow connection", name, "fail", f"{type(e).__name__}: {str(e)[:200]}"))
    finally:
        ctx.close()
        if "late" in locals():
            late.__exit__()


def pending_checks(browser, base, creds, run_id, results):
    w = Walker(browser, base, "pending", *creds, run_id=run_id, results=results)
    try:
        w.sign_in()
        r = w.page.request.get(base + "/api/community")
        w.add("flow", "access", "pending account cannot read the archive API", "pass" if r.status in (401, 403) else "fail", f"HTTP {r.status}")
        w.page.goto(base + "/app/")
        time.sleep(3)
        has_dash = w.page.evaluate("!!document.querySelector('#hba-dashboard [data-cap-run]')")
        txt = w.page.inner_text("body")[:2000]
        member_tools = has_dash and w.page.evaluate("[...document.querySelectorAll('#hba-dashboard [data-cap-run]')].length") > 6
        w.add("flow", "access", "opening /app/ directly shows no member data", "pass" if not re.search(r"Pothole at Algelo|Grill crew|September board", txt) else "fail",
              "dashboard shell shown without data" if member_tools else "blocked", bad(w.watch.mark()))
    except Exception as e:
        w.add("flow", "walker", "walkthrough stopped early", "fail", f"{type(e).__name__}: {str(e)[:300]}")
    finally:
        w.ctx.close()


def shared_check(browser, base, creds, run_id, results, created):
    """Items admin and board created through forms: does a resident see them in the same tool?"""
    by_tool = defaultdict(list)
    for role, tool, tok in created:
        if role.startswith(("admin", "board")):
            by_tool[tool].append(tok)
    if not by_tool:
        return
    w = Walker(browser, base, "resident", *creds, run_id=run_id, results=results)
    try:
        if not w.sign_in():
            return
        visible = set(w.tool_ids())
        for tool, toks in sorted(by_tool.items()):
            if tool.startswith("archive:"):
                w.open_archive(tool.split(":", 1)[1])
            elif tool in visible:
                w.open_tool(tool)
            else:
                w.add("shared", tool, f"{len(toks)} item(s) made by the board", "info", "tool is board-only")
                continue
            w.settle(800)
            text = w.f.evaluate("() => [...document.querySelectorAll('dialog[open]')].map(d => d.innerText).join('\\n') + document.body.innerText")
            seen = [t for t in toks if t in text]
            w.add("shared", tool, f"{len(seen)} of {len(toks)} board-made item(s) visible to a resident", "info",
                  "visible: " + ", ".join(seen)[:200] if seen else "none visible (expected for board-only records; check drafts)")
    finally:
        w.ctx.close()


# ---- report ---------------------------------------------------------------------------------------------------
ICON = {"pass": "pass", "fail": "**FAIL**", "warn": "warn", "skip": "skip", "info": "info", "expected-missing": "expected-missing"}


def esc(s):
    return str(s).replace("|", "\\|").replace("\n", " ")


def report(results, seed_log, link_rows, dynamic, external_seen, started, base, args):
    lines = ["# End-to-end walkthrough report", "",
             f"Generated {datetime.now():%Y-%m-%d %H:%M} by `python tools/e2e/run.py` against a local Supabase "
             f"({base}). Run time {int((time.time() - started) / 60)} min.", ""]
    findings = HERE / "FINDINGS.md"
    if findings.exists():
        lines += [findings.read_text(encoding="utf-8").strip(), ""]
    order = ["admin", "board", "resident", "board-as-resident", "pending", "resident @375px", "admin @375px"]
    roles = sorted(dict.fromkeys(r.role for r in results), key=lambda r: order.index(r) if r in order else 99)
    lines += ["## Summary by role", "", "| Role | pass | fail | warn | skip | info |", "|---|---|---|---|---|---|"]
    for role in roles:
        c = Counter(r.status for r in results if r.role == role)
        lines.append(f"| {role} | {c['pass']} | {c['fail']} | {c['warn']} | {c['skip']} | {c['info']} |")
    tools = list(dict.fromkeys(r.tool for r in results if r.kind in ("open", "archive")))
    lines += ["", "## Tools opened, per role", "", "Each cell: did the tool open without script errors or unexpected failed requests.", "",
              "| Tool | " + " | ".join(roles) + " |", "|---|" + "---|" * len(roles)]
    for t in tools:
        cells = []
        for role in roles:
            rs = [r for r in results if r.role == role and r.tool == t and r.kind in ("open", "archive")]
            cells.append(ICON[rs[-1].status] if rs else "–")
        lines.append(f"| {esc(t)} | " + " | ".join(cells) + " |")
    lines += ["", "## Forms", "", "| Role | Tool | Form | Result | Detail |", "|---|---|---|---|---|"]
    for r in results:
        if r.kind == "form":
            lines.append(f"| {r.role} | {esc(r.tool)} | {esc(r.name)} | {ICON[r.status]} | {esc(r.detail)[:300]} |")
    lines += ["", "## Flows and access checks", "", "| Role | Check | Result | Detail |", "|---|---|---|---|"]
    for r in results:
        if r.kind in ("flow", "shared"):
            lines.append(f"| {r.role} | {esc(r.tool)}: {esc(r.name)} | {ICON[r.status]} | {esc(r.detail)[:300]} |")
    fails = [r for r in results if r.status == "fail"]
    lines += ["", f"## Failures ({len(fails)})", ""]
    for r in fails:
        errs = "; ".join(f"{a}: {b}" for a, b in bad(r.errors))[:600]
        lines.append(f"- **{r.role} · {esc(r.tool)} · {esc(r.name)}** — {esc(r.detail)[:400]}" + (f" — errors: `{esc(errs)}`" if errs else ""))
    clicks = [r for r in results if r.kind == "click" and r.status == "info"]
    lines += ["", "## Controls clicked inside tools", "", f"{sum(int(r.name.split()[0]) for r in clicks)} clicks across {len(clicks)} tool visits. "
              "Skipped by design: delete/remove, approve/reject, sign out, password changes, sending texts, certifying votes, "
              "hiding tools, switching views (each has its own check above). Confirmation prompts were answered Cancel.", ""]
    lines += ["## Seed data (through the API)", "", "| Step | Result | Detail |", "|---|---|---|"]
    lines += [f"| {esc(a)} | {ICON.get(b, b)} | {esc(c)[:200]} |" for a, b, c in seed_log]
    internal = [r for r in link_rows if r[0] == "internal"]
    ext = [r for r in link_rows if r[0] == "external"]
    c_int, c_ext = Counter(r[2] for r in internal), Counter(r[2] for r in ext)
    lines += ["", "## Link check", "",
              f"Internal: {len(internal)} references — {c_int['pass']} resolve, {c_int['fail']} broken, "
              f"{c_int['warn']} workstation paths in data files, {c_int['expected-missing']} record scans (shipped separately in hba-portal-record-scans.zip). "
              f"{dynamic} built at run time from templates were not checked statically (the walkthrough exercises them).", ""]
    for r in internal:
        if r[2] in ("fail", "warn"):
            lines.append(f"- {'broken' if r[2] == 'fail' else 'data clean-up'}: `{r[1]}` ({r[3]}) — in {', '.join(sorted(r[4])[:3])}")
    lines += ["", f"External: {len(ext)} links — {c_ext['pass']} answer, {c_ext['warn']} refuse automated checks (401/403/429), "
              f"{c_ext['fail']} fail.", ""]
    for r in ext:
        if r[2] != "pass":
            lines.append(f"- {ICON[r[2]]}: {r[1]} ({esc(r[3])}) — in {', '.join(sorted(r[4])[:2])}")
    if external_seen:
        lines += ["", "External requests that failed while the app ran (map tiles, weather, fonts):", ""]
        lines += [f"- {esc(x)}" for x in sorted(external_seen)[:40]]
    lines += ["", f"Options: {' '.join(sys.argv[1:]) or '(none)'}", ""]
    (HERE / "REPORT.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", help="test a portal that is already running instead of starting one")
    ap.add_argument("--port", type=int, default=3013)
    ap.add_argument("--roles", default="admin,board,resident,board-as-resident,pending,phone",
                    help="comma list from admin, board, resident, board-as-resident, pending, phone")
    ap.add_argument("--tools", help="only these dashboard tool ids (comma list)")
    ap.add_argument("--no-links", action="store_true", help="skip the link check")
    ap.add_argument("--no-external", action="store_true", help="link check without contacting external sites")
    ap.add_argument("--no-explore", action="store_true", help="only open each tool; no clicks inside, no forms")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--jobs", type=int, default=4, help="browsers walking at the same time (default 4)")
    args = ap.parse_args()
    started, run_id = time.time(), datetime.now().strftime("%m%d%H%M")
    OUT.mkdir(parents=True, exist_ok=True)
    accts = accounts()
    proc = None
    base = args.base_url.rstrip("/") if args.base_url else f"http://127.0.0.1:{args.port}"
    if not args.base_url:
        log("starting the portal on", base)
        proc = start_portal(args.port)
    results, created, link_rows, dynamic, external_seen = [], [], [], 0, set()
    try:
        log("seeding")
        seed_log = seeding.seed(base, accts)
        if not args.no_links:
            log("link check")
            admin = Api(base, *accts["admin"])
            link_rows, dynamic = links.check(base, admin.c, external=not args.no_external)
        from playwright.sync_api import sync_playwright
        roles = args.roles.split(",")
        only = set(args.tools.split(",")) if args.tools else None
        # Each job gets its own Playwright and browser, so the roles walk in parallel threads.
        def job(fn, *a, **kw):
            with sync_playwright() as pw:
                browser = pw.chromium.launch(headless=not args.headed)
                try:
                    return fn(browser, *a, **kw)
                finally:
                    browser.close()
        ex = not args.no_explore
        jobs = []
        for role in ("admin", "board", "resident"):
            if role in roles:
                jobs.append((f"walking as {role}", walk_role, (base, role, accts[role], run_id, results, created), {"explore": ex, "only": only}))
        if "board-as-resident" in roles:
            jobs.append(("board in Resident view", board_as_resident, (base, accts["board"], run_id, results), {}))
        if "board" in roles:
            jobs.append(("board on a slow connection", slow_start, (base, accts["board"], run_id, results), {}))
        if "pending" in roles:
            jobs.append(("pending account", pending_checks, (base, accts["pending"], run_id, results), {}))
        if "phone" in roles:
            for role in ("resident", "admin"):
                jobs.append((f"phone width as {role}", walk_role, (base, role, accts[role], run_id, results, created),
                             {"explore": role == "resident" and ex, "only": only, "mobile": True}))
        with ThreadPoolExecutor(max_workers=args.jobs) as pool:
            futures = []
            for label, fn, a, kw in jobs:
                log(label)
                futures.append(pool.submit(job, fn, *a, **kw))
            for fut in futures:
                w = fut.result()
                if isinstance(w, Walker):
                    external_seen |= w.watch.external
        if "resident" in roles and ex:
            log("shared items as resident")
            job(shared_check, base, accts["resident"], run_id, results, created)
    finally:
        if proc:
            proc.terminate()
    report(results, seed_log, link_rows, dynamic, external_seen, started, base, args)
    fails = sum(r.status == "fail" for r in results) + sum(r[2] == "fail" for r in link_rows if r[0] == "internal")
    log(f"done: {len(results)} checks, {fails} failures. Report: {HERE / 'REPORT.md'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
