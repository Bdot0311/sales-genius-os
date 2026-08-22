DROP POLICY IF EXISTS "Elite users can update their own logos" ON storage.objects;
CREATE POLICY "Elite users can update their own logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'white-label-logos' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'white-label-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can update own signature logos" ON storage.objects;
CREATE POLICY "Users can update own signature logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'signature-logos' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'signature-logos' AND (storage.foldername(name))[1] = auth.uid()::text);