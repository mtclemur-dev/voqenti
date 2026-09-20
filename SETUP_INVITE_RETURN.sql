-- Acelasi link de invitatie + parola = intra iarasi.
-- Pe pagina de start: nume + parola, fara e-mail.
-- Ruleaza in Supabase SQL Editor.

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
GRANT EXECUTE ON FUNCTION public.lookup_worker_login(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
