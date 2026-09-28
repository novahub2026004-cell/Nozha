-- =====================================================================
-- 0004 - Architecture update (realtime, task state machine, messaging,
--        soft delete, granular permissions, immutable audit, reports)
-- =====================================================================

-- ---------- 1. SOFT DELETE + branch/manager integrity ----------
alter table branches  add column if not exists deleted_at timestamptz;
alter table employees add column if not exists deleted_at timestamptz;
alter table branches drop constraint if exists branches_code_key;
create unique index if not exists branches_code_active on branches(code) where deleted_at is null;
create unique index if not exists one_manager_per_branch on profiles(branch_id) where role = 'branch_manager';

drop policy if exists branches_read on branches;
create policy branches_read on branches for select using (can_access_branch(id) and deleted_at is null);
drop policy if exists emp_read on employees;
create policy emp_read on employees for select
  using (deleted_at is null and (can_access_branch(branch_id) or profile_id = auth.uid()));

-- ---------- 2. GRANULAR PERMISSIONS (per-user override on top of role matrix) ----------
create table if not exists user_permissions (
  user_id uuid references profiles(id) on delete cascade,
  permission text not null,
  allowed boolean not null,
  primary key (user_id, permission)
);
alter table user_permissions enable row level security;
create policy admin_all on user_permissions for all using (is_super_admin()) with check (is_super_admin());
create policy up_self_read on user_permissions for select using (user_id = auth.uid());

create or replace function has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_super_admin() or coalesce(
    (select allowed from user_permissions where user_id = auth.uid() and permission = p),
    (select allowed from role_permissions where role = auth_role() and permission = p), false)
$$;

insert into user_permissions(user_id, permission, allowed)
  select id, 'employees.add', true from profiles where can_add_employees on conflict do nothing;
insert into role_permissions(role, permission, allowed) values
  ('branch_manager','employees.edit',true), ('branch_manager','employees.add',false),
  ('branch_manager','employees.delete',false), ('branch_manager','employees.documents',false)
on conflict (role, permission) do update set allowed = excluded.allowed;

drop policy if exists emp_insert on employees;
drop policy if exists emp_update on employees;
create policy emp_insert on employees for insert
  with check (can_access_branch(branch_id) and has_perm('employees.add'));
create policy emp_update on employees for update
  using (can_access_branch(branch_id) and has_perm('employees.edit'))
  with check (can_access_branch(branch_id));

-- Non-admins cannot move employees between branches or soft-delete without permission
create or replace function employee_guard() returns trigger language plpgsql
security definer set search_path = public as $$
begin
  if auth.uid() is null or is_super_admin() then return new; end if;
  if new.branch_id is distinct from old.branch_id then raise exception 'only super admin can transfer employees'; end if;
  if old.deleted_at is null and new.deleted_at is not null and not has_perm('employees.delete') then
    raise exception 'no permission to delete employees'; end if;
  return new;
end $$;
create trigger trg_employee_guard before update on employees for each row execute function employee_guard();

drop policy if exists empdoc_ins on employee_documents;
create policy empdoc_ins on employee_documents for insert with check (
  uploaded_by = auth.uid() and has_perm('employees.documents') and
  exists (select 1 from employees e where e.id = employee_id and can_access_branch(e.branch_id)));

-- ---------- 3. BRANCH MANAGEMENT RPCs ----------
create or replace function assign_branch_manager(b uuid, u uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'forbidden'; end if;
  update profiles set branch_id = null where branch_id = b and role = 'branch_manager' and id <> u;
  update profiles set branch_id = b, role = 'branch_manager' where id = u;
  perform sync_branch_room(b);
  insert into notifications(user_id, type, title, link) values (u, 'task', 'تم تعيينك مديرًا لفرع جديد', '/');
end $$;

create or replace function delete_branch(b uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'forbidden'; end if;
  update profiles set branch_id = null where branch_id = b;
  update branches set deleted_at = now(), is_active = false where id = b;   -- history is preserved
end $$;

-- ---------- 4. TASK WORKFLOW ----------
-- Guard: enforces the state machine and role for every status change (RLS can't compare old/new)
create or replace function enforce_task_transition() returns trigger language plpgsql
security definer set search_path = public as $$
declare adm boolean := is_super_admin(); creator boolean := (old.created_by = auth.uid());
        assignee boolean := (old.assigned_to = auth.uid());
begin
  if auth.uid() is null then return new; end if;   -- service role (seed)
  if new.created_by is distinct from old.created_by then raise exception 'created_by is immutable'; end if;
  if (new.assigned_to is distinct from old.assigned_to or new.branch_id is distinct from old.branch_id)
     and not (adm or creator) then raise exception 'only the creator or super admin can reassign'; end if;
  if new.status is distinct from old.status and not (
      (assignee and (old.status::text, new.status::text) in (
        ('created','received'),('received','in_progress'),('created','in_progress'),
        ('in_progress','waiting_review'),('received','waiting_review'),
        ('returned','in_progress'),('rejected','in_progress')))
      or ((adm or creator) and (old.status::text, new.status::text) in (
        ('waiting_review','approved'),('waiting_review','rejected'),('waiting_review','returned'),
        ('approved','closed'),('rejected','closed')))
  ) then raise exception 'illegal task transition % -> %', old.status, new.status; end if;
  return new;
end $$;
create trigger trg_a_task_guard before update on tasks for each row execute function enforce_task_transition();

drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks for update using (assigned_to = auth.uid() or created_by = auth.uid())
  with check (assigned_to = auth.uid() or created_by = auth.uid());

-- Timeline is append-only (nobody, including super admin, can edit or delete history)
drop policy if exists admin_all on task_events;
drop policy if exists te_ins on task_events;
create policy te_admin_read on task_events for select using (is_super_admin());
create policy te_ins on task_events for insert with check (
  actor_id = auth.uid() and action in ('comment','note','file_uploaded') and
  (is_super_admin() or exists (select 1 from tasks t where t.id = task_id
     and (t.assigned_to = auth.uid() or t.created_by = auth.uid()))));

create table task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  kind text not null check (kind in ('image','pdf','excel')),
  file_name text not null,
  storage_path text not null,               -- bucket task-files: {branch_id}/{task_id}/{file}
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel')),
  size_bytes bigint not null check (size_bytes <= 20971520),
  uploaded_by uuid not null default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
alter table task_attachments enable row level security;
create policy ta_read on task_attachments for select using (is_super_admin() or exists (
  select 1 from tasks t where t.id = task_id and (t.assigned_to = auth.uid() or t.created_by = auth.uid())));
create policy ta_ins on task_attachments for insert with check (uploaded_by = auth.uid() and exists (
  select 1 from tasks t where t.id = task_id and (t.assigned_to = auth.uid() or t.created_by = auth.uid()
  or is_super_admin())));

create or replace function attachment_to_timeline() returns trigger language plpgsql
security definer set search_path = public as $$
begin
  insert into task_events(task_id, actor_id, action, file_path, file_name)
    values (new.task_id, new.uploaded_by, 'file_uploaded', new.storage_path, new.file_name);
  insert into notifications(user_id, type, title, link)
    select u, 'task', 'ملف جديد على المهمة: ' || new.file_name, '/tasks/' || new.task_id
    from tasks t, unnest(array[t.created_by, t.assigned_to]) u
    where t.id = new.task_id and u <> new.uploaded_by;
  return new;
end $$;
create trigger trg_attachment_timeline after insert on task_attachments for each row execute function attachment_to_timeline();

-- Notify the other side for comments/notes too
create or replace function event_notify() returns trigger language plpgsql
security definer set search_path = public as $$
begin
  if new.action in ('comment','note') then
    insert into notifications(user_id, type, title, body, link)
      select u, 'task', 'رد جديد على المهمة: ' || t.title, left(new.comment, 80), '/tasks/' || t.id
      from tasks t, unnest(array[t.created_by, t.assigned_to]) u
      where t.id = new.task_id and u <> new.actor_id;
  end if;
  return new;
end $$;
create trigger trg_event_notify after insert on task_events for each row execute function event_notify();

-- ---------- 5. INTERNAL MESSAGING ----------
create or replace function get_or_create_direct_room(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); mr user_role := auth_role(); orole user_role; rid uuid;
begin
  select role into orole from profiles where id = other and is_active;
  if orole is null or mr = 'employee' or orole = 'employee' then raise exception 'messaging not allowed'; end if;
  if not (mr = 'super_admin' or orole = 'super_admin'
    or (mr = 'area_manager' and orole = 'branch_manager' and exists (
         select 1 from profiles p join area_manager_branches a on a.branch_id = p.branch_id
         where p.id = other and a.user_id = me))
    or (mr = 'branch_manager' and orole = 'area_manager' and exists (
         select 1 from profiles p join area_manager_branches a on a.branch_id = p.branch_id
         where p.id = me and a.user_id = other))
  ) then raise exception 'messaging not allowed between these roles'; end if;
  select r.id into rid from chat_rooms r where r.type = 'direct'
    and exists (select 1 from chat_members where room_id = r.id and user_id = me)
    and exists (select 1 from chat_members where room_id = r.id and user_id = other) limit 1;
  if rid is null then
    insert into chat_rooms(type) values ('direct') returning id into rid;
    insert into chat_members(room_id, user_id) values (rid, me), (rid, other);
  end if;
  return rid;
end $$;

create or replace function sync_branch_room(b uuid) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  select id into rid from chat_rooms where type = 'branch_group' and branch_id = b;
  if rid is null then
    insert into chat_rooms(type, name, branch_id) select 'branch_group', name, b from branches where id = b returning id into rid;
  end if;
  insert into chat_members(room_id, user_id)
    select rid, p.id from profiles p where p.is_active and (p.role = 'super_admin'
      or (p.branch_id = b and p.role = 'branch_manager')
      or (p.role = 'area_manager' and exists (select 1 from area_manager_branches a where a.user_id = p.id and a.branch_id = b)))
  on conflict do nothing;
  delete from chat_members m where m.room_id = rid and not exists (
    select 1 from profiles p where p.id = m.user_id and (p.role = 'super_admin'
      or (p.branch_id = b and p.role = 'branch_manager')
      or (p.role = 'area_manager' and exists (select 1 from area_manager_branches a where a.user_id = p.id and a.branch_id = b))));
end $$;

create or replace function branch_room_on_insert() returns trigger language plpgsql
security definer set search_path = public as $$ begin perform sync_branch_room(new.id); return new; end $$;
create trigger trg_branch_room after insert on branches for each row execute function branch_room_on_insert();

-- Read receipts + unread reset + clear message notifications in one call
create or replace function mark_room_read(rid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_room_member(rid) then raise exception 'not a member'; end if;
  insert into message_reads(message_id, user_id)
    select m.id, auth.uid() from messages m
    where m.room_id = rid and m.sender_id <> auth.uid()
      and not exists (select 1 from message_reads r where r.message_id = m.id and r.user_id = auth.uid());
  update chat_members set last_read_at = now() where room_id = rid and user_id = auth.uid();
  update notifications set is_read = true where user_id = auth.uid() and type = 'message' and link = '/chat/' || rid;
end $$;

drop policy if exists mr_ins on message_reads;
create policy mr_ins on message_reads for insert with check (user_id = auth.uid() and exists (
  select 1 from messages m where m.id = message_id and is_room_member(m.room_id)));
alter table messages add constraint messages_file_type_ck check (file_type is null or file_type in ('image','file'));
alter table messages add constraint messages_not_empty_ck check (body is not null or file_path is not null);

-- Online status: Realtime Presence is the live source; this heartbeat gives "last seen"
create or replace function touch_presence() returns void language sql security definer set search_path = public as
$$ update profiles set last_seen = now() where id = auth.uid() $$;

-- ---------- 6. ATTENDANCE INTEGRITY ----------
create or replace function attendance_guard() returns trigger language plpgsql
security definer set search_path = public as $$
begin
  if (select branch_id from employees where id = new.employee_id) is distinct from new.branch_id then
    raise exception 'employee does not belong to this branch'; end if;
  if new.check_in is not null and new.check_out is not null and new.check_out < new.check_in then
    raise exception 'check_out is before check_in'; end if;
  if new.status in ('absent','leave') then new.check_in := null; new.check_out := null; end if;
  return new;
end $$;
create trigger trg_attendance_guard before insert or update on attendance for each row execute function attendance_guard();

-- ---------- 7. AUDIT LOG: immutable, branch-aware, no salary leak ----------
create or replace function log_activity() returns trigger language plpgsql
security definer set search_path = public as $$
declare rec jsonb := to_jsonb(coalesce(new, old)); b uuid;
begin
  b := case tg_table_name
    when 'branches' then (rec->>'id')::uuid
    when 'employee_salaries' then (select branch_id from employees where id = (rec->>'employee_id')::uuid)
    when 'employee_documents' then (select branch_id from employees where id = (rec->>'employee_id')::uuid)
    when 'task_attachments' then (select branch_id from tasks where id = (rec->>'task_id')::uuid)
    else nullif(rec->>'branch_id','')::uuid end;
  insert into activity_log(user_id, branch_id, action, entity, entity_id, old_value, new_value)
  values (auth.uid(), b, tg_op, tg_table_name, coalesce(rec->>'id', rec->>'employee_id', rec->>'user_id'),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['task_attachments','employee_documents','user_permissions','role_permissions'] loop
    execute format('create trigger trg_log_%I after insert or update or delete on %I for each row execute function log_activity()', t, t);
  end loop; end $$;

drop policy if exists admin_all on activity_log;
create policy log_admin_read on activity_log for select using (is_super_admin());
drop policy if exists log_read on activity_log;
create policy log_read on activity_log for select
  using (auth_role() = 'area_manager' and can_access_branch(branch_id) and entity <> 'employee_salaries');
revoke insert, update, delete on activity_log from anon, authenticated;

create or replace function log_export(report text, params jsonb, b uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if b is not null and not can_access_branch(b) then raise exception 'forbidden'; end if;
  insert into activity_log(user_id, branch_id, action, entity, new_value) values (auth.uid(), b, 'export', report, params);
end $$;

-- ---------- 8. REPORT VIEWS (security_invoker => RLS applies to the exporting user) ----------
create or replace view v_attendance_report with (security_invoker = true) as
  select a.work_date, a.branch_id, b.name as branch, e.full_name as employee, e.position,
         a.status, a.check_in, a.check_out, a.notes
  from attendance a join employees e on e.id = a.employee_id join branches b on b.id = a.branch_id;

create or replace view v_task_report with (security_invoker = true) as
  select t.id, t.title, t.priority, t.status, t.branch_id, b.name as branch, t.created_at, t.due_date, t.closed_at,
         c.full_name as created_by_name, s.full_name as assigned_to_name
  from tasks t left join branches b on b.id = t.branch_id
  left join profiles c on c.id = t.created_by left join profiles s on s.id = t.assigned_to;

create or replace view v_branch_kpis with (security_invoker = true) as
  select b.id as branch_id, b.name,
    (select count(*) from employees e where e.branch_id = b.id and e.deleted_at is null) as employees,
    (select count(*) from tasks t where t.branch_id = b.id and t.status not in ('approved','closed')) as open_tasks,
    (select count(*) from complaints c where c.branch_id = b.id and c.status in ('open','in_progress')) as open_complaints,
    (select round(avg(percentage),1) from quality_submissions q where q.branch_id = b.id) as quality_pct,
    (select round(100.0 * count(*) filter (where status in ('present','late')) / nullif(count(*),0), 1)
       from attendance a where a.branch_id = b.id and a.work_date = current_date) as attendance_pct
  from branches b where b.deleted_at is null;

-- ---------- 9. REALTIME + STORAGE LIMITS ----------
alter table tasks replica identity full;
alter table attendance replica identity full;
alter table employees replica identity full;
alter table branches replica identity full;
alter table messages replica identity full;
alter publication supabase_realtime add table
  branches, employees, documents, employee_documents, task_attachments, activity_log, requests, chat_rooms, chat_members;

update storage.buckets set file_size_limit = 20971520, allowed_mime_types = array[
  'image/jpeg','image/png','image/webp','application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword']
where id in ('branch-docs','employee-docs','task-files','chat-files','report-photos');

-- create branch rooms for branches that already exist
select sync_branch_room(id) from branches where deleted_at is null;
