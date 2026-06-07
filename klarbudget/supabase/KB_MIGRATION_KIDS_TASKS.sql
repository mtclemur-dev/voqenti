-- Migration: Adaugă sarcini (Aufgaben) și cereri pentru copii
-- Rulează acest script în Supabase SQL Editor.

-- 1. Tabel pentru Misiuni / Sarcini Copii (Tasks)
CREATE TABLE IF NOT EXISTS public.kb_kid_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id uuid REFERENCES public.family_wallets(id) ON DELETE CASCADE, -- null înseamnă "Ambii" / "Toți copiii"
  title text NOT NULL,
  description text,
  icon text DEFAULT '⭐',
  category text DEFAULT 'Casă', -- Casă, Școală, Igienă, Comportament, Sport, Ajutor familie, Extra
  coins integer NOT NULL DEFAULT 1 CHECK (coins >= 0),
  frequency text DEFAULT 'flexible', -- once, daily, weekly, flexible
  requires_approval boolean DEFAULT true,
  active boolean DEFAULT true,
  streak_target_days integer DEFAULT 5,
  streak_bonus_coins integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Tabel pentru Cereri finalizare sarcini / Cereri recompense (Requests)
CREATE TABLE IF NOT EXISTS public.kb_kid_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES public.family_wallets(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('task_completion', 'reward_redeem')),
  task_id uuid REFERENCES public.kb_kid_tasks(id) ON DELETE CASCADE,
  reward_id uuid REFERENCES public.family_rewards_shop(id) ON DELETE CASCADE,
  coins integer NOT NULL DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Activează Row Level Security (RLS)
ALTER TABLE public.kb_kid_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_kid_requests ENABLE ROW LEVEL SECURITY;

-- Politici RLS
DROP POLICY IF EXISTS "kb_kid_tasks_all_own" ON public.kb_kid_tasks;
CREATE POLICY "kb_kid_tasks_all_own" ON public.kb_kid_tasks
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "kb_kid_requests_all_own" ON public.kb_kid_requests;
CREATE POLICY "kb_kid_requests_all_own" ON public.kb_kid_requests
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Triggere updated_at
DROP TRIGGER IF EXISTS kb_kid_tasks_touch_updated_at ON public.kb_kid_tasks;
CREATE TRIGGER kb_kid_tasks_touch_updated_at BEFORE UPDATE ON public.kb_kid_tasks
FOR EACH ROW EXECUTE FUNCTION public.kb_touch_updated_at();

DROP TRIGGER IF EXISTS kb_kid_requests_touch_updated_at ON public.kb_kid_requests;
CREATE TRIGGER kb_kid_requests_touch_updated_at BEFORE UPDATE ON public.kb_kid_requests
FOR EACH ROW EXECUTE FUNCTION public.kb_touch_updated_at();

-- Indecși de performanță
CREATE INDEX IF NOT EXISTS kb_kid_tasks_user_active_idx ON public.kb_kid_tasks(user_id, active);
CREATE INDEX IF NOT EXISTS kb_kid_requests_user_status_idx ON public.kb_kid_requests(user_id, status);

-- 3. Actualizare tabel recompense existent
ALTER TABLE public.family_rewards_shop
ADD COLUMN IF NOT EXISTS child_id uuid REFERENCES public.family_wallets(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

