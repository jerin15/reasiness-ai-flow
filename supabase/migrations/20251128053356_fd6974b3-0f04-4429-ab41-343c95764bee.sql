-- Remove daily cleanup jobs and create Monday-only cleanup with notifications

-- Unschedule the daily cleanup jobs
SELECT cron.unschedule('delete-old-completed-tasks');
SELECT cron.unschedule('cleanup-old-completed-tasks');

-- Create improved cleanup function that sends notifications
CREATE OR REPLACE FUNCTION public.cleanup_completed_tasks_with_notification()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected_users RECORD;
  deleted_count INTEGER;
  report_generated BOOLEAN := false;
BEGIN
  -- First, generate the weekly report
  BEGIN
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/generate-reports',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key', true)
      ),
      body := '{}'::jsonb
    );
    report_generated := true;
    RAISE NOTICE 'Weekly report generated successfully';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to generate report: %', SQLERRM;
  END;

  -- Wait for report generation
  IF report_generated THEN
    PERFORM pg_sleep(3);
  END IF;

  -- Get count and affected users before deletion
  SELECT COUNT(DISTINCT created_by) INTO deleted_count
  FROM public.tasks
  WHERE status = 'done'
    AND completed_at IS NOT NULL
    AND completed_at < NOW() - INTERVAL '7 days'
    AND deleted_at IS NULL;

  -- Send notification to each user about their completed tasks being archived
  FOR affected_users IN
    SELECT 
      t.created_by as user_id,
      COUNT(*) as task_count,
      p.full_name
    FROM public.tasks t
    LEFT JOIN public.profiles p ON p.id = t.created_by
    WHERE t.status = 'done'
      AND t.completed_at IS NOT NULL
      AND t.completed_at < NOW() - INTERVAL '7 days'
      AND t.deleted_at IS NULL
    GROUP BY t.created_by, p.full_name
  LOOP
    -- Create notification for each affected user
    INSERT INTO public.urgent_notifications (
      sender_id,
      recipient_id,
      title,
      message,
      priority,
      is_broadcast,
      is_acknowledged
    )
    SELECT 
      (SELECT user_id FROM user_roles WHERE role = 'admin' LIMIT 1),
      affected_users.user_id,
      '📦 Weekly Task Archive',
      format(
        E'%s completed tasks from last week have been archived.\n\n✅ Total Tasks: %s\n📊 A detailed report has been generated and saved.\n\nThese tasks completed more than 7 days ago are now moved to archive to keep your workspace clean.',
        affected_users.task_count,
        affected_users.task_count
      ),
      'medium',
      false,
      false
    WHERE affected_users.user_id IS NOT NULL;
  END LOOP;

  -- Also send a broadcast notification to all admins
  INSERT INTO public.urgent_notifications (
    sender_id,
    recipient_id,
    title,
    message,
    priority,
    is_broadcast,
    is_acknowledged
  )
  SELECT 
    (SELECT user_id FROM user_roles WHERE role = 'admin' LIMIT 1),
    NULL,
    '📦 Weekly Task Archive Complete',
    format(
      E'Weekly task cleanup has been completed.\n\n📊 Report Generated: ✅\n🗑️ Tasks Archived: %s users affected\n📅 Archive Date: %s\n\nAll completed tasks older than 7 days have been archived.',
      deleted_count,
      TO_CHAR(NOW(), 'Mon DD, YYYY at HH24:MI')
    ),
    'low',
    true,
    false;

  -- Now mark tasks as deleted (soft delete)
  UPDATE public.tasks
  SET deleted_at = NOW()
  WHERE status = 'done'
    AND completed_at IS NOT NULL
    AND completed_at < NOW() - INTERVAL '7 days'
    AND deleted_at IS NULL;

  RAISE NOTICE 'Archived % tasks from % users with notifications sent', 
    (SELECT COUNT(*) FROM tasks WHERE deleted_at = NOW()),
    deleted_count;
END;
$$;

-- Schedule cleanup to run every Monday at 9:00 AM (after the weekly report)
SELECT cron.schedule(
  'monday-cleanup-with-notification',
  '30 9 * * 1', -- 9:30 AM every Monday (30 minutes after weekly report)
  $$
  SELECT public.cleanup_completed_tasks_with_notification();
  $$
);