-- HBA member archive. No title, payment, event-date or household history is invented.
create table public.hba_members (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null, display_name text not null default '',
 role text not null default 'pending' check(role in ('pending','resident','board','admin','suspended')),
 household_uid text, created_at timestamptz not null default now()
);
create or replace function public.hba_role() returns text
language sql stable security definer set search_path=public
as $$ select coalesce((select m.role from public.hba_members m join auth.users u on u.id=m.id
 where m.id=auth.uid() and u.email_confirmed_at is not null),'anonymous') $$;
revoke all on function public.hba_role() from public;
grant execute on function public.hba_role() to authenticated;
create or replace function public.hba_is_board() returns boolean
language sql stable security definer set search_path=public
as $$ select public.hba_role() in ('board','admin') $$;
revoke all on function public.hba_is_board() from public;
grant execute on function public.hba_is_board() to authenticated;
create or replace function public.hba_is_member() returns boolean
language sql stable security definer set search_path=public
as $$ select public.hba_role() in ('resident','board','admin') $$;
revoke all on function public.hba_is_member() from public;
grant execute on function public.hba_is_member() to authenticated;
create or replace function public.hba_household() returns text
language sql stable security definer set search_path=public
as $$ select household_uid from public.hba_members where id=auth.uid() and public.hba_is_member() $$;
revoke all on function public.hba_household() from public;
grant execute on function public.hba_household() to authenticated;
create or replace function public.hba_sync_member() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into public.hba_members(id,email,display_name,role)
 values(new.id,lower(new.email),left(coalesce(new.raw_user_meta_data->>'display_name',''),120),
 case when lower(new.email)='admin@example.com' and new.email_confirmed_at is not null then 'admin' else 'pending' end)
 on conflict(id) do update set email=excluded.email,
 role=case when lower(new.email)='admin@example.com' and new.email_confirmed_at is not null then 'admin' else hba_members.role end;
 return new;
end $$;
revoke all on function public.hba_sync_member() from public;
create trigger hba_member_sync after insert or update of email,email_confirmed_at on auth.users
 for each row execute function public.hba_sync_member();
create or replace function public.hba_manage_member(member_id uuid,new_role text,new_household text default null)
returns void language plpgsql security definer set search_path=public as $$
declare oldrole text;
begin
 if not public.hba_is_board() then raise exception 'Board access required'; end if;
 if new_role not in ('pending','resident','board','suspended') then raise exception 'Invalid role'; end if;
 select role into oldrole from public.hba_members where id=member_id;
 if not found then raise exception 'Member not found'; end if;
 if oldrole='admin' then raise exception 'Initial administrator cannot be changed here'; end if;
 if public.hba_role()<>'admin' and (new_role='board' or oldrole='board') then raise exception 'Administrator required for board roles'; end if;
 update public.hba_members set role=new_role,household_uid=nullif(new_household,'') where id=member_id;
end $$;
revoke all on function public.hba_manage_member(uuid,text,text) from public;
grant execute on function public.hba_manage_member(uuid,text,text) to authenticated;

create table public.hba_series (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 160),
 description text not null default '', created_at timestamptz not null default now()
);
create table public.hba_events (
 id uuid primary key default gen_random_uuid(), series_id uuid not null references public.hba_series(id),
 title text not null check(length(title) between 1 and 180), event_date date not null,
 event_time time, location text not null default '', description text not null default '',
 state text not null default 'scheduled' check(state in ('scheduled','held','cancelled')),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.hba_documents (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 180),
 category text not null check(category in ('budget','minutes','governing')),
 document_year int check(document_year between 1800 and 2200), description text not null default '',
 file_path text not null unique, original_name text not null, created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.hba_house_history (
 id uuid primary key default gen_random_uuid(), household_uid text not null,
 title text not null check(length(title) between 1 and 180), story text not null check(length(story) between 1 and 12000),
 history_year int check(history_year between 1600 and 2200),
 status text not null default 'pending' check(status in ('pending','published')),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.hba_work (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 180),
 contractor text not null default '', location text not null default '', work_date date,
 description text not null default '', state text not null default 'planned'
 check(state in ('planned','in_progress','incomplete','defect','resolved','accepted')),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now()
);
create table public.hba_work_notes (
 id uuid primary key default gen_random_uuid(), work_id uuid not null references public.hba_work(id),
 note text not null check(length(note) between 1 and 12000),
 flag text not null check(flag in ('progress','incomplete','defect','resolved','accepted')),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now()
);
create table public.hba_photos (
 id uuid primary key default gen_random_uuid(),
 event_id uuid references public.hba_events(id), history_id uuid references public.hba_house_history(id),
 work_id uuid references public.hba_work(id),
 caption text not null default '' check(length(caption)<=2000), credit text not null default '' check(length(credit)<=200),
 file_path text not null unique, status text not null default 'pending' check(status in ('pending','published')),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 check(num_nonnulls(event_id,history_id,work_id)=1)
);
create table public.hba_dues (
 year int not null check(year between 2020 and 2100), uid text not null, status text not null check(status in ('unknown','paid','unpaid')),
 revision int not null default 1, updated_at timestamptz not null default now(),
 updated_by uuid not null default auth.uid() references auth.users(id), primary key(year,uid)
);
create table public.hba_dues_audit (
 id bigint generated always as identity primary key, year int not null, uid text not null,
 old_status text, new_status text not null, changed_by uuid not null default auth.uid(), changed_at timestamptz not null default now()
);
create or replace function public.hba_set_dues(p_year int,p_uid text,p_status text,p_revision int)
returns public.hba_dues language plpgsql security definer set search_path=public as $$
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
end $$;
revoke all on function public.hba_set_dues(int,text,text,int) from public;
grant execute on function public.hba_set_dues(int,text,text,int) to authenticated;
create or replace function public.hba_import_dues(p_year int,p_rows jsonb)
returns setof public.hba_dues language plpgsql security definer set search_path=public as $$
declare r jsonb;
begin
 if not public.hba_is_board() then raise exception 'Board access required'; end if;
 if jsonb_array_length(p_rows)>300 then raise exception 'Too many rows'; end if;
 for r in select value from jsonb_array_elements(p_rows) order by value->>'uid' loop
 return next public.hba_set_dues(p_year,r->>'uid',r->>'status',(r->>'revision')::int);
 end loop;
end $$;
revoke all on function public.hba_import_dues(int,jsonb) from public;
grant execute on function public.hba_import_dues(int,jsonb) to authenticated;

alter table public.hba_members enable row level security;
create policy members_read on public.hba_members for select to authenticated using(id=auth.uid() or public.hba_is_board());
-- Role changes only through the checked RPC; no direct role update grant.
alter table public.hba_series enable row level security;
alter table public.hba_events enable row level security;
alter table public.hba_documents enable row level security;
alter table public.hba_house_history enable row level security;
alter table public.hba_work enable row level security;
alter table public.hba_work_notes enable row level security;
alter table public.hba_photos enable row level security;
alter table public.hba_dues enable row level security;
alter table public.hba_dues_audit enable row level security;
create policy series_read on public.hba_series for select to authenticated using(public.hba_is_member());
create policy series_add on public.hba_series for insert to authenticated with check(public.hba_is_board());
create policy series_edit on public.hba_series for update to authenticated using(public.hba_is_board()) with check(public.hba_is_board());
create policy events_read on public.hba_events for select to authenticated using(public.hba_is_member());
create policy events_add on public.hba_events for insert to authenticated with check(public.hba_is_board() and created_by=auth.uid());
create policy events_edit on public.hba_events for update to authenticated using(public.hba_is_board()) with check(public.hba_is_board());
create policy documents_read on public.hba_documents for select to authenticated using(public.hba_is_member());
create policy documents_add on public.hba_documents for insert to authenticated with check(public.hba_is_board() and created_by=auth.uid());
create policy history_read on public.hba_house_history for select to authenticated using(public.hba_is_member() and (status='published' or created_by=auth.uid() or public.hba_is_board()));
create policy history_add on public.hba_house_history for insert to authenticated with check(public.hba_is_member() and created_by=auth.uid() and
 (public.hba_is_board() or (household_uid=public.hba_household() and status='pending')));
create policy history_edit on public.hba_house_history for update to authenticated using(public.hba_is_board()) with check(public.hba_is_board());
create policy work_read on public.hba_work for select to authenticated using(public.hba_is_board());
create policy work_add on public.hba_work for insert to authenticated with check(public.hba_is_board() and created_by=auth.uid());
create policy work_edit on public.hba_work for update to authenticated using(public.hba_is_board()) with check(public.hba_is_board());
create policy work_notes_read on public.hba_work_notes for select to authenticated using(public.hba_is_board());
create policy work_notes_add on public.hba_work_notes for insert to authenticated with check(public.hba_is_board() and created_by=auth.uid());
create policy photo_read on public.hba_photos for select to authenticated using(public.hba_is_member() and
 (case when work_id is not null then public.hba_is_board()
 else public.hba_is_board() or (status='published' and (history_id is null or exists(select 1 from public.hba_house_history h where h.id=history_id and h.status='published'))) or created_by=auth.uid() end));
create policy photo_add on public.hba_photos for insert to authenticated with check(created_by=auth.uid() and public.hba_is_member() and
 (public.hba_is_board() or (status='pending' and work_id is null and (history_id is null or exists(select 1 from public.hba_house_history h where h.id=history_id and h.created_by=auth.uid() and h.household_uid=public.hba_household())))));
create policy photo_edit on public.hba_photos for update to authenticated using(public.hba_is_board()) with check(public.hba_is_board());
create policy dues_read on public.hba_dues for select to authenticated using(public.hba_is_board());
create policy dues_audit_read on public.hba_dues_audit for select to authenticated using(public.hba_is_board());
-- Every destructive row operation is administrator-only, not board or resident.
do $$ declare t text; begin
 foreach t in array array['hba_series','hba_events','hba_documents','hba_house_history','hba_work','hba_work_notes','hba_photos','hba_dues','hba_dues_audit'] loop
 execute format('create policy admin_delete on public.%I for delete to authenticated using (public.hba_role()=''admin'')',t);
 end loop;
end $$;
grant select on public.hba_members to authenticated;
grant select,insert,update,delete on public.hba_series,public.hba_events,public.hba_documents,public.hba_house_history,public.hba_work,public.hba_work_notes,public.hba_photos to authenticated;
grant select,delete on public.hba_dues,public.hba_dues_audit to authenticated;
revoke all on public.hba_members,public.hba_series,public.hba_events,public.hba_documents,public.hba_house_history,public.hba_work,public.hba_work_notes,public.hba_photos,public.hba_dues,public.hba_dues_audit from anon;
create index on public.hba_events(event_date);
create index on public.hba_events(series_id);
create index on public.hba_photos(event_id);
create index on public.hba_photos(history_id);
create index on public.hba_photos(work_id);
create index on public.hba_house_history(household_uid);
insert into public.hba_series(title,description) values('Spaghetti Supper','Event series requested by HBA. Add documented dates and photos; no past occurrence dates have been assumed.');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('hba-archive','hba-archive',false,8388608,array['application/pdf','image/jpeg','image/png','image/webp']);
create policy hba_file_read on storage.objects for select to authenticated using(bucket_id='hba-archive' and public.hba_is_member() and
 (exists(select 1 from public.hba_documents d where d.file_path=name) or exists(select 1 from public.hba_photos p where p.file_path=name)));
create policy hba_file_insert on storage.objects for insert to authenticated with check(bucket_id='hba-archive' and public.hba_is_member() and
 ((name like 'documents/%' and public.hba_is_board()) or
 (name like 'photos/%' and exists(select 1 from public.hba_photos p where p.file_path=name and p.created_by=auth.uid()))));
create policy hba_file_delete on storage.objects for delete to authenticated using(bucket_id='hba-archive' and public.hba_role()='admin');
