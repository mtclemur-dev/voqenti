-- Lucratorii pot raspunde la anunturile de ajutor: merg / nu merg / ma mai gandesc.
-- Ruleaza in Supabase SQL Editor dupa SETUP_WORK_PLAN.sql.

DROP POLICY IF EXISTS "Work assignees insert" ON public.work_job_assignees;
CREATE POLICY "Work assignees insert"
  ON public.work_job_assignees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_work_planner()
    OR (
      worker_id = public.current_worker_id()
      AND status IN ('pending', 'declined', 'thinking')
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
    AND status IN ('pending', 'declined', 'thinking')
  );

NOTIFY pgrst, 'reload schema';
