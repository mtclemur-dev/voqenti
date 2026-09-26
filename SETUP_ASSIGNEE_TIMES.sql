-- Ore diferite pe fiecare lucrator in aceeasi lucrare.
-- Ruleaza in Supabase SQL Editor. Dupa asta, 10-12 pe un obiect blocheaza doar acele ore.

ALTER TABLE public.work_job_assignees
  ADD COLUMN IF NOT EXISTS planned_start text,
  ADD COLUMN IF NOT EXISTS planned_end text;

NOTIFY pgrst, 'reload schema';
