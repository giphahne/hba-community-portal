create table public.hba_bank_accounts(
 id uuid primary key default gen_random_uuid(),
 label text not null check(length(label) between 1 and 120),
 last_four text not null default '' check(last_four ~ '^([0-9]{4})?$'),
 currency text not null default 'USD' check(currency='USD'),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.hba_check_register add column bank_account_id uuid references public.hba_bank_accounts(id);
grant update(bank_account_id) on public.hba_check_register to authenticated;
create table public.hba_bank_imports(
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.hba_bank_accounts(id),
 period_start date not null, period_end date not null,
 statement_closing numeric(14,2), books_closing numeric(14,2),
 source_note text not null check(length(source_note) between 1 and 1000),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 check(period_end>=period_start)
);
create table public.hba_bank_transactions(
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.hba_bank_accounts(id),
 import_id uuid not null references public.hba_bank_imports(id),
 posted_date date not null,
 amount numeric(14,2) not null check(amount<>0),
 description text not null check(length(description)<=300),
 reference text not null default '' check(length(reference)<=80),
 fingerprint text not null check(length(fingerprint)=64),
 created_by uuid not null default auth.uid() references auth.users(id),
 unique(account_id,fingerprint)
);
create table public.hba_bank_matches(
 id uuid primary key default gen_random_uuid(),
 transaction_id uuid not null unique references public.hba_bank_transactions(id),
 register_id uuid not null unique references public.hba_check_register(id),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.hba_bank_summaries(
 id uuid primary key default gen_random_uuid(),
 period_end date not null,
 statement text not null check(length(statement) between 1 and 3000),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create function public.hba_bank_validate_match() returns trigger
language plpgsql set search_path=public as $$
declare b public.hba_bank_transactions; r public.hba_check_register;
begin
 select * into b from public.hba_bank_transactions where id=new.transaction_id for update;
 select * into r from public.hba_check_register where id=new.register_id for update;
 if b.id is null or r.id is null or r.voided or r.bank_account_id is distinct from b.account_id
 or b.amount is distinct from (case when r.direction='income' then r.amount else -r.amount end)
 or b.posted_date<r.transaction_date then raise exception 'Match requires same account, signed amount and valid dates'; end if;
 return new;
end $$;
revoke all on function public.hba_bank_validate_match() from public,anon,authenticated;
create trigger bank_validate_match before insert on public.hba_bank_matches for each row execute function public.hba_bank_validate_match();
create function public.hba_bank_protect_matched_register() returns trigger
language plpgsql set search_path=public as $$
begin
 if exists(select 1 from public.hba_bank_matches where register_id=old.id)
 and (new.amount is distinct from old.amount or new.direction is distinct from old.direction
 or new.bank_account_id is distinct from old.bank_account_id or new.transaction_date is distinct from old.transaction_date
 or new.voided is distinct from old.voided) then
 raise exception 'Administrator must remove the bank match before changing matched financial fields'; end if;
 return new;
end $$;
revoke all on function public.hba_bank_protect_matched_register() from public,anon,authenticated;
create trigger protect_matched_register before update on public.hba_check_register for each row execute function public.hba_bank_protect_matched_register();
alter table public.hba_bank_accounts enable row level security;
alter table public.hba_bank_imports enable row level security;
alter table public.hba_bank_transactions enable row level security;
alter table public.hba_bank_matches enable row level security;
alter table public.hba_bank_summaries enable row level security;
revoke all on public.hba_bank_accounts,public.hba_bank_imports,public.hba_bank_transactions,public.hba_bank_matches,public.hba_bank_summaries from anon,authenticated;
grant select,insert,delete on public.hba_bank_accounts,public.hba_bank_imports,public.hba_bank_transactions,public.hba_bank_matches,public.hba_bank_summaries to authenticated;
create policy bank_accounts_read on public.hba_bank_accounts for select to authenticated using(public.hba_is_board());
create policy bank_accounts_add on public.hba_bank_accounts for insert to authenticated with check(public.hba_role()='admin' and created_by=auth.uid());
create policy bank_accounts_delete on public.hba_bank_accounts for delete to authenticated using(public.hba_role()='admin');
create policy bank_imports_read on public.hba_bank_imports for select to authenticated using(public.hba_is_board());
create policy bank_imports_add on public.hba_bank_imports for insert to authenticated with check(public.hba_can_edit_finance() and created_by=auth.uid());
create policy bank_imports_delete on public.hba_bank_imports for delete to authenticated using(public.hba_role()='admin');
create policy bank_transactions_read on public.hba_bank_transactions for select to authenticated using(public.hba_is_board());
create policy bank_transactions_add on public.hba_bank_transactions for insert to authenticated with check(public.hba_can_edit_finance() and created_by=auth.uid());
create policy bank_transactions_delete on public.hba_bank_transactions for delete to authenticated using(public.hba_role()='admin');
create policy bank_matches_read on public.hba_bank_matches for select to authenticated using(public.hba_is_board());
create policy bank_matches_add on public.hba_bank_matches for insert to authenticated with check(public.hba_can_edit_finance() and created_by=auth.uid());
create policy bank_matches_delete on public.hba_bank_matches for delete to authenticated using(public.hba_role()='admin');
create policy bank_summaries_read on public.hba_bank_summaries for select to authenticated using(public.hba_is_member());
create policy bank_summaries_add on public.hba_bank_summaries for insert to authenticated with check(public.hba_can_edit_finance() and created_by=auth.uid());
create policy bank_summaries_delete on public.hba_bank_summaries for delete to authenticated using(public.hba_role()='admin');
-- Preserve a board-visible change trail; DELETE remains administrator-only.
create trigger bank_match_audit after insert or delete on public.hba_bank_matches for each row execute function public.hba_finance_record_audit();
create trigger bank_import_audit after insert or delete on public.hba_bank_imports for each row execute function public.hba_finance_record_audit();
create index bank_txn_account_date on public.hba_bank_transactions(account_id,posted_date);
create index register_bank_account on public.hba_check_register(bank_account_id);
