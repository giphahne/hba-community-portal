-- Admin-editable content (starting with the summer events pattern) is kept as JSON in hba_settings, and a
-- 2,000-character limit is too small for it. Already included in schema.sql for new projects; run this once
-- on an existing project (SQL editor, as the postgres role).
alter table public.hba_settings drop constraint if exists hba_settings_value_check;
alter table public.hba_settings add constraint hba_settings_value_check check (length(value) <= 100000);
