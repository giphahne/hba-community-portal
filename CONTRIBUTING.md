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

## Tests
- `node tools/tests/test-event-dates.cjs`
- `python3 tools/tests/test-bank-math.py`
- The remaining `tools/tests` scripts need a running API and QA accounts; see comments at the top of each file.
