-- Nu trimite instiintari de plan catre owner sau persoane din birou (rol admin).
-- Ruleaza in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.notify_work_assignee_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_place text;
  job_when text;
  worker_label text;
BEGIN
  SELECT
    COALESCE(location_text, object_name, ''),
    trim(both ' · ' from concat_ws(' · ', work_date::text, NULLIF(start_time, '')))
  INTO job_place, job_when
  FROM public.work_jobs
  WHERE id = NEW.job_id;

  IF (TG_OP = 'INSERT' AND NEW.status IN ('assigned', 'approved'))
     OR (TG_OP = 'UPDATE' AND NEW.status IN ('assigned', 'approved') AND OLD.status NOT IN ('assigned', 'approved')) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.workers w
      WHERE w.id = NEW.worker_id
        AND (
          lower(COALESCE(w.email, '')) = 'mtclemur@gmail.com'
          OR lower(COALESCE(w.name, '')) LIKE '%plamadeala victor%'
          OR lower(COALESCE(w.role, '')) = 'admin'
        )
    ) THEN
      INSERT INTO public.work_notifications (audience, worker_id, title, body, kind, job_id)
      VALUES ('worker', NEW.worker_id, 'notifyPlan', concat_ws(' · ', job_when, job_place), 'plan', NEW.job_id);
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'declined' AND OLD.status IS DISTINCT FROM 'declined' THEN
    SELECT COALESCE(name, '') INTO worker_label
    FROM public.workers
    WHERE id = NEW.worker_id;

    INSERT INTO public.work_notifications (audience, worker_id, title, body, kind, job_id)
    VALUES (
      'planner',
      NULL,
      'notifyDeclined',
      concat_ws(' · ', worker_label, job_when, job_place, NULLIF(NEW.decline_reason, '')),
      'declined',
      NEW.job_id
    );
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
