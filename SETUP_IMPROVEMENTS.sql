-- Imbunatatiri Voqenti: vazut / nu pot veni, notificari, citiri Arbeitweise.
-- Ruleaza in Supabase SQL Editor, DUPA SETUP_WORK_PLAN.sql si SETUP_COMPANY_BOARD.sql.

ALTER TABLE public.work_job_assignees
  ADD COLUMN IF NOT EXISTS seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS decline_reason text;

ALTER TABLE public.work_jobs
  ADD COLUMN IF NOT EXISTS released_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS public_at timestamptz,
  ADD COLUMN IF NOT EXISTS early_min_count integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.work_notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  audience text NOT NULL DEFAULT 'worker',
  worker_id uuid REFERENCES public.workers(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  kind text NOT NULL DEFAULT 'plan',
  job_id uuid REFERENCES public.work_jobs(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_notifications_worker
  ON public.work_notifications(worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_notifications_audience
  ON public.work_notifications(audience, created_at DESC);

CREATE TABLE IF NOT EXISTS public.guide_reads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  notice_id uuid REFERENCES public.company_notices(id) ON DELETE SET NULL,
  read_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, read_date)
);

CREATE INDEX IF NOT EXISTS idx_guide_reads_date ON public.guide_reads(read_date);

CREATE OR REPLACE FUNCTION public.guard_work_assignee_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_work_planner() THEN
    RETURN NEW;
  END IF;
  IF NEW.worker_id IS DISTINCT FROM OLD.worker_id
     OR NEW.job_id IS DISTINCT FROM OLD.job_id THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF OLD.status = 'declined' THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'declined' THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF OLD.status NOT IN ('assigned', 'approved') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_work_assignee_update ON public.work_job_assignees;
CREATE TRIGGER trg_guard_work_assignee_update
BEFORE UPDATE ON public.work_job_assignees
FOR EACH ROW
EXECUTE PROCEDURE public.guard_work_assignee_update();

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
    INSERT INTO public.work_notifications (audience, worker_id, title, body, kind, job_id)
    VALUES ('worker', NEW.worker_id, 'notifyPlan', concat_ws(' · ', job_when, job_place), 'plan', NEW.job_id);
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

DROP TRIGGER IF EXISTS trg_notify_work_assignee_change ON public.work_job_assignees;
CREATE TRIGGER trg_notify_work_assignee_change
AFTER INSERT OR UPDATE ON public.work_job_assignees
FOR EACH ROW
EXECUTE PROCEDURE public.notify_work_assignee_change();

CREATE OR REPLACE FUNCTION public.current_worker_extra_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.work_job_assignees assignees
  JOIN public.work_jobs jobs ON jobs.id = assignees.job_id
  WHERE assignees.worker_id = public.current_worker_id()
    AND assignees.status IN ('assigned', 'approved')
    AND jobs.kind = 'open_post'
    AND jobs.status IS DISTINCT FROM 'cancelled'
    AND jobs.work_date >= (date_trunc('year', timezone('Europe/Berlin', now())))::date
    AND jobs.work_date < ((date_trunc('year', timezone('Europe/Berlin', now())) + interval '1 year'))::date;
$$;

CREATE OR REPLACE FUNCTION public.open_post_is_public(job public.work_jobs)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(job.public_at, job.released_at, job.created_at, now()) <= now();
$$;

CREATE OR REPLACE FUNCTION public.notify_open_post_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  year_start date;
  year_end date;
BEGIN
  IF NEW.kind = 'open_post' AND NEW.status = 'active' THEN
    year_start := (date_trunc('year', timezone('Europe/Berlin', now())))::date;
    year_end := (year_start + interval '1 year')::date;
    INSERT INTO public.work_notifications (audience, worker_id, title, body, kind, job_id)
    SELECT
      'worker',
      workers.id,
      'notifyOpenPost',
      concat_ws(' · ', NEW.work_date::text, COALESCE(NEW.location_text, NEW.object_name, '')),
      'open_post',
      NEW.id
    FROM public.workers
    WHERE workers.active IS DISTINCT FROM false
      AND (
        NEW.public_at IS NULL
        OR NEW.public_at <= now()
        OR COALESCE(NEW.early_min_count, 0) <= 0
        OR (
          SELECT count(*)::integer
          FROM public.work_job_assignees assignees
          JOIN public.work_jobs jobs ON jobs.id = assignees.job_id
          WHERE assignees.worker_id = workers.id
            AND assignees.status IN ('assigned', 'approved')
            AND jobs.kind = 'open_post'
            AND jobs.status IS DISTINCT FROM 'cancelled'
            AND jobs.work_date >= year_start
            AND jobs.work_date < year_end
        ) >= NEW.early_min_count
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_open_post_job ON public.work_jobs;
CREATE TRIGGER trg_notify_open_post_job
AFTER INSERT ON public.work_jobs
FOR EACH ROW
EXECUTE PROCEDURE public.notify_open_post_job();

DROP POLICY IF EXISTS "Work jobs select" ON public.work_jobs;
CREATE POLICY "Work jobs select"
  ON public.work_jobs
  FOR SELECT
  TO authenticated
  USING (
    public.is_work_planner()
    OR (
      kind = 'open_post'
      AND status = 'active'
      AND (
        COALESCE(public_at, released_at, created_at, now()) <= now()
        OR (
          COALESCE(early_min_count, 0) > 0
          AND public.current_worker_extra_count() >= early_min_count
        )
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.work_job_assignees
      WHERE work_job_assignees.job_id = work_jobs.id
        AND work_job_assignees.worker_id = public.current_worker_id()
        AND work_job_assignees.status IN ('assigned', 'approved', 'pending', 'declined')
    )
  );

DROP POLICY IF EXISTS "Work assignees update self" ON public.work_job_assignees;
CREATE POLICY "Work assignees update self"
  ON public.work_job_assignees
  FOR UPDATE
  TO authenticated
  USING (worker_id = public.current_worker_id())
  WITH CHECK (worker_id = public.current_worker_id());

DROP POLICY IF EXISTS "Work assignees insert" ON public.work_job_assignees;
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
          AND (
            COALESCE(work_jobs.public_at, work_jobs.released_at, work_jobs.created_at, now()) <= now()
            OR (
              COALESCE(work_jobs.early_min_count, 0) > 0
              AND public.current_worker_extra_count() >= work_jobs.early_min_count
            )
          )
      )
    )
  );

ALTER TABLE public.work_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guide_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notifications select" ON public.work_notifications;
DROP POLICY IF EXISTS "Notifications insert planner" ON public.work_notifications;
DROP POLICY IF EXISTS "Notifications update own" ON public.work_notifications;
DROP POLICY IF EXISTS "Guide reads select" ON public.guide_reads;
DROP POLICY IF EXISTS "Guide reads insert own" ON public.guide_reads;
DROP POLICY IF EXISTS "Guide reads update own" ON public.guide_reads;

CREATE POLICY "Notifications select"
  ON public.work_notifications
  FOR SELECT
  TO authenticated
  USING (
    (audience = 'worker' AND worker_id = public.current_worker_id())
    OR (audience = 'planner' AND public.is_work_planner())
  );

CREATE POLICY "Notifications insert planner"
  ON public.work_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_work_planner());

CREATE POLICY "Notifications update own"
  ON public.work_notifications
  FOR UPDATE
  TO authenticated
  USING (
    (audience = 'worker' AND worker_id = public.current_worker_id())
    OR (audience = 'planner' AND public.is_work_planner())
  )
  WITH CHECK (
    (audience = 'worker' AND worker_id = public.current_worker_id())
    OR (audience = 'planner' AND public.is_work_planner())
  );

CREATE POLICY "Guide reads select"
  ON public.guide_reads
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_work_planner()
  );

CREATE POLICY "Guide reads insert own"
  ON public.guide_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Guide reads update own"
  ON public.guide_reads
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.work_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.guide_reads TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_work_assignee_update() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_work_assignee_change() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_open_post_job() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_worker_extra_count() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'work_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.work_notifications;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'guide_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guide_reads;
  END IF;
END $$;

-- Anunturi interne: doar adminul scrie / modifica / sterge.
DROP POLICY IF EXISTS "Company notices insert" ON public.company_notices;
DROP POLICY IF EXISTS "Company notices update" ON public.company_notices;
DROP POLICY IF EXISTS "Company notices delete" ON public.company_notices;

CREATE POLICY "Company notices insert"
  ON public.company_notices
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_work_planner());

CREATE POLICY "Company notices update"
  ON public.company_notices
  FOR UPDATE
  TO authenticated
  USING (public.is_work_planner())
  WITH CHECK (public.is_work_planner());

CREATE POLICY "Company notices delete"
  ON public.company_notices
  FOR DELETE
  TO authenticated
  USING (public.is_work_planner());

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
