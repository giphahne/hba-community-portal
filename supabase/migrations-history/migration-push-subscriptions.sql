-- Admin alert devices (Web Push). Run once in the Supabase SQL editor after board approval.
create table if not exists public.hba_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) <= 2000),
  p256dh text not null check (length(p256dh) <= 400),
  auth text not null check (length(auth) <= 200),
  label text not null default '' check (length(label) <= 160),
  created_at timestamptz not null default now()
);
alter table public.hba_push_subscriptions enable row level security;
drop policy if exists push_select_own on public.hba_push_subscriptions;
create policy push_select_own on public.hba_push_subscriptions for select to authenticated using (member_id = auth.uid());
drop policy if exists push_insert_own_admin on public.hba_push_subscriptions;
create policy push_insert_own_admin on public.hba_push_subscriptions for insert to authenticated with check (member_id = auth.uid() and public.hba_role() = 'admin');
drop policy if exists push_update_own on public.hba_push_subscriptions;
create policy push_update_own on public.hba_push_subscriptions for update to authenticated using (member_id = auth.uid()) with check (member_id = auth.uid());
drop policy if exists push_delete_own on public.hba_push_subscriptions;
create policy push_delete_own on public.hba_push_subscriptions for delete to authenticated using (member_id = auth.uid());
-- Any signed-in member's action (report, message, photo) may trigger an alert to the admins' devices.
-- The function returns only the push keys of administrators' devices, never member identities.
create or replace function public.hba_push_targets()
returns table (endpoint text, p256dh text, auth text)
language sql security definer set search_path = public as $$
  select s.endpoint, s.p256dh, s.auth
  from public.hba_push_subscriptions s
  join public.hba_members m on m.id = s.member_id
  where m.role = 'admin' and auth.uid() is not null;
$$;
revoke all on function public.hba_push_targets() from public, anon;
grant execute on function public.hba_push_targets() to authenticated;
