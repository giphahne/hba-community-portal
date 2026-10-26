-- Storm memories: resident submissions for the Storms & Hurricanes section.
-- Requires explicit approval before running against the live Supabase project.
begin;

create table public.hba_storm_memories (
  id uuid primary key default gen_random_uuid(),
  storm_key text not null check (length(storm_key) <= 60),
  storm_label text not null check (length(storm_label) <= 120),
  event_year integer check (event_year between 1600 and 2100),
  title text not null check (length(title) <= 160),
  story text not null check (length(story) <= 6000),
  where_text text not null default '' check (length(where_text) <= 200),
  show_name boolean not null default false,
  display_name text not null default '' check (length(display_name) <= 120),
  status text not null default 'pending' check (status in ('pending','published')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.hba_storm_memories enable row level security;
create policy storm_read on public.hba_storm_memories for select
  using (hba_is_member() and (status = 'published' or created_by = auth.uid() or hba_is_board()));
create policy storm_add on public.hba_storm_memories for insert
  with check (hba_is_member() and created_by = auth.uid() and (hba_is_board() or status = 'pending'));
create policy storm_edit on public.hba_storm_memories for update
  using (hba_is_board()) with check (hba_is_board());
create policy admin_delete on public.hba_storm_memories for delete
  using (hba_role() = 'admin');

-- Photographs attached to a memory reuse hba_photos with a fifth parent column.
alter table public.hba_photos add column storm_id uuid references public.hba_storm_memories(id);
alter table public.hba_photos drop constraint hba_photos_one_parent;
alter table public.hba_photos add constraint hba_photos_one_parent
  check (num_nonnulls(event_id, history_id, work_id, issue_id, storm_id) = 1);

drop policy photo_add on public.hba_photos;
create policy photo_add on public.hba_photos for insert
  with check (created_by = auth.uid() and hba_is_member() and (hba_is_board() or (status = 'pending' and work_id is null and
    case
      when issue_id is not null then hba_owns_issue(issue_id)
      when history_id is not null then exists (select 1 from hba_house_history h where h.id = hba_photos.history_id and h.created_by = auth.uid() and h.household_uid = hba_household())
      when storm_id is not null then exists (select 1 from hba_storm_memories s where s.id = hba_photos.storm_id and s.created_by = auth.uid())
      else event_id is not null
    end)));

drop policy photo_read on public.hba_photos;
create policy photo_read on public.hba_photos for select
  using (hba_is_member() and
    case
      when work_id is not null or issue_id is not null then hba_is_board()
      else hba_is_board() or created_by = auth.uid() or (status = 'published' and
        (history_id is null or exists (select 1 from hba_house_history h where h.id = hba_photos.history_id and h.status = 'published')) and
        (storm_id is null or exists (select 1 from hba_storm_memories s where s.id = hba_photos.storm_id and s.status = 'published')))
    end);

commit;
