-- Fix the sync_quotation_to_estimation function to check creator's role instead of assignee
CREATE OR REPLACE FUNCTION public.sync_quotation_to_estimation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  estimation_user_id UUID;
  existing_linked_task UUID;
  creator_role TEXT;
  creator_name TEXT;
BEGIN
  -- Check if task moved to quotation status
  IF NEW.status = 'quotation' AND OLD.status IS DISTINCT FROM 'quotation' THEN
    
    -- Get the role of the user who created this task
    SELECT ur.role::TEXT, p.full_name 
    INTO creator_role, creator_name
    FROM user_roles ur
    LEFT JOIN profiles p ON p.id = ur.user_id
    WHERE ur.user_id = NEW.created_by
    LIMIT 1;
    
    -- Only proceed if task is created by client_service role
    IF creator_role = 'client_service' THEN
      
      -- Check if a linked task already exists
      SELECT id INTO existing_linked_task
      FROM tasks
      WHERE linked_task_id = NEW.id
      AND deleted_at IS NULL
      LIMIT 1;
      
      -- Only create if no linked task exists
      IF existing_linked_task IS NULL THEN
        
        -- Find an estimation user
        SELECT user_id INTO estimation_user_id
        FROM user_roles
        WHERE role = 'estimation'
        LIMIT 1;
        
        -- Create task for estimation if user found
        IF estimation_user_id IS NOT NULL THEN
          INSERT INTO public.tasks (
            title,
            description,
            status,
            priority,
            due_date,
            type,
            client_name,
            supplier_name,
            created_by,
            assigned_to,
            linked_task_id,
            position,
            status_changed_at
          ) VALUES (
            '📋 RFQ: ' || NEW.title,
            '🔔 Quotation requested by ' || COALESCE(creator_name, 'Client Service Team') || 
            E'\n\n' || 
            '📝 Original Task Details:' ||
            E'\n' || COALESCE(NEW.description, 'No description provided') ||
            E'\n\n' ||
            '👤 Client: ' || COALESCE(NEW.client_name, 'Not specified') ||
            E'\n' ||
            '🏭 Supplier: ' || COALESCE(NEW.supplier_name, 'Not specified') ||
            E'\n\n' ||
            '⚡ Action Required: Please prepare a quotation for this client request.',
            'todo',
            NEW.priority,
            NEW.due_date,
            'quotation',
            NEW.client_name,
            NEW.supplier_name,
            estimation_user_id,
            estimation_user_id,
            NEW.id,
            0,
            NOW()
          );
          
          RAISE LOG 'Created estimation RFQ task for client_service task %', NEW.id;
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;