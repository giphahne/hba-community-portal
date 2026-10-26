create table public.hba_elections(
 year int primary key check(year>=2027 and year<=2200 and (year-2027)%2=0),
 meeting_id uuid references public.hba_meetings(id),
 nomination_deadline date,
 state text not null default 'planning' check(state in ('planning','nominations_open','meeting_scheduled','results_recorded')),
 notice text not null default '', positions text not null default '',
 nomination_instructions text not null default '', results text not null default '',
 source_note text not null default '',
 updated_by uuid references auth.users(id),updated_at timestamptz not null default now()
);
create table public.hba_election_audit(
 id uuid primary key default gen_random_uuid(),year int not null,
 before_record jsonb,after_record jsonb,changed_by uuid not null default auth.uid(),
 changed_at timestamptz not null default now()
);
create function public.hba_validate_election() returns trigger language plpgsql set search_path=public as $$
begin
 if new.meeting_id is not null and not exists(select 1 from public.hba_meetings where id=new.meeting_id
  and extract(year from meeting_date)=new.year and extract(month from meeting_date)=8)
 then raise exception 'Choose the August meeting in this election year'; end if;
 if new.state='meeting_scheduled' and new.meeting_id is null then raise exception 'Link the actual August meeting first'; end if;
 if new.state='results_recorded' and (length(trim(new.results))=0 or length(trim(new.source_note))=0)
 then raise exception 'Recorded results require results text and supporting minutes/source'; end if;
 new.updated_by=auth.uid();new.updated_at=now();return new;
end $$;
revoke all on function public.hba_validate_election() from public,anon,authenticated;
create trigger election_validate before insert or update on public.hba_elections
 for each row execute function public.hba_validate_election();
create function public.hba_audit_election() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.hba_election_audit(year,before_record,after_record,changed_by)
 values(coalesce(new.year,old.year),case when tg_op='INSERT' then null else to_jsonb(old) end,
 case when tg_op='DELETE' then null else to_jsonb(new) end,auth.uid());
 return coalesce(new,old);
end $$;
revoke all on function public.hba_audit_election() from public,anon,authenticated;
alter table public.hba_elections enable row level security;
alter table public.hba_election_audit enable row level security;
revoke all on public.hba_elections,public.hba_election_audit from anon,authenticated;
grant select,insert,update,delete on public.hba_elections to authenticated;
grant select on public.hba_election_audit to authenticated;
create policy elections_read on public.hba_elections for select to authenticated using(public.hba_is_member());
create policy elections_add on public.hba_elections for insert to authenticated with check(public.hba_is_board());
create policy elections_edit on public.hba_elections for update to authenticated using(public.hba_is_board()) with check(public.hba_is_board());
create policy elections_delete on public.hba_elections for delete to authenticated using(public.hba_role()='admin');
create policy election_audit_read on public.hba_election_audit for select to authenticated using(public.hba_is_board());
-- Explicit user-provided schedule only; no exact meeting, nominations or results invented.
insert into public.hba_elections(year,notice,source_note)
select y,'Elections at the August meeting. Exact meeting date and procedures to be announced.',
 'Two-year election cycle, with 2027 an election year, supplied by a member on October 17, 2026. 2022 bylaws call for elections every other August.'
from generate_series(2027,2035,2) as y;
create trigger election_audit after insert or update or delete on public.hba_elections
 for each row execute function public.hba_audit_election();
