create table public.hba_volunteer_tasks(
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(title) between 1 and 180),
 category text not null check(category in ('event','maintenance')),
 description text not null check(length(description) between 1 and 12000),
 location text not null default '' check(length(location)<=300),
 task_date date, task_time time,
 capacity int not null default 10 check(capacity between 1 and 500),
 state text not null default 'draft' check(state in ('draft','published','closed','complete')),
 photo_path text unique check(photo_path is null or photo_path like 'volunteers/'||id::text||'/%'),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.hba_volunteer_signups(
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references public.hba_volunteer_tasks(id),
 member_id uuid not null default auth.uid() references public.hba_members(id),
 note text not null default '' check(length(note)<=1000),
 state text not null default 'signed_up' check(state in ('signed_up','withdrawn')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(task_id,member_id)
);
create table public.hba_volunteer_email_preferences(
 member_id uuid primary key references public.hba_members(id),
 opted_in boolean not null,
 updated_at timestamptz not null default now()
);
alter table public.hba_volunteer_tasks enable row level security;
alter table public.hba_volunteer_signups enable row level security;
alter table public.hba_volunteer_email_preferences enable row level security;
revoke all on public.hba_volunteer_tasks,public.hba_volunteer_signups,public.hba_volunteer_email_preferences from anon,authenticated;
grant select on public.hba_volunteer_tasks to anon,authenticated;
grant insert,delete on public.hba_volunteer_tasks to authenticated;
grant update(title,category,description,location,task_date,task_time,capacity,state,photo_path) on public.hba_volunteer_tasks to authenticated;
grant select,delete on public.hba_volunteer_signups to authenticated;
grant select,insert,update(opted_in),delete on public.hba_volunteer_email_preferences to authenticated;
create policy volunteer_task_read on public.hba_volunteer_tasks for select to anon,authenticated
 using(state in ('published','closed','complete') or (auth.role()='authenticated' and public.hba_is_board()));
create policy volunteer_task_add on public.hba_volunteer_tasks for insert to authenticated with check(public.hba_is_board() and created_by=auth.uid() and state='draft');
create policy volunteer_task_edit on public.hba_volunteer_tasks for update to authenticated using(public.hba_is_board()) with check(public.hba_is_board() and (photo_path is null or photo_path like 'volunteers/'||id::text||'/%'));
create policy volunteer_task_delete on public.hba_volunteer_tasks for delete to authenticated using(public.hba_role()='admin');
create policy volunteer_signup_read on public.hba_volunteer_signups for select to authenticated using(public.hba_is_board() or (public.hba_is_member() and member_id=auth.uid()));
create policy volunteer_signup_delete on public.hba_volunteer_signups for delete to authenticated using(public.hba_role()='admin');
create policy volunteer_email_read on public.hba_volunteer_email_preferences for select to authenticated using(public.hba_is_board() or (public.hba_is_member() and member_id=auth.uid()));
create policy volunteer_email_add on public.hba_volunteer_email_preferences for insert to authenticated with check(public.hba_is_member() and member_id=auth.uid());
create policy volunteer_email_edit on public.hba_volunteer_email_preferences for update to authenticated using(public.hba_is_member() and member_id=auth.uid()) with check(public.hba_is_member() and member_id=auth.uid());
create policy volunteer_email_delete on public.hba_volunteer_email_preferences for delete to authenticated using(public.hba_role()='admin');
create trigger volunteer_task_stamp before update on public.hba_volunteer_tasks for each row execute function public.hba_newsletter_stamp();
create trigger volunteer_signup_stamp before update on public.hba_volunteer_signups for each row execute function public.hba_newsletter_stamp();
create trigger volunteer_email_stamp before update on public.hba_volunteer_email_preferences for each row execute function public.hba_newsletter_stamp();
create function public.hba_volunteer_signup(p_task uuid,p_join boolean,p_note text default '')
returns void language plpgsql security definer set search_path=public as $$
declare task public.hba_volunteer_tasks; already boolean;
begin
 if not public.hba_is_member() then raise exception 'Approved member access required'; end if;
 if p_join is null or p_note is null or length(p_note)>1000 then raise exception 'Check signup details'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_task::text||'/volunteer',0));
 select * into task from public.hba_volunteer_tasks where id=p_task for update;
 if not found then raise exception 'Task not found'; end if;
 if p_join then
   if task.state<>'published' then raise exception 'This task is not accepting volunteers'; end if;
   select exists(select 1 from public.hba_volunteer_signups where task_id=p_task and member_id=auth.uid() and state='signed_up') into already;
   if not already and (select count(*) from public.hba_volunteer_signups where task_id=p_task and state='signed_up')>=task.capacity then raise exception 'This task is full'; end if;
   insert into public.hba_volunteer_signups(task_id,member_id,note,state) values(p_task,auth.uid(),p_note,'signed_up')
   on conflict(task_id,member_id) do update set note=excluded.note,state='signed_up';
 else
   update public.hba_volunteer_signups set state='withdrawn' where task_id=p_task and member_id=auth.uid();
 end if;
end $$;
revoke all on function public.hba_volunteer_signup(uuid,boolean,text) from public,anon;
grant execute on function public.hba_volunteer_signup(uuid,boolean,text) to authenticated;
create function public.hba_volunteer_counts() returns table(task_id uuid,signed_up bigint)
language sql stable security definer set search_path=public as $$
 select t.id,count(s.id) from public.hba_volunteer_tasks t
 left join public.hba_volunteer_signups s on s.task_id=t.id and s.state='signed_up'
 where t.state in ('published','closed','complete') or (auth.role()='authenticated' and public.hba_is_board())
 group by t.id
$$;
revoke all on function public.hba_volunteer_counts() from public;
grant execute on function public.hba_volunteer_counts() to anon,authenticated;
create policy volunteer_photo_add on storage.objects for insert to authenticated
 with check(bucket_id='hba-archive' and name like 'volunteers/%' and public.hba_is_board());
create policy volunteer_photo_read on storage.objects for select to anon,authenticated
 using(bucket_id='hba-archive' and exists(select 1 from public.hba_volunteer_tasks t where t.photo_path=name));
-- Newsletter source precision preserves a month-only date without inventing a day.
alter table public.hba_newsletters add column issue_precision text not null default 'day' check(issue_precision in ('day','month'));
alter table public.hba_newsletters add column original_path text unique;
alter table public.hba_newsletters add constraint newsletter_original_scope check(original_path is null or original_path like 'newsletters/'||id::text||'/%');
grant update(issue_precision,original_path) on public.hba_newsletters to authenticated;
create policy newsletter_original_read on storage.objects for select to authenticated
 using(bucket_id='hba-archive' and exists(select 1 from public.hba_newsletters n where n.original_path=name));
