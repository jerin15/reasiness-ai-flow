-- Fix audit log trigger to handle deletes properly
DROP TRIGGER IF EXISTS task_audit_trigger ON public.tasks;

CREATE OR REPLACE FUNCTION public.log_task_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_role TEXT;
  action_type TEXT;
BEGIN
  -- Get user's role
  SELECT role::TEXT INTO user_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    action_type := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      action_type := 'status_changed';
    ELSIF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      action_type := 'assigned';
    ELSE
      action_type := 'updated';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    action_type := 'deleted';
  END IF;

  -- Log the change - for DELETE, only log if it's a soft delete (deleted_at is set)
  IF TG_OP = 'DELETE' THEN
    -- Don't try to insert into audit log on hard delete
    RETURN OLD;
  ELSE
    INSERT INTO public.task_audit_log (task_id, action, changed_by, old_values, new_values, role)
    VALUES (
      NEW.id, 
      action_type, 
      auth.uid(), 
      CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::JSONB ELSE NULL END,
      row_to_json(NEW)::JSONB,
      COALESCE(user_role, 'unknown')
    );
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER task_audit_trigger
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_task_audit();

-- Fix the sync function to prevent duplication in admin panels
DROP TRIGGER IF EXISTS sync_production_trigger ON public.tasks;

CREATE OR REPLACE FUNCTION public.sync_production_to_operations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_task_id UUID;
  is_admin_or_self_task BOOLEAN;
  operations_user_id UUID;
  existing_linked_task UUID;
  creator_role TEXT;
BEGIN
  -- Check if this is an admin's task or a task assigned to self
  SELECT EXISTS (
    SELECT 1 
    FROM user_roles 
    WHERE user_id = NEW.created_by 
    AND role = 'admin'
  ) INTO is_admin_or_self_task;
  
  -- Also check if task is assigned to self or unassigned (personal task)
  IF is_admin_or_self_task OR NEW.assigned_to = NEW.created_by OR NEW.assigned_to IS NULL THEN
    is_admin_or_self_task := TRUE;
  END IF;

  -- Check if a linked task already exists for this task
  SELECT id INTO existing_linked_task
  FROM tasks
  WHERE linked_task_id = NEW.id
  AND deleted_at IS NULL
  LIMIT 1;

  -- Only sync if:
  -- 1. Task is moving to production
  -- 2. NOT an admin/personal task
  -- 3. Task is assigned to someone else (not self or null)
  -- 4. Doesn't already have a linked task
  -- 5. No linked task already exists pointing to this task
  IF NEW.status = 'production' 
     AND OLD.status IS DISTINCT FROM 'production' 
     AND NEW.assigned_to IS NOT NULL
     AND NEW.assigned_to != NEW.created_by
     AND NEW.linked_task_id IS NULL 
     AND existing_linked_task IS NULL THEN
    
    -- Get creator's role
    SELECT role::TEXT INTO creator_role
    FROM user_roles 
    WHERE user_id = NEW.created_by
    LIMIT 1;
    
    -- Check if creator is estimation or admin role
    IF creator_role IN ('estimation', 'admin') THEN
      -- Find an operations user to assign as creator
      SELECT user_id INTO operations_user_id
      FROM user_roles 
      WHERE role = 'operations'
      LIMIT 1;

      -- Only create if we found an operations user
      IF operations_user_id IS NOT NULL THEN
        -- Create a new task for operations team
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
          NEW.title,
          NEW.description,
          'production',
          NEW.priority,
          NEW.due_date,
          NEW.type,
          NEW.client_name,
          NEW.supplier_name,
          operations_user_id,
          NULL,
          NEW.id,
          NEW.position,
          NEW.status_changed_at
        ) RETURNING id INTO new_task_id;

        -- Update original task with link to operations task
        UPDATE public.tasks 
        SET linked_task_id = new_task_id 
        WHERE id = NEW.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_production_trigger
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_production_to_operations();