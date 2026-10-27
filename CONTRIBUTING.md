# Contributing

Thank you for helping the Hamilton Beach Association portal. A few ground rules keep it safe for the neighbours who use it.

## Never commit
- `.env.community`, anything in `community-private-data/`, the values of `HBA_SESSION_KEY` / `HBA_VAPID_PRIVATE_KEY`
- Resident contact lists, rosters, QA fixtures with real accounts
- Supabase service-role keys (the app only ever uses the public anon key)

`.gitignore` blocks the usual locations; please look at your diff before pushing.

## Local development
1. Quick look without a database: `python tools/dev-server.py`, then open http://127.0.0.1:3003.
2. With data: create a Supabase project (DEPLOY.md, step 1), fill in `server/.env.community`, then
   `cd server && ./run.sh`. One address serves the sign-in page (/), the member app (/app/) and the API (/api/).
3. Before pushing: `python -m pytest tools/tests` (no database needed). Backend code lives in `server/hba/`;
   add routes to the matching module in `server/hba/routers/`.
4. Member-app tools load the first time they are opened. A new tool's scripts and stylesheets go in a bundle in
   `private-app/lazy.js` (with the `window.open…` functions it defines), and its stylesheet's place in
   `private-app/index.html` is a `<template data-lazy-css="…">` line. Only code the dashboard or map needs at
   start-up gets a `<script>` tag. After regenerating `title-trace.js` or `road-wording.js`, run
   `python tools/split-map-data.py` to refresh the start-up summary the map uses.

## Database changes
- Add a new file `supabase/migrations/NNN-short-name.sql` (create the folder on first use) rather than editing `schema.sql`.
- Every new table needs row-level-security enabled and policies for `authenticated` (and `anon` only if truly public).
- Reference data belongs in `seed-reference.sql`; never personal data.

## Design
- Dark background, large text, nautical palette (navy `#0B2545`/`#13315C`, sail `#F4F1E8`, brass `#C9A227`,
  seafoam `#8FC1B5`, signal red `#B23A48`). The softer dashboard palette uses `#15273F` / `#1E3354` / sand `#E3CF8A`.
- No exclamation points or emojis in interface copy. Show missing data honestly rather than inventing it.
- Illustrations are labelled "Illustration from a resident photograph · …"; real photographs "Photograph · …".
- Never put real people in generated images.

## End-to-end walkthrough
`tools/e2e/` clicks through the whole portal in a real browser, the way residents and the board use it, against a
throwaway local Supabase. It never runs against the association's database (it refuses any Supabase address that is not
local), because it creates and edits records.

1. Once: install the Supabase CLI and Docker Desktop, then make a local project next to this checkout
   (`hba-local-supabase/`), put `schema.sql` (with `admin@example.com` replaced by `admin@hba.test`, as in DEPLOY.md
   step 2) and the `migrations/` files in its `supabase/migrations/` folder and `seed-reference.sql` in
   `supabase/seed.sql`, and run `npx supabase@latest start`. Create `admin@hba.test` and `resident@hba.test` there
   (Studio → Authentication, auto-confirmed), approve resident@ as a resident, and write the shared test password in
   `hba-local-supabase/test-accounts.txt` as `password for all: …` (or set `HBA_E2E_PASSWORD`).
   The walkthrough signs up `board@hba.test` and `pending@hba.test` itself through the app.
2. `pip install playwright pyflakes && python -m playwright install chromium`
3. Run it: `python tools/e2e/run.py` (about an hour). It starts this checkout's portal on 127.0.0.1:3013, seeds events,
   meetings, minutes, a newsletter, votes, volunteers, register entries, dues, bids, issues, documents and photos
   through the API, checks every link, then for the administrator, a board member and a resident opens every dashboard
   tool and archive section, clicks every control that is not destructive and submits every form with test data.
   It also checks a board member in Resident view, a pending account, and the main flows at phone width (375px).
4. Read `tools/e2e/REPORT.md`. Hand-written notes on the bugs it found live in `tools/e2e/FINDINGS.md` and are copied
   to the top of the report.

Faster runs: `--roles resident --tools issues,payments` (one role, two tools), `--no-explore` (only open each tool),
`--no-external` (skip contacting outside websites), `--base-url http://127.0.0.1:3003` (use a portal you started).
The walkthrough answers every confirmation prompt with Cancel and never clicks delete, approve/reject, sign out,
password, send-text or certify buttons. Its own server allows 500 sign-ins per 15 minutes (`HBA_AUTH_ATTEMPTS`);
the hosted portal keeps the default of 12.

## Tests
- `node tools/tests/test-event-dates.cjs`
- `python3 tools/tests/test-bank-math.py`
- The remaining `tools/tests` scripts need a running API and QA accounts; see comments at the top of each file.
