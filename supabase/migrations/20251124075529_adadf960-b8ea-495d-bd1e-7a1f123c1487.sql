-- Fix the audit log INSERT policy to allow designers to log mockup task changes
DROP POLICY IF EXISTS "Users can create audit logs for their tasks" ON public.task_audit_log;

CREATE POLICY "Users can create audit logs for their tasks"
ON public.task_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  changed_by = auth.uid() AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'technical_head'::app_role) OR
    has_role(auth.uid(), 'designer'::app_role) OR  -- Allow designers to create audit logs
    (EXISTS (
      SELECT 1 FROM tasks 
      WHERE tasks.id = task_audit_log.task_id 
      AND (tasks.created_by = auth.uid() OR tasks.assigned_to = auth.uid())
    ))
  )
);