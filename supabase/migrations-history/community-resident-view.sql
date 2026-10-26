-- A verified board account can deliberately downshift its current view, never elevate it.
create or replace function public.hba_role() returns text
language sql stable security definer set search_path=public
as $$
 select case when member.role in ('board','admin') and
 (coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-hba-view')='resident'
 then 'resident' else member.role end
 from public.hba_members member join auth.users u on u.id=member.id
 where member.id=auth.uid() and u.email_confirmed_at is not null
 union all select 'anonymous' where not exists(
 select 1 from public.hba_members member join auth.users u on u.id=member.id
 where member.id=auth.uid() and u.email_confirmed_at is not null)
$$;
revoke all on function public.hba_role() from public,anon;
grant execute on function public.hba_role() to authenticated;
