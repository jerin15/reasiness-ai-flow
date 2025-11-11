-- Update the urgent notification trigger to create better formatted messages
CREATE OR REPLACE FUNCTION public.create_urgent_notification_for_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  task_record RECORD;
  notification_title TEXT;
  notification_message TEXT;
BEGIN
  -- Get the full task details
  SELECT t.*, p.full_name as creator_name
  INTO task_record
  FROM tasks t
  LEFT JOIN profiles p ON p.id = t.created_by
  WHERE t.id = NEW.task_id;

  -- Only proceed if task has urgent or high priority and is assigned
  IF task_record.priority IN ('urgent', 'high') AND task_record.assigned_to IS NOT NULL THEN
    
    -- Handle task creation
    IF NEW.action = 'created' THEN
      notification_title := '🚨 New ' || UPPER(task_record.priority::text) || ' Priority Task';
      notification_message := format(
        E'TASK: %s\n\nPRIORITY: %s\nCREATED BY: %s\nCLIENT: %s\n\n📋 DESCRIPTION:\n%s\n\n⚠️ Please begin work on this task immediately.',
        task_record.title,
        UPPER(task_record.priority::text),
        COALESCE(task_record.creator_name, 'Admin'),
        COALESCE(task_record.client_name, 'N/A'),
        COALESCE(LEFT(task_record.description, 200), 'No description provided')
      );

      -- Insert urgent notification for assigned user
      INSERT INTO urgent_notifications (
        recipient_id,
        sender_id,
        title,
        message,
        is_broadcast,
        is_acknowledged,
        priority
      ) VALUES (
        task_record.assigned_to,
        task_record.created_by,
        notification_title,
        notification_message,
        false,
        false,
        task_record.priority::text
      );

      RAISE LOG 'Created urgent notification for task % assigned to %', task_record.id, task_record.assigned_to;
    
    -- Handle assignment change to urgent/high priority task
    ELSIF NEW.action = 'assigned' AND (NEW.new_values->>'assigned_to')::uuid IS NOT NULL THEN
      notification_title := '🚨 ' || UPPER(task_record.priority::text) || ' Task Assigned to You';
      notification_message := format(
        E'TASK: %s\n\nPRIORITY: %s\nASSIGNED BY: %s\nCLIENT: %s\n\n📋 DESCRIPTION:\n%s\n\n⚠️ This task requires your immediate attention.',
        task_record.title,
        UPPER(task_record.priority::text),
        COALESCE(task_record.creator_name, 'Admin'),
        COALESCE(task_record.client_name, 'N/A'),
        COALESCE(LEFT(task_record.description, 200), 'No description provided')
      );

      -- Insert urgent notification for newly assigned user
      INSERT INTO urgent_notifications (
        recipient_id,
        sender_id,
        title,
        message,
        is_broadcast,
        is_acknowledged,
        priority
      ) VALUES (
        (NEW.new_values->>'assigned_to')::uuid,
        NEW.changed_by,
        notification_title,
        notification_message,
        false,
        false,
        task_record.priority::text
      );

      RAISE LOG 'Created urgent notification for reassignment of task %', task_record.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;