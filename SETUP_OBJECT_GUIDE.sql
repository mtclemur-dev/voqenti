-- Leistungsverzeichnis und Tagesturnus pro Objekt.
-- Ruleaza in Supabase SQL Editor.

ALTER TABLE public.objects
  ADD COLUMN IF NOT EXISTS leistung_text text;

ALTER TABLE public.objects
  ADD COLUMN IF NOT EXISTS leistung_image_url text;

ALTER TABLE public.objects
  ADD COLUMN IF NOT EXISTS turnus_json jsonb;

NOTIFY pgrst, 'reload schema';
