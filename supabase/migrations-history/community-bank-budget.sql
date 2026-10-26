-- Atomic conversion prevents duplicate book entries when two reviewers act.
create function public.hba_book_bank_transaction(p_transaction_id uuid,p_category text,p_payee text,p_memo text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare b public.hba_bank_transactions; r_id uuid; direction_value text;
begin
 if not public.hba_can_edit_finance() then raise exception 'Treasurer permission required'; end if;
 select * into b from public.hba_bank_transactions where id=p_transaction_id for update;
 if b.id is null then raise exception 'Bank row not found'; end if;
 if exists(select 1 from public.hba_bank_matches where transaction_id=b.id) then raise exception 'Already booked or matched'; end if;
 direction_value=case when b.amount>0 then 'income' else 'expense' end;
 if not exists(select 1 from public.hba_finance_categories where code=p_category and direction=direction_value)
 then raise exception 'Select a category with the correct income/expense direction'; end if;
 insert into public.hba_check_register(transaction_date,direction,category_code,payee,amount,reference,memo,cleared,bank_account_id)
 values(b.posted_date,direction_value,p_category,p_payee,abs(b.amount),b.reference,p_memo,true,b.account_id)
 returning id into r_id;
 insert into public.hba_bank_matches(transaction_id,register_id) values(b.id,r_id);
 return r_id;
end $$;
revoke all on function public.hba_book_bank_transaction(uuid,text,text,text) from public,anon;
grant execute on function public.hba_book_bank_transaction(uuid,text,text,text) to authenticated;
-- Prevent an account/import mismatch even through direct REST writes.
create function public.hba_bank_validate_transaction() returns trigger
language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from public.hba_bank_imports i where i.id=new.import_id and i.account_id=new.account_id
 and new.posted_date between i.period_start and i.period_end)
 then raise exception 'Bank row must belong to the same account and statement period'; end if;
 return new;
end $$;
revoke all on function public.hba_bank_validate_transaction() from public,anon,authenticated;
create trigger bank_validate_transaction before insert on public.hba_bank_transactions for each row execute function public.hba_bank_validate_transaction();
