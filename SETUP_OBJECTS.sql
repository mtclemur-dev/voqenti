-- CREATE `objects` table for fixed work objects/locations
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.objects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  address text,
  manager text,
  phone text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_objects_name ON public.objects(name);

-- Allow logged-in users to read the object list from the app.
-- Without this policy, Supabase RLS can return an empty list even when rows exist.
ALTER TABLE public.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select objects" ON public.objects;
CREATE POLICY "Select objects"
  ON public.objects
  FOR SELECT
  TO authenticated
  USING (true);
