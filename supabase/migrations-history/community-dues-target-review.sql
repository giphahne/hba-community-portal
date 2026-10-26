alter table public.hba_dues_targets add column source_note text not null default 'Verified during receipt attribution'
 check(length(source_note) between 1 and 1000);
create function public.hba_dues_target_audit() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into public.hba_finance_audit(record_table,record_key,action,before_record,after_record)
 values(tg_table_name,new.year::text||'/'||new.uid,tg_op,
 case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function public.hba_dues_target_audit() from public,anon,authenticated;
create trigger dues_target_audit after insert or update on public.hba_dues_targets
 for each row execute function public.hba_dues_target_audit();
create function public.hba_correct_dues_target(p_uid text,p_year int,p_annual numeric,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare total numeric; old public.hba_dues;
begin
 if public.hba_role()<>'admin' then raise exception 'Administrator permission required'; end if;
 if p_annual is null or p_annual<=0 or p_annual<>round(p_annual,2)
 or coalesce(length(trim(p_note)),0) not between 1 and 1000 then raise exception 'Enter a positive verified amount and correction reference'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_year::text||'/'||p_uid,0));
 update public.hba_dues_targets set annual_due=p_annual,source_note=trim(p_note) where uid=p_uid and year=p_year;
 if not found then raise exception 'Household/year target not found'; end if;
 select coalesce(sum(amount),0) into total from public.hba_dues_receipts where household_uid=p_uid and dues_year=p_year;
 select * into old from public.hba_dues where uid=p_uid and year=p_year;
 perform public.hba_set_dues(p_year,p_uid,case when total=0 then 'unknown' when total>=p_annual then 'paid' else 'unpaid' end,coalesce(old.revision,0));
end $$;
revoke all on function public.hba_correct_dues_target(text,int,numeric,text) from public,anon;
grant execute on function public.hba_correct_dues_target(text,int,numeric,text) to authenticated;
