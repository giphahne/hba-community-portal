-- Donation leaderboard (2026-10-17). Adds an opt-in flag to resident payment reports and one aggregate-only
-- function. Individual amounts never leave the database: the function returns totals by fund and by street,
-- and names only households that ticked "list my household on the donor board".
alter table public.hba_payment_reports add column recognize_publicly boolean not null default false;

create or replace function public.hba_donation_leaderboard(p_year int default null) returns jsonb
language sql stable security definer set search_path=public as $$
 with gifts as (
   select r.household_uid, r.fund, r.amount, r.payment_year, r.created_by, r.recognize_publicly,
          coalesce(nullif(trim(regexp_replace(h.address,'^\s*\d+[A-Za-z]?\s+','')),''),'Street not on file') as street
   from public.hba_payment_reports r
   left join public.hba_dues_households h on h.uid=r.household_uid
   where r.payment_kind='donation' and r.state='verified' and (p_year is null or r.payment_year=p_year)
 ),
 street_sizes as (
   select coalesce(nullif(trim(regexp_replace(address,'^\s*\d+[A-Za-z]?\s+','')),''),'Street not on file') as street, count(*) as households
   from public.hba_dues_households group by 1
 )
 select jsonb_build_object(
   'year', p_year,
   'totals', (select jsonb_build_object('amount', coalesce(sum(amount),0), 'gifts', count(*), 'households', count(distinct household_uid)) from gifts),
   'funds', coalesce((select jsonb_agg(jsonb_build_object('fund',fund,'total',total,'households',households,'gifts',gifts) order by total desc)
             from (select fund, sum(amount) total, count(distinct household_uid) households, count(*) gifts from gifts group by fund) f),'[]'::jsonb),
   'streets', coalesce((select jsonb_agg(jsonb_build_object('street',s.street,'total',coalesce(g.total,0),'donors',coalesce(g.donors,0),'households',s.households) order by coalesce(g.total,0) desc, s.street)
               from street_sizes s left join (select street, sum(amount) total, count(distinct household_uid) donors from gifts group by street) g on g.street=s.street),'[]'::jsonb),
   'honor_roll', coalesce((select jsonb_agg(jsonb_build_object('name',name,'street',street) order by name)
                  from (select coalesce(nullif(m.display_name,''),'A neighbor') as name, g.street
                        from gifts g left join public.hba_members m on m.id=g.created_by
                        where g.recognize_publicly group by g.household_uid, m.display_name, g.street) h),'[]'::jsonb),
   'anonymous_households', (select count(distinct household_uid) from gifts where not recognize_publicly),
   'generated_at', now()
 )
 where public.hba_is_member()
$$;
revoke all on function public.hba_donation_leaderboard(int) from public,anon;
grant execute on function public.hba_donation_leaderboard(int) to authenticated;
