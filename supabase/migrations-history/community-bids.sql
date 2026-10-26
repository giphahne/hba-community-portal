-- Private proposals; a selection is not a purchase order, contract or budget posting.
create table public.hba_bid_requests(
 id uuid primary key default gen_random_uuid(),
 work_id uuid references public.hba_work(id),
 title text not null check(length(trim(title)) between 1 and 180),
 scope text not null check(length(trim(scope)) between 1 and 12000),
 location text not null default '' check(length(location)<=300),
 deadline date, state text not null default 'draft' check(state in ('draft','open','closed')),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.hba_bids(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.hba_bid_requests(id),
 contractor text not null check(length(trim(contractor)) between 1 and 250),
 contact text not null default '' check(length(contact)<=600),
 amount numeric(12,2) not null check(amount>0 and amount<=10000000),
 tax_basis text not null default 'unspecified' check(tax_basis in ('included','excluded','unspecified')),
 scope text not null check(length(trim(scope)) between 1 and 12000),
 exclusions text not null default '' check(length(exclusions)<=12000),
 timing text not null default '' check(length(timing)<=2000),
 valid_until date,
 state text not null default 'submitted' check(state in ('submitted','reviewing','clarification','shortlisted','selected','declined','withdrawn')),
 revision int not null default 1,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create unique index hba_one_selected_bid on public.hba_bids(request_id) where state='selected';
create index hba_bids_request on public.hba_bids(request_id);
create table public.hba_bid_reviews(
 id uuid primary key default gen_random_uuid(),
 bid_id uuid not null references public.hba_bids(id),
 previous_state text not null, new_state text not null,
 note text not null check(length(trim(note)) between 1 and 12000),
 reviewed_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.hba_bid_files(
 id uuid primary key default gen_random_uuid(),
 bid_id uuid not null references public.hba_bids(id),
 file_path text not null unique,
 original_name text not null check(length(original_name)<=250),
 caption text not null default '' check(length(caption)<=2000),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create function public.hba_validate_bid() returns trigger language plpgsql set search_path=public as $$
declare request public.hba_bid_requests;
begin
 select * into request from public.hba_bid_requests where id=new.request_id;
 if not found then raise exception 'Bid request not found'; end if;
 if not public.hba_is_board() and (request.state<>'open' or (request.deadline is not null and request.deadline<current_date))
 then raise exception 'This request is not accepting submissions'; end if;
 return new;
end $$;
revoke all on function public.hba_validate_bid() from public,anon,authenticated;
create trigger hba_bid_validate before insert on public.hba_bids for each row execute function public.hba_validate_bid();
alter table public.hba_bid_requests enable row level security;
alter table public.hba_bids enable row level security;
alter table public.hba_bid_reviews enable row level security;
alter table public.hba_bid_files enable row level security;
revoke all on public.hba_bid_requests,public.hba_bids,public.hba_bid_reviews,public.hba_bid_files from anon,authenticated;
grant select,insert,update,delete on public.hba_bid_requests to authenticated;
grant select,insert,delete on public.hba_bids,public.hba_bid_files to authenticated;
grant select on public.hba_bid_reviews to authenticated;
create policy bid_requests_read on public.hba_bid_requests for select to authenticated
 using(public.hba_is_member() and (public.hba_is_board() or state in ('open','closed')));
create policy bid_requests_add on public.hba_bid_requests for insert to authenticated
 with check(public.hba_is_board() and created_by=auth.uid());
create policy bid_requests_update on public.hba_bid_requests for update to authenticated
 using(public.hba_is_board()) with check(public.hba_is_board());
create policy bids_read on public.hba_bids for select to authenticated
 using(public.hba_is_board() or (public.hba_is_member() and created_by=auth.uid()));
create policy bids_submit on public.hba_bids for insert to authenticated
 with check(public.hba_is_member() and created_by=auth.uid() and state='submitted' and revision=1);
create policy bid_reviews_read on public.hba_bid_reviews for select to authenticated using(public.hba_is_board());
create policy bid_files_read on public.hba_bid_files for select to authenticated
 using(exists(select 1 from public.hba_bids b where b.id=bid_id));
create policy bid_files_add on public.hba_bid_files for insert to authenticated
 with check(public.hba_is_member() and created_by=auth.uid() and
 exists(select 1 from public.hba_bids b where b.id=bid_id and
 (public.hba_is_board() or (b.created_by=auth.uid() and b.state in ('submitted','clarification')))) and
 file_path like 'bids/'||bid_id::text||'/%');
do $$ declare t text; begin
 foreach t in array array['hba_bid_requests','hba_bids','hba_bid_files'] loop
 execute format('create policy admin_delete on public.%I for delete to authenticated using(public.hba_role()=''admin'')',t);
 end loop;
end $$;
create policy bid_file_storage_read on storage.objects for select to authenticated
 using(bucket_id='hba-archive' and exists(select 1 from public.hba_bid_files f where f.file_path=name));
create policy bid_file_storage_insert on storage.objects for insert to authenticated
 with check(bucket_id='hba-archive' and exists(select 1 from public.hba_bid_files f where f.file_path=name and f.created_by=auth.uid()));
create function public.hba_review_bid(p_id uuid,p_state text,p_note text,p_revision int)
returns public.hba_bids language plpgsql security definer set search_path=public as $$
declare old public.hba_bids; result public.hba_bids;
begin
 if not public.hba_is_board() then raise exception 'Board access required'; end if;
 if p_state not in ('submitted','reviewing','clarification','shortlisted','selected','declined','withdrawn')
 or length(trim(coalesce(p_note,''))) not between 1 and 12000 then raise exception 'Choose a status and record a reason'; end if;
 select * into old from public.hba_bids where id=p_id for update;
 if not found then raise exception 'Bid not found'; end if;
 -- Lock the request as well so simultaneous competing selections cannot both win.
 perform 1 from public.hba_bid_requests where id=old.request_id for update;
 if old.revision<>p_revision then raise exception 'Bid changed. Refresh before reviewing'; end if;
 if p_state='selected' and exists(select 1 from public.hba_bids where request_id=old.request_id and state='selected' and id<>p_id)
 then raise exception 'A bid is already selected. Change that selection first'; end if;
 update public.hba_bids set state=p_state,revision=revision+1 where id=p_id returning * into result;
 insert into public.hba_bid_reviews(bid_id,previous_state,new_state,note)
 values(p_id,old.state,p_state,trim(p_note));
 return result;
end $$;
revoke all on function public.hba_review_bid(uuid,text,text,int) from public,anon;
grant execute on function public.hba_review_bid(uuid,text,text,int) to authenticated;
