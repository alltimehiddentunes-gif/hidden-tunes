-- Superseded by 20260706123000_audiobook_catalog_production_schema_repair.sql.
-- Kept as a safe no-op so existing deployment bundles can include this
-- timestamp without directly referencing legacy columns that may not exist.

do $$
begin
  raise notice '20260706130000 audiobook catalog upgrade is superseded by production schema repair.';
end $$;
