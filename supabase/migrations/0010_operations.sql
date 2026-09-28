-- Operational evaluation for one general manager and nine branch managers.
insert into settings(key,value) values ('evaluation_weights','{"routine":40,"attendance":30,"quality":30}') on conflict do nothing;
create policy evaluation_settings_read on settings for select to authenticated
  using (key = 'evaluation_weights' and exists(select 1 from profiles where id=auth.uid() and is_active));

create or replace function branch_daily_metrics(day date default (now() at time zone 'Africa/Cairo')::date)
returns table(id uuid, name text, code text, manager_name text,
 employees bigint, recorded bigint, present bigint, absent bigint, late bigint,
 expected_reports bigint, submitted_reports bigint, total_items bigint, done_items bigint,
 quality_pct numeric, quality_date date, open_tasks bigint, waiting_tasks bigint, overdue_tasks bigint,
 open_complaints bigint, open_maintenance bigint)
language sql stable security invoker set search_path=public as $$
select b.id,b.name,b.code,
 (select p.full_name from profiles p where p.branch_id=b.id and p.role='branch_manager' and p.is_active limit 1),
 (select count(*) from employees e where e.branch_id=b.id and e.deleted_at is null and e.status <> 'terminated'),
 (select count(*) from attendance a join employees e on e.id=a.employee_id where a.branch_id=b.id and a.work_date=day and e.deleted_at is null and e.status <> 'terminated'),
 (select count(*) from attendance a join employees e on e.id=a.employee_id where a.branch_id=b.id and a.work_date=day and a.status in ('present','late') and e.deleted_at is null and e.status <> 'terminated'),
 (select count(*) from attendance a where a.branch_id=b.id and a.work_date=day and a.status='absent'),
 (select count(*) from attendance a where a.branch_id=b.id and a.work_date=day and a.status='late'),
 (select count(*) from checklist_templates t where t.is_active and (t.branch_id is null or t.branch_id=b.id)),
 (select count(*) from daily_reports r join checklist_templates t on t.id=r.template_id where r.branch_id=b.id and r.report_date=day and t.is_active and (t.branch_id is null or t.branch_id=b.id)),
 coalesce((select sum(case when r.id is not null then (select count(*) from daily_report_items i where i.report_id=r.id)
   else (select count(*) from checklist_items i where i.template_id=t.id and i.is_active) end)
   from checklist_templates t left join daily_reports r on r.template_id=t.id and r.branch_id=b.id and r.report_date=day
   where t.is_active and (t.branch_id is null or t.branch_id=b.id)),0)::bigint,
 (select count(*) from daily_report_items i join daily_reports r on r.id=i.report_id join checklist_templates t on t.id=r.template_id
   where r.branch_id=b.id and r.report_date=day and i.is_done and t.is_active and (t.branch_id is null or t.branch_id=b.id)),
 q.percentage, (q.submitted_at at time zone 'Africa/Cairo')::date,
 (select count(*) from tasks t where t.branch_id=b.id and t.status not in ('approved','closed')),
 (select count(*) from tasks t where t.branch_id=b.id and t.status='waiting_review'),
 (select count(*) from tasks t where t.branch_id=b.id and t.status not in ('approved','closed','waiting_review') and t.due_date < now()),
 (select count(*) from complaints c where c.branch_id=b.id and c.status in ('open','in_progress')),
 (select count(*) from maintenance_requests m where m.branch_id=b.id and m.status in ('open','in_progress'))
from branches b left join lateral (
 select s.percentage,s.submitted_at from quality_submissions s where s.branch_id=b.id and s.max_total > 0
 and (s.submitted_at at time zone 'Africa/Cairo')::date between day-30 and day order by s.submitted_at desc limit 1
) q on true where b.deleted_at is null and b.is_active order by b.code;
$$;
revoke all on function branch_daily_metrics(date) from public;
grant execute on function branch_daily_metrics(date) to authenticated;

-- Disabled accounts lose branch access immediately at the database boundary.
create or replace function auth_role() returns user_role
language sql stable security definer set search_path=public as $$
 select role from profiles where id=auth.uid() and is_active
$$;
create or replace function can_access_branch(b uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce(case when auth_role()='super_admin' then true
 when auth_role()='quality_inspector' then true
 when auth_role()='area_manager' then exists(select 1 from area_manager_branches where user_id=auth.uid() and branch_id=b)
 when auth_role() is not null then exists(select 1 from profiles where id=auth.uid() and is_active and branch_id=b)
 else false end,false)
$$;

-- Admin-only corrections retain the original submitter and audit every edit.
alter table daily_reports add column updated_at timestamptz, add column updated_by uuid references profiles(id), add column correction_reason text;
create or replace function admin_save_daily_report(tpl uuid, branch uuid, report_day date, report_notes text, entries jsonb, reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid; expected_count integer; valid_count integer; prior boolean;
begin
 if not is_super_admin() then raise exception 'Only the general manager can correct a report'; end if;
 if report_day > (now() at time zone 'Africa/Cairo')::date or length(trim(coalesce(reason,''))) < 3 then raise exception 'A correction reason and a valid date are required'; end if;
 if not exists(select 1 from branches where id=branch and deleted_at is null)
 or not exists(select 1 from checklist_templates where id=tpl and (branch_id is null or branch_id=branch)) then raise exception 'Invalid branch or checklist'; end if;
 if jsonb_typeof(entries) is distinct from 'array' then raise exception 'Invalid entries'; end if;
 select id into rid from daily_reports where branch_id=branch and template_id=tpl and report_date=report_day for update;
 prior := rid is not null;
 if prior then select count(*) into expected_count from daily_report_items where report_id=rid;
 else select count(*) into expected_count from checklist_items where template_id=tpl and is_active; end if;
 select count(distinct x.item_id) into valid_count from jsonb_to_recordset(entries) x(item_id uuid,is_done boolean)
 join checklist_items i on i.id=x.item_id and i.template_id=tpl
 where x.is_done is not null and (case when prior then exists(select 1 from daily_report_items d where d.report_id=rid and d.item_id=i.id) else i.is_active end);
 if expected_count=0 or valid_count<>expected_count or jsonb_array_length(entries)<>expected_count then raise exception 'The checklist has changed. Reload the report'; end if;
 if prior then update daily_reports set notes=report_notes,updated_at=now(),updated_by=auth.uid(),correction_reason=reason where id=rid;
 else insert into daily_reports(template_id,branch_id,report_date,submitted_by,notes,updated_at,updated_by,correction_reason)
 values(tpl,branch,report_day,auth.uid(),report_notes,now(),auth.uid(),reason) returning id into rid; end if;
 delete from daily_report_items where report_id=rid;
 insert into daily_report_items(report_id,item_id,is_done) select rid,x.item_id,x.is_done from jsonb_to_recordset(entries) x(item_id uuid,is_done boolean);
 insert into notifications(user_id,type,title,link) select id,'report','عدل المدير العام التقرير اليومي','/daily?branch='||branch||'&tpl='||tpl||'&date='||report_day
 from profiles where role='branch_manager' and branch_id=branch and is_active;
 return rid;
end $$;
revoke all on function admin_save_daily_report(uuid,uuid,date,text,jsonb,text) from public;
grant execute on function admin_save_daily_report(uuid,uuid,date,text,jsonb,text) to authenticated;
create trigger trg_log_daily_items after insert or update or delete on daily_report_items for each row execute function log_activity();

-- Quality answers are validated and saved atomically, and scores calculated by
-- the database even when a branch manager does not have UPDATE permission.
alter function calc_quality_score() security definer;
alter function calc_quality_score() set search_path=public;
create or replace function submit_quality_assessment(form uuid, branch uuid, report_notes text, entries jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare sid uuid; required_count integer; valid_count integer;
begin
 if auth.uid() is null or auth_role() not in ('super_admin','branch_manager','quality_inspector','area_manager') or not can_access_branch(branch) then raise exception 'Not allowed'; end if;
 if not exists(select 1 from quality_forms where id=form and is_active) or jsonb_typeof(entries) is distinct from 'array' then raise exception 'Invalid form'; end if;
 select count(*) into required_count from quality_questions q join quality_sections s on s.id=q.section_id where s.form_id=form and s.is_active and q.is_active;
 select count(distinct x.question_id) into valid_count from jsonb_to_recordset(entries) x(question_id uuid, score numeric)
 join quality_questions q on q.id=x.question_id join quality_sections s on s.id=q.section_id
 where s.form_id=form and s.is_active and q.is_active and x.score between 0 and q.max_score;
 if required_count=0 or valid_count<>required_count or jsonb_array_length(entries)<>required_count then raise exception 'Answer all questions with valid scores'; end if;
 insert into quality_submissions(form_id,branch_id,submitted_by,notes) values(form,branch,auth.uid(),report_notes) returning id into sid;
 insert into quality_answers(submission_id,question_id,score) select sid,x.question_id,x.score from jsonb_to_recordset(entries) x(question_id uuid,score numeric);
 return sid;
end $$;
revoke all on function submit_quality_assessment(uuid,uuid,text,jsonb) from public;
grant execute on function submit_quality_assessment(uuid,uuid,text,jsonb) to authenticated;
-- Report submissions by branch managers go through the validated RPCs above.
drop policy if exists dr_ins on daily_reports;
drop policy if exists dri_ins on daily_report_items;
drop policy if exists qsub_ins on quality_submissions;
drop policy if exists qans_ins on quality_answers;

create or replace function enforce_account_capacity() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(9260910);
 if new.is_active and new.role='branch_manager' and
 (select count(*) from profiles where role='branch_manager' and is_active and id<>new.id)>=9 then
 raise exception 'Maximum of 9 active branch managers'; end if;
 if new.is_active and new.role='super_admin' and
 (select count(*) from profiles where role='super_admin' and is_active and id<>new.id)>=1 then
 raise exception 'Only one active general manager is allowed'; end if;
 return new;
end $$;
create trigger trg_account_capacity before insert or update of role,is_active on profiles for each row execute function enforce_account_capacity();

create or replace function assign_branch_manager(b uuid,u uuid) returns void
language plpgsql security definer set search_path=public as $$
declare old_branch uuid;
begin
 if not is_super_admin() then raise exception 'forbidden'; end if;
 if not exists(select 1 from branches where id=b and deleted_at is null) then raise exception 'Invalid branch'; end if;
 select branch_id into old_branch from profiles where id=u and role='branch_manager' and is_active for update;
 if not found then raise exception 'Select an active branch manager'; end if;
 update profiles set branch_id=null where branch_id=b and role='branch_manager' and id<>u;
 update profiles set branch_id=b where id=u;
 perform sync_branch_room(b);
 if old_branch is not null and old_branch<>b then perform sync_branch_room(old_branch); end if;
 insert into notifications(user_id,type,title,link) values(u,'task','تم تعيينك مسؤولًا عن الفرع','/');
end $$;
-- Existing JWTs for a disabled account cannot keep reading operational tables.
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename<>'profiles' loop
  execute format('create policy active_account on %I as restrictive for all to authenticated using (auth_role() is not null) with check (auth_role() is not null)',t);
 end loop;
end $$;
create or replace function is_room_member(r uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth_role() is not null and exists(select 1 from chat_members where room_id=r and user_id=auth.uid())
$$;
alter publication supabase_realtime add table daily_report_items,checklist_items,checklist_templates,settings;
