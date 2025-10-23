-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Ensure messages table has realtime enabled
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- Function to mark old completed tasks as deleted
CREATE OR REPLACE FUNCTION public.mark_old_completed_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.tasks
  SET deleted_at = NOW()
  WHERE status = 'done'
    AND completed_at IS NOT NULL
    AND completed_at < NOW() - INTERVAL '7 days'
    AND deleted_at IS NULL;
END;
$function$;

-- Schedule auto-deletion to run daily at 2 AM
SELECT cron.schedule(
  'delete-old-completed-tasks',
  '0 2 * * *',
  $$SELECT mark_old_completed_tasks();$$
);

-- Schedule report generation every 3 days at 1 AM
SELECT cron.schedule(
  'generate-reports-3days',
  '0 1 */3 * *',
  $$
  SELECT net.http_post(
    url := 'https://pntujnoifxlzouoztscv.supabase.co/functions/v1/generate-reports',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBudHVqbm9pZnhsem91b3p0c2N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NTUzOTMsImV4cCI6MjA3NjIzMTM5M30.G3omZWdFXUGfKvNGhy-h-VsXOpZnc9hf_24gtMcGi5c"}'::jsonb
  );
  $$
);

-- Schedule report generation before deletion (every 6 days) at 12 PM
SELECT cron.schedule(
  'generate-reports-before-deletion',
  '0 12 */6 * *',
  $$
  SELECT net.http_post(
    url := 'https://pntujnoifxlzouoztscv.supabase.co/functions/v1/generate-reports',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBudHVqbm9pZnhsem91b3p0c2N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NTUzOTMsImV4cCI6MjA3NjIzMTM5M30.G3omZWdFXUGfKvNGhy-h-VsXOpZnc9hf_24gtMcGi5c"}'::jsonb
  );
  $$
);