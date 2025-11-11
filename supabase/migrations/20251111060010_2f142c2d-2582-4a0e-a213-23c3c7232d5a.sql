-- Create storage bucket for white label logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'white-label-logos',
  'white-label-logos',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']
);

-- RLS policies for logo uploads
CREATE POLICY "Users can view all logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'white-label-logos');

CREATE POLICY "Elite users can upload their own logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'white-label-logos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND EXISTS (
    SELECT 1 FROM subscriptions 
    WHERE user_id = auth.uid() 
    AND plan = 'elite' 
    AND status = 'active'
  )
);

CREATE POLICY "Elite users can update their own logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'white-label-logos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND EXISTS (
    SELECT 1 FROM subscriptions 
    WHERE user_id = auth.uid() 
    AND plan = 'elite' 
    AND status = 'active'
  )
);

CREATE POLICY "Elite users can delete their own logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'white-label-logos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND EXISTS (
    SELECT 1 FROM subscriptions 
    WHERE user_id = auth.uid() 
    AND plan = 'elite' 
    AND status = 'active'
  )
);