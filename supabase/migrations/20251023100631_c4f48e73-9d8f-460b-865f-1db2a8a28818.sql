-- Drop and recreate the sync trigger to prevent duplicates
DROP TRIGGER IF EXISTS sync_production_to_operations_trigger ON tasks;

-- Recreate the function with better duplicate prevention
CREATE OR REPLACE FUNCTION public.sync_production_to_operations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_task_id UUID;
  is_admin_personal BOOLEAN;
  operations_user_id UUID;
BEGIN
  -- Check if this is an admin's personal task
  SELECT EXISTS (
    SELECT 1 
    FROM user_roles 
    WHERE user_id = NEW.created_by 
    AND role = 'admin'
    AND (NEW.assigned_to = NEW.created_by OR NEW.assigned_to IS NULL)
  ) INTO is_admin_personal;

  -- Only sync if task is moving to production and is NOT an admin personal task
  -- AND doesn't already have a linked task (prevent duplicates)
  IF NEW.status = 'production' 
     AND OLD.status IS DISTINCT FROM 'production' 
     AND NOT is_admin_personal 
     AND NEW.linked_task_id IS NULL THEN
    
    -- Check if creator is estimation or admin role
    IF EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = NEW.created_by 
      AND role IN ('estimation', 'admin')
    ) THEN
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
          position
        ) VALUES (
          NEW.title,
          NEW.description,
          'production',
          NEW.priority,
          NEW.due_date,
          NEW.type,
          NEW.client_name,
          NEW.supplier_name,
          operations_user_id, -- Set operations user as creator
          NULL,
          NEW.id, -- Link back to original
          NEW.position
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
$function$;

-- Recreate the trigger
CREATE TRIGGER sync_production_to_operations_trigger
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION sync_production_to_operations();