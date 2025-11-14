-- Update RLS policy for task_products to allow anyone who can view the task to add products
DROP POLICY IF EXISTS "Users can create products for their tasks" ON task_products;

CREATE POLICY "Users can create products for tasks they can view"
ON task_products
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.id = task_products.task_id
    AND (
      tasks.deleted_at IS NULL
      AND (
        (tasks.is_personal_admin_task = true AND tasks.created_by = auth.uid())
        OR
        (
          (tasks.is_personal_admin_task = false OR tasks.is_personal_admin_task IS NULL)
          AND (
            has_role(auth.uid(), 'admin'::app_role)
            OR has_role(auth.uid(), 'technical_head'::app_role)
            OR tasks.assigned_to = auth.uid()
            OR (tasks.created_by = auth.uid() AND (tasks.assigned_to IS NULL OR tasks.assigned_to = auth.uid()))
            OR (
              has_role(auth.uid(), 'operations'::app_role)
              AND tasks.status = 'production'::task_status
              AND tasks.assigned_to IS NULL
              AND tasks.came_from_designer_done = true
              AND (tasks.admin_removed_from_production IS NULL OR tasks.admin_removed_from_production = false)
            )
          )
        )
      )
    )
  )
);

-- Update the UPDATE policy similarly
DROP POLICY IF EXISTS "Users can update products for their tasks" ON task_products;

CREATE POLICY "Users can update products for tasks they can view"
ON task_products
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.id = task_products.task_id
    AND (
      tasks.deleted_at IS NULL
      AND (
        (tasks.is_personal_admin_task = true AND tasks.created_by = auth.uid())
        OR
        (
          (tasks.is_personal_admin_task = false OR tasks.is_personal_admin_task IS NULL)
          AND (
            has_role(auth.uid(), 'admin'::app_role)
            OR has_role(auth.uid(), 'technical_head'::app_role)
            OR tasks.assigned_to = auth.uid()
            OR (tasks.created_by = auth.uid() AND (tasks.assigned_to IS NULL OR tasks.assigned_to = auth.uid()))
            OR (
              has_role(auth.uid(), 'operations'::app_role)
              AND tasks.status = 'production'::task_status
              AND tasks.assigned_to IS NULL
              AND tasks.came_from_designer_done = true
              AND (tasks.admin_removed_from_production IS NULL OR tasks.admin_removed_from_production = false)
            )
          )
        )
      )
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.id = task_products.task_id
    AND (
      tasks.deleted_at IS NULL
      AND (
        (tasks.is_personal_admin_task = true AND tasks.created_by = auth.uid())
        OR
        (
          (tasks.is_personal_admin_task = false OR tasks.is_personal_admin_task IS NULL)
          AND (
            has_role(auth.uid(), 'admin'::app_role)
            OR has_role(auth.uid(), 'technical_head'::app_role)
            OR tasks.assigned_to = auth.uid()
            OR (tasks.created_by = auth.uid() AND (tasks.assigned_to IS NULL OR tasks.assigned_to = auth.uid()))
            OR (
              has_role(auth.uid(), 'operations'::app_role)
              AND tasks.status = 'production'::task_status
              AND tasks.assigned_to IS NULL
              AND tasks.came_from_designer_done = true
              AND (tasks.admin_removed_from_production IS NULL OR tasks.admin_removed_from_production = false)
            )
          )
        )
      )
    )
  )
);