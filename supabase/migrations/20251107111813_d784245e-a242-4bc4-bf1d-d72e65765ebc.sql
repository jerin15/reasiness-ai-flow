-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Admin and owner task updates" ON public.tasks;

-- Create a new policy that allows task creators and assignees to update tasks
-- The WITH CHECK allows creators to reassign tasks to others
CREATE POLICY "Admin and owner task updates" ON public.tasks
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
)
WITH CHECK (
  -- Allow admins and technical heads to update anything
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role)
  -- Allow task creators to update tasks they created (including reassigning)
  OR created_by = auth.uid()
  -- Allow current assignees to update their assigned tasks
  OR (assigned_to = auth.uid() AND assigned_to = (SELECT assigned_to FROM tasks WHERE id = tasks.id))
);