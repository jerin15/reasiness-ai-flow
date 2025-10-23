-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Role-based task visibility" ON public.tasks;

-- Create a strict policy where admins ONLY see their own tasks
CREATE POLICY "Strict role-based task visibility" 
ON public.tasks 
FOR SELECT 
USING (
  deleted_at IS NULL 
  AND (
    -- Users see tasks assigned to them
    assigned_to = auth.uid()
    OR 
    -- Users see their own personal tasks (created by them and assigned to self or unassigned)
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