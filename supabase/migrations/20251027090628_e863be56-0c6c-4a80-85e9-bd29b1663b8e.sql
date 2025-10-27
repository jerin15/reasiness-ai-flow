-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a cron job to run the hourly-estimation-reminder edge function every hour
SELECT cron.schedule(
  'hourly-estimation-reminder',
  '0 * * * *',
  $cron$
  SELECT
    net.http_post(
        url:='https://pntujnoifxlzouoztscv.supabase.co/functions/v1/hourly-estimation-reminder',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBudHVqbm9pZnhsem91b3p0c2N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NTUzOTMsImV4cCI6MjA3NjIzMTM5M30.G3omZWdFXUGfKvNGhy-h-VsXOpZnc9hf_24gtMcGi5c"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $cron$
);
