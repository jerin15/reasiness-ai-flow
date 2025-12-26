-- Drop existing restrictive SELECT policy for task_products
DROP POLICY IF EXISTS "Users can view products of their tasks" ON public.task_products;

-- Create new policy that includes operations team for production tasks
CREATE POLICY "Users can view products of their tasks"
ON public.task_products
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.id = task_products.task_id
    AND (
      tasks.created_by = auth.uid()
      OR tasks.assigned_to = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'technical_head'::app_role)
      OR (
        has_role(auth.uid(), 'operations'::app_role)
        AND tasks.status = 'production'::task_status
        AND tasks.deleted_at IS NULL
      )
    )
  )
);