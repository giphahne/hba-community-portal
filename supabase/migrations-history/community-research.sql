create table public.hba_research_reports(
 id uuid primary key default gen_random_uuid(),
 question text not null check(length(question) between 3 and 600),
 report jsonb not null,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.hba_research_reports enable row level security;
revoke all on public.hba_research_reports from anon,authenticated;
grant select,insert,delete on public.hba_research_reports to authenticated;
create policy research_report_read on public.hba_research_reports for select to authenticated using(public.hba_is_member() and created_by=auth.uid());
create policy research_report_add on public.hba_research_reports for insert to authenticated with check(public.hba_is_member() and created_by=auth.uid());
create policy research_report_delete on public.hba_research_reports for delete to authenticated using(public.hba_role()='admin');
