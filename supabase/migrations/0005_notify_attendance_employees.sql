-- Notification rules (agreed):
--  * Branch manager records late / absent / leave  -> Super Admin (+ area managers of that branch) notified instantly
--  * Plain "present" -> no notification (still updates numbers + audit log)
--  * Super Admin corrects attendance -> that branch's manager notified
--  * Employee added / edited / archived by a non-admin -> Super Admin notified
create or replace function notify_attendance() returns trigger language plpgsql
security definer set search_path = public as $$
declare emp text; br text; lbl text;
begin
  if auth.uid() is null then return new; end if;                       -- seed / service role: silent
  if tg_op = 'UPDATE' and new.status = old.status then return new; end if;
  select full_name into emp from employees where id = new.employee_id;
  select name into br from branches where id = new.branch_id;
  lbl := case new.status when 'late' then 'تأخير' when 'absent' then 'غياب' when 'leave' then 'إجازة' else 'حضور' end;
  if is_super_admin() then
    insert into notifications(user_id, type, title, link)
      select id, 'attendance', 'المدير العام عدّل الحالة إلى ' || lbl || ': ' || emp, '/attendance'
      from profiles where role = 'branch_manager' and branch_id = new.branch_id;
  elsif new.status in ('late','absent','leave') then
    insert into notifications(user_id, type, title, link)
      select p.id, 'attendance', br || ' سجّل ' || lbl || ': ' || emp, '/attendance'
      from profiles p where p.role = 'super_admin'
         or (p.role = 'area_manager' and exists (select 1 from area_manager_branches a where a.user_id = p.id and a.branch_id = new.branch_id));
  end if;
  return new;
end $$;
create trigger trg_n_attendance after insert or update on attendance for each row execute function notify_attendance();

create or replace function notify_employee() returns trigger language plpgsql
security definer set search_path = public as $$
declare br text; msg text;
begin
  if auth.uid() is null or is_super_admin() then return new; end if;
  select name into br from branches where id = new.branch_id;
  msg := case when tg_op = 'INSERT' then 'أضاف موظفًا جديدًا: '
              when old.deleted_at is null and new.deleted_at is not null then 'أرشف الموظف: '
              else 'عدّل بيانات الموظف: ' end || new.full_name;
  insert into notifications(user_id, type, title, link)
    select id, 'attendance', br || ' ' || msg, '/employees' from profiles where role = 'super_admin';
  return new;
end $$;
create trigger trg_n_employee after insert or update on employees for each row execute function notify_employee();
