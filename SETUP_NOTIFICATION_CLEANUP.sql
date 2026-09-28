-- Sterge notificarile cand o lucrare e anulata sau un coleg e scos de pe lucrare.
-- Ruleaza in Supabase SQL Editor, dupa SETUP_IMPROVEMENTS.sql.

CREATE OR REPLACE FUNCTION public.cleanup_cancelled_job_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'canceled') AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM public.work_notifications
    WHERE job_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_cancelled_job_notifications ON public.work_jobs;
CREATE TRIGGER trg_cleanup_cancelled_job_notifications
AFTER UPDATE OF status ON public.work_jobs
FOR EACH ROW
EXECUTE PROCEDURE public.cleanup_cancelled_job_notifications();

CREATE OR REPLACE FUNCTION public.cleanup_removed_assignee_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.work_notifications
  WHERE job_id = OLD.job_id
    AND worker_id = OLD.worker_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_removed_assignee_notifications ON public.work_job_assignees;
CREATE TRIGGER trg_cleanup_removed_assignee_notifications
AFTER DELETE ON public.work_job_assignees
FOR EACH ROW
EXECUTE PROCEDURE public.cleanup_removed_assignee_notifications();

DROP POLICY IF EXISTS "Notifications delete planner" ON public.work_notifications;
CREATE POLICY "Notifications delete planner"
  ON public.work_notifications
  FOR DELETE
  TO authenticated
  USING (public.is_work_planner());

GRANT DELETE ON public.work_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_cancelled_job_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_removed_assignee_notifications() TO authenticated;

NOTIFY pgrst, 'reload schema';
