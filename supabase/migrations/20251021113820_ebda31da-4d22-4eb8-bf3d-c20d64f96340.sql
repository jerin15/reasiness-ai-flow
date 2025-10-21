-- Fix RLS: Drop the old policy and create new one that allows all authenticated users to update
DROP POLICY IF EXISTS "Anyone can update tasks" ON public.tasks;

CREATE POLICY "All users can update any task"
ON public.tasks
FOR UPDATE
TO authenticated
USING (deleted_at IS NULL)
WITH CHECK (deleted_at IS NULL);

-- Create task_reminders table for alarm functionality
CREATE TABLE IF NOT EXISTS public.task_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_time TIMESTAMP WITH TIME ZONE NOT NULL,
  is_snoozed BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on task_reminders
ALTER TABLE public.task_reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies for task_reminders
CREATE POLICY "Users can manage their own reminders"
ON public.task_reminders
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Add linked_task_id to tasks table to track synced tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS linked_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL;

-- Create function to sync production tasks to operations
CREATE OR REPLACE FUNCTION public.sync_production_to_operations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  operations_user_id UUID;
  creator_role app_role;
BEGIN
  -- Only trigger when status changes to 'production'
  IF NEW.status = 'production' AND (OLD.status IS NULL OR OLD.status != 'production') THEN
    -- Get the role of the user who created/updated the task
    SELECT role INTO creator_role
    FROM public.user_roles
    WHERE user_id = NEW.created_by
    LIMIT 1;
    
    -- Only create linked task if creator is admin or estimation
    IF creator_role IN ('admin', 'estimation') THEN
      -- Find an operations user (pick first one)
      SELECT user_id INTO operations_user_id
      FROM public.user_roles
      WHERE role = 'operations'
      LIMIT 1;
      
      IF operations_user_id IS NOT NULL THEN
        -- Create a linked task for operations team
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
          'production',
          NEW.priority,
          NEW.due_date,
          NEW.created_by,
          operations_user_id,
          NEW.id,
          NEW.position
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for production sync
DROP TRIGGER IF EXISTS sync_production_tasks_trigger ON public.tasks;
CREATE TRIGGER sync_production_tasks_trigger
AFTER INSERT OR UPDATE OF status ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.sync_production_to_operations();

-- Add trigger for task_reminders updated_at
CREATE TRIGGER update_task_reminders_updated_at
BEFORE UPDATE ON public.task_reminders
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();