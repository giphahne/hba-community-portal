-- Standing schedule for monthly Board of Governors meetings, set by the administrator (2026-10-17):
-- third Tuesday of every month at 5:00 PM Eastern. Recorded meetings in hba_meetings always take precedence
-- over this projection; the rule only fills months without a recorded board meeting.
insert into public.hba_settings(key,value,updated_by,updated_at) values
 ('public_board_meeting_rule','{"ordinal":3,"weekday":2,"time":"17:00","title":"HBA Board of Governors Meeting","location":"","note":"Standing schedule set by the administrator on 2026-10-17. Recorded meetings replace this projection."}',
  '84313a24-0c80-422b-8fd1-7524a7910344',now())
on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now();
