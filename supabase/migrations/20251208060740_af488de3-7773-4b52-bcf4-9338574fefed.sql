-- Drop and recreate the SELECT policy for tasks to include designer visibility for completed tasks
DROP POLICY IF EXISTS "Admin and user task visibility" ON public.tasks;

CREATE POLICY "Admin and user task visibility" 
ON public.tasks 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role) 
  OR (
    (deleted_at IS NULL) AND (
      -- Personal admin tasks
      ((is_personal_admin_task = true) AND (created_by = auth.uid())) 
      OR (
        ((is_personal_admin_task = false) OR (is_personal_admin_task IS NULL)) AND (
          -- Assigned to user
          (assigned_to = auth.uid()) 
          -- Created by user and self-assigned or unassigned
          OR ((created_by = auth.uid()) AND ((assigned_to IS NULL) OR (assigned_to = auth.uid()))) 
          -- Operations visibility
          OR (has_role(auth.uid(), 'operations'::app_role) AND (status = 'production'::task_status) AND (assigned_to IS NULL) AND (came_from_designer_done = true) AND ((admin_removed_from_production IS NULL) OR (admin_removed_from_production = false))) 
          -- Estimation visibility for mockup tasks
          OR (has_role(auth.uid(), 'estimation'::app_role) AND (sent_to_designer_mockup = true))
          -- Designer visibility for tasks they completed (even if pulled back by estimator)
          OR (has_role(auth.uid(), 'designer'::app_role) AND (completed_by_designer_id = auth.uid()))
          -- Designer visibility for mockup tasks sent to them
          OR (has_role(auth.uid(), 'designer'::app_role) AND (sent_to_designer_mockup = true))
        )
      )
    )
  )
);