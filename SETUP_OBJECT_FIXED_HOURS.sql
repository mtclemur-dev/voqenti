-- Durata fixa pe obiect, inclusiv pe zile. Ruleaza in Supabase SQL Editor.

ALTER TABLE public.objects
  ADD COLUMN IF NOT EXISTS fixed_hours numeric;

ALTER TABLE public.objects
  ADD COLUMN IF NOT EXISTS fixed_hours_json jsonb;

NOTIFY pgrst, 'reload schema';
