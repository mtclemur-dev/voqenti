-- Voqenti Fuhrpark
-- Run this in the Supabase SQL editor (same Voqenti project).

CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  plate text NOT NULL,
  name text,
  driver_id uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  home_address text,
  tuv_last date,
  tuv_next date,
  notes text,
  needs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS plate text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS driver_id uuid,
  ADD COLUMN IF NOT EXISTS home_address text,
  ADD COLUMN IF NOT EXISTS tuv_last date,
  ADD COLUMN IF NOT EXISTS tuv_next date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS needs_json jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_vehicles_driver ON public.vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_tuv_next ON public.vehicles(tuv_next);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vehicles select" ON public.vehicles;
DROP POLICY IF EXISTS "Vehicles insert planner" ON public.vehicles;
DROP POLICY IF EXISTS "Vehicles update planner" ON public.vehicles;
DROP POLICY IF EXISTS "Vehicles delete planner" ON public.vehicles;

CREATE POLICY "Vehicles select"
  ON public.vehicles
  FOR SELECT
  TO authenticated
  USING (
    public.is_work_planner()
    OR driver_id = public.current_worker_id()
  );

CREATE POLICY "Vehicles insert planner"
  ON public.vehicles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_work_planner());

CREATE POLICY "Vehicles update planner"
  ON public.vehicles
  FOR UPDATE
  TO authenticated
  USING (public.is_work_planner())
  WITH CHECK (public.is_work_planner());

CREATE POLICY "Vehicles delete planner"
  ON public.vehicles
  FOR DELETE
  TO authenticated
  USING (public.is_work_planner());
