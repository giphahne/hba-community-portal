# Hamilton Beach Association community portal

Source repository for the resident portal of the Hamilton Beach Association, Wareham, Massachusetts.
Exported October 25, 2026 from the live portal at hamiltonbeach.pplx.app and since restructured to run on any host. It contains the
complete application: the sign-in page, the private member app, the backend service, photographs and icons,
the database structure, and reference seed rows. It contains **no passwords, API keys, session keys or
resident personal data**. Everything you must fill in yourself is listed under "Settings to provide".

```
hba-community-portal/
├── .github/              CI checks, image build + deploy, daily health check, issue and PR templates
├── Dockerfile            One container: sign-in page, member app and API (see DEPLOY.md)
├── site/                 Public sign-in page (HTML/CSS/JS, icons, web manifest, service worker), served at /
├── private-app/          The member app, served by the backend at /app/ after sign-in
│   ├── photos/           36 resident photographs + manifest.json (captions and credits)
│   ├── friendly/         Illustrations painted from residents' photographs, postcards
│   ├── sand-school/      Erosion and jetty teaching pages
│   └── *.js *.css *.json Dashboard, tools, research data (deeds, Chapter 91, drainage, history)
├── server/               FastAPI backend: requirements.txt, .env.example, run.sh
│   ├── community-api.py  Entry point (`uvicorn community-api:app`)
│   ├── hba/              The service: config, sessions, Supabase calls, push alerts, middleware, main
│   │   └── routers/      One module per area: auth, community, finance, governance, weather, …
│   └── voting.py, engagement.py, document_intake.py, …   Feature modules with their own routes
├── supabase/
│   ├── schema.sql        Full database structure: 73 tables, 124 foreign keys, 66 functions, 34 triggers,
│   │                     220 row-level-security policies, grants, storage bucket  (generated from the live project)
│   ├── seed-reference.sql  Reference rows only: the 156 house addresses, 15 finance categories, 10 public settings
│   └── migrations-history/ The incremental SQL files the schema grew from (for reference; schema.sql supersedes them)
└── tools/                generate-secrets.py, dev-server.py (preview without a database), tests/
```

A second archive, `hba-portal-record-scans.zip`, holds the large public-record images the research tools
display (assessor photos, deed and Chapter 91 scans, road and title-trace scans — about 530 MB). Unzip it
into `private-app/` so the folders `assessor-photos/`, `deeds/`, `ch91/`, `history-scans/`, `road-scans/`
and `title-trace/` sit beside `index.html`. The app runs without them; the affected research cards simply
show "image not available". The deploy workflow adds them to the container image (see DEPLOY.md).

## How it fits together

1. **Supabase** (hosted PostgreSQL + Auth + Storage) holds all live data. Every row is protected by
   row-level-security policies; the app only ever uses the public *anon* key plus each member's own JWT,
   so the database — not the server — decides what a member may read or change.
2. **One backend service** (`server/`, Python 3.11+, FastAPI) serves everything from a single address:
   the sign-in page at `/`, the member app at `/app/` (only after sign-in) and the API at `/api/`. It signs
   members in against Supabase Auth, keeps each session in an encrypted HttpOnly cookie, proxies data
   requests with the member's own token, and adds weather, tides, NWS alerts, document intake, voting
   logic, bank reconciliation and optional AI document search.
3. **It keeps nothing on disk.** Secrets come from environment variables, so the service runs on any
   free container host and survives restarts without signing anyone out.

## Installation

Hosting step by step (free Supabase project + free container host): **[DEPLOY.md](DEPLOY.md)**.

### Try it locally

Without a database (pages, navigation and permissions only; panels are empty):

```sh
pip install -r server/requirements.txt
python tools/dev-server.py          # http://127.0.0.1:3003 — preview accounts are listed in the script
```

Against your Supabase project:

```sh
cd server
cp .env.example .env.community      # fill in SUPABASE_URL and SUPABASE_ANON_KEY
./run.sh                            # http://127.0.0.1:3003
```

Left empty, `HBA_SESSION_KEY` and `HBA_VAPID_PRIVATE_KEY` are generated into `server/community-private-data/`
for local use. Health check: `GET /api/health?probe=1` returns 200.

## Settings to provide

| Setting | Where | Required | Purpose |
|---|---|---|---|
| `SUPABASE_URL` | host environment / `server/.env.community` | yes | Your project's REST URL |
| `SUPABASE_ANON_KEY` | host environment | yes | Public anon/publishable key (never the service-role key) |
| `HBA_SESSION_KEY` | host environment | yes (hosted) | Encrypts session cookies; also keys payer fingerprints. `tools/generate-secrets.py` |
| `HBA_VAPID_PRIVATE_KEY` | host environment | yes (hosted) | Signs administrator push alerts. `tools/generate-secrets.py` |
| `HBA_PUBLIC_URL` | host environment | yes | Public address for links in drafted e-mails and notices |
| `HBA_PUSH_SUBJECT` | host environment | recommended | `mailto:` contact placed in push messages |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | host environment | optional | Turn on "Ask our documents" and AI document intake |
| Administrator e-mail | `supabase/schema.sql` → `hba_sync_member` | yes | First admin account |
| `hba_settings` rows | database | yes | Payee/address for checks, dues amount, meeting rule, links |
| `hba_dues_households` | database | yes | House list (seeded with the Hamilton Beach addresses) |
| Officers | database `hba_officeholders` | yes | Entered by the administrator inside the app (Accounts / Our team) |
| Supabase Auth → Site URL, redirect URLs | Supabase dashboard | yes | Password-reset and confirmation links |

`HBA_SESSION_KEY` and `HBA_VAPID_PRIVATE_KEY` are secrets; keep them stable. The anon key is designed to be
public and the policies in `schema.sql` are the gatekeeper.

## What was deliberately left out

- `.env.community`, `community-private-data/` and every secret value (session key, VAPID key)
- The private winter-resident roster, newsletter source scans, QA fixtures, test accounts and audit receipts
- Resident contact details: one officer e-mail printed in the archived newsletter text was replaced with
  `secretary@example.org`; the hard-coded administrator address became `admin@example.com`
- Deployment scripts specific to Perplexity hosting (this version runs on any container host instead)

Note that `private-app/*.json` research files (property history, deed checks, assessments, dues registry
addresses) contain **public registry and assessor records**, including grantee names as recorded at the
Plymouth County Registry of Deeds. They are public documents, not resident account data, but review them
before publishing the portal under another name.

## Operating notes

- Python 3.11+; packages in `server/requirements.txt` (FastAPI, uvicorn, httpx, PyMuPDF, Pillow,
  cryptography, python-dotenv, pydantic, python-multipart, openai, pywebpush, tzdata). Scanned PDFs are
  OCR-read with `tesseract` when it is installed (the Docker image includes it).
- Weather, tides and alerts come from NOAA/NWS public APIs at request time (no keys).
- Dashboard buttons can be hidden from residents by the administrator inside the app (Help → App map);
  the choice is stored in `hba_settings.public_hidden_tools`.
- The app is designed dark with large type for readers in their sixties and seventies; keep that when restyling.
- Tests (no database needed): `python -m pytest tools/tests` (sign-in, sessions, permissions, routing, caching —
  against an in-memory fake of Supabase), `node tools/tests/test-event-dates.cjs`, `python3 tools/tests/test-bank-math.py`.

## Working in this repository

See `CONTRIBUTING.md` (local setup, database-change rules, design rules) and `SECURITY.md`.
`.gitignore` keeps `.env` files, the private data folder, rosters and the large record scans out of commits.
The record scans ship separately as `hba-portal-record-scans.zip`; unzip into `private-app/` locally — they are ignored by git.

Licensing has not been decided by the association yet; until it is, treat the code and photographs as all rights reserved by the Hamilton Beach Association and the photographers.

## Source attribution

Photographs are residents' pictures shared with the association (credits in `private-app/photos/manifest.json`).
Historical postcards are Tichnor Brothers linen cards (public domain). The Benson house photograph (1926–1938)
was shared by Sean P. Sullivan in the Quasuet Island/Hamilton Beach Friends and Family group, July 9, 2023.
