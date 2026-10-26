create table public.hba_issues (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 180),
 location text not null default '', description text not null check(length(description) between 1 and 12000),
 category text not null default 'general' check(category in ('roads','drainage','beach','safety','common_area','general')),
 state text not null default 'pending_meeting' check(state in ('pending_meeting','approved','rejected','further_review','complete')),
 board_note text not null default '', created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.hba_issues enable row level security;
grant select,insert,update,delete on public.hba_issues to authenticated;
revoke all on public.hba_issues from anon;
create policy issues_read on public.hba_issues for select to authenticated using(public.hba_is_board());
create policy issues_add on public.hba_issues for insert to authenticated with check(public.hba_is_member() and created_by=auth.uid() and state='pending_meeting' and board_note='');
create policy issues_edit on public.hba_issues for update to authenticated using(public.hba_is_board()) with check(public.hba_is_board());
create policy issues_delete on public.hba_issues for delete to authenticated using(public.hba_role()='admin');
create or replace function public.hba_owns_issue(issue uuid) returns boolean
language sql stable security definer set search_path=public
as $$ select public.hba_is_member() and exists(select 1 from public.hba_issues i where i.id=issue and i.created_by=auth.uid()) $$;
revoke all on function public.hba_owns_issue(uuid) from public;
grant execute on function public.hba_owns_issue(uuid) to authenticated;
alter table public.hba_photos add column issue_id uuid references public.hba_issues(id);
alter table public.hba_photos drop constraint hba_photos_check;
alter table public.hba_photos add constraint hba_photos_one_parent check(num_nonnulls(event_id,history_id,work_id,issue_id)=1);
drop policy photo_read on public.hba_photos;
create policy photo_read on public.hba_photos for select to authenticated using(public.hba_is_member() and
 (case when work_id is not null or issue_id is not null then public.hba_is_board()
 else public.hba_is_board() or (status='published' and (history_id is null or exists(select 1 from public.hba_house_history h where h.id=history_id and h.status='published'))) or created_by=auth.uid() end));
drop policy photo_add on public.hba_photos;
create policy photo_add on public.hba_photos for insert to authenticated with check(created_by=auth.uid() and public.hba_is_member() and
 (public.hba_is_board() or (status='pending' and work_id is null and
 (case when issue_id is not null then public.hba_owns_issue(issue_id)
 when history_id is not null then exists(select 1 from public.hba_house_history h where h.id=history_id and h.created_by=auth.uid() and h.household_uid=public.hba_household())
 else event_id is not null end))));
create or replace function public.hba_can_store_photo(object_path text) returns boolean
language sql stable security definer set search_path=public
as $$ select public.hba_is_member() and exists(select 1 from public.hba_photos p where p.file_path=object_path and p.created_by=auth.uid()) $$;
revoke all on function public.hba_can_store_photo(text) from public;
grant execute on function public.hba_can_store_photo(text) to authenticated;
drop policy hba_file_insert on storage.objects;
create policy hba_file_insert on storage.objects for insert to authenticated with check(bucket_id='hba-archive' and public.hba_is_member() and
 ((name like 'documents/%' and public.hba_is_board()) or (name like 'photos/%' and public.hba_can_store_photo(name))));
create index on public.hba_photos(issue_id);
create index on public.hba_issues(state);
