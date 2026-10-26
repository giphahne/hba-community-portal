create or replace function public.hba_import_bank_statement(p_account uuid,p_start date,p_end date,p_closing numeric,p_books numeric,p_note text,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare import_id uuid; row_value jsonb; added int:=0; affected int; duplicates int:=0;
begin
 if not public.hba_can_edit_finance() then raise exception 'Treasurer permission required'; end if;
 if p_start is null or p_end is null or p_end<p_start or p_end>current_date
 or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000
 then raise exception 'Invalid statement period or rows'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_account::text||'/bank-import',0));
 insert into public.hba_bank_imports(account_id,period_start,period_end,statement_closing,books_closing,source_note)
 values(p_account,p_start,p_end,p_closing,p_books,p_note) returning id into import_id;
 for row_value in select * from jsonb_array_elements(p_rows) loop
   insert into public.hba_bank_transactions(account_id,import_id,posted_date,amount,description,reference,fingerprint,payer_fingerprint)
   values(p_account,import_id,(row_value->>'posted_date')::date,(row_value->>'amount')::numeric,
          row_value->>'description',row_value->>'reference',row_value->>'fingerprint',row_value->>'payer_fingerprint')
   on conflict(account_id,fingerprint) do nothing;
   get diagnostics affected=row_count;
   added=added+affected;duplicates=duplicates+(1-affected);
 end loop;
 return jsonb_build_object('import_id',import_id,'added',added,'possible_duplicates_held',duplicates);
end $$;
revoke all on function public.hba_import_bank_statement(uuid,date,date,numeric,numeric,text,jsonb) from public,anon;
grant execute on function public.hba_import_bank_statement(uuid,date,date,numeric,numeric,text,jsonb) to authenticated;
