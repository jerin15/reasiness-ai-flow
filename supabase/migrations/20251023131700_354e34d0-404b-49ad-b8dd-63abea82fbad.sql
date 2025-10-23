-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Strict role-based task visibility" ON public.tasks;

-- Create policy that allows admins to see all tasks, but regular users only see their own
CREATE POLICY "Admin and user task visibility" 
ON public.tasks 
FOR SELECT 
USING (
  deleted_at IS NULL 
  AND (
    -- Admins can see all tasks
    has_role(auth.uid(), 'admin'::app_role)
    OR
    -- Regular users see tasks assigned to them
    assigned_to = auth.uid()
    OR 
    -- Regular users see their own personal tasks (created by them and assigned to self or unassigned)
    (created_by = auth.uid() AND (assigned_to IS NULL OR assigned_to = auth.uid()))
    OR
    -- Operations users see unassigned production tasks from estimation/admin
    (
      has_role(auth.uid(), 'operations'::app_role) 
      AND status = 'production'::task_status 
      AND assigned_to IS NULL 
      AND EXISTS (
        SELECT 1 
        FROM user_roles ur 
        WHERE ur.user_id = tasks.created_by 
        AND ur.role IN ('estimation'::app_role, 'admin'::app_role)
      )
    )
  )
);