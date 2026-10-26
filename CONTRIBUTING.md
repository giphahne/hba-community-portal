# Contributing

Thank you for helping the Hamilton Beach Association portal. A few ground rules keep it safe for the neighbours who use it.

## Never commit
- `.env.community`, `hba-storage.json`, anything in `community-private-data/`
- Resident contact lists, rosters, QA fixtures with real accounts
- Supabase service-role keys (the app only ever uses the public anon key)

`.gitignore` blocks the usual locations; please look at your diff before pushing.

## Local development
1. Follow README.md → Installation to create a Supabase project and fill in `server/.env.community`.
2. `cd server && ./run.sh` starts the API on http://127.0.0.1:3003 and serves `private-app/` at `/app/`.
3. Serve `site/` with any static server on port 3001 (for example `npx serve -l 3001 site`). The sign-in page
   falls back to the local API automatically while `__HBA_GATE_API__` is left as the placeholder.

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
