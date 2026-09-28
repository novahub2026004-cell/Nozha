-- Submit the full daily checklist in a single transaction. A failed item can
-- no longer leave behind an empty report that prevents another submission.
create or replace function submit_daily_checklist(
  tpl uuid, branch uuid, report_notes text, entries jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare report_id uuid;
        required_count int;
        valid_count int;
begin
  if auth.uid() is null or not exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'branch_manager'
      and p.branch_id = branch and p.is_active
  ) then raise exception 'Only the assigned branch manager can submit this checklist'; end if;

  if not exists (select 1 from branches b where b.id = branch and b.deleted_at is null and b.is_active)
    or not exists (select 1 from checklist_templates t where t.id = tpl and t.is_active
      and (t.branch_id is null or t.branch_id = branch))
    then raise exception 'Checklist is unavailable for this branch'; end if;

  if jsonb_typeof(entries) is distinct from 'array' then raise exception 'Invalid checklist items'; end if;
  select count(*) into required_count from checklist_items where template_id = tpl and is_active;
  select count(distinct x.item_id) into valid_count
    from jsonb_to_recordset(entries) as x(item_id uuid, is_done boolean)
    join checklist_items i on i.id = x.item_id and i.template_id = tpl and i.is_active
    where x.is_done is not null;
  if required_count = 0 or valid_count <> required_count or jsonb_array_length(entries) <> required_count
    then raise exception 'Complete the current checklist before submitting'; end if;

  insert into daily_reports(template_id, branch_id, report_date, submitted_by, notes)
    values (tpl, branch, (now() at time zone 'Africa/Cairo')::date, auth.uid(), report_notes)
    returning id into report_id;
  insert into daily_report_items(report_id, item_id, is_done)
    select report_id, x.item_id, x.is_done
    from jsonb_to_recordset(entries) as x(item_id uuid, is_done boolean);
  return report_id;
end $$;
revoke all on function submit_daily_checklist(uuid, uuid, text, jsonb) from public;
grant execute on function submit_daily_checklist(uuid, uuid, text, jsonb) to authenticated;
