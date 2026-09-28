-- Login by username (the UI uses "1234", "manager1" ...)
alter table profiles add column if not exists username text unique;
