-- Member newsletters and explicit, self-managed SMS consent.
-- This migration does not enable a sender or send any messages.
create function public.hba_can_edit_newsletter() returns boolean
language sql stable security definer set search_path=public as $$
 select public.hba_role()='admin' or (public.hba_is_board() and exists(
 select 1 from public.hba_officeholders o where o.member_id=auth.uid()
 and o.position='Secretary'
 and (o.term_start is null or o.term_start<=current_date)
 and (o.term_end is null or o.term_end>=current_date)))
$$;
revoke all on function public.hba_can_edit_newsletter() from public,anon;
grant execute on function public.hba_can_edit_newsletter() to authenticated;

create table public.hba_newsletters(
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(title) between 1 and 180),
 issue_date date not null,
 body text not null default '' check(length(body)<=40000),
 state text not null default 'draft' check(state in ('draft','published')),
 file_path text unique,
 original_name text,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create function public.hba_newsletter_stamp() returns trigger
language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end $$;
revoke all on function public.hba_newsletter_stamp() from public,anon,authenticated;
create trigger newsletter_stamp before update on public.hba_newsletters
for each row execute function public.hba_newsletter_stamp();
alter table public.hba_newsletters enable row level security;
revoke all on public.hba_newsletters from anon,authenticated;
grant select,insert,delete on public.hba_newsletters to authenticated;
grant update(title,issue_date,body,state,file_path,original_name) on public.hba_newsletters to authenticated;
create policy newsletter_read on public.hba_newsletters for select to authenticated
 using(public.hba_can_edit_newsletter() or (public.hba_is_member() and state='published'));
create policy newsletter_add on public.hba_newsletters for insert to authenticated
 with check(public.hba_can_edit_newsletter() and created_by=auth.uid() and
 (file_path is null or file_path like 'newsletters/'||id::text||'/%'));
create policy newsletter_edit on public.hba_newsletters for update to authenticated
 using(public.hba_can_edit_newsletter()) with check(public.hba_can_edit_newsletter() and
 (file_path is null or file_path like 'newsletters/'||id::text||'/%'));
create policy newsletter_delete on public.hba_newsletters for delete to authenticated using(public.hba_role()='admin');
create policy newsletter_file_read on storage.objects for select to authenticated
 using(bucket_id='hba-archive' and exists(select 1 from public.hba_newsletters n where n.file_path=name));
create policy newsletter_file_add on storage.objects for insert to authenticated
 with check(bucket_id='hba-archive' and name like 'newsletters/%' and public.hba_can_edit_newsletter());

create table public.hba_sms_preferences(
 member_id uuid primary key references public.hba_members(id),
 phone text not null check(phone ~ '^\+1[2-9][0-9]{9}$'),
 topics text[] not null check(topics <@ array['roads','beach','events','speed_bumps','general']::text[] and cardinality(topics) between 1 and 5),
 opted_in boolean not null default false,
 consent_version text not null default 'hba-sms-v1',
 consent_at timestamptz,
 updated_at timestamptz not null default now()
);
create table public.hba_sms_consent_log(
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.hba_members(id),
 action text not null check(action in ('opt_in','update','opt_out')),
 phone text not null,
 topics text[] not null,
 consent_version text not null,
 recorded_at timestamptz not null default now()
);
alter table public.hba_sms_preferences enable row level security;
alter table public.hba_sms_consent_log enable row level security;
revoke all on public.hba_sms_preferences,public.hba_sms_consent_log from anon,authenticated;
grant select,delete on public.hba_sms_preferences,public.hba_sms_consent_log to authenticated;
create policy sms_self_read on public.hba_sms_preferences for select to authenticated
 using(public.hba_is_member() and member_id=auth.uid());
create policy sms_log_self_read on public.hba_sms_consent_log for select to authenticated
 using(public.hba_is_member() and member_id=auth.uid());
create policy sms_admin_delete on public.hba_sms_preferences for delete to authenticated using(public.hba_role()='admin');
create policy sms_log_admin_delete on public.hba_sms_consent_log for delete to authenticated using(public.hba_role()='admin');

create function public.hba_save_sms_preferences(p_phone text,p_topics text[],p_opted_in boolean,p_consent boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare previous public.hba_sms_preferences; action_name text;
begin
 if not public.hba_is_member() then raise exception 'Approved member access required'; end if;
 if p_opted_in and not coalesce(p_consent,false) then raise exception 'Explicit SMS consent is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'/sms',0));
 select * into previous from public.hba_sms_preferences where member_id=auth.uid();
 action_name=case when not p_opted_in then 'opt_out' when coalesce(previous.opted_in,false) then 'update' else 'opt_in' end;
 insert into public.hba_sms_preferences(member_id,phone,topics,opted_in,consent_at)
 values(auth.uid(),p_phone,p_topics,p_opted_in,case when p_opted_in then now() else null end)
 on conflict(member_id) do update set phone=excluded.phone,topics=excluded.topics,opted_in=excluded.opted_in,
 consent_at=case when excluded.opted_in then now() else hba_sms_preferences.consent_at end,updated_at=now();
 insert into public.hba_sms_consent_log(member_id,action,phone,topics,consent_version)
 values(auth.uid(),action_name,p_phone,p_topics,'hba-sms-v1');
end $$;
revoke all on function public.hba_save_sms_preferences(text,text[],boolean,boolean) from public,anon;
grant execute on function public.hba_save_sms_preferences(text,text[],boolean,boolean) to authenticated;

create function public.hba_sms_counts() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.hba_is_board() then raise exception 'Board access required'; end if;
 return jsonb_build_object('opted_in',(select count(*) from public.hba_sms_preferences where opted_in),
 'topics',(select coalesce(jsonb_object_agg(topic,n),'{}'::jsonb) from
 (select topic,count(*) n from public.hba_sms_preferences s cross join unnest(s.topics) topic where opted_in group by topic) totals));
end $$;
revoke all on function public.hba_sms_counts() from public,anon;
grant execute on function public.hba_sms_counts() to authenticated;

create table public.hba_sms_drafts(
 id uuid primary key default gen_random_uuid(),
 category text not null check(category in ('roads','beach','events','speed_bumps','general')),
 message text not null check(length(message) between 1 and 1000),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.hba_sms_drafts enable row level security;
revoke all on public.hba_sms_drafts from anon,authenticated;
grant select,insert,delete on public.hba_sms_drafts to authenticated;
grant update(category,message) on public.hba_sms_drafts to authenticated;
create trigger sms_draft_stamp before update on public.hba_sms_drafts
for each row execute function public.hba_newsletter_stamp();
create policy sms_draft_read on public.hba_sms_drafts for select to authenticated using(public.hba_is_board());
create policy sms_draft_add on public.hba_sms_drafts for insert to authenticated with check(public.hba_is_board() and created_by=auth.uid());
create policy sms_draft_edit on public.hba_sms_drafts for update to authenticated using(public.hba_is_board()) with check(public.hba_is_board());
create policy sms_draft_delete on public.hba_sms_drafts for delete to authenticated using(public.hba_role()='admin');
