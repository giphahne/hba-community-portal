-- Meeting minutes (2026-10-17). The linked, in-term Secretary account or the administrator writes and
-- approves minutes; board accounts can read drafts for review; approved residents read approved minutes only.
create function public.hba_can_edit_minutes() returns boolean
language sql stable security definer set search_path=public as $$
 select public.hba_can_edit_newsletter()
$$;
revoke all on function public.hba_can_edit_minutes() from public,anon;
grant execute on function public.hba_can_edit_minutes() to authenticated;

create table public.hba_meeting_minutes(
 id uuid primary key default gen_random_uuid(),
 meeting_id uuid references public.hba_meetings(id) on delete set null,
 meeting_date date not null,
 meeting_time time,
 title text not null check(length(title) between 1 and 180),
 location text not null default '' check(length(location)<=180),
 called_to_order time,
 adjourned time,
 attendees text not null default '' check(length(attendees)<=4000),
 body text not null default '' check(length(body)<=60000),
 motions text not null default '' check(length(motions)<=20000),
 action_items text not null default '' check(length(action_items)<=20000),
 state text not null default 'draft' check(state in ('draft','approved')),
 approved_on date,
 approved_note text not null default '' check(length(approved_note)<=400),
 file_path text unique,
 original_name text,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index hba_minutes_date_idx on public.hba_meeting_minutes(meeting_date desc);
create trigger minutes_stamp before update on public.hba_meeting_minutes
for each row execute function public.hba_newsletter_stamp();
alter table public.hba_meeting_minutes enable row level security;
revoke all on public.hba_meeting_minutes from anon,authenticated;
grant select,insert,delete on public.hba_meeting_minutes to authenticated;
grant update(meeting_id,meeting_date,meeting_time,title,location,called_to_order,adjourned,attendees,body,motions,action_items,state,approved_on,approved_note,file_path,original_name) on public.hba_meeting_minutes to authenticated;
create policy minutes_read on public.hba_meeting_minutes for select to authenticated
 using(public.hba_can_edit_minutes() or public.hba_is_board() or (public.hba_is_member() and state='approved'));
create policy minutes_add on public.hba_meeting_minutes for insert to authenticated
 with check(public.hba_can_edit_minutes() and created_by=auth.uid() and
 (file_path is null or file_path like 'minutes/'||id::text||'/%'));
create policy minutes_edit on public.hba_meeting_minutes for update to authenticated
 using(public.hba_can_edit_minutes()) with check(public.hba_can_edit_minutes() and
 (file_path is null or file_path like 'minutes/'||id::text||'/%'));
create policy minutes_delete on public.hba_meeting_minutes for delete to authenticated using(public.hba_role()='admin');
create policy minutes_file_read on storage.objects for select to authenticated
 using(bucket_id='hba-archive' and exists(select 1 from public.hba_meeting_minutes n where n.file_path=name));
create policy minutes_file_add on storage.objects for insert to authenticated
 with check(bucket_id='hba-archive' and name like 'minutes/%' and public.hba_can_edit_minutes());
