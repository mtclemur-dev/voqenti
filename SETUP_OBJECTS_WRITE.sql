-- Adauga / modifica obiecte din Voqenti.
-- Ruleaza in Supabase SQL Editor, dupa SETUP_OBJECTS.sql.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.objects TO authenticated;

DROP POLICY IF EXISTS "Objects insert planner" ON public.objects;
DROP POLICY IF EXISTS "Objects update planner" ON public.objects;
DROP POLICY IF EXISTS "Objects delete planner" ON public.objects;

CREATE POLICY "Objects insert planner"
  ON public.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_work_planner()
    OR lower(auth.jwt() ->> 'email') = 'mtclemur@gmail.com'
  );

CREATE POLICY "Objects update planner"
  ON public.objects
  FOR UPDATE
  TO authenticated
  USING (
    public.is_work_planner()
    OR lower(auth.jwt() ->> 'email') = 'mtclemur@gmail.com'
  )
  WITH CHECK (
    public.is_work_planner()
    OR lower(auth.jwt() ->> 'email') = 'mtclemur@gmail.com'
  );

CREATE POLICY "Objects delete planner"
  ON public.objects
  FOR DELETE
  TO authenticated
  USING (
    public.is_work_planner()
    OR lower(auth.jwt() ->> 'email') = 'mtclemur@gmail.com'
  );

NOTIFY pgrst, 'reload schema';
