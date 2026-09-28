-- Lucratorul isi poate nota mereu ce a facut, unde a fost si orele.
-- Se aduna la totalul lui de munca si la prezenta. Colegii nu citesc aceste randuri.
-- Ruleaza in Supabase SQL Editor (acelasi proiect Voqenti). Poti rula de mai multe ori.

CREATE TABLE IF NOT EXISTS public.work_self_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  object_id uuid REFERENCES public.objects(id) ON DELETE SET NULL,
  place_text text,
  task_text text,
  start_time text,
  end_time text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.work_self_logs
  ADD COLUMN IF NOT EXISTS worker_id uuid,
  ADD COLUMN IF NOT EXISTS work_date date,
  ADD COLUMN IF NOT EXISTS object_id uuid,
  ADD COLUMN IF NOT EXISTS place_text text,
  ADD COLUMN IF NOT EXISTS task_text text,
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS end_time text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_work_self_logs_worker_date
  ON public.work_self_logs(worker_id, work_date);

ALTER TABLE public.work_self_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Self logs select" ON public.work_self_logs;
DROP POLICY IF EXISTS "Self logs insert" ON public.work_self_logs;
DROP POLICY IF EXISTS "Self logs update" ON public.work_self_logs;
DROP POLICY IF EXISTS "Self logs delete" ON public.work_self_logs;

CREATE POLICY "Self logs select"
  ON public.work_self_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_work_planner()
    OR worker_id = public.current_worker_id()
  );

CREATE POLICY "Self logs insert"
  ON public.work_self_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (worker_id = public.current_worker_id());

CREATE POLICY "Self logs update"
  ON public.work_self_logs
  FOR UPDATE
  TO authenticated
  USING (worker_id = public.current_worker_id())
  WITH CHECK (worker_id = public.current_worker_id());

CREATE POLICY "Self logs delete"
  ON public.work_self_logs
  FOR DELETE
  TO authenticated
  USING (worker_id = public.current_worker_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_self_logs TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'work_self_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.work_self_logs;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
