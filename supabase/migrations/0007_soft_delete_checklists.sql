-- Deleting a checklist item / quality question / section = deactivate (old reports keep their history)
alter table checklist_items  add column if not exists is_active boolean not null default true;
alter table quality_sections add column if not exists is_active boolean not null default true;
alter table quality_questions add column if not exists is_active boolean not null default true;
