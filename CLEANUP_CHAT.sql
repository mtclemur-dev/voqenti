-- Remove Voqenti chat data to reduce Supabase storage and egress.
-- Run this in Supabase SQL Editor.
-- This deletes all chat messages and all files from the chat-images bucket.

DELETE FROM storage.objects
WHERE bucket_id = 'chat-images';

DROP POLICY IF EXISTS "Chat images read" ON storage.objects;
DROP POLICY IF EXISTS "Chat images upload" ON storage.objects;

DELETE FROM storage.buckets
WHERE id = 'chat-images';

DROP TABLE IF EXISTS public.chat_messages CASCADE;

NOTIFY pgrst, 'reload schema';
