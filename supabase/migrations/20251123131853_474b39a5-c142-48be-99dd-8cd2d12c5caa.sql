-- Update RLS policy to allow estimation users to see all mockup tracking tasks
DROP POLICY IF EXISTS "Admin and user task visibility" ON public.tasks;

CREATE POLICY "Admin and user task visibility"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL AND (
    -- Personal admin tasks - only creator can see
    (is_personal_admin_task = true AND created_by = auth.uid())
    OR
    -- Regular tasks visibility
    (
      (is_personal_admin_task = false OR is_personal_admin_task IS NULL) AND (
        -- Admins and technical heads see all
        has_role(auth.uid(), 'admin') OR 
        has_role(auth.uid(), 'technical_head') OR
        -- Assigned to current user
        assigned_to = auth.uid() OR
        -- Created by current user and self-assigned or unassigned
        (created_by = auth.uid() AND (assigned_to IS NULL OR assigned_to = auth.uid())) OR
        -- Operations can see unassigned production tasks from designer
        (
          has_role(auth.uid(), 'operations') AND 
          status = 'production' AND 
          assigned_to IS NULL AND 
          came_from_designer_done = true AND 
          (admin_removed_from_production IS NULL OR admin_removed_from_production = false)
        ) OR
        -- Estimation users can see all tasks sent to designer for mockup tracking
        (
          has_role(auth.uid(), 'estimation') AND 
          sent_to_designer_mockup = true
        )
      )
    )
  )
);