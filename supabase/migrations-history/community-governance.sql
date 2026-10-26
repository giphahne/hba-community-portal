alter table public.hba_documents alter column created_by drop not null;
alter table public.hba_documents add column original_path text unique;
alter table public.hba_documents add column source_sha256 text;
alter table public.hba_documents add column source_date date;
update storage.buckets set allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp','application/msword'] where id='hba-archive';
drop policy hba_file_read on storage.objects;
create policy hba_file_read on storage.objects for select to authenticated using(bucket_id='hba-archive' and public.hba_is_member() and
 (exists(select 1 from public.hba_documents d where d.file_path=name or d.original_path=name) or exists(select 1 from public.hba_photos p where p.file_path=name)));
create table public.hba_decisions (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 180),
 meeting_date date not null, decision_type text not null check(decision_type in ('board','capital','dues','amendment','emergency')),
 motion text not null check(length(motion) between 1 and 12000), recorded_outcome text not null check(recorded_outcome in ('proposed','approved','rejected','deferred')),
 amount numeric(12,2) check(amount>=0), governors_present int check(governors_present between 0 and 10),
 members_represented int check(members_represented>=0), votes_yes int check(votes_yes>=0),
 votes_no int check(votes_no>=0), abstentions int check(abstentions>=0),
 review_notes text not null default '', minutes_id uuid references public.hba_documents(id),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now()
);
alter table public.hba_decisions enable row level security;
grant select,insert,update,delete on public.hba_decisions to authenticated;
revoke all on public.hba_decisions from anon;
create policy decisions_read on public.hba_decisions for select to authenticated using(public.hba_is_board());
create policy decisions_add on public.hba_decisions for insert to authenticated with check(public.hba_is_board() and created_by=auth.uid());
create policy decisions_edit on public.hba_decisions for update to authenticated using(public.hba_is_board()) with check(public.hba_is_board());
create policy decisions_delete on public.hba_decisions for delete to authenticated using(public.hba_role()='admin');
create table public.hba_officeholders (
 id uuid primary key default gen_random_uuid(), position text not null unique,
 member_name text not null, household_uid text, term_start date, term_end date,
 source_note text not null default '', created_by uuid not null default auth.uid() references auth.users(id)
);
alter table public.hba_officeholders enable row level security;
grant select,insert,update,delete on public.hba_officeholders to authenticated;
revoke all on public.hba_officeholders from anon;
create policy officeholders_read on public.hba_officeholders for select to authenticated using(public.hba_is_member());
create policy officeholders_add on public.hba_officeholders for insert to authenticated with check(public.hba_is_board() and created_by=auth.uid());
create policy officeholders_edit on public.hba_officeholders for update to authenticated using(public.hba_is_board()) with check(public.hba_is_board());
create policy officeholders_delete on public.hba_officeholders for delete to authenticated using(public.hba_role()='admin');
