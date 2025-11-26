-- Update the urgent notification trigger to only notify admins and operations for production/done tasks
CREATE OR REPLACE FUNCTION public.create_urgent_notification_for_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  task_record RECORD;
  notification_title TEXT;
  notification_message TEXT;
  target_recipient_id UUID;
BEGIN
  -- Get the full task details
  SELECT t.*, p.full_name as creator_name
  INTO task_record
  FROM tasks t
  LEFT JOIN profiles p ON p.id = t.created_by
  WHERE t.id = NEW.task_id;

  -- If task is in production or done, only notify admins and operations team
  IF task_record.status IN ('production', 'done') THEN
    -- Check if the changed_by user is admin or operations
    IF NOT (has_role(NEW.changed_by, 'admin'::app_role) OR has_role(NEW.changed_by, 'operations'::app_role)) THEN
      -- Skip notification for non-admin/operations users
      RETURN NEW;
    END IF;
    
    -- For operations tasks, only notify if it's urgent/high priority AND assigned
    IF task_record.priority IN ('urgent', 'high') AND task_record.assigned_to IS NOT NULL THEN
      -- Check if recipient is also admin or operations
      IF has_role(task_record.assigned_to, 'admin'::app_role) OR has_role(task_record.assigned_to, 'operations'::app_role) THEN
        target_recipient_id := task_record.assigned_to;
      ELSE
        -- Don't notify non-operations users about operations tasks
        RETURN NEW;
      END IF;
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    -- For non-operations tasks, use existing logic
    IF NOT (task_record.priority IN ('urgent', 'high') AND task_record.assigned_to IS NOT NULL) THEN
      RETURN NEW;
    END IF;
    target_recipient_id := task_record.assigned_to;
  END IF;

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

    INSERT INTO urgent_notifications (
      recipient_id,
      sender_id,
      title,
      message,
      is_broadcast,
      is_acknowledged,
      priority
    ) VALUES (
      target_recipient_id,
      task_record.created_by,
      notification_title,
      notification_message,
      false,
      false,
      task_record.priority::text
    );

    RAISE LOG 'Created urgent notification for task % assigned to %', task_record.id, target_recipient_id;
  
  -- Handle assignment change
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

  RETURN NEW;
END;
$function$;