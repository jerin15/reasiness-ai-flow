-- Function to create urgent notifications for high-priority tasks
CREATE OR REPLACE FUNCTION create_urgent_notification_for_task()
RETURNS TRIGGER AS $$
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
      notification_title := '🚨 Urgent Task Assigned to You';
      notification_message := format(
        'Task: %s\nPriority: %s\nCreated by: %s\nClient: %s\n\nPlease review and begin work immediately.',
        task_record.title,
        UPPER(task_record.priority),
        COALESCE(task_record.creator_name, 'Admin'),
        COALESCE(task_record.client_name, 'N/A')
      );

      -- Insert urgent notification for assigned user
      INSERT INTO urgent_notifications (
        recipient_id,
        sender_id,
        title,
        message,
        is_broadcast,
        acknowledged
      ) VALUES (
        task_record.assigned_to,
        task_record.created_by,
        notification_title,
        notification_message,
        false,
        false
      );

      RAISE LOG 'Created urgent notification for task % assigned to %', task_record.id, task_record.assigned_to;
    
    -- Handle assignment change to urgent/high priority task
    ELSIF NEW.action = 'assigned' AND (NEW.new_values->>'assigned_to')::uuid IS NOT NULL THEN
      notification_title := '🚨 Urgent Task Reassigned to You';
      notification_message := format(
        'Task: %s\nPriority: %s\nReassigned by: %s\nClient: %s\n\nThis urgent task now requires your immediate attention.',
        task_record.title,
        UPPER(task_record.priority),
        COALESCE(task_record.creator_name, 'Admin'),
        COALESCE(task_record.client_name, 'N/A')
      );

      -- Insert urgent notification for newly assigned user
      INSERT INTO urgent_notifications (
        recipient_id,
        sender_id,
        title,
        message,
        is_broadcast,
        acknowledged
      ) VALUES (
        (NEW.new_values->>'assigned_to')::uuid,
        NEW.changed_by,
        notification_title,
        notification_message,
        false,
        false
      );

      RAISE LOG 'Created urgent notification for reassignment of task %', task_record.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_urgent_notification_on_task_change ON task_audit_log;

-- Create trigger on task_audit_log for urgent notifications
CREATE TRIGGER trigger_urgent_notification_on_task_change
  AFTER INSERT ON task_audit_log
  FOR EACH ROW
  WHEN (NEW.action IN ('created', 'assigned'))
  EXECUTE FUNCTION create_urgent_notification_for_task();