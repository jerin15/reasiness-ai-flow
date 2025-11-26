
-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Admin and user task visibility" ON public.tasks;

-- Create new SELECT policy that allows admins to see deleted tasks too
CREATE POLICY "Admin and user task visibility"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  -- Admins and tech heads can see all tasks (including deleted ones)
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role)
  OR
  -- Other users can only see non-deleted tasks they have access to
  (
    deleted_at IS NULL 
    AND (
      -- Personal admin tasks
      (is_personal_admin_task = true AND created_by = auth.uid())
      OR
      -- Regular tasks
      (
        (is_personal_admin_task = false OR is_personal_admin_task IS NULL)
        AND (
          assigned_to = auth.uid()
          OR (created_by = auth.uid() AND (assigned_to IS NULL OR assigned_to = auth.uid()))
          OR (has_role(auth.uid(), 'operations'::app_role) AND status = 'production' AND assigned_to IS NULL AND came_from_designer_done = true AND (admin_removed_from_production IS NULL OR admin_removed_from_production = false))
          OR (has_role(auth.uid(), 'estimation'::app_role) AND sent_to_designer_mockup = true)
        )
      )
    )
  )
);
