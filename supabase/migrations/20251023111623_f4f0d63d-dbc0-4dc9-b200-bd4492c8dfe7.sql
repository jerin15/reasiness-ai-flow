-- Create function to generate reports and mark old tasks as deleted
CREATE OR REPLACE FUNCTION public.cleanup_old_completed_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  supabase_url TEXT;
  supabase_key TEXT;
  has_old_tasks BOOLEAN;
BEGIN
  -- Check if there are any tasks to clean up
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks
    WHERE status = 'done'
      AND completed_at IS NOT NULL
      AND completed_at < NOW() - INTERVAL '7 days'
      AND deleted_at IS NULL
  ) INTO has_old_tasks;

  -- Only proceed if there are tasks to clean up
  IF has_old_tasks THEN
    -- Get Supabase credentials from environment
    supabase_url := current_setting('app.settings.supabase_url', true);
    supabase_key := current_setting('app.settings.supabase_anon_key', true);

    -- Call the generate-reports edge function
    -- This will create CSV, TXT, and PDF reports
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/generate-reports',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || supabase_key
      ),
      body := '{}'::jsonb
    );

    -- Wait a moment for reports to be generated
    PERFORM pg_sleep(2);

    -- Mark old completed tasks as deleted
    UPDATE public.tasks
    SET deleted_at = NOW()
    WHERE status = 'done'
      AND completed_at IS NOT NULL
      AND completed_at < NOW() - INTERVAL '7 days'
      AND deleted_at IS NULL;

    RAISE NOTICE 'Cleaned up old completed tasks and generated reports';
  ELSE
    RAISE NOTICE 'No old completed tasks to clean up';
  END IF;
END;
$$;

-- Create a cron job to run cleanup daily at 2 AM
SELECT cron.schedule(
  'cleanup-old-completed-tasks',
  '0 2 * * *', -- Run at 2 AM every day
  $$
  SELECT public.cleanup_old_completed_tasks();
  $$
);

-- Enable pg_net extension for HTTP requests (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Enable pg_cron extension for scheduled jobs (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;