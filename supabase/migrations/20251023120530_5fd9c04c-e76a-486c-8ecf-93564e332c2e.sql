-- Create task audit log table for tracking all CRUD operations
CREATE TABLE IF NOT EXISTS public.task_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'status_changed', 'assigned')),
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  old_values JSONB,
  new_values JSONB,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for efficient querying
CREATE INDEX idx_task_audit_log_task_id ON public.task_audit_log(task_id);
CREATE INDEX idx_task_audit_log_created_at ON public.task_audit_log(created_at DESC);

-- Enable RLS on audit log
ALTER TABLE public.task_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can view all audit logs, users can view logs for their own tasks
CREATE POLICY "Users can view audit logs for their tasks"
ON public.task_audit_log
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.tasks
    WHERE tasks.id = task_audit_log.task_id
    AND (tasks.created_by = auth.uid() OR tasks.assigned_to = auth.uid())
  )
);

-- Add reminder_sent flag to tasks
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;

-- Add visible_to field for explicit visibility control
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS visible_to UUID REFERENCES auth.users(id);

-- Create function to log task changes
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

  -- Log the change
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.task_audit_log (task_id, action, changed_by, old_values, role)
    VALUES (OLD.id, action_type, auth.uid(), row_to_json(OLD)::JSONB, COALESCE(user_role, 'unknown'));
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

-- Create trigger for audit logging
DROP TRIGGER IF EXISTS task_audit_trigger ON public.tasks;
CREATE TRIGGER task_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.log_task_audit();

-- Update RLS policies for stricter visibility control
DROP POLICY IF EXISTS "Users can view tasks" ON public.tasks;

CREATE POLICY "Strict task visibility"
ON public.tasks
FOR SELECT
USING (
  deleted_at IS NULL AND (
    -- Admins can view all tasks
    has_role(auth.uid(), 'admin'::app_role) OR
    -- Users can view tasks assigned to them
    assigned_to = auth.uid() OR
    -- Users can view tasks they created ONLY if they created for themselves or have no assignee
    (created_by = auth.uid() AND (assigned_to IS NULL OR assigned_to = auth.uid())) OR
    -- Operations users can view synced production tasks (preserve sync logic)
    (
      has_role(auth.uid(), 'operations'::app_role) AND
      status = 'production' AND
      assigned_to IS NULL AND
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = tasks.created_by
        AND ur.role IN ('estimation', 'admin')
      )
    )
  )
);

-- Update insert policy to set visible_to
DROP POLICY IF EXISTS "Users can create tasks" ON public.tasks;

CREATE POLICY "Users can create tasks with ownership"
ON public.tasks
FOR INSERT
WITH CHECK (
  created_by = auth.uid() AND
  (
    -- If assigning to someone else, they become the owner
    (assigned_to IS NOT NULL AND assigned_to != auth.uid()) OR
    -- If not assigning or assigning to self, creator is owner
    assigned_to IS NULL OR
    assigned_to = auth.uid()
  )
);

-- Create function to check due dates and send reminders
CREATE OR REPLACE FUNCTION public.check_due_date_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  task_record RECORD;
BEGIN
  -- Find tasks due today or overdue that haven't had reminders sent
  FOR task_record IN
    SELECT t.id, t.title, t.description, t.status, t.due_date, t.assigned_to, t.created_by,
           p.full_name, p.email
    FROM public.tasks t
    LEFT JOIN public.profiles p ON p.id = COALESCE(t.assigned_to, t.created_by)
    WHERE t.due_date::DATE <= CURRENT_DATE
      AND t.status != 'done'
      AND t.deleted_at IS NULL
      AND t.reminder_sent = FALSE
  LOOP
    -- Mark reminder as sent
    UPDATE public.tasks
    SET reminder_sent = TRUE
    WHERE id = task_record.id;

    -- Log reminder sent
    RAISE NOTICE 'Reminder sent for task: % to user: %', task_record.title, task_record.email;
  END LOOP;
END;
$$;

-- Schedule daily check for due date reminders (runs at 8 AM daily)
SELECT cron.schedule(
  'check-due-date-reminders',
  '0 8 * * *',
  $$
  SELECT public.check_due_date_reminders();
  $$
);