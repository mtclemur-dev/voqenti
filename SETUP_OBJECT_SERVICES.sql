-- Subcategorii de lucru pe obiect (Unterhalt, Glas, Sonderreinigung…).
-- Ruleaza in Supabase SQL Editor.

ALTER TABLE public.objects
  ADD COLUMN IF NOT EXISTS services_json jsonb;

ALTER TABLE public.work_jobs
  ADD COLUMN IF NOT EXISTS service_id text;

ALTER TABLE public.work_jobs
  ADD COLUMN IF NOT EXISTS service_name text;

NOTIFY pgrst, 'reload schema';
