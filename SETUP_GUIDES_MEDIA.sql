-- Linkuri pentru poze/video in Arbeitsweise (fara fisiere in Supabase).
-- Ruleaza in SQL Editor daca ai rulat deja SETUP_COMPANY_BOARD.sql.

ALTER TABLE public.company_notices
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS video_url text;

NOTIFY pgrst, 'reload schema';
