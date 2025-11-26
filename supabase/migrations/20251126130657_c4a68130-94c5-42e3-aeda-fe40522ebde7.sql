
-- Drop the existing restrictive audit log policy
DROP POLICY IF EXISTS "Users can create audit logs for their tasks" ON public.task_audit_log;

-- Create a clearer policy that allows admins to log any task changes
CREATE POLICY "Users can create audit logs"
ON public.task_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  changed_by = auth.uid() AND (
    -- Admins and tech heads can log any task
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'technical_head'::app_role) OR
    -- Designers can log their tasks
    has_role(auth.uid(), 'designer'::app_role) OR
    -- Operations can log their tasks
    has_role(auth.uid(), 'operations'::app_role) OR
    -- Estimation can log their tasks
    has_role(auth.uid(), 'estimation'::app_role) OR
    -- Other users can log tasks they created or are assigned to
    (NOT has_role(auth.uid(), 'admin'::app_role) AND 
     NOT has_role(auth.uid(), 'technical_head'::app_role) AND
     EXISTS (
       SELECT 1 FROM tasks 
       WHERE tasks.id = task_audit_log.task_id 
       AND (tasks.created_by = auth.uid() OR tasks.assigned_to = auth.uid())
     ))
  )
);
