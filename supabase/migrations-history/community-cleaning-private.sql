-- The supplied agreement is an unsigned sample, not adopted expenditure.
create table public.hba_cleaning_plan(
 id int primary key check(id=1),
 amount_per_cleaning numeric(12,2) not null,
 cleanings_per_year int not null,
 first_year int not null,
 seasons int not null,
 status text not null,
 source_note text not null
);
alter table public.hba_cleaning_plan enable row level security;
revoke all on public.hba_cleaning_plan from anon,authenticated;
grant select on public.hba_cleaning_plan to authenticated;
create policy cleaning_board_read on public.hba_cleaning_plan for select to authenticated using(public.hba_is_board());
insert into public.hba_cleaning_plan values
 (1,1200,8,2027,3,'unsigned_sample','Demelo three-year beach maintenance sample, dated 2026-09-22. Eight cleanings remain budgeted even when rescheduled. Confirm operating-budget overlap. No dates or expenditure are approved by this record.');
