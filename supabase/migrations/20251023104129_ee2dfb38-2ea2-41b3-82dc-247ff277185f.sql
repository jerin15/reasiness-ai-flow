-- Find and delete duplicate tasks
-- Strategy: Keep the oldest task for each set of duplicates

-- First, identify and delete duplicate linked tasks (where both linked_task_id point to each other)
WITH duplicate_pairs AS (
  SELECT DISTINCT 
    LEAST(t1.id, t2.id) as keep_id,
    GREATEST(t1.id, t2.id) as delete_id
  FROM tasks t1
  JOIN tasks t2 ON t1.linked_task_id = t2.id AND t2.linked_task_id = t1.id
  WHERE t1.id < t2.id
)
DELETE FROM tasks
WHERE id IN (SELECT delete_id FROM duplicate_pairs);

-- Delete tasks that are exact duplicates (same title, description, client_name, status within same user)
WITH ranked_tasks AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY 
        COALESCE(title, ''), 
        COALESCE(description, ''), 
        COALESCE(client_name, ''),
        status,
        COALESCE(created_by::text, ''),
        COALESCE(assigned_to::text, '')
      ORDER BY created_at ASC, id ASC
    ) as rn
  FROM tasks
  WHERE deleted_at IS NULL
)
DELETE FROM tasks
WHERE id IN (
  SELECT id FROM ranked_tasks WHERE rn > 1
);

-- Delete orphaned tasks that have a linked_task_id pointing to a non-existent task
DELETE FROM tasks
WHERE linked_task_id IS NOT NULL
AND linked_task_id NOT IN (SELECT id FROM tasks);

-- Add unique constraint to prevent duplicate synced tasks
-- This ensures that a task can only have ONE linked operations task
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_linked_task 
ON tasks(linked_task_id) 
WHERE linked_task_id IS NOT NULL AND deleted_at IS NULL;

-- Update the sync function to add more duplicate prevention
CREATE OR REPLACE FUNCTION public.sync_production_to_operations()
RETURNS TRIGGER AS $$
DECLARE
  new_task_id UUID;
  is_admin_personal BOOLEAN;
  operations_user_id UUID;
  existing_linked_task UUID;
BEGIN
  -- Check if this is an admin's personal task
  SELECT EXISTS (
    SELECT 1 
    FROM user_roles 
    WHERE user_id = NEW.created_by 
    AND role = 'admin'
    AND (NEW.assigned_to = NEW.created_by OR NEW.assigned_to IS NULL)
  ) INTO is_admin_personal;

  -- Check if a linked task already exists for this task
  SELECT id INTO existing_linked_task
  FROM tasks
  WHERE linked_task_id = NEW.id
  AND deleted_at IS NULL
  LIMIT 1;

  -- Only sync if:
  -- 1. Task is moving to production
  -- 2. NOT an admin personal task
  -- 3. Doesn't already have a linked task (in either direction)
  -- 4. No linked task already exists pointing to this task
  IF NEW.status = 'production' 
     AND OLD.status IS DISTINCT FROM 'production' 
     AND NOT is_admin_personal 
     AND NEW.linked_task_id IS NULL 
     AND existing_linked_task IS NULL THEN
    
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Recreate the trigger
DROP TRIGGER IF EXISTS sync_production_to_operations_trigger ON tasks;
CREATE TRIGGER sync_production_to_operations_trigger
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION sync_production_to_operations();