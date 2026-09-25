-- Durata fixa pe obiect. Ruleaza in Supabase SQL Editor.

ALTER TABLE public.objects
  ADD COLUMN IF NOT EXISTS fixed_hours numeric;

NOTIFY pgrst, 'reload schema';
