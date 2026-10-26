create table public.hba_payment_settings(
 id int primary key default 1 check(id=1), recipient_name text not null default '',
 recipient_identifier text not null default '', enabled boolean not null default false,
 updated_by uuid default auth.uid() references auth.users(id), updated_at timestamptz not null default now(),
 check(not enabled or (length(recipient_name)>0 and length(recipient_identifier)>0))
);
insert into public.hba_payment_settings(id) values(1);
create table public.hba_payment_reports(
 id uuid primary key default gen_random_uuid(), household_uid text not null,
 payment_kind text not null check(payment_kind in ('dues','donation')),
 fund text not null check(fund in ('dues','beach_nourishment','jetties','road_replacement','events','general')),
 event_id uuid references public.hba_events(id), payment_year int not null check(payment_year between 2020 and 2100),
 amount numeric(12,2) not null check(amount>0 and amount<=1000000), payment_date date not null,
 reference text not null default '' check(length(reference)<=100), note text not null default '' check(length(note)<=3000),
 state text not null default 'pending' check(state in ('pending','verified','rejected')),
 board_note text not null default '', reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 check((payment_kind='dues' and fund='dues' and event_id is null) or (payment_kind='donation' and fund<>'dues'))
);
create index payment_reports_owner on public.hba_payment_reports(created_by);
create index payment_reports_state on public.hba_payment_reports(state);
create table public.hba_public_advisories(
 id uuid primary key default gen_random_uuid(), category text not null check(category in ('swimming','shellfishing')),
 location text not null check(length(location) between 1 and 300),
 status text not null check(status in ('open','closed','unverified')),
 note text not null default '' check(length(note)<=3000), source_url text not null,
 checked_at timestamptz not null, valid_until timestamptz not null,
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 check(valid_until>checked_at and valid_until<=checked_at+interval '24 hours')
);
alter table public.hba_payment_settings enable row level security;
alter table public.hba_payment_reports enable row level security;
alter table public.hba_public_advisories enable row level security;
revoke all on public.hba_payment_settings,public.hba_payment_reports,public.hba_public_advisories from anon;
grant select on public.hba_payment_settings,public.hba_payment_reports to authenticated;
grant update on public.hba_payment_settings to authenticated;
grant insert,update,delete on public.hba_payment_reports to authenticated;
grant select on public.hba_public_advisories to anon,authenticated;
grant insert,delete on public.hba_public_advisories to authenticated;
create policy payment_settings_read on public.hba_payment_settings for select to authenticated using(public.hba_is_member());
create policy payment_settings_update on public.hba_payment_settings for update to authenticated using(public.hba_role()='admin') with check(public.hba_role()='admin');
create policy payment_reports_read on public.hba_payment_reports for select to authenticated using(public.hba_is_board() or (public.hba_is_member() and created_by=auth.uid()));
create policy payment_reports_add on public.hba_payment_reports for insert to authenticated with check(public.hba_is_member() and created_by=auth.uid() and household_uid=public.hba_household() and state='pending' and reviewed_by is null and reviewed_at is null and board_note='');
create policy payment_reports_review on public.hba_payment_reports for update to authenticated using(public.hba_is_board()) with check(public.hba_is_board());
create policy payment_reports_delete on public.hba_payment_reports for delete to authenticated using(public.hba_role()='admin');
create policy advisories_public_read on public.hba_public_advisories for select to anon,authenticated using(true);
create policy advisories_add on public.hba_public_advisories for insert to authenticated with check(public.hba_is_board() and created_by=auth.uid());
create policy advisories_delete on public.hba_public_advisories for delete to authenticated using(public.hba_role()='admin');
