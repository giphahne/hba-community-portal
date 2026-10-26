-- Hamilton Beach Association community portal — PostgreSQL / Supabase schema
-- Generated from the live project on 2026-10-25. Contains structure only: tables, constraints,
-- indexes, row-level-security policies, functions, triggers and the storage bucket. No resident data.
-- Run in the Supabase SQL editor (or psql) on a fresh project, in order, as the postgres role.

-- Functions below are listed alphabetically and some call functions defined later; skip body checks while
-- creating them (the same setting pg_dump writes). Bodies are still checked when they run.
set check_function_bodies = off;
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";


-- ===== Tables =====
create table public.hba_account_audit (
  id uuid not null default gen_random_uuid(),
  action text not null,
  actor_id uuid,
  actor_email text not null default ''::text,
  actor_name text not null default ''::text,
  target_id uuid,
  target_email text not null default ''::text,
  target_name text not null default ''::text,
  target_role text not null default ''::text,
  target_household text,
  note text not null default ''::text,
  created_at timestamptz not null default now(),
  constraint hba_account_audit_pkey PRIMARY KEY (id),
  constraint hba_account_audit_action_check CHECK ((action = ANY (ARRAY['delete_member'::text, 'delete_request'::text, 'reset_password'::text, 'change_password'::text])))
);
create table public.hba_agenda_items (
  id uuid not null default gen_random_uuid(),
  meeting_id uuid,
  title text not null,
  description text not null default ''::text,
  audience text not null default 'board'::text,
  state text not null default 'submitted'::text,
  sort_order integer not null default 10,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_agenda_items_pkey PRIMARY KEY (id),
  constraint hba_agenda_items_audience_check CHECK ((audience = ANY (ARRAY['board'::text, 'members'::text]))),
  constraint hba_agenda_items_description_check CHECK ((length(description) <= 12000)),
  constraint hba_agenda_items_sort_order_check CHECK (((sort_order >= 0) AND (sort_order <= 999))),
  constraint hba_agenda_items_state_check CHECK ((state = ANY (ARRAY['submitted'::text, 'included'::text, 'deferred'::text, 'addressed'::text]))),
  constraint hba_agenda_items_title_check CHECK (((length(title) >= 1) AND (length(title) <= 180)))
);
create table public.hba_ballot_choices (
  id uuid not null default gen_random_uuid(),
  vote_id uuid not null,
  choice text not null,
  weight integer not null default 1,
  constraint hba_ballot_choices_pkey PRIMARY KEY (id),
  constraint hba_ballot_choices_weight_check CHECK (((weight >= 1) AND (weight <= 20)))
);
create table public.hba_ballots (
  id uuid not null default gen_random_uuid(),
  vote_id uuid not null,
  unit_key text not null,
  cast_by uuid,
  source text not null,
  choice text,
  weight integer not null default 1,
  receipt_code text not null,
  recused boolean not null default false,
  recusal_reason text not null default ''::text,
  recorded_by uuid,
  cast_at timestamptz not null default now(),
  constraint hba_ballots_receipt_code_key UNIQUE (receipt_code),
  constraint hba_ballots_vote_id_unit_key_key UNIQUE (vote_id, unit_key),
  constraint hba_ballots_pkey PRIMARY KEY (id),
  constraint hba_ballots_recusal_reason_check CHECK ((length(recusal_reason) <= 500)),
  constraint hba_ballots_source_check CHECK ((source = ANY (ARRAY['online'::text, 'in_person'::text, 'proxy'::text]))),
  constraint hba_ballots_weight_check CHECK (((weight >= 1) AND (weight <= 20)))
);
create table public.hba_bank_accounts (
  id uuid not null default gen_random_uuid(),
  label text not null,
  last_four text not null default ''::text,
  currency text not null default 'USD'::text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_bank_accounts_pkey PRIMARY KEY (id),
  constraint hba_bank_accounts_currency_check CHECK ((currency = 'USD'::text)),
  constraint hba_bank_accounts_label_check CHECK (((length(label) >= 1) AND (length(label) <= 120))),
  constraint hba_bank_accounts_last_four_check CHECK ((last_four ~ '^([0-9]{4})?$'::text))
);
create table public.hba_bank_imports (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null,
  period_start date not null,
  period_end date not null,
  statement_closing numeric,
  books_closing numeric,
  source_note text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_bank_imports_pkey PRIMARY KEY (id),
  constraint hba_bank_imports_check CHECK ((period_end >= period_start)),
  constraint hba_bank_imports_source_note_check CHECK (((length(source_note) >= 1) AND (length(source_note) <= 1000)))
);
create table public.hba_bank_matches (
  id uuid not null default gen_random_uuid(),
  transaction_id uuid not null,
  register_id uuid not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_bank_matches_register_id_key UNIQUE (register_id),
  constraint hba_bank_matches_transaction_id_key UNIQUE (transaction_id),
  constraint hba_bank_matches_pkey PRIMARY KEY (id)
);
create table public.hba_bank_summaries (
  id uuid not null default gen_random_uuid(),
  period_end date not null,
  statement text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_bank_summaries_pkey PRIMARY KEY (id),
  constraint hba_bank_summaries_statement_check CHECK (((length(statement) >= 1) AND (length(statement) <= 3000)))
);
create table public.hba_bank_transactions (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null,
  import_id uuid not null,
  posted_date date not null,
  amount numeric not null,
  description text not null,
  reference text not null default ''::text,
  fingerprint text not null,
  created_by uuid not null default auth.uid(),
  payer_fingerprint text,
  constraint hba_bank_transactions_account_id_fingerprint_key UNIQUE (account_id, fingerprint),
  constraint hba_bank_transactions_pkey PRIMARY KEY (id),
  constraint hba_bank_transactions_amount_check CHECK ((amount <> (0)::numeric)),
  constraint hba_bank_transactions_description_check CHECK ((length(description) <= 300)),
  constraint hba_bank_transactions_fingerprint_check CHECK ((length(fingerprint) = 64)),
  constraint hba_bank_transactions_payer_fingerprint_check CHECK (((payer_fingerprint IS NULL) OR (payer_fingerprint ~ '^[0-9a-f]{64}$'::text))),
  constraint hba_bank_transactions_reference_check CHECK ((length(reference) <= 80))
);
create table public.hba_bid_files (
  id uuid not null default gen_random_uuid(),
  bid_id uuid not null,
  file_path text not null,
  original_name text not null,
  caption text not null default ''::text,
  sha256 text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_bid_files_file_path_key UNIQUE (file_path),
  constraint hba_bid_files_pkey PRIMARY KEY (id),
  constraint hba_bid_files_caption_check CHECK ((length(caption) <= 2000)),
  constraint hba_bid_files_original_name_check CHECK ((length(original_name) <= 250)),
  constraint hba_bid_files_sha256_check CHECK ((sha256 ~ '^[a-f0-9]{64}$'::text))
);
create table public.hba_bid_requests (
  id uuid not null default gen_random_uuid(),
  work_id uuid,
  title text not null,
  scope text not null,
  location text not null default ''::text,
  deadline date,
  state text not null default 'draft'::text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_bid_requests_pkey PRIMARY KEY (id),
  constraint hba_bid_requests_location_check CHECK ((length(location) <= 300)),
  constraint hba_bid_requests_scope_check CHECK (((length(TRIM(BOTH FROM scope)) >= 1) AND (length(TRIM(BOTH FROM scope)) <= 12000))),
  constraint hba_bid_requests_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text]))),
  constraint hba_bid_requests_title_check CHECK (((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 180)))
);
create table public.hba_bid_reviews (
  id uuid not null default gen_random_uuid(),
  bid_id uuid not null,
  previous_state text not null,
  new_state text not null,
  note text not null,
  reviewed_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_bid_reviews_pkey PRIMARY KEY (id),
  constraint hba_bid_reviews_note_check CHECK (((length(TRIM(BOTH FROM note)) >= 1) AND (length(TRIM(BOTH FROM note)) <= 12000)))
);
create table public.hba_bids (
  id uuid not null default gen_random_uuid(),
  request_id uuid not null,
  contractor text not null,
  contact text not null default ''::text,
  amount numeric not null,
  tax_basis text not null default 'unspecified'::text,
  scope text not null,
  exclusions text not null default ''::text,
  timing text not null default ''::text,
  valid_until date,
  state text not null default 'submitted'::text,
  revision integer not null default 1,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_bids_pkey PRIMARY KEY (id),
  constraint hba_bids_amount_check CHECK (((amount > (0)::numeric) AND (amount <= (10000000)::numeric))),
  constraint hba_bids_contact_check CHECK ((length(contact) <= 600)),
  constraint hba_bids_contractor_check CHECK (((length(TRIM(BOTH FROM contractor)) >= 1) AND (length(TRIM(BOTH FROM contractor)) <= 250))),
  constraint hba_bids_exclusions_check CHECK ((length(exclusions) <= 12000)),
  constraint hba_bids_scope_check CHECK (((length(TRIM(BOTH FROM scope)) >= 1) AND (length(TRIM(BOTH FROM scope)) <= 12000))),
  constraint hba_bids_state_check CHECK ((state = ANY (ARRAY['submitted'::text, 'reviewing'::text, 'clarification'::text, 'shortlisted'::text, 'selected'::text, 'declined'::text, 'withdrawn'::text]))),
  constraint hba_bids_tax_basis_check CHECK ((tax_basis = ANY (ARRAY['included'::text, 'excluded'::text, 'unspecified'::text]))),
  constraint hba_bids_timing_check CHECK ((length(timing) <= 2000))
);
create table public.hba_category_budgets (
  year integer not null,
  category_code text not null,
  amount numeric not null,
  basis text not null,
  source_note text not null default ''::text,
  updated_at timestamptz not null default now(),
  constraint hba_category_budgets_pkey PRIMARY KEY (year, category_code),
  constraint hba_category_budgets_amount_check CHECK ((amount >= (0)::numeric)),
  constraint hba_category_budgets_basis_check CHECK ((basis = ANY (ARRAY['draft'::text, 'adopted'::text]))),
  constraint hba_category_budgets_source_note_check CHECK ((length(source_note) <= 2000)),
  constraint hba_category_budgets_year_check CHECK (((year >= 2020) AND (year <= 2100)))
);
create table public.hba_check_register (
  id uuid not null default gen_random_uuid(),
  transaction_date date not null,
  direction text not null,
  category_code text not null,
  payee text not null,
  amount numeric not null,
  reference text not null default ''::text,
  memo text not null default ''::text,
  cleared boolean not null default false,
  voided boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  bank_account_id uuid,
  constraint hba_check_register_pkey PRIMARY KEY (id),
  constraint hba_check_register_amount_check CHECK ((amount > (0)::numeric)),
  constraint hba_check_register_direction_check CHECK ((direction = ANY (ARRAY['income'::text, 'expense'::text]))),
  constraint hba_check_register_memo_check CHECK ((length(memo) <= 3000)),
  constraint hba_check_register_payee_check CHECK (((length(payee) >= 1) AND (length(payee) <= 180))),
  constraint hba_check_register_reference_check CHECK ((length(reference) <= 80))
);
create table public.hba_cleaning_plan (
  id integer not null,
  amount_per_cleaning numeric not null,
  cleanings_per_year integer not null,
  first_year integer not null,
  seasons integer not null,
  status text not null,
  source_note text not null,
  constraint hba_cleaning_plan_pkey PRIMARY KEY (id),
  constraint hba_cleaning_plan_id_check CHECK ((id = 1))
);
create table public.hba_decisions (
  id uuid not null default gen_random_uuid(),
  title text not null,
  meeting_date date not null,
  decision_type text not null,
  motion text not null,
  recorded_outcome text not null,
  amount numeric,
  governors_present integer,
  members_represented integer,
  votes_yes integer,
  votes_no integer,
  abstentions integer,
  review_notes text not null default ''::text,
  minutes_id uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_decisions_pkey PRIMARY KEY (id),
  constraint hba_decisions_abstentions_check CHECK ((abstentions >= 0)),
  constraint hba_decisions_amount_check CHECK ((amount >= (0)::numeric)),
  constraint hba_decisions_decision_type_check CHECK ((decision_type = ANY (ARRAY['board'::text, 'capital'::text, 'dues'::text, 'amendment'::text, 'emergency'::text]))),
  constraint hba_decisions_governors_present_check CHECK (((governors_present >= 0) AND (governors_present <= 10))),
  constraint hba_decisions_members_represented_check CHECK ((members_represented >= 0)),
  constraint hba_decisions_motion_check CHECK (((length(motion) >= 1) AND (length(motion) <= 12000))),
  constraint hba_decisions_recorded_outcome_check CHECK ((recorded_outcome = ANY (ARRAY['proposed'::text, 'approved'::text, 'rejected'::text, 'deferred'::text]))),
  constraint hba_decisions_title_check CHECK (((length(title) >= 1) AND (length(title) <= 180))),
  constraint hba_decisions_votes_no_check CHECK ((votes_no >= 0)),
  constraint hba_decisions_votes_yes_check CHECK ((votes_yes >= 0))
);
create table public.hba_document_facts (
  id uuid not null default gen_random_uuid(),
  document_id uuid not null,
  kind text not null,
  title text not null,
  detail text not null,
  fact_date date,
  fact_year integer,
  location text not null default ''::text,
  evidence_page integer not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_document_facts_pkey PRIMARY KEY (id),
  constraint hba_document_facts_detail_check CHECK (((length(detail) >= 1) AND (length(detail) <= 12000))),
  constraint hba_document_facts_fact_year_check CHECK (((fact_year >= 1600) AND (fact_year <= 2200))),
  constraint hba_document_facts_kind_check CHECK ((kind = ANY (ARRAY['history'::text, 'governing'::text, 'permit'::text]))),
  constraint hba_document_facts_title_check CHECK (((length(title) >= 1) AND (length(title) <= 180)))
);
create table public.hba_document_intakes (
  document_id uuid not null,
  state text not null default 'queued'::text,
  summary text not null default ''::text,
  limitations jsonb not null default '[]'::jsonb,
  pages jsonb not null default '[]'::jsonb,
  model text not null default ''::text,
  file_sha256 text not null,
  attempt_count integer not null default 0,
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  constraint hba_document_intakes_pkey PRIMARY KEY (document_id),
  constraint hba_document_intakes_state_check CHECK ((state = ANY (ARRAY['queued'::text, 'processing'::text, 'ready'::text, 'needs_attention'::text, 'failed'::text])))
);
create table public.hba_document_suggestions (
  id uuid not null default gen_random_uuid(),
  document_id uuid not null,
  item_key text not null,
  kind text not null,
  payload jsonb not null,
  evidence_page integer not null,
  evidence_quote text not null,
  confidence text not null,
  state text not null default 'pending'::text,
  target_table text,
  target_key text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_payload jsonb,
  created_at timestamptz not null default now(),
  constraint hba_document_suggestions_document_id_item_key_key UNIQUE (document_id, item_key),
  constraint hba_document_suggestions_pkey PRIMARY KEY (id),
  constraint hba_document_suggestions_confidence_check CHECK ((confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))),
  constraint hba_document_suggestions_evidence_page_check CHECK ((evidence_page > 0)),
  constraint hba_document_suggestions_evidence_quote_check CHECK (((length(evidence_quote) >= 5) AND (length(evidence_quote) <= 2500))),
  constraint hba_document_suggestions_kind_check CHECK ((kind = ANY (ARRAY['event'::text, 'budget'::text, 'agenda'::text, 'decision'::text, 'work'::text, 'house_history'::text, 'history'::text, 'governing'::text, 'permit'::text]))),
  constraint hba_document_suggestions_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'applied'::text, 'dismissed'::text])))
);
create table public.hba_documents (
  id uuid not null default gen_random_uuid(),
  title text not null,
  category text not null,
  document_year integer,
  description text not null default ''::text,
  file_path text not null,
  original_name text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  original_path text,
  source_sha256 text,
  source_date date,
  audience text not null default 'board'::text,
  constraint hba_documents_file_path_key UNIQUE (file_path),
  constraint hba_documents_original_path_key UNIQUE (original_path),
  constraint hba_documents_pkey PRIMARY KEY (id),
  constraint hba_documents_audience_check CHECK ((audience = ANY (ARRAY['board'::text, 'members'::text]))),
  constraint hba_documents_category_check CHECK ((category = ANY (ARRAY['budget'::text, 'minutes'::text, 'governing'::text, 'history'::text, 'permit'::text, 'contract'::text, 'other'::text]))),
  constraint hba_documents_document_year_check CHECK (((document_year >= 1800) AND (document_year <= 2200))),
  constraint hba_documents_title_check CHECK (((length(title) >= 1) AND (length(title) <= 180)))
);
create table public.hba_dues (
  year integer not null,
  uid text not null,
  status text not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid(),
  constraint hba_dues_pkey PRIMARY KEY (year, uid),
  constraint hba_dues_status_check CHECK ((status = ANY (ARRAY['unknown'::text, 'paid'::text, 'unpaid'::text]))),
  constraint hba_dues_year_check CHECK (((year >= 2020) AND (year <= 2100)))
);
create table public.hba_dues_audit (
  id bigint generated always as identity not null,
  year integer not null,
  uid text not null,
  old_status text,
  new_status text not null,
  changed_by uuid not null default auth.uid(),
  changed_at timestamptz not null default now(),
  constraint hba_dues_audit_pkey PRIMARY KEY (id)
);
create table public.hba_dues_households (
  uid text not null,
  address text not null,
  constraint hba_dues_households_pkey PRIMARY KEY (uid)
);
create table public.hba_dues_receipts (
  id uuid not null default gen_random_uuid(),
  register_id uuid not null,
  household_uid text not null,
  dues_year integer not null,
  amount numeric not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_dues_receipts_register_id_household_uid_dues_year_key UNIQUE (register_id, household_uid, dues_year),
  constraint hba_dues_receipts_pkey PRIMARY KEY (id),
  constraint hba_dues_receipts_amount_check CHECK ((amount > (0)::numeric)),
  constraint hba_dues_receipts_dues_year_check CHECK (((dues_year >= 2020) AND (dues_year <= 2100)))
);
create table public.hba_dues_targets (
  uid text not null,
  year integer not null,
  annual_due numeric not null,
  source_note text not null default 'Verified during receipt attribution'::text,
  constraint hba_dues_targets_pkey PRIMARY KEY (uid, year),
  constraint hba_dues_targets_annual_due_check CHECK ((annual_due > (0)::numeric)),
  constraint hba_dues_targets_source_note_check CHECK (((length(source_note) >= 1) AND (length(source_note) <= 1000))),
  constraint hba_dues_targets_year_check CHECK (((year >= 2020) AND (year <= 2100)))
);
create table public.hba_election_audit (
  id uuid not null default gen_random_uuid(),
  year integer not null,
  before_record jsonb,
  after_record jsonb,
  changed_by uuid not null default auth.uid(),
  changed_at timestamptz not null default now(),
  constraint hba_election_audit_pkey PRIMARY KEY (id)
);
create table public.hba_elections (
  year integer not null,
  meeting_id uuid,
  nomination_deadline date,
  state text not null default 'planning'::text,
  notice text not null default ''::text,
  positions text not null default ''::text,
  nomination_instructions text not null default ''::text,
  results text not null default ''::text,
  source_note text not null default ''::text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint hba_elections_pkey PRIMARY KEY (year),
  constraint hba_elections_state_check CHECK ((state = ANY (ARRAY['planning'::text, 'nominations_open'::text, 'meeting_scheduled'::text, 'results_recorded'::text]))),
  constraint hba_elections_year_check CHECK (((year >= 2027) AND (year <= 2200) AND (((year - 2027) % 2) = 0)))
);
create table public.hba_event_host_offers (
  id uuid not null default gen_random_uuid(),
  event_id uuid,
  series_title text not null default 'Movie Night'::text,
  member_id uuid not null default auth.uid(),
  proposed_date date not null,
  proposed_time time without time zone not null,
  location text not null default ''::text,
  note text not null default ''::text,
  movie_choices jsonb not null default '[]'::jsonb,
  state text not null default 'pending'::text,
  board_note text not null default ''::text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint hba_event_host_offers_pkey PRIMARY KEY (id),
  constraint hba_event_host_offers_board_note_check CHECK ((length(board_note) <= 1000)),
  constraint hba_event_host_offers_location_check CHECK ((length(location) <= 200)),
  constraint hba_event_host_offers_note_check CHECK ((length(note) <= 2000)),
  constraint hba_event_host_offers_series_title_check CHECK ((length(series_title) <= 120)),
  constraint hba_event_host_offers_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text, 'withdrawn'::text])))
);
create table public.hba_events (
  id uuid not null default gen_random_uuid(),
  series_id uuid not null,
  title text not null,
  event_date date not null,
  event_time time without time zone,
  location text not null default ''::text,
  description text not null default ''::text,
  state text not null default 'scheduled'::text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  rain_date date,
  use_rain_date boolean not null default false,
  planning_only boolean not null default false,
  annual_rule_year integer,
  constraint hba_events_pkey PRIMARY KEY (id),
  constraint hba_events_annual_rule_year_check CHECK (((annual_rule_year >= 1800) AND (annual_rule_year <= 2200))),
  constraint hba_events_state_check CHECK ((state = ANY (ARRAY['scheduled'::text, 'held'::text, 'cancelled'::text]))),
  constraint hba_events_title_check CHECK (((length(title) >= 1) AND (length(title) <= 180))),
  constraint rain_date_requires_later_date CHECK (((rain_date IS NULL) OR (rain_date > event_date))),
  constraint rain_switch_requires_date CHECK (((NOT use_rain_date) OR (rain_date IS NOT NULL)))
);
create table public.hba_finance_audit (
  id uuid not null default gen_random_uuid(),
  record_table text not null,
  record_key text not null,
  action text not null,
  before_record jsonb,
  after_record jsonb,
  changed_by uuid not null default auth.uid(),
  changed_at timestamptz not null default now(),
  constraint hba_finance_audit_pkey PRIMARY KEY (id)
);
create table public.hba_finance_categories (
  code text not null,
  label text not null,
  direction text not null,
  model_line text not null,
  constraint hba_finance_categories_pkey PRIMARY KEY (code),
  constraint hba_finance_categories_direction_check CHECK ((direction = ANY (ARRAY['income'::text, 'expense'::text])))
);
create table public.hba_governor_messages (
  id uuid not null default gen_random_uuid(),
  from_member_id uuid not null default auth.uid(),
  to_officeholder_id uuid,
  to_position text not null,
  subject text not null,
  body text not null,
  state text not null default 'new'::text,
  board_note text not null default ''::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hba_governor_messages_pkey PRIMARY KEY (id),
  constraint hba_governor_messages_body_check CHECK (((length(body) >= 1) AND (length(body) <= 6000))),
  constraint hba_governor_messages_state_check CHECK ((state = ANY (ARRAY['new'::text, 'read'::text, 'replied'::text]))),
  constraint hba_governor_messages_subject_check CHECK (((length(subject) >= 1) AND (length(subject) <= 180)))
);
create table public.hba_house_history (
  id uuid not null default gen_random_uuid(),
  household_uid text not null,
  title text not null,
  story text not null,
  history_year integer,
  status text not null default 'pending'::text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_house_history_pkey PRIMARY KEY (id),
  constraint hba_house_history_history_year_check CHECK (((history_year >= 1600) AND (history_year <= 2200))),
  constraint hba_house_history_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'published'::text]))),
  constraint hba_house_history_story_check CHECK (((length(story) >= 1) AND (length(story) <= 12000))),
  constraint hba_house_history_title_check CHECK (((length(title) >= 1) AND (length(title) <= 180)))
);
create table public.hba_issues (
  id uuid not null default gen_random_uuid(),
  title text not null,
  location text not null default ''::text,
  description text not null,
  category text not null default 'general'::text,
  state text not null default 'pending_meeting'::text,
  board_note text not null default ''::text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hba_issues_pkey PRIMARY KEY (id),
  constraint hba_issues_category_check CHECK ((category = ANY (ARRAY['roads'::text, 'drainage'::text, 'beach'::text, 'safety'::text, 'common_area'::text, 'general'::text]))),
  constraint hba_issues_description_check CHECK (((length(description) >= 1) AND (length(description) <= 12000))),
  constraint hba_issues_state_check CHECK ((state = ANY (ARRAY['pending_meeting'::text, 'approved'::text, 'rejected'::text, 'further_review'::text, 'complete'::text]))),
  constraint hba_issues_title_check CHECK (((length(title) >= 1) AND (length(title) <= 180)))
);
create table public.hba_meeting_access (
  id uuid not null,
  zoom_url text not null default ''::text,
  reminder_hours integer not null default 24,
  created_by uuid not null default auth.uid(),
  constraint hba_meeting_access_pkey PRIMARY KEY (id),
  constraint hba_meeting_access_reminder_hours_check CHECK ((reminder_hours = ANY (ARRAY[1, 2, 24, 48])))
);
create table public.hba_meeting_minutes (
  id uuid not null default gen_random_uuid(),
  meeting_id uuid,
  meeting_date date not null,
  meeting_time time without time zone,
  title text not null,
  location text not null default ''::text,
  called_to_order time without time zone,
  adjourned time without time zone,
  attendees text not null default ''::text,
  body text not null default ''::text,
  motions text not null default ''::text,
  action_items text not null default ''::text,
  state text not null default 'draft'::text,
  approved_on date,
  approved_note text not null default ''::text,
  file_path text,
  original_name text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hba_meeting_minutes_file_path_key UNIQUE (file_path),
  constraint hba_meeting_minutes_pkey PRIMARY KEY (id),
  constraint hba_meeting_minutes_action_items_check CHECK ((length(action_items) <= 20000)),
  constraint hba_meeting_minutes_approved_note_check CHECK ((length(approved_note) <= 400)),
  constraint hba_meeting_minutes_attendees_check CHECK ((length(attendees) <= 4000)),
  constraint hba_meeting_minutes_body_check CHECK ((length(body) <= 60000)),
  constraint hba_meeting_minutes_location_check CHECK ((length(location) <= 180)),
  constraint hba_meeting_minutes_motions_check CHECK ((length(motions) <= 20000)),
  constraint hba_meeting_minutes_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'approved'::text]))),
  constraint hba_meeting_minutes_title_check CHECK (((length(title) >= 1) AND (length(title) <= 180)))
);
create table public.hba_meetings (
  id uuid not null default gen_random_uuid(),
  title text not null,
  meeting_date date not null,
  meeting_time time without time zone not null,
  duration_minutes integer not null default 60,
  location text not null default ''::text,
  description text not null default ''::text,
  state text not null default 'scheduled'::text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  audience text not null default 'board'::text,
  constraint hba_meetings_pkey PRIMARY KEY (id),
  constraint hba_meetings_audience_check CHECK ((audience = ANY (ARRAY['board'::text, 'general'::text]))),
  constraint hba_meetings_duration_minutes_check CHECK (((duration_minutes >= 15) AND (duration_minutes <= 480))),
  constraint hba_meetings_state_check CHECK ((state = ANY (ARRAY['scheduled'::text, 'held'::text, 'cancelled'::text]))),
  constraint hba_meetings_title_check CHECK (((length(title) >= 1) AND (length(title) <= 180)))
);
create table public.hba_member_households (
  member_id uuid not null,
  household_uid text not null,
  note text not null default ''::text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_member_households_pkey PRIMARY KEY (member_id, household_uid),
  constraint hba_member_households_note_check CHECK ((length(note) <= 500))
);
create table public.hba_members (
  id uuid not null,
  email text not null,
  display_name text not null default ''::text,
  role text not null default 'pending'::text,
  household_uid text,
  created_at timestamptz not null default now(),
  requested_household_uid text,
  request_note text not null default ''::text,
  sms_request jsonb,
  requested_at timestamptz,
  must_change_password boolean not null default false,
  deleted_at timestamptz,
  constraint hba_members_pkey PRIMARY KEY (id),
  constraint hba_members_role_check CHECK ((role = ANY (ARRAY['pending'::text, 'resident'::text, 'board'::text, 'admin'::text, 'suspended'::text, 'deleted'::text])))
);
create table public.hba_message_reads (
  message_id uuid not null,
  member_id uuid not null default auth.uid(),
  read_at timestamptz not null default now(),
  constraint hba_message_reads_pkey PRIMARY KEY (message_id, member_id)
);
create table public.hba_messages (
  id uuid not null default gen_random_uuid(),
  member_id uuid,
  audience text not null default 'member'::text,
  from_member_id uuid default auth.uid(),
  kind text not null default 'notice'::text,
  subject text not null,
  body text not null default ''::text,
  tool text not null default ''::text,
  tool_arg text not null default ''::text,
  created_at timestamptz not null default now(),
  constraint hba_messages_pkey PRIMARY KEY (id),
  constraint hba_messages_audience_check CHECK ((audience = ANY (ARRAY['member'::text, 'residents'::text, 'board'::text]))),
  constraint hba_messages_body_check CHECK ((length(body) <= 4000)),
  constraint hba_messages_kind_check CHECK ((length(kind) <= 40)),
  constraint hba_messages_subject_check CHECK (((length(subject) >= 1) AND (length(subject) <= 200))),
  constraint hba_messages_tool_arg_check CHECK ((length(tool_arg) <= 120)),
  constraint hba_messages_tool_check CHECK ((length(tool) <= 60))
);
create table public.hba_newsletters (
  id uuid not null default gen_random_uuid(),
  title text not null,
  issue_date date not null,
  body text not null default ''::text,
  state text not null default 'draft'::text,
  file_path text,
  original_name text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  issue_precision text not null default 'day'::text,
  original_path text,
  constraint hba_newsletters_file_path_key UNIQUE (file_path),
  constraint hba_newsletters_original_path_key UNIQUE (original_path),
  constraint hba_newsletters_pkey PRIMARY KEY (id),
  constraint hba_newsletters_body_check CHECK ((length(body) <= 40000)),
  constraint hba_newsletters_issue_precision_check CHECK ((issue_precision = ANY (ARRAY['day'::text, 'month'::text]))),
  constraint hba_newsletters_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'published'::text]))),
  constraint hba_newsletters_title_check CHECK (((length(title) >= 1) AND (length(title) <= 180))),
  constraint newsletter_original_scope CHECK (((original_path IS NULL) OR (original_path ~~ (('newsletters/'::text || (id)::text) || '/%'::text))))
);
create table public.hba_nominations (
  id uuid not null default gen_random_uuid(),
  election_year integer not null,
  position text not null,
  candidate_name text not null,
  household_uid text,
  statement text not null default ''::text,
  state text not null default 'submitted'::text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_nominations_pkey PRIMARY KEY (id),
  constraint hba_nominations_candidate_name_check CHECK (((length(candidate_name) >= 1) AND (length(candidate_name) <= 160))),
  constraint hba_nominations_position_check CHECK (((length("position") >= 1) AND (length("position") <= 80))),
  constraint hba_nominations_state_check CHECK ((state = ANY (ARRAY['submitted'::text, 'accepted'::text, 'declined'::text, 'withdrawn'::text]))),
  constraint hba_nominations_statement_check CHECK ((length(statement) <= 4000))
);
create table public.hba_officeholders (
  id uuid not null default gen_random_uuid(),
  position text not null,
  member_name text not null,
  household_uid text,
  term_start date,
  term_end date,
  source_note text not null default ''::text,
  created_by uuid not null default auth.uid(),
  member_id uuid,
  contact_phone text not null default ''::text,
  contact_email text not null default ''::text,
  winter_address text not null default ''::text,
  share_contact boolean not null default true,
  constraint hba_officeholders_position_key UNIQUE ("position"),
  constraint hba_officeholders_pkey PRIMARY KEY (id)
);
create table public.hba_payer_households (
  id uuid not null default gen_random_uuid(),
  bank_account_id uuid not null,
  fingerprint text not null,
  label text not null,
  household_uid text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_payer_households_bank_account_id_fingerprint_key UNIQUE (bank_account_id, fingerprint),
  constraint hba_payer_households_pkey PRIMARY KEY (id),
  constraint hba_payer_households_fingerprint_check CHECK ((fingerprint ~ '^[0-9a-f]{64}$'::text)),
  constraint hba_payer_households_label_check CHECK (((length(label) >= 1) AND (length(label) <= 120)))
);
create table public.hba_payment_reports (
  id uuid not null default gen_random_uuid(),
  household_uid text not null,
  payment_kind text not null,
  fund text not null,
  event_id uuid,
  payment_year integer not null,
  amount numeric not null,
  payment_date date not null,
  reference text not null default ''::text,
  note text not null default ''::text,
  state text not null default 'pending'::text,
  board_note text not null default ''::text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  payment_method text not null default 'unspecified'::text,
  recognize_publicly boolean not null default false,
  constraint hba_payment_reports_pkey PRIMARY KEY (id),
  constraint hba_payment_reports_amount_check CHECK (((amount > (0)::numeric) AND (amount <= (1000000)::numeric))),
  constraint hba_payment_reports_check CHECK ((((payment_kind = 'dues'::text) AND (fund = 'dues'::text) AND (event_id IS NULL)) OR ((payment_kind = 'donation'::text) AND (fund <> 'dues'::text)))),
  constraint hba_payment_reports_fund_check CHECK ((fund = ANY (ARRAY['dues'::text, 'beach_nourishment'::text, 'jetties'::text, 'road_replacement'::text, 'events'::text, 'general'::text]))),
  constraint hba_payment_reports_note_check CHECK ((length(note) <= 3000)),
  constraint hba_payment_reports_payment_kind_check CHECK ((payment_kind = ANY (ARRAY['dues'::text, 'donation'::text]))),
  constraint hba_payment_reports_payment_method_check CHECK ((payment_method = ANY (ARRAY['zelle'::text, 'venmo'::text, 'check'::text, 'cash'::text, 'other'::text, 'unspecified'::text]))),
  constraint hba_payment_reports_payment_year_check CHECK (((payment_year >= 2020) AND (payment_year <= 2100))),
  constraint hba_payment_reports_reference_check CHECK ((length(reference) <= 100)),
  constraint hba_payment_reports_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text]))),
  constraint report_not_future CHECK ((payment_date <= CURRENT_DATE))
);
create table public.hba_payment_settings (
  id integer not null default 1,
  recipient_name text not null default ''::text,
  recipient_identifier text not null default ''::text,
  enabled boolean not null default false,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  venmo_name text not null default ''::text,
  venmo_handle text not null default ''::text,
  venmo_enabled boolean not null default false,
  constraint hba_payment_settings_pkey PRIMARY KEY (id),
  constraint hba_payment_settings_check CHECK (((NOT enabled) OR ((length(recipient_name) > 0) AND (length(recipient_identifier) > 0)))),
  constraint hba_payment_settings_id_check CHECK ((id = 1)),
  constraint hba_payment_settings_venmo_handle_check CHECK ((length(venmo_handle) <= 64)),
  constraint hba_payment_settings_venmo_name_check CHECK ((length(venmo_name) <= 180)),
  constraint venmo_verified_recipient CHECK (((NOT venmo_enabled) OR ((length(TRIM(BOTH FROM venmo_name)) > 0) AND (venmo_handle ~ '^[A-Za-z0-9_-]{1,64}$'::text))))
);
create table public.hba_photos (
  id uuid not null default gen_random_uuid(),
  event_id uuid,
  history_id uuid,
  work_id uuid,
  caption text not null default ''::text,
  credit text not null default ''::text,
  file_path text not null,
  status text not null default 'pending'::text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  issue_id uuid,
  storm_id uuid,
  constraint hba_photos_file_path_key UNIQUE (file_path),
  constraint hba_photos_pkey PRIMARY KEY (id),
  constraint hba_photos_caption_check CHECK ((length(caption) <= 2000)),
  constraint hba_photos_credit_check CHECK ((length(credit) <= 200)),
  constraint hba_photos_one_parent CHECK ((num_nonnulls(event_id, history_id, work_id, issue_id, storm_id) = 1)),
  constraint hba_photos_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'published'::text])))
);
create table public.hba_poll_votes (
  poll_id uuid not null,
  member_id uuid not null default auth.uid(),
  choice text not null,
  cast_at timestamptz not null default now(),
  constraint hba_poll_votes_pkey PRIMARY KEY (poll_id, member_id),
  constraint hba_poll_votes_choice_check CHECK ((length(choice) <= 200))
);
create table public.hba_polls (
  id uuid not null default gen_random_uuid(),
  event_id uuid,
  host_offer_id uuid,
  title text not null,
  question text not null default ''::text,
  options jsonb not null default '[]'::jsonb,
  state text not null default 'open'::text,
  closes_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_polls_pkey PRIMARY KEY (id),
  constraint hba_polls_question_check CHECK ((length(question) <= 1000)),
  constraint hba_polls_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text]))),
  constraint hba_polls_title_check CHECK (((length(title) >= 1) AND (length(title) <= 200)))
);
create table public.hba_public_advisories (
  id uuid not null default gen_random_uuid(),
  category text not null,
  location text not null,
  status text not null,
  note text not null default ''::text,
  source_url text not null,
  checked_at timestamptz not null,
  valid_until timestamptz not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_public_advisories_pkey PRIMARY KEY (id),
  constraint advisory_official_source CHECK ((source_url ~ '^https://([a-zA-Z0-9-]+\.)*(mass\.gov|wareham\.ma\.us)(/|$)'::text)),
  constraint hba_public_advisories_category_check CHECK ((category = ANY (ARRAY['swimming'::text, 'shellfishing'::text]))),
  constraint hba_public_advisories_check CHECK (((valid_until > checked_at) AND (valid_until <= (checked_at + '24:00:00'::interval)))),
  constraint hba_public_advisories_location_check CHECK (((length(location) >= 1) AND (length(location) <= 300))),
  constraint hba_public_advisories_note_check CHECK ((length(note) <= 3000)),
  constraint hba_public_advisories_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'unverified'::text])))
);
create table public.hba_push_subscriptions (
  id uuid not null default gen_random_uuid(),
  member_id uuid not null default auth.uid(),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  label text not null default ''::text,
  created_at timestamptz not null default now(),
  constraint hba_push_subscriptions_endpoint_key UNIQUE (endpoint),
  constraint hba_push_subscriptions_pkey PRIMARY KEY (id),
  constraint hba_push_subscriptions_auth_check CHECK ((length(auth) <= 200)),
  constraint hba_push_subscriptions_endpoint_check CHECK ((length(endpoint) <= 2000)),
  constraint hba_push_subscriptions_label_check CHECK ((length(label) <= 160)),
  constraint hba_push_subscriptions_p256dh_check CHECK ((length(p256dh) <= 400))
);
create table public.hba_research_reports (
  id uuid not null default gen_random_uuid(),
  question text not null,
  report jsonb not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_research_reports_pkey PRIMARY KEY (id),
  constraint hba_research_reports_question_check CHECK (((length(question) >= 3) AND (length(question) <= 600)))
);
create table public.hba_series (
  id uuid not null default gen_random_uuid(),
  title text not null,
  description text not null default ''::text,
  created_at timestamptz not null default now(),
  recurrence_rule text,
  first_year integer,
  first_year_source text not null default ''::text,
  constraint hba_series_pkey PRIMARY KEY (id),
  constraint hba_series_first_year_check CHECK (((first_year >= 1800) AND (first_year <= 2200))),
  constraint hba_series_recurrence_rule_check CHECK (((recurrence_rule IS NULL) OR (recurrence_rule = 'august_third_saturday'::text))),
  constraint hba_series_title_check CHECK (((length(title) >= 1) AND (length(title) <= 160)))
);
create table public.hba_settings (
  key text not null,
  value text not null default ''::text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint hba_settings_pkey PRIMARY KEY (key),
  constraint hba_settings_key_check CHECK ((key ~ '^[a-z_]{3,60}$'::text)),
  constraint hba_settings_value_check CHECK ((length(value) <= 2000))
);
create table public.hba_sms_consent_log (
  id uuid not null default gen_random_uuid(),
  member_id uuid not null,
  action text not null,
  phone text not null,
  topics text[] not null,
  consent_version text not null,
  recorded_at timestamptz not null default now(),
  constraint hba_sms_consent_log_pkey PRIMARY KEY (id),
  constraint hba_sms_consent_log_action_check CHECK ((action = ANY (ARRAY['opt_in'::text, 'update'::text, 'opt_out'::text])))
);
create table public.hba_sms_drafts (
  id uuid not null default gen_random_uuid(),
  category text not null,
  message text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hba_sms_drafts_pkey PRIMARY KEY (id),
  constraint hba_sms_drafts_category_check CHECK ((category = ANY (ARRAY['roads'::text, 'beach'::text, 'events'::text, 'speed_bumps'::text, 'votes'::text, 'meetings'::text, 'weather'::text, 'general'::text]))),
  constraint hba_sms_drafts_message_check CHECK (((length(message) >= 1) AND (length(message) <= 1000)))
);
create table public.hba_sms_preferences (
  member_id uuid not null,
  phone text not null,
  topics text[] not null,
  opted_in boolean not null default false,
  consent_version text not null default 'hba-sms-v1'::text,
  consent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint hba_sms_preferences_pkey PRIMARY KEY (member_id),
  constraint hba_sms_preferences_phone_check CHECK ((phone ~ '^\+1[2-9][0-9]{9}$'::text)),
  constraint hba_sms_preferences_topics_check CHECK (((topics <@ ARRAY['roads'::text, 'beach'::text, 'events'::text, 'speed_bumps'::text, 'votes'::text, 'meetings'::text, 'weather'::text, 'general'::text]) AND ((cardinality(topics) >= 1) AND (cardinality(topics) <= 8))))
);
create table public.hba_storm_memories (
  id uuid not null default gen_random_uuid(),
  storm_key text not null,
  storm_label text not null,
  event_year integer,
  title text not null,
  story text not null,
  where_text text not null default ''::text,
  show_name boolean not null default false,
  display_name text not null default ''::text,
  status text not null default 'pending'::text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_storm_memories_pkey PRIMARY KEY (id),
  constraint hba_storm_memories_display_name_check CHECK ((length(display_name) <= 120)),
  constraint hba_storm_memories_event_year_check CHECK (((event_year >= 1600) AND (event_year <= 2100))),
  constraint hba_storm_memories_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'published'::text]))),
  constraint hba_storm_memories_storm_key_check CHECK ((length(storm_key) <= 60)),
  constraint hba_storm_memories_storm_label_check CHECK ((length(storm_label) <= 120)),
  constraint hba_storm_memories_story_check CHECK ((length(story) <= 6000)),
  constraint hba_storm_memories_title_check CHECK ((length(title) <= 160)),
  constraint hba_storm_memories_where_text_check CHECK ((length(where_text) <= 200))
);
create table public.hba_volunteer_email_preferences (
  member_id uuid not null,
  opted_in boolean not null,
  updated_at timestamptz not null default now(),
  constraint hba_volunteer_email_preferences_pkey PRIMARY KEY (member_id)
);
create table public.hba_volunteer_signups (
  id uuid not null default gen_random_uuid(),
  task_id uuid not null,
  member_id uuid not null default auth.uid(),
  note text not null default ''::text,
  state text not null default 'signed_up'::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hba_volunteer_signups_task_id_member_id_key UNIQUE (task_id, member_id),
  constraint hba_volunteer_signups_pkey PRIMARY KEY (id),
  constraint hba_volunteer_signups_note_check CHECK ((length(note) <= 1000)),
  constraint hba_volunteer_signups_state_check CHECK ((state = ANY (ARRAY['signed_up'::text, 'withdrawn'::text])))
);
create table public.hba_volunteer_tasks (
  id uuid not null default gen_random_uuid(),
  title text not null,
  category text not null,
  description text not null,
  location text not null default ''::text,
  task_date date,
  task_time time without time zone,
  capacity integer not null default 10,
  state text not null default 'draft'::text,
  photo_path text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  event_id uuid,
  constraint hba_volunteer_tasks_photo_path_key UNIQUE (photo_path),
  constraint hba_volunteer_tasks_pkey PRIMARY KEY (id),
  constraint hba_volunteer_tasks_capacity_check CHECK (((capacity >= 1) AND (capacity <= 500))),
  constraint hba_volunteer_tasks_category_check CHECK ((category = ANY (ARRAY['event'::text, 'maintenance'::text]))),
  constraint hba_volunteer_tasks_check CHECK (((photo_path IS NULL) OR (photo_path ~~ (('volunteers/'::text || (id)::text) || '/%'::text)))),
  constraint hba_volunteer_tasks_description_check CHECK (((length(description) >= 1) AND (length(description) <= 12000))),
  constraint hba_volunteer_tasks_location_check CHECK ((length(location) <= 300)),
  constraint hba_volunteer_tasks_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'published'::text, 'closed'::text, 'complete'::text]))),
  constraint hba_volunteer_tasks_title_check CHECK (((length(title) >= 1) AND (length(title) <= 180)))
);
create table public.hba_vote_annotations (
  id uuid not null default gen_random_uuid(),
  vote_id uuid not null,
  note text not null,
  document_id uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_vote_annotations_pkey PRIMARY KEY (id),
  constraint hba_vote_annotations_note_check CHECK (((length(note) >= 1) AND (length(note) <= 4000)))
);
create table public.hba_vote_audit (
  id uuid not null default gen_random_uuid(),
  table_name text not null,
  record_id text not null,
  before_record jsonb,
  after_record jsonb,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now(),
  constraint hba_vote_audit_pkey PRIMARY KEY (id)
);
create table public.hba_vote_comments (
  id uuid not null default gen_random_uuid(),
  vote_id uuid not null,
  body text not null,
  state text not null default 'pending'::text,
  moderated_by uuid,
  moderated_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_vote_comments_pkey PRIMARY KEY (id),
  constraint hba_vote_comments_body_check CHECK (((length(body) >= 1) AND (length(body) <= 3000))),
  constraint hba_vote_comments_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'published'::text, 'hidden'::text])))
);
create table public.hba_vote_proxies (
  id uuid not null default gen_random_uuid(),
  vote_id uuid not null,
  household_uid text not null,
  holder_name text not null,
  filed_at timestamptz not null,
  document_id uuid,
  note text not null default ''::text,
  filed_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_vote_proxies_vote_id_household_uid_key UNIQUE (vote_id, household_uid),
  constraint hba_vote_proxies_pkey PRIMARY KEY (id),
  constraint hba_vote_proxies_holder_name_check CHECK (((length(holder_name) >= 1) AND (length(holder_name) <= 160))),
  constraint hba_vote_proxies_note_check CHECK ((length(note) <= 1000))
);
create table public.hba_vote_results (
  vote_id uuid not null,
  tally jsonb not null,
  units_participating integer not null,
  units_able integer not null,
  quorum_met boolean not null,
  outcome text not null,
  rule_applied text not null default ''::text,
  tie_break_choice text,
  tie_break_by uuid,
  tie_break_at timestamptz,
  certified_by uuid not null default auth.uid(),
  certified_at timestamptz not null default now(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  minutes_document_id uuid,
  notes text not null default ''::text,
  constraint hba_vote_results_pkey PRIMARY KEY (vote_id),
  constraint hba_vote_results_check CHECK (((confirmed_by IS NULL) OR (confirmed_by <> certified_by))),
  constraint hba_vote_results_check1 CHECK (((confirmed_by IS NULL) = (confirmed_at IS NULL))),
  constraint hba_vote_results_notes_check CHECK ((length(notes) <= 4000)),
  constraint hba_vote_results_outcome_check CHECK ((outcome = ANY (ARRAY['passed'::text, 'failed'::text, 'no_quorum'::text, 'advisory'::text, 'tie_pending'::text, 'elected'::text]))),
  constraint hba_vote_results_rule_applied_check CHECK ((length(rule_applied) <= 1000)),
  constraint hba_vote_results_units_able_check CHECK ((units_able >= 0)),
  constraint hba_vote_results_units_participating_check CHECK ((units_participating >= 0))
);
create table public.hba_vote_roll (
  id uuid not null default gen_random_uuid(),
  vote_id uuid not null,
  unit_key text not null,
  household_uid text,
  label text not null,
  street text not null default ''::text,
  weight integer not null default 1,
  eligible boolean not null,
  reason text not null default ''::text,
  basis jsonb not null default '{}'::jsonb,
  member_ids uuid[] not null default '{}'::uuid[],
  constraint hba_vote_roll_vote_id_unit_key_key UNIQUE (vote_id, unit_key),
  constraint hba_vote_roll_pkey PRIMARY KEY (id),
  constraint hba_vote_roll_label_check CHECK (((length(label) >= 1) AND (length(label) <= 200))),
  constraint hba_vote_roll_reason_check CHECK ((length(reason) <= 500)),
  constraint hba_vote_roll_unit_key_check CHECK (((length(unit_key) >= 1) AND (length(unit_key) <= 120))),
  constraint hba_vote_roll_weight_check CHECK (((weight >= 1) AND (weight <= 20)))
);
create table public.hba_votes (
  id uuid not null default gen_random_uuid(),
  kind text not null,
  title text not null,
  motion text not null,
  rationale text not null default ''::text,
  state text not null default 'draft'::text,
  meeting_id uuid,
  electorate text not null,
  street text not null default ''::text,
  threshold text not null,
  quorum_required integer not null default 0,
  secret_ballot boolean not null default false,
  president_tie_break boolean not null default false,
  options jsonb not null default '["Yes", "No", "Abstain"]'::jsonb,
  amount numeric,
  classification jsonb not null default '{}'::jsonb,
  basis text not null default ''::text,
  cautions jsonb not null default '[]'::jsonb,
  supersedes_id uuid,
  notice_at timestamptz,
  proxy_deadline timestamptz,
  opens_at timestamptz,
  closes_at timestamptz,
  roll_frozen_at timestamptz,
  eligible_units integer,
  procedures_version text not null default ''::text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hba_votes_pkey PRIMARY KEY (id),
  constraint hba_votes_amount_check CHECK (((amount IS NULL) OR (amount >= (0)::numeric))),
  constraint hba_votes_basis_check CHECK ((length(basis) <= 4000)),
  constraint hba_votes_check CHECK (((kind = 'advisory'::text) OR (meeting_id IS NOT NULL) OR (state = ANY (ARRAY['draft'::text, 'withdrawn'::text, 'deferred'::text])))),
  constraint hba_votes_check1 CHECK (((supersedes_id IS NULL) OR (supersedes_id <> id))),
  constraint hba_votes_electorate_check CHECK ((electorate = ANY (ARRAY['governors'::text, 'households'::text, 'street'::text, 'board_and_president'::text, 'all_members'::text]))),
  constraint hba_votes_kind_check CHECK ((kind = ANY (ARRAY['advisory'::text, 'board'::text, 'membership'::text, 'capital'::text, 'dues_increase'::text, 'election'::text, 'removal_elected'::text, 'removal_appointed'::text, 'amendment'::text]))),
  constraint hba_votes_motion_check CHECK (((length(motion) >= 1) AND (length(motion) <= 12000))),
  constraint hba_votes_options_check CHECK (((jsonb_typeof(options) = 'array'::text) AND ((jsonb_array_length(options) >= 2) AND (jsonb_array_length(options) <= 20)))),
  constraint hba_votes_quorum_required_check CHECK (((quorum_required >= 0) AND (quorum_required <= 500))),
  constraint hba_votes_rationale_check CHECK ((length(rationale) <= 12000)),
  constraint hba_votes_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'noticed'::text, 'open'::text, 'closed'::text, 'certified'::text, 'confirmed'::text, 'withdrawn'::text, 'deferred'::text]))),
  constraint hba_votes_street_check CHECK ((length(street) <= 60)),
  constraint hba_votes_threshold_check CHECK ((threshold = ANY (ARRAY['majority'::text, 'two_thirds'::text, 'plurality'::text, 'none'::text]))),
  constraint hba_votes_title_check CHECK (((length(title) >= 1) AND (length(title) <= 180)))
);
create table public.hba_voting_procedures (
  id integer not null default 1,
  document_id uuid,
  version_label text not null default ''::text,
  adopted_on date,
  online_ballots_allowed boolean not null default false,
  online_counts_toward_quorum boolean not null default false,
  majority_rule text not null default 'votes_cast'::text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  note text not null default ''::text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint hba_voting_procedures_pkey PRIMARY KEY (id),
  constraint hba_voting_procedures_check CHECK (((confirmed_at IS NULL) OR ((document_id IS NOT NULL) AND (adopted_on IS NOT NULL) AND (length(version_label) > 0)))),
  constraint hba_voting_procedures_id_check CHECK ((id = 1)),
  constraint hba_voting_procedures_majority_rule_check CHECK ((majority_rule = ANY (ARRAY['votes_cast'::text, 'eligible_units'::text]))),
  constraint hba_voting_procedures_note_check CHECK ((length(note) <= 3000)),
  constraint hba_voting_procedures_version_label_check CHECK ((length(version_label) <= 160))
);
create table public.hba_work (
  id uuid not null default gen_random_uuid(),
  title text not null,
  contractor text not null default ''::text,
  location text not null default ''::text,
  work_date date,
  description text not null default ''::text,
  state text not null default 'planned'::text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_work_pkey PRIMARY KEY (id),
  constraint hba_work_state_check CHECK ((state = ANY (ARRAY['planned'::text, 'in_progress'::text, 'incomplete'::text, 'defect'::text, 'resolved'::text, 'accepted'::text]))),
  constraint hba_work_title_check CHECK (((length(title) >= 1) AND (length(title) <= 180)))
);
create table public.hba_work_notes (
  id uuid not null default gen_random_uuid(),
  work_id uuid not null,
  note text not null,
  flag text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hba_work_notes_pkey PRIMARY KEY (id),
  constraint hba_work_notes_flag_check CHECK ((flag = ANY (ARRAY['progress'::text, 'incomplete'::text, 'defect'::text, 'resolved'::text, 'accepted'::text]))),
  constraint hba_work_notes_note_check CHECK (((length(note) >= 1) AND (length(note) <= 12000)))
);

-- ===== Foreign keys =====
alter table public.hba_agenda_items add constraint hba_agenda_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_agenda_items add constraint hba_agenda_items_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES hba_meetings(id);
alter table public.hba_ballot_choices add constraint hba_ballot_choices_vote_id_fkey FOREIGN KEY (vote_id) REFERENCES hba_votes(id) ON DELETE CASCADE;
alter table public.hba_ballots add constraint hba_ballots_cast_by_fkey FOREIGN KEY (cast_by) REFERENCES auth.users(id);
alter table public.hba_ballots add constraint hba_ballots_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id);
alter table public.hba_ballots add constraint hba_ballots_vote_id_fkey FOREIGN KEY (vote_id) REFERENCES hba_votes(id) ON DELETE CASCADE;
alter table public.hba_bank_accounts add constraint hba_bank_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_bank_imports add constraint hba_bank_imports_account_id_fkey FOREIGN KEY (account_id) REFERENCES hba_bank_accounts(id);
alter table public.hba_bank_imports add constraint hba_bank_imports_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_bank_matches add constraint hba_bank_matches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_bank_matches add constraint hba_bank_matches_register_id_fkey FOREIGN KEY (register_id) REFERENCES hba_check_register(id);
alter table public.hba_bank_matches add constraint hba_bank_matches_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES hba_bank_transactions(id);
alter table public.hba_bank_summaries add constraint hba_bank_summaries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_bank_transactions add constraint hba_bank_transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES hba_bank_accounts(id);
alter table public.hba_bank_transactions add constraint hba_bank_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_bank_transactions add constraint hba_bank_transactions_import_id_fkey FOREIGN KEY (import_id) REFERENCES hba_bank_imports(id);
alter table public.hba_bid_files add constraint hba_bid_files_bid_id_fkey FOREIGN KEY (bid_id) REFERENCES hba_bids(id);
alter table public.hba_bid_files add constraint hba_bid_files_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_bid_requests add constraint hba_bid_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_bid_requests add constraint hba_bid_requests_work_id_fkey FOREIGN KEY (work_id) REFERENCES hba_work(id);
alter table public.hba_bid_reviews add constraint hba_bid_reviews_bid_id_fkey FOREIGN KEY (bid_id) REFERENCES hba_bids(id);
alter table public.hba_bid_reviews add constraint hba_bid_reviews_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
alter table public.hba_bids add constraint hba_bids_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_bids add constraint hba_bids_request_id_fkey FOREIGN KEY (request_id) REFERENCES hba_bid_requests(id);
alter table public.hba_category_budgets add constraint hba_category_budgets_category_code_fkey FOREIGN KEY (category_code) REFERENCES hba_finance_categories(code);
alter table public.hba_check_register add constraint hba_check_register_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES hba_bank_accounts(id);
alter table public.hba_check_register add constraint hba_check_register_category_code_fkey FOREIGN KEY (category_code) REFERENCES hba_finance_categories(code);
alter table public.hba_check_register add constraint hba_check_register_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_decisions add constraint hba_decisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_decisions add constraint hba_decisions_minutes_id_fkey FOREIGN KEY (minutes_id) REFERENCES hba_documents(id);
alter table public.hba_document_facts add constraint hba_document_facts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_document_facts add constraint hba_document_facts_document_id_fkey FOREIGN KEY (document_id) REFERENCES hba_documents(id);
alter table public.hba_document_intakes add constraint hba_document_intakes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_document_intakes add constraint hba_document_intakes_document_id_fkey FOREIGN KEY (document_id) REFERENCES hba_documents(id) ON DELETE CASCADE;
alter table public.hba_document_suggestions add constraint hba_document_suggestions_document_id_fkey FOREIGN KEY (document_id) REFERENCES hba_documents(id) ON DELETE CASCADE;
alter table public.hba_document_suggestions add constraint hba_document_suggestions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
alter table public.hba_documents add constraint hba_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_dues_receipts add constraint hba_dues_receipts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_dues_receipts add constraint hba_dues_receipts_household_uid_fkey FOREIGN KEY (household_uid) REFERENCES hba_dues_households(uid);
alter table public.hba_dues_receipts add constraint hba_dues_receipts_register_id_fkey FOREIGN KEY (register_id) REFERENCES hba_check_register(id);
alter table public.hba_dues_targets add constraint hba_dues_targets_uid_fkey FOREIGN KEY (uid) REFERENCES hba_dues_households(uid);
alter table public.hba_dues add constraint hba_dues_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
alter table public.hba_elections add constraint hba_elections_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES hba_meetings(id);
alter table public.hba_elections add constraint hba_elections_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
alter table public.hba_event_host_offers add constraint hba_event_host_offers_event_id_fkey FOREIGN KEY (event_id) REFERENCES hba_events(id) ON DELETE SET NULL;
alter table public.hba_event_host_offers add constraint hba_event_host_offers_member_id_fkey FOREIGN KEY (member_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.hba_events add constraint hba_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_events add constraint hba_events_series_id_fkey FOREIGN KEY (series_id) REFERENCES hba_series(id);
alter table public.hba_finance_audit add constraint hba_finance_audit_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);
alter table public.hba_governor_messages add constraint hba_governor_messages_from_member_id_fkey FOREIGN KEY (from_member_id) REFERENCES hba_members(id);
alter table public.hba_governor_messages add constraint hba_governor_messages_to_officeholder_id_fkey FOREIGN KEY (to_officeholder_id) REFERENCES hba_officeholders(id) ON DELETE SET NULL;
alter table public.hba_house_history add constraint hba_house_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_issues add constraint hba_issues_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_meeting_access add constraint hba_meeting_access_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_meeting_access add constraint hba_meeting_access_id_fkey FOREIGN KEY (id) REFERENCES hba_meetings(id);
alter table public.hba_meeting_minutes add constraint hba_meeting_minutes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_meeting_minutes add constraint hba_meeting_minutes_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES hba_meetings(id) ON DELETE SET NULL;
alter table public.hba_meetings add constraint hba_meetings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_member_households add constraint hba_member_households_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_member_households add constraint hba_member_households_member_id_fkey FOREIGN KEY (member_id) REFERENCES hba_members(id) ON DELETE CASCADE;
alter table public.hba_members add constraint hba_members_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.hba_message_reads add constraint hba_message_reads_member_id_fkey FOREIGN KEY (member_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.hba_message_reads add constraint hba_message_reads_message_id_fkey FOREIGN KEY (message_id) REFERENCES hba_messages(id) ON DELETE CASCADE;
alter table public.hba_messages add constraint hba_messages_member_id_fkey FOREIGN KEY (member_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.hba_newsletters add constraint hba_newsletters_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_nominations add constraint hba_nominations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_nominations add constraint hba_nominations_election_year_fkey FOREIGN KEY (election_year) REFERENCES hba_elections(year);
alter table public.hba_nominations add constraint hba_nominations_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
alter table public.hba_officeholders add constraint hba_officeholders_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_officeholders add constraint hba_officeholders_member_id_fkey FOREIGN KEY (member_id) REFERENCES hba_members(id);
alter table public.hba_payer_households add constraint hba_payer_households_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES hba_bank_accounts(id);
alter table public.hba_payer_households add constraint hba_payer_households_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_payer_households add constraint hba_payer_households_household_uid_fkey FOREIGN KEY (household_uid) REFERENCES hba_dues_households(uid);
alter table public.hba_payment_reports add constraint hba_payment_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_payment_reports add constraint hba_payment_reports_event_id_fkey FOREIGN KEY (event_id) REFERENCES hba_events(id);
alter table public.hba_payment_reports add constraint hba_payment_reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
alter table public.hba_payment_settings add constraint hba_payment_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
alter table public.hba_photos add constraint hba_photos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_photos add constraint hba_photos_event_id_fkey FOREIGN KEY (event_id) REFERENCES hba_events(id);
alter table public.hba_photos add constraint hba_photos_history_id_fkey FOREIGN KEY (history_id) REFERENCES hba_house_history(id);
alter table public.hba_photos add constraint hba_photos_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES hba_issues(id);
alter table public.hba_photos add constraint hba_photos_storm_id_fkey FOREIGN KEY (storm_id) REFERENCES hba_storm_memories(id);
alter table public.hba_photos add constraint hba_photos_work_id_fkey FOREIGN KEY (work_id) REFERENCES hba_work(id);
alter table public.hba_poll_votes add constraint hba_poll_votes_member_id_fkey FOREIGN KEY (member_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.hba_poll_votes add constraint hba_poll_votes_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES hba_polls(id) ON DELETE CASCADE;
alter table public.hba_polls add constraint hba_polls_event_id_fkey FOREIGN KEY (event_id) REFERENCES hba_events(id) ON DELETE CASCADE;
alter table public.hba_polls add constraint hba_polls_host_offer_id_fkey FOREIGN KEY (host_offer_id) REFERENCES hba_event_host_offers(id) ON DELETE SET NULL;
alter table public.hba_public_advisories add constraint hba_public_advisories_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_push_subscriptions add constraint hba_push_subscriptions_member_id_fkey FOREIGN KEY (member_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.hba_research_reports add constraint hba_research_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_settings add constraint hba_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
alter table public.hba_sms_consent_log add constraint hba_sms_consent_log_member_id_fkey FOREIGN KEY (member_id) REFERENCES hba_members(id);
alter table public.hba_sms_drafts add constraint hba_sms_drafts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_sms_preferences add constraint hba_sms_preferences_member_id_fkey FOREIGN KEY (member_id) REFERENCES hba_members(id);
alter table public.hba_storm_memories add constraint hba_storm_memories_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_volunteer_email_preferences add constraint hba_volunteer_email_preferences_member_id_fkey FOREIGN KEY (member_id) REFERENCES hba_members(id);
alter table public.hba_volunteer_signups add constraint hba_volunteer_signups_member_id_fkey FOREIGN KEY (member_id) REFERENCES hba_members(id);
alter table public.hba_volunteer_signups add constraint hba_volunteer_signups_task_id_fkey FOREIGN KEY (task_id) REFERENCES hba_volunteer_tasks(id);
alter table public.hba_volunteer_tasks add constraint hba_volunteer_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_volunteer_tasks add constraint hba_volunteer_tasks_event_id_fkey FOREIGN KEY (event_id) REFERENCES hba_events(id) ON DELETE SET NULL;
alter table public.hba_vote_annotations add constraint hba_vote_annotations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_vote_annotations add constraint hba_vote_annotations_document_id_fkey FOREIGN KEY (document_id) REFERENCES hba_documents(id);
alter table public.hba_vote_annotations add constraint hba_vote_annotations_vote_id_fkey FOREIGN KEY (vote_id) REFERENCES hba_votes(id) ON DELETE CASCADE;
alter table public.hba_vote_comments add constraint hba_vote_comments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_vote_comments add constraint hba_vote_comments_moderated_by_fkey FOREIGN KEY (moderated_by) REFERENCES auth.users(id);
alter table public.hba_vote_comments add constraint hba_vote_comments_vote_id_fkey FOREIGN KEY (vote_id) REFERENCES hba_votes(id) ON DELETE CASCADE;
alter table public.hba_vote_proxies add constraint hba_vote_proxies_document_id_fkey FOREIGN KEY (document_id) REFERENCES hba_documents(id);
alter table public.hba_vote_proxies add constraint hba_vote_proxies_filed_by_fkey FOREIGN KEY (filed_by) REFERENCES auth.users(id);
alter table public.hba_vote_proxies add constraint hba_vote_proxies_vote_id_fkey FOREIGN KEY (vote_id) REFERENCES hba_votes(id) ON DELETE CASCADE;
alter table public.hba_vote_results add constraint hba_vote_results_certified_by_fkey FOREIGN KEY (certified_by) REFERENCES auth.users(id);
alter table public.hba_vote_results add constraint hba_vote_results_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES auth.users(id);
alter table public.hba_vote_results add constraint hba_vote_results_minutes_document_id_fkey FOREIGN KEY (minutes_document_id) REFERENCES hba_documents(id);
alter table public.hba_vote_results add constraint hba_vote_results_tie_break_by_fkey FOREIGN KEY (tie_break_by) REFERENCES auth.users(id);
alter table public.hba_vote_results add constraint hba_vote_results_vote_id_fkey FOREIGN KEY (vote_id) REFERENCES hba_votes(id) ON DELETE CASCADE;
alter table public.hba_vote_roll add constraint hba_vote_roll_vote_id_fkey FOREIGN KEY (vote_id) REFERENCES hba_votes(id) ON DELETE CASCADE;
alter table public.hba_votes add constraint hba_votes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_votes add constraint hba_votes_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES hba_meetings(id);
alter table public.hba_votes add constraint hba_votes_supersedes_id_fkey FOREIGN KEY (supersedes_id) REFERENCES hba_votes(id);
alter table public.hba_voting_procedures add constraint hba_voting_procedures_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES auth.users(id);
alter table public.hba_voting_procedures add constraint hba_voting_procedures_document_id_fkey FOREIGN KEY (document_id) REFERENCES hba_documents(id);
alter table public.hba_voting_procedures add constraint hba_voting_procedures_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
alter table public.hba_work add constraint hba_work_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_work_notes add constraint hba_work_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.hba_work_notes add constraint hba_work_notes_work_id_fkey FOREIGN KEY (work_id) REFERENCES hba_work(id);

-- ===== Indexes =====
CREATE INDEX hba_agenda_meeting_idx ON public.hba_agenda_items USING btree (meeting_id, sort_order);
CREATE INDEX bank_txn_account_date ON public.hba_bank_transactions USING btree (account_id, posted_date);
CREATE INDEX hba_bids_request ON public.hba_bids USING btree (request_id);
CREATE UNIQUE INDEX hba_one_selected_bid ON public.hba_bids USING btree (request_id) WHERE (state = 'selected'::text);
CREATE INDEX hba_register_date_idx ON public.hba_check_register USING btree (transaction_date);
CREATE INDEX register_bank_account ON public.hba_check_register USING btree (bank_account_id);
CREATE INDEX hba_document_intakes_hash_idx ON public.hba_document_intakes USING btree (file_sha256);
CREATE INDEX hba_events_event_date_idx ON public.hba_events USING btree (event_date);
CREATE INDEX hba_events_series_id_idx ON public.hba_events USING btree (series_id);
CREATE UNIQUE INDEX hba_one_annual_supper ON public.hba_events USING btree (series_id, annual_rule_year) WHERE (annual_rule_year IS NOT NULL);
CREATE INDEX governor_messages_created ON public.hba_governor_messages USING btree (created_at DESC);
CREATE INDEX hba_house_history_household_uid_idx ON public.hba_house_history USING btree (household_uid);
CREATE INDEX hba_issues_state_idx ON public.hba_issues USING btree (state);
CREATE INDEX hba_minutes_date_idx ON public.hba_meeting_minutes USING btree (meeting_date DESC);
CREATE INDEX hba_messages_member_idx ON public.hba_messages USING btree (member_id, created_at DESC);
CREATE UNIQUE INDEX hba_one_officeholder_per_property ON public.hba_officeholders USING btree (household_uid) WHERE (household_uid IS NOT NULL);
CREATE INDEX payment_reports_owner ON public.hba_payment_reports USING btree (created_by);
CREATE INDEX payment_reports_state ON public.hba_payment_reports USING btree (state);
CREATE INDEX hba_photos_event_id_idx ON public.hba_photos USING btree (event_id);
CREATE INDEX hba_photos_history_id_idx ON public.hba_photos USING btree (history_id);
CREATE INDEX hba_photos_issue_id_idx ON public.hba_photos USING btree (issue_id);
CREATE INDEX hba_photos_work_id_idx ON public.hba_photos USING btree (work_id);
CREATE INDEX hba_volunteer_tasks_event_idx ON public.hba_volunteer_tasks USING btree (event_id);
CREATE INDEX hba_votes_state_idx ON public.hba_votes USING btree (state, created_at DESC);

-- ===== Functions =====
-- NOTE: hba_sync_member() promotes one e-mail address to administrator when it confirms its account.
-- Replace admin@example.com below with your administrator's address before running.
CREATE OR REPLACE FUNCTION public.hba_admin_delete_research_report(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare n int; begin if public.hba_role()<>'admin' then raise exception 'Administrator required'; end if; delete from public.hba_research_reports where id=p_id; get diagnostics n=row_count; return n>0; end $function$;
CREATE OR REPLACE FUNCTION public.hba_apply_event_recurrence()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare rule text; yr int; expected date;
begin
 select recurrence_rule into rule from public.hba_series where id=new.series_id;
 if rule='august_third_saturday' and
 (new.event_date>=current_date or (tg_op='UPDATE' and old.annual_rule_year is not null)) then
   yr=extract(year from new.event_date)::int; expected=public.hba_supper_date(yr);
   if new.event_date<>expected then
     raise exception 'Spaghetti Supper is the third Saturday in August. Use the rain-date switch for the following Saturday; historical exceptions require a documented past occurrence.';
   end if;
   new.rain_date=expected+7; new.annual_rule_year=yr;
 elsif rule is distinct from 'august_third_saturday' then
   new.annual_rule_year=null;
 end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_audit_election()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 insert into public.hba_election_audit(year,before_record,after_record,changed_by)
 values(coalesce(new.year,old.year),case when tg_op='INSERT' then null else to_jsonb(old) end,
 case when tg_op='DELETE' then null else to_jsonb(new) end,auth.uid());
 return coalesce(new,old);
end $function$;
CREATE OR REPLACE FUNCTION public.hba_audit_vote_tables()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 insert into public.hba_vote_audit(table_name,record_id,before_record,after_record,changed_by)
 values(tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(new)->>'vote_id',to_jsonb(old)->>'id',to_jsonb(old)->>'vote_id',''),
  case when tg_op='INSERT' then null else to_jsonb(old) end, case when tg_op='DELETE' then null else to_jsonb(new) end, auth.uid());
 return coalesce(new,old);
end $function$;
CREATE OR REPLACE FUNCTION public.hba_bank_protect_matched_register()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
 if exists(select 1 from public.hba_bank_matches where register_id=old.id)
 and (new.amount is distinct from old.amount or new.direction is distinct from old.direction
 or new.bank_account_id is distinct from old.bank_account_id or new.transaction_date is distinct from old.transaction_date
 or new.voided is distinct from old.voided) then
 raise exception 'Administrator must remove the bank match before changing matched financial fields'; end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_bank_validate_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare b public.hba_bank_transactions; r public.hba_check_register; begin if not public.hba_can_edit_finance() or new.created_by is distinct from auth.uid() then raise exception 'Treasurer permission required'; end if; select * into b from public.hba_bank_transactions where id=new.transaction_id for update; select * into r from public.hba_check_register where id=new.register_id for update; if b.id is null or r.id is null or r.voided or r.bank_account_id is distinct from b.account_id or b.amount is distinct from (case when r.direction='income' then r.amount else -r.amount end) or b.posted_date<r.transaction_date then raise exception 'Match requires same account, signed amount and valid dates'; end if; return new; end $function$;
CREATE OR REPLACE FUNCTION public.hba_bank_validate_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
 if not exists(select 1 from public.hba_bank_imports i where i.id=new.import_id and i.account_id=new.account_id
 and new.posted_date between i.period_start and i.period_end)
 then raise exception 'Bank row must belong to the same account and statement period'; end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_book_bank_dues(p_transaction uuid, p_uid text, p_year integer, p_annual_due numeric, p_payee text, p_memo text, p_remember boolean DEFAULT false, p_payer_fingerprint text DEFAULT NULL::text, p_payer_label text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b public.hba_bank_transactions; rid uuid; result jsonb;
begin
 if not public.hba_can_edit_finance() then raise exception 'Treasurer permission required'; end if;
 select * into b from public.hba_bank_transactions where id=p_transaction for update;
 if b.id is null or b.amount<=0 then raise exception 'Choose a positive, single-check deposit'; end if;
 if exists(select 1 from public.hba_bank_matches where transaction_id=b.id) then raise exception 'Already matched: attribute the existing register entry instead of booking twice'; end if;
 if p_remember and b.payer_fingerprint is not null and p_payer_fingerprint is distinct from b.payer_fingerprint then
  raise exception 'Remembered identity must match the bank row'; end if;
 rid=public.hba_book_bank_transaction(b.id,'dues',p_payee,p_memo);
 result=public.hba_credit_dues_receipt(rid,p_uid,p_year,b.amount,p_annual_due,
  case when p_remember then p_payer_fingerprint else null end,case when p_remember then p_payer_label else null end);
 return result||jsonb_build_object('register_id',rid);
end $function$;
CREATE OR REPLACE FUNCTION public.hba_book_bank_transaction(p_transaction_id uuid, p_category text, p_payee text, p_memo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b public.hba_bank_transactions; r_id uuid; direction_value text;
begin
 if not public.hba_can_edit_finance() then raise exception 'Treasurer permission required'; end if;
 select * into b from public.hba_bank_transactions where id=p_transaction_id for update;
 if b.id is null then raise exception 'Bank row not found'; end if;
 if exists(select 1 from public.hba_bank_matches where transaction_id=b.id) then raise exception 'Already booked or matched'; end if;
 direction_value=case when b.amount>0 then 'income' else 'expense' end;
 if not exists(select 1 from public.hba_finance_categories where code=p_category and direction=direction_value)
 then raise exception 'Select a category with the correct income/expense direction'; end if;
 insert into public.hba_check_register(transaction_date,direction,category_code,payee,amount,reference,memo,cleared,bank_account_id)
 values(b.posted_date,direction_value,p_category,p_payee,abs(b.amount),b.reference,p_memo,true,b.account_id)
 returning id into r_id;
 insert into public.hba_bank_matches(transaction_id,register_id) values(b.id,r_id);
 return r_id;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_can_call_vote()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.hba_is_president() $function$;
CREATE OR REPLACE FUNCTION public.hba_can_certify()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.hba_is_secretary() $function$;
CREATE OR REPLACE FUNCTION public.hba_can_edit_finance()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.hba_role()='admin' or (public.hba_is_board() and exists(
 select 1 from public.hba_officeholders o where o.member_id=auth.uid() and o.position='Treasurer'
 and (o.term_start is null or o.term_start<=current_date)
 and (o.term_end is null or o.term_end>=current_date)))
$function$;
CREATE OR REPLACE FUNCTION public.hba_can_edit_minutes()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.hba_can_edit_newsletter()
$function$;
CREATE OR REPLACE FUNCTION public.hba_can_edit_newsletter()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.hba_role()='admin' or (public.hba_is_board() and exists(
 select 1 from public.hba_officeholders o where o.member_id=auth.uid()
 and o.position='Secretary'
 and (o.term_start is null or o.term_start<=current_date)
 and (o.term_end is null or o.term_end>=current_date)))
$function$;
CREATE OR REPLACE FUNCTION public.hba_can_schedule()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.hba_role()='admin' or (public.hba_is_board() and exists(
 select 1 from public.hba_officeholders o where o.member_id=auth.uid()
 and o.position in ('President','Secretary')
 and (o.term_start is null or o.term_start<=current_date)
 and (o.term_end is null or o.term_end>=current_date)))
$function$;
CREATE OR REPLACE FUNCTION public.hba_can_store_photo(object_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.hba_is_member() and exists(select 1 from public.hba_photos p where p.file_path=object_path and p.created_by=auth.uid()) $function$;
CREATE OR REPLACE FUNCTION public.hba_cast_ballot(p_vote uuid, p_choice text, p_recuse boolean DEFAULT false, p_reason text DEFAULT ''::text)
 RETURNS TABLE(receipt_code text, unit_label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v public.hba_votes; r public.hba_vote_roll; code text; proc public.hba_voting_procedures;
begin
 if not public.hba_is_member() then raise exception 'Member access required'; end if;
 select * into v from public.hba_votes where id=p_vote for update;
 if not found or v.state<>'open' then raise exception 'This vote is not open'; end if;
 select * into proc from public.hba_voting_procedures where id=1;
 if v.kind<>'advisory' and not (proc.confirmed_at is not null and proc.online_ballots_allowed) then
  raise exception 'Online ballots for formal votes are disabled until the board-approved Voting Guidelines & Procedures are recorded. Vote at the meeting or by written proxy.'; end if;
 select * into r from public.hba_vote_roll where vote_id=p_vote and auth.uid()=any(member_ids) and eligible order by weight desc limit 1;
 if not found then raise exception 'Your account is not on the eligible roll for this vote'; end if;
 if exists(select 1 from public.hba_ballots where vote_id=p_vote and unit_key=r.unit_key) then raise exception 'A ballot has already been recorded for %', r.label; end if;
 if not p_recuse and not (v.options ? p_choice) then raise exception 'Choose one of the listed options'; end if;
 code=upper(substr(md5(random()::text||clock_timestamp()::text),1,10));
 insert into public.hba_ballots(vote_id,unit_key,cast_by,source,choice,weight,receipt_code,recused,recusal_reason)
 values(p_vote,r.unit_key,auth.uid(),'online',case when v.secret_ballot or p_recuse then null else p_choice end,r.weight,code,p_recuse,left(p_reason,500));
 if v.secret_ballot and not p_recuse then insert into public.hba_ballot_choices(vote_id,choice,weight) values(p_vote,p_choice,r.weight); end if;
 return query select code, r.label;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_correct_dues_target(p_uid text, p_year integer, p_annual numeric, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare total numeric; old public.hba_dues;
begin
 if public.hba_role()<>'admin' then raise exception 'Administrator permission required'; end if;
 if p_annual is null or p_annual<=0 or p_annual<>round(p_annual,2)
 or coalesce(length(trim(p_note)),0) not between 1 and 1000 then raise exception 'Enter a positive verified amount and correction reference'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_year::text||'/'||p_uid,0));
 update public.hba_dues_targets set annual_due=p_annual,source_note=trim(p_note) where uid=p_uid and year=p_year;
 if not found then raise exception 'Household/year target not found'; end if;
 select coalesce(sum(amount),0) into total from public.hba_dues_receipts where household_uid=p_uid and dues_year=p_year;
 select * into old from public.hba_dues where uid=p_uid and year=p_year;
 perform public.hba_set_dues(p_year,p_uid,case when total=0 then 'unknown' when total>=p_annual then 'paid' else 'unpaid' end,coalesce(old.revision,0));
end $function$;
CREATE OR REPLACE FUNCTION public.hba_credit_dues_receipt(p_register uuid, p_uid text, p_year integer, p_amount numeric, p_annual_due numeric, p_payer_fingerprint text DEFAULT NULL::text, p_payer_label text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.hba_check_register; already numeric; total numeric; target numeric; old public.hba_dues;
 receipt uuid; result_status text; remembered public.hba_payer_households;
begin
 if not public.hba_can_edit_finance() then raise exception 'Treasurer permission required'; end if;
 if p_year not between 2020 and 2100 or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
 or p_annual_due is null or p_annual_due<=0 or p_annual_due<>round(p_annual_due,2)
 then raise exception 'Enter a valid dues year, positive payment and verified annual dues amount'; end if;
 if not exists(select 1 from public.hba_dues_households where uid=p_uid) then raise exception 'Select a mapped household'; end if;
 select * into r from public.hba_check_register where id=p_register for update;
 if r.id is null or r.direction<>'income' or r.category_code<>'dues' or r.voided
 then raise exception 'Select a non-voided annual-dues income entry'; end if;
 select coalesce(sum(amount),0) into already from public.hba_dues_receipts where register_id=r.id;
 if already+p_amount>r.amount then raise exception 'Household credits would exceed this check or deposit'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_year::text||'/'||p_uid,0));
 select * into old from public.hba_dues where year=p_year and uid=p_uid for update;
 select coalesce(sum(amount),0) into total from public.hba_dues_receipts where household_uid=p_uid and dues_year=p_year;
 if old.status='paid' and total=0 then
  raise exception 'This household was already marked paid outside the receipt ledger. Reconcile the older record before adding a new credit; do not count the same check twice.';
 end if;
 insert into public.hba_dues_targets(uid,year,annual_due) values(p_uid,p_year,p_annual_due) on conflict do nothing;
 select annual_due into target from public.hba_dues_targets where uid=p_uid and year=p_year;
 if target<>p_annual_due then raise exception 'Annual amount differs from the saved household/year target. Administrator review is required.'; end if;
 insert into public.hba_dues_receipts(register_id,household_uid,dues_year,amount)
 values(r.id,p_uid,p_year,p_amount) returning id into receipt;
 total=total+p_amount;
 result_status=case when total>=target then 'paid' else 'unpaid' end;
 perform public.hba_set_dues(p_year,p_uid,result_status,coalesce(old.revision,0));
 if p_payer_fingerprint is not null then
  if r.bank_account_id is null or p_payer_fingerprint !~ '^[0-9a-f]{64}$'
  or coalesce(length(trim(p_payer_label)),0) not between 1 and 120 then raise exception 'A remembered payer requires an HBA account, verified identity and label'; end if;
  -- Never reassign a shared or previously verified account without administrator review.
  insert into public.hba_payer_households(bank_account_id,fingerprint,label,household_uid)
  values(r.bank_account_id,p_payer_fingerprint,trim(p_payer_label),p_uid) on conflict do nothing;
  select * into remembered from public.hba_payer_households where bank_account_id=r.bank_account_id and fingerprint=p_payer_fingerprint;
  if remembered.household_uid<>p_uid then raise exception 'This payer is linked to another household. Do not overwrite it; ask the administrator to review the shared/changed account.'; end if;
 end if;
 return jsonb_build_object('receipt_id',receipt,'household_uid',p_uid,'dues_year',p_year,
  'credited_total',total,'annual_due',target,'remaining',greatest(target-total,0),'status',result_status);
end $function$;
CREATE OR REPLACE FUNCTION public.hba_delete_member(target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me public.hba_members; t public.hba_members; admins int; kind text; tomb text;
begin
  select * into me from public.hba_members where id=auth.uid();
  if me.id is null or not public.hba_is_board() then raise exception 'Board access required'; end if;
  select * into t from public.hba_members where id=target;
  if t.id is null or t.role='deleted' then raise exception 'Member not found'; end if;
  if t.id=me.id then raise exception 'You cannot delete your own account'; end if;
  if t.role in ('admin','board') and me.role<>'admin' then raise exception 'Only an administrator can delete a board member or administrator'; end if;
  if t.role='admin' then
    select count(*) into admins from public.hba_members where role='admin';
    if admins<=1 then raise exception 'The last administrator cannot be deleted'; end if;
  end if;
  kind := case when t.role='pending' then 'delete_request' else 'delete_member' end;
  tomb := 'former-'||left(t.id::text,8)||'@deleted.hamiltonbeach.invalid';
  insert into public.hba_account_audit(action,actor_id,actor_email,actor_name,target_id,target_email,target_name,target_role,target_household)
  values (kind,me.id,me.email,me.display_name,t.id,t.email,t.display_name,t.role,t.household_uid);
  -- Household links, alert subscriptions and office links go. Records they created stay.
  delete from public.hba_member_households where member_id=t.id;
  delete from public.hba_push_subscriptions where member_id=t.id;
  delete from public.hba_sms_preferences where member_id=t.id;
  delete from public.hba_volunteer_email_preferences where member_id=t.id;
  update public.hba_officeholders set member_id=null where member_id=t.id;
  -- The login itself: sessions revoked, password replaced with a random one, sign-in banned, address released.
  delete from auth.refresh_tokens where user_id=t.id::text;
  delete from auth.sessions where user_id=t.id;
  delete from auth.identities where user_id=t.id;
  update auth.users set email=tomb, encrypted_password=extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf',10)),
    banned_until='2999-01-01', phone=null, raw_user_meta_data=jsonb_build_object('display_name',t.display_name,'former_resident','true'),
    confirmation_token='', recovery_token='', email_change='', email_change_token_new='', email_change_token_current='', updated_at=now()
  where id=t.id;
  update public.hba_members set role='deleted', deleted_at=now(), email=tomb, household_uid=null, requested_household_uid=null,
    sms_request=null, request_note='', must_change_password=false where id=t.id;
  return jsonb_build_object('deleted',true,'kind',kind,'name',t.display_name,'email',t.email);
end $function$;
CREATE OR REPLACE FUNCTION public.hba_donation_leaderboard(p_year integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 with gifts as (
   select r.household_uid, r.fund, r.amount, r.payment_year, r.created_by, r.recognize_publicly,
          coalesce(nullif(trim(regexp_replace(h.address,'^\s*\d+[A-Za-z]?\s+','')),''),'Street not on file') as street
   from public.hba_payment_reports r
   left join public.hba_dues_households h on h.uid=r.household_uid
   where r.payment_kind='donation' and r.state='verified' and (p_year is null or r.payment_year=p_year)
 ),
 street_sizes as (
   select coalesce(nullif(trim(regexp_replace(address,'^\s*\d+[A-Za-z]?\s+','')),''),'Street not on file') as street, count(*) as households
   from public.hba_dues_households group by 1
 )
 select jsonb_build_object(
   'year', p_year,
   'totals', (select jsonb_build_object('amount', coalesce(sum(amount),0), 'gifts', count(*), 'households', count(distinct household_uid)) from gifts),
   'funds', coalesce((select jsonb_agg(jsonb_build_object('fund',fund,'total',total,'households',households,'gifts',gifts) order by total desc)
             from (select fund, sum(amount) total, count(distinct household_uid) households, count(*) gifts from gifts group by fund) f),'[]'::jsonb),
   'streets', coalesce((select jsonb_agg(jsonb_build_object('street',s.street,'total',coalesce(g.total,0),'donors',coalesce(g.donors,0),'households',s.households) order by coalesce(g.total,0) desc, s.street)
               from street_sizes s left join (select street, sum(amount) total, count(distinct household_uid) donors from gifts group by street) g on g.street=s.street),'[]'::jsonb),
   'honor_roll', coalesce((select jsonb_agg(jsonb_build_object('name',name,'street',street) order by name)
                  from (select coalesce(nullif(m.display_name,''),'A neighbor') as name, g.street
                        from gifts g left join public.hba_members m on m.id=g.created_by
                        where g.recognize_publicly group by g.household_uid, m.display_name, g.street) h),'[]'::jsonb),
   'anonymous_households', (select count(distinct household_uid) from gifts where not recognize_publicly),
   'generated_at', now()
 )
 where public.hba_is_member()
$function$;
CREATE OR REPLACE FUNCTION public.hba_dues_target_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 insert into public.hba_finance_audit(record_table,record_key,action,before_record,after_record)
 values(tg_table_name,new.year::text||'/'||new.uid,tg_op,
 case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_event_first_year_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
 if exists(select 1 from public.hba_series where id=new.series_id
 and first_year is not null and extract(year from new.event_date)<first_year)
 then raise exception 'Event date precedes the first year recorded for this series'; end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_finance_record_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare old_data jsonb; new_data jsonb;
begin
 old_data=case when tg_op='INSERT' then null else to_jsonb(old) end;
 new_data=case when tg_op='DELETE' then null else to_jsonb(new) end;
 insert into public.hba_finance_audit(record_table,record_key,action,before_record,after_record,changed_by)
 values(tg_table_name,coalesce(new_data->>'id',old_data->>'id',coalesce(new_data->>'year',old_data->>'year')||'/'||coalesce(new_data->>'category_code',old_data->>'category_code')),tg_op,old_data,new_data,auth.uid());
 return coalesce(new,old);
end $function$;
CREATE OR REPLACE FUNCTION public.hba_finance_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
 if not exists(select 1 from public.hba_finance_categories c where c.code=new.category_code and c.direction=new.direction) then
 raise exception 'Budget category does not match income/expense'; end if;
 new.updated_at=now(); return new;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_holds_office(p_positions text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.hba_role()='admin' or (public.hba_is_board() and exists(
  select 1 from public.hba_officeholders o where o.member_id=auth.uid() and o.position=any(p_positions)
  and (o.term_start is null or o.term_start<=current_date) and (o.term_end is null or o.term_end>=current_date)))
$function$;
CREATE OR REPLACE FUNCTION public.hba_household()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select household_uid from public.hba_members where id=auth.uid() and public.hba_is_member() $function$;
CREATE OR REPLACE FUNCTION public.hba_import_bank_statement(p_account uuid, p_start date, p_end date, p_closing numeric, p_books numeric, p_note text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare import_id uuid; row_value jsonb; added int:=0; affected int; duplicates int:=0;
begin
 if not public.hba_can_edit_finance() then raise exception 'Treasurer permission required'; end if;
 if p_start is null or p_end is null or p_end<p_start or p_end>current_date
 or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000
 then raise exception 'Invalid statement period or rows'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_account::text||'/bank-import',0));
 insert into public.hba_bank_imports(account_id,period_start,period_end,statement_closing,books_closing,source_note)
 values(p_account,p_start,p_end,p_closing,p_books,p_note) returning id into import_id;
 for row_value in select * from jsonb_array_elements(p_rows) loop
   insert into public.hba_bank_transactions(account_id,import_id,posted_date,amount,description,reference,fingerprint,payer_fingerprint)
   values(p_account,import_id,(row_value->>'posted_date')::date,(row_value->>'amount')::numeric,
          row_value->>'description',row_value->>'reference',row_value->>'fingerprint',row_value->>'payer_fingerprint')
   on conflict(account_id,fingerprint) do nothing;
   get diagnostics affected=row_count;
   added=added+affected;duplicates=duplicates+(1-affected);
 end loop;
 return jsonb_build_object('import_id',import_id,'added',added,'possible_duplicates_held',duplicates);
end $function$;
CREATE OR REPLACE FUNCTION public.hba_import_dues(p_year integer, p_rows jsonb)
 RETURNS SETOF hba_dues
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb;
begin
 if not public.hba_is_board() then raise exception 'Board access required'; end if;
 if jsonb_array_length(p_rows)>300 then raise exception 'Too many rows'; end if;
 for r in select value from jsonb_array_elements(p_rows) order by value->>'uid' loop
 return next public.hba_set_dues(p_year,r->>'uid',r->>'status',(r->>'revision')::int);
 end loop;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_is_board()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.hba_role() in ('board','admin') $function$;
CREATE OR REPLACE FUNCTION public.hba_is_governor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select public.hba_is_board() and exists(select 1 from public.hba_officeholders o where o.member_id=auth.uid() and o.position like '%Governor%'
  and (o.term_start is null or o.term_start<=current_date) and (o.term_end is null or o.term_end>=current_date)) $function$;
CREATE OR REPLACE FUNCTION public.hba_is_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.hba_role() in ('resident','board','admin') $function$;
CREATE OR REPLACE FUNCTION public.hba_is_president()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.hba_holds_office(array['President']) $function$;
CREATE OR REPLACE FUNCTION public.hba_is_secretary()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.hba_holds_office(array['Secretary']) $function$;
CREATE OR REPLACE FUNCTION public.hba_lock_roll()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare st text;
begin
 select state into st from public.hba_votes where id=coalesce(new.vote_id,old.vote_id);
 if st not in ('draft','noticed') then raise exception 'The voter roll is frozen once voting opens'; end if;
 return coalesce(new,old);
end $function$;
CREATE OR REPLACE FUNCTION public.hba_manage_member(member_id uuid, new_role text, new_household text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare oldrole text; req jsonb; topics text[];
begin
 if not public.hba_is_board() then raise exception 'Board access required'; end if;
 if new_role not in ('pending','resident','board','suspended') then raise exception 'Invalid role'; end if;
 select role,sms_request into oldrole,req from public.hba_members where id=member_id;
 if not found then raise exception 'Member not found'; end if;
 if oldrole='admin' then raise exception 'Initial administrator cannot be changed here'; end if;
 if public.hba_role()<>'admin' and (new_role='board' or oldrole='board') then raise exception 'Administrator required for board roles'; end if;
 update public.hba_members set role=new_role,household_uid=nullif(new_household,'') where id=member_id;
 if oldrole='pending' and new_role in ('resident','board') and req is not null and not exists(select 1 from public.hba_sms_preferences where hba_sms_preferences.member_id=hba_manage_member.member_id) then
  select array_agg(t) into topics from jsonb_array_elements_text(req->'topics') t where t in ('roads','beach','events','speed_bumps','votes','meetings','weather','general');
  if topics is not null and cardinality(topics) between 1 and 8 then
   insert into public.hba_sms_preferences(member_id,phone,topics,opted_in,consent_at) values(member_id,req->>'phone',topics,true,now());
   insert into public.hba_sms_consent_log(member_id,action,phone,topics,consent_version) values(member_id,'opt_in',req->>'phone',topics,'hba-sms-v1');
  end if;
 end if;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_my_dues_status(p_year integer)
 RETURNS TABLE(household_uid text, status text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select h.uid, coalesce(d.status,'unknown'), d.updated_at
 from (select public.hba_household() as uid union select household_uid from public.hba_member_households where member_id=auth.uid()) h
 left join public.hba_dues d on d.uid=h.uid and d.year=p_year
 where h.uid is not null and public.hba_is_member()
$function$;
CREATE OR REPLACE FUNCTION public.hba_newsletter_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.updated_at=now(); return new; end $function$;
CREATE OR REPLACE FUNCTION public.hba_owns_issue(issue uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.hba_is_member() and exists(select 1 from public.hba_issues i where i.id=issue and i.created_by=auth.uid()) $function$;
CREATE OR REPLACE FUNCTION public.hba_password_changed()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me public.hba_members;
begin
  select * into me from public.hba_members where id=auth.uid();
  if me.id is null then raise exception 'Sign in first'; end if;
  update public.hba_members set must_change_password=false where id=me.id;
  insert into public.hba_account_audit(action,actor_id,actor_email,actor_name,target_id,target_email,target_name,target_role,target_household)
  values ('change_password',me.id,me.email,me.display_name,me.id,me.email,me.display_name,me.role,me.household_uid);
end $function$;
CREATE OR REPLACE FUNCTION public.hba_poll_tally(p uuid)
 RETURNS TABLE(choice text, votes bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select v.choice, count(*) from public.hba_poll_votes v where v.poll_id = p and auth.uid() is not null group by v.choice;
$function$;
CREATE OR REPLACE FUNCTION public.hba_procedures_confirmed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select exists(select 1 from public.hba_voting_procedures where id=1 and confirmed_at is not null) $function$;
CREATE OR REPLACE FUNCTION public.hba_protect_credited_register()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if exists(select 1 from public.hba_dues_receipts where register_id=old.id)
 and (new.amount is distinct from old.amount or new.direction is distinct from old.direction
 or new.category_code is distinct from old.category_code or new.voided is distinct from old.voided
 or new.bank_account_id is distinct from old.bank_account_id) then
 raise exception 'Administrator must reverse household receipt credits before changing this entry'; end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_protect_scheduler_office()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
 if public.hba_role()<>'admin' and (
   (new.position in ('President','Secretary') and new.member_id is not null)
   or (tg_op='UPDATE' and old.position in ('President','Secretary') and old.member_id is not null)
 ) then raise exception 'Administrator required to change a linked scheduling office'; end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_push_targets()
 RETURNS TABLE(endpoint text, p256dh text, auth text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.endpoint, s.p256dh, s.auth
  from public.hba_push_subscriptions s
  join public.hba_members m on m.id = s.member_id
  where m.role = 'admin' and auth.uid() is not null;
$function$;
CREATE OR REPLACE FUNCTION public.hba_record_ballot(p_vote uuid, p_unit text, p_choice text, p_source text, p_recuse boolean DEFAULT false, p_reason text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v public.hba_votes; r public.hba_vote_roll; code text;
begin
 if not public.hba_can_certify() then raise exception 'The linked, in-term Secretary records meeting and proxy ballots'; end if;
 select * into v from public.hba_votes where id=p_vote for update;
 if not found or v.state<>'open' then raise exception 'This vote is not open'; end if;
 if p_source not in ('in_person','proxy') then raise exception 'Record in-person or proxy ballots only'; end if;
 select * into r from public.hba_vote_roll where vote_id=p_vote and unit_key=p_unit;
 if not found or not r.eligible then raise exception 'That unit is not eligible on the frozen roll'; end if;
 if p_source='proxy' and not exists(select 1 from public.hba_vote_proxies p where p.vote_id=p_vote and p.household_uid=r.household_uid) then raise exception 'File the written proxy before recording a proxy ballot'; end if;
 if exists(select 1 from public.hba_ballots where vote_id=p_vote and unit_key=r.unit_key) then raise exception 'A ballot has already been recorded for %', r.label; end if;
 if not p_recuse and not (v.options ? p_choice) then raise exception 'Choose one of the listed options'; end if;
 code=upper(substr(md5(random()::text||clock_timestamp()::text),1,10));
 insert into public.hba_ballots(vote_id,unit_key,cast_by,source,choice,weight,receipt_code,recused,recusal_reason,recorded_by)
 values(p_vote,r.unit_key,null,p_source,case when v.secret_ballot or p_recuse then null else p_choice end,r.weight,code,p_recuse,left(p_reason,500),auth.uid());
 if v.secret_ballot and not p_recuse then insert into public.hba_ballot_choices(vote_id,choice,weight) values(p_vote,p_choice,r.weight); end if;
 return code;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_remove_dues_receipt(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d public.hba_dues_receipts; r uuid; total numeric; target numeric; old public.hba_dues;
begin
 if public.hba_role()<>'admin' then raise exception 'Administrator permission required'; end if;
 select register_id into r from public.hba_dues_receipts where id=p_id;
 if r is null then return false; end if;
 perform 1 from public.hba_check_register where id=r for update;
 select * into d from public.hba_dues_receipts where id=p_id for update;
 if d.id is null then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(d.dues_year::text||'/'||d.household_uid,0));
 delete from public.hba_dues_receipts where id=d.id;
 select coalesce(sum(amount),0) into total from public.hba_dues_receipts where household_uid=d.household_uid and dues_year=d.dues_year;
 select annual_due into target from public.hba_dues_targets where uid=d.household_uid and year=d.dues_year;
 select * into old from public.hba_dues where uid=d.household_uid and year=d.dues_year;
 perform public.hba_set_dues(d.dues_year,d.household_uid,
 case when total=0 then 'unknown' when total>=target then 'paid' else 'unpaid' end,coalesce(old.revision,0));
 return true;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_reset_password(target uuid, new_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me public.hba_members; t public.hba_members; was_unconfirmed boolean;
begin
  select * into me from public.hba_members where id=auth.uid();
  if me.id is null or not public.hba_is_board() then raise exception 'Board access required'; end if;
  select * into t from public.hba_members where id=target;
  if t.id is null or t.role='deleted' then raise exception 'Member not found'; end if;
  if t.id=me.id then raise exception 'Use Change password for your own account'; end if;
  if t.role in ('admin','board') and me.role<>'admin' then raise exception 'Only an administrator can reset a board member''s password'; end if;
  if length(new_password)<12 then raise exception 'Temporary password too short'; end if;
  select email_confirmed_at is null into was_unconfirmed from auth.users where id=t.id;
  -- The board member has verified the resident in person or by phone, which also stands in for the email confirmation.
  update auth.users set encrypted_password=extensions.crypt(new_password, extensions.gen_salt('bf',10)),
    email_confirmed_at=coalesce(email_confirmed_at,now()), banned_until=null, updated_at=now() where id=t.id;
  delete from auth.refresh_tokens where user_id=t.id::text;
  delete from auth.sessions where user_id=t.id;
  update public.hba_members set must_change_password=true where id=t.id;
  insert into public.hba_account_audit(action,actor_id,actor_email,actor_name,target_id,target_email,target_name,target_role,target_household,note)
  values ('reset_password',me.id,me.email,me.display_name,t.id,t.email,t.display_name,t.role,t.household_uid,
          case when was_unconfirmed then 'Email address marked confirmed by the board at the same time.' else '' end);
  return jsonb_build_object('reset',true,'name',t.display_name,'email',t.email,'email_was_unconfirmed',was_unconfirmed);
end $function$;
CREATE OR REPLACE FUNCTION public.hba_review_bid(p_id uuid, p_state text, p_note text, p_revision integer)
 RETURNS hba_bids
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare old public.hba_bids; result public.hba_bids;
begin
 if not public.hba_is_board() then raise exception 'Board access required'; end if;
 if p_state not in ('submitted','reviewing','clarification','shortlisted','selected','declined','withdrawn')
 or length(trim(coalesce(p_note,''))) not between 1 and 12000 then raise exception 'Choose a status and record a reason'; end if;
 select * into old from public.hba_bids where id=p_id for update;
 if not found then raise exception 'Bid not found'; end if;
 -- Lock the request as well so simultaneous competing selections cannot both win.
 perform 1 from public.hba_bid_requests where id=old.request_id for update;
 if old.revision<>p_revision then raise exception 'Bid changed. Refresh before reviewing'; end if;
 if p_state='selected' and exists(select 1 from public.hba_bids where request_id=old.request_id and state='selected' and id<>p_id)
 then raise exception 'A bid is already selected. Change that selection first'; end if;
 update public.hba_bids set state=p_state,revision=revision+1 where id=p_id returning * into result;
 insert into public.hba_bid_reviews(bid_id,previous_state,new_state,note)
 values(p_id,old.state,p_state,trim(p_note));
 return result;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_review_document_item(p_id uuid, p_action text, p_payload jsonb DEFAULT NULL::jsonb)
 RETURNS hba_document_suggestions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare item public.hba_document_suggestions; p jsonb; target uuid; k text; note text;
 yr int; code text; series_uuid uuid;
begin
 if not public.hba_is_board() then raise exception 'Board access required'; end if;
 select * into item from public.hba_document_suggestions where id=p_id for update;
 if not found then raise exception 'Suggestion not found'; end if;
 if item.state<>'pending' then return item; end if; -- idempotent, locked
 if p_action not in ('apply','dismiss') then raise exception 'Invalid review action'; end if;
 if p_action='dismiss' then
   update public.hba_document_suggestions set state='dismissed',reviewed_by=auth.uid(),reviewed_at=now()
   where id=p_id returning * into item; return item;
 end if;
 p=coalesce(p_payload,item.payload);
 if jsonb_typeof(p)<>'object' or octet_length(p::text)>20000 then raise exception 'Invalid review fields'; end if;
 note=format('Source document %s, page %s. Board-reviewed extraction.',item.document_id,item.evidence_page);
 if item.kind='budget' then
   if not public.hba_can_edit_finance() then raise exception 'Treasurer or administrator required'; end if;
   yr=(p->>'year')::int; code=p->>'category_code';
   -- Never overwrite an existing budget or promote an extracted number to adopted.
   if exists(select 1 from public.hba_category_budgets where year=yr and category_code=code)
   then raise exception 'Budget line already exists; compare it in Check register instead of overwriting'; end if;
   insert into public.hba_category_budgets(year,category_code,amount,basis,source_note)
   values(yr,code,(p->>'amount')::numeric,'draft',note||' '||left(coalesce(p->>'detail',''),1500));
   k=yr::text||'/'||code; item.target_table='hba_category_budgets';
 elsif item.kind='event' then
   if (p->>'state') not in ('scheduled','held','cancelled') then raise exception 'Choose event status'; end if;
   series_uuid=(p->>'series_id')::uuid;
   if exists(select 1 from public.hba_events where series_id=series_uuid and event_date=(p->>'event_date')::date)
   then raise exception 'This event date already exists; edit the existing event'; end if;
   insert into public.hba_events(series_id,title,event_date,event_time,rain_date,location,description,state,planning_only)
   values(series_uuid,p->>'title',(p->>'event_date')::date,nullif(p->>'event_time','')::time,
    nullif(p->>'rain_date','')::date,coalesce(p->>'location',''),coalesce(p->>'detail','')||E'\n'||note,
    p->>'state',coalesce((p->>'planning_only')::boolean,true)) returning id into target;
   item.target_table='hba_events'; k=target::text;
 elsif item.kind='agenda' then
   insert into public.hba_agenda_items(title,description,audience,state)
   values(p->>'title',coalesce(p->>'detail','')||E'\n'||note,'board','submitted') returning id into target;
   item.target_table='hba_agenda_items'; k=target::text;
 elsif item.kind='decision' then
   if (p->>'recorded_outcome') not in ('proposed','approved','rejected','deferred')
     or (p->>'decision_type') not in ('board','capital','dues','amendment','emergency')
   then raise exception 'Choose a decision type and recorded outcome'; end if;
   insert into public.hba_decisions(title,meeting_date,decision_type,motion,recorded_outcome,review_notes,minutes_id)
   values(p->>'title',(p->>'meeting_date')::date,p->>'decision_type',p->>'detail',p->>'recorded_outcome',
     note,item.document_id) returning id into target;
   item.target_table='hba_decisions'; k=target::text;
 elsif item.kind='work' then
   insert into public.hba_work(title,contractor,location,work_date,description,state)
   values(p->>'title',coalesce(p->>'contractor',''),coalesce(p->>'location',''),
    nullif(p->>'work_date','')::date,coalesce(p->>'detail','')||E'\n'||note,'planned') returning id into target;
   item.target_table='hba_work'; k=target::text;
 elsif item.kind='house_history' then
   -- Exact map-index matching is also checked by the bridge; this is not title certification.
   if coalesce(p->>'household_uid','')!~'^M_[0-9]+_[0-9]+$' then raise exception 'Choose a mapped household'; end if;
   insert into public.hba_house_history(household_uid,title,story,history_year,status)
   values(p->>'household_uid',p->>'title',coalesce(p->>'detail','')||E'\n'||note,
    nullif(p->>'history_year','')::int,'pending') returning id into target;
   item.target_table='hba_house_history'; k=target::text;
 else
   insert into public.hba_document_facts(document_id,kind,title,detail,fact_date,fact_year,location,evidence_page)
   values(item.document_id,item.kind,p->>'title',p->>'detail',nullif(p->>'fact_date','')::date,
    nullif(p->>'fact_year','')::int,coalesce(p->>'location',''),item.evidence_page) returning id into target;
   item.target_table='hba_document_facts'; k=target::text;
 end if;
 update public.hba_document_suggestions set state='applied',target_table=item.target_table,target_key=k,
  reviewed_by=auth.uid(),reviewed_at=now(),review_payload=p where id=p_id returning * into item;
 return item;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select case when member.role in ('board','admin') and
 (coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-hba-view')='resident'
 then 'resident' else member.role end
 from public.hba_members member join auth.users u on u.id=member.id
 where member.id=auth.uid() and u.email_confirmed_at is not null
 union all select 'anonymous' where not exists(
 select 1 from public.hba_members member join auth.users u on u.id=member.id
 where member.id=auth.uid() and u.email_confirmed_at is not null)
$function$;
CREATE OR REPLACE FUNCTION public.hba_save_sms_preferences(p_phone text, p_topics text[], p_opted_in boolean, p_consent boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare previous public.hba_sms_preferences; action_name text;
begin
 if not public.hba_is_member() then raise exception 'Approved member access required'; end if;
 if p_opted_in and not coalesce(p_consent,false) then raise exception 'Explicit SMS consent is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'/sms',0));
 select * into previous from public.hba_sms_preferences where member_id=auth.uid();
 action_name=case when not p_opted_in then 'opt_out' when coalesce(previous.opted_in,false) then 'update' else 'opt_in' end;
 insert into public.hba_sms_preferences(member_id,phone,topics,opted_in,consent_at)
 values(auth.uid(),p_phone,p_topics,p_opted_in,case when p_opted_in then now() else null end)
 on conflict(member_id) do update set phone=excluded.phone,topics=excluded.topics,opted_in=excluded.opted_in,
 consent_at=case when excluded.opted_in then now() else hba_sms_preferences.consent_at end,updated_at=now();
 insert into public.hba_sms_consent_log(member_id,action,phone,topics,consent_version)
 values(auth.uid(),action_name,p_phone,p_topics,'hba-sms-v1');
end $function$;
CREATE OR REPLACE FUNCTION public.hba_set_dues(p_year integer, p_uid text, p_status text, p_revision integer)
 RETURNS hba_dues
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare old public.hba_dues; result public.hba_dues;
begin
 if not public.hba_is_board() then raise exception 'Board access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_year::text||'/'||p_uid,0));
 select * into old from public.hba_dues where year=p_year and uid=p_uid for update;
 if coalesce(old.revision,0)<>p_revision then raise exception 'Revision conflict: refresh the registry'; end if;
 insert into public.hba_dues(year,uid,status,revision,updated_by) values(p_year,p_uid,p_status,p_revision+1,auth.uid())
 on conflict(year,uid) do update set status=excluded.status,revision=excluded.revision,updated_at=now(),updated_by=auth.uid() returning * into result;
 insert into public.hba_dues_audit(year,uid,old_status,new_status) values(p_year,p_uid,old.status,p_status);
 return result;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_sms_counts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if not public.hba_is_board() then raise exception 'Board access required'; end if;
 return jsonb_build_object('opted_in',(select count(*) from public.hba_sms_preferences where opted_in),
 'topics',(select coalesce(jsonb_object_agg(topic,n),'{}'::jsonb) from
 (select topic,count(*) n from public.hba_sms_preferences s cross join unnest(s.topics) topic where opted_in group by topic) totals));
end $function$;
CREATE OR REPLACE FUNCTION public.hba_supper_date(p_year integer)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
 select make_date(p_year,8,1)+((6-extract(dow from make_date(p_year,8,1))::int+7)%7)+14
$function$;
CREATE OR REPLACE FUNCTION public.hba_sync_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare meta jsonb; req jsonb;
begin
 meta=coalesce(new.raw_user_meta_data,'{}'::jsonb);
 req=case when meta ? 'sms_phone' and meta->>'sms_phone' ~ '^\+1[2-9][0-9]{9}$' and jsonb_typeof(meta->'sms_topics')='array' and (meta->>'sms_consent')='true'
  then jsonb_build_object('phone',meta->>'sms_phone','topics',meta->'sms_topics') else null end;
 insert into public.hba_members(id,email,display_name,role,requested_household_uid,request_note,sms_request,requested_at)
 values(new.id,lower(new.email),left(coalesce(meta->>'display_name',''),120),
  case when lower(new.email)='admin@example.com' and new.email_confirmed_at is not null then 'admin' else 'pending' end,
  nullif(left(coalesce(meta->>'requested_household_uid',''),100),''),left(coalesce(meta->>'request_note',''),1000),req,now())
 on conflict(id) do update set email=excluded.email,
  role=case when lower(new.email)='admin@example.com' and new.email_confirmed_at is not null then 'admin' else hba_members.role end,
  requested_household_uid=coalesce(hba_members.requested_household_uid,excluded.requested_household_uid),
  request_note=case when hba_members.request_note='' then excluded.request_note else hba_members.request_note end,
  sms_request=coalesce(hba_members.sms_request,excluded.sms_request);
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_tally(p_vote uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v public.hba_votes; counts jsonb; n_participating int; n_able int; n_proxies int; n_online int; n_recused int;
begin
 select * into v from public.hba_votes where id=p_vote;
 if not found then raise exception 'Vote not found'; end if;
 if not (public.hba_is_board() or (public.hba_is_member() and (v.kind='advisory' or v.state in ('certified','confirmed')))) then raise exception 'Tally not available yet'; end if;
 if v.secret_ballot then
  select coalesce(jsonb_object_agg(choice,total),'{}'::jsonb) into counts from (select choice,sum(weight) total from public.hba_ballot_choices where vote_id=p_vote group by choice) t;
 else
  select coalesce(jsonb_object_agg(choice,total),'{}'::jsonb) into counts from (select choice,sum(weight) total from public.hba_ballots where vote_id=p_vote and not recused and choice is not null group by choice) t;
 end if;
 select count(*),count(*) filter(where not recused),count(*) filter(where source='proxy'),count(*) filter(where source='online'),count(*) filter(where recused)
  into n_participating,n_able,n_proxies,n_online,n_recused from public.hba_ballots b where b.vote_id=p_vote;
 return jsonb_build_object('counts',counts,'units_participating',n_participating,'units_able',n_able,'proxies',n_proxies,'online',n_online,'recused',n_recused,
  'eligible_units',(select count(*) from public.hba_vote_roll where vote_id=p_vote and eligible),'secret',v.secret_ballot);
end $function$;
CREATE OR REPLACE FUNCTION public.hba_validate_bid()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare request public.hba_bid_requests;
begin
 select * into request from public.hba_bid_requests where id=new.request_id;
 if not found then raise exception 'Bid request not found'; end if;
 if not public.hba_is_board() and (request.state<>'open' or (request.deadline is not null and request.deadline<current_date))
 then raise exception 'This request is not accepting submissions'; end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_validate_election()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
 if new.meeting_id is not null and not exists(select 1 from public.hba_meetings where id=new.meeting_id
  and extract(year from meeting_date)=new.year and extract(month from meeting_date)=8)
 then raise exception 'Choose the August meeting in this election year'; end if;
 if new.state='meeting_scheduled' and new.meeting_id is null then raise exception 'Link the actual August meeting first'; end if;
 if new.state='results_recorded' and (length(trim(new.results))=0 or length(trim(new.source_note))=0)
 then raise exception 'Recorded results require results text and supporting minutes/source'; end if;
 new.updated_by=auth.uid();new.updated_at=now();return new;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_validate_proxy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v public.hba_votes; mtg public.hba_meetings;
begin
 select * into v from public.hba_votes where id=new.vote_id;
 if v.kind='advisory' or v.electorate not in ('households','street') then raise exception 'Proxies apply to membership votes only'; end if;
 if v.state not in ('noticed','open') then raise exception 'Proxies are filed after notice and before the vote closes'; end if;
 select * into mtg from public.hba_meetings where id=v.meeting_id;
 if new.filed_at>(mtg.meeting_date+mtg.meeting_time) at time zone 'America/New_York' then raise exception 'Written proxies must reach the Secretary before the meeting starts'; end if;
 if new.filed_at>now()+interval '5 minutes' then raise exception 'Filing time cannot be in the future'; end if;
 if not exists(select 1 from public.hba_vote_roll r where r.vote_id=new.vote_id and r.household_uid=new.household_uid and r.eligible) then raise exception 'That household is not on the eligible roll for this vote'; end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_validate_results()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v public.hba_votes;
begin
 select * into v from public.hba_votes where id=new.vote_id;
 if tg_op='INSERT' then
  if v.state<>'closed' then raise exception 'Certify only a closed vote'; end if;
  if not public.hba_can_certify() then raise exception 'The linked, in-term Secretary certifies results'; end if;
  if new.confirmed_by is not null then raise exception 'Confirmation is a separate step'; end if;
  new.certified_by=auth.uid(); new.certified_at=now();
  return new;
 end if;
 if old.confirmed_at is not null then raise exception 'Confirmed results are final; add an annotation instead'; end if;
 if new.confirmed_at is not null then
  if not public.hba_can_call_vote() then raise exception 'The linked, in-term President confirms results'; end if;
  if auth.uid()=old.certified_by then raise exception 'The certifying secretary cannot also confirm'; end if;
  if v.created_by=auth.uid() and v.kind<>'advisory' and public.hba_role()<>'admin' and not exists(select 1 from public.hba_officeholders o where o.position='Secretary' and o.member_id is not null and o.member_id<>auth.uid()) then
   raise exception 'The proposing president cannot confirm while no separate Secretary is linked'; end if;
  new.confirmed_by=auth.uid(); new.confirmed_at=now();
  if new.outcome='tie_pending' then raise exception 'Resolve the tie before confirming'; end if;
 elsif (new.tally,new.units_participating,new.units_able,new.quorum_met,new.outcome,new.rule_applied) is distinct from (old.tally,old.units_participating,old.units_able,old.quorum_met,old.outcome,old.rule_applied) and not public.hba_can_certify() then
  raise exception 'Only the Secretary revises an uncertified tally';
 end if;
 if new.tie_break_choice is distinct from old.tie_break_choice then
  if not v.president_tie_break then raise exception 'No presidential tie-break applies to this vote'; end if;
  if not public.hba_is_president() then raise exception 'Only the linked President casts the deciding vote'; end if;
  if old.outcome<>'tie_pending' then raise exception 'There is no tie to break'; end if;
  new.tie_break_by=auth.uid(); new.tie_break_at=now();
 end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_validate_vote()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare mtg public.hba_meetings; allowed text[];
begin
 new.updated_at=now();
 if tg_op='INSERT' then
  if new.state<>'draft' then raise exception 'New votes start as drafts'; end if;
  if new.kind='advisory' then
   if new.electorate<>'all_members' or new.threshold<>'none' or new.quorum_required<>0 then raise exception 'Advisory polls have no quorum or threshold'; end if;
  elsif new.electorate='all_members' then raise exception 'A formal vote needs a defined electorate'; end if;
  return new;
 end if;
 if old.state in ('confirmed','withdrawn') then raise exception 'A % vote cannot change', old.state; end if;
 if old.state<>'draft' and (new.kind,new.motion,new.electorate,new.street,new.threshold,new.quorum_required,new.secret_ballot,new.president_tie_break,new.options,new.meeting_id,new.classification)
   is distinct from (old.kind,old.motion,old.electorate,old.street,old.threshold,old.quorum_required,old.secret_ballot,old.president_tie_break,old.options,old.meeting_id,old.classification)
 then raise exception 'The motion, electorate, rules and meeting are locked once notice is published'; end if;
 if new.state<>old.state then
  allowed=case old.state when 'draft' then array['noticed','withdrawn','deferred','open'] when 'noticed' then array['open','withdrawn','deferred']
   when 'open' then array['closed'] when 'closed' then array['certified','open'] when 'certified' then array['confirmed','closed'] else array[]::text[] end;
  if not new.state=any(allowed) then raise exception 'Cannot move a % vote to %', old.state, new.state; end if;
  if old.state='draft' and new.state='open' and new.kind<>'advisory' then raise exception 'Publish notice and freeze the voter roll before opening a formal vote'; end if;
  if new.state='noticed' then
   if new.roll_frozen_at is null then raise exception 'Freeze the voter roll when publishing notice'; end if;
   if new.kind<>'advisory' then
    select * into mtg from public.hba_meetings where id=new.meeting_id;
    if not found or mtg.state='cancelled' then raise exception 'Link an actual scheduled meeting'; end if;
    if new.electorate in ('governors','board_and_president') and mtg.audience<>'board' then raise exception 'Board votes belong to a Board of Governors meeting'; end if;
    if new.electorate in ('households','street') and mtg.audience<>'general' then raise exception 'Membership votes belong to a general membership meeting'; end if;
    if new.kind='amendment' and extract(month from mtg.meeting_date) not in (6,8) then raise exception 'Bylaw amendments are voted at an annual (June or August) meeting'; end if;
   end if;
   new.notice_at=coalesce(new.notice_at,now());
  end if;
  if new.state='open' then new.opens_at=coalesce(new.opens_at,now()); end if;
  if new.state='closed' and old.state='open' then new.closes_at=now(); end if;
  if new.state='certified' and not exists(select 1 from public.hba_vote_results r where r.vote_id=new.id) then raise exception 'Record certified results first'; end if;
  if new.state='confirmed' and not exists(select 1 from public.hba_vote_results r where r.vote_id=new.id and r.confirmed_at is not null) then raise exception 'The president must confirm the certified results'; end if;
 end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_volunteer_counts()
 RETURNS TABLE(task_id uuid, signed_up bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select t.id,count(s.id) from public.hba_volunteer_tasks t
 left join public.hba_volunteer_signups s on s.task_id=t.id and s.state='signed_up'
 where t.state in ('published','closed','complete') or (auth.role()='authenticated' and public.hba_is_board())
 group by t.id
$function$;
CREATE OR REPLACE FUNCTION public.hba_volunteer_signup(p_task uuid, p_join boolean, p_note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare task public.hba_volunteer_tasks; already boolean;
begin
 if not public.hba_is_member() then raise exception 'Approved member access required'; end if;
 if p_join is null or p_note is null or length(p_note)>1000 then raise exception 'Check signup details'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_task::text||'/volunteer',0));
 select * into task from public.hba_volunteer_tasks where id=p_task for update;
 if not found then raise exception 'Task not found'; end if;
 if p_join then
   if task.state<>'published' then raise exception 'This task is not accepting volunteers'; end if;
   select exists(select 1 from public.hba_volunteer_signups where task_id=p_task and member_id=auth.uid() and state='signed_up') into already;
   if not already and (select count(*) from public.hba_volunteer_signups where task_id=p_task and state='signed_up')>=task.capacity then raise exception 'This task is full'; end if;
   insert into public.hba_volunteer_signups(task_id,member_id,note,state) values(p_task,auth.uid(),p_note,'signed_up')
   on conflict(task_id,member_id) do update set note=excluded.note,state='signed_up';
 else
   update public.hba_volunteer_signups set state='withdrawn' where task_id=p_task and member_id=auth.uid();
 end if;
end $function$;
CREATE OR REPLACE FUNCTION public.hba_volunteer_task_visible(p_state text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select p_state in ('published','closed','complete') or (auth.uid() is not null and public.hba_is_board())
$function$;
CREATE OR REPLACE FUNCTION public.hba_vote_counts()
 RETURNS TABLE(vote_id uuid, listed integer, eligible integer, ballots integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select v.id,
         (select count(*) from public.hba_vote_roll r where r.vote_id=v.id)::int,
         (select count(*) from public.hba_vote_roll r where r.vote_id=v.id and r.eligible)::int,
         (select count(*) from public.hba_ballots b where b.vote_id=v.id)::int
  from public.hba_votes v
  where public.hba_is_member() and (v.state<>'draft' or public.hba_is_board());
$function$;

-- ===== Triggers =====
-- Supabase's own triggers on storage.buckets/objects are not listed: every project already has them.
CREATE TRIGGER bank_import_audit AFTER INSERT OR DELETE ON public.hba_bank_imports FOR EACH ROW EXECUTE FUNCTION hba_finance_record_audit();
CREATE TRIGGER bank_match_audit AFTER INSERT OR DELETE ON public.hba_bank_matches FOR EACH ROW EXECUTE FUNCTION hba_finance_record_audit();
CREATE TRIGGER bank_validate_match BEFORE INSERT ON public.hba_bank_matches FOR EACH ROW EXECUTE FUNCTION hba_bank_validate_match();
CREATE TRIGGER bank_validate_transaction BEFORE INSERT ON public.hba_bank_transactions FOR EACH ROW EXECUTE FUNCTION hba_bank_validate_transaction();
CREATE TRIGGER hba_bid_validate BEFORE INSERT ON public.hba_bids FOR EACH ROW EXECUTE FUNCTION hba_validate_bid();
CREATE TRIGGER budget_line_audit AFTER INSERT OR DELETE OR UPDATE ON public.hba_category_budgets FOR EACH ROW EXECUTE FUNCTION hba_finance_record_audit();
CREATE TRIGGER category_budget_stamp BEFORE UPDATE ON public.hba_category_budgets FOR EACH ROW EXECUTE FUNCTION hba_newsletter_stamp();
CREATE TRIGGER finance_validate BEFORE INSERT OR UPDATE ON public.hba_check_register FOR EACH ROW EXECUTE FUNCTION hba_finance_validate();
CREATE TRIGGER protect_credited_register BEFORE UPDATE ON public.hba_check_register FOR EACH ROW EXECUTE FUNCTION hba_protect_credited_register();
CREATE TRIGGER protect_matched_register BEFORE UPDATE ON public.hba_check_register FOR EACH ROW EXECUTE FUNCTION hba_bank_protect_matched_register();
CREATE TRIGGER register_audit AFTER INSERT OR DELETE OR UPDATE ON public.hba_check_register FOR EACH ROW EXECUTE FUNCTION hba_finance_record_audit();
CREATE TRIGGER dues_receipt_audit AFTER INSERT OR DELETE ON public.hba_dues_receipts FOR EACH ROW EXECUTE FUNCTION hba_finance_record_audit();
CREATE TRIGGER dues_target_audit AFTER INSERT OR UPDATE ON public.hba_dues_targets FOR EACH ROW EXECUTE FUNCTION hba_dues_target_audit();
CREATE TRIGGER election_audit AFTER INSERT OR DELETE OR UPDATE ON public.hba_elections FOR EACH ROW EXECUTE FUNCTION hba_audit_election();
CREATE TRIGGER election_validate BEFORE INSERT OR UPDATE ON public.hba_elections FOR EACH ROW EXECUTE FUNCTION hba_validate_election();
CREATE TRIGGER event_first_year_guard BEFORE INSERT OR UPDATE ON public.hba_events FOR EACH ROW EXECUTE FUNCTION hba_event_first_year_guard();
CREATE TRIGGER hba_event_recurrence BEFORE INSERT OR UPDATE ON public.hba_events FOR EACH ROW EXECUTE FUNCTION hba_apply_event_recurrence();
CREATE TRIGGER minutes_stamp BEFORE UPDATE ON public.hba_meeting_minutes FOR EACH ROW EXECUTE FUNCTION hba_newsletter_stamp();
CREATE TRIGGER newsletter_stamp BEFORE UPDATE ON public.hba_newsletters FOR EACH ROW EXECUTE FUNCTION hba_newsletter_stamp();
CREATE TRIGGER protect_scheduler_office BEFORE INSERT OR UPDATE ON public.hba_officeholders FOR EACH ROW EXECUTE FUNCTION hba_protect_scheduler_office();
CREATE TRIGGER payer_household_audit AFTER INSERT OR DELETE ON public.hba_payer_households FOR EACH ROW EXECUTE FUNCTION hba_finance_record_audit();
CREATE TRIGGER sms_draft_stamp BEFORE UPDATE ON public.hba_sms_drafts FOR EACH ROW EXECUTE FUNCTION hba_newsletter_stamp();
CREATE TRIGGER volunteer_email_stamp BEFORE UPDATE ON public.hba_volunteer_email_preferences FOR EACH ROW EXECUTE FUNCTION hba_newsletter_stamp();
CREATE TRIGGER volunteer_signup_stamp BEFORE UPDATE ON public.hba_volunteer_signups FOR EACH ROW EXECUTE FUNCTION hba_newsletter_stamp();
CREATE TRIGGER volunteer_task_stamp BEFORE UPDATE ON public.hba_volunteer_tasks FOR EACH ROW EXECUTE FUNCTION hba_newsletter_stamp();
CREATE TRIGGER proxy_audit AFTER INSERT OR DELETE OR UPDATE ON public.hba_vote_proxies FOR EACH ROW EXECUTE FUNCTION hba_audit_vote_tables();
CREATE TRIGGER proxy_validate BEFORE INSERT OR UPDATE ON public.hba_vote_proxies FOR EACH ROW EXECUTE FUNCTION hba_validate_proxy();
CREATE TRIGGER results_audit AFTER INSERT OR DELETE OR UPDATE ON public.hba_vote_results FOR EACH ROW EXECUTE FUNCTION hba_audit_vote_tables();
CREATE TRIGGER results_validate BEFORE INSERT OR UPDATE ON public.hba_vote_results FOR EACH ROW EXECUTE FUNCTION hba_validate_results();
CREATE TRIGGER roll_audit AFTER INSERT OR DELETE OR UPDATE ON public.hba_vote_roll FOR EACH ROW EXECUTE FUNCTION hba_audit_vote_tables();
CREATE TRIGGER roll_lock BEFORE INSERT OR DELETE OR UPDATE ON public.hba_vote_roll FOR EACH ROW EXECUTE FUNCTION hba_lock_roll();
CREATE TRIGGER vote_audit AFTER INSERT OR DELETE OR UPDATE ON public.hba_votes FOR EACH ROW EXECUTE FUNCTION hba_audit_vote_tables();
CREATE TRIGGER vote_validate BEFORE INSERT OR UPDATE ON public.hba_votes FOR EACH ROW EXECUTE FUNCTION hba_validate_vote();
CREATE TRIGGER hba_member_sync AFTER INSERT OR UPDATE OF email, email_confirmed_at ON auth.users FOR EACH ROW EXECUTE FUNCTION hba_sync_member();

-- ===== Row-level security =====
alter table public.hba_account_audit enable row level security;
alter table public.hba_agenda_items enable row level security;
alter table public.hba_ballot_choices enable row level security;
alter table public.hba_ballots enable row level security;
alter table public.hba_bank_accounts enable row level security;
alter table public.hba_bank_imports enable row level security;
alter table public.hba_bank_matches enable row level security;
alter table public.hba_bank_summaries enable row level security;
alter table public.hba_bank_transactions enable row level security;
alter table public.hba_bid_files enable row level security;
alter table public.hba_bid_requests enable row level security;
alter table public.hba_bid_reviews enable row level security;
alter table public.hba_bids enable row level security;
alter table public.hba_category_budgets enable row level security;
alter table public.hba_check_register enable row level security;
alter table public.hba_cleaning_plan enable row level security;
alter table public.hba_decisions enable row level security;
alter table public.hba_document_facts enable row level security;
alter table public.hba_document_intakes enable row level security;
alter table public.hba_document_suggestions enable row level security;
alter table public.hba_documents enable row level security;
alter table public.hba_dues enable row level security;
alter table public.hba_dues_audit enable row level security;
alter table public.hba_dues_households enable row level security;
alter table public.hba_dues_receipts enable row level security;
alter table public.hba_dues_targets enable row level security;
alter table public.hba_election_audit enable row level security;
alter table public.hba_elections enable row level security;
alter table public.hba_event_host_offers enable row level security;
alter table public.hba_events enable row level security;
alter table public.hba_finance_audit enable row level security;
alter table public.hba_finance_categories enable row level security;
alter table public.hba_governor_messages enable row level security;
alter table public.hba_house_history enable row level security;
alter table public.hba_issues enable row level security;
alter table public.hba_meeting_access enable row level security;
alter table public.hba_meeting_minutes enable row level security;
alter table public.hba_meetings enable row level security;
alter table public.hba_member_households enable row level security;
alter table public.hba_members enable row level security;
alter table public.hba_message_reads enable row level security;
alter table public.hba_messages enable row level security;
alter table public.hba_newsletters enable row level security;
alter table public.hba_nominations enable row level security;
alter table public.hba_officeholders enable row level security;
alter table public.hba_payer_households enable row level security;
alter table public.hba_payment_reports enable row level security;
alter table public.hba_payment_settings enable row level security;
alter table public.hba_photos enable row level security;
alter table public.hba_poll_votes enable row level security;
alter table public.hba_polls enable row level security;
alter table public.hba_public_advisories enable row level security;
alter table public.hba_push_subscriptions enable row level security;
alter table public.hba_research_reports enable row level security;
alter table public.hba_series enable row level security;
alter table public.hba_settings enable row level security;
alter table public.hba_sms_consent_log enable row level security;
alter table public.hba_sms_drafts enable row level security;
alter table public.hba_sms_preferences enable row level security;
alter table public.hba_storm_memories enable row level security;
alter table public.hba_volunteer_email_preferences enable row level security;
alter table public.hba_volunteer_signups enable row level security;
alter table public.hba_volunteer_tasks enable row level security;
alter table public.hba_vote_annotations enable row level security;
alter table public.hba_vote_audit enable row level security;
alter table public.hba_vote_comments enable row level security;
alter table public.hba_vote_proxies enable row level security;
alter table public.hba_vote_results enable row level security;
alter table public.hba_vote_roll enable row level security;
alter table public.hba_votes enable row level security;
alter table public.hba_voting_procedures enable row level security;
alter table public.hba_work enable row level security;
alter table public.hba_work_notes enable row level security;
create policy "account_audit_read" on public.hba_account_audit as permissive for select to authenticated
  using (hba_is_board());
create policy "agenda_add" on public.hba_agenda_items as permissive for insert to authenticated
  with check ((hba_is_board() AND (created_by = auth.uid())));
create policy "agenda_delete" on public.hba_agenda_items as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "agenda_edit" on public.hba_agenda_items as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "agenda_read" on public.hba_agenda_items as permissive for select to authenticated
  using ((hba_is_board() OR (hba_is_member() AND (state = 'included'::text) AND (audience = 'members'::text))));
create policy "choices_read" on public.hba_ballot_choices as permissive for select to authenticated
  using (hba_can_certify());
create policy "ballots_read" on public.hba_ballots as permissive for select to authenticated
  using ((hba_is_board() OR (cast_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM hba_votes v
  WHERE ((v.id = hba_ballots.vote_id) AND (v.state = 'confirmed'::text) AND (NOT v.secret_ballot) AND hba_is_member())))));
create policy "bank_accounts_add" on public.hba_bank_accounts as permissive for insert to authenticated
  with check (((hba_role() = 'admin'::text) AND (created_by = auth.uid())));
create policy "bank_accounts_delete" on public.hba_bank_accounts as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "bank_accounts_read" on public.hba_bank_accounts as permissive for select to authenticated
  using (hba_is_board());
create policy "bank_imports_add" on public.hba_bank_imports as permissive for insert to authenticated
  with check ((hba_can_edit_finance() AND (created_by = auth.uid())));
create policy "bank_imports_delete" on public.hba_bank_imports as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "bank_imports_read" on public.hba_bank_imports as permissive for select to authenticated
  using (hba_is_board());
create policy "bank_matches_add" on public.hba_bank_matches as permissive for insert to authenticated
  with check ((hba_can_edit_finance() AND (created_by = auth.uid())));
create policy "bank_matches_delete" on public.hba_bank_matches as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "bank_matches_read" on public.hba_bank_matches as permissive for select to authenticated
  using (hba_is_board());
create policy "bank_summaries_add" on public.hba_bank_summaries as permissive for insert to authenticated
  with check ((hba_can_edit_finance() AND (created_by = auth.uid())));
create policy "bank_summaries_delete" on public.hba_bank_summaries as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "bank_summaries_read" on public.hba_bank_summaries as permissive for select to authenticated
  using (hba_is_member());
create policy "bank_transactions_add" on public.hba_bank_transactions as permissive for insert to authenticated
  with check ((hba_can_edit_finance() AND (created_by = auth.uid())));
create policy "bank_transactions_delete" on public.hba_bank_transactions as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "bank_transactions_read" on public.hba_bank_transactions as permissive for select to authenticated
  using (hba_is_board());
create policy "admin_delete" on public.hba_bid_files as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "bid_files_add" on public.hba_bid_files as permissive for insert to authenticated
  with check ((hba_is_member() AND (created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM hba_bids b
  WHERE ((b.id = hba_bid_files.bid_id) AND (hba_is_board() OR ((b.created_by = auth.uid()) AND (b.state = ANY (ARRAY['submitted'::text, 'clarification'::text]))))))) AND (file_path ~~ (('bids/'::text || (bid_id)::text) || '/%'::text))));
create policy "bid_files_read" on public.hba_bid_files as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM hba_bids b
  WHERE (b.id = hba_bid_files.bid_id))));
create policy "admin_delete" on public.hba_bid_requests as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "bid_requests_add" on public.hba_bid_requests as permissive for insert to authenticated
  with check ((hba_is_board() AND (created_by = auth.uid())));
create policy "bid_requests_read" on public.hba_bid_requests as permissive for select to authenticated
  using ((hba_is_member() AND (hba_is_board() OR (state = ANY (ARRAY['open'::text, 'closed'::text])))));
create policy "bid_requests_update" on public.hba_bid_requests as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "bid_reviews_read" on public.hba_bid_reviews as permissive for select to authenticated
  using (hba_is_board());
create policy "admin_delete" on public.hba_bids as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "bids_read" on public.hba_bids as permissive for select to authenticated
  using ((hba_is_board() OR (hba_is_member() AND (created_by = auth.uid()))));
create policy "bids_submit" on public.hba_bids as permissive for insert to authenticated
  with check ((hba_is_member() AND (created_by = auth.uid()) AND (state = 'submitted'::text) AND (revision = 1)));
create policy "category_budget_add" on public.hba_category_budgets as permissive for insert to authenticated
  with check (hba_can_edit_finance());
create policy "category_budget_delete" on public.hba_category_budgets as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "category_budget_edit" on public.hba_category_budgets as permissive for update to authenticated
  using (hba_can_edit_finance())
  with check (hba_can_edit_finance());
create policy "category_budget_read" on public.hba_category_budgets as permissive for select to authenticated
  using (hba_is_board());
create policy "register_add" on public.hba_check_register as permissive for insert to authenticated
  with check ((hba_can_edit_finance() AND (created_by = auth.uid())));
create policy "register_delete" on public.hba_check_register as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "register_edit" on public.hba_check_register as permissive for update to authenticated
  using (hba_can_edit_finance())
  with check (hba_can_edit_finance());
create policy "register_read" on public.hba_check_register as permissive for select to authenticated
  using (hba_is_board());
create policy "cleaning_board_read" on public.hba_cleaning_plan as permissive for select to authenticated
  using (hba_is_board());
create policy "decisions_add" on public.hba_decisions as permissive for insert to authenticated
  with check ((hba_is_board() AND (created_by = auth.uid())));
create policy "decisions_delete" on public.hba_decisions as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "decisions_edit" on public.hba_decisions as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "decisions_read" on public.hba_decisions as permissive for select to authenticated
  using (hba_is_board());
create policy "fact_delete" on public.hba_document_facts as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "fact_read" on public.hba_document_facts as permissive for select to authenticated
  using (hba_is_board());
create policy "intake_add" on public.hba_document_intakes as permissive for insert to authenticated
  with check ((hba_is_board() AND (created_by = auth.uid())));
create policy "intake_delete" on public.hba_document_intakes as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "intake_edit" on public.hba_document_intakes as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "intake_read" on public.hba_document_intakes as permissive for select to authenticated
  using (hba_is_board());
create policy "suggestion_add" on public.hba_document_suggestions as permissive for insert to authenticated
  with check ((hba_is_board() AND (state = 'pending'::text) AND (reviewed_by IS NULL)));
create policy "suggestion_delete" on public.hba_document_suggestions as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "suggestion_read" on public.hba_document_suggestions as permissive for select to authenticated
  using (hba_is_board());
create policy "admin_delete" on public.hba_documents as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "documents_add" on public.hba_documents as permissive for insert to authenticated
  with check ((hba_is_board() AND (created_by = auth.uid())));
create policy "documents_read" on public.hba_documents as permissive for select to authenticated
  using ((hba_is_board() OR ((audience = 'members'::text) AND hba_is_member())));
create policy "documents_visibility" on public.hba_documents as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "admin_delete" on public.hba_dues as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "dues_read" on public.hba_dues as permissive for select to authenticated
  using (hba_is_board());
create policy "admin_delete" on public.hba_dues_audit as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "dues_audit_read" on public.hba_dues_audit as permissive for select to authenticated
  using (hba_is_board());
create policy "dues_households_read" on public.hba_dues_households as permissive for select to authenticated
  using (hba_is_board());
create policy "dues_receipts_read" on public.hba_dues_receipts as permissive for select to authenticated
  using (hba_is_board());
create policy "dues_targets_read" on public.hba_dues_targets as permissive for select to authenticated
  using (hba_is_board());
create policy "election_audit_read" on public.hba_election_audit as permissive for select to authenticated
  using (hba_is_board());
create policy "elections_add" on public.hba_elections as permissive for insert to authenticated
  with check (hba_is_board());
create policy "elections_delete" on public.hba_elections as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "elections_edit" on public.hba_elections as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "elections_read" on public.hba_elections as permissive for select to authenticated
  using (hba_is_member());
create policy "host_insert" on public.hba_event_host_offers as permissive for insert to authenticated
  with check (((member_id = auth.uid()) AND (hba_role() = ANY (ARRAY['resident'::text, 'board'::text, 'admin'::text]))));
create policy "host_select" on public.hba_event_host_offers as permissive for select to authenticated
  using (((member_id = auth.uid()) OR (state = 'approved'::text) OR (hba_role() = ANY (ARRAY['board'::text, 'admin'::text]))));
create policy "host_update_board" on public.hba_event_host_offers as permissive for update to authenticated
  using ((hba_role() = ANY (ARRAY['board'::text, 'admin'::text])))
  with check ((hba_role() = ANY (ARRAY['board'::text, 'admin'::text])));
create policy "host_update_own" on public.hba_event_host_offers as permissive for update to authenticated
  using (((member_id = auth.uid()) AND (state = 'pending'::text)))
  with check ((member_id = auth.uid()));
create policy "admin_delete" on public.hba_events as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "events_add" on public.hba_events as permissive for insert to authenticated
  with check ((hba_is_board() AND (created_by = auth.uid())));
create policy "events_edit" on public.hba_events as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "events_read" on public.hba_events as permissive for select to authenticated
  using (hba_is_member());
create policy "finance_audit_read" on public.hba_finance_audit as permissive for select to authenticated
  using (hba_is_board());
create policy "finance_categories_read" on public.hba_finance_categories as permissive for select to authenticated
  using (hba_is_board());
create policy "governor_messages_add" on public.hba_governor_messages as permissive for insert to authenticated
  with check ((hba_is_member() AND (from_member_id = auth.uid()) AND (state = 'new'::text) AND (board_note = ''::text)));
create policy "governor_messages_delete" on public.hba_governor_messages as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "governor_messages_edit" on public.hba_governor_messages as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "governor_messages_read" on public.hba_governor_messages as permissive for select to authenticated
  using ((hba_is_member() AND ((from_member_id = auth.uid()) OR hba_is_board())));
create policy "admin_delete" on public.hba_house_history as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "history_add" on public.hba_house_history as permissive for insert to authenticated
  with check ((hba_is_member() AND (created_by = auth.uid()) AND (hba_is_board() OR ((household_uid = hba_household()) AND (status = 'pending'::text)))));
create policy "history_edit" on public.hba_house_history as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "history_read" on public.hba_house_history as permissive for select to authenticated
  using ((hba_is_member() AND ((status = 'published'::text) OR (created_by = auth.uid()) OR hba_is_board())));
create policy "issues_add" on public.hba_issues as permissive for insert to authenticated
  with check ((hba_is_member() AND (created_by = auth.uid()) AND (state = 'pending_meeting'::text) AND (board_note = ''::text)));
create policy "issues_delete" on public.hba_issues as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "issues_edit" on public.hba_issues as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "issues_read" on public.hba_issues as permissive for select to authenticated
  using (hba_is_board());
create policy "meeting_access_add" on public.hba_meeting_access as permissive for insert to authenticated
  with check ((hba_can_schedule() AND (created_by = auth.uid())));
create policy "meeting_access_delete" on public.hba_meeting_access as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "meeting_access_edit" on public.hba_meeting_access as permissive for update to authenticated
  using (hba_can_schedule())
  with check (hba_can_schedule());
create policy "meeting_access_read" on public.hba_meeting_access as permissive for select to authenticated
  using (hba_is_board());
create policy "minutes_add" on public.hba_meeting_minutes as permissive for insert to authenticated
  with check ((hba_can_edit_minutes() AND (created_by = auth.uid()) AND ((file_path IS NULL) OR (file_path ~~ (('minutes/'::text || (id)::text) || '/%'::text)))));
create policy "minutes_delete" on public.hba_meeting_minutes as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "minutes_edit" on public.hba_meeting_minutes as permissive for update to authenticated
  using (hba_can_edit_minutes())
  with check ((hba_can_edit_minutes() AND ((file_path IS NULL) OR (file_path ~~ (('minutes/'::text || (id)::text) || '/%'::text)))));
create policy "minutes_read" on public.hba_meeting_minutes as permissive for select to authenticated
  using ((hba_can_edit_minutes() OR hba_is_board() OR (hba_is_member() AND (state = 'approved'::text))));
create policy "meetings_add" on public.hba_meetings as permissive for insert to authenticated
  with check ((hba_can_schedule() AND (created_by = auth.uid())));
create policy "meetings_delete" on public.hba_meetings as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "meetings_edit" on public.hba_meetings as permissive for update to authenticated
  using (hba_can_schedule())
  with check (hba_can_schedule());
create policy "meetings_read" on public.hba_meetings as permissive for select to authenticated
  using (hba_is_member());
create policy "member_households_add" on public.hba_member_households as permissive for insert to authenticated
  with check ((hba_is_board() AND (created_by = auth.uid())));
create policy "member_households_delete" on public.hba_member_households as permissive for delete to authenticated
  using (hba_is_board());
create policy "member_households_read" on public.hba_member_households as permissive for select to authenticated
  using ((hba_is_board() OR (member_id = auth.uid())));
create policy "members_read" on public.hba_members as permissive for select to authenticated
  using (((id = auth.uid()) OR hba_is_board()));
create policy "msgread_own" on public.hba_message_reads as permissive for all to authenticated
  using ((member_id = auth.uid()))
  with check ((member_id = auth.uid()));
create policy "msg_delete_admin" on public.hba_messages as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "msg_insert" on public.hba_messages as permissive for insert to authenticated
  with check (((from_member_id = auth.uid()) AND ((hba_role() = ANY (ARRAY['board'::text, 'admin'::text])) OR ((audience = 'board'::text) AND (hba_role() = 'resident'::text)))));
create policy "msg_select" on public.hba_messages as permissive for select to authenticated
  using (((member_id = auth.uid()) OR ((audience = 'residents'::text) AND (hba_role() = ANY (ARRAY['resident'::text, 'board'::text, 'admin'::text]))) OR ((audience = 'board'::text) AND (hba_role() = ANY (ARRAY['board'::text, 'admin'::text]))) OR (from_member_id = auth.uid())));
create policy "newsletter_add" on public.hba_newsletters as permissive for insert to authenticated
  with check ((hba_can_edit_newsletter() AND (created_by = auth.uid()) AND ((file_path IS NULL) OR (file_path ~~ (('newsletters/'::text || (id)::text) || '/%'::text)))));
create policy "newsletter_delete" on public.hba_newsletters as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "newsletter_edit" on public.hba_newsletters as permissive for update to authenticated
  using (hba_can_edit_newsletter())
  with check ((hba_can_edit_newsletter() AND ((file_path IS NULL) OR (file_path ~~ (('newsletters/'::text || (id)::text) || '/%'::text)))));
create policy "newsletter_read" on public.hba_newsletters as permissive for select to authenticated
  using ((hba_can_edit_newsletter() OR (hba_is_member() AND (state = 'published'::text))));
create policy "nominations_add" on public.hba_nominations as permissive for insert to authenticated
  with check ((hba_is_member() AND (created_by = auth.uid()) AND (state = 'submitted'::text) AND (EXISTS ( SELECT 1
   FROM hba_elections e
  WHERE ((e.year = hba_nominations.election_year) AND (e.state = ANY (ARRAY['planning'::text, 'nominations_open'::text, 'meeting_scheduled'::text])))))));
create policy "nominations_read" on public.hba_nominations as permissive for select to authenticated
  using ((hba_is_board() OR (created_by = auth.uid()) OR (hba_is_member() AND (state = 'accepted'::text))));
create policy "nominations_review" on public.hba_nominations as permissive for update to authenticated
  using ((hba_is_board() OR (created_by = auth.uid())))
  with check ((hba_is_board() OR ((created_by = auth.uid()) AND (state = 'withdrawn'::text))));
create policy "officeholders_add" on public.hba_officeholders as permissive for insert to authenticated
  with check ((hba_is_board() AND (created_by = auth.uid())));
create policy "officeholders_delete" on public.hba_officeholders as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "officeholders_edit" on public.hba_officeholders as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "officeholders_read" on public.hba_officeholders as permissive for select to authenticated
  using (hba_is_member());
create policy "payer_households_delete" on public.hba_payer_households as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "payer_households_read" on public.hba_payer_households as permissive for select to authenticated
  using (hba_is_board());
create policy "payment_reports_add" on public.hba_payment_reports as permissive for insert to authenticated
  with check ((hba_is_member() AND (created_by = auth.uid()) AND (household_uid = hba_household()) AND (state = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (board_note = ''::text)));
create policy "payment_reports_delete" on public.hba_payment_reports as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "payment_reports_read" on public.hba_payment_reports as permissive for select to authenticated
  using ((hba_is_board() OR (hba_is_member() AND (created_by = auth.uid()))));
create policy "payment_reports_review" on public.hba_payment_reports as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "payment_settings_read" on public.hba_payment_settings as permissive for select to authenticated
  using (hba_is_member());
create policy "payment_settings_update" on public.hba_payment_settings as permissive for update to authenticated
  using ((hba_role() = 'admin'::text))
  with check ((hba_role() = 'admin'::text));
create policy "admin_delete" on public.hba_photos as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "photo_add" on public.hba_photos as permissive for insert to public
  with check (((created_by = auth.uid()) AND hba_is_member() AND (hba_is_board() OR ((status = 'pending'::text) AND (work_id IS NULL) AND
CASE
    WHEN (issue_id IS NOT NULL) THEN hba_owns_issue(issue_id)
    WHEN (history_id IS NOT NULL) THEN (EXISTS ( SELECT 1
       FROM hba_house_history h
      WHERE ((h.id = hba_photos.history_id) AND (h.created_by = auth.uid()) AND (h.household_uid = hba_household()))))
    WHEN (storm_id IS NOT NULL) THEN (EXISTS ( SELECT 1
       FROM hba_storm_memories s
      WHERE ((s.id = hba_photos.storm_id) AND (s.created_by = auth.uid()))))
    ELSE (event_id IS NOT NULL)
END))));
create policy "photo_edit" on public.hba_photos as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "photo_read" on public.hba_photos as permissive for select to public
  using ((hba_is_member() AND
CASE
    WHEN ((work_id IS NOT NULL) OR (issue_id IS NOT NULL)) THEN hba_is_board()
    ELSE (hba_is_board() OR (created_by = auth.uid()) OR ((status = 'published'::text) AND ((history_id IS NULL) OR (EXISTS ( SELECT 1
       FROM hba_house_history h
      WHERE ((h.id = hba_photos.history_id) AND (h.status = 'published'::text))))) AND ((storm_id IS NULL) OR (EXISTS ( SELECT 1
       FROM hba_storm_memories s
      WHERE ((s.id = hba_photos.storm_id) AND (s.status = 'published'::text)))))))
END));
create policy "pollvote_select" on public.hba_poll_votes as permissive for select to authenticated
  using (((member_id = auth.uid()) OR (hba_role() = ANY (ARRAY['board'::text, 'admin'::text]))));
create policy "pollvote_write_own" on public.hba_poll_votes as permissive for all to authenticated
  using ((member_id = auth.uid()))
  with check (((member_id = auth.uid()) AND (hba_role() = ANY (ARRAY['resident'::text, 'board'::text, 'admin'::text]))));
create policy "poll_select" on public.hba_polls as permissive for select to authenticated
  using (((state = ANY (ARRAY['open'::text, 'closed'::text])) OR (hba_role() = ANY (ARRAY['board'::text, 'admin'::text]))));
create policy "poll_write_board" on public.hba_polls as permissive for all to authenticated
  using ((hba_role() = ANY (ARRAY['board'::text, 'admin'::text])))
  with check ((hba_role() = ANY (ARRAY['board'::text, 'admin'::text])));
create policy "advisories_add" on public.hba_public_advisories as permissive for insert to authenticated
  with check ((hba_is_board() AND (created_by = auth.uid())));
create policy "advisories_delete" on public.hba_public_advisories as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "advisories_public_read" on public.hba_public_advisories as permissive for select to anon, authenticated
  using (true);
create policy "push_delete_own" on public.hba_push_subscriptions as permissive for delete to authenticated
  using ((member_id = auth.uid()));
create policy "push_insert_own_admin" on public.hba_push_subscriptions as permissive for insert to authenticated
  with check (((member_id = auth.uid()) AND (hba_role() = 'admin'::text)));
create policy "push_select_own" on public.hba_push_subscriptions as permissive for select to authenticated
  using ((member_id = auth.uid()));
create policy "push_update_own" on public.hba_push_subscriptions as permissive for update to authenticated
  using ((member_id = auth.uid()))
  with check ((member_id = auth.uid()));
create policy "research_report_add" on public.hba_research_reports as permissive for insert to authenticated
  with check ((hba_is_member() AND (created_by = auth.uid())));
create policy "research_report_delete" on public.hba_research_reports as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "research_report_read" on public.hba_research_reports as permissive for select to authenticated
  using ((hba_is_member() AND (created_by = auth.uid())));
create policy "admin_delete" on public.hba_series as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "series_add" on public.hba_series as permissive for insert to authenticated
  with check (hba_is_board());
create policy "series_edit" on public.hba_series as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "series_read" on public.hba_series as permissive for select to authenticated
  using (hba_is_member());
create policy "settings_edit" on public.hba_settings as permissive for update to authenticated
  using ((hba_role() = 'admin'::text))
  with check ((hba_role() = 'admin'::text));
create policy "settings_public_read" on public.hba_settings as permissive for select to anon, authenticated
  using (((key ~~ 'public_%'::text) OR hba_is_board()));
create policy "settings_write" on public.hba_settings as permissive for insert to authenticated
  with check ((hba_role() = 'admin'::text));
create policy "sms_log_admin_delete" on public.hba_sms_consent_log as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "sms_log_self_read" on public.hba_sms_consent_log as permissive for select to authenticated
  using ((hba_is_member() AND (member_id = auth.uid())));
create policy "sms_draft_add" on public.hba_sms_drafts as permissive for insert to authenticated
  with check ((hba_is_board() AND (created_by = auth.uid())));
create policy "sms_draft_delete" on public.hba_sms_drafts as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "sms_draft_edit" on public.hba_sms_drafts as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "sms_draft_read" on public.hba_sms_drafts as permissive for select to authenticated
  using (hba_is_board());
create policy "sms_admin_delete" on public.hba_sms_preferences as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "sms_self_read" on public.hba_sms_preferences as permissive for select to authenticated
  using ((hba_is_member() AND (member_id = auth.uid())));
create policy "admin_delete" on public.hba_storm_memories as permissive for delete to public
  using ((hba_role() = 'admin'::text));
create policy "storm_add" on public.hba_storm_memories as permissive for insert to public
  with check ((hba_is_member() AND (created_by = auth.uid()) AND (hba_is_board() OR (status = 'pending'::text))));
create policy "storm_edit" on public.hba_storm_memories as permissive for update to public
  using (hba_is_board())
  with check (hba_is_board());
create policy "storm_read" on public.hba_storm_memories as permissive for select to public
  using ((hba_is_member() AND ((status = 'published'::text) OR (created_by = auth.uid()) OR hba_is_board())));
create policy "volunteer_email_add" on public.hba_volunteer_email_preferences as permissive for insert to authenticated
  with check ((hba_is_member() AND (member_id = auth.uid())));
create policy "volunteer_email_delete" on public.hba_volunteer_email_preferences as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "volunteer_email_edit" on public.hba_volunteer_email_preferences as permissive for update to authenticated
  using ((hba_is_member() AND (member_id = auth.uid())))
  with check ((hba_is_member() AND (member_id = auth.uid())));
create policy "volunteer_email_read" on public.hba_volunteer_email_preferences as permissive for select to authenticated
  using ((hba_is_board() OR (hba_is_member() AND (member_id = auth.uid()))));
create policy "volunteer_signup_delete" on public.hba_volunteer_signups as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "volunteer_signup_read" on public.hba_volunteer_signups as permissive for select to authenticated
  using ((hba_is_board() OR (hba_is_member() AND (member_id = auth.uid()))));
create policy "volunteer_task_add" on public.hba_volunteer_tasks as permissive for insert to authenticated
  with check ((hba_is_board() AND (created_by = auth.uid()) AND (state = 'draft'::text)));
create policy "volunteer_task_delete" on public.hba_volunteer_tasks as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "volunteer_task_edit" on public.hba_volunteer_tasks as permissive for update to authenticated
  using (hba_is_board())
  with check ((hba_is_board() AND ((photo_path IS NULL) OR (photo_path ~~ (('volunteers/'::text || (id)::text) || '/%'::text)))));
create policy "volunteer_task_read" on public.hba_volunteer_tasks as permissive for select to anon, authenticated
  using (hba_volunteer_task_visible(state));
create policy "annotations_add" on public.hba_vote_annotations as permissive for insert to authenticated
  with check (((hba_can_certify() OR hba_can_call_vote()) AND (created_by = auth.uid())));
create policy "annotations_read" on public.hba_vote_annotations as permissive for select to authenticated
  using (hba_is_member());
create policy "vote_audit_read" on public.hba_vote_audit as permissive for select to authenticated
  using (hba_is_board());
create policy "comments_add" on public.hba_vote_comments as permissive for insert to authenticated
  with check ((hba_is_member() AND (created_by = auth.uid()) AND (state = 'pending'::text) AND (EXISTS ( SELECT 1
   FROM hba_votes v
  WHERE ((v.id = hba_vote_comments.vote_id) AND (v.state = ANY (ARRAY['noticed'::text, 'open'::text])))))));
create policy "comments_moderate" on public.hba_vote_comments as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "comments_read" on public.hba_vote_comments as permissive for select to authenticated
  using ((hba_is_board() OR (created_by = auth.uid()) OR (hba_is_member() AND (state = 'published'::text))));
create policy "proxies_add" on public.hba_vote_proxies as permissive for insert to authenticated
  with check ((hba_can_certify() AND (filed_by = auth.uid())));
create policy "proxies_delete" on public.hba_vote_proxies as permissive for delete to authenticated
  using ((hba_can_certify() AND (EXISTS ( SELECT 1
   FROM hba_votes v
  WHERE ((v.id = hba_vote_proxies.vote_id) AND (v.state = ANY (ARRAY['noticed'::text, 'open'::text])))))));
create policy "proxies_read" on public.hba_vote_proxies as permissive for select to authenticated
  using ((hba_is_board() OR (household_uid = hba_household())));
create policy "results_add" on public.hba_vote_results as permissive for insert to authenticated
  with check (hba_can_certify());
create policy "results_edit" on public.hba_vote_results as permissive for update to authenticated
  using ((hba_can_certify() OR hba_can_call_vote()))
  with check ((hba_can_certify() OR hba_can_call_vote()));
create policy "results_read" on public.hba_vote_results as permissive for select to authenticated
  using ((hba_is_board() OR hba_is_member()));
create policy "roll_delete" on public.hba_vote_roll as permissive for delete to authenticated
  using ((hba_can_call_vote() OR hba_can_certify()));
create policy "roll_edit" on public.hba_vote_roll as permissive for update to authenticated
  using (hba_can_certify())
  with check (hba_can_certify());
create policy "roll_read" on public.hba_vote_roll as permissive for select to authenticated
  using ((hba_is_board() OR (auth.uid() = ANY (member_ids))));
create policy "roll_write" on public.hba_vote_roll as permissive for insert to authenticated
  with check ((hba_can_call_vote() OR hba_can_certify()));
create policy "votes_add" on public.hba_votes as permissive for insert to authenticated
  with check (((hba_can_call_vote() OR ((kind = 'advisory'::text) AND hba_is_secretary())) AND (created_by = auth.uid())));
create policy "votes_delete" on public.hba_votes as permissive for delete to authenticated
  using (((hba_role() = 'admin'::text) AND (state = 'draft'::text)));
create policy "votes_edit" on public.hba_votes as permissive for update to authenticated
  using ((hba_can_call_vote() OR hba_can_certify()))
  with check ((hba_can_call_vote() OR hba_can_certify()));
create policy "votes_read" on public.hba_votes as permissive for select to authenticated
  using ((hba_is_board() OR (hba_is_member() AND (state <> 'draft'::text))));
create policy "procedures_edit" on public.hba_voting_procedures as permissive for update to authenticated
  using ((hba_role() = 'admin'::text))
  with check ((hba_role() = 'admin'::text));
create policy "procedures_read" on public.hba_voting_procedures as permissive for select to authenticated
  using (hba_is_member());
create policy "admin_delete" on public.hba_work as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "work_add" on public.hba_work as permissive for insert to authenticated
  with check ((hba_is_board() AND (created_by = auth.uid())));
create policy "work_edit" on public.hba_work as permissive for update to authenticated
  using (hba_is_board())
  with check (hba_is_board());
create policy "work_read" on public.hba_work as permissive for select to authenticated
  using (hba_is_board());
create policy "admin_delete" on public.hba_work_notes as permissive for delete to authenticated
  using ((hba_role() = 'admin'::text));
create policy "work_notes_add" on public.hba_work_notes as permissive for insert to authenticated
  with check ((hba_is_board() AND (created_by = auth.uid())));
create policy "work_notes_read" on public.hba_work_notes as permissive for select to authenticated
  using (hba_is_board());
create policy "bid_file_storage_insert" on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'hba-archive'::text) AND (EXISTS ( SELECT 1
   FROM hba_bid_files f
  WHERE ((f.file_path = objects.name) AND (f.created_by = auth.uid()))))));
create policy "bid_file_storage_read" on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'hba-archive'::text) AND (EXISTS ( SELECT 1
   FROM hba_bid_files f
  WHERE (f.file_path = objects.name)))));
create policy "hba_file_delete" on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'hba-archive'::text) AND (hba_role() = 'admin'::text)));
create policy "hba_file_insert" on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'hba-archive'::text) AND hba_is_member() AND (((name ~~ 'documents/%'::text) AND hba_is_board()) OR ((name ~~ 'photos/%'::text) AND hba_can_store_photo(name)))));
create policy "hba_file_read" on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'hba-archive'::text) AND hba_is_member() AND ((EXISTS ( SELECT 1
   FROM hba_documents d
  WHERE ((d.file_path = objects.name) OR (d.original_path = objects.name)))) OR (EXISTS ( SELECT 1
   FROM hba_photos p
  WHERE (p.file_path = objects.name))))));
create policy "minutes_file_add" on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'hba-archive'::text) AND (name ~~ 'minutes/%'::text) AND hba_can_edit_minutes()));
create policy "minutes_file_read" on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'hba-archive'::text) AND (EXISTS ( SELECT 1
   FROM hba_meeting_minutes n
  WHERE (n.file_path = objects.name)))));
create policy "newsletter_file_add" on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'hba-archive'::text) AND (name ~~ 'newsletters/%'::text) AND hba_can_edit_newsletter()));
create policy "newsletter_file_read" on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'hba-archive'::text) AND (EXISTS ( SELECT 1
   FROM hba_newsletters n
  WHERE (n.file_path = objects.name)))));
create policy "newsletter_original_read" on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'hba-archive'::text) AND (EXISTS ( SELECT 1
   FROM hba_newsletters n
  WHERE (n.original_path = objects.name)))));
create policy "volunteer_photo_add" on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'hba-archive'::text) AND (name ~~ 'volunteers/%'::text) AND hba_is_board()));
create policy "volunteer_photo_read" on storage.objects as permissive for select to anon, authenticated
  using (((bucket_id = 'hba-archive'::text) AND (EXISTS ( SELECT 1
   FROM hba_volunteer_tasks t
  WHERE (t.photo_path = objects.name)))));

-- ===== Storage =====
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('hba-archive','hba-archive',false,8388608,'{application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv}') on conflict (id) do nothing;

-- ===== Grants (exactly as in the source project; row-level security still decides what each role may see) =====
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_account_audit to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_account_audit to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_agenda_items to authenticated;
grant SELECT on public.hba_ballots to authenticated;
grant DELETE, INSERT, SELECT on public.hba_bank_accounts to authenticated;
grant DELETE, INSERT, SELECT on public.hba_bank_imports to authenticated;
grant DELETE, INSERT, SELECT on public.hba_bank_matches to authenticated;
grant DELETE, INSERT, SELECT on public.hba_bank_summaries to authenticated;
grant DELETE, INSERT, SELECT on public.hba_bank_transactions to authenticated;
grant DELETE, INSERT, SELECT on public.hba_bid_files to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on public.hba_bid_requests to authenticated;
grant SELECT on public.hba_bid_reviews to authenticated;
grant DELETE, INSERT, SELECT on public.hba_bids to authenticated;
grant DELETE, INSERT, SELECT on public.hba_category_budgets to authenticated;
grant DELETE, INSERT, SELECT on public.hba_check_register to authenticated;
grant SELECT on public.hba_cleaning_plan to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_decisions to authenticated;
grant DELETE, SELECT on public.hba_document_facts to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on public.hba_document_intakes to authenticated;
grant DELETE, INSERT, SELECT on public.hba_document_suggestions to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_documents to authenticated;
grant DELETE, SELECT on public.hba_dues to authenticated;
grant DELETE, SELECT on public.hba_dues_audit to authenticated;
grant SELECT on public.hba_dues_households to authenticated;
grant SELECT on public.hba_dues_receipts to authenticated;
grant SELECT on public.hba_dues_targets to authenticated;
grant SELECT on public.hba_election_audit to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on public.hba_elections to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_event_host_offers to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_event_host_offers to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_events to authenticated;
grant SELECT on public.hba_finance_audit to authenticated;
grant SELECT on public.hba_finance_categories to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_governor_messages to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_house_history to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_issues to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_meeting_access to authenticated;
grant DELETE, INSERT, SELECT on public.hba_meeting_minutes to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_meetings to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_member_households to authenticated;
grant SELECT on public.hba_members to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_message_reads to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_message_reads to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_messages to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_messages to authenticated;
grant DELETE, INSERT, SELECT on public.hba_newsletters to authenticated;
grant INSERT, SELECT, UPDATE on public.hba_nominations to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_officeholders to authenticated;
grant DELETE, SELECT on public.hba_payer_households to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_payment_reports to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_payment_settings to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_photos to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_poll_votes to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_poll_votes to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_polls to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_polls to authenticated;
grant SELECT on public.hba_public_advisories to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_public_advisories to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_push_subscriptions to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_push_subscriptions to authenticated;
grant DELETE, INSERT, SELECT on public.hba_research_reports to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_series to authenticated;
grant SELECT on public.hba_settings to anon;
grant INSERT, SELECT, UPDATE on public.hba_settings to authenticated;
grant DELETE, SELECT on public.hba_sms_consent_log to authenticated;
grant DELETE, INSERT, SELECT on public.hba_sms_drafts to authenticated;
grant DELETE, SELECT on public.hba_sms_preferences to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_storm_memories to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_storm_memories to authenticated;
grant DELETE, INSERT, SELECT on public.hba_volunteer_email_preferences to authenticated;
grant DELETE, SELECT on public.hba_volunteer_signups to authenticated;
grant SELECT on public.hba_volunteer_tasks to anon;
grant DELETE, INSERT, SELECT on public.hba_volunteer_tasks to authenticated;
grant INSERT, SELECT on public.hba_vote_annotations to authenticated;
grant SELECT on public.hba_vote_audit to authenticated;
grant INSERT, SELECT, UPDATE on public.hba_vote_comments to authenticated;
grant DELETE, INSERT, SELECT on public.hba_vote_proxies to authenticated;
grant INSERT, SELECT, UPDATE on public.hba_vote_results to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on public.hba_vote_roll to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on public.hba_votes to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_voting_procedures to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_work to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.hba_work_notes to authenticated;
grant execute on function public.hba_admin_delete_research_report(p_id uuid) to authenticated;
-- no anon/authenticated execute on public.hba_apply_event_recurrence()
-- no anon/authenticated execute on public.hba_audit_election()
-- no anon/authenticated execute on public.hba_audit_vote_tables()
-- no anon/authenticated execute on public.hba_bank_protect_matched_register()
-- no anon/authenticated execute on public.hba_bank_validate_match()
-- no anon/authenticated execute on public.hba_bank_validate_transaction()
grant execute on function public.hba_book_bank_dues(p_transaction uuid, p_uid text, p_year integer, p_annual_due numeric, p_payee text, p_memo text, p_remember boolean, p_payer_fingerprint text, p_payer_label text) to authenticated;
grant execute on function public.hba_book_bank_transaction(p_transaction_id uuid, p_category text, p_payee text, p_memo text) to authenticated;
grant execute on function public.hba_can_call_vote() to authenticated;
grant execute on function public.hba_can_certify() to authenticated;
grant execute on function public.hba_can_edit_finance() to authenticated;
grant execute on function public.hba_can_edit_minutes() to authenticated;
grant execute on function public.hba_can_edit_newsletter() to authenticated;
grant execute on function public.hba_can_schedule() to authenticated;
grant execute on function public.hba_can_store_photo(object_path text) to authenticated;
grant execute on function public.hba_cast_ballot(p_vote uuid, p_choice text, p_recuse boolean, p_reason text) to authenticated;
grant execute on function public.hba_correct_dues_target(p_uid text, p_year integer, p_annual numeric, p_note text) to authenticated;
grant execute on function public.hba_credit_dues_receipt(p_register uuid, p_uid text, p_year integer, p_amount numeric, p_annual_due numeric, p_payer_fingerprint text, p_payer_label text) to authenticated;
grant execute on function public.hba_delete_member(target uuid) to anon, authenticated;
grant execute on function public.hba_donation_leaderboard(p_year integer) to authenticated;
-- no anon/authenticated execute on public.hba_dues_target_audit()
-- no anon/authenticated execute on public.hba_event_first_year_guard()
-- no anon/authenticated execute on public.hba_finance_record_audit()
-- no anon/authenticated execute on public.hba_finance_validate()
grant execute on function public.hba_holds_office(p_positions text[]) to authenticated;
grant execute on function public.hba_household() to authenticated;
grant execute on function public.hba_import_bank_statement(p_account uuid, p_start date, p_end date, p_closing numeric, p_books numeric, p_note text, p_rows jsonb) to authenticated;
grant execute on function public.hba_import_dues(p_year integer, p_rows jsonb) to authenticated;
grant execute on function public.hba_is_board() to authenticated;
grant execute on function public.hba_is_governor() to authenticated;
grant execute on function public.hba_is_member() to authenticated;
grant execute on function public.hba_is_president() to authenticated;
grant execute on function public.hba_is_secretary() to authenticated;
-- no anon/authenticated execute on public.hba_lock_roll()
grant execute on function public.hba_manage_member(member_id uuid, new_role text, new_household text) to authenticated;
grant execute on function public.hba_my_dues_status(p_year integer) to authenticated;
-- no anon/authenticated execute on public.hba_newsletter_stamp()
grant execute on function public.hba_owns_issue(issue uuid) to authenticated;
grant execute on function public.hba_password_changed() to anon, authenticated;
grant execute on function public.hba_poll_tally(p uuid) to authenticated;
grant execute on function public.hba_procedures_confirmed() to authenticated;
-- no anon/authenticated execute on public.hba_protect_credited_register()
-- no anon/authenticated execute on public.hba_protect_scheduler_office()
grant execute on function public.hba_push_targets() to authenticated;
grant execute on function public.hba_record_ballot(p_vote uuid, p_unit text, p_choice text, p_source text, p_recuse boolean, p_reason text) to authenticated;
grant execute on function public.hba_remove_dues_receipt(p_id uuid) to authenticated;
grant execute on function public.hba_reset_password(target uuid, new_password text) to anon, authenticated;
grant execute on function public.hba_review_bid(p_id uuid, p_state text, p_note text, p_revision integer) to authenticated;
grant execute on function public.hba_review_document_item(p_id uuid, p_action text, p_payload jsonb) to authenticated;
grant execute on function public.hba_role() to authenticated;
grant execute on function public.hba_save_sms_preferences(p_phone text, p_topics text[], p_opted_in boolean, p_consent boolean) to authenticated;
grant execute on function public.hba_set_dues(p_year integer, p_uid text, p_status text, p_revision integer) to authenticated;
grant execute on function public.hba_sms_counts() to authenticated;
grant execute on function public.hba_supper_date(p_year integer) to authenticated;
-- no anon/authenticated execute on public.hba_sync_member()
grant execute on function public.hba_tally(p_vote uuid) to authenticated;
-- no anon/authenticated execute on public.hba_validate_bid()
-- no anon/authenticated execute on public.hba_validate_election()
-- no anon/authenticated execute on public.hba_validate_proxy()
-- no anon/authenticated execute on public.hba_validate_results()
-- no anon/authenticated execute on public.hba_validate_vote()
grant execute on function public.hba_volunteer_counts() to anon, authenticated;
grant execute on function public.hba_volunteer_signup(p_task uuid, p_join boolean, p_note text) to authenticated;
grant execute on function public.hba_volunteer_task_visible(p_state text) to anon, authenticated;
grant execute on function public.hba_vote_counts() to anon, authenticated;
