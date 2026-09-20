-- Anunturi interne si metode de lucru
-- Ruleaza in Supabase SQL Editor, in acelasi proiect Voqenti.
-- Daca nu ai rulat inca SETUP_WORK_PLAN.sql, ruleaza-l primul.

CREATE OR REPLACE FUNCTION public.is_work_planner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lower(auth.jwt() ->> 'email') = 'mtclemur@gmail.com'
    OR EXISTS (
      SELECT 1
      FROM public.workers
      WHERE lower(workers.email) = lower(auth.jwt() ->> 'email')
        AND lower(COALESCE(workers.role, '')) = 'admin'
    );
$$;

CREATE TABLE IF NOT EXISTS public.company_notices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  board text NOT NULL,
  topic text,
  title text NOT NULL,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  author_name text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.company_notices
  ADD COLUMN IF NOT EXISTS board text,
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS pinned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS author_name text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_company_notices_board ON public.company_notices(board, created_at DESC);

CREATE TABLE IF NOT EXISTS public.company_notice_replies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  notice_id uuid NOT NULL REFERENCES public.company_notices(id) ON DELETE CASCADE,
  body text NOT NULL,
  author_name text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.company_notice_replies
  ADD COLUMN IF NOT EXISTS notice_id uuid,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS author_name text,
  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_company_notice_replies_notice ON public.company_notice_replies(notice_id, created_at);

ALTER TABLE public.company_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_notice_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company notices select" ON public.company_notices;
DROP POLICY IF EXISTS "Company notices insert" ON public.company_notices;
DROP POLICY IF EXISTS "Company notices update" ON public.company_notices;
DROP POLICY IF EXISTS "Company notices delete" ON public.company_notices;
DROP POLICY IF EXISTS "Company replies select" ON public.company_notice_replies;
DROP POLICY IF EXISTS "Company replies insert" ON public.company_notice_replies;
DROP POLICY IF EXISTS "Company replies delete" ON public.company_notice_replies;

CREATE POLICY "Company notices select"
  ON public.company_notices
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Company notices insert"
  ON public.company_notices
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_work_planner());

CREATE POLICY "Company notices update"
  ON public.company_notices
  FOR UPDATE
  TO authenticated
  USING (public.is_work_planner())
  WITH CHECK (public.is_work_planner());

CREATE POLICY "Company notices delete"
  ON public.company_notices
  FOR DELETE
  TO authenticated
  USING (public.is_work_planner());

CREATE POLICY "Company replies select"
  ON public.company_notice_replies
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Company replies insert"
  ON public.company_notice_replies
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Company replies delete"
  ON public.company_notice_replies
  FOR DELETE
  TO authenticated
  USING (public.is_work_planner() OR created_by = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_notices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_notice_replies TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'company_notices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.company_notices;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'company_notice_replies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.company_notice_replies;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
