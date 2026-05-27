-- Add German translation columns for office/admin view
-- Run this in Supabase SQL Editor

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS message_de text,
  ADD COLUMN IF NOT EXISTS source_language text,
  ADD COLUMN IF NOT EXISTS translated_at timestamptz;

ALTER TABLE public.tagesbericht
  ADD COLUMN IF NOT EXISTS task_de text,
  ADD COLUMN IF NOT EXISTS damage_description_de text,
  ADD COLUMN IF NOT EXISTS source_language text,
  ADD COLUMN IF NOT EXISTS translated_at timestamptz;

NOTIFY pgrst, 'reload schema';
