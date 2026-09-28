-- The general manager can correct past days; branch managers can record today.
drop function record_attendance(uuid,attendance_status,time,time,text);
create function record_attendance(emp uuid, st attendance_status, cin time default null,
 cout time default null, nt text default null, work_day date default null) returns void
language plpgsql security definer set search_path=public as $$
declare e employees; d date:=coalesce(work_day,(now() at time zone 'Africa/Cairo')::date); ti timestamptz; tout timestamptz; cur attendance;
begin
 if auth.uid() is null or (d<>(now() at time zone 'Africa/Cairo')::date and not is_super_admin()) or d>(now() at time zone 'Africa/Cairo')::date then raise exception 'Not allowed for this date'; end if;
 select * into e from employees where id=emp and deleted_at is null;
 if e.id is null or not can_access_branch(e.branch_id) or auth_role() not in ('super_admin','area_manager','branch_manager') then raise exception 'forbidden'; end if;
 select * into cur from attendance where employee_id=emp and work_date=d;
 if st in ('present','late') then
  cin:=coalesce(cin,(cur.check_in at time zone 'Africa/Cairo')::time,(now() at time zone 'Africa/Cairo')::time);
  ti:=(d+cin) at time zone 'Africa/Cairo';
  tout:=case when cout is not null then (d+cout) at time zone 'Africa/Cairo' else cur.check_out end;
  if cout is not null and tout<ti then tout:=tout+interval '1 day'; end if;
 end if;
 insert into attendance(employee_id,branch_id,work_date,status,check_in,check_out,notes,recorded_by)
 values(emp,e.branch_id,d,st,ti,tout,coalesce(nt,cur.notes),auth.uid())
 on conflict(employee_id,work_date) do update set status=excluded.status,check_in=excluded.check_in,check_out=excluded.check_out,notes=excluded.notes,recorded_by=auth.uid();
end $$;
revoke all on function record_attendance(uuid,attendance_status,time,time,text,date) from public;
grant execute on function record_attendance(uuid,attendance_status,time,time,text,date) to authenticated;

create or replace function notify_admins() returns trigger
language plpgsql security definer set search_path=public as $$
declare kind text; title_text text; target text; branch_name text;
begin
 select name into branch_name from branches where id=new.branch_id;
 case tg_table_name
 when 'daily_reports' then kind:='report'; title_text:='تقرير الروتين اليومي'; target:='/daily?branch='||new.branch_id||'&tpl='||new.template_id||'&date='||new.report_date;
 when 'quality_submissions' then kind:='quality'; title_text:='تقييم جودة جديد'; target:='/quality';
 when 'complaints' then kind:='complaint'; title_text:='بلاغ جديد'; target:='/complaints';
 else kind:='maintenance';title_text:='طلب صيانة جديد';target:='/complaints';
 end case;
 insert into notifications(user_id,type,title,link) select p.id,kind,title_text||' · '||coalesce(branch_name,''),target from profiles p
 where p.is_active and (p.role='super_admin' or (p.role='area_manager' and exists(select 1 from area_manager_branches a where a.user_id=p.id and a.branch_id=new.branch_id)));
 return new;
end $$;
