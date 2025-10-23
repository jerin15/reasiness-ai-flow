-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Strict task visibility" ON public.tasks;

-- Create a proper policy that allows admins to view all tasks (for management)
-- but filters what appears in their personal panel via frontend logic
CREATE POLICY "Role-based task visibility" ON public.tasks
FOR SELECT USING (
  deleted_at IS NULL AND (
    -- Admins can view ALL tasks (for management and viewing team member panels)
    has_role(auth.uid(), 'admin'::app_role)
    OR
    -- Users see tasks assigned to them
    (assigned_to = auth.uid())
    OR
    -- Users see tasks they created for themselves (unassigned or self-assigned)
    (created_by = auth.uid() AND (assigned_to IS NULL OR assigned_to = auth.uid()))
    OR
    -- Operations can see unassigned production tasks from estimation/admin
    (has_role(auth.uid(), 'operations'::app_role) AND status = 'production' AND assigned_to IS NULL AND EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = tasks.created_by 
      AND ur.role IN ('estimation', 'admin')
    ))
  )
);