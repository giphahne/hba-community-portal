-- Durable, review-first document intake. No AI draft can post itself.
alter table public.hba_series add column first_year int check(first_year between 1800 and 2200),
 add column first_year_source text not null default '';
update public.hba_series set first_year=1974,
 first_year_source='Member-provided history, October 17, 2026: first Spaghetti Supper was in 1974.',
 description=description||' First year: 1974, from member-provided history. Earlier calculated dates are not historical occurrences.'
 where recurrence_rule='august_third_saturday';
create function public.hba_event_first_year_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from public.hba_series where id=new.series_id
 and first_year is not null and extract(year from new.event_date)<first_year)
 then raise exception 'Event date precedes the first year recorded for this series'; end if;
 return new;
end $$;
revoke all on function public.hba_event_first_year_guard() from public,anon,authenticated;
create trigger event_first_year_guard before insert or update on public.hba_events
 for each row execute function public.hba_event_first_year_guard();
alter table public.hba_documents add column audience text not null default 'members'
 check(audience in ('board','members'));
alter table public.hba_documents alter column audience set default 'board';
alter table public.hba_documents drop constraint hba_documents_category_check;
alter table public.hba_documents add constraint hba_documents_category_check
 check(category in ('budget','minutes','governing','history','permit','contract','other'));
drop policy documents_read on public.hba_documents;
create policy documents_read on public.hba_documents for select to authenticated
 using(public.hba_is_board() or (audience='members' and public.hba_is_member()));
grant update(audience) on public.hba_documents to authenticated;
create policy documents_visibility on public.hba_documents for update to authenticated
 using(public.hba_is_board()) with check(public.hba_is_board());
update storage.buckets set allowed_mime_types=array[
 'application/pdf','image/jpeg','image/png','image/webp','application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/csv']
 where id='hba-archive';

create table public.hba_document_intakes(
 document_id uuid primary key references public.hba_documents(id) on delete cascade,
 state text not null default 'queued' check(state in ('queued','processing','ready','needs_attention','failed')),
 summary text not null default '', limitations jsonb not null default '[]',
 pages jsonb not null default '[]', model text not null default '',
 file_sha256 text not null, attempt_count int not null default 0,
 updated_at timestamptz not null default now(),
 created_by uuid not null default auth.uid() references auth.users(id)
);
create index hba_document_intakes_hash_idx on public.hba_document_intakes(file_sha256);
create table public.hba_document_suggestions(
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references public.hba_documents(id) on delete cascade,
 item_key text not null,
 kind text not null check(kind in ('event','budget','agenda','decision','work','house_history','history','governing','permit')),
 payload jsonb not null, evidence_page int not null check(evidence_page>0),
 evidence_quote text not null check(length(evidence_quote) between 5 and 2500),
 confidence text not null check(confidence in ('high','medium','low')),
 state text not null default 'pending' check(state in ('pending','applied','dismissed')),
 target_table text, target_key text, reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz, review_payload jsonb,
 created_at timestamptz not null default now(),
 unique(document_id,item_key)
);
create table public.hba_document_facts(
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references public.hba_documents(id),
 kind text not null check(kind in ('history','governing','permit')),
 title text not null check(length(title) between 1 and 180),
 detail text not null check(length(detail) between 1 and 12000),
 fact_date date, fact_year int check(fact_year between 1600 and 2200),
 location text not null default '', evidence_page int not null,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.hba_document_intakes enable row level security;
alter table public.hba_document_suggestions enable row level security;
alter table public.hba_document_facts enable row level security;
revoke all on public.hba_document_intakes,public.hba_document_suggestions,public.hba_document_facts from anon,authenticated;
grant select,insert,update,delete on public.hba_document_intakes to authenticated;
grant select,insert,delete on public.hba_document_suggestions to authenticated;
grant select,delete on public.hba_document_facts to authenticated;
create policy intake_read on public.hba_document_intakes for select to authenticated using(public.hba_is_board());
create policy intake_add on public.hba_document_intakes for insert to authenticated with check(public.hba_is_board() and created_by=auth.uid());
create policy intake_edit on public.hba_document_intakes for update to authenticated using(public.hba_is_board()) with check(public.hba_is_board());
create policy intake_delete on public.hba_document_intakes for delete to authenticated using(public.hba_role()='admin');
create policy suggestion_read on public.hba_document_suggestions for select to authenticated using(public.hba_is_board());
create policy suggestion_add on public.hba_document_suggestions for insert to authenticated with check(public.hba_is_board() and state='pending' and reviewed_by is null);
create policy suggestion_delete on public.hba_document_suggestions for delete to authenticated using(public.hba_role()='admin');
create policy fact_read on public.hba_document_facts for select to authenticated using(public.hba_is_board());
create policy fact_delete on public.hba_document_facts for delete to authenticated using(public.hba_role()='admin');

create function public.hba_review_document_item(p_id uuid,p_action text,p_payload jsonb default null)
returns public.hba_document_suggestions language plpgsql security definer set search_path=public as $$
declare item public.hba_document_suggestions; p jsonb; target uuid; k text; note text;
 yr int; code text; series_uuid uuid;
begin
 if not public.hba_is_board() then raise exception 'Board access required'; end if;
 select * into item from public.hba_document_suggestions where id=p_id for update;
 if not found then raise exception 'Suggestion not found'; end if;
 if item.state<>'pending' then return item; end if; -- idempotent, locked
 if p_action not in ('apply','dismiss') then raise exception 'Invalid review action'; end if;
 if p_action='dismiss' then
   update public.hba_document_suggestions set state='dismissed',reviewed_by=auth.uid(),reviewed_at=now()
   where id=p_id returning * into item; return item;
 end if;
 p=coalesce(p_payload,item.payload);
 if jsonb_typeof(p)<>'object' or octet_length(p::text)>20000 then raise exception 'Invalid review fields'; end if;
 note=format('Source document %s, page %s. Board-reviewed extraction.',item.document_id,item.evidence_page);
 if item.kind='budget' then
   if not public.hba_can_edit_finance() then raise exception 'Treasurer or administrator required'; end if;
   yr=(p->>'year')::int; code=p->>'category_code';
   -- Never overwrite an existing budget or promote an extracted number to adopted.
   if exists(select 1 from public.hba_category_budgets where year=yr and category_code=code)
   then raise exception 'Budget line already exists; compare it in Check register instead of overwriting'; end if;
   insert into public.hba_category_budgets(year,category_code,amount,basis,source_note)
   values(yr,code,(p->>'amount')::numeric,'draft',note||' '||left(coalesce(p->>'detail',''),1500));
   k=yr::text||'/'||code; item.target_table='hba_category_budgets';
 elsif item.kind='event' then
   if (p->>'state') not in ('scheduled','held','cancelled') then raise exception 'Choose event status'; end if;
   series_uuid=(p->>'series_id')::uuid;
   if exists(select 1 from public.hba_events where series_id=series_uuid and event_date=(p->>'event_date')::date)
   then raise exception 'This event date already exists; edit the existing event'; end if;
   insert into public.hba_events(series_id,title,event_date,event_time,rain_date,location,description,state,planning_only)
   values(series_uuid,p->>'title',(p->>'event_date')::date,nullif(p->>'event_time','')::time,
    nullif(p->>'rain_date','')::date,coalesce(p->>'location',''),coalesce(p->>'detail','')||E'\n'||note,
    p->>'state',coalesce((p->>'planning_only')::boolean,true)) returning id into target;
   item.target_table='hba_events'; k=target::text;
 elsif item.kind='agenda' then
   insert into public.hba_agenda_items(title,description,audience,state)
   values(p->>'title',coalesce(p->>'detail','')||E'\n'||note,'board','submitted') returning id into target;
   item.target_table='hba_agenda_items'; k=target::text;
 elsif item.kind='decision' then
   if (p->>'recorded_outcome') not in ('proposed','approved','rejected','deferred')
     or (p->>'decision_type') not in ('board','capital','dues','amendment','emergency')
   then raise exception 'Choose a decision type and recorded outcome'; end if;
   insert into public.hba_decisions(title,meeting_date,decision_type,motion,recorded_outcome,review_notes,minutes_id)
   values(p->>'title',(p->>'meeting_date')::date,p->>'decision_type',p->>'detail',p->>'recorded_outcome',
     note,item.document_id) returning id into target;
   item.target_table='hba_decisions'; k=target::text;
 elsif item.kind='work' then
   insert into public.hba_work(title,contractor,location,work_date,description,state)
   values(p->>'title',coalesce(p->>'contractor',''),coalesce(p->>'location',''),
    nullif(p->>'work_date','')::date,coalesce(p->>'detail','')||E'\n'||note,'planned') returning id into target;
   item.target_table='hba_work'; k=target::text;
 elsif item.kind='house_history' then
   -- Exact map-index matching is also checked by the bridge; this is not title certification.
   if coalesce(p->>'household_uid','')!~'^M_[0-9]+_[0-9]+$' then raise exception 'Choose a mapped household'; end if;
   insert into public.hba_house_history(household_uid,title,story,history_year,status)
   values(p->>'household_uid',p->>'title',coalesce(p->>'detail','')||E'\n'||note,
    nullif(p->>'history_year','')::int,'pending') returning id into target;
   item.target_table='hba_house_history'; k=target::text;
 else
   insert into public.hba_document_facts(document_id,kind,title,detail,fact_date,fact_year,location,evidence_page)
   values(item.document_id,item.kind,p->>'title',p->>'detail',nullif(p->>'fact_date','')::date,
    nullif(p->>'fact_year','')::int,coalesce(p->>'location',''),item.evidence_page) returning id into target;
   item.target_table='hba_document_facts'; k=target::text;
 end if;
 update public.hba_document_suggestions set state='applied',target_table=item.target_table,target_key=k,
  reviewed_by=auth.uid(),reviewed_at=now(),review_payload=p where id=p_id returning * into item;
 return item;
end $$;
revoke all on function public.hba_review_document_item(uuid,text,jsonb) from public,anon;
grant execute on function public.hba_review_document_item(uuid,text,jsonb) to authenticated;
