-- Migration: Adaugă coloane pentru note în setările utilităților
-- Rulează acest script în Supabase SQL Editor.

ALTER TABLE public.kb_settings
ADD COLUMN IF NOT EXISTS utility_notes_electricity text,
ADD COLUMN IF NOT EXISTS utility_notes_gas text,
ADD COLUMN IF NOT EXISTS utility_notes_water text;
