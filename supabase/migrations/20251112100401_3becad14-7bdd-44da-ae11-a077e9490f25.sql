-- Fix task_audit_log RLS to allow admins to create audit logs for ANY task

DROP POLICY IF EXISTS "Users can create audit logs for their tasks" ON public.task_audit_log;

CREATE POLICY "Users can create audit logs for their tasks" ON public.task_audit_log
FOR INSERT
WITH CHECK (
  changed_by = auth.uid() AND (
    -- Admins and technical heads can audit ANY task
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'technical_head'::app_role) OR
    -- Regular users can only audit tasks they own
    EXISTS (
      SELECT 1 FROM tasks 
      WHERE tasks.id = task_audit_log.task_id 
      AND (tasks.created_by = auth.uid() OR tasks.assigned_to = auth.uid())
    )
  )
);