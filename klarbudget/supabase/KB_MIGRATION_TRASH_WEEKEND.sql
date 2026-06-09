-- KlarBudget: Migrare coloane Gunoi și Weekend în kb_settings
-- Data: 2026-06-09
--
-- Rulează acest script în Supabase SQL Editor.
-- Nu modifică tabelele existente și este complet sigur de rulat de mai multe ori.

ALTER TABLE public.kb_settings ADD COLUMN IF NOT EXISTS trash_schedule jsonb;
ALTER TABLE public.kb_settings ADD COLUMN IF NOT EXISTS weekend_ideas jsonb;
