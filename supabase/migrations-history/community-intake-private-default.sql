-- Preserve the two previously shared governing files; all future source files start private.
alter table public.hba_documents alter column audience set default 'board';
