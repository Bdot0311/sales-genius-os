
-- Fix: Add path ownership check to email-assets bucket INSERT policy
DROP POLICY IF EXISTS "Authenticated users can upload email assets" ON storage.objects;

CREATE POLICY "Authenticated users can upload own email assets"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'email-assets'
  AND auth.role() = 'authenticated'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
