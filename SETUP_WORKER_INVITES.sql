-- Invite links: admin creates a named worker, colleague opens the link and registers under that name.
-- Run in Supabase SQL Editor after SETUP_WORKERS.sql / SETUP_WORK_PLAN.sql.

CREATE TABLE IF NOT EXISTS public.worker_invites (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_invites_worker
  ON public.worker_invites(worker_id);

ALTER TABLE public.worker_invites ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.worker_invites FROM PUBLIC;
REVOKE ALL ON public.worker_invites FROM anon, authenticated;

DROP FUNCTION IF EXISTS public.lookup_worker_invite(text);

CREATE OR REPLACE FUNCTION public.lookup_worker_invite(p_token text)
RETURNS TABLE(id uuid, name text, claimed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    workers.id,
    workers.name,
    (workers.email IS NOT NULL AND btrim(workers.email) <> '')
  FROM public.worker_invites
  JOIN public.workers ON workers.id = worker_invites.worker_id
  WHERE worker_invites.token = trim(p_token)::uuid
    AND workers.active IS DISTINCT FROM false
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.claim_worker_invite(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid_email text;
  target_id uuid;
  taken uuid;
BEGIN
  uid_email := lower(auth.jwt() ->> 'email');
  IF uid_email IS NULL OR p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT worker_invites.worker_id INTO target_id
  FROM public.worker_invites
  WHERE worker_invites.token = trim(p_token)::uuid
  FOR UPDATE;

  IF target_id IS NULL THEN
    RAISE EXCEPTION 'invalid invite';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workers
    WHERE id = target_id
      AND (email IS NULL OR btrim(email) = '')
  ) THEN
    RAISE EXCEPTION 'invalid invite';
  END IF;

  SELECT workers.id INTO taken
  FROM public.workers
  WHERE lower(workers.email) = uid_email
    AND workers.id IS DISTINCT FROM target_id
  LIMIT 1;

  IF taken IS NOT NULL THEN
    RAISE EXCEPTION 'already registered';
  END IF;

  UPDATE public.workers
  SET email = auth.jwt() ->> 'email',
      active = true
  WHERE id = target_id;

  RETURN target_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_worker_invite(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_name text;
  target_id uuid;
  new_token uuid;
BEGIN
  IF NOT public.is_work_planner() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  clean_name := btrim(p_name);
  IF clean_name = '' THEN
    RAISE EXCEPTION 'name required';
  END IF;

  SELECT workers.id INTO target_id
  FROM public.workers
  WHERE lower(workers.name) = lower(clean_name)
    AND (workers.email IS NULL OR btrim(workers.email) = '')
  LIMIT 1;

  IF target_id IS NULL THEN
    INSERT INTO public.workers (name, role, active)
    VALUES (clean_name, 'mitarbeiter', true)
    RETURNING id INTO target_id;
  END IF;

  DELETE FROM public.worker_invites WHERE worker_id = target_id;
  INSERT INTO public.worker_invites (worker_id) VALUES (target_id) RETURNING token INTO new_token;
  RETURN new_token::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_worker_invite(p_worker_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_token uuid;
BEGIN
  IF NOT public.is_work_planner() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workers
    WHERE id = p_worker_id
      AND (email IS NULL OR btrim(email) = '')
      AND active IS DISTINCT FROM false
  ) THEN
    RAISE EXCEPTION 'invalid worker';
  END IF;

  DELETE FROM public.worker_invites WHERE worker_id = p_worker_id;
  INSERT INTO public.worker_invites (worker_id) VALUES (p_worker_id) RETURNING token INTO new_token;
  RETURN new_token::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_worker_login(p_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workers.id
  FROM public.workers
  WHERE lower(btrim(workers.name)) = lower(btrim(p_name))
    AND workers.active IS DISTINCT FROM false
    AND workers.email IS NOT NULL
    AND btrim(workers.email) <> ''
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_worker_invite(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_worker_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_worker_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_worker_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_worker_login(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
