alter table public.hba_payment_settings
 add column venmo_name text not null default '' check(length(venmo_name)<=180),
 add column venmo_handle text not null default '' check(length(venmo_handle)<=64),
 add column venmo_enabled boolean not null default false;
alter table public.hba_payment_settings add constraint venmo_verified_recipient
 check(not venmo_enabled or (length(trim(venmo_name))>0 and venmo_handle ~ '^[A-Za-z0-9_-]{1,64}$'));
alter table public.hba_payment_reports
 add column payment_method text not null default 'unspecified'
 check(payment_method in ('zelle','venmo','check','cash','other','unspecified'));
comment on column public.hba_payment_reports.payment_method is
 'Resident-reported method only. Does not confirm receipt, move funds or update dues.';
