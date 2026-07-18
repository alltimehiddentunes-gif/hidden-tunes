-- Ensure service_role can operate Sports private tables (additive).
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
