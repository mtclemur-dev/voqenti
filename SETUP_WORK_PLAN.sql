-- Plan de lucru Voqenti
-- Ruleaza in Supabase SQL Editor (acelasi proiect Voqenti, nu un proiect nou).

CREATE TABLE IF NOT EXISTS public.work_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  work_date date NOT NULL,
  start_time text,
  end_time text,
  object_id uuid REFERENCES public.objects(id) ON DELETE SET NULL,
  object_name text,
  location_text text,
  task_text text,
  bring_text text,
  remember_text text,
  notes_text text,
  kind text NOT NULL DEFAULT 'assigned',
  needed_count integer NOT NULL DEFAULT 1,
  filled_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.work_jobs
  ADD COLUMN IF NOT EXISTS work_date date,
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS end_time text,
  ADD COLUMN IF NOT EXISTS object_id uuid,
  ADD COLUMN IF NOT EXISTS object_name text,
  ADD COLUMN IF NOT EXISTS location_text text,
  ADD COLUMN IF NOT EXISTS task_text text,
  ADD COLUMN IF NOT EXISTS bring_text text,
  ADD COLUMN IF NOT EXISTS remember_text text,
  ADD COLUMN IF NOT EXISTS notes_text text,
  ADD COLUMN IF NOT EXISTS kind text DEFAULT 'assigned',
  ADD COLUMN IF NOT EXISTS needed_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS filled_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.work_job_assignees (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.work_jobs(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'assigned',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.work_job_assignees
  ADD COLUMN IF NOT EXISTS job_id uuid,
  ADD COLUMN IF NOT EXISTS worker_id uuid,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'assigned',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_job_assignees_unique
  ON public.work_job_assignees(job_id, worker_id);
CREATE INDEX IF NOT EXISTS idx_work_jobs_date ON public.work_jobs(work_date);
CREATE INDEX IF NOT EXISTS idx_work_jobs_kind_status ON public.work_jobs(kind, status);
CREATE INDEX IF NOT EXISTS idx_work_job_assignees_worker ON public.work_job_assignees(worker_id);
CREATE INDEX IF NOT EXISTS idx_work_job_assignees_status ON public.work_job_assignees(status);

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

CREATE OR REPLACE FUNCTION public.current_worker_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workers.id
  FROM public.workers
  WHERE lower(workers.email) = lower(auth.jwt() ->> 'email')
    AND workers.active IS DISTINCT FROM false
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.refresh_work_job_filled_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_job uuid;
BEGIN
  target_job := COALESCE(NEW.job_id, OLD.job_id);
  UPDATE public.work_jobs
  SET
    filled_count = (
      SELECT count(*)::integer
      FROM public.work_job_assignees
      WHERE job_id = target_job
        AND status IN ('assigned', 'approved')
    ),
    updated_at = now()
  WHERE id = target_job;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_work_job_filled_count ON public.work_job_assignees;
CREATE TRIGGER trg_work_job_filled_count
AFTER INSERT OR UPDATE OR DELETE ON public.work_job_assignees
FOR EACH ROW
EXECUTE PROCEDURE public.refresh_work_job_filled_count();

ALTER TABLE public.work_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_job_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Work jobs select" ON public.work_jobs;
DROP POLICY IF EXISTS "Work jobs insert planner" ON public.work_jobs;
DROP POLICY IF EXISTS "Work jobs update planner" ON public.work_jobs;
DROP POLICY IF EXISTS "Work jobs delete planner" ON public.work_jobs;
DROP POLICY IF EXISTS "Work assignees select" ON public.work_job_assignees;
DROP POLICY IF EXISTS "Work assignees insert" ON public.work_job_assignees;
DROP POLICY IF EXISTS "Work assignees update planner" ON public.work_job_assignees;
DROP POLICY IF EXISTS "Work assignees delete planner" ON public.work_job_assignees;

CREATE POLICY "Work jobs select"
  ON public.work_jobs
  FOR SELECT
  TO authenticated
  USING (
    public.is_work_planner()
    OR (
      kind = 'open_post'
      AND status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.work_job_assignees
      WHERE work_job_assignees.job_id = work_jobs.id
        AND work_job_assignees.worker_id = public.current_worker_id()
        AND work_job_assignees.status IN ('assigned', 'approved', 'pending')
    )
  );

CREATE POLICY "Work jobs insert planner"
  ON public.work_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_work_planner());

CREATE POLICY "Work jobs update planner"
  ON public.work_jobs
  FOR UPDATE
  TO authenticated
  USING (public.is_work_planner())
  WITH CHECK (public.is_work_planner());

CREATE POLICY "Work jobs delete planner"
  ON public.work_jobs
  FOR DELETE
  TO authenticated
  USING (public.is_work_planner());

CREATE POLICY "Work assignees select"
  ON public.work_job_assignees
  FOR SELECT
  TO authenticated
  USING (
    public.is_work_planner()
    OR worker_id = public.current_worker_id()
  );

CREATE POLICY "Work assignees insert"
  ON public.work_job_assignees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_work_planner()
    OR (
      worker_id = public.current_worker_id()
      AND status = 'pending'
      AND EXISTS (
        SELECT 1
        FROM public.work_jobs
        WHERE work_jobs.id = job_id
          AND work_jobs.kind = 'open_post'
          AND work_jobs.status = 'active'
          AND work_jobs.filled_count < work_jobs.needed_count
      )
    )
  );

CREATE POLICY "Work assignees update planner"
  ON public.work_job_assignees
  FOR UPDATE
  TO authenticated
  USING (public.is_work_planner())
  WITH CHECK (public.is_work_planner());

CREATE POLICY "Work assignees delete planner"
  ON public.work_job_assignees
  FOR DELETE
  TO authenticated
  USING (public.is_work_planner());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_job_assignees TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_work_planner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_worker_id() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'work_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.work_jobs;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'work_job_assignees'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.work_job_assignees;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
