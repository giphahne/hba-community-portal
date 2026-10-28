"""Browser walkthrough of the member app: every dashboard tool and archive section, for each role.

For each tool the walker opens it the way a reader does (clicking its dashboard card), records console errors and
failed requests, clicks every non-destructive control inside it, and fills and submits every form it finds with test
data. Confirmation dialogs are always answered "Cancel", so a destructive action that asks first never runs.
"""
import re
import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from urllib.parse import urlparse

from seed import jpeg, pdf

# Buttons the walker never clicks. Destructive or outward-facing actions, plus approving accounts and hiding tools,
# which would change the very roles and screens the rest of the walkthrough checks.
SKIP = re.compile(r"\b(delete|remove|discard|reject|revoke|suspend|sign ?out|log ?out|reset (a |the )?password|unlink|withdraw|"
                  r"certify|tie-?break|refreeze|send (now|all|text|sms|test)|erase|clear all|approve|deny|hide|unhide|"
                  r"close (the )?(vote|poll|voting)|cancel (the )?(event|meeting|vote)|mark .*(void|voided)|void\b|"
                  r"switch to|resident view|board view|change my password|save new password|"
                  r"turn (on|off) alerts|test alert|subscribe|unsubscribe|install)", re.I)
CLOSE = re.compile(r"^(×|✕|close|done|dashboard|back to (the )?dashboard|back to map|back)$", re.I)
SCAN_DIRS = ("deeds/", "ch91/", "history-scans/", "road-scans/", "title-trace/", "assessor-photos/")
NOISE = re.compile(r"Failed to load resource|favicon|ResizeObserver loop", re.I)

STUBS = """
(() => {
  if (window.__hbaE2E) return; window.__hbaE2E = {confirms: [], alerts: [], opened: [], prints: 0};
  window.confirm = m => { window.__hbaE2E.confirms.push(String(m)); return false; };
  window.alert = m => { window.__hbaE2E.alerts.push(String(m)); };
  window.prompt = m => { window.__hbaE2E.confirms.push('prompt: ' + m); return null; };
  window.print = () => { window.__hbaE2E.prints++; };
  const open = window.open; window.open = (u, ...rest) => { window.__hbaE2E.opened.push(String(u)); return null; };
})();
"""


@dataclass
class Result:
    role: str
    kind: str        # open | archive | click | form | flow | phone
    tool: str
    name: str
    status: str      # pass | fail | warn | skip | info
    detail: str = ""
    errors: list = field(default_factory=list)


class Watch:
    """Collects console errors, page errors and failed requests between mark() calls."""

    def __init__(self, page, base, role):
        self.base, self.role, self.items, self.external = base, role, [], set()
        page.on("console", self._console)
        page.on("pageerror", lambda e: self.items.append(("script error", (str(e) + " @ " + " ".join(re.findall(r"/app/[\w/.-]+:\d+:\d+", e.stack or ""))[:200])[:400])))
        page.on("response", self._response)
        page.on("requestfailed", self._failed)

    def _own(self, url):
        return url.startswith(self.base)

    def _console(self, m):
        if m.type == "error" and not NOISE.search(m.text):
            self.items.append(("console error", m.text[:300]))

    def _response(self, r):
        if r.status < 400:
            return
        url = r.url
        if not self._own(url):
            self.external.add(f"{r.status} {url[:120]}")
            return
        path = urlparse(url).path
        if r.status == 404 and any(d in path for d in SCAN_DIRS):
            return   # record scans ship separately (hba-portal-record-scans.zip)
        if r.status in (401, 403) and self.role in ("resident", "pending", "board-as-resident"):
            self.items.append(("expected " + str(r.status), f"{r.request.method} {path}"))
            return
        self.items.append((f"HTTP {r.status}", f"{r.request.method} {path}"))

    def _failed(self, r):
        if not self._own(r.url):
            if "ERR_ABORTED" not in (r.failure or ""):
                self.external.add(f"{r.failure} {r.url[:120]}")
            return
        if "ERR_ABORTED" in (r.failure or ""):
            return   # superseded requests (a newer search, a closed dialog)
        self.items.append(("request failed", f"{r.url[len(self.base):][:150]} {r.failure}"))

    def mark(self):
        out, self.items = self.items, []
        return out


def bad(errors):
    return [e for e in errors if not e[0].startswith("expected")]


class Walker:
    def __init__(self, browser, base, role, email, password, run_id, mobile=False, results=None, created=None):
        self.base, self.role, self.run_id, self.mobile = base, role, run_id, mobile
        self.results = results if results is not None else []
        self.created = created if created is not None else []
        vp = {"width": 375, "height": 812} if mobile else {"width": 1280, "height": 900}
        self.ctx = browser.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
        self.ctx.add_init_script(STUBS)
        self.page = self.ctx.new_page()
        self.page.set_default_timeout(15000)
        self.watch = Watch(self.page, base, role)
        self.n = 0
        self.past_form = False
        self.forms_done = set()   # each form is submitted once per role, even when several tools show it
        self.email, self.password = email, password

    # ---- helpers -------------------------------------------------------------------------------------------
    def add(self, kind, tool, name, status, detail="", errors=()):
        self.results.append(Result(self.role + (" @375px" if self.mobile else ""), kind, tool, name, status, detail, list(errors)))

    @property
    def f(self):
        """The member app's frame (found through its iframe; a frame's URL can lag behind while it loads)."""
        try:
            fr = self.page.query_selector("#hba-private-app")
            fr = fr and fr.content_frame()
            if fr:
                return fr
        except Exception:
            pass
        return self.page.main_frame

    def settle(self, ms=500, max_ms=12000):
        """Wait for the app's requests to finish and loading text to clear."""
        time.sleep(ms / 1000)
        end = time.time() + max_ms / 1000
        while time.time() < end:
            try:
                busy = self.f.evaluate("""() => { const d=[...document.querySelectorAll('dialog[open]')].pop()||document.body;
                    return /(^|\\s)(Loading|Opening|One moment|Checking)[^\\n]{0,40}…/.test(d.innerText.slice(0,4000)); }""")
            except Exception:
                busy = False
            if not busy:
                break
            time.sleep(0.4)
        try:
            self.page.wait_for_load_state("networkidle", timeout=1500)
        except Exception:
            pass

    def token(self, tool):
        self.n += 1
        return f"E2E {self.run_id} {self.role.split('-')[0][:3]} {tool} {self.n}"

    # ---- sign in -------------------------------------------------------------------------------------------
    def sign_in(self):
        p = self.page
        p.goto(self.base + "/")
        p.wait_for_selector("#login-form:not([hidden])", timeout=20000)
        p.fill("input[name=email]", self.email)
        p.fill("input[name=password]", self.password)
        p.click("#login-submit")
        if self.role == "pending":
            p.wait_for_selector("#pending-account:not([hidden])", timeout=20000)
            text = p.inner_text("#login-screen")
            self.add("flow", "sign-in", "pending account sees the waiting page", "pass" if "approv" in text.lower() else "fail", text[:160],
                     bad(self.watch.mark()))
            return False
        p.wait_for_selector("#hba-private-app", timeout=20000)
        ok = self.wait_dashboard()
        self.add("flow", "sign-in", "sign in and dashboard loads", "pass" if ok else "fail", "", bad(self.watch.mark()))
        return ok

    def wait_dashboard(self, timeout=60):
        end = time.time() + timeout
        while time.time() < end:
            try:
                # Ready once the signed-in account has reached the dashboard (before that it draws the signed-out view).
                if self.f.evaluate("""() => !!(window.HBACapabilities && window.HBACommunity && window.HBACommunity.member
                        && document.querySelector('#hba-dashboard [data-cap-run]')
                        && !document.querySelector('#hba-dashboard [data-cap-run="signin"]'))"""):
                    self.settle(1500)
                    return True
            except Exception:
                pass
            time.sleep(0.5)
        return False

    # ---- dashboard tools -----------------------------------------------------------------------------------
    def tool_ids(self):
        return self.f.evaluate("""() => [...new Set([...document.querySelectorAll('#hba-dashboard [data-cap-run]')]
            .filter(b => b.offsetParent || b.getClientRects().length).map(b => b.dataset.capRun))]""")

    def all_tool_ids(self):
        """Every tool in capabilities.js visible to this account (cards, quick links and cluster entries)."""
        return self.f.evaluate("""() => { const v=HBACapabilities.visible; const out=[];
            for (const g of HBACapabilities.inventory().groups) for (const t of g.tools) { if (!v(t)) continue;
              if (t.cluster) { for (const s of t.sub) if (v({...s, who: s.who || t.who})) out.push(s.id); } else out.push(t.id); }
            return out; }""")

    def reset(self):
        try:
            self.f.evaluate("""() => { document.querySelectorAll('dialog[open]').forEach(d => { try { d.close(); } catch {} });
                window.HBAShell && HBAShell.showDashboard(); }""")
        except Exception:
            pass
        time.sleep(0.3)

    def state(self):
        return self.f.evaluate("""() => { const ds=[...document.querySelectorAll('dialog[open]')];
            const top=ds[ds.length-1];
            const b=document.getElementById('cap-bulletin'); const r=b&&b.getBoundingClientRect();
            return {dialogs: ds.map(d => d.id || d.className || 'dialog'), map: document.body.classList.contains('hba-map-mode'),
                    top: top ? (top.id || '') : '', title: top ? ((top.querySelector('h1,h2,h3')||{}).textContent||'').trim().slice(0,80) : '',
                    text: top ? top.innerText.slice(0, 3000) : '',
                    bulletin: !!(r && r.top < innerHeight && r.bottom > 0),
                    overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
                    dialogOverflow: top ? Math.round(top.getBoundingClientRect().right - innerWidth) : 0}; }""")

    def open_tool(self, tid):
        """Click the tool's visible dashboard button. Returns the state afterwards, or None if there is no button."""
        self.reset()
        loc = self.f.locator(f'#hba-dashboard [data-cap-run="{tid}"]').filter(visible=True)
        if not loc.count():
            # Cluster entries and some cards sit lower on the page; the dashboard search finds them too.
            return None
        loc.first.scroll_into_view_if_needed()
        loc.first.click()
        self.settle(900)
        return self.state()

    def check_open(self, tid, label=None):
        self.watch.mark()
        st = self.open_tool(tid)
        errors = self.watch.mark()
        name = label or tid
        if st is None:
            self.add("open", tid, name, "fail", "no visible button for this tool on the dashboard", bad(errors))
            return None
        opened = st["dialogs"] or st["map"] or (tid == "bulletin" and st["bulletin"])
        problems = []
        if not opened:
            problems.append("nothing opened")
        text = st["text"].replace("This attached image could not load.", "")   # deed scans: separate zip
        if re.search(r"could not (load|open)|not loaded|failed to load|something went wrong|error:", text, re.I):
            problems.append("error text: " + re.search(r"[^\n]*(could not (load|open)|not loaded|failed to load|something went wrong|error:)[^\n]*", text, re.I).group(0)[:160])
        if self.mobile and st["overflow"] > 2:
            problems.append(f"page scrolls sideways by {st['overflow']}px at 375px")
        if self.mobile and st["dialogOverflow"] > 2:
            problems.append(f"dialog is {st['dialogOverflow']}px wider than the screen")
        what = ("map" if st["map"] else "") + (" ".join(st["dialogs"])) + (" dashboard bulletin" if tid == "bulletin" and st["bulletin"] else "")
        status = "fail" if problems or bad(errors) else "pass"
        self.add("open", tid, name, status, "; ".join(problems) or f"opens {what.strip()} · {st['title']}", errors)
        return st if opened else None

    # ---- inside a tool -------------------------------------------------------------------------------------
    def controls(self):
        """Visible, enabled clickables in the top dialog (or the map panel), as (key, label) pairs."""
        return self.f.evaluate("""() => {
            const ds=[...document.querySelectorAll('dialog[open]')]; const root=ds[ds.length-1] ||
              (document.body.classList.contains('hba-map-mode') ? document.getElementById('panel') : null);
            if (!root) return [];
            const seen={}; const out=[];
            for (const el of root.querySelectorAll('button, a[href], summary, [role=tab]')) {
              const r=el.getBoundingClientRect(); if (!r.width || !r.height || el.disabled || el.closest('[hidden]')) continue;
              if (el.type === 'submit' || el.closest('form') && el.type !== 'button') continue;
              const label=(el.getAttribute('aria-label') || el.innerText || el.title || '').trim().replace(/\\s+/g,' ').slice(0,80);
              const k=el.tagName+'|'+label; seen[k]=(seen[k]||0)+1;
              out.push({key: k+'|'+seen[k], label, tag: el.tagName, href: el.tagName==='A' ? el.getAttribute('href') : '',
                        target: el.getAttribute('target')||'', download: el.hasAttribute('download')});
            }
            return out; }""")

    def click_control(self, key):
        tag, rest = key.split("|", 1)
        label, nth = rest.rsplit("|", 1)
        nth = int(nth)
        return self.f.evaluate("""([tag,label,nth]) => {
            const ds=[...document.querySelectorAll('dialog[open]')]; const root=ds[ds.length-1] ||
              (document.body.classList.contains('hba-map-mode') ? document.getElementById('panel') : null);
            if (!root) return false; let i=0;
            for (const el of root.querySelectorAll(tag)) {
              const r=el.getBoundingClientRect(); if (!r.width || !r.height || el.disabled || el.closest('[hidden]')) continue;
              if (el.type === 'submit' || el.closest('form') && el.type !== 'button') continue;
              const l=(el.getAttribute('aria-label') || el.innerText || el.title || '').trim().replace(/\\s+/g,' ').slice(0,80);
              if (l === label && ++i === nth) { el.scrollIntoView({block:'center'}); el.click(); return true; }
            }
            return false; }""", [tag, label, nth])

    def explore(self, tid, reopen, budget=60, seconds=150):
        """Click every safe control once, submitting forms as they appear. reopen() puts the tool back on screen."""
        done, clicks, start, forms_done = set(), 0, time.time(), self.forms_done
        self.forms(tid, forms_done)
        while clicks < budget and time.time() - start < seconds:
            todo = [c for c in self.controls() if c["key"] not in done]
            if not todo:
                break
            c = todo[0]
            done.add(c["key"])
            label = c["label"] or c["href"] or c["tag"]
            if SKIP.search(label) or CLOSE.match(label) or c["download"]:
                continue
            href = c["href"] or ""
            if c["tag"] == "A" and (href.startswith(("http", "mailto:", "tel:", "sms:")) or c["target"] == "_blank"):
                continue   # external links are checked by the link check, not opened here
            before = self.state()
            self.watch.mark()
            try:
                if not self.click_control(c["key"]):
                    continue
            except Exception as e:
                self.add("click", tid, label, "fail", f"click failed: {str(e)[:150]}")
                continue
            clicks += 1
            self.settle(500, 6000)
            errors = self.watch.mark()
            if bad(errors):
                self.add("click", tid, label, "fail", "", errors)
            after = self.state()
            self.forms(tid, forms_done)
            if after["top"] != before["top"] or after["map"] != before["map"]:
                # It opened another tool or dialog: record that, then come back.
                if after["dialogs"] and len(after["dialogs"]) > len(before["dialogs"]):
                    self.f.evaluate("() => { const ds=[...document.querySelectorAll('dialog[open]')]; ds[ds.length-1].close(); }")
                    self.settle(200, 2000)
                if self.state()["top"] != before["top"]:
                    reopen()
        self.add("click", tid, f"{clicks} controls clicked", "info", f"{len(done)} seen")

    def fill_value(self, el, tool):
        """A valid test value for one field, from its type and name."""
        t, name = el["type"], (el["name"] + " " + el["label"]).lower()
        if t == "email" or "email" in name:
            return "e2e@hba.test"
        if t == "tel" or "phone" in name or "mobile" in name:
            return "5085550123"
        if "source_url" in name:
            return "https://www.mass.gov/info-details/e2e-test-notice"
        if "zoom" in name:
            return "https://us02web.zoom.us/j/81234567890?pwd=e2eTest"
        if t == "url" or "url" in name or "link" in name:
            return "https://example.org/e2e"
        if t == "date" and (self.past_form or re.search(r"payment_date|transaction_date|posted|approved_on|work_date|period_", name)):
            return (date.today() - timedelta(days=7)).isoformat()   # records of things that already happened
        if t == "date" and "rain" in name:
            return (date.today() + timedelta(days=15)).isoformat()
        if t == "date":
            return el["min"] if el["min"] and el["min"] > (date.today() + timedelta(days=14)).isoformat() else (date.today() + timedelta(days=14)).isoformat()
        if t == "datetime-local":
            return (date.today() + timedelta(days=14)).isoformat() + "T18:00"
        if t == "time":
            return "18:00"
        if t == "month":
            return date.today().isoformat()[:7]
        if t == "number" or "amount" in name:
            lo = float(el["min"]) if el["min"] not in ("", None) else 1
            hi = float(el["max"]) if el["max"] not in ("", None) else None
            if "year" in name or lo >= 1900:
                v = max(date.today().year, int(lo))
            else:
                v = max(lo, 1 if lo <= 1 else lo)
                v = 125 if ("amount" in name or "price" in name) and (hi is None or hi >= 125) else v
            if hi is not None:
                v = min(v, hi)
            return str(int(v)) if float(v).is_integer() else str(v)
        if "year" in name:
            return str(date.today().year)
        return None

    def forms(self, tool, done):
        """Fill and submit each visible form in the top dialog that has not been handled yet."""
        forms = self.f.evaluate("""() => {
            const ds=[...document.querySelectorAll('dialog[open]')]; const root=ds[ds.length-1] || document.getElementById('panel');
            if (!root) return [];
            return [...root.querySelectorAll('form')].map((f,i) => ({i, id: f.id || '', visible: !!f.getBoundingClientRect().height && !f.closest('[hidden]'),
              key: (f.id || '') + '|' + [...f.elements].map(e => e.name).filter(Boolean).slice(0,6).join(','),
              hasPassword: !!f.querySelector('input[type=password]'),
              submit: ((f.querySelector('[type=submit], button:not([type])') || {}).innerText || '').trim().slice(0,60),
              heading: (f.querySelector('h2,h3,h4,legend') || {}).innerText || ''}));
        }""")
        for fm in forms:
            if not fm["visible"] or fm["key"] in done:
                continue
            done.add(fm["key"])
            label = (fm["submit"] or fm["heading"] or fm["id"] or "form").strip()
            name = f"{label} ({fm['id'] or fm['key'].split('|')[1][:40]})"
            if fm["hasPassword"]:
                self.add("form", tool, name, "skip", "password form: would change the test account's password")
                continue
            if SKIP.search(label) and not re.search(r"^save|^add|^submit|^send (my|this|message|report|request)", label, re.I):
                self.add("form", tool, name, "skip", "destructive or outward-facing action")
                continue
            self.submit_form(tool, fm["i"], name)

    def submit_form(self, tool, index, name):
        tok = self.token(tool)
        handle = self.f.evaluate_handle("""(i) => { const ds=[...document.querySelectorAll('dialog[open]')];
            const root=ds[ds.length-1] || document.getElementById('panel'); return root.querySelectorAll('form')[i]; }""", index)
        form = handle.as_element()
        # Tag each field once so later steps find the same element even if the list around the form re-renders.
        fields = form.evaluate("""(f) => [...f.elements].filter(e => ['INPUT','SELECT','TEXTAREA'].includes(e.tagName)).map((e,j) => {
              e.dataset.e2e = String(j);
              return {j, tag: e.tagName, type: (e.type||'').toLowerCase(), name: e.name||e.id||'',
              label: ((e.labels&&e.labels[0]&&e.labels[0].innerText)||e.placeholder||e.getAttribute('aria-label')||'').slice(0,80),
              value: e.value, required: e.required, min: e.min||'', max: e.max||'', maxlength: e.maxLength>0?e.maxLength:0,
              pattern: e.pattern||'', accept: e.accept||'', hidden: !e.getBoundingClientRect().height || e.disabled || e.readOnly,
              checked: !!e.checked, options: e.tagName==='SELECT' ? [...e.options].filter(o=>!o.disabled).map(o=>o.value) : []}; })""")
        text_done = False
        self.past_form = any(f["name"] in ("adjourned", "called_to_order", "attendees") for f in fields)
        for el in fields:
            t = el["type"]
            if el["hidden"] and t != "file" or t in ("hidden", "submit", "button", "reset", "image", "password"):
                continue
            node = form.query_selector(f'[data-e2e="{el["j"]}"]')
            if not node:
                self.add("form", tool, name, "warn", "the form re-rendered while it was being filled")
                return
            try:
                if el["tag"] == "SELECT":
                    if not el["value"] or el["required"]:
                        opts = [o for o in el["options"] if o]
                        if opts:
                            node.select_option(opts[0])
                elif t == "checkbox":
                    if (el["required"] or re.search(r"consent|permission|agree|confirm", el["name"] + el["label"], re.I)) and not el["checked"]:
                        node.check()
                elif t == "radio":
                    if not any(x["checked"] for x in fields if x["name"] == el["name"]):
                        node.check()
                elif t == "file":
                    img = "image" in el["accept"] or "photo" in (el["name"] + el["label"]).lower()
                    node.set_input_files(files=[{"name": "e2e.jpg" if img else "e2e.pdf", "mimeType": "image/jpeg" if img else "application/pdf",
                                                 "buffer": jpeg(tok) if img else pdf(tok)}])
                elif t in ("range", "color"):
                    continue
                else:
                    v = self.fill_value(el, tool)
                    textual = v is None
                    if textual:
                        if el["value"] and (text_done or not el["required"]) and el["tag"] != "TEXTAREA":
                            continue
                        v = tok if not text_done else (tok + " — test note" if el["tag"] == "TEXTAREA" else tok)
                        if el["maxlength"] and len(v) > el["maxlength"]:
                            v = v[-el["maxlength"]:]
                        text_done = True
                    elif el["value"] and not el["required"]:
                        continue
                    if el["pattern"] and not re.fullmatch(el["pattern"], v):
                        v = next((x for x in ("1234", "12345", "AB12", "e2e") if re.fullmatch(el["pattern"], x)), v)
                    node.fill(v, timeout=3000)
            except Exception as e:
                if "Timeout" not in str(e):   # a field the reader cannot see either (collapsed or covered)
                    self.add("form", tool, name, "warn", f"could not fill {el['name'] or el['label']}: {str(e)[:120]}")
        invalid = self.f.evaluate("""(f) => [...f.elements].filter(e => e.willValidate && !e.checkValidity())
            .map(e => (e.name||e.id) + ': ' + e.validationMessage)""", form)
        if invalid:
            self.add("form", tool, name, "warn", "browser validation blocks submit: " + "; ".join(invalid)[:250])
            return
        writes = []
        on_resp = lambda r: writes.append((r.request.method, urlparse(r.url).path, r.status, r)) if "/api/" in r.url and r.request.method != "GET" else None  # noqa: E731
        self.page.on("response", on_resp)
        self.watch.mark()
        try:
            self.f.evaluate("(f) => { const b=f.querySelector('[type=submit], button:not([type])'); if (b) b.click(); else f.requestSubmit(); }", form)
        except Exception as e:
            self.add("form", tool, name, "fail", f"submit failed: {str(e)[:150]}")
            return
        self.settle(1200, 15000)
        self.page.remove_listener("response", on_resp)
        errors = self.watch.mark()
        page_text = self.f.evaluate("() => [...document.querySelectorAll('dialog[open]')].map(d => d.innerText).join('\\n') + document.body.innerText.slice(0, 20000)")
        failed = [f"{m} {p} → {s}: {self.body(r)}" for m, p, s, r in writes if s >= 400]
        status_msg = self.f.evaluate("""() => { const ds=[...document.querySelectorAll('dialog[open]')]; const root=ds[ds.length-1] || document;
            return [...root.querySelectorAll('[role=status], [role=alert], .error, .status, output, .community-status')].map(e => e.innerText.trim()).filter(Boolean).join(' | ').slice(0, 300); }""")
        shown = tok in page_text
        # A 400/409 with a plain-language reason is the app enforcing a rule on our test data (for example "already
        # marked paid"); permission errors, raw database text and server errors are bugs.
        rule = failed and all(st in (400, 409) for m, pth, st, r in writes if st >= 400) and not re.search(
            r"permission|violates|constraint|relation |syntax|internal|traceback|not defined", " ".join(failed), re.I)
        if failed and rule:
            self.add("form", tool, name, "warn", "refused by a rule: " + "; ".join(failed)[:380],
                     [e for e in errors if not e[0].startswith("HTTP 4")])
        elif failed:
            self.add("form", tool, name, "fail", "; ".join(failed)[:400], errors)
        elif not writes:
            self.add("form", tool, name, "info" if not bad(errors) else "fail", f"no request sent (client-side form) · {status_msg[:150]}", errors)
        else:
            ok = shown or re.search(r"saved|sent|added|thank|recorded|submitted|updated|created|uploaded|received", status_msg, re.I)
            self.add("form", tool, name, "pass" if ok and not bad(errors) else "warn",
                     ("saved and shown" if shown else "saved; " + (status_msg[:150] or "the new text is not shown afterwards")) +
                     f" · {', '.join(f'{m} {p}' for m, p, s, r in writes)[:150]}", errors)
            if shown:
                self.created.append((self.role, tool, tok))

    @staticmethod
    def body(r):
        try:
            return r.text()[:160]
        except Exception:
            return ""

    # ---- archive -------------------------------------------------------------------------------------------
    def archive_views(self):
        self.reset()
        self.f.evaluate("() => window.openHBACommunity('overview')")
        self.settle(1200)
        return self.f.evaluate("() => [...document.querySelectorAll('#community-section-select option')].map(o => [o.value, o.textContent.trim()])")

    def open_archive(self, view):
        self.f.evaluate("() => { if (!document.getElementById('community-dialog').open) window.openHBACommunity('overview'); }")
        self.settle(300)
        # The section chooser is hidden while the dashboard is the base layer; set it and fire its change handler.
        self.f.evaluate("""(v) => { const s=document.getElementById('community-section-select'); s.value=v;
            s.dispatchEvent(new Event('change', {bubbles: true})); }""", view)
        self.settle(900)
        return self.state()
