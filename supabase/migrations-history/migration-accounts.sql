-- Account management: delete a resident's login, board-issued temporary passwords, forced password change, audit log.
-- October 18, 2026. Run once in the Supabase SQL editor (postgres role) after approval.
--
-- Design note: dozens of record tables reference auth.users(id) with NOT NULL created_by columns and no ON DELETE
-- rule (events, photos, stories, dues, votes, payments ...). Deleting the auth row would either fail or require
-- dropping those records, which the board does not want. "Delete resident" therefore removes the login itself
-- (password replaced, sessions revoked, sign-in banned, email address released for a future sign-up, identity row
-- removed) and the household links, and leaves a name-only tombstone row in hba_members with role 'deleted' so the
-- resident's dues history, votes, stories and photos stay attributed to them as a former resident.
begin;

alter table public.hba_members add column if not exists must_change_password boolean not null default false;
alter table public.hba_members add column if not exists deleted_at timestamptz;
alter table public.hba_members drop constraint if exists hba_members_role_check;
alter table public.hba_members add constraint hba_members_role_check
  check (role in ('pending','resident','board','admin','suspended','deleted'));

create table if not exists public.hba_account_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('delete_member','delete_request','reset_password','change_password')),
  actor_id uuid, actor_email text not null default '', actor_name text not null default '',
  target_id uuid, target_email text not null default '', target_name text not null default '',
  target_role text not null default '', target_household text,
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.hba_account_audit enable row level security;
drop policy if exists account_audit_read on public.hba_account_audit;
create policy account_audit_read on public.hba_account_audit for select to authenticated using (public.hba_is_board());
-- No insert/update/delete policies: only the security-definer functions below write rows. Temporary passwords are never stored.

create or replace function public.hba_delete_member(target uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me public.hba_members; t public.hba_members; admins int; kind text; tomb text;
begin
  select * into me from public.hba_members where id=auth.uid();
  if me.id is null or not public.hba_is_board() then raise exception 'Board access required'; end if;
  select * into t from public.hba_members where id=target;
  if t.id is null or t.role='deleted' then raise exception 'Member not found'; end if;
  if t.id=me.id then raise exception 'You cannot delete your own account'; end if;
  if t.role in ('admin','board') and me.role<>'admin' then raise exception 'Only an administrator can delete a board member or administrator'; end if;
  if t.role='admin' then
    select count(*) into admins from public.hba_members where role='admin';
    if admins<=1 then raise exception 'The last administrator cannot be deleted'; end if;
  end if;
  kind := case when t.role='pending' then 'delete_request' else 'delete_member' end;
  tomb := 'former-'||left(t.id::text,8)||'@deleted.hamiltonbeach.invalid';
  insert into public.hba_account_audit(action,actor_id,actor_email,actor_name,target_id,target_email,target_name,target_role,target_household)
  values (kind,me.id,me.email,me.display_name,t.id,t.email,t.display_name,t.role,t.household_uid);
  -- Household links, alert subscriptions and office links go. Records they created stay.
  delete from public.hba_member_households where member_id=t.id;
  delete from public.hba_push_subscriptions where member_id=t.id;
  delete from public.hba_sms_preferences where member_id=t.id;
  delete from public.hba_volunteer_email_preferences where member_id=t.id;
  update public.hba_officeholders set member_id=null where member_id=t.id;
  -- The login itself: sessions revoked, password replaced with a random one, sign-in banned, address released.
  delete from auth.refresh_tokens where user_id=t.id::text;
  delete from auth.sessions where user_id=t.id;
  delete from auth.identities where user_id=t.id;
  update auth.users set email=tomb, encrypted_password=extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf',10)),
    banned_until='2999-01-01', phone=null, raw_user_meta_data=jsonb_build_object('display_name',t.display_name,'former_resident','true'),
    confirmation_token='', recovery_token='', email_change='', email_change_token_new='', email_change_token_current='', updated_at=now()
  where id=t.id;
  update public.hba_members set role='deleted', deleted_at=now(), email=tomb, household_uid=null, requested_household_uid=null,
    sms_request=null, request_note='', must_change_password=false where id=t.id;
  return jsonb_build_object('deleted',true,'kind',kind,'name',t.display_name,'email',t.email);
end $$;
revoke all on function public.hba_delete_member(uuid) from public;
grant execute on function public.hba_delete_member(uuid) to authenticated;

create or replace function public.hba_reset_password(target uuid, new_password text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me public.hba_members; t public.hba_members; was_unconfirmed boolean;
begin
  select * into me from public.hba_members where id=auth.uid();
  if me.id is null or not public.hba_is_board() then raise exception 'Board access required'; end if;
  select * into t from public.hba_members where id=target;
  if t.id is null or t.role='deleted' then raise exception 'Member not found'; end if;
  if t.id=me.id then raise exception 'Use Change password for your own account'; end if;
  if t.role in ('admin','board') and me.role<>'admin' then raise exception 'Only an administrator can reset a board member''s password'; end if;
  if length(new_password)<12 then raise exception 'Temporary password too short'; end if;
  select email_confirmed_at is null into was_unconfirmed from auth.users where id=t.id;
  -- The board member has verified the resident in person or by phone, which also stands in for the email confirmation.
  update auth.users set encrypted_password=extensions.crypt(new_password, extensions.gen_salt('bf',10)),
    email_confirmed_at=coalesce(email_confirmed_at,now()), banned_until=null, updated_at=now() where id=t.id;
  delete from auth.refresh_tokens where user_id=t.id::text;
  delete from auth.sessions where user_id=t.id;
  update public.hba_members set must_change_password=true where id=t.id;
  insert into public.hba_account_audit(action,actor_id,actor_email,actor_name,target_id,target_email,target_name,target_role,target_household,note)
  values ('reset_password',me.id,me.email,me.display_name,t.id,t.email,t.display_name,t.role,t.household_uid,
          case when was_unconfirmed then 'Email address marked confirmed by the board at the same time.' else '' end);
  return jsonb_build_object('reset',true,'name',t.display_name,'email',t.email,'email_was_unconfirmed',was_unconfirmed);
end $$;
revoke all on function public.hba_reset_password(uuid,text) from public;
grant execute on function public.hba_reset_password(uuid,text) to authenticated;

create or replace function public.hba_password_changed()
returns void language plpgsql security definer set search_path=public as $$
declare me public.hba_members;
begin
  select * into me from public.hba_members where id=auth.uid();
  if me.id is null then raise exception 'Sign in first'; end if;
  update public.hba_members set must_change_password=false where id=me.id;
  insert into public.hba_account_audit(action,actor_id,actor_email,actor_name,target_id,target_email,target_name,target_role,target_household)
  values ('change_password',me.id,me.email,me.display_name,me.id,me.email,me.display_name,me.role,me.household_uid);
end $$;
revoke all on function public.hba_password_changed() from public;
grant execute on function public.hba_password_changed() to authenticated;

commit;
