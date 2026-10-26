-- Voting, advisory polls, nominations, first-time household activation and board settings.
-- Formal online balloting stays disabled until the board-approved Voting Guidelines & Procedures are recorded.

-- ---------- Office helpers ----------
create or replace function public.hba_holds_office(p_positions text[]) returns boolean
language sql stable security definer set search_path=public as $$
 select public.hba_role()='admin' or (public.hba_is_board() and exists(
  select 1 from public.hba_officeholders o where o.member_id=auth.uid() and o.position=any(p_positions)
  and (o.term_start is null or o.term_start<=current_date) and (o.term_end is null or o.term_end>=current_date)))
$$;
revoke all on function public.hba_holds_office(text[]) from public,anon;
grant execute on function public.hba_holds_office(text[]) to authenticated;
create or replace function public.hba_is_president() returns boolean language sql stable security definer set search_path=public as $$ select public.hba_holds_office(array['President']) $$;
create or replace function public.hba_is_secretary() returns boolean language sql stable security definer set search_path=public as $$ select public.hba_holds_office(array['Secretary']) $$;
create or replace function public.hba_is_governor() returns boolean language sql stable security definer set search_path=public as $$
 select public.hba_is_board() and exists(select 1 from public.hba_officeholders o where o.member_id=auth.uid() and o.position like '%Governor%'
  and (o.term_start is null or o.term_start<=current_date) and (o.term_end is null or o.term_end>=current_date)) $$;
-- Linked offices are role claims recorded by the board; an actual office-holder record is required to call or certify a vote.
create or replace function public.hba_can_call_vote() returns boolean language sql stable security definer set search_path=public as $$ select public.hba_is_president() $$;
create or replace function public.hba_can_certify() returns boolean language sql stable security definer set search_path=public as $$ select public.hba_is_secretary() $$;
revoke all on function public.hba_is_president(),public.hba_is_secretary(),public.hba_is_governor(),public.hba_can_call_vote(),public.hba_can_certify() from public,anon;
grant execute on function public.hba_is_president(),public.hba_is_secretary(),public.hba_is_governor(),public.hba_can_call_vote(),public.hba_can_certify() to authenticated;

-- ---------- Board settings (public keys readable without sign-in for the bulletin) ----------
create table public.hba_settings(
 key text primary key check(key ~ '^[a-z_]{3,60}$'), value text not null default '' check(length(value)<=2000),
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
alter table public.hba_settings enable row level security;
revoke all on public.hba_settings from anon,authenticated;
grant select on public.hba_settings to anon,authenticated;
grant insert,update on public.hba_settings to authenticated;
create policy settings_public_read on public.hba_settings for select to anon,authenticated using(key like 'public_%' or public.hba_is_board());
create policy settings_write on public.hba_settings for insert to authenticated with check(public.hba_role()='admin');
create policy settings_edit on public.hba_settings for update to authenticated using(public.hba_role()='admin') with check(public.hba_role()='admin');
insert into public.hba_settings(key,value) values
 ('public_facebook_group_name','Quasuet Island/Hamilton Beach Friends and Family'),
 ('public_facebook_group_url',''),
 ('public_facebook_group_note','Private Facebook group with about 452 members as of October 17, 2026 (member-supplied screenshot). Not run by the HBA board; membership requires group-administrator approval.');

-- ---------- Voting Guidelines & Procedures gate ----------
create table public.hba_voting_procedures(
 id int primary key default 1 check(id=1),
 document_id uuid references public.hba_documents(id), version_label text not null default '' check(length(version_label)<=160),
 adopted_on date, online_ballots_allowed boolean not null default false, online_counts_toward_quorum boolean not null default false,
 majority_rule text not null default 'votes_cast' check(majority_rule in ('votes_cast','eligible_units')),
 confirmed_by uuid references auth.users(id), confirmed_at timestamptz, note text not null default '' check(length(note)<=3000),
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
 check(confirmed_at is null or (document_id is not null and adopted_on is not null and length(version_label)>0))
);
insert into public.hba_voting_procedures(id) values(1);
alter table public.hba_voting_procedures enable row level security;
revoke all on public.hba_voting_procedures from anon;
grant select,update on public.hba_voting_procedures to authenticated;
create policy procedures_read on public.hba_voting_procedures for select to authenticated using(public.hba_is_member());
create policy procedures_edit on public.hba_voting_procedures for update to authenticated using(public.hba_role()='admin') with check(public.hba_role()='admin');
create or replace function public.hba_procedures_confirmed() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.hba_voting_procedures where id=1 and confirmed_at is not null) $$;
revoke all on function public.hba_procedures_confirmed() from public,anon;
grant execute on function public.hba_procedures_confirmed() to authenticated;

-- ---------- Meeting audience (board meeting vs. general membership meeting) ----------
alter table public.hba_meetings add column audience text not null default 'board' check(audience in ('board','general'));

-- ---------- Additional property links (multi-property families, co-owners) ----------
create table public.hba_member_households(
 member_id uuid not null references public.hba_members(id) on delete cascade, household_uid text not null,
 note text not null default '' check(length(note)<=500), created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), primary key(member_id,household_uid)
);
alter table public.hba_member_households enable row level security;
revoke all on public.hba_member_households from anon;
grant select,insert,delete on public.hba_member_households to authenticated;
create policy member_households_read on public.hba_member_households for select to authenticated using(public.hba_is_board() or member_id=auth.uid());
create policy member_households_add on public.hba_member_households for insert to authenticated with check(public.hba_is_board() and created_by=auth.uid());
create policy member_households_delete on public.hba_member_households for delete to authenticated using(public.hba_is_board());

-- Residents may check their own household dues standing; the full registry stays board-only.
create or replace function public.hba_my_dues_status(p_year int) returns table(household_uid text, status text, updated_at timestamptz)
language sql stable security definer set search_path=public as $$
 select h.uid, coalesce(d.status,'unknown'), d.updated_at
 from (select public.hba_household() as uid union select household_uid from public.hba_member_households where member_id=auth.uid()) h
 left join public.hba_dues d on d.uid=h.uid and d.year=p_year
 where h.uid is not null and public.hba_is_member()
$$;
revoke all on function public.hba_my_dues_status(int) from public,anon;
grant execute on function public.hba_my_dues_status(int) to authenticated;

-- ---------- Votes ----------
create table public.hba_votes(
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('advisory','board','membership','capital','dues_increase','election','removal_elected','removal_appointed','amendment')),
 title text not null check(length(title) between 1 and 180),
 motion text not null check(length(motion) between 1 and 12000),
 rationale text not null default '' check(length(rationale)<=12000),
 state text not null default 'draft' check(state in ('draft','noticed','open','closed','certified','confirmed','withdrawn','deferred')),
 meeting_id uuid references public.hba_meetings(id),
 electorate text not null check(electorate in ('governors','households','street','board_and_president','all_members')),
 street text not null default '' check(length(street)<=60),
 threshold text not null check(threshold in ('majority','two_thirds','plurality','none')),
 quorum_required int not null default 0 check(quorum_required between 0 and 500),
 secret_ballot boolean not null default false,
 president_tie_break boolean not null default false,
 options jsonb not null default '["Yes","No","Abstain"]'::jsonb,
 amount numeric(12,2) check(amount is null or amount>=0),
 classification jsonb not null default '{}'::jsonb,
 basis text not null default '' check(length(basis)<=4000),
 cautions jsonb not null default '[]'::jsonb,
 supersedes_id uuid references public.hba_votes(id),
 notice_at timestamptz, proxy_deadline timestamptz, opens_at timestamptz, closes_at timestamptz,
 roll_frozen_at timestamptz, eligible_units int,
 procedures_version text not null default '',
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(kind='advisory' or meeting_id is not null or state in ('draft','withdrawn','deferred')),
 check(jsonb_typeof(options)='array' and jsonb_array_length(options) between 2 and 20),
 check(supersedes_id is null or supersedes_id<>id)
);
create index hba_votes_state_idx on public.hba_votes(state,created_at desc);
create table public.hba_vote_roll(
 id uuid primary key default gen_random_uuid(), vote_id uuid not null references public.hba_votes(id) on delete cascade,
 unit_key text not null check(length(unit_key) between 1 and 120), household_uid text, label text not null check(length(label) between 1 and 200),
 street text not null default '', weight int not null default 1 check(weight between 1 and 20),
 eligible boolean not null, reason text not null default '' check(length(reason)<=500),
 basis jsonb not null default '{}'::jsonb, member_ids uuid[] not null default '{}',
 unique(vote_id,unit_key)
);
create table public.hba_vote_proxies(
 id uuid primary key default gen_random_uuid(), vote_id uuid not null references public.hba_votes(id) on delete cascade,
 household_uid text not null, holder_name text not null check(length(holder_name) between 1 and 160),
 filed_at timestamptz not null, document_id uuid references public.hba_documents(id), note text not null default '' check(length(note)<=1000),
 filed_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 unique(vote_id,household_uid)
);
create table public.hba_ballots(
 id uuid primary key default gen_random_uuid(), vote_id uuid not null references public.hba_votes(id) on delete cascade,
 unit_key text not null, cast_by uuid references auth.users(id),
 source text not null check(source in ('online','in_person','proxy')),
 choice text, weight int not null default 1 check(weight between 1 and 20),
 receipt_code text not null unique, recused boolean not null default false, recusal_reason text not null default '' check(length(recusal_reason)<=500),
 recorded_by uuid references auth.users(id), cast_at timestamptz not null default now(),
 unique(vote_id,unit_key)
);
-- Secret-ballot choices are stored without any link to the unit or account that cast them.
create table public.hba_ballot_choices(
 id uuid primary key default gen_random_uuid(), vote_id uuid not null references public.hba_votes(id) on delete cascade,
 choice text not null, weight int not null default 1 check(weight between 1 and 20)
);
create table public.hba_vote_results(
 vote_id uuid primary key references public.hba_votes(id) on delete cascade,
 tally jsonb not null, units_participating int not null check(units_participating>=0), units_able int not null check(units_able>=0),
 quorum_met boolean not null, outcome text not null check(outcome in ('passed','failed','no_quorum','advisory','tie_pending','elected')),
 rule_applied text not null default '' check(length(rule_applied)<=1000),
 tie_break_choice text, tie_break_by uuid references auth.users(id), tie_break_at timestamptz,
 certified_by uuid not null default auth.uid() references auth.users(id), certified_at timestamptz not null default now(),
 confirmed_by uuid references auth.users(id), confirmed_at timestamptz,
 minutes_document_id uuid references public.hba_documents(id), notes text not null default '' check(length(notes)<=4000),
 check(confirmed_by is null or confirmed_by<>certified_by), check((confirmed_by is null)=(confirmed_at is null))
);
create table public.hba_vote_annotations(
 id uuid primary key default gen_random_uuid(), vote_id uuid not null references public.hba_votes(id) on delete cascade,
 note text not null check(length(note) between 1 and 4000), document_id uuid references public.hba_documents(id),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now()
);
create table public.hba_vote_comments(
 id uuid primary key default gen_random_uuid(), vote_id uuid not null references public.hba_votes(id) on delete cascade,
 body text not null check(length(body) between 1 and 3000),
 state text not null default 'pending' check(state in ('pending','published','hidden')),
 moderated_by uuid references auth.users(id), moderated_at timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now()
);
create table public.hba_nominations(
 id uuid primary key default gen_random_uuid(), election_year int not null references public.hba_elections(year),
 position text not null check(length(position) between 1 and 80), candidate_name text not null check(length(candidate_name) between 1 and 160),
 household_uid text, statement text not null default '' check(length(statement)<=4000),
 state text not null default 'submitted' check(state in ('submitted','accepted','declined','withdrawn')),
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now()
);
create table public.hba_vote_audit(
 id uuid primary key default gen_random_uuid(), table_name text not null, record_id text not null,
 before_record jsonb, after_record jsonb, changed_by uuid default auth.uid(), changed_at timestamptz not null default now()
);
create function public.hba_audit_vote_tables() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.hba_vote_audit(table_name,record_id,before_record,after_record,changed_by)
 values(tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(new)->>'vote_id',to_jsonb(old)->>'id',to_jsonb(old)->>'vote_id',''),
  case when tg_op='INSERT' then null else to_jsonb(old) end, case when tg_op='DELETE' then null else to_jsonb(new) end, auth.uid());
 return coalesce(new,old);
end $$;
revoke all on function public.hba_audit_vote_tables() from public,anon,authenticated;

-- State machine and lock-after-notice protections.
create function public.hba_validate_vote() returns trigger language plpgsql set search_path=public as $$
declare mtg public.hba_meetings; allowed text[];
begin
 new.updated_at=now();
 if tg_op='INSERT' then
  if new.state<>'draft' then raise exception 'New votes start as drafts'; end if;
  if new.kind='advisory' then
   if new.electorate<>'all_members' or new.threshold<>'none' or new.quorum_required<>0 then raise exception 'Advisory polls have no quorum or threshold'; end if;
  elsif new.electorate='all_members' then raise exception 'A formal vote needs a defined electorate'; end if;
  return new;
 end if;
 if old.state in ('confirmed','withdrawn') then raise exception 'A % vote cannot change', old.state; end if;
 if old.state<>'draft' and (new.kind,new.motion,new.electorate,new.street,new.threshold,new.quorum_required,new.secret_ballot,new.president_tie_break,new.options,new.meeting_id,new.classification)
   is distinct from (old.kind,old.motion,old.electorate,old.street,old.threshold,old.quorum_required,old.secret_ballot,old.president_tie_break,old.options,old.meeting_id,old.classification)
 then raise exception 'The motion, electorate, rules and meeting are locked once notice is published'; end if;
 if new.state<>old.state then
  allowed=case old.state when 'draft' then array['noticed','withdrawn','deferred','open'] when 'noticed' then array['open','withdrawn','deferred']
   when 'open' then array['closed'] when 'closed' then array['certified','open'] when 'certified' then array['confirmed','closed'] else array[]::text[] end;
  if not new.state=any(allowed) then raise exception 'Cannot move a % vote to %', old.state, new.state; end if;
  if old.state='draft' and new.state='open' and new.kind<>'advisory' then raise exception 'Publish notice and freeze the voter roll before opening a formal vote'; end if;
  if new.state='noticed' then
   if new.roll_frozen_at is null then raise exception 'Freeze the voter roll when publishing notice'; end if;
   if new.kind<>'advisory' then
    select * into mtg from public.hba_meetings where id=new.meeting_id;
    if not found or mtg.state='cancelled' then raise exception 'Link an actual scheduled meeting'; end if;
    if new.electorate in ('governors','board_and_president') and mtg.audience<>'board' then raise exception 'Board votes belong to a Board of Governors meeting'; end if;
    if new.electorate in ('households','street') and mtg.audience<>'general' then raise exception 'Membership votes belong to a general membership meeting'; end if;
    if new.kind='amendment' and extract(month from mtg.meeting_date) not in (6,8) then raise exception 'Bylaw amendments are voted at an annual (June or August) meeting'; end if;
   end if;
   new.notice_at=coalesce(new.notice_at,now());
  end if;
  if new.state='open' then new.opens_at=coalesce(new.opens_at,now()); end if;
  if new.state='closed' and old.state='open' then new.closes_at=now(); end if;
  if new.state='certified' and not exists(select 1 from public.hba_vote_results r where r.vote_id=new.id) then raise exception 'Record certified results first'; end if;
  if new.state='confirmed' and not exists(select 1 from public.hba_vote_results r where r.vote_id=new.id and r.confirmed_at is not null) then raise exception 'The president must confirm the certified results'; end if;
 end if;
 return new;
end $$;
revoke all on function public.hba_validate_vote() from public,anon,authenticated;
create trigger vote_validate before insert or update on public.hba_votes for each row execute function public.hba_validate_vote();
create trigger vote_audit after insert or update or delete on public.hba_votes for each row execute function public.hba_audit_vote_tables();

create function public.hba_validate_results() returns trigger language plpgsql set search_path=public as $$
declare v public.hba_votes;
begin
 select * into v from public.hba_votes where id=new.vote_id;
 if tg_op='INSERT' then
  if v.state<>'closed' then raise exception 'Certify only a closed vote'; end if;
  if not public.hba_can_certify() then raise exception 'The linked, in-term Secretary certifies results'; end if;
  if new.confirmed_by is not null then raise exception 'Confirmation is a separate step'; end if;
  new.certified_by=auth.uid(); new.certified_at=now();
  return new;
 end if;
 if old.confirmed_at is not null then raise exception 'Confirmed results are final; add an annotation instead'; end if;
 if new.confirmed_at is not null then
  if not public.hba_can_call_vote() then raise exception 'The linked, in-term President confirms results'; end if;
  if auth.uid()=old.certified_by then raise exception 'The certifying secretary cannot also confirm'; end if;
  if v.created_by=auth.uid() and v.kind<>'advisory' and public.hba_role()<>'admin' and not exists(select 1 from public.hba_officeholders o where o.position='Secretary' and o.member_id is not null and o.member_id<>auth.uid()) then
   raise exception 'The proposing president cannot confirm while no separate Secretary is linked'; end if;
  new.confirmed_by=auth.uid(); new.confirmed_at=now();
  if new.outcome='tie_pending' then raise exception 'Resolve the tie before confirming'; end if;
 elsif (new.tally,new.units_participating,new.units_able,new.quorum_met,new.outcome,new.rule_applied) is distinct from (old.tally,old.units_participating,old.units_able,old.quorum_met,old.outcome,old.rule_applied) and not public.hba_can_certify() then
  raise exception 'Only the Secretary revises an uncertified tally';
 end if;
 if new.tie_break_choice is distinct from old.tie_break_choice then
  if not v.president_tie_break then raise exception 'No presidential tie-break applies to this vote'; end if;
  if not public.hba_is_president() then raise exception 'Only the linked President casts the deciding vote'; end if;
  if old.outcome<>'tie_pending' then raise exception 'There is no tie to break'; end if;
  new.tie_break_by=auth.uid(); new.tie_break_at=now();
 end if;
 return new;
end $$;
revoke all on function public.hba_validate_results() from public,anon,authenticated;
create trigger results_validate before insert or update on public.hba_vote_results for each row execute function public.hba_validate_results();
create trigger results_audit after insert or update or delete on public.hba_vote_results for each row execute function public.hba_audit_vote_tables();
create trigger roll_audit after insert or update or delete on public.hba_vote_roll for each row execute function public.hba_audit_vote_tables();
create trigger proxy_audit after insert or update or delete on public.hba_vote_proxies for each row execute function public.hba_audit_vote_tables();

create function public.hba_validate_proxy() returns trigger language plpgsql set search_path=public as $$
declare v public.hba_votes; mtg public.hba_meetings;
begin
 select * into v from public.hba_votes where id=new.vote_id;
 if v.kind='advisory' or v.electorate not in ('households','street') then raise exception 'Proxies apply to membership votes only'; end if;
 if v.state not in ('noticed','open') then raise exception 'Proxies are filed after notice and before the vote closes'; end if;
 select * into mtg from public.hba_meetings where id=v.meeting_id;
 if new.filed_at>(mtg.meeting_date+mtg.meeting_time) at time zone 'America/New_York' then raise exception 'Written proxies must reach the Secretary before the meeting starts'; end if;
 if new.filed_at>now()+interval '5 minutes' then raise exception 'Filing time cannot be in the future'; end if;
 if not exists(select 1 from public.hba_vote_roll r where r.vote_id=new.vote_id and r.household_uid=new.household_uid and r.eligible) then raise exception 'That household is not on the eligible roll for this vote'; end if;
 return new;
end $$;
revoke all on function public.hba_validate_proxy() from public,anon,authenticated;
create trigger proxy_validate before insert or update on public.hba_vote_proxies for each row execute function public.hba_validate_proxy();

-- Roll rows and ballots are locked once a vote closes.
create function public.hba_lock_roll() returns trigger language plpgsql set search_path=public as $$
declare st text;
begin
 select state into st from public.hba_votes where id=coalesce(new.vote_id,old.vote_id);
 if st not in ('draft','noticed') then raise exception 'The voter roll is frozen once voting opens'; end if;
 return coalesce(new,old);
end $$;
revoke all on function public.hba_lock_roll() from public,anon,authenticated;
create trigger roll_lock before insert or update or delete on public.hba_vote_roll for each row execute function public.hba_lock_roll();

-- ---------- Casting ----------
create or replace function public.hba_cast_ballot(p_vote uuid, p_choice text, p_recuse boolean default false, p_reason text default '')
returns table(receipt_code text, unit_label text) language plpgsql security definer set search_path=public as $$
declare v public.hba_votes; r public.hba_vote_roll; code text; proc public.hba_voting_procedures;
begin
 if not public.hba_is_member() then raise exception 'Member access required'; end if;
 select * into v from public.hba_votes where id=p_vote for update;
 if not found or v.state<>'open' then raise exception 'This vote is not open'; end if;
 select * into proc from public.hba_voting_procedures where id=1;
 if v.kind<>'advisory' and not (proc.confirmed_at is not null and proc.online_ballots_allowed) then
  raise exception 'Online ballots for formal votes are disabled until the board-approved Voting Guidelines & Procedures are recorded. Vote at the meeting or by written proxy.'; end if;
 select * into r from public.hba_vote_roll where vote_id=p_vote and auth.uid()=any(member_ids) and eligible order by weight desc limit 1;
 if not found then raise exception 'Your account is not on the eligible roll for this vote'; end if;
 if exists(select 1 from public.hba_ballots where vote_id=p_vote and unit_key=r.unit_key) then raise exception 'A ballot has already been recorded for %', r.label; end if;
 if not p_recuse and not (v.options ? p_choice) then raise exception 'Choose one of the listed options'; end if;
 code=upper(substr(md5(random()::text||clock_timestamp()::text),1,10));
 insert into public.hba_ballots(vote_id,unit_key,cast_by,source,choice,weight,receipt_code,recused,recusal_reason)
 values(p_vote,r.unit_key,auth.uid(),'online',case when v.secret_ballot or p_recuse then null else p_choice end,r.weight,code,p_recuse,left(p_reason,500));
 if v.secret_ballot and not p_recuse then insert into public.hba_ballot_choices(vote_id,choice,weight) values(p_vote,p_choice,r.weight); end if;
 return query select code, r.label;
end $$;
revoke all on function public.hba_cast_ballot(uuid,text,boolean,text) from public,anon;
grant execute on function public.hba_cast_ballot(uuid,text,boolean,text) to authenticated;

create or replace function public.hba_record_ballot(p_vote uuid, p_unit text, p_choice text, p_source text, p_recuse boolean default false, p_reason text default '')
returns text language plpgsql security definer set search_path=public as $$
declare v public.hba_votes; r public.hba_vote_roll; code text;
begin
 if not public.hba_can_certify() then raise exception 'The linked, in-term Secretary records meeting and proxy ballots'; end if;
 select * into v from public.hba_votes where id=p_vote for update;
 if not found or v.state<>'open' then raise exception 'This vote is not open'; end if;
 if p_source not in ('in_person','proxy') then raise exception 'Record in-person or proxy ballots only'; end if;
 select * into r from public.hba_vote_roll where vote_id=p_vote and unit_key=p_unit;
 if not found or not r.eligible then raise exception 'That unit is not eligible on the frozen roll'; end if;
 if p_source='proxy' and not exists(select 1 from public.hba_vote_proxies p where p.vote_id=p_vote and p.household_uid=r.household_uid) then raise exception 'File the written proxy before recording a proxy ballot'; end if;
 if exists(select 1 from public.hba_ballots where vote_id=p_vote and unit_key=r.unit_key) then raise exception 'A ballot has already been recorded for %', r.label; end if;
 if not p_recuse and not (v.options ? p_choice) then raise exception 'Choose one of the listed options'; end if;
 code=upper(substr(md5(random()::text||clock_timestamp()::text),1,10));
 insert into public.hba_ballots(vote_id,unit_key,cast_by,source,choice,weight,receipt_code,recused,recusal_reason,recorded_by)
 values(p_vote,r.unit_key,null,p_source,case when v.secret_ballot or p_recuse then null else p_choice end,r.weight,code,p_recuse,left(p_reason,500),auth.uid());
 if v.secret_ballot and not p_recuse then insert into public.hba_ballot_choices(vote_id,choice,weight) values(p_vote,p_choice,r.weight); end if;
 return code;
end $$;
revoke all on function public.hba_record_ballot(uuid,text,text,text,boolean,text) from public,anon;
grant execute on function public.hba_record_ballot(uuid,text,text,text,boolean,text) to authenticated;

-- Tally without exposing secret choices per unit. Members may see it once results are certified; the board sees it any time.
create or replace function public.hba_tally(p_vote uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v public.hba_votes; counts jsonb; n_participating int; n_able int; n_proxies int; n_online int; n_recused int;
begin
 select * into v from public.hba_votes where id=p_vote;
 if not found then raise exception 'Vote not found'; end if;
 if not (public.hba_is_board() or (public.hba_is_member() and (v.kind='advisory' or v.state in ('certified','confirmed')))) then raise exception 'Tally not available yet'; end if;
 if v.secret_ballot then
  select coalesce(jsonb_object_agg(choice,total),'{}'::jsonb) into counts from (select choice,sum(weight) total from public.hba_ballot_choices where vote_id=p_vote group by choice) t;
 else
  select coalesce(jsonb_object_agg(choice,total),'{}'::jsonb) into counts from (select choice,sum(weight) total from public.hba_ballots where vote_id=p_vote and not recused and choice is not null group by choice) t;
 end if;
 select count(*),count(*) filter(where not recused),count(*) filter(where source='proxy'),count(*) filter(where source='online'),count(*) filter(where recused)
  into n_participating,n_able,n_proxies,n_online,n_recused from public.hba_ballots b where b.vote_id=p_vote;
 return jsonb_build_object('counts',counts,'units_participating',n_participating,'units_able',n_able,'proxies',n_proxies,'online',n_online,'recused',n_recused,
  'eligible_units',(select count(*) from public.hba_vote_roll where vote_id=p_vote and eligible),'secret',v.secret_ballot);
end $$;
revoke all on function public.hba_tally(uuid) from public,anon;
grant execute on function public.hba_tally(uuid) to authenticated;

-- ---------- Row-level security ----------
alter table public.hba_votes enable row level security;
alter table public.hba_vote_roll enable row level security;
alter table public.hba_vote_proxies enable row level security;
alter table public.hba_ballots enable row level security;
alter table public.hba_ballot_choices enable row level security;
alter table public.hba_vote_results enable row level security;
alter table public.hba_vote_annotations enable row level security;
alter table public.hba_vote_comments enable row level security;
alter table public.hba_nominations enable row level security;
alter table public.hba_vote_audit enable row level security;
revoke all on public.hba_votes,public.hba_vote_roll,public.hba_vote_proxies,public.hba_ballots,public.hba_ballot_choices,public.hba_vote_results,public.hba_vote_annotations,public.hba_vote_comments,public.hba_nominations,public.hba_vote_audit from anon,authenticated;
grant select,insert,update on public.hba_votes to authenticated;
grant delete on public.hba_votes to authenticated;
grant select,insert,update,delete on public.hba_vote_roll to authenticated;
grant select,insert,delete on public.hba_vote_proxies to authenticated;
grant select on public.hba_ballots to authenticated;
grant select,insert,update on public.hba_vote_results to authenticated;
grant select,insert on public.hba_vote_annotations to authenticated;
grant select,insert,update on public.hba_vote_comments to authenticated;
grant select,insert,update on public.hba_nominations to authenticated;
grant select on public.hba_vote_audit to authenticated;

create policy votes_read on public.hba_votes for select to authenticated using(public.hba_is_board() or (public.hba_is_member() and state<>'draft'));
create policy votes_add on public.hba_votes for insert to authenticated with check((public.hba_can_call_vote() or (kind='advisory' and public.hba_is_secretary())) and created_by=auth.uid());
create policy votes_edit on public.hba_votes for update to authenticated using(public.hba_can_call_vote() or public.hba_can_certify()) with check(public.hba_can_call_vote() or public.hba_can_certify());
create policy votes_delete on public.hba_votes for delete to authenticated using(public.hba_role()='admin' and state='draft');
create policy roll_read on public.hba_vote_roll for select to authenticated using(public.hba_is_board() or auth.uid()=any(member_ids));
create policy roll_write on public.hba_vote_roll for insert to authenticated with check(public.hba_can_call_vote() or public.hba_can_certify());
create policy roll_edit on public.hba_vote_roll for update to authenticated using(public.hba_can_certify()) with check(public.hba_can_certify());
create policy roll_delete on public.hba_vote_roll for delete to authenticated using(public.hba_can_call_vote() or public.hba_can_certify());
create policy proxies_read on public.hba_vote_proxies for select to authenticated using(public.hba_is_board() or household_uid=public.hba_household());
create policy proxies_add on public.hba_vote_proxies for insert to authenticated with check(public.hba_can_certify() and filed_by=auth.uid());
create policy proxies_delete on public.hba_vote_proxies for delete to authenticated using(public.hba_can_certify() and exists(select 1 from public.hba_votes v where v.id=vote_id and v.state in ('noticed','open')));
create policy ballots_read on public.hba_ballots for select to authenticated using(public.hba_is_board() or cast_by=auth.uid()
 or exists(select 1 from public.hba_votes v where v.id=vote_id and v.state='confirmed' and not v.secret_ballot and public.hba_is_member()));
create policy choices_read on public.hba_ballot_choices for select to authenticated using(public.hba_can_certify());
create policy results_read on public.hba_vote_results for select to authenticated using(public.hba_is_board() or public.hba_is_member());
create policy results_add on public.hba_vote_results for insert to authenticated with check(public.hba_can_certify());
create policy results_edit on public.hba_vote_results for update to authenticated using(public.hba_can_certify() or public.hba_can_call_vote()) with check(public.hba_can_certify() or public.hba_can_call_vote());
create policy annotations_read on public.hba_vote_annotations for select to authenticated using(public.hba_is_member());
create policy annotations_add on public.hba_vote_annotations for insert to authenticated with check((public.hba_can_certify() or public.hba_can_call_vote()) and created_by=auth.uid());
create policy comments_read on public.hba_vote_comments for select to authenticated using(public.hba_is_board() or created_by=auth.uid() or (public.hba_is_member() and state='published'));
create policy comments_add on public.hba_vote_comments for insert to authenticated with check(public.hba_is_member() and created_by=auth.uid() and state='pending'
 and exists(select 1 from public.hba_votes v where v.id=vote_id and v.state in ('noticed','open')));
create policy comments_moderate on public.hba_vote_comments for update to authenticated using(public.hba_is_board()) with check(public.hba_is_board());
create policy nominations_read on public.hba_nominations for select to authenticated using(public.hba_is_board() or created_by=auth.uid() or (public.hba_is_member() and state='accepted'));
create policy nominations_add on public.hba_nominations for insert to authenticated with check(public.hba_is_member() and created_by=auth.uid() and state='submitted'
 and exists(select 1 from public.hba_elections e where e.year=election_year and e.state in ('planning','nominations_open','meeting_scheduled')));
create policy nominations_review on public.hba_nominations for update to authenticated using(public.hba_is_board() or created_by=auth.uid()) with check(public.hba_is_board() or (created_by=auth.uid() and state='withdrawn'));
create policy vote_audit_read on public.hba_vote_audit for select to authenticated using(public.hba_is_board());

-- ---------- Resident account requests ----------
-- Residents create their own account, state their household and optional SMS topics, then wait for board approval.
alter table public.hba_members add column requested_household_uid text, add column request_note text not null default '',
 add column sms_request jsonb, add column requested_at timestamptz;
alter table public.hba_sms_preferences drop constraint hba_sms_preferences_topics_check;
alter table public.hba_sms_preferences add constraint hba_sms_preferences_topics_check
 check(topics <@ array['roads','beach','events','speed_bumps','votes','meetings','weather','general']::text[] and cardinality(topics) between 1 and 8);
alter table public.hba_sms_drafts drop constraint hba_sms_drafts_category_check;
alter table public.hba_sms_drafts add constraint hba_sms_drafts_category_check
 check(category in ('roads','beach','events','speed_bumps','votes','meetings','weather','general'));

create or replace function public.hba_sync_member() returns trigger
language plpgsql security definer set search_path=public as $$
declare meta jsonb; req jsonb;
begin
 meta=coalesce(new.raw_user_meta_data,'{}'::jsonb);
 req=case when meta ? 'sms_phone' and meta->>'sms_phone' ~ '^\+1[2-9][0-9]{9}$' and jsonb_typeof(meta->'sms_topics')='array' and (meta->>'sms_consent')='true'
  then jsonb_build_object('phone',meta->>'sms_phone','topics',meta->'sms_topics') else null end;
 insert into public.hba_members(id,email,display_name,role,requested_household_uid,request_note,sms_request,requested_at)
 values(new.id,lower(new.email),left(coalesce(meta->>'display_name',''),120),
  case when lower(new.email)='admin@example.com' and new.email_confirmed_at is not null then 'admin' else 'pending' end,
  nullif(left(coalesce(meta->>'requested_household_uid',''),100),''),left(coalesce(meta->>'request_note',''),1000),req,now())
 on conflict(id) do update set email=excluded.email,
  role=case when lower(new.email)='admin@example.com' and new.email_confirmed_at is not null then 'admin' else hba_members.role end,
  requested_household_uid=coalesce(hba_members.requested_household_uid,excluded.requested_household_uid),
  request_note=case when hba_members.request_note='' then excluded.request_note else hba_members.request_note end,
  sms_request=coalesce(hba_members.sms_request,excluded.sms_request);
 return new;
end $$;
revoke all on function public.hba_sync_member() from public;

-- Approval links the household and honors the SMS topics the resident asked for at signup (consent logged).
create or replace function public.hba_manage_member(member_id uuid,new_role text,new_household text default null)
returns void language plpgsql security definer set search_path=public as $$
declare oldrole text; req jsonb; topics text[];
begin
 if not public.hba_is_board() then raise exception 'Board access required'; end if;
 if new_role not in ('pending','resident','board','suspended') then raise exception 'Invalid role'; end if;
 select role,sms_request into oldrole,req from public.hba_members where id=member_id;
 if not found then raise exception 'Member not found'; end if;
 if oldrole='admin' then raise exception 'Initial administrator cannot be changed here'; end if;
 if public.hba_role()<>'admin' and (new_role='board' or oldrole='board') then raise exception 'Administrator required for board roles'; end if;
 update public.hba_members set role=new_role,household_uid=nullif(new_household,'') where id=member_id;
 if oldrole='pending' and new_role in ('resident','board') and req is not null and not exists(select 1 from public.hba_sms_preferences where hba_sms_preferences.member_id=hba_manage_member.member_id) then
  select array_agg(t) into topics from jsonb_array_elements_text(req->'topics') t where t in ('roads','beach','events','speed_bumps','votes','meetings','weather','general');
  if topics is not null and cardinality(topics) between 1 and 8 then
   insert into public.hba_sms_preferences(member_id,phone,topics,opted_in,consent_at) values(member_id,req->>'phone',topics,true,now());
   insert into public.hba_sms_consent_log(member_id,action,phone,topics,consent_version) values(member_id,'opt_in',req->>'phone',topics,'hba-sms-v1');
  end if;
 end if;
end $$;
revoke all on function public.hba_manage_member(uuid,text,text) from public;
grant execute on function public.hba_manage_member(uuid,text,text) to authenticated;

-- ---------- Aggregate counts (avoids PostgREST row limits on large rolls) ----------
create or replace function public.hba_vote_counts() returns table(vote_id uuid, listed int, eligible int, ballots int)
language sql stable security definer set search_path=public as $$
  select v.id,
         (select count(*) from public.hba_vote_roll r where r.vote_id=v.id)::int,
         (select count(*) from public.hba_vote_roll r where r.vote_id=v.id and r.eligible)::int,
         (select count(*) from public.hba_ballots b where b.vote_id=v.id)::int
  from public.hba_votes v
  where public.hba_is_member() and (v.state<>'draft' or public.hba_is_board());
$$;
revoke all on function public.hba_vote_counts() from public;
grant execute on function public.hba_vote_counts() to authenticated;
