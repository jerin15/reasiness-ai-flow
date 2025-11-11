-- Add INSERT policy for task_audit_log to allow users to log actions on their tasks
CREATE POLICY "Users can create audit logs for their tasks"
ON public.task_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  changed_by = auth.uid()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'technical_head'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.tasks
      WHERE tasks.id = task_audit_log.task_id
        AND (tasks.created_by = auth.uid() OR tasks.assigned_to = auth.uid())
    )
  )
);