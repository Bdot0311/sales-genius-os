
CREATE POLICY "Users can update own email assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'email-assets' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'email-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own email assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'email-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);
