-- Planner invite: privileged colleague can write plans and notices.
-- Run in Supabase SQL Editor after SETUP_WORKER_INVITES.sql.

CREATE OR REPLACE FUNCTION public.is_work_planner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lower(auth.jwt() ->> 'email') = 'mtclemur@gmail.com'
    OR EXISTS (
      SELECT 1
      FROM public.workers
      WHERE lower(workers.email) = lower(auth.jwt() ->> 'email')
        AND lower(COALESCE(workers.role, '')) IN ('admin', 'vorarbeiter')
    );
$$;

DROP FUNCTION IF EXISTS public.create_worker_invite(text);
DROP FUNCTION IF EXISTS public.create_worker_invite(text, text);

CREATE OR REPLACE FUNCTION public.create_worker_invite(p_name text, p_role text DEFAULT 'mitarbeiter')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_name text;
  clean_role text;
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

  clean_role := lower(btrim(COALESCE(p_role, 'mitarbeiter')));
  IF clean_role NOT IN ('mitarbeiter', 'admin', 'vorarbeiter') THEN
    clean_role := 'mitarbeiter';
  END IF;

  SELECT workers.id INTO target_id
  FROM public.workers
  WHERE lower(workers.name) = lower(clean_name)
    AND (workers.email IS NULL OR btrim(workers.email) = '')
  LIMIT 1;

  IF target_id IS NULL THEN
    INSERT INTO public.workers (name, role, active)
    VALUES (clean_name, clean_role, true)
    RETURNING id INTO target_id;
  ELSIF clean_role <> 'mitarbeiter' THEN
    UPDATE public.workers
    SET role = clean_role
    WHERE id = target_id;
  END IF;

  DELETE FROM public.worker_invites WHERE worker_id = target_id;
  INSERT INTO public.worker_invites (worker_id) VALUES (target_id) RETURNING token INTO new_token;
  RETURN new_token::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_work_planner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_worker_invite(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
