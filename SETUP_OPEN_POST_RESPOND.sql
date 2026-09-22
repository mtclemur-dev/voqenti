-- Lucratorii se inscriu la ajutor direct in plan: assigned + orele anuntului.
-- Ruleaza in Supabase SQL Editor dupa SETUP_WORK_PLAN.sql.

CREATE OR REPLACE FUNCTION public.guard_work_assignee_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changer_id uuid;
  changer_name text;
  open_post boolean;
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

  SELECT EXISTS (
    SELECT 1
    FROM public.work_jobs
    WHERE work_jobs.id = NEW.job_id
      AND work_jobs.kind = 'open_post'
      AND work_jobs.status = 'active'
  ) INTO open_post;

  IF open_post AND NEW.status IN ('assigned', 'pending', 'declined', 'thinking') THEN
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

DROP POLICY IF EXISTS "Work assignees insert" ON public.work_job_assignees;
CREATE POLICY "Work assignees insert"
  ON public.work_job_assignees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_work_planner()
    OR (
      worker_id = public.current_worker_id()
      AND status IN ('assigned', 'pending', 'declined', 'thinking')
      AND EXISTS (
        SELECT 1
        FROM public.work_jobs
        WHERE work_jobs.id = job_id
          AND work_jobs.kind = 'open_post'
          AND work_jobs.status = 'active'
      )
      AND (
        status IN ('declined', 'thinking')
        OR EXISTS (
          SELECT 1
          FROM public.work_jobs
          WHERE work_jobs.id = job_id
            AND work_jobs.filled_count < work_jobs.needed_count
        )
      )
    )
  );

DROP POLICY IF EXISTS "Work assignees update own open post" ON public.work_job_assignees;
CREATE POLICY "Work assignees update own open post"
  ON public.work_job_assignees
  FOR UPDATE
  TO authenticated
  USING (
    worker_id = public.current_worker_id()
    AND EXISTS (
      SELECT 1
      FROM public.work_jobs
      WHERE work_jobs.id = job_id
        AND work_jobs.kind = 'open_post'
        AND work_jobs.status = 'active'
    )
  )
  WITH CHECK (
    worker_id = public.current_worker_id()
    AND status IN ('assigned', 'pending', 'declined', 'thinking')
  );

NOTIFY pgrst, 'reload schema';
