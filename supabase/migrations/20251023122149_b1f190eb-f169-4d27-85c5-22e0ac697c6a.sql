-- Drop existing policies
DROP POLICY IF EXISTS "Strict task visibility" ON public.tasks;
DROP POLICY IF EXISTS "Everyone can update all tasks" ON public.tasks;
DROP POLICY IF EXISTS "Role-based task updates" ON public.tasks;

-- Create a new strict visibility policy
CREATE POLICY "Strict task visibility" ON public.tasks
FOR SELECT USING (
  deleted_at IS NULL AND (
    -- Admins ONLY see tasks they created for themselves
    (has_role(auth.uid(), 'admin'::app_role) AND created_by = auth.uid() AND (assigned_to = auth.uid() OR assigned_to IS NULL))
    OR
    -- Users see tasks assigned to them
    (assigned_to = auth.uid())
    OR
    -- Operations can see unassigned production tasks from estimation/admin
    (has_role(auth.uid(), 'operations'::app_role) AND status = 'production' AND assigned_to IS NULL AND EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = tasks.created_by 
      AND ur.role IN ('estimation', 'admin')
    ))
  )
);

-- Create update policy allowing admins to manage all tasks
CREATE POLICY "Admin and owner task updates" ON public.tasks
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR assigned_to = auth.uid()
  OR (created_by = auth.uid() AND (assigned_to = auth.uid() OR assigned_to IS NULL))
);