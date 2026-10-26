# Hamilton Beach Association community portal

Source repository for the resident portal of the Hamilton Beach Association, Wareham, Massachusetts.
Exported October 25, 2026 from the live portal at hamiltonbeach.pplx.app. It contains the
complete application: the sign-in page, the private member app, the backend service, photographs and icons,
the database structure, and reference seed rows. It contains **no passwords, API keys, session keys or
resident personal data**. Everything you must fill in yourself is listed under "Settings to provide".

```
hba-community-portal/
├── .github/              CI checks, issue and pull-request templates
├── site/                 Public sign-in page (static HTML/CSS/JS, icons, web manifest, service worker)
├── private-app/          The member app, served by the backend at /app/ after sign-in
│   ├── photos/           36 resident photographs + manifest.json (captions and credits)
│   ├── friendly/         Illustrations painted from residents' photographs, postcards
│   ├── sand-school/      Erosion and jetty teaching pages
│   └── *.js *.css *.json Dashboard, tools, research data (deeds, Chapter 91, drainage, history)
├── server/               FastAPI backend (community-api.py + modules), requirements.txt, .env.example, run.sh
├── supabase/
│   ├── schema.sql        Full database structure: 73 tables, 124 foreign keys, 66 functions, 41 triggers,
│   │                     220 row-level-security policies, grants, storage bucket  (generated from the live project)
│   ├── seed-reference.sql  Reference rows only: the 156 house addresses, 15 finance categories, 10 public settings
│   └── migrations-history/ The incremental SQL files the schema grew from (for reference; schema.sql supersedes them)
└── tools/                build-publish-bundle.py (makes a lean deploy folder), a few unit tests
```

A second archive, `hba-portal-record-scans.zip`, holds the large public-record images the research tools
display (assessor photos, deed and Chapter 91 scans, road and title-trace scans — about 530 MB). Unzip it
into `private-app/` so the folders `assessor-photos/`, `deeds/`, `ch91/`, `history-scans/`, `road-scans/`
and `title-trace/` sit beside `index.html`. The app runs without them; the affected research cards simply
show "image not available".

## How it fits together

1. **Supabase** (hosted PostgreSQL + Auth + Storage) holds all live data. Every row is protected by
   row-level-security policies; the app only ever uses the public *anon* key plus each member's own JWT,
   so the database — not the server — decides what a member may read or change.
2. **The backend** (`server/community-api.py`, Python 3.11+, FastAPI) signs members in against Supabase Auth,
   keeps an encrypted per-browser session (SQLite file it creates itself), proxies data requests with the
   member's own token, serves the private app at `/app/`, and adds weather, tides, NWS alerts, document
   intake, voting logic, bank reconciliation and optional AI document search.
3. **The sign-in page** (`site/`) is plain static HTML. It calls the backend's `/api/...` endpoints and,
   once signed in, loads `/app/` into a frame.

## Installation

### 1. Create the database

1. Create a new Supabase project. Enable **Email** sign-in under Authentication → Providers
   (email confirmation on; set the Site URL to your sign-in page address).
2. Open `supabase/schema.sql`, replace `admin@example.com` (two places inside `hba_sync_member`) with the
   administrator's e-mail address — that address becomes `admin` automatically when it confirms its account.
3. Run `schema.sql` in the SQL editor as the `postgres` role, then `seed-reference.sql`.
4. Edit the public settings rows for your association (`hba_settings`: payee and mailing address for checks,
   dues amount and due date, meeting rule, supper defaults, community links). Replace the house list in
   `hba_dues_households` if your streets differ; the parcel ids must match `private-app/dues-registry-data.json`.
5. Create the private Storage bucket `hba-archive` if the insert in `schema.sql` did not (Storage → New bucket,
   not public). Storage policies are included in `schema.sql`.

### 2. Run the backend

```sh
cd server
cp .env.example .env.community      # fill in SUPABASE_URL and SUPABASE_ANON_KEY
cp -r ../private-app ./private-app  # or symlink; the service serves this folder at /app/
echo https://portal.example.org > app-url.txt   # public address used in e-mail drafts
./run.sh                            # pip install + uvicorn on port 3003
```

On first start the service creates `community-private-data/` with a session-encryption key, the sessions
database and a Web Push (VAPID) key pair. Keep that folder private and persistent between deployments
(losing it only signs everyone out and re-prompts push subscriptions).

Health check: `GET /api/health?probe=1` returns 200.

### 3. Serve the sign-in page

Serve `site/` from any static host or the same reverse proxy. Two settings:

- `site/index.html` line 18: `window.__HBA_GATE_API__='__PORT_3003__'`. Replace `'__PORT_3003__'` with the
  public URL of the backend, for example `'/api'` when proxied on the same origin, or
  `'https://api.portal.example.org'`. (The placeholder is understood by the Perplexity host, and in local
  development it falls back to `http://127.0.0.1:3003`.)
- If the sign-in page and backend are on different origins, list the page origin in `HBA_ALLOWED_ORIGINS`.

Recommended: one reverse proxy (nginx/Caddy) that serves `site/` at `/` and forwards `/api/*` and `/app/*`
to `127.0.0.1:3003`. Then `__HBA_GATE_API__` is simply `''` (empty string) or `'/'`.

### 4. Visitor identity

The backend ties each browser to a session using a visitor id. Perplexity hosting injects an
`x-visitor-id` header; elsewhere set `HBA_VISITOR_MODE=cookie` (already in `.env.example`) and the
service issues its own random, HttpOnly first-party cookie.

## Settings to provide

| Setting | Where | Required | Purpose |
|---|---|---|---|
| `SUPABASE_URL` | `server/.env.community` | yes | Your project's REST URL |
| `SUPABASE_ANON_KEY` | `server/.env.community` | yes | Public anon/publishable key (never the service-role key) |
| Administrator e-mail | `supabase/schema.sql` → `hba_sync_member` | yes | First admin account |
| `HBA_VISITOR_MODE` | `.env.community` | yes outside Perplexity | `cookie` or `header` |
| `__HBA_GATE_API__` | `site/index.html` | yes | Backend URL seen by the sign-in page |
| `app-url.txt` | `server/` | recommended | Public address for links in drafted e-mails |
| `HBA_ALLOWED_ORIGINS` | `.env.community` | if cross-origin | CORS allow-list |
| `HBA_PUSH_SUBJECT` | `.env.community` | recommended | `mailto:` contact placed in push messages |
| `OPENAI_API_KEY` | `.env.community` | optional | Turns on "Ask our documents" |
| `hba_settings` rows | database | yes | Payee/address for checks, dues amount, meeting rule, links |
| `hba_dues_households` | database | yes | House list (seeded with the Hamilton Beach addresses) |
| Officers | database `hba_officeholders` | yes | Entered by the administrator inside the app (Accounts / Our team) |
| Supabase Auth → Site URL, redirect URLs | Supabase dashboard | yes | Password-reset and confirmation links |

Nothing else is secret: the anon key is designed to be public and the policies in `schema.sql` are the gatekeeper.

## What was deliberately left out

- `.env.community`, `hba-storage.json`, `community-private-data/` (session key, sessions.sqlite, VAPID key, logs)
- The private winter-resident roster, newsletter source scans, QA fixtures, test accounts and audit receipts
- Resident contact details: one officer e-mail printed in the archived newsletter text was replaced with
  `secretary@example.org`; the hard-coded administrator address became `admin@example.com`
- Deployment scripts specific to Perplexity hosting

Note that `private-app/*.json` research files (property history, deed checks, assessments, dues registry
addresses) contain **public registry and assessor records**, including grantee names as recorded at the
Plymouth County Registry of Deeds. They are public documents, not resident account data, but review them
before publishing the portal under another name.

## Operating notes

- Python 3.11+; packages in `server/requirements.txt` (FastAPI, uvicorn, httpx, PyMuPDF, Pillow,
  cryptography, python-dotenv, pydantic, python-multipart, openai, pywebpush).
- Weather, tides and alerts come from NOAA/NWS public APIs at request time (no keys).
- Dashboard buttons can be hidden from residents by the administrator inside the app (Help → App map);
  the choice is stored in `hba_settings.public_hidden_tools`.
- The app is designed dark with large type for readers in their sixties and seventies; keep that when restyling.
- Tests: `node tools/tests/test-event-dates.cjs`, `python3 tools/tests/test-bank-math.py` (pure logic; no database needed).

## Working in this repository

See `CONTRIBUTING.md` (local setup, database-change rules, design rules) and `SECURITY.md`.
`.gitignore` keeps `.env` files, the private data folder, rosters and the large record scans out of commits.
The record scans ship separately as `hba-portal-record-scans.zip`; unzip into `private-app/` locally — they are ignored by git.

Licensing has not been decided by the association yet; until it is, treat the code and photographs as all rights reserved by the Hamilton Beach Association and the photographers.

## Source attribution

Photographs are residents' pictures shared with the association (credits in `private-app/photos/manifest.json`).
Historical postcards are Tichnor Brothers linen cards (public domain). The Benson house photograph (1926–1938)
was shared by Sean P. Sullivan in the Quasuet Island/Hamilton Beach Friends and Family group, July 9, 2023.
