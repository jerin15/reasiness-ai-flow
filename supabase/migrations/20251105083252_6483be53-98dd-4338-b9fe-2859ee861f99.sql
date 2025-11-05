-- Add a new boolean column to mark personal admin tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_personal_admin_task BOOLEAN DEFAULT FALSE;

-- Update the task visibility policy to support personal admin tasks
DROP POLICY IF EXISTS "Admin and user task visibility" ON public.tasks;

CREATE POLICY "Admin and user task visibility"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  (deleted_at IS NULL) AND (
    -- Personal admin tasks only visible to creator
    (is_personal_admin_task = TRUE AND created_by = auth.uid())
    OR
    -- Regular visibility rules (only if not a personal admin task)
    (
      (is_personal_admin_task = FALSE OR is_personal_admin_task IS NULL) AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'technical_head'::app_role)
        OR (assigned_to = auth.uid())
        OR ((created_by = auth.uid()) AND ((assigned_to IS NULL) OR (assigned_to = auth.uid())))
        OR (
          has_role(auth.uid(), 'operations'::app_role)
          AND (status = 'production'::task_status)
          AND (assigned_to IS NULL)
          AND (EXISTS (
            SELECT 1
            FROM user_roles ur
            WHERE ((ur.user_id = tasks.created_by) AND (ur.role = ANY (ARRAY['estimation'::app_role, 'admin'::app_role])))
          ))
        )
      )
    )
  )
);