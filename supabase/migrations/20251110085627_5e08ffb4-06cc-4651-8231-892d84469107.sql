-- Drop and recreate the trigger with original loop logic
DROP TRIGGER IF EXISTS trigger_product_approval_notification ON public.task_products;
DROP FUNCTION IF EXISTS public.notify_product_approval_change();

-- Create function that only sends notifications (no auto-advancement)
CREATE OR REPLACE FUNCTION public.notify_product_approval_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Determine recipient (send to task creator/estimation team)
  recipient_user_id := task_record.created_by;

  -- Only send notification if status changed to approved or rejected
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status) AND 
     (NEW.approval_status IN ('approved', 'rejected', 'needs_revision')) THEN
    
    -- Set notification based on approval status
    IF NEW.approval_status = 'approved' THEN
      notification_title := '✅ Product Approved';
      notification_message := format(
        'Task: %s\n\n%s\n\nPrice: AED %s\n\nThis product has been approved.',
        task_record.title,
        product_info,
        COALESCE(NEW.final_price::TEXT, NEW.estimated_price::TEXT)
      );
    ELSIF NEW.approval_status = 'rejected' THEN
      notification_title := '❌ Product Rejected';
      notification_message := format(
        'Task: %s\n\n%s\n\nPrice: AED %s\n\nReason: %s\n\nPlease review and revise this product.',
        task_record.title,
        product_info,
        COALESCE(NEW.final_price::TEXT, NEW.estimated_price::TEXT),
        COALESCE(NEW.approval_notes, 'No reason provided')
      );
    ELSIF NEW.approval_status = 'needs_revision' THEN
      notification_title := '🔄 Product Needs Revision';
      notification_message := format(
        'Task: %s\n\n%s\n\nPrice: AED %s\n\nNotes: %s\n\nPlease make the requested changes.',
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
      acknowledged,
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

    RAISE LOG 'Product approval notification sent for product % in task % to user %', 
      NEW.product_name, task_record.id, recipient_user_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Re-create the trigger
CREATE TRIGGER trigger_product_approval_notification
  AFTER UPDATE ON public.task_products
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_product_approval_change();