-- Household receipts are distinct from self-reported payments and budget plans.
create table public.hba_dues_households(
 uid text primary key, address text not null
);
alter table public.hba_dues_households enable row level security;
revoke all on public.hba_dues_households from anon,authenticated;
grant select on public.hba_dues_households to authenticated;
create policy dues_households_read on public.hba_dues_households for select to authenticated using(public.hba_is_board());

create table public.hba_dues_targets(
 uid text not null references public.hba_dues_households(uid),
 year int not null check(year between 2020 and 2100),
 annual_due numeric(12,2) not null check(annual_due>0),
 primary key(uid,year)
);
create table public.hba_payer_households(
 id uuid primary key default gen_random_uuid(),
 bank_account_id uuid not null references public.hba_bank_accounts(id),
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 label text not null check(length(label) between 1 and 120),
 household_uid text not null references public.hba_dues_households(uid),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 unique(bank_account_id,fingerprint)
);
create table public.hba_dues_receipts(
 id uuid primary key default gen_random_uuid(),
 register_id uuid not null references public.hba_check_register(id),
 household_uid text not null references public.hba_dues_households(uid),
 dues_year int not null check(dues_year between 2020 and 2100),
 amount numeric(12,2) not null check(amount>0),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 unique(register_id,household_uid,dues_year)
);
alter table public.hba_bank_transactions add column payer_fingerprint text
 check(payer_fingerprint is null or payer_fingerprint ~ '^[0-9a-f]{64}$');

alter table public.hba_dues_targets enable row level security;
alter table public.hba_payer_households enable row level security;
alter table public.hba_dues_receipts enable row level security;
revoke all on public.hba_dues_targets,public.hba_payer_households,public.hba_dues_receipts from anon,authenticated;
grant select on public.hba_dues_targets,public.hba_payer_households,public.hba_dues_receipts to authenticated;
create policy dues_targets_read on public.hba_dues_targets for select to authenticated using(public.hba_is_board());
create policy payer_households_read on public.hba_payer_households for select to authenticated using(public.hba_is_board());
create policy dues_receipts_read on public.hba_dues_receipts for select to authenticated using(public.hba_is_board());
grant delete on public.hba_payer_households to authenticated;
create policy payer_households_delete on public.hba_payer_households for delete to authenticated using(public.hba_role()='admin');
create trigger dues_receipt_audit after insert or delete on public.hba_dues_receipts for each row execute function public.hba_finance_record_audit();
create trigger payer_household_audit after insert or delete on public.hba_payer_households for each row execute function public.hba_finance_record_audit();

create function public.hba_credit_dues_receipt(
 p_register uuid,p_uid text,p_year int,p_amount numeric,p_annual_due numeric,
 p_payer_fingerprint text default null,p_payer_label text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
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
end $$;
revoke all on function public.hba_credit_dues_receipt(uuid,text,int,numeric,numeric,text,text) from public,anon;
grant execute on function public.hba_credit_dues_receipt(uuid,text,int,numeric,numeric,text,text) to authenticated;

create function public.hba_book_bank_dues(
 p_transaction uuid,p_uid text,p_year int,p_annual_due numeric,p_payee text,p_memo text,
 p_remember boolean default false,p_payer_fingerprint text default null,p_payer_label text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
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
end $$;
revoke all on function public.hba_book_bank_dues(uuid,text,int,numeric,text,text,boolean,text,text) from public,anon;
grant execute on function public.hba_book_bank_dues(uuid,text,int,numeric,text,text,boolean,text,text) to authenticated;

create function public.hba_remove_dues_receipt(p_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
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
end $$;
revoke all on function public.hba_remove_dues_receipt(uuid) from public,anon;
grant execute on function public.hba_remove_dues_receipt(uuid) to authenticated;

create function public.hba_protect_credited_register() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.hba_dues_receipts where register_id=old.id)
 and (new.amount is distinct from old.amount or new.direction is distinct from old.direction
 or new.category_code is distinct from old.category_code or new.voided is distinct from old.voided
 or new.bank_account_id is distinct from old.bank_account_id) then
 raise exception 'Administrator must reverse household receipt credits before changing this entry'; end if;
 return new;
end $$;
revoke all on function public.hba_protect_credited_register() from public,anon,authenticated;
create trigger protect_credited_register before update on public.hba_check_register for each row execute function public.hba_protect_credited_register();
