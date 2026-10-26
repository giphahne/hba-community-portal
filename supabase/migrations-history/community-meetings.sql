-- Meeting planning is not a bylaw vote or spending authorization.
alter table public.hba_officeholders add column member_id uuid references public.hba_members(id);
-- Office-to-account links confer scheduler capability, so enforce at database level.
create function public.hba_protect_scheduler_office() returns trigger
language plpgsql set search_path=public as $$
begin
 if public.hba_role()<>'admin' and (
   (new.position in ('President','Secretary') and new.member_id is not null)
   or (tg_op='UPDATE' and old.position in ('President','Secretary') and old.member_id is not null)
 ) then raise exception 'Administrator required to change a linked scheduling office'; end if;
 return new;
end $$;
revoke all on function public.hba_protect_scheduler_office() from public,anon,authenticated;
create trigger protect_scheduler_office before insert or update on public.hba_officeholders
 for each row execute function public.hba_protect_scheduler_office();
create or replace function public.hba_can_schedule() returns boolean
language sql stable security definer set search_path=public as $$
 select public.hba_role()='admin' or (public.hba_is_board() and exists(
 select 1 from public.hba_officeholders o where o.member_id=auth.uid()
 and o.position in ('President','Secretary')
 and (o.term_start is null or o.term_start<=current_date)
 and (o.term_end is null or o.term_end>=current_date)))
$$;
revoke all on function public.hba_can_schedule() from public,anon;
grant execute on function public.hba_can_schedule() to authenticated;
create table public.hba_meetings(
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(title) between 1 and 180),
 meeting_date date not null, meeting_time time not null,
 duration_minutes int not null default 60 check(duration_minutes between 15 and 480),
 location text not null default '', description text not null default '',
 state text not null default 'scheduled' check(state in ('scheduled','held','cancelled')),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.hba_meeting_access(
 id uuid primary key references public.hba_meetings(id),
 zoom_url text not null default '',
 reminder_hours int not null default 24 check(reminder_hours in (1,2,24,48)),
 created_by uuid not null default auth.uid() references auth.users(id)
);
create table public.hba_agenda_items(
 id uuid primary key default gen_random_uuid(),
 meeting_id uuid references public.hba_meetings(id),
 title text not null check(length(title) between 1 and 180),
 description text not null default '' check(length(description)<=12000),
 audience text not null default 'board' check(audience in ('board','members')),
 state text not null default 'submitted' check(state in ('submitted','included','deferred','addressed')),
 sort_order int not null default 10 check(sort_order between 0 and 999),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create index hba_agenda_meeting_idx on public.hba_agenda_items(meeting_id,sort_order);
alter table public.hba_meetings enable row level security;
alter table public.hba_meeting_access enable row level security;
alter table public.hba_agenda_items enable row level security;
grant select,insert,update,delete on public.hba_meetings,public.hba_meeting_access,public.hba_agenda_items to authenticated;
revoke all on public.hba_meetings,public.hba_meeting_access,public.hba_agenda_items from anon;
create policy meetings_read on public.hba_meetings for select to authenticated using(public.hba_is_member());
create policy meetings_add on public.hba_meetings for insert to authenticated with check(public.hba_can_schedule() and created_by=auth.uid());
create policy meetings_edit on public.hba_meetings for update to authenticated using(public.hba_can_schedule()) with check(public.hba_can_schedule());
create policy meetings_delete on public.hba_meetings for delete to authenticated using(public.hba_role()='admin');
create policy meeting_access_read on public.hba_meeting_access for select to authenticated using(public.hba_is_board());
create policy meeting_access_add on public.hba_meeting_access for insert to authenticated with check(public.hba_can_schedule() and created_by=auth.uid());
create policy meeting_access_edit on public.hba_meeting_access for update to authenticated using(public.hba_can_schedule()) with check(public.hba_can_schedule());
create policy meeting_access_delete on public.hba_meeting_access for delete to authenticated using(public.hba_role()='admin');
create policy agenda_read on public.hba_agenda_items for select to authenticated using(public.hba_is_board() or (public.hba_is_member() and state='included' and audience='members'));
create policy agenda_add on public.hba_agenda_items for insert to authenticated with check(public.hba_is_board() and created_by=auth.uid());
create policy agenda_edit on public.hba_agenda_items for update to authenticated using(public.hba_is_board()) with check(public.hba_is_board());
create policy agenda_delete on public.hba_agenda_items for delete to authenticated using(public.hba_role()='admin');
