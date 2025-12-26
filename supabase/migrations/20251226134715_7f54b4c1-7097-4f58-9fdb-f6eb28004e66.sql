-- Update the sync_production_to_operations function to better prevent duplicates
CREATE OR REPLACE FUNCTION public.sync_production_to_operations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_task_id UUID;
  is_admin_or_self_task BOOLEAN;
  operations_user_id UUID;
  existing_linked_task UUID;
  existing_reverse_link UUID;
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

  -- Check if a linked task already exists for this task (this task links TO another)
  SELECT id INTO existing_linked_task
  FROM tasks
  WHERE linked_task_id = NEW.id
  AND deleted_at IS NULL
  LIMIT 1;

  -- Also check if THIS task already has a linked_task_id (it links FROM another)
  existing_reverse_link := NEW.linked_task_id;

  -- Only sync if:
  -- 1. Task is moving to production
  -- 2. NOT an admin/personal task
  -- 3. Task is assigned to someone else (not self or null) OR unassigned (from FOR PRODUCTION)
  -- 4. Doesn't already have a linked task
  -- 5. No linked task already exists pointing to this task
  -- 6. This task doesn't already link to another task
  IF NEW.status = 'production' 
     AND OLD.status IS DISTINCT FROM 'production' 
     AND NEW.linked_task_id IS NULL 
     AND existing_linked_task IS NULL 
     AND existing_reverse_link IS NULL THEN
    
    -- Get creator's role
    SELECT role::TEXT INTO creator_role
    FROM user_roles 
    WHERE user_id = NEW.created_by
    LIMIT 1;
    
    -- Check if creator is estimation, admin, or designer role (tasks coming from FOR PRODUCTION)
    IF creator_role IN ('estimation', 'admin', 'designer') THEN
      -- Find an operations user to assign as creator
      SELECT user_id INTO operations_user_id
      FROM user_roles 
      WHERE role = 'operations'
      LIMIT 1;

      -- Only create if we found an operations user
      IF operations_user_id IS NOT NULL THEN
        -- Double-check: ensure no duplicate exists right before insert
        SELECT id INTO existing_linked_task
        FROM tasks
        WHERE linked_task_id = NEW.id
        AND deleted_at IS NULL
        LIMIT 1;
        
        IF existing_linked_task IS NULL THEN
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
            status_changed_at,
            delivery_instructions,
            delivery_address
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
            NEW.status_changed_at,
            NEW.delivery_instructions,
            NEW.delivery_address
          ) RETURNING id INTO new_task_id;

          -- Update original task with link to operations task
          UPDATE public.tasks 
          SET linked_task_id = new_task_id 
          WHERE id = NEW.id;
          
          RAISE LOG 'Created operations task % for source task %', new_task_id, NEW.id;
        ELSE
          RAISE LOG 'Skipped duplicate operations task creation - already exists for task %', NEW.id;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;