-- Branch working hours (or 24h with shifts), automatic lateness, one RPC for attendance
alter table branches
  add column if not exists opens_at time not null default '08:00',
  add column if not exists closes_at time not null default '22:00',
  add column if not exists is_24h boolean not null default false,
  add column if not exists grace_minutes int not null default 15;
alter table employees add column if not exists shift_start time not null default '08:00';   -- used when branch is 24h

-- late = check-in after (shift start + grace). Skipped for service-role/seed inserts.
create or replace function attendance_auto_status() returns trigger language plpgsql
security definer set search_path = public as $$
declare b branches; sh time; d int;
begin
  if auth.uid() is null or new.check_in is null or new.status not in ('present','late') then return new; end if;
  select * into b from branches where id = new.branch_id;
  select case when b.is_24h then e.shift_start else b.opens_at end into sh from employees e where e.id = new.employee_id;
  d := ((extract(epoch from ((new.check_in at time zone 'Africa/Cairo')::time - sh)) / 60)::int + 1440) % 1440;
  new.status := case when d > b.grace_minutes and d < 720 then 'late' else 'present' end;
  return new;
end $$;
create trigger trg_a_attendance_auto before insert or update on attendance for each row execute function attendance_auto_status();

-- One entry point for the UI: status + check-in/out times (HH:MM, Cairo time) + note, for today
create or replace function record_attendance(emp uuid, st attendance_status, cin time default null,
  cout time default null, nt text default null) returns void
language plpgsql security definer set search_path = public as $$
declare e employees; d date := (now() at time zone 'Africa/Cairo')::date; ti timestamptz; tout timestamptz; cur attendance;
begin
  select * into e from employees where id = emp and deleted_at is null;
  if e.id is null or not can_access_branch(e.branch_id) or auth_role() not in ('super_admin','area_manager','branch_manager')
    then raise exception 'forbidden'; end if;
  select * into cur from attendance where employee_id = emp and work_date = d;
  if st in ('present','late') then
    cin := coalesce(cin, (cur.check_in at time zone 'Africa/Cairo')::time, (now() at time zone 'Africa/Cairo')::time);
    ti := (d + cin) at time zone 'Africa/Cairo';
    tout := case when cout is not null then (d + cout) at time zone 'Africa/Cairo' else cur.check_out end;
  end if;
  insert into attendance(employee_id, branch_id, work_date, status, check_in, check_out, notes, recorded_by)
    values (emp, e.branch_id, d, st, ti, tout, coalesce(nt, cur.notes), auth.uid())
  on conflict (employee_id, work_date) do update set status = excluded.status, check_in = excluded.check_in,
    check_out = excluded.check_out, notes = excluded.notes, recorded_by = auth.uid();
end $$;

-- Tell the branch manager when the Super Admin changes working hours
create or replace function notify_hours() returns trigger language plpgsql
security definer set search_path = public as $$
begin
  if (new.opens_at, new.closes_at, new.is_24h, new.grace_minutes) is distinct from (old.opens_at, old.closes_at, old.is_24h, old.grace_minutes) then
    insert into notifications(user_id, type, title, link)
      select id, 'attendance', 'تم تعديل ساعات عمل الفرع: ' || case when new.is_24h then '24 ساعة'
        else to_char(new.opens_at,'HH24:MI') || ' - ' || to_char(new.closes_at,'HH24:MI') end, '/attendance'
      from profiles where role = 'branch_manager' and branch_id = new.id;
  end if;
  return new;
end $$;
create trigger trg_n_hours after update on branches for each row execute function notify_hours();
