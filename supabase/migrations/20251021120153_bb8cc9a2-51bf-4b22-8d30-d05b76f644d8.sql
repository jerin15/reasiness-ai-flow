-- Update the sync trigger to only sync non-admin personal tasks
-- Drop existing trigger and function
DROP TRIGGER IF EXISTS sync_production_tasks_trigger ON public.tasks;
DROP FUNCTION IF EXISTS public.sync_production_to_operations();

-- Create updated function that checks if task is admin personal task
CREATE OR REPLACE FUNCTION public.sync_production_to_operations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_task_id UUID;
  is_admin_personal BOOLEAN;
BEGIN
  -- Check if this is an admin's personal task (created by admin for themselves)
  SELECT EXISTS (
    SELECT 1 
    FROM user_roles 
    WHERE user_id = NEW.created_by 
    AND role = 'admin'
    AND (NEW.assigned_to = NEW.created_by OR NEW.assigned_to IS NULL)
  ) INTO is_admin_personal;

  -- Only sync if task is moving to production and is NOT an admin personal task
  IF NEW.status = 'production' AND OLD.status IS DISTINCT FROM 'production' 
     AND NOT is_admin_personal THEN
    
    -- Check if creator/assignee is estimation or admin role
    IF EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = NEW.created_by 
      AND role IN ('estimation', 'admin')
    ) THEN
      -- Create a new task for operations team with linked reference
      INSERT INTO public.tasks (
        title,
        description,
        status,
        priority,
        due_date,
        created_by,
        assigned_to,
        linked_task_id,
        position
      ) VALUES (
        NEW.title,
        NEW.description,
        'todo', -- Start in operations todo
        NEW.priority,
        NEW.due_date,
        NEW.created_by,
        NULL, -- Not assigned initially
        NEW.id, -- Link to original task
        NEW.position
      ) RETURNING id INTO new_task_id;

      -- Update original task with link to operations task
      UPDATE public.tasks 
      SET linked_task_id = new_task_id 
      WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER sync_production_tasks_trigger
AFTER UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.sync_production_to_operations();