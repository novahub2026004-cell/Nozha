-- A user's editable contact details must not allow moving themselves to a
-- different branch or enabling administrative flags through the profiles API.
create or replace function protect_profile_access() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_super_admin() then return new; end if;
  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.branch_id is distinct from old.branch_id
     or new.can_add_employees is distinct from old.can_add_employees
     or new.is_active is distinct from old.is_active
     or new.username is distinct from old.username then
    raise exception 'Only the administrator can change account access';
  end if;
  return new;
end $$;
create trigger trg_profile_access_guard before update on profiles
  for each row execute function protect_profile_access();
