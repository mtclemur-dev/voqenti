-- Cine a adăugat și cine a modificat o lucrare.
-- Rulează în Supabase SQL Editor (același proiect Voqenti). Poți rula de mai multe ori.
-- După aceea reîncarcă aplicația. Lucrările vechi primesc numele din contul care le-a creat, dacă e-mailul e la un lucrător.

ALTER TABLE public.work_jobs
  ADD COLUMN IF NOT EXISTS created_by_worker uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS updated_by_worker uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_name text;

UPDATE public.work_jobs AS job
SET
  created_by_worker = worker.id,
  created_by_name = btrim(worker.name)
FROM auth.users AS account
JOIN public.workers AS worker
  ON lower(worker.email) = lower(account.email)
WHERE job.created_by = account.id
  AND job.created_by_name IS NULL
  AND worker.name IS NOT NULL
  AND btrim(worker.name) <> '';
