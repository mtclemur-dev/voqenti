-- KlarBudget migration: Kids Zone (Misiuni & Recompense Copii)
-- Rulează acest script în Supabase SQL Editor.

-- 1. Tabel pentru Profiluri Copii (Kids Profiles)
CREATE TABLE IF NOT EXISTS public.kb_kids_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT null REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT null,
  age integer CHECK (age >= 0),
  birthday date,
  stars_balance integer NOT null DEFAULT 0 CHECK (stars_balance >= 0),
  created_at timestamptz NOT null DEFAULT now(),
  updated_at timestamptz NOT null DEFAULT now()
);

-- 2. Tabel pentru Istoric Activități Copii (Kids History)
CREATE TABLE IF NOT EXISTS public.kb_kids_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT null REFERENCES auth.users(id) ON DELETE CASCADE,
  kid_name text NOT null,
  action_type text NOT null CHECK (action_type IN ('earn', 'spend')),
  title text NOT null,
  stars integer NOT null CHECK (stars > 0),
  created_at timestamptz NOT null DEFAULT now()
);

-- Activare Row Level Security
ALTER TABLE public.kb_kids_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_kids_history ENABLE ROW LEVEL SECURITY;

-- Politici RLS pentru utilizatori
DROP POLICY IF EXISTS "kb_kids_profiles_all_own" ON public.kb_kids_profiles;
CREATE POLICY "kb_kids_profiles_all_own" ON public.kb_kids_profiles
FOR all USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "kb_kids_history_all_own" ON public.kb_kids_history;
CREATE POLICY "kb_kids_history_all_own" ON public.kb_kids_history
FOR all USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Triggere pentru updated_at
DROP TRIGGER IF EXISTS kb_kids_profiles_touch_updated_at ON public.kb_kids_profiles;
CREATE TRIGGER kb_kids_profiles_touch_updated_at BEFORE UPDATE ON public.kb_kids_profiles
FOR EACH ROW EXECUTE FUNCTION public.kb_touch_updated_at();

-- Indecși de performanță
CREATE INDEX IF NOT EXISTS kb_kids_profiles_user_idx ON public.kb_kids_profiles(user_id);
CREATE INDEX IF NOT EXISTS kb_kids_history_user_idx ON public.kb_kids_history(user_id, created_at DESC);
