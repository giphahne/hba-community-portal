-- schema.sql (until this fix) left out the column-level update grants that the migration history gave
-- authenticated users, so on a project created from it saving a newsletter or minutes PDF, publishing a volunteer
-- task, changing volunteer e-mail preferences, editing a register entry or category budget, and editing an SMS
-- draft all failed with "This account does not have permission for that action." Already included in schema.sql
-- for new projects; run this once on a project created from an earlier schema.sql (SQL editor, as postgres).
-- Projects built from supabase/migrations-history already have these grants; running it again is harmless.
grant update(title,issue_date,body,state,file_path,original_name,issue_precision,original_path) on public.hba_newsletters to authenticated;
grant update(meeting_id,meeting_date,meeting_time,title,location,called_to_order,adjourned,attendees,body,motions,action_items,state,approved_on,approved_note,file_path,original_name) on public.hba_meeting_minutes to authenticated;
grant update(title,category,description,location,task_date,task_time,capacity,state,photo_path) on public.hba_volunteer_tasks to authenticated;
grant update(opted_in) on public.hba_volunteer_email_preferences to authenticated;
grant update(transaction_date,direction,category_code,payee,amount,reference,memo,cleared,voided,bank_account_id) on public.hba_check_register to authenticated;
grant update(amount,basis,source_note) on public.hba_category_budgets to authenticated;
grant update(category,message) on public.hba_sms_drafts to authenticated;
