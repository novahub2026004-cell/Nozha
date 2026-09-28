-- =====================================================================
-- NOZHA BRANCH OPERATIONS ERP - Supabase / PostgreSQL schema
-- Run in the Supabase SQL editor (or as supabase/migrations/0001_init.sql)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- ENUMS ----------
create type user_role as enum ('super_admin','area_manager','branch_manager','quality_inspector','employee');
create type employee_status as enum ('active','on_leave','suspended','terminated');
create type attendance_status as enum ('present','late','absent','leave');
create type task_status as enum ('created','received','in_progress','waiting_review','approved','rejected','closed');
create type task_priority as enum ('low','medium','high','urgent');
create type request_status as enum ('pending','approved','rejected');
create type ticket_status as enum ('open','in_progress','resolved','closed');
create type room_type as enum ('direct','branch_group','custom_group');
create type question_type as enum ('yes_no','score','text');

-- ---------- CORE ----------
create table branches (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  city text,
  address text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

-- profiles = app users, 1:1 with auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role user_role not null default 'employee',
  branch_id uuid references branches(id),            -- branch manager / employee home branch
  can_add_employees boolean not null default false,   -- branch manager toggle
  avatar_url text,
  is_online boolean not null default false,
  last_seen timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table area_manager_branches (
  user_id uuid references profiles(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade,
  primary key (user_id, branch_id)
);

-- Fine-grained, editable permission matrix (nothing hardcoded)
create table role_permissions (
  role user_role not null,
  permission text not null,          -- e.g. 'tasks.create', 'employees.delete'
  allowed boolean not null default false,
  primary key (role, permission)
);

create table settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

-- ---------- EMPLOYEES ----------
create table employees (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete set null,
  branch_id uuid not null references branches(id),
  department_id uuid references departments(id),
  full_name text not null,
  phone text,
  position text,
  status employee_status not null default 'active',
  hire_date date,
  created_at timestamptz not null default now()
);

-- Salary isolated so RLS can hide it from everyone except super admin
create table employee_salaries (
  employee_id uuid primary key references employees(id) on delete cascade,
  salary numeric(12,2) not null,
  updated_at timestamptz not null default now()
);

create table employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  title text not null,
  kind text,                         -- contract / id / certificate
  storage_path text not null,        -- bucket: employee-docs
  mime_type text,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- ATTENDANCE ----------
create table attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  branch_id uuid not null references branches(id),
  work_date date not null default current_date,
  status attendance_status not null,
  check_in timestamptz,
  check_out timestamptz,
  notes text,
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index on attendance (branch_id, work_date);

-- ---------- DAILY OPERATIONS ----------
create table checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  branch_id uuid references branches(id),     -- null = all branches
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates(id) on delete cascade,
  section text not null,                       -- Cleaning, Refrigerators, Bakery...
  label text not null,
  sort_order int not null default 0
);

create table daily_reports (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates(id),
  branch_id uuid not null references branches(id),
  report_date date not null default current_date,
  submitted_by uuid references profiles(id),
  notes text,
  submitted_at timestamptz not null default now(),
  unique (branch_id, template_id, report_date)
);

create table daily_report_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references daily_reports(id) on delete cascade,
  item_id uuid not null references checklist_items(id),
  is_done boolean not null default false,
  note text,
  photo_path text
);

-- ---------- QUALITY ----------
create table quality_forms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table quality_sections (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references quality_forms(id) on delete cascade,
  title text not null,
  sort_order int not null default 0
);

create table quality_questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references quality_sections(id) on delete cascade,
  text text not null,
  type question_type not null default 'score',
  max_score numeric(6,2) not null default 5,
  sort_order int not null default 0
);

create table quality_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references quality_forms(id),
  branch_id uuid not null references branches(id),
  submitted_by uuid references profiles(id),
  total_score numeric(8,2) not null default 0,
  max_total numeric(8,2) not null default 0,
  percentage numeric(5,2) not null default 0,
  notes text,
  submitted_at timestamptz not null default now()
);

create table quality_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references quality_submissions(id) on delete cascade,
  question_id uuid not null references quality_questions(id),
  score numeric(6,2) not null default 0,
  answer_text text,
  photo_path text
);

-- Automatic score calculation
create or replace function calc_quality_score() returns trigger
language plpgsql as $$
declare sid uuid := coalesce(new.submission_id, old.submission_id);
begin
  update quality_submissions s set
    total_score = t.got, max_total = t.mx,
    percentage = case when t.mx = 0 then 0 else round(t.got / t.mx * 100, 2) end
  from (
    select coalesce(sum(a.score),0) got, coalesce(sum(q.max_score),0) mx
    from quality_answers a join quality_questions q on q.id = a.question_id
    where a.submission_id = sid
  ) t
  where s.id = sid;
  return null;
end $$;
create trigger trg_quality_score after insert or update or delete on quality_answers
  for each row execute function calc_quality_score();

-- ---------- TASKS ----------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  priority task_priority not null default 'medium',
  status task_status not null default 'created',
  branch_id uuid references branches(id),
  assigned_to uuid not null references profiles(id),   -- area or branch manager
  created_by uuid not null references profiles(id),
  due_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index on tasks (assigned_to, status);
create index on tasks (branch_id, status);

-- Full timeline: every action stored (user, date/time, action)
create table task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  actor_id uuid references profiles(id),
  action text not null,          -- created, received, comment, file_uploaded, status_changed, reassigned, approved, rejected, returned, closed
  from_status task_status,
  to_status task_status,
  comment text,
  file_path text,
  file_name text,
  created_at timestamptz not null default now()
);
create index on task_events (task_id, created_at);

-- ---------- REQUESTS / COMPLAINTS / MAINTENANCE ----------
create table requests (               -- generic approval requests
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  type text not null,                  -- leave, purchase, transfer...
  title text not null,
  details text,
  status request_status not null default 'pending',
  requested_by uuid not null references profiles(id),
  decided_by uuid references profiles(id),
  decision_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table complaints (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  title text not null,
  details text,
  source text,                         -- customer / internal
  status ticket_status not null default 'open',
  photo_path text,
  created_by uuid references profiles(id),
  resolved_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  title text not null,
  details text,
  priority task_priority not null default 'medium',
  status ticket_status not null default 'open',
  photo_path text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------- CHAT ----------
create table chat_rooms (
  id uuid primary key default gen_random_uuid(),
  type room_type not null,
  name text,
  branch_id uuid references branches(id),
  created_at timestamptz not null default now()
);

create table chat_members (
  room_id uuid references chat_rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references chat_rooms(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text,
  file_path text,
  file_name text,
  file_type text,                      -- image / file
  created_at timestamptz not null default now()
);
create index on messages (room_id, created_at);

create table message_reads (
  message_id uuid references messages(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- ---------- DOCUMENT ARCHIVE ----------
create table document_categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  category_id uuid references document_categories(id),
  title text not null,
  storage_path text not null,          -- bucket: branch-docs
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple', coalesce(title,''))) stored
);
create index on documents using gin (search);

-- ---------- NOTIFICATIONS & ACTIVITY LOG ----------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,                  -- task, message, attendance, report, complaint, quality
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, is_read, created_at desc);

create table activity_log (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id),
  branch_id uuid references branches(id),
  action text not null,                -- INSERT / UPDATE / DELETE or semantic name
  entity text not null,                -- table name
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index on activity_log (branch_id, created_at desc);

-- =====================================================================
-- HELPER FUNCTIONS (used by RLS)
-- =====================================================================
create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(auth_role() = 'super_admin', false) $$;

create or replace function can_access_branch(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth_role() in ('super_admin','quality_inspector') then true
    when auth_role() = 'area_manager' then exists (
      select 1 from area_manager_branches where user_id = auth.uid() and branch_id = b)
    else exists (select 1 from profiles where id = auth.uid() and branch_id = b)
  end
$$;

create or replace function has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_super_admin() or coalesce((
    select allowed from role_permissions where role = auth_role() and permission = p), false)
$$;

-- =====================================================================
-- AUTOMATION TRIGGERS
-- =====================================================================
-- Generic audit trigger -> activity_log (old/new values, user, branch)
create or replace function log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb := to_jsonb(coalesce(new, old)); b uuid;
begin
  b := nullif(rec->>'branch_id','')::uuid;
  insert into activity_log(user_id, branch_id, action, entity, entity_id, old_value, new_value)
  values (auth.uid(), b, tg_op, tg_table_name, rec->>'id',
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['branches','employees','employee_salaries','attendance','tasks',
    'daily_reports','quality_submissions','complaints','maintenance_requests','requests',
    'documents','profiles','quality_forms','checklist_templates'] loop
    execute format('create trigger trg_log_%I after insert or update or delete on %I
                    for each row execute function log_activity()', t, t);
  end loop; end $$;

-- Task: auto timeline + notification on status change / creation
create or replace function task_track() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into task_events(task_id, actor_id, action, to_status) values (new.id, new.created_by, 'created', new.status);
    insert into notifications(user_id, type, title, link)
      values (new.assigned_to, 'task', 'New task: ' || new.title, '/tasks/' || new.id);
  elsif new.status is distinct from old.status then
    new.updated_at := now();
    insert into task_events(task_id, actor_id, action, from_status, to_status)
      values (new.id, auth.uid(), 'status_changed', old.status, new.status);
    insert into notifications(user_id, type, title, link)
      select u, 'task', 'Task "' || new.title || '" -> ' || new.status, '/tasks/' || new.id
      from unnest(array[new.created_by, new.assigned_to]) u where u is distinct from auth.uid();
    if new.status = 'closed' then new.closed_at := now(); end if;
  end if;
  return new;
end $$;
create trigger trg_task_ins after insert on tasks for each row execute function task_track();
create trigger trg_task_upd before update on tasks for each row execute function task_track();

-- Notify admins when report / quality / complaint is submitted
create or replace function notify_admins() returns trigger
language plpgsql security definer set search_path = public as $$
declare kind text := case tg_table_name
  when 'daily_reports' then 'report' when 'quality_submissions' then 'quality'
  when 'complaints' then 'complaint' else 'maintenance' end;
begin
  insert into notifications(user_id, type, title, link)
  select p.id, kind, 'New ' || kind || ' submitted', '/' || tg_table_name
  from profiles p where p.role = 'super_admin'
     or (p.role = 'area_manager' and exists (
          select 1 from area_manager_branches a where a.user_id = p.id and a.branch_id = new.branch_id));
  return new;
end $$;
create trigger trg_n_report after insert on daily_reports for each row execute function notify_admins();
create trigger trg_n_quality after insert on quality_submissions for each row execute function notify_admins();
create trigger trg_n_complaint after insert on complaints for each row execute function notify_admins();
create trigger trg_n_maint after insert on maintenance_requests for each row execute function notify_admins();

-- Notify room members on new message
create or replace function notify_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications(user_id, type, title, body, link)
  select user_id, 'message', 'New message', left(coalesce(new.body,'File'), 80), '/chat/' || new.room_id
  from chat_members where room_id = new.room_id and user_id <> new.sender_id;
  return new;
end $$;
create trigger trg_n_message after insert on messages for each row execute function notify_message();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
do $$ declare t text; begin
  foreach t in array array['branches','departments','profiles','area_manager_branches','role_permissions',
    'settings','employees','employee_salaries','employee_documents','attendance','checklist_templates',
    'checklist_items','daily_reports','daily_report_items','quality_forms','quality_sections',
    'quality_questions','quality_submissions','quality_answers','tasks','task_events','requests',
    'complaints','maintenance_requests','chat_rooms','chat_members','messages','message_reads',
    'document_categories','documents','notifications','activity_log'] loop
    execute format('alter table %I enable row level security', t);
  end loop; end $$;

-- Super admin: full access everywhere
do $$ declare t text; begin
  foreach t in array array['branches','departments','profiles','area_manager_branches','role_permissions',
    'settings','employees','employee_salaries','employee_documents','attendance','checklist_templates',
    'checklist_items','daily_reports','daily_report_items','quality_forms','quality_sections',
    'quality_questions','quality_submissions','quality_answers','tasks','task_events','requests',
    'complaints','maintenance_requests','chat_rooms','chat_members','messages','message_reads',
    'document_categories','documents','notifications','activity_log'] loop
    execute format('create policy admin_all on %I for all using (is_super_admin()) with check (is_super_admin())', t);
  end loop; end $$;

-- Branches
create policy branches_read on branches for select using (can_access_branch(id));

-- Reference data readable by any signed-in user
create policy dept_read on departments for select using (auth.uid() is not null);
create policy cat_read on document_categories for select using (auth.uid() is not null);
create policy tpl_read on checklist_templates for select using (branch_id is null or can_access_branch(branch_id));
create policy items_read on checklist_items for select using (auth.uid() is not null);
create policy qf_read on quality_forms for select using (auth.uid() is not null);
create policy qs_read on quality_sections for select using (auth.uid() is not null);
create policy qq_read on quality_questions for select using (auth.uid() is not null);
create policy perms_read on role_permissions for select using (auth.uid() is not null);

-- Profiles: self + people in accessible branches
create policy profiles_read on profiles for select
  using (id = auth.uid() or branch_id is null or can_access_branch(branch_id));
create policy profiles_self_update on profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = auth_role());   -- cannot self-escalate

-- Employees (salary table has NO policy except admin_all => hidden)
create policy emp_read on employees for select using (can_access_branch(branch_id) or profile_id = auth.uid());
create policy emp_insert on employees for insert
  with check (can_access_branch(branch_id) and (
    auth_role() = 'area_manager' or
    exists (select 1 from profiles where id = auth.uid() and role = 'branch_manager' and can_add_employees)));
create policy emp_update on employees for update using (can_access_branch(branch_id) and auth_role() in ('area_manager','branch_manager'));
create policy empdoc_read on employee_documents for select
  using (exists (select 1 from employees e where e.id = employee_id and can_access_branch(e.branch_id)));
create policy empdoc_ins on employee_documents for insert
  with check (auth_role() in ('area_manager','branch_manager','employee'));

-- Attendance
create policy att_read on attendance for select
  using (can_access_branch(branch_id) and (auth_role() <> 'employee' or
        employee_id in (select id from employees where profile_id = auth.uid())));
create policy att_write on attendance for insert with check (auth_role() in ('branch_manager','area_manager') and can_access_branch(branch_id));
create policy att_update on attendance for update using (auth_role() in ('branch_manager','area_manager') and can_access_branch(branch_id));

-- Daily reports & quality
create policy dr_read on daily_reports for select using (can_access_branch(branch_id));
create policy dr_ins on daily_reports for insert with check (auth_role() = 'branch_manager' and can_access_branch(branch_id));
create policy dri_read on daily_report_items for select
  using (exists (select 1 from daily_reports r where r.id = report_id and can_access_branch(r.branch_id)));
create policy dri_ins on daily_report_items for insert
  with check (exists (select 1 from daily_reports r where r.id = report_id and r.submitted_by = auth.uid()));
create policy qsub_read on quality_submissions for select using (can_access_branch(branch_id));
create policy qsub_ins on quality_submissions for insert
  with check (auth_role() in ('branch_manager','quality_inspector') and can_access_branch(branch_id));
create policy qans_read on quality_answers for select
  using (exists (select 1 from quality_submissions s where s.id = submission_id and can_access_branch(s.branch_id)));
create policy qans_ins on quality_answers for insert
  with check (exists (select 1 from quality_submissions s where s.id = submission_id and s.submitted_by = auth.uid()));

-- Tasks: creator, assignee, or manager over that branch; employees see their own
create policy tasks_read on tasks for select
  using (assigned_to = auth.uid() or created_by = auth.uid()
         or (branch_id is not null and can_access_branch(branch_id) and auth_role() = 'area_manager'));
create policy tasks_create on tasks for insert with check (auth_role() = 'area_manager' and created_by = auth.uid());
create policy tasks_update on tasks for update using (assigned_to = auth.uid() or created_by = auth.uid())
  with check (
    -- assignees may only move forward to these states; approve/reject/close is for creators/admin
    (assigned_to = auth.uid() and status in ('received','in_progress','waiting_review'))
    or created_by = auth.uid());
create policy te_read on task_events for select
  using (exists (select 1 from tasks t where t.id = task_id
         and (t.assigned_to = auth.uid() or t.created_by = auth.uid()
              or (t.branch_id is not null and can_access_branch(t.branch_id) and auth_role() = 'area_manager'))));
create policy te_ins on task_events for insert
  with check (actor_id = auth.uid() and exists (select 1 from tasks t where t.id = task_id
         and (t.assigned_to = auth.uid() or t.created_by = auth.uid())));

-- Requests / complaints / maintenance
create policy req_read on requests for select using (can_access_branch(branch_id));
create policy req_ins on requests for insert with check (requested_by = auth.uid() and can_access_branch(branch_id));
create policy req_decide on requests for update using (auth_role() = 'area_manager' and can_access_branch(branch_id));
create policy cmp_read on complaints for select using (can_access_branch(branch_id));
create policy cmp_ins on complaints for insert with check (auth_role() in ('branch_manager','area_manager') and can_access_branch(branch_id));
create policy cmp_upd on complaints for update using (auth_role() = 'area_manager' and can_access_branch(branch_id));
create policy mnt_read on maintenance_requests for select using (can_access_branch(branch_id));
create policy mnt_ins on maintenance_requests for insert with check (auth_role() in ('branch_manager','area_manager') and can_access_branch(branch_id));
create policy mnt_upd on maintenance_requests for update using (auth_role() = 'area_manager' and can_access_branch(branch_id));

-- Documents
create policy doc_read on documents for select using (can_access_branch(branch_id) and auth_role() <> 'employee');
create policy doc_ins on documents for insert with check (auth_role() in ('branch_manager','area_manager') and can_access_branch(branch_id));

-- Chat: members only
create or replace function is_room_member(r uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from chat_members where room_id = r and user_id = auth.uid()) $$;
create policy room_read on chat_rooms for select using (is_room_member(id));
create policy cm_read on chat_members for select using (is_room_member(room_id));
create policy cm_self_update on chat_members for update using (user_id = auth.uid());
create policy msg_read on messages for select using (is_room_member(room_id));
create policy msg_ins on messages for insert with check (sender_id = auth.uid() and is_room_member(room_id));
create policy mr_read on message_reads for select using (user_id = auth.uid() or exists (
  select 1 from messages m where m.id = message_id and m.sender_id = auth.uid()));
create policy mr_ins on message_reads for insert with check (user_id = auth.uid());

-- Notifications: own only
create policy notif_read on notifications for select using (user_id = auth.uid());
create policy notif_upd on notifications for update using (user_id = auth.uid());

-- Activity log: area managers see their branches
create policy log_read on activity_log for select using (auth_role() = 'area_manager' and can_access_branch(branch_id));

-- =====================================================================
-- REALTIME
-- =====================================================================
alter publication supabase_realtime add table
  tasks, task_events, attendance, messages, message_reads, notifications,
  daily_reports, quality_submissions, complaints, maintenance_requests, profiles;

-- =====================================================================
-- STORAGE (private buckets; path convention: {branch_id}/{yyyy}/{file})
-- =====================================================================
insert into storage.buckets (id, name, public) values
  ('branch-docs','branch-docs',false), ('employee-docs','employee-docs',false),
  ('task-files','task-files',false), ('chat-files','chat-files',false),
  ('report-photos','report-photos',false)
on conflict do nothing;

create policy storage_branch_rw on storage.objects for all
  using (bucket_id in ('branch-docs','employee-docs','task-files','report-photos')
         and (is_super_admin() or can_access_branch(((storage.foldername(name))[1])::uuid)))
  with check (bucket_id in ('branch-docs','employee-docs','task-files','report-photos')
         and (is_super_admin() or can_access_branch(((storage.foldername(name))[1])::uuid)));
-- chat-files path: {room_id}/file
create policy storage_chat_rw on storage.objects for all
  using (bucket_id = 'chat-files' and is_room_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'chat-files' and is_room_member(((storage.foldername(name))[1])::uuid));

-- =====================================================================
-- DEFAULT PERMISSION MATRIX (editable from the admin panel)
-- =====================================================================
insert into role_permissions (role, permission, allowed) values
 ('area_manager','tasks.create',true), ('area_manager','reports.view',true),
 ('area_manager','requests.approve',true), ('area_manager','branches.view',true),
 ('branch_manager','attendance.record',true), ('branch_manager','reports.submit',true),
 ('branch_manager','quality.submit',true), ('branch_manager','complaints.create',true),
 ('branch_manager','maintenance.create',true), ('branch_manager','employees.add',false),
 ('employee','tasks.view_own',true), ('employee','attendance.view_own',true)
on conflict do nothing;
