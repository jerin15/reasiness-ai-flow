-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Operations can update production tasks assigned to them or unas" ON public.tasks;

-- Create a new policy that allows operations and admins to manage production and done tasks
CREATE POLICY "Operations and admins can update operations tasks"
ON public.tasks
FOR UPDATE
USING (
  -- Admins can update any operations task
  (has_role(auth.uid(), 'admin'::app_role) AND status IN ('production'::task_status, 'done'::task_status))
  OR
  -- Operations users can update tasks that are in production/done status
  (has_role(auth.uid(), 'operations'::app_role) 
   AND status IN ('production'::task_status, 'done'::task_status))
)
WITH CHECK (
  -- Admins can make any changes
  (has_role(auth.uid(), 'admin'::app_role) AND status IN ('production'::task_status, 'done'::task_status))
  OR
  -- Operations users can update and assign to any operations team member
  (has_role(auth.uid(), 'operations'::app_role) 
   AND status IN ('production'::task_status, 'done'::task_status)
   AND (
     assigned_to IS NULL 
     OR assigned_to IN (SELECT user_id FROM user_roles WHERE role = 'operations'::app_role)
   ))
);