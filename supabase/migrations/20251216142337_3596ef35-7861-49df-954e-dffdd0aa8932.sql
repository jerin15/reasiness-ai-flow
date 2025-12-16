-- Add storage policies for task-reports bucket to allow authenticated users to download
CREATE POLICY "Authenticated users can view reports"
ON storage.objects
FOR SELECT
USING (bucket_id = 'task-reports' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can download reports"
ON storage.objects
FOR SELECT
USING (bucket_id = 'task-reports');