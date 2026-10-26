-- Calendar-only extraction from the supplied March 2026 newsletter, pages 1–2.
-- The source includes a private contact roster; it remains a draft newsletter.
do $$
declare administrator uuid; entry record; sid uuid;
begin
 select id into administrator from public.hba_members where role='admin' order by created_at limit 1;
 if administrator is null then raise exception 'Administrator not found'; end if;
 for entry in select * from (values
 ('Clean Up Day','2026-05-09'::date,'09:00'::time,'Spring Clean-Up Day at 9 am. Page 1 also calls for landscaping, painting and general cleanup.'),
 ('Adult Block Party','2026-06-20'::date,'17:30'::time,'Adult Block Party at 5:30 pm.'),
 ('General Meeting','2026-06-28'::date,'10:00'::time,'General Meeting at 10 am.'),
 ('Beach Events and Bike Parade','2026-07-04'::date,'10:00'::time,'Beach Events starting at 10 am, followed by the Bike Parade; no separate parade start time is specified.'),
 ('Kids Fishing Derby','2026-07-11'::date,'10:00'::time,'Kids Fishing Derby from 10 am to noon.'),
 ('Adult Bingo','2026-07-17'::date,'18:00'::time,'Adult Bingo at 6 pm. August Bingo is separately listed as TBA; no August date is inferred.'),
 ('Kids Day','2026-07-18'::date,'11:00'::time,'Kids Day at 11 am.'),
 ('Music on Surf','2026-07-18'::date,'19:00'::time,'Jane and John''s Music on Surf at 7 pm.'),
 ('Art Day','2026-08-01'::date,'13:00'::time,'Art Day at 1 pm.'),
 ('Summer Spooktacular','2026-08-01'::date,'18:30'::time,'Summer Spooktacular at 6:30 pm.'),
 ('Golf Tournament','2026-08-15'::date,'08:00'::time,'Golf Tournament at 8 am, rain or shine.'),
 ('Spaghetti Supper','2026-08-15'::date,'17:30'::time,'Spaghetti Supper at 5:30 pm; rain date August 22. No evidence in this source that the backup was activated.'),
 ('Annual Meeting','2026-08-23'::date,'10:00'::time,'Annual Meeting at 10 am.')
 ) as dates(title,event_date,event_time,detail)
 loop
  select id into sid from public.hba_series where lower(trim(title))=lower(entry.title) order by created_at limit 1;
  if sid is null then
   insert into public.hba_series(title,description) values(entry.title,
    'Historical event series identified in the member-supplied March 2026 newsletter. Occurrences require date-specific evidence.')
   returning id into sid;
  end if;
  if not exists(select 1 from public.hba_events where series_id=sid and event_date=entry.event_date) then
   insert into public.hba_events(series_id,title,event_date,event_time,rain_date,description,state,planning_only,created_by)
   values(sid,entry.title,entry.event_date,entry.event_time,
    case when entry.title='Spaghetti Supper' then '2026-08-22'::date else null end,
    'ANNOUNCED / TENTATIVE HISTORICAL DATE, NOT CONFIRMED HELD. Source: member-supplied March 2026 newsletter, page 2, "Summer Events–2026 (tentative schedule)". '||
    entry.detail||' The date comes from the newsletter, not a calculated annual projection. No current volunteer request or notification was created.',
    'scheduled',true,administrator);
  end if;
 end loop;
end $$;
