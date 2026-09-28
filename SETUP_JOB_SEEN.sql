-- Cand lucratorul deschide lucrarea (seen_at), instiintarile pentru acea lucrare se opresc.
-- Ruleaza in Supabase SQL Editor. Nu inlocuieste push-ul de sistem (FCM) daca aplicatia e inchisa.

CREATE OR REPLACE FUNCTION public.mark_job_notifications_read()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.seen_at IS NOT NULL AND (OLD.seen_at IS NULL OR OLD.seen_at IS DISTINCT FROM NEW.seen_at) THEN
    UPDATE public.work_notifications
    SET read_at = COALESCE(read_at, now())
    WHERE worker_id = NEW.worker_id
      AND job_id = NEW.job_id
      AND read_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_job_notifications_read ON public.work_job_assignees;
CREATE TRIGGER trg_mark_job_notifications_read
AFTER UPDATE OF seen_at ON public.work_job_assignees
FOR EACH ROW
EXECUTE PROCEDURE public.mark_job_notifications_read();

GRANT EXECUTE ON FUNCTION public.mark_job_notifications_read() TO authenticated;

NOTIFY pgrst, 'reload schema';
