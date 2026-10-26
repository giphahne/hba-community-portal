-- Read-only board register; only linked treasurer / administrator may write.
create function public.hba_can_edit_finance() returns boolean
language sql stable security definer set search_path=public as $$
 select public.hba_role()='admin' or (public.hba_is_board() and exists(
 select 1 from public.hba_officeholders o where o.member_id=auth.uid() and o.position='Treasurer'
 and (o.term_start is null or o.term_start<=current_date)
 and (o.term_end is null or o.term_end>=current_date)))
$$;
revoke all on function public.hba_can_edit_finance() from public,anon;
grant execute on function public.hba_can_edit_finance() to authenticated;
create table public.hba_finance_categories(
 code text primary key, label text not null, direction text not null check(direction in ('income','expense')),
 model_line text not null
);
insert into public.hba_finance_categories values
 ('dues','Annual dues','income','duesIn'),
 ('donations','General donations','income','oneTime'),
 ('paving_campaigns','Paving campaign contributions','income','gifts'),
 ('events_income','Event receipts','income','ev'),
 ('other_income','Other income','income','other'),
 ('operations','General operations','expense','op'),
 ('event_costs','Event costs','expense','op'),
 ('cleaning','Beach cleaning','expense','cleaning'),
 ('sand','Beach nourishment','expense','sand'),
 ('jetties','Jetties','expense','jetty'),
 ('reynolds','Reynolds road work','expense','reynolds'),
 ('algelo','Algelo road work','expense','algelo'),
 ('worrall_paving','Worrall paving','expense','wPave'),
 ('worrall_drainage','Worrall drainage','expense','wDrain'),
 ('other_expense','Other expense','expense','other');
create table public.hba_check_register(
 id uuid primary key default gen_random_uuid(),
 transaction_date date not null,
 direction text not null check(direction in ('income','expense')),
 category_code text not null references public.hba_finance_categories(code),
 payee text not null check(length(payee) between 1 and 180),
 amount numeric(12,2) not null check(amount>0),
 reference text not null default '' check(length(reference)<=80),
 memo text not null default '' check(length(memo)<=3000),
 cleared boolean not null default false,
 voided boolean not null default false,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index hba_register_date_idx on public.hba_check_register(transaction_date);
create table public.hba_category_budgets(
 year int not null check(year between 2020 and 2100),
 category_code text not null references public.hba_finance_categories(code),
 amount numeric(12,2) not null check(amount>=0),
 basis text not null check(basis in ('draft','adopted')),
 source_note text not null default '' check(length(source_note)<=2000),
 updated_at timestamptz not null default now(),
 primary key(year,category_code)
);
create table public.hba_finance_audit(
 id uuid primary key default gen_random_uuid(),
 record_table text not null,
 record_key text not null,
 action text not null,
 before_record jsonb,
 after_record jsonb,
 changed_by uuid not null default auth.uid() references auth.users(id),
 changed_at timestamptz not null default now()
);
create function public.hba_finance_validate() returns trigger
language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from public.hba_finance_categories c where c.code=new.category_code and c.direction=new.direction) then
 raise exception 'Budget category does not match income/expense'; end if;
 new.updated_at=now(); return new;
end $$;
revoke all on function public.hba_finance_validate() from public,anon,authenticated;
create trigger finance_validate before insert or update on public.hba_check_register for each row execute function public.hba_finance_validate();
create trigger category_budget_stamp before update on public.hba_category_budgets for each row execute function public.hba_newsletter_stamp();
create function public.hba_finance_record_audit() returns trigger
language plpgsql security definer set search_path=public as $$
declare old_data jsonb; new_data jsonb;
begin
 old_data=case when tg_op='INSERT' then null else to_jsonb(old) end;
 new_data=case when tg_op='DELETE' then null else to_jsonb(new) end;
 insert into public.hba_finance_audit(record_table,record_key,action,before_record,after_record,changed_by)
 values(tg_table_name,coalesce(new_data->>'id',old_data->>'id',coalesce(new_data->>'year',old_data->>'year')||'/'||coalesce(new_data->>'category_code',old_data->>'category_code')),tg_op,old_data,new_data,auth.uid());
 return coalesce(new,old);
end $$;
revoke all on function public.hba_finance_record_audit() from public,anon,authenticated;
create trigger register_audit after insert or update or delete on public.hba_check_register for each row execute function public.hba_finance_record_audit();
create trigger budget_line_audit after insert or update or delete on public.hba_category_budgets for each row execute function public.hba_finance_record_audit();
alter table public.hba_finance_categories enable row level security;
alter table public.hba_check_register enable row level security;
alter table public.hba_category_budgets enable row level security;
alter table public.hba_finance_audit enable row level security;
revoke all on public.hba_finance_categories,public.hba_check_register,public.hba_category_budgets,public.hba_finance_audit from anon,authenticated;
grant select on public.hba_finance_categories,public.hba_check_register,public.hba_category_budgets,public.hba_finance_audit to authenticated;
grant insert,delete on public.hba_check_register,public.hba_category_budgets to authenticated;
grant update(transaction_date,direction,category_code,payee,amount,reference,memo,cleared,voided) on public.hba_check_register to authenticated;
grant update(amount,basis,source_note) on public.hba_category_budgets to authenticated;
create policy finance_categories_read on public.hba_finance_categories for select to authenticated using(public.hba_is_board());
create policy register_read on public.hba_check_register for select to authenticated using(public.hba_is_board());
create policy register_add on public.hba_check_register for insert to authenticated with check(public.hba_can_edit_finance() and created_by=auth.uid());
create policy register_edit on public.hba_check_register for update to authenticated using(public.hba_can_edit_finance()) with check(public.hba_can_edit_finance());
create policy register_delete on public.hba_check_register for delete to authenticated using(public.hba_role()='admin');
create policy category_budget_read on public.hba_category_budgets for select to authenticated using(public.hba_is_board());
create policy category_budget_add on public.hba_category_budgets for insert to authenticated with check(public.hba_can_edit_finance());
create policy category_budget_edit on public.hba_category_budgets for update to authenticated using(public.hba_can_edit_finance()) with check(public.hba_can_edit_finance());
create policy category_budget_delete on public.hba_category_budgets for delete to authenticated using(public.hba_role()='admin');
create policy finance_audit_read on public.hba_finance_audit for select to authenticated using(public.hba_is_board());
-- Explicitly safe anon-visible area/status helper. It discloses no member data.
create function public.hba_volunteer_task_visible(p_state text) returns boolean
language sql stable security definer set search_path=public as $$
 select p_state in ('published','closed','complete') or (auth.uid() is not null and public.hba_is_board())
$$;
revoke all on function public.hba_volunteer_task_visible(text) from public;
grant execute on function public.hba_volunteer_task_visible(text) to anon,authenticated;
drop policy volunteer_task_read on public.hba_volunteer_tasks;
create policy volunteer_task_read on public.hba_volunteer_tasks for select to anon,authenticated using(public.hba_volunteer_task_visible(state));
