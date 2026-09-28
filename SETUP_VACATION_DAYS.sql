-- Zile de concediu pe an, per lucrator. Ruleaza in Supabase SQL Editor.

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS vacation_days integer DEFAULT 24;

UPDATE public.workers
SET vacation_days = 24
WHERE vacation_days IS NULL OR vacation_days < 1;

NOTIFY pgrst, 'reload schema';
