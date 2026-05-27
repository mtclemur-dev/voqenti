-- Voqenti workflow update: editable Tagesbericht, manual time entries, email send protection
-- Run this in Supabase SQL Editor before testing the new workflow.

ALTER TABLE public.pontaj
  ADD COLUMN IF NOT EXISTS entry_type text DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS correction_reason text,
  ADD COLUMN IF NOT EXISTS checklist_work_time boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist_work_done boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist_equipment_back boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist_materials_back boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.pontaj
SET entry_type = COALESCE(entry_type, 'automatic')
WHERE entry_type IS NULL;

ALTER TABLE public.tagesbericht
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'Gespeichert',
  ADD COLUMN IF NOT EXISTS email_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS entry_type text DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS correction_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.tagesbericht
SET
  status = COALESCE(status, 'Gespeichert'),
  email_sent = COALESCE(email_sent, false),
  entry_type = COALESCE(entry_type, 'automatic')
WHERE status IS NULL
   OR email_sent IS NULL
   OR entry_type IS NULL;

DROP FUNCTION IF EXISTS public.start_work_session(text, bigint, timestamptz);

CREATE OR REPLACE FUNCTION public.start_work_session(
  p_name_nutzer text,
  p_report_id bigint,
  p_start_time timestamptz
)
RETURNS public.pontaj
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_row public.pontaj;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;

  SELECT *
  INTO new_row
  FROM public.pontaj
  WHERE user_id = auth.uid()
    AND ("Uhrzeit_Start" AT TIME ZONE 'Europe/Berlin')::date = (p_start_time AT TIME ZONE 'Europe/Berlin')::date
  ORDER BY CASE WHEN status = 'activ' THEN 0 ELSE 1 END, "Uhrzeit_Start" ASC
  LIMIT 1;

  IF FOUND THEN
    IF new_row.status = 'activ' THEN
      RETURN new_row;
    END IF;

    UPDATE public.pontaj
    SET
      status = 'activ',
      current_mode = 'work',
      "Uhrzeit_Start" = p_start_time,
      mode_changed_at = p_start_time,
      "Uhrzeit_Ende" = NULL,
      entry_type = 'automatic',
      correction_reason = NULL,
      updated_at = now(),
      report_id = COALESCE(p_report_id, report_id)
    WHERE id = new_row.id
    RETURNING * INTO new_row;

    RETURN new_row;
  END IF;

  INSERT INTO public.pontaj (
    user_id,
    name_nutzer,
    "Uhrzeit_Start",
    status,
    current_mode,
    mode_changed_at,
    pause_minutes,
    auto_pause_minutes,
    fahrzeit_minutes,
    total_minutes,
    effective_minutes,
    entry_type,
    correction_reason,
    report_id
  )
  VALUES (
    auth.uid(),
    COALESCE(p_name_nutzer, 'Benutzer'),
    p_start_time,
    'activ',
    'work',
    p_start_time,
    0,
    0,
    0,
    0,
    0,
    'automatic',
    NULL,
    p_report_id
  )
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION public.start_work_session(text, bigint, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_work_session(text, bigint, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
