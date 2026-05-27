-- COPIAZĂ EXACT ACESTE COMENZI ÎN SUPABASE SQL EDITOR
-- 1. Click "SQL Editor" în Supabase Dashboard
-- 2. Click "New Query"
-- 3. Copiază-paste toate comenzile de mai jos
-- 4. Click "RUN"

-- ========================================
-- 1. ADAUGĂ COLOANA user_id
-- ========================================
ALTER TABLE public.pontaj 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS current_mode text DEFAULT 'work',
ADD COLUMN IF NOT EXISTS mode_changed_at timestamptz,
ADD COLUMN IF NOT EXISTS pause_minutes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS auto_pause_minutes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fahrzeit_minutes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_minutes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS effective_minutes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS report_id bigint;

ALTER TABLE public.pontaj
ALTER COLUMN user_id SET DEFAULT auth.uid();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pontaj' AND column_name = 'pause_seconds') THEN
    EXECUTE 'UPDATE public.pontaj SET pause_minutes = COALESCE(NULLIF(pause_minutes, 0), ROUND(pause_seconds / 60.0)::integer)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pontaj' AND column_name = 'auto_pause_seconds') THEN
    EXECUTE 'UPDATE public.pontaj SET auto_pause_minutes = COALESCE(NULLIF(auto_pause_minutes, 0), ROUND(auto_pause_seconds / 60.0)::integer)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pontaj' AND column_name = 'fahrzeit_seconds') THEN
    EXECUTE 'UPDATE public.pontaj SET fahrzeit_minutes = COALESCE(NULLIF(fahrzeit_minutes, 0), ROUND(fahrzeit_seconds / 60.0)::integer)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pontaj' AND column_name = 'total_seconds') THEN
    EXECUTE 'UPDATE public.pontaj SET total_minutes = COALESCE(NULLIF(total_minutes, 0), ROUND(total_seconds / 60.0)::integer)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pontaj' AND column_name = 'effective_seconds') THEN
    EXECUTE 'UPDATE public.pontaj SET effective_minutes = COALESCE(NULLIF(effective_minutes, 0), ROUND(effective_seconds / 60.0)::integer)';
  END IF;
END $$;

ALTER TABLE public.pontaj
DROP COLUMN IF EXISTS pause_seconds,
DROP COLUMN IF EXISTS auto_pause_seconds,
DROP COLUMN IF EXISTS fahrzeit_seconds,
DROP COLUMN IF EXISTS total_seconds,
DROP COLUMN IF EXISTS effective_seconds;

CREATE INDEX IF NOT EXISTS idx_pontaj_user_id ON public.pontaj(user_id);
CREATE INDEX IF NOT EXISTS idx_pontaj_report_id ON public.pontaj(report_id);

-- ========================================
-- 2. ACTIVARE ROW LEVEL SECURITY
-- ========================================
ALTER TABLE public.pontaj ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 3. ADAUGĂ POLITICI RLS
-- ========================================

-- Politică SELECT: fiecare user vede doar propriile înregistrări
DROP POLICY IF EXISTS "Select own records" ON public.pontaj;
DROP POLICY IF EXISTS "Insert own records" ON public.pontaj;
DROP POLICY IF EXISTS "Update own records" ON public.pontaj;
DROP POLICY IF EXISTS "Delete own records" ON public.pontaj;

CREATE POLICY "Select own records" ON public.pontaj 
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Politică INSERT: fiecare user poate insera doar cu propriul user_id
CREATE POLICY "Insert own records" ON public.pontaj 
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- Politică UPDATE: fiecare user poate modifica doar propriile înregistrări
CREATE POLICY "Update own records" ON public.pontaj 
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- Politică DELETE: fiecare user poate șterge doar propriile înregistrări
CREATE POLICY "Delete own records" ON public.pontaj 
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Robust start helper: inserts the row inside the database with user_id = auth.uid().
-- This avoids client-side RLS insert problems while still requiring an authenticated user.
DROP FUNCTION IF EXISTS public.start_work_session(text, timestamptz, bigint);
DROP FUNCTION IF EXISTS public.start_work_session(text, bigint, timestamptz);

CREATE OR REPLACE FUNCTION public.start_work_session(
  p_name_nutzer text,
  p_report_id bigint,
  p_start_time timestamptz
)
RETURNS public.pontaj
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_row public.pontaj;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;

  SELECT *
  INTO new_row
  FROM public.pontaj
  WHERE user_id = auth.uid()
    AND ("Uhrzeit_Start" AT TIME ZONE 'Europe/Berlin')::date = (p_start_time AT TIME ZONE 'Europe/Berlin')::date
  ORDER BY CASE WHEN status = 'activ' THEN 0 ELSE 1 END, "Uhrzeit_Start" ASC
  LIMIT 1;

  IF FOUND THEN
    IF new_row.status = 'activ' THEN
      RETURN new_row;
    END IF;

    UPDATE public.pontaj
    SET
      status = 'activ',
      current_mode = 'work',
      "Uhrzeit_Start" = p_start_time,
      mode_changed_at = p_start_time,
      "Uhrzeit_Ende" = NULL,
      report_id = COALESCE(p_report_id, report_id)
    WHERE id = new_row.id
    RETURNING * INTO new_row;

    RETURN new_row;
  END IF;

  INSERT INTO public.pontaj (
    user_id,
    name_nutzer,
    "Uhrzeit_Start",
    status,
    current_mode,
    mode_changed_at,
    pause_minutes,
    auto_pause_minutes,
    fahrzeit_minutes,
    total_minutes,
    effective_minutes,
    report_id
  )
  VALUES (
    auth.uid(),
    COALESCE(p_name_nutzer, 'Benutzer'),
    p_start_time,
    'activ',
    'work',
    p_start_time,
    0,
    0,
    0,
    0,
    0,
    p_report_id
  )
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION public.start_work_session(text, bigint, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_work_session(text, bigint, timestamptz) TO authenticated;

-- Force Supabase/PostgREST to reload the function list immediately.
NOTIFY pgrst, 'reload schema';

-- ========================================
-- GATA! 
-- ========================================
-- După ce rulezi aceste comenzi, aplicația va funcționa corect.
