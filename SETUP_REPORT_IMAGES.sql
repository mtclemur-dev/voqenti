-- Create storage bucket for Tagesbericht Schaden photos
-- Run this in Supabase SQL Editor

INSERT INTO storage.buckets (id, name, public)
VALUES ('report-images', 'report-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Report images read" ON storage.objects;
DROP POLICY IF EXISTS "Report images upload" ON storage.objects;

CREATE POLICY "Report images read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'report-images');

CREATE POLICY "Report images upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'report-images' AND auth.uid() IS NOT NULL);
