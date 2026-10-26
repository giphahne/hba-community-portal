-- Messages inbox, per-event volunteer sign-ups, Movie Night hosting offers and simple event polls.
-- Run once in the Supabase SQL editor after board approval. Adds tables and one column; changes nothing existing.

-- 1) Volunteer tasks can belong to a calendar event (one sign-up sheet per event).
alter table public.hba_volunteer_tasks add column if not exists event_id uuid references public.hba_events(id) on delete set null;
create index if not exists hba_volunteer_tasks_event_idx on public.hba_volunteer_tasks(event_id);

-- 2) Messages: a note to one member, or to every resident / every board member.
create table if not exists public.hba_messages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references auth.users(id) on delete cascade,          -- null = broadcast
  audience text not null default 'member' check (audience in ('member','residents','board')),
  from_member_id uuid default auth.uid(),
  kind text not null default 'notice' check (length(kind) <= 40),
  subject text not null check (length(subject) between 1 and 200),
  body text not null default '' check (length(body) <= 4000),
  tool text not null default '' check (length(tool) <= 60),
  tool_arg text not null default '' check (length(tool_arg) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists hba_messages_member_idx on public.hba_messages(member_id, created_at desc);
alter table public.hba_messages enable row level security;
drop policy if exists msg_select on public.hba_messages;
create policy msg_select on public.hba_messages for select to authenticated using (
  member_id = auth.uid()
  or (audience = 'residents' and public.hba_role() in ('resident','board','admin'))
  or (audience = 'board' and public.hba_role() in ('board','admin'))
  or from_member_id = auth.uid()
);
drop policy if exists msg_insert on public.hba_messages;
create policy msg_insert on public.hba_messages for insert to authenticated with check (
  from_member_id = auth.uid() and (
    public.hba_role() in ('board','admin')                               -- board may write to anyone
    or (audience = 'board' and public.hba_role() = 'resident')           -- residents may write to the board
  )
);
drop policy if exists msg_delete_admin on public.hba_messages;
create policy msg_delete_admin on public.hba_messages for delete to authenticated using (public.hba_role() = 'admin');

create table if not exists public.hba_message_reads (
  message_id uuid not null references public.hba_messages(id) on delete cascade,
  member_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, member_id)
);
alter table public.hba_message_reads enable row level security;
drop policy if exists msgread_own on public.hba_message_reads;
create policy msgread_own on public.hba_message_reads for all to authenticated using (member_id = auth.uid()) with check (member_id = auth.uid());

-- 3) Offers to host an event (Movie Night): the resident proposes a date and time; the board approves.
create table if not exists public.hba_event_host_offers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.hba_events(id) on delete set null,
  series_title text not null default 'Movie Night' check (length(series_title) <= 120),
  member_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  proposed_date date not null,
  proposed_time time not null,
  location text not null default '' check (length(location) <= 200),
  note text not null default '' check (length(note) <= 2000),
  movie_choices jsonb not null default '[]'::jsonb,
  state text not null default 'pending' check (state in ('pending','approved','declined','withdrawn')),
  board_note text not null default '' check (length(board_note) <= 1000),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.hba_event_host_offers enable row level security;
drop policy if exists host_select on public.hba_event_host_offers;
create policy host_select on public.hba_event_host_offers for select to authenticated using (member_id = auth.uid() or state = 'approved' or public.hba_role() in ('board','admin'));
drop policy if exists host_insert on public.hba_event_host_offers;
create policy host_insert on public.hba_event_host_offers for insert to authenticated with check (member_id = auth.uid() and public.hba_role() in ('resident','board','admin'));
drop policy if exists host_update_own on public.hba_event_host_offers;
create policy host_update_own on public.hba_event_host_offers for update to authenticated using (member_id = auth.uid() and state = 'pending') with check (member_id = auth.uid());
drop policy if exists host_update_board on public.hba_event_host_offers;
create policy host_update_board on public.hba_event_host_offers for update to authenticated using (public.hba_role() in ('board','admin')) with check (public.hba_role() in ('board','admin'));

-- 4) Simple polls for one event (for example which film to show). One answer per member; tallies are live.
create table if not exists public.hba_polls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.hba_events(id) on delete cascade,
  host_offer_id uuid references public.hba_event_host_offers(id) on delete set null,
  title text not null check (length(title) between 1 and 200),
  question text not null default '' check (length(question) <= 1000),
  options jsonb not null default '[]'::jsonb,
  state text not null default 'open' check (state in ('draft','open','closed')),
  closes_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.hba_polls enable row level security;
drop policy if exists poll_select on public.hba_polls;
create policy poll_select on public.hba_polls for select to authenticated using (state in ('open','closed') or public.hba_role() in ('board','admin'));
drop policy if exists poll_write_board on public.hba_polls;
create policy poll_write_board on public.hba_polls for all to authenticated using (public.hba_role() in ('board','admin')) with check (public.hba_role() in ('board','admin'));

create table if not exists public.hba_poll_votes (
  poll_id uuid not null references public.hba_polls(id) on delete cascade,
  member_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  choice text not null check (length(choice) <= 200),
  cast_at timestamptz not null default now(),
  primary key (poll_id, member_id)
);
alter table public.hba_poll_votes enable row level security;
drop policy if exists pollvote_select on public.hba_poll_votes;
create policy pollvote_select on public.hba_poll_votes for select to authenticated using (member_id = auth.uid() or public.hba_role() in ('board','admin'));
drop policy if exists pollvote_write_own on public.hba_poll_votes;
create policy pollvote_write_own on public.hba_poll_votes for all to authenticated using (member_id = auth.uid()) with check (member_id = auth.uid() and public.hba_role() in ('resident','board','admin'));

-- Live tallies without exposing who voted for what.
create or replace function public.hba_poll_tally(p uuid)
returns table (choice text, votes bigint)
language sql security definer set search_path = public as $$
  select v.choice, count(*) from public.hba_poll_votes v where v.poll_id = p and auth.uid() is not null group by v.choice;
$$;
revoke all on function public.hba_poll_tally(uuid) from public, anon;
grant execute on function public.hba_poll_tally(uuid) to authenticated;
