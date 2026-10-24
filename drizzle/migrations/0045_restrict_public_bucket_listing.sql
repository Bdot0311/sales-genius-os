DROP POLICY IF EXISTS "Users can view all logos" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for email assets" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view signature logos" ON storage.objects;

CREATE POLICY "Owners can view their white label logos" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'white-label-logos' AND owner_id = (select auth.uid()::text));

CREATE POLICY "Owners can view their signature logos" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'signature-logos' AND owner_id = (select auth.uid()::text));