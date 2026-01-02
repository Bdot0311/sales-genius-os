-- Create storage bucket for email signature logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('signature-logos', 'signature-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own signature logos
CREATE POLICY "Users can upload own signature logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'signature-logos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to update their own signature logos
CREATE POLICY "Users can update own signature logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'signature-logos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to delete their own signature logos
CREATE POLICY "Users can delete own signature logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'signature-logos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow public read access since emails need to display the logos
CREATE POLICY "Anyone can view signature logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'signature-logos');