-- Update RLS policy for operations to only see admin-approved production tasks
-- Operations should only see tasks that came from designer_done status (approved by admin in FOR PRODUCTION)

DROP POLICY IF EXISTS "Admin and user task visibility" ON tasks;

CREATE POLICY "Admin and user task visibility" 
ON tasks 
FOR SELECT 
USING (
  deleted_at IS NULL 
  AND (
    -- Personal admin tasks: only visible to creator
    (is_personal_admin_task = true AND created_by = auth.uid())
    OR
    -- Regular tasks visibility
    (
      (is_personal_admin_task = false OR is_personal_admin_task IS NULL)
      AND (
        -- Admins and technical heads can see all non-personal tasks
        has_role(auth.uid(), 'admin'::app_role) 
        OR has_role(auth.uid(), 'technical_head'::app_role) 
        -- Users can see tasks assigned to them
        OR assigned_to = auth.uid() 
        -- Users can see tasks they created (if unassigned or self-assigned)
        OR (created_by = auth.uid() AND (assigned_to IS NULL OR assigned_to = auth.uid()))
        -- Operations can ONLY see production tasks that were approved by admin from FOR PRODUCTION
        -- These tasks must have came_from_designer_done = true
        OR (
          has_role(auth.uid(), 'operations'::app_role) 
          AND status = 'production'::task_status 
          AND assigned_to IS NULL
          AND came_from_designer_done = true
          AND (admin_removed_from_production IS NULL OR admin_removed_from_production = false)
        )
      )
    )
  )
);