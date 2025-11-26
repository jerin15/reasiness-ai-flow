
-- Drop the restrictive operations update policy
DROP POLICY IF EXISTS "Operations and admins can update operations tasks" ON public.tasks;

-- Create a clearer policy for operations tasks that allows admins full control
CREATE POLICY "Admins can update all operations tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND status IN ('production', 'done')
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND status IN ('production', 'done')
);

-- Create a separate policy for operations team members
CREATE POLICY "Operations team can update their tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'operations'::app_role)
  AND status IN ('production', 'done')
  AND (
    assigned_to = auth.uid() 
    OR assigned_to IS NULL
    OR assigned_to IN (
      SELECT user_id FROM user_roles WHERE role = 'operations'
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'operations'::app_role)
  AND status IN ('production', 'done')
  AND (
    assigned_to IS NULL
    OR assigned_to IN (
      SELECT user_id FROM user_roles WHERE role = 'operations'
    )
  )
);
