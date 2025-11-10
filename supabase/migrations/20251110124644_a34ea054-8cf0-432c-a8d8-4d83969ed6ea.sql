
-- Update notify_product_approval_change to send notifications to designers for with_client tasks
CREATE OR REPLACE FUNCTION public.notify_product_approval_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  task_record RECORD;
  product_info TEXT;
  notification_title TEXT;
  notification_message TEXT;
  recipient_user_id UUID;
BEGIN
  -- Get task and product details
  SELECT 
    t.*,
    p.full_name as assigned_user_name,
    creator.full_name as creator_name
  INTO task_record
  FROM tasks t
  LEFT JOIN profiles p ON p.id = t.assigned_to
  LEFT JOIN profiles creator ON creator.id = t.created_by
  WHERE t.id = NEW.task_id;

  -- Build product info string
  product_info := format(
    'Product: %s (Qty: %s %s)',
    NEW.product_name,
    NEW.quantity,
    NEW.unit
  );

  -- Determine recipient based on task status
  IF task_record.status = 'with_client' THEN
    -- For with_client tasks, notify a designer user
    SELECT user_id INTO recipient_user_id
    FROM user_roles
    WHERE role = 'designer'
    LIMIT 1;
    
    -- Fallback to task creator if no designer found
    IF recipient_user_id IS NULL THEN
      recipient_user_id := task_record.created_by;
    END IF;
  ELSE
    -- For other statuses, notify the task creator
    recipient_user_id := task_record.created_by;
  END IF;

  -- Only send notification if status changed to approved or rejected
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status) AND 
     (NEW.approval_status IN ('approved', 'rejected', 'needs_revision')) THEN
    
    -- Set notification based on approval status
    IF NEW.approval_status = 'approved' THEN
      notification_title := '✅ Product Approved';
      notification_message := format(
        'Task: %s

%s

Price: AED %s

This product has been approved and is ready for production.',
        task_record.title,
        product_info,
        COALESCE(NEW.final_price::TEXT, NEW.estimated_price::TEXT)
      );
    ELSIF NEW.approval_status = 'rejected' THEN
      notification_title := '❌ Product Rejected';
      notification_message := format(
        'Task: %s

%s

Price: AED %s

Reason: %s

Please review and revise this product.',
        task_record.title,
        product_info,
        COALESCE(NEW.final_price::TEXT, NEW.estimated_price::TEXT),
        COALESCE(NEW.approval_notes, 'No reason provided')
      );
    ELSIF NEW.approval_status = 'needs_revision' THEN
      notification_title := '🔄 Product Needs Revision';
      notification_message := format(
        'Task: %s

%s

Price: AED %s

Notes: %s

Please make the requested changes.',
        task_record.title,
        product_info,
        COALESCE(NEW.final_price::TEXT, NEW.estimated_price::TEXT),
        COALESCE(NEW.approval_notes, 'No notes provided')
      );
    END IF;

    -- Insert notification for the recipient
    INSERT INTO urgent_notifications (
      recipient_id,
      sender_id,
      title,
      message,
      is_broadcast,
      is_acknowledged,
      priority
    ) VALUES (
      recipient_user_id,
      NEW.approved_by,
      notification_title,
      notification_message,
      false,
      false,
      CASE 
        WHEN NEW.approval_status = 'rejected' THEN 'high'
        ELSE 'medium'
      END
    );

    RAISE LOG 'Product approval notification sent for product % in task % (status: %) to user %', 
      NEW.product_name, task_record.id, task_record.status, recipient_user_id;
  END IF;

  RETURN NEW;
END;
$$;
