-- Cleanup old internal Materialien / Chemie / Geraete usage module.
-- Run this only after SETUP_INVENTORY_MATERIALBEDARF.sql is installed.
-- The new workflow uses material_items, material_requests, material_request_items,
-- inventory_items and inventory_checkouts.

DROP TABLE IF EXISTS public.material_usage_entries CASCADE;
DROP TABLE IF EXISTS public.report_checklist_items CASCADE;

NOTIFY pgrst, 'reload schema';
