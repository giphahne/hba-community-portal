## Bugs found by the walkthrough (October 2026)

### Fixed, each in its own commit with a regression check

| # | What a reader saw | Cause | Fix | Regression check |
|---|---|---|---|---|
| 1 | Editing an issue, meeting, agenda item, minutes, officeholder or register entry; approving minutes; attaching a minutes PDF; replying to a governor message; meeting Zoom settings: all failed with a server error | The backend split left `uid()`, `datetime` and `timezone` un-imported in `governance.py` and `finance.py` (18 routes) | Imports restored | `tools/tests/test_backend_names.py` runs pyflakes over `server/` (CI installs pyflakes) |
| 2 | On a project built from `schema.sql` (the new free hosting), even the administrator got "This account does not have permission for that action" when attaching a newsletter or minutes PDF, approving minutes, publishing a newsletter or volunteer task, changing volunteer e-mail preferences, editing a register entry or category budget, or editing an SMS draft | `schema.sql` kept table grants but dropped all column-level `grant update(…)` lines from the migration history | Grants added to `schema.sql`; `supabase/migrations/002_column_update_grants.sql` for a project already created | `tools/tests/test_schema_grants.py` compares every column grant in the history with `schema.sql`; walkthrough seeds a minutes PDF, newsletter PDF and published volunteer task |
| 3 | The dashboard's Weather now, Next tide and NWS alerts tiles did nothing | They run tool id `bulletin`, which is not in the tool list (same gap as Open calendar) | `run('bulletin')` opens the bulletin section | Walkthrough opens `bulletin` for every role |
| 4 | Submitting a nomination always failed with a permission error, for every role | The form offered fixed years 2027/2029/2031; the database accepts nominations only for an election the board has opened | Form lists only open election years (a note replaces the button when none); the API explains | `test_nomination_needs_an_open_election` |
| 5 | Every board visit logged a failed request, and the Detailed capital model said "Private cleaning allowance was not loaded" | `/api/cleaning-plan` answered 404 when no plan row exists, which is always true on a new project (no screen adds one) | Answers `{"recorded": false}`; the model keeps its estimate | `test_cleaning_plan_missing_is_not_an_error` |
| 6 | A rain date on or before the event date showed raw database text ("violates check constraint rain_date_requires_later_date") | No API check | "The rain date must be after the event date." | `test_rain_date_before_event_is_explained` |
| 7 | Linking an account to a property it already has showed "duplicate key value violates unique constraint" | No API check | "That property is already linked to this account." | `test_linking_a_property_twice_is_explained` |
| 8 | Script error "Cannot set properties of null (setting 'onclick')" in Road ownership research / property reports | A deed image that failed after the reader turned the page looked up its retry button in a detached stage | Only the image still on screen reacts | Walkthrough clicks through `roads` and `reports` |

### Not fixed: listed for a decision

- **Four wareham.gov links return 404** (town site reorganised): the 2026 horseshoe-crab notice in the bulletin
  (`private-app/bulletin.js`, `AlertCenter.aspx?AID=125`), "Street Listing" PDF (`private-app/index.html`,
  `private-app/research-tools.json`), "Town Accepted Streets" PDF (`private-app/research-tools.json`).
  Reproduce: open the link from the bulletin's June note or Road ownership research. Needs the current addresses from
  the town site.
- **Workstation paths in data files**: 10 deed-scan `image` values in `audit.json`, `property-history.json` and
  `road-wording.json` start with `/home/user/workspace/…`. The app does not show them today, but any future screen
  that does will get broken images. Reproduce: `grep -c /home/user private-app/*.json`.
- **Errors from the database reach readers as raw text** in other places too: the API passes PostgREST's message
  through for any constraint the API does not check first (items 6 and 7 were the two the walkthrough hit). A general
  translation in `hba/supabase.py` for constraint violations would cover the rest.
- **For a moment after sign-in the dashboard draws the signed-out view** (a "Sign in" account tile, no board tools)
  until the account loads. On a slow phone connection a board member could see the resident layout for a second or two.
  Reproduce: throttle the network in the browser's developer tools and sign in as board@.
- `board@hba.test` and `pending@hba.test` did not exist in the local Supabase although `test-accounts.txt` listed them;
  the seed step now creates them through the app's own sign-up and approval.

### By design (reported as warnings, not failures)

Advisories need an official mass.gov or wareham.ma.us link; minutes cannot be dated in the future; a household already
marked paid outside the receipt ledger cannot get a second credit; only the administrator may change a scheduling
office linked to an account; resident-made issues, draft bids and draft volunteer tasks are not shown to other
residents.
