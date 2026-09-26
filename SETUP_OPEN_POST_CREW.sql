-- Pe anunturile de ajutor, toata lumea vede cine s-a inscris (nume).
-- Ruleaza in Supabase SQL Editor dupa SETUP_JOB_CREW.sql.

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

GRANT EXECUTE ON FUNCTION public.list_job_crew_names(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
