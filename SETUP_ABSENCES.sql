-- Absente (bolnav / concediu) – doar adminul scrie. Colegii anunta telefonic.
-- Ruleaza in Supabase SQL Editor, acelasi proiect Voqenti. Poti rula din nou.

CREATE TABLE IF NOT EXISTS public.work_absences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL DEFAULT 'sick',
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_absences_worker_dates
  ON public.work_absences(worker_id, start_date, end_date);

ALTER TABLE public.work_absences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Absences select" ON public.work_absences;
DROP POLICY IF EXISTS "Absences insert" ON public.work_absences;
DROP POLICY IF EXISTS "Absences update" ON public.work_absences;
DROP POLICY IF EXISTS "Absences delete" ON public.work_absences;

CREATE POLICY "Absences select"
  ON public.work_absences
  FOR SELECT
  TO authenticated
  USING (
    public.is_work_planner()
    OR worker_id = public.current_worker_id()
  );

CREATE POLICY "Absences insert"
  ON public.work_absences
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_work_planner());

CREATE POLICY "Absences update"
  ON public.work_absences
  FOR UPDATE
  TO authenticated
  USING (public.is_work_planner())
  WITH CHECK (public.is_work_planner());

CREATE POLICY "Absences delete"
  ON public.work_absences
  FOR DELETE
  TO authenticated
  USING (public.is_work_planner());

CREATE OR REPLACE FUNCTION public.notify_work_absence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  worker_label text;
BEGIN
  SELECT COALESCE(name, '') INTO worker_label
  FROM public.workers
  WHERE id = NEW.worker_id;

  INSERT INTO public.work_notifications (audience, worker_id, title, body, kind, job_id)
  VALUES (
    'worker',
    NEW.worker_id,
    CASE WHEN NEW.reason = 'vacation' THEN 'notifyVacation' ELSE 'notifySick' END,
    concat_ws(' · ', worker_label, NEW.start_date::text, NEW.end_date::text, NULLIF(NEW.note, '')),
    'absence',
    NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_work_absence ON public.work_absences;
CREATE TRIGGER trg_notify_work_absence
AFTER INSERT ON public.work_absences
FOR EACH ROW
EXECUTE PROCEDURE public.notify_work_absence();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_absences TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_work_absence() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'work_absences'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.work_absences;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
