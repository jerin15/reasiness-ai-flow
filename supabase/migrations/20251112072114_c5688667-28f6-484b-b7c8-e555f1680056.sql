-- Function to auto-set status to new_calls when task is assigned to client_service role
CREATE OR REPLACE FUNCTION public.auto_set_client_service_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assignee_role TEXT;
BEGIN
  -- Check if assigned_to changed
  IF (TG_OP = 'UPDATE' AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) OR 
     (TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL) THEN
    
    -- Get the role of the assigned user
    SELECT role::TEXT INTO assignee_role
    FROM user_roles
    WHERE user_id = NEW.assigned_to
    LIMIT 1;
    
    -- If assigned to client_service role, set status to new_calls
    IF assignee_role = 'client_service' THEN
      NEW.status := 'new_calls';
      NEW.status_changed_at := NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function to create estimation task when client_service moves to quotation
CREATE OR REPLACE FUNCTION public.sync_quotation_to_estimation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  estimation_user_id UUID;
  existing_linked_task UUID;
  assignee_role TEXT;
  assignee_name TEXT;
BEGIN
  -- Check if task moved to quotation status
  IF NEW.status = 'quotation' AND OLD.status IS DISTINCT FROM 'quotation' THEN
    
    -- Get the role of the user who owns this task
    SELECT ur.role::TEXT, p.full_name 
    INTO assignee_role, assignee_name
    FROM user_roles ur
    LEFT JOIN profiles p ON p.id = ur.user_id
    WHERE ur.user_id = NEW.assigned_to
    LIMIT 1;
    
    -- Only proceed if task is owned by client_service role
    IF assignee_role = 'client_service' THEN
      
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
            '📋 QUOTATION REQUEST: ' || NEW.title,
            '🔔 Quotation requested by ' || COALESCE(assignee_name, 'Client Service Team') || 
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
          
          RAISE LOG 'Created estimation quotation task for client_service task %', NEW.id;
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for auto-setting client_service status
DROP TRIGGER IF EXISTS auto_set_client_service_status_trigger ON public.tasks;
CREATE TRIGGER auto_set_client_service_status_trigger
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_client_service_status();

-- Create trigger for syncing quotation requests to estimation
DROP TRIGGER IF EXISTS sync_quotation_to_estimation_trigger ON public.tasks;
CREATE TRIGGER sync_quotation_to_estimation_trigger
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_quotation_to_estimation();