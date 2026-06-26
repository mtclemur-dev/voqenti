-- KlarBudget: reset contor utilități (contor nou / înlocuit)
-- Rulează în Supabase SQL Editor după KB_MIGRATION_SAVINGS_AND_UTILITIES.sql

ALTER TABLE public.kb_utility_readings
ADD COLUMN IF NOT EXISTS is_meter_reset boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.kb_utility_readings.is_meter_reset IS
  'True = punct de start pentru contor nou; consumul nu se calculează față de citirea anterioară.';
