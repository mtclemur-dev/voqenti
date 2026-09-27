-- Voqenti: cereri simple de la lucrător către birou.
-- Rulează în Supabase SQL Editor (același proiect Voqenti), DUPĂ SETUP_WORK_PLAN.sql
-- și SETUP_VEHICLES.sql. Nu adaugă Realtime pe office_requests.
--
-- Schema existentă este single-tenant: nu există tabela companies.
-- company_id rămâne NOT NULL pentru izolarea viitoare, cu un id stabil de lucru.
-- Protecția reală este RLS prin is_work_planner() și current_worker_id().
--
-- work_notifications permite INSERT doar pentru planificatori.
-- Notificările se scriu din trigger SECURITY DEFINER, fără drept de insert al lucrătorului.
--
-- Câmpuri extra pentru vehicule (idempotent dacă SETUP_VEHICLES.sql a fost rulat deja):

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS odometer integer,
  ADD COLUMN IF NOT EXISTS odometer_date date,
  ADD COLUMN IF NOT EXISTS service_km integer,
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '00000000-0000-0000-0000-000000000001'::uuid;
$$;

CREATE TABLE IF NOT EXISTS public.office_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  object_id uuid REFERENCES public.objects(id) ON DELETE SET NULL,
  work_job_id uuid REFERENCES public.work_jobs(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  category text NOT NULL,
  message text NOT NULL,
  quantity text,
  needed_by date,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'new',
  office_reply text,
  replied_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  replied_at timestamptz,
  resolved_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT office_requests_category_check
    CHECK (category IN ('material', 'damage', 'safety', 'question', 'vehicle', 'other')),
  CONSTRAINT office_requests_status_check
    CHECK (status IN ('new', 'seen', 'in_progress', 'resolved', 'rejected')),
  CONSTRAINT office_requests_priority_check
    CHECK (priority IN ('normal', 'high')),
  CONSTRAINT office_requests_message_check
    CHECK (char_length(btrim(message)) > 0)
);

ALTER TABLE public.office_requests
  ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT public.current_company_id(),
  ADD COLUMN IF NOT EXISTS object_id uuid,
  ADD COLUMN IF NOT EXISTS work_job_id uuid,
  ADD COLUMN IF NOT EXISTS vehicle_id uuid,
  ADD COLUMN IF NOT EXISTS worker_id uuid,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS quantity text,
  ADD COLUMN IF NOT EXISTS needed_by date,
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS office_reply text,
  ADD COLUMN IF NOT EXISTS replied_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'office_requests_category_check'
      AND conrelid = 'public.office_requests'::regclass
  ) THEN
    ALTER TABLE public.office_requests
      ADD CONSTRAINT office_requests_category_check
      CHECK (category IN ('material', 'damage', 'safety', 'question', 'vehicle', 'other'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'office_requests_status_check'
      AND conrelid = 'public.office_requests'::regclass
  ) THEN
    ALTER TABLE public.office_requests
      ADD CONSTRAINT office_requests_status_check
      CHECK (status IN ('new', 'seen', 'in_progress', 'resolved', 'rejected'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'office_requests_priority_check'
      AND conrelid = 'public.office_requests'::regclass
  ) THEN
    ALTER TABLE public.office_requests
      ADD CONSTRAINT office_requests_priority_check
      CHECK (priority IN ('normal', 'high'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_office_requests_open
  ON public.office_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_office_requests_worker
  ON public.office_requests(worker_id, object_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_office_requests_vehicle
  ON public.office_requests(vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_office_requests_company
  ON public.office_requests(company_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_office_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_office_request_touch ON public.office_requests;
CREATE TRIGGER trg_office_request_touch
BEFORE UPDATE ON public.office_requests
FOR EACH ROW
EXECUTE PROCEDURE public.touch_office_request();

CREATE OR REPLACE FUNCTION public.guard_office_request_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.company_id := public.current_company_id();
    NEW.created_by_user_id := COALESCE(NEW.created_by_user_id, auth.uid());
    NEW.status := 'new';
    NEW.office_reply := NULL;
    NEW.replied_by_user_id := NULL;
    NEW.replied_at := NULL;
    NEW.resolved_by_user_id := NULL;
    NEW.resolved_at := NULL;
    IF NEW.worker_id IS DISTINCT FROM public.current_worker_id() THEN
      RAISE EXCEPTION 'office_request_worker_mismatch';
    END IF;
    IF NEW.created_by_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'office_request_user_mismatch';
    END IF;
    RETURN NEW;
  END IF;

  NEW.company_id := OLD.company_id;
  NEW.worker_id := OLD.worker_id;
  NEW.created_by_user_id := OLD.created_by_user_id;
  NEW.object_id := OLD.object_id;
  NEW.work_job_id := OLD.work_job_id;
  NEW.category := OLD.category;
  NEW.message := OLD.message;
  NEW.quantity := OLD.quantity;
  NEW.needed_by := OLD.needed_by;
  NEW.vehicle_id := COALESCE(NEW.vehicle_id, OLD.vehicle_id);

  IF NOT public.is_work_planner() THEN
    RAISE EXCEPTION 'office_request_planner_only';
  END IF;

  IF NEW.office_reply IS DISTINCT FROM OLD.office_reply THEN
    NEW.replied_by_user_id := auth.uid();
    NEW.replied_at := now();
  END IF;

  IF NEW.status IN ('resolved', 'rejected') AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.resolved_by_user_id := auth.uid();
    NEW.resolved_at := now();
  END IF;

  IF NEW.status NOT IN ('resolved', 'rejected') THEN
    NEW.resolved_by_user_id := NULL;
    NEW.resolved_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_office_request_guard ON public.office_requests;
CREATE TRIGGER trg_office_request_guard
BEFORE INSERT OR UPDATE ON public.office_requests
FOR EACH ROW
EXECUTE PROCEDURE public.guard_office_request_write();

CREATE OR REPLACE FUNCTION public.notify_office_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  place text;
  worker_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(objects.name, work_jobs.object_name, '')
      INTO place
    FROM (SELECT NEW.object_id AS object_id, NEW.work_job_id AS work_job_id) src
    LEFT JOIN public.objects ON objects.id = src.object_id
    LEFT JOIN public.work_jobs ON work_jobs.id = src.work_job_id;

    SELECT workers.name INTO worker_name
    FROM public.workers
    WHERE workers.id = NEW.worker_id;

    BEGIN
      INSERT INTO public.work_notifications (audience, worker_id, title, body, kind, job_id)
      VALUES (
        'planner',
        NEW.worker_id,
        'notifyOfficeRequest',
        left(concat_ws(' · ', worker_name, NULLIF(place, ''), NEW.category, left(NEW.message, 80)), 240),
        'office_request',
        NEW.work_job_id
      );
    EXCEPTION
      WHEN undefined_table THEN NULL;
      WHEN insufficient_privilege THEN NULL;
    END;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.office_reply IS DISTINCT FROM OLD.office_reply
     )
  THEN
    BEGIN
      INSERT INTO public.work_notifications (audience, worker_id, title, body, kind, job_id)
      VALUES (
        'worker',
        NEW.worker_id,
        'notifyOfficeReply',
        left(concat_ws(' · ', NEW.status, NULLIF(btrim(COALESCE(NEW.office_reply, '')), '')), 240),
        'office_reply',
        NEW.work_job_id
      );
    EXCEPTION
      WHEN undefined_table THEN NULL;
      WHEN insufficient_privilege THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_office_request_notify ON public.office_requests;
CREATE TRIGGER trg_office_request_notify
AFTER INSERT OR UPDATE OF status, office_reply ON public.office_requests
FOR EACH ROW
EXECUTE PROCEDURE public.notify_office_request();

ALTER TABLE public.office_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Office requests select worker" ON public.office_requests;
DROP POLICY IF EXISTS "Office requests select planner" ON public.office_requests;
DROP POLICY IF EXISTS "Office requests insert worker" ON public.office_requests;
DROP POLICY IF EXISTS "Office requests update planner" ON public.office_requests;

CREATE POLICY "Office requests select worker"
  ON public.office_requests
  FOR SELECT
  TO authenticated
  USING (
    company_id = public.current_company_id()
    AND worker_id = public.current_worker_id()
    AND created_by_user_id = auth.uid()
  );

CREATE POLICY "Office requests select planner"
  ON public.office_requests
  FOR SELECT
  TO authenticated
  USING (
    public.is_work_planner()
    AND company_id = public.current_company_id()
  );

CREATE POLICY "Office requests insert worker"
  ON public.office_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = public.current_company_id()
    AND worker_id = public.current_worker_id()
    AND created_by_user_id = auth.uid()
    AND status = 'new'
    AND office_reply IS NULL
    AND replied_by_user_id IS NULL
    AND resolved_by_user_id IS NULL
    AND char_length(btrim(message)) > 0
    AND (
      work_job_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.work_job_assignees
        WHERE work_job_assignees.job_id = work_job_id
          AND work_job_assignees.worker_id = public.current_worker_id()
          AND work_job_assignees.status IN ('assigned', 'approved', 'pending')
      )
    )
    AND (
      object_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.objects
        WHERE objects.id = object_id
      )
    )
    AND (
      vehicle_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.vehicles
        WHERE vehicles.id = vehicle_id
          AND (
            vehicles.driver_id = public.current_worker_id()
            OR public.is_work_planner()
          )
      )
    )
  );

CREATE POLICY "Office requests update planner"
  ON public.office_requests
  FOR UPDATE
  TO authenticated
  USING (
    public.is_work_planner()
    AND company_id = public.current_company_id()
  )
  WITH CHECK (
    public.is_work_planner()
    AND company_id = public.current_company_id()
  );

GRANT SELECT, INSERT, UPDATE ON public.office_requests TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_office_request() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_office_request_write() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_office_request() TO authenticated;
