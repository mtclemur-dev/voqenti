-- FIX URGENT: Adaugă coloana priority la kb_daily_entries
-- Eroare: "Could not find the 'priority' column of 'kb_daily_entries' in the schema cache"
-- Rulează în Supabase SQL Editor → RUN

ALTER TABLE public.kb_daily_entries
ADD COLUMN IF NOT EXISTS priority text;
