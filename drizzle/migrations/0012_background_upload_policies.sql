CREATE POLICY "Owners can read their background files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'backgrounds' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owners can upload background files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'backgrounds' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owners can update background files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'backgrounds' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owners can delete background files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'backgrounds' AND (storage.foldername(name))[1] = auth.uid()::text);