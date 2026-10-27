# End-to-end walkthrough report

Generated 2026-10-27 14:21 by `python tools/e2e/run.py` against a local Supabase (http://127.0.0.1:3013). Run time 33 min.

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
| 9 | On a slow connection a board member (or resident) could land on the signed-out dashboard layout, a "Sign in" tile and no board tools, until reloading | community.js announced the account as soon as the session answered, sometimes before the dashboard script had loaded and started listening | The first announcement waits for the page to finish parsing | Walkthrough "slow connection" flow serves capabilities.js 2.5 s late (failed 3/3 before, passes after) |

### Not fixed: listed for a decision

- **Four wareham.gov links returned 404** (town site reorganised): fixed by pointing them at Internet Archive
  copies of the same documents, labelled "archived copy": Street Listing PDF (Oct 2025), Town Accepted Streets PDF
  (Nov 2025) and the town's 2026 horseshoe-crab notice (May 2026). The notice is seasonal; link next year's in
  `private-app/bulletin.js` when the town posts it.
- **Workstation paths in data files**: 10 deed-scan `image` values in `audit.json`, `property-history.json` and
  `road-wording.json` start with `/home/user/workspace/…`. The app does not show them today, but any future screen
  that does will get broken images. Reproduce: `grep -c /home/user private-app/*.json`.
- **Errors from the database reached readers as raw text** in other places too. Fixed afterwards in dbaa4ba: `hba/supabase.py` now turns constraint violations into plain-language messages.
- `board@hba.test` and `pending@hba.test` did not exist in the local Supabase although `test-accounts.txt` listed them;
  the seed step now creates them through the app's own sign-up and approval.

### By design (reported as warnings, not failures)

Advisories need an official mass.gov or wareham.ma.us link; minutes cannot be dated in the future; a household already
marked paid outside the receipt ledger cannot get a second credit; only the administrator may change a scheduling
office linked to an account; resident-made issues, draft bids and draft volunteer tasks are not shown to other
residents.

## Summary by role

| Role | pass | fail | warn | skip | info |
|---|---|---|---|---|---|
| admin | 104 | 0 | 6 | 1 | 72 |
| board | 94 | 0 | 6 | 1 | 71 |
| resident | 67 | 0 | 1 | 1 | 77 |
| board-as-resident | 42 | 0 | 0 | 0 | 0 |
| pending | 3 | 0 | 0 | 0 | 0 |
| resident @375px | 11 | 0 | 1 | 1 | 8 |
| admin @375px | 48 | 0 | 0 | 0 | 0 |

## Tools opened, per role

Each cell: did the tool open without script errors or unexpected failed requests.

| Tool | admin | board | resident | board-as-resident | pending | resident @375px | admin @375px |
|---|---|---|---|---|---|---|---|
| bulletin | pass | pass | pass | pass | – | – | pass |
| team | pass | pass | pass | pass | – | – | pass |
| members | pass | pass | – | – | – | – | pass |
| payments | pass | pass | pass | pass | – | pass | pass |
| summer | pass | pass | pass | pass | – | pass | pass |
| issues | pass | pass | pass | pass | – | pass | pass |
| planner | pass | pass | pass | pass | – | – | pass |
| duesbuy | pass | pass | pass | pass | – | – | pass |
| newsletter | pass | pass | pass | pass | – | – | pass |
| poll | pass | pass | pass | pass | – | – | pass |
| hosting | pass | pass | pass | pass | – | – | pass |
| volunteers | pass | pass | pass | pass | – | pass | pass |
| events | pass | pass | pass | pass | – | – | pass |
| message | pass | pass | pass | pass | – | pass | pass |
| votes | pass | pass | pass | pass | – | pass | pass |
| elections | pass | pass | pass | pass | – | – | pass |
| meetings | pass | pass | pass | pass | – | – | pass |
| governance | pass | pass | pass | pass | – | – | pass |
| documents | pass | pass | pass | pass | – | – | pass |
| research | pass | pass | pass | pass | – | – | pass |
| trash | pass | pass | pass | pass | – | – | pass |
| townrules | pass | pass | pass | pass | – | – | pass |
| town | pass | pass | pass | pass | – | – | pass |
| bids | pass | pass | pass | pass | – | – | pass |
| island-timeline | pass | pass | pass | pass | – | – | pass |
| storms | pass | pass | pass | pass | – | – | pass |
| postcards | pass | pass | pass | pass | – | – | pass |
| permits | pass | pass | pass | pass | – | – | pass |
| jetties | pass | pass | pass | pass | – | – | pass |
| guide | pass | pass | pass | pass | – | – | pass |
| properties | pass | pass | pass | pass | – | – | pass |
| households | pass | pass | pass | pass | – | – | pass |
| roads | pass | pass | pass | pass | – | – | pass |
| gaps | pass | pass | pass | pass | – | – | pass |
| sand | pass | pass | pass | pass | – | – | pass |
| practice | pass | pass | pass | pass | – | – | pass |
| account | pass | pass | pass | pass | – | – | pass |
| sms | pass | pass | pass | pass | – | – | pass |
| password | pass | pass | pass | pass | – | – | pass |
| calendar | pass | pass | pass | pass | – | pass | pass |
| dues | pass | pass | – | – | – | – | pass |
| finance | pass | pass | – | – | – | – | pass |
| bank | pass | pass | – | – | – | – | pass |
| work | pass | pass | – | – | – | – | pass |
| budget | pass | pass | – | – | – | – | pass |
| reports | pass | – | – | – | – | – | pass |
| appmap | pass | pass | – | – | – | – | pass |
| archive:overview | pass | pass | pass | – | – | – | – |
| archive:newsletter | pass | pass | pass | – | – | – | – |
| archive:sms | pass | pass | pass | – | – | – | – |
| archive:volunteers | pass | pass | pass | – | – | – | – |
| archive:bank | pass | pass | pass | – | – | – | – |
| archive:research | pass | pass | pass | – | – | – | – |
| archive:payments | pass | pass | pass | – | – | – | – |
| archive:meetings | pass | pass | pass | – | – | – | – |
| archive:minutes | pass | pass | pass | – | – | – | – |
| archive:votes | pass | pass | pass | – | – | – | – |
| archive:elections | pass | pass | pass | – | – | – | – |
| archive:governance | pass | pass | pass | – | – | – | – |
| archive:documents | pass | pass | pass | – | – | – | – |
| archive:calendar | pass | pass | pass | – | – | – | – |
| archive:events | pass | pass | pass | – | – | – | – |
| archive:households | pass | pass | pass | – | – | – | – |
| archive:issues | pass | pass | pass | – | – | – | – |
| archive:bids | pass | pass | pass | – | – | – | – |
| archive:finance | pass | pass | – | – | – | – | – |
| archive:work | pass | pass | – | – | – | – | – |
| archive:members | pass | pass | – | – | – | – | – |

## Forms

| Role | Tool | Form | Result | Detail |
|---|---|---|---|---|
| admin | members | Save new password (current_password,new_password,repeat_pas) | skip | password form: would change the test account's password |
| board | members | Save new password (current_password,new_password,repeat_pas) | skip | password form: would change the test account's password |
| resident | team | Send to the board inbox (to_position,subject,body) | pass | saved and shown · POST /api/team/messages |
| admin | members | Save (recipient_name,recipient_identifier,enab) | pass | saved and shown · PUT /api/payment-settings |
| board | members | Save (fund,payment_method,amount,payment_year,) | info | no request sent (client-side form) · Select Community events when linking a specific event. |
| admin | members | Save (role,household_uid) | pass | saved; Account permissions saved. · PUT /api/members/7271b8a6-4671-440c-ade6-0c30f42e8687 |
| board | members | Save (role,household_uid) | pass | saved; Account permissions saved. · PUT /api/members/7271b8a6-4671-440c-ade6-0c30f42e8687 |
| admin | members | Save (household_uid,note) | warn | refused by a rule: POST /api/member-households → 400: {"detail":"That property is already linked to this account."} |
| board | members | Save (household_uid,note) | warn | refused by a rule: POST /api/member-households → 400: {"detail":"That property is already linked to this account."} |
| resident | payments | Save new password (current_password,new_password,repeat_pas) | skip | password form: would change the test account's password |
| resident | payments | Save (fund,payment_method,amount,payment_year,) | info | no request sent (client-side form) · Select Community events when linking a specific event. |
| admin | payments | Save (state,board_note) | pass | saved and shown · PUT /api/payment-reports/50bcefe8-dbdb-4fcd-ae97-6e3ddd4511ed |
| board | payments | Save (state,board_note) | pass | saved and shown · PUT /api/payment-reports/50bcefe8-dbdb-4fcd-ae97-6e3ddd4511ed |
| resident | issues | Submit to board (title,category,location,description,file) | pass | saved; Issue submitted for next-meeting review. Receipt: 2acf7ae2-7de7-4683-bacc-ffd98c72e446 · POST /api/issues, POST /api/photos |
| admin | payments | Save (category,location,status,source_url,note) | warn | saved; Source-checked advisory posted with an expiry time. · POST /api/advisories |
| board | payments | Save (category,location,status,source_url,note) | warn | saved; Source-checked advisory posted with an expiry time. · POST /api/advisories |
| admin | summer | Save for everyone (summer-editor) | pass | saved and shown · PUT /api/content/summer-events |
| resident | volunteers | Save email preference () | pass | saved; Volunteer email opt-out saved. · PUT /api/volunteer-email-preferences |
| resident | events | Upload photos (file,caption,credit,consent) | pass | saved and shown · POST /api/photos |
| board | issues | Submit to board (title,category,location,description,file) | pass | saved and shown · POST /api/issues, POST /api/photos |
| admin | issues | Submit to board (title,category,location,description,file) | pass | saved and shown · POST /api/issues, POST /api/photos |
| resident @375px | payments | Save new password (current_password,new_password,repeat_pas) | skip | password form: would change the test account's password |
| resident @375px | payments | Save (fund,payment_method,amount,payment_year,) | info | no request sent (client-side form) · Select Community events when linking a specific event. |
| resident @375px | issues | Submit to board (title,category,location,description,file) | pass | saved; Issue submitted for next-meeting review. Receipt: 442d6c65-c163-47d1-a3af-596e1e1b2683 · POST /api/issues, POST /api/photos |
| board | issues | Upload photos (file,caption,credit,consent) | pass | saved and shown · POST /api/photos |
| admin | issues | Upload photos (file,caption,credit,consent) | pass | saved and shown · POST /api/photos |
| resident @375px | volunteers | Save email preference () | pass | saved; Volunteer email opt-in saved. · PUT /api/volunteer-email-preferences |
| resident @375px | message | Send to the board inbox (to_position,subject,body) | warn | saved; the new text is not shown afterwards · POST /api/team/messages |
| board | team | Send to the board inbox (to_position,subject,body) | pass | saved and shown · POST /api/team/messages |
| board | team | Save (member_name,contact_phone,contact_email,) | pass | saved and shown · PUT /api/officeholders/2883a1c1-9ee4-4445-90d2-fe8e758d6482 |
| admin | team | Send to the board inbox (to_position,subject,body) | pass | saved and shown · POST /api/team/messages |
| resident | research | Search our documents (research-form) | warn | saved; Records refreshed. · POST /api/research |
| admin | team | Save (member_name,contact_phone,contact_email,) | pass | saved and shown · PUT /api/officeholders/1c1b522c-c258-4424-91bb-aed1cbd50ff6 |
| board | team | Save note (board_note) | pass | saved and shown · PUT /api/team/messages/4a637918-1569-4add-8ce9-6085c9f150eb |
| admin | team | Save note (board_note) | pass | saved and shown · PUT /api/team/messages/4a637918-1569-4add-8ce9-6085c9f150eb |
| resident | bids | Save (contractor,contact,amount,tax_basis,scop) | pass | saved and shown · POST /api/bids |
| resident | bids | Save (file,caption) | pass | saved and shown · POST /api/bids/7387fb7c-53d0-4699-b90a-d105d875908d/files |
| board | households | Submit memory (title,history_year,story) | pass | saved and shown · POST /api/house-history |
| admin | households | Submit memory (title,history_year,story) | pass | saved and shown · POST /api/house-history |
| board | volunteers | Save private draft (title,category,description,location,task) | pass | saved and shown · POST /api/volunteers |
| admin | volunteers | Save private draft (title,category,description,location,task) | pass | saved and shown · POST /api/volunteers |
| board | volunteers | Save email preference () | pass | saved; Volunteer email opt-out saved. · PUT /api/volunteer-email-preferences |
| admin | volunteers | Save email preference () | pass | saved; Volunteer email opt-in saved. · PUT /api/volunteer-email-preferences |
| board | volunteers | Attach task photo (file) | pass | saved; Photo added to the task draft; location metadata removed. · POST /api/volunteers/80528e7d-dc72-4ae2-85cb-e434c9651800/photo |
| admin | volunteers | Attach task photo (file) | pass | saved; Photo added to the task draft; location metadata removed. · POST /api/volunteers/80528e7d-dc72-4ae2-85cb-e434c9651800/photo |
| board | events | Next: add the date (title,description) | warn | saved and shown · POST /api/series |
| admin | events | Next: add the date (title,description) | warn | saved and shown · POST /api/series |
| board | events | Save (series_id,supper_year,title,event_date,r) | pass | saved and shown · PUT /api/events/c87cae2e-ee9d-4923-8f92-aa981c9a0a4b |
| admin | events | Save (series_id,supper_year,title,event_date,r) | pass | saved and shown · PUT /api/events/c87cae2e-ee9d-4923-8f92-aa981c9a0a4b |
| board | votes | Save as draft (decision,meeting_id,amount,emergency,str) | warn | saved; the new text is not shown afterwards · POST /api/votes/classify |
| admin | votes | Save as draft (decision,meeting_id,amount,emergency,str) | warn | saved; the new text is not shown afterwards · POST /api/votes/classify |
| admin | votes | Save (document_id,version_label,adopted_on,onl) | pass | saved; Procedures and settings saved. · PUT /api/voting-procedures, PUT /api/settings/public_facebook_group_note, PUT /api/settings/public_local_sands_note |
| board | meetings | Save (title,meeting_date,meeting_time,duration) | pass | saved and shown · POST /api/meetings |
| board | meetings | Save (meeting_id,title,description,state,audie) | pass | saved and shown · POST /api/agenda |
| admin | meetings | Save (title,meeting_date,meeting_time,duration) | pass | saved and shown · POST /api/meetings |
| admin | meetings | Save (meeting_id,title,description,state,audie) | pass | saved and shown · POST /api/agenda |
| board | meetings | Save (zoom_url,reminder_hours) | pass | saved; Zoom link and reminder preference saved. Delivery remains inactive. · PUT /api/meetings/5ed54c8c-2cd2-4b45-9f8d-06b921b74b24/access |
| admin | meetings | Save (zoom_url,reminder_hours) | pass | saved; Zoom link and reminder preference saved. Delivery remains inactive. · PUT /api/meetings/67ada456-acf5-432b-9be6-1f7eae004c4e/access |
| board | governance | Save (member_name,household_uid,term_start,ter) | warn | refused by a rule: PUT /api/officeholders/1c1b522c-c258-4424-91bb-aed1cbd50ff6 → 400: {"detail":"Administrator required to change a linked scheduling office"} |
| admin | governance | Save (member_name,household_uid,term_start,ter) | pass | saved and shown · PUT /api/officeholders/1c1b522c-c258-4424-91bb-aed1cbd50ff6 |
| resident | households | Submit memory (title,history_year,story) | pass | saved and shown · POST /api/house-history |
| board | governance | Save (title,meeting_date,decision_type,motion,) | pass | saved and shown · POST /api/decisions |
| admin | governance | Save (title,meeting_date,decision_type,motion,) | pass | saved and shown · POST /api/decisions |
| board | documents | Upload & prepare suggestions (title,category,document_year,description) | pass | saved and shown · POST /api/documents |
| board | documents | Save (privacy) | pass | saved; Document visibility updated. · PUT /api/documents/a5218961-a835-4703-933b-c30d51acea36/visibility |
| admin | documents | Upload & prepare suggestions (title,category,document_year,description) | pass | saved and shown · POST /api/documents |
| admin | documents | Save (privacy) | pass | saved; Document visibility updated. · PUT /api/documents/b91d397c-2e6d-41b9-97ef-b5c7a6d12fc5/visibility |
| resident | practice | Preview a practice submission (practice-issue) | info | no request sent (client-side form) · PRACTICE ONLY. Fictional examples, not HBA records. Nothing here is uploaded, saved, billed, emailed or published. Switching to the board example does |
| board | research | Search our documents (research-form) | warn | saved; Records refreshed. · POST /api/research |
| admin | research | Search our documents (research-form) | warn | saved; Records refreshed. · POST /api/research |
| board | bids | Save (title,work_id,scope,location,deadline,st) | pass | saved and shown · POST /api/bid-requests |
| board | bids | Save (contractor,contact,amount,tax_basis,scop) | pass | saved and shown · POST /api/bids |
| board | bids | Save (title,contractor,location,work_date,desc) | pass | saved and shown · POST /api/work |
| board | bids | Save (state,note) | pass | saved; Review recorded. No contract, payment or budget entry was created. · POST /api/bids/e0762f3a-a237-4136-8413-4e7a6d71a99e/review |
| resident | sms | Save signup & consent (phone,topics,topics,topics,topics,topics) | info | no request sent (client-side form) · Select at least one topic. |
| board | bids | Save (file,caption) | pass | saved and shown · POST /api/bids/e0762f3a-a237-4136-8413-4e7a6d71a99e/files |
| admin | bids | Save (title,work_id,scope,location,deadline,st) | pass | saved and shown · POST /api/bid-requests |
| admin | bids | Save (contractor,contact,amount,tax_basis,scop) | pass | saved and shown · POST /api/bids |
| admin | bids | Save (title,contractor,location,work_date,desc) | pass | saved and shown · POST /api/work |
| admin | bids | Save (state,note) | pass | saved; Review recorded. No contract, payment or budget entry was created. · POST /api/bids/2ca12c25-9f91-4bd7-a3ad-1f3d397c83f0/review |
| admin | bids | Save (file,caption) | pass | saved and shown · POST /api/bids/2ca12c25-9f91-4bd7-a3ad-1f3d397c83f0/files |
| board | dues | Update affordability timeline (tl-form) | info | no request sent (client-side form) · 0 of 5 selected projects funded within 2027–2066. Ending project capital: $38. \| Uses the scenario currently displayed below. \| Loading budget simulat |
| admin | dues | Update affordability timeline (tl-form) | info | no request sent (client-side form) · 0 of 5 selected projects funded within 2027–2066. Ending project capital: $38. \| Uses the scenario currently displayed below. \| Loading budget simulat |
| admin | finance | Save transaction (transaction_date,direction,category_code) | pass | saved and shown · POST /api/register |
| admin | finance | Save budget line (category_code,amount,basis,source_note) | pass | saved; Records refreshed. \| Updated 10/27/2026, 2:01:04 PM Eastern. Refreshes every 30 seconds while this view is open. · PUT /api/category-budgets/2026 |
| admin | finance | Confirm household credit (payer_id,household_uid,dues_year,amount,) | warn | refused by a rule: POST /api/dues-receipts → 400: {"detail":"This household was already marked paid outside the receipt ledger. Reconcile the older record before adding a new credit; do not count the same check |
| board | work | Save (flag,note) | pass | saved and shown · POST /api/work/44346e96-abd6-45b6-beaa-ed7ecddf51b2/notes |
| admin | bank | Save account reference (label,last_four) | pass | saved and shown · POST /api/bank/accounts |
| admin | bank | Import for review (period_start,period_end,statement_closin) | info | no request sent (client-side form) · Missing CSV column: posted_date |
| admin | bank | Publish member summary (period_end,statement,confirm) | pass | saved and shown · POST /api/bank/summaries |
| admin | work | Save (flag,note) | pass | saved and shown · POST /api/work/64e4b3c9-4f5c-4ea9-860a-3d12773a0595/notes |
| board | practice | Preview a practice submission (practice-issue) | info | no request sent (client-side form) · PRACTICE ONLY. Fictional examples, not HBA records. Nothing here is uploaded, saved, billed, emailed or published. Switching to the board example does |
| admin | practice | Preview a practice submission (practice-issue) | info | no request sent (client-side form) · PRACTICE ONLY. Fictional examples, not HBA records. Nothing here is uploaded, saved, billed, emailed or published. Switching to the board example does |
| board | sms | Save signup & consent (phone,topics,topics,topics,topics,topics) | info | no request sent (client-side form) · Select at least one topic. |
| board | sms | Save draft only (category,message) | pass | saved and shown · POST /api/sms/drafts |
| admin | sms | Save signup & consent (phone,topics,topics,topics,topics,topics) | info | no request sent (client-side form) · Select at least one topic. |
| admin | sms | Save draft only (category,message) | pass | saved and shown · POST /api/sms/drafts |
| admin | archive:newsletter | Save draft (title,issue_date,issue_precision,body) | pass | saved and shown · POST /api/newsletters |
| admin | archive:meetings | Save draft (meeting_id,title,meeting_date,meeting_ti) | pass | saved; Minutes draft saved. Not yet visible to residents. · POST /api/minutes |

## Flows and access checks

| Role | Check | Result | Detail |
|---|---|---|---|
| board-as-resident | sign-in: sign in and dashboard loads | pass |  |
| board | sign-in: sign in and dashboard loads | pass |  |
| admin | sign-in: sign in and dashboard loads | pass |  |
| resident | sign-in: sign in and dashboard loads | pass |  |
| resident | dashboard: board-only tools hidden from residents | pass |  |
| board-as-resident | view switch: Resident view hides board tools in the member app | pass | portal bar: Resident view preview |
| board-as-resident | view switch: Board view brings the board tools back | pass | appmap, bank, budget, dues, finance, members, work |
| board | slow connection: dashboard shows the board account when its script loads late | pass |  |
| pending | sign-in: pending account sees the waiting page | pass | Photograph · Hamilton Beach after a shower, shared by a resident  Hamilton Beach Association  Welcome back.  Sign in to view the map, island history and associa |
| pending | access: pending account cannot read the archive API | pass | HTTP 403 |
| pending | access: opening /app/ directly shows no member data | pass | blocked |
| resident @375px | sign-in: sign in and dashboard loads | pass |  |
| resident @375px | dashboard: board-only tools hidden from residents | pass |  |
| admin @375px | sign-in: sign in and dashboard loads | pass |  |
| resident | sign-in: sign in and dashboard loads | pass |  |
| resident | archive:newsletter: 0 of 1 board-made item(s) visible to a resident | info | none visible (expected for board-only records; check drafts) |
| resident | bank: 2 item(s) made by the board | info | tool is board-only |
| resident | bids: 0 of 8 board-made item(s) visible to a resident | info | none visible (expected for board-only records; check drafts) |
| resident | documents: 2 of 2 board-made item(s) visible to a resident | info | visible: E2E 10271348 boa documents 23, E2E 10271348 adm documents 25 |
| resident | events: 3 of 4 board-made item(s) visible to a resident | info | visible: E2E 10271348 boa events 15, E2E 10271348 adm events 16, E2E 10271348 adm events 17 |
| resident | finance: 1 item(s) made by the board | info | tool is board-only |
| resident | governance: 1 of 3 board-made item(s) visible to a resident | info | visible: E2E 10271348 adm governance 23 |
| resident | households: 0 of 2 board-made item(s) visible to a resident | info | none visible (expected for board-only records; check drafts) |
| resident | issues: 0 of 4 board-made item(s) visible to a resident | info | none visible (expected for board-only records; check drafts) |
| resident | meetings: 2 of 4 board-made item(s) visible to a resident | info | visible: E2E 10271348 boa meetings 18, E2E 10271348 adm meetings 20 |
| resident | members: 1 item(s) made by the board | info | tool is board-only |
| resident | payments: 1 of 2 board-made item(s) visible to a resident | info | visible: E2E 10271348 boa payments 4 |
| resident | sms: 0 of 2 board-made item(s) visible to a resident | info | none visible (expected for board-only records; check drafts) |
| resident | summer: 1 of 1 board-made item(s) visible to a resident | info | visible: E2E 10271348 adm summer 6 |
| resident | team: 1 of 6 board-made item(s) visible to a resident | info | visible: E2E 10271348 boa team 9 |
| resident | volunteers: 0 of 2 board-made item(s) visible to a resident | info | none visible (expected for board-only records; check drafts) |
| resident | work: 2 item(s) made by the board | info | tool is board-only |

## Failures (0)


## Controls clicked inside tools

3442 clicks across 199 tool visits. Skipped by design: delete/remove, approve/reject, sign out, password changes, sending texts, certifying votes, hiding tools, switching views (each has its own check above). Confirmation prompts were answered Cancel.

## Seed data (through the API)

| Step | Result | Detail |
|---|---|---|
| event series | skip | already seeded |
| events | skip | already seeded |
| meetings | skip | already seeded |
| agenda item | skip | already seeded |
| minutes (with PDF, approved) | skip | already seeded |
| newsletter (with PDF, published) | skip | already seeded |
| votes (advisory poll + capital motion) | skip | already seeded |
| volunteer task (published, resident signed up) | skip | already seeded |
| check register entries | skip | already seeded |
| dues statuses | skip | already seeded |
| payment report (resident) | skip | already seeded |
| bid request + bid | skip | already seeded |
| issue (resident) | skip | already seeded |
| contractor work + note | skip | already seeded |
| document upload | skip | already seeded |
| event photo (resident upload, board publishes) | skip | already seeded |
| household story (resident) | skip | already seeded |
| message to a governor (resident) | skip | already seeded |
| storm memory (resident) | skip | already seeded |
| officeholder | skip | already seeded |

## Link check

Internal: 2674 references — 181 resolve, 0 broken, 10 workstation paths in data files, 2483 record scans (shipped separately in hba-portal-record-scans.zip). 2 built at run time from templates were not checked statically (the walkthrough exercises them).

- data clean-up: `/home/user/workspace/hamilton_beach_map/audit/scans_4/17676_28_p1.jpg` (a workstation file path stored in data; not shown by the app) — in private-app/audit.json, private-app/property-history.json, private-app/road-wording.json
- data clean-up: `/home/user/workspace/hamilton_beach_map/audit/scans_4/17676_28_p2.jpg` (a workstation file path stored in data; not shown by the app) — in private-app/audit.json, private-app/property-history.json, private-app/road-wording.json
- data clean-up: `/home/user/workspace/hamilton_beach_map/audit/scans_4/18462_149_p1.jpg` (a workstation file path stored in data; not shown by the app) — in private-app/audit.json, private-app/property-history.json, private-app/road-wording.json
- data clean-up: `/home/user/workspace/hamilton_beach_map/audit/scans_4/26608_345_p1.jpg` (a workstation file path stored in data; not shown by the app) — in private-app/audit.json, private-app/property-history.json, private-app/road-wording.json
- data clean-up: `/home/user/workspace/hamilton_beach_map/audit/scans_4/29050_164_p1.jpg` (a workstation file path stored in data; not shown by the app) — in private-app/audit.json, private-app/property-history.json, private-app/road-wording.json
- data clean-up: `/home/user/workspace/hamilton_beach_map/audit/scans_4/29050_164_p2.jpg` (a workstation file path stored in data; not shown by the app) — in private-app/audit.json, private-app/property-history.json, private-app/road-wording.json
- data clean-up: `/home/user/workspace/hamilton_beach_map/audit/scans_4/4100_130_p1.jpg` (a workstation file path stored in data; not shown by the app) — in private-app/audit.json, private-app/property-history.json, private-app/road-wording.json
- data clean-up: `/home/user/workspace/hamilton_beach_map/audit/scans_4/4269_499_p1.jpg` (a workstation file path stored in data; not shown by the app) — in private-app/audit.json, private-app/property-history.json, private-app/road-wording.json
- data clean-up: `/home/user/workspace/hamilton_beach_map/audit/scans_4/53401_111_p1.jpg` (a workstation file path stored in data; not shown by the app) — in private-app/audit.json, private-app/property-history.json, private-app/road-wording.json
- data clean-up: `/home/user/workspace/hamilton_beach_map/audit/scans_4/53401_111_p2.jpg` (a workstation file path stored in data; not shown by the app) — in private-app/audit.json, private-app/property-history.json, private-app/road-wording.json

External: 421 links — 419 answer, 2 refuse automated checks (401/403/429), 0 fail.

- warn: https://onlinelibrary.wiley.com/doi/10.1002/esp.5784 (HTTP 403) — in private-app/sand-school/learn.html
- warn: https://onlinelibrary.wiley.com/doi/pdf/10.1002/esp.1527 (HTTP 403) — in private-app/sand-school/learn.html

Options: (none)
