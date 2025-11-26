-- Add RLS policy for operations team to update production tasks
CREATE POLICY "Operations can update production tasks assigned to them or unassigned"
ON public.tasks
FOR UPDATE
USING (
  has_role(auth.uid(), 'operations'::app_role) 
  AND status = 'production'::task_status
  AND (assigned_to = auth.uid() OR assigned_to IS NULL)
)
WITH CHECK (
  has_role(auth.uid(), 'operations'::app_role) 
  AND status = 'production'::task_status
  AND (assigned_to = auth.uid() OR assigned_to IS NULL OR assigned_to IN (
    SELECT user_id FROM user_roles WHERE role = 'operations'::app_role
  ))
);