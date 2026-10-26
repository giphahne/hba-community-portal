alter table public.hba_series add column recurrence_rule text
 check(recurrence_rule is null or recurrence_rule='august_third_saturday');
alter table public.hba_events
 add column rain_date date,
 add column use_rain_date boolean not null default false,
 add column planning_only boolean not null default false,
 add column annual_rule_year int check(annual_rule_year between 1800 and 2200),
 add constraint rain_date_requires_later_date check(rain_date is null or rain_date>event_date),
 add constraint rain_switch_requires_date check(not use_rain_date or rain_date is not null);
create unique index hba_one_annual_supper on public.hba_events(series_id,annual_rule_year)
 where annual_rule_year is not null;

create function public.hba_supper_date(p_year int) returns date
language sql immutable set search_path=public as $$
 select make_date(p_year,8,1)+((6-extract(dow from make_date(p_year,8,1))::int+7)%7)+14
$$;
revoke all on function public.hba_supper_date(int) from public,anon;
grant execute on function public.hba_supper_date(int) to authenticated;

create function public.hba_apply_event_recurrence() returns trigger
language plpgsql set search_path=public as $$
declare rule text; yr int; expected date;
begin
 select recurrence_rule into rule from public.hba_series where id=new.series_id;
 if rule='august_third_saturday' and
 (new.event_date>=current_date or (tg_op='UPDATE' and old.annual_rule_year is not null)) then
   yr=extract(year from new.event_date)::int; expected=public.hba_supper_date(yr);
   if new.event_date<>expected then
     raise exception 'Spaghetti Supper is the third Saturday in August. Use the rain-date switch for the following Saturday; historical exceptions require a documented past occurrence.';
   end if;
   new.rain_date=expected+7; new.annual_rule_year=yr;
 elsif rule is distinct from 'august_third_saturday' then
   new.annual_rule_year=null;
 end if;
 return new;
end $$;
revoke all on function public.hba_apply_event_recurrence() from public,anon,authenticated;
create trigger hba_event_recurrence before insert or update on public.hba_events
 for each row execute function public.hba_apply_event_recurrence();

-- Set the perpetual rule without backfilling assumed historical occurrences.
update public.hba_series set recurrence_rule='august_third_saturday',
 description='Annual Spaghetti Supper: third Saturday in August. Rain date: the following Saturday. Future dates follow the member-supplied scheduling rule; time, location and event details still require board confirmation. Historical occurrences require documentation.'
 where lower(trim(title))='spaghetti supper';

do $$
declare sid uuid; administrator uuid; first_year int; yr int; scheduled date;
begin
 if (select count(*) from public.hba_series where recurrence_rule='august_third_saturday')<>1
 then raise exception 'Identify the single Spaghetti Supper series before seeding'; end if;
 select id into sid from public.hba_series where recurrence_rule='august_third_saturday';
 if (select count(*) from public.hba_members where role='admin')<>1
 then raise exception 'Identify the authorized administrator before seeding'; end if;
 select id into administrator from public.hba_members where role='admin';
 first_year=extract(year from current_date)::int;
 if public.hba_supper_date(first_year)<current_date then first_year=first_year+1; end if;
 for yr in first_year..first_year+4 loop
   scheduled=public.hba_supper_date(yr);
   if not exists(select 1 from public.hba_events where series_id=sid and extract(year from event_date)=yr) then
     insert into public.hba_events(series_id,title,event_date,description,planning_only,created_by)
     values(sid,'Spaghetti Supper',scheduled,
       'Annual date rule: third Saturday in August; rain backup the following Saturday. Time, location and details have not yet been confirmed. The rain date is not a second event.',
       true,administrator);
   end if;
 end loop;
end $$;
