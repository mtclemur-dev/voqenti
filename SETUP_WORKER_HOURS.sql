-- Ore lucrate de coleg: isi pot pune inceput/sfarsit pe lucrarea lor.
-- Nu schimba ora din planul admin. Ruleaza in Supabase SQL Editor.

ALTER TABLE public.work_job_assignees
  ADD COLUMN IF NOT EXISTS actual_start text,
  ADD COLUMN IF NOT EXISTS actual_end text;

NOTIFY pgrst, 'reload schema';
