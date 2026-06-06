-- KlarBudget migration: Obiective de Economisire și Citiri Utilități
-- Rulează acest script în Supabase SQL Editor.

-- 1. Tabel pentru Obiective de Economisire (Savings Goals)
CREATE TABLE IF NOT EXISTS public.kb_savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT null REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT null,
  target_amount numeric(12,2) NOT null CHECK (target_amount > 0),
  current_amount numeric(12,2) NOT null DEFAULT 0 CHECK (current_amount >= 0),
  target_date date,
  notes text,
  created_at timestamptz NOT null DEFAULT now(),
  updated_at timestamptz NOT null DEFAULT now()
);

-- 2. Tabel pentru Citiri Utilități (Utility Readings)
CREATE TABLE IF NOT EXISTS public.kb_utility_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT null REFERENCES auth.users(id) ON DELETE CASCADE,
  meter_type text NOT null CHECK (meter_type IN ('electricity', 'gas', 'water')),
  reading_date date NOT null DEFAULT current_date,
  value numeric(12,2) NOT null CHECK (value >= 0),
  cost_estimate numeric(12,2),
  notes text,
  created_at timestamptz NOT null DEFAULT now()
);

-- Activare Row Level Security
ALTER TABLE public.kb_savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_utility_readings ENABLE ROW LEVEL SECURITY;

-- Politici RLS pentru utilizatori
DROP POLICY IF EXISTS "kb_savings_goals_all_own" ON public.kb_savings_goals;
CREATE POLICY "kb_savings_goals_all_own" ON public.kb_savings_goals
FOR all USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "kb_utility_readings_all_own" ON public.kb_utility_readings;
CREATE POLICY "kb_utility_readings_all_own" ON public.kb_utility_readings
FOR all USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Triggere pentru updated_at
DROP TRIGGER IF EXISTS kb_savings_goals_touch_updated_at ON public.kb_savings_goals;
CREATE TRIGGER kb_savings_goals_touch_updated_at BEFORE UPDATE ON public.kb_savings_goals
FOR EACH ROW EXECUTE FUNCTION public.kb_touch_updated_at();

-- Indecși de performanță
CREATE INDEX IF NOT EXISTS kb_savings_goals_user_idx ON public.kb_savings_goals(user_id);
CREATE INDEX IF NOT EXISTS kb_utility_readings_user_idx ON public.kb_utility_readings(user_id, meter_type, reading_date DESC);

-- Setari pentru tarife si avans lunar utilitati.
ALTER TABLE public.kb_settings
ADD COLUMN IF NOT EXISTS utility_price_electricity numeric(12,4) NOT null DEFAULT 0.35 CHECK (utility_price_electricity >= 0);

ALTER TABLE public.kb_settings
ADD COLUMN IF NOT EXISTS utility_price_gas numeric(12,4) NOT null DEFAULT 1.20 CHECK (utility_price_gas >= 0);

ALTER TABLE public.kb_settings
ADD COLUMN IF NOT EXISTS utility_price_water numeric(12,4) NOT null DEFAULT 4.50 CHECK (utility_price_water >= 0);

ALTER TABLE public.kb_settings
ADD COLUMN IF NOT EXISTS utility_monthly_payment_electricity numeric(12,2) NOT null DEFAULT 0 CHECK (utility_monthly_payment_electricity >= 0);

ALTER TABLE public.kb_settings
ADD COLUMN IF NOT EXISTS utility_monthly_payment_gas numeric(12,2) NOT null DEFAULT 0 CHECK (utility_monthly_payment_gas >= 0);

ALTER TABLE public.kb_settings
ADD COLUMN IF NOT EXISTS utility_monthly_payment_water numeric(12,2) NOT null DEFAULT 0 CHECK (utility_monthly_payment_water >= 0);
