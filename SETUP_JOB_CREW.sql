-- Pe o lucrare comuna, lucratorul vede doar cu cine lucreaza (nume).
-- Nu poate citi programul, locul sau orele colegilor pe alte zile.
-- Orele le modifica doar pe randul lui.
-- Ruleaza in Supabase SQL Editor (acelasi proiect Voqenti). Poti rula de mai multe ori.

ALTER TABLE public.work_job_assignees
  ADD COLUMN IF NOT EXISTS hours_changed_by uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hours_changed_by_name text,
  ADD COLUMN IF NOT EXISTS hours_changed_at timestamptz;

ALTER TABLE public.work_jobs
  ADD COLUMN IF NOT EXISTS crew_names text[];

CREATE OR REPLACE FUNCTION public.refresh_job_crew_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid;
BEGIN
  target := COALESCE(NEW.job_id, OLD.job_id);
  UPDATE public.work_jobs
  SET crew_names = ARRAY(
        SELECT w.name
        FROM public.work_job_assignees a
        JOIN public.workers w ON w.id = a.worker_id
        WHERE a.job_id = target
          AND a.status IN ('assigned', 'approved', 'pending')
        ORDER BY w.name
      )
  WHERE id = target;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_job_crew_names ON public.work_job_assignees;
CREATE TRIGGER trg_refresh_job_crew_names
AFTER INSERT OR UPDATE OF status, worker_id, job_id OR DELETE ON public.work_job_assignees
FOR EACH ROW
EXECUTE PROCEDURE public.refresh_job_crew_names();

CREATE OR REPLACE FUNCTION public.list_job_crew_names(p_job_ids uuid[])
RETURNS TABLE(job_id uuid, worker_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.job_id, w.name
  FROM public.work_job_assignees a
  JOIN public.workers w ON w.id = a.worker_id
  WHERE a.job_id = ANY (p_job_ids)
    AND a.status IN ('assigned', 'approved', 'pending')
    AND w.name IS NOT NULL
    AND btrim(w.name) <> ''
    AND (
      public.is_work_planner()
      OR EXISTS (
        SELECT 1
        FROM public.work_jobs
        WHERE work_jobs.id = a.job_id
          AND work_jobs.kind = 'open_post'
          AND work_jobs.status = 'active'
      )
      OR EXISTS (
        SELECT 1
        FROM public.work_job_assignees mine
        WHERE mine.job_id = a.job_id
          AND mine.worker_id = public.current_worker_id()
          AND mine.status IN ('assigned', 'approved', 'pending', 'declined')
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.guard_work_assignee_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changer_id uuid;
  changer_name text;
BEGIN
  IF public.is_work_planner() THEN
    RETURN NEW;
  END IF;
  IF NEW.worker_id IS DISTINCT FROM OLD.worker_id
     OR NEW.job_id IS DISTINCT FROM OLD.job_id THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF OLD.worker_id IS DISTINCT FROM public.current_worker_id() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.work_jobs
    WHERE work_jobs.id = NEW.job_id
      AND work_jobs.kind = 'open_post'
      AND work_jobs.status = 'active'
  ) AND NEW.status IN ('assigned', 'pending', 'declined', 'thinking') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'declined' THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF OLD.status NOT IN ('assigned', 'approved') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF NEW.actual_start IS DISTINCT FROM OLD.actual_start
     OR NEW.actual_end IS DISTINCT FROM OLD.actual_end THEN
    changer_id := public.current_worker_id();
    IF changer_id IS NOT NULL THEN
      SELECT workers.name INTO changer_name
      FROM public.workers
      WHERE workers.id = changer_id;
    END IF;
    NEW.hours_changed_by := changer_id;
    NEW.hours_changed_by_name := changer_name;
    NEW.hours_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_work_assignee_update ON public.work_job_assignees;
CREATE TRIGGER trg_guard_work_assignee_update
BEFORE UPDATE ON public.work_job_assignees
FOR EACH ROW
EXECUTE PROCEDURE public.guard_work_assignee_update();

DROP POLICY IF EXISTS "Work assignees select" ON public.work_job_assignees;
CREATE POLICY "Work assignees select"
  ON public.work_job_assignees
  FOR SELECT
  TO authenticated
  USING (
    public.is_work_planner()
    OR worker_id = public.current_worker_id()
  );

DROP POLICY IF EXISTS "Work assignees update crew" ON public.work_job_assignees;
DROP POLICY IF EXISTS "Work assignees update self" ON public.work_job_assignees;
CREATE POLICY "Work assignees update self"
  ON public.work_job_assignees
  FOR UPDATE
  TO authenticated
  USING (worker_id = public.current_worker_id())
  WITH CHECK (worker_id = public.current_worker_id());

UPDATE public.work_jobs j
SET crew_names = ARRAY(
  SELECT w.name
  FROM public.work_job_assignees a
  JOIN public.workers w ON w.id = a.worker_id
  WHERE a.job_id = j.id
    AND a.status IN ('assigned', 'approved')
  ORDER BY w.name
);

DROP FUNCTION IF EXISTS public.list_job_crew(uuid[]);
DROP FUNCTION IF EXISTS public.worker_shares_job(uuid);

GRANT EXECUTE ON FUNCTION public.list_job_crew_names(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
