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
        status IN ('declined', 'thinking', 'pending')
        OR EXISTS (
          SELECT 1
          FROM public.work_jobs
          WHERE work_jobs.id = job_id
            AND COALESCE(work_jobs.filled_count, 0) < GREATEST(COALESCE(work_jobs.needed_count, 1), 1)
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

CREATE OR REPLACE FUNCTION public.current_worker_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workers.id
  FROM public.workers
  WHERE workers.active IS DISTINCT FROM false
    AND btrim(COALESCE(workers.email, '')) <> ''
    AND lower(btrim(workers.email)) = lower(btrim(COALESCE(auth.jwt() ->> 'email', '')))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_open_post(
  p_job_id uuid,
  p_choice text,
  p_start text DEFAULT NULL,
  p_end text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid;
  job public.work_jobs%ROWTYPE;
  new_status text;
  reason text;
  start_clock text;
  end_clock text;
  existing_id uuid;
BEGIN
  me := public.current_worker_id();
  IF me IS NULL OR p_job_id IS NULL OR p_choice IS NULL THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF p_choice = 'go' THEN
    new_status := 'assigned';
  ELSIF p_choice = 'no' THEN
    new_status := 'declined';
    reason := 'openPostNo';
  ELSE
    new_status := 'thinking';
  END IF;

  SELECT * INTO job
  FROM public.work_jobs
  WHERE id = p_job_id
    AND kind = 'open_post'
    AND status = 'active';

  IF job.id IS NULL THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF new_status = 'assigned'
     AND COALESCE(job.filled_count, 0) >= GREATEST(COALESCE(job.needed_count, 1), 1) THEN
    new_status := 'pending';
  END IF;

  IF new_status IN ('assigned', 'pending') THEN
    start_clock := NULLIF(left(btrim(COALESCE(p_start, job.start_time::text, '')), 5), '');
    end_clock := NULLIF(left(btrim(COALESCE(p_end, job.end_time::text, '')), 5), '');
  END IF;

  SELECT id INTO existing_id
  FROM public.work_job_assignees
  WHERE job_id = job.id AND worker_id = me
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.work_job_assignees
    SET
      status = new_status,
      decline_reason = reason,
      planned_start = COALESCE(start_clock, planned_start),
      planned_end = COALESCE(end_clock, planned_end),
      updated_at = now()
    WHERE id = existing_id;
  ELSE
    INSERT INTO public.work_job_assignees (
      job_id, worker_id, status, decline_reason, planned_start, planned_end, updated_at
    ) VALUES (
      job.id, me, new_status, reason, start_clock, end_clock, now()
    );
  END IF;

  RETURN new_status;
EXCEPTION
  WHEN undefined_column THEN
    IF existing_id IS NOT NULL THEN
      UPDATE public.work_job_assignees
      SET status = new_status, decline_reason = reason, updated_at = now()
      WHERE id = existing_id;
    ELSE
      INSERT INTO public.work_job_assignees (job_id, worker_id, status, decline_reason, updated_at)
      VALUES (job.id, me, new_status, reason, now());
    END IF;
    RETURN new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_worker_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_open_post(uuid, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
