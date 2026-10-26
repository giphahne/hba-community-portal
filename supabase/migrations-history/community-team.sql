-- Contact our team: officeholder contact details and resident messages to governors.
-- Contact details come from the Officers and Governors 2025–2027 list distributed with the
-- March 2026 newsletter. share_contact lets the board hide a person's details on request.
alter table public.hba_officeholders
  add column if not exists contact_phone text not null default '',
  add column if not exists contact_email text not null default '',
  add column if not exists winter_address text not null default '',
  add column if not exists share_contact boolean not null default true;

create table if not exists public.hba_governor_messages (
  id uuid primary key default gen_random_uuid(),
  from_member_id uuid not null default auth.uid() references public.hba_members(id),
  to_officeholder_id uuid references public.hba_officeholders(id) on delete set null,
  to_position text not null,
  subject text not null check (length(subject) between 1 and 180),
  body text not null check (length(body) between 1 and 6000),
  state text not null default 'new' check (state in ('new','read','replied')),
  board_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.hba_governor_messages enable row level security;
grant select,insert,update,delete on public.hba_governor_messages to authenticated;
revoke all on public.hba_governor_messages from anon;
create policy governor_messages_read on public.hba_governor_messages for select to authenticated
  using(public.hba_is_member() and (from_member_id=auth.uid() or public.hba_is_board()));
create policy governor_messages_add on public.hba_governor_messages for insert to authenticated
  with check(public.hba_is_member() and from_member_id=auth.uid() and state='new' and board_note='');
create policy governor_messages_edit on public.hba_governor_messages for update to authenticated
  using(public.hba_is_board()) with check(public.hba_is_board());
create policy governor_messages_delete on public.hba_governor_messages for delete to authenticated
  using(public.hba_role()='admin');
create index if not exists governor_messages_created on public.hba_governor_messages(created_at desc);
