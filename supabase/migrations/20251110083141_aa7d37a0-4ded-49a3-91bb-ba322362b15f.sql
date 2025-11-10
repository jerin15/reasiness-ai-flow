-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can create products for their tasks" ON public.task_products;

-- Create a more permissive policy that allows admins, technical_heads, and estimation to add products to any task
CREATE POLICY "Admins and estimation can create products"
  ON public.task_products
  FOR INSERT
  WITH CHECK (
    -- Admins and technical heads can add products to any task
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'technical_head'::app_role)
    OR has_role(auth.uid(), 'estimation'::app_role)
    OR
    -- Task creator can add products to their own tasks
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_products.task_id
      AND tasks.created_by = auth.uid()
    )
  );

-- Update the update policy to allow admins and technical_heads
DROP POLICY IF EXISTS "Admins and task owners can update products" ON public.task_products;

CREATE POLICY "Admins and creators can update products"
  ON public.task_products
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'technical_head'::app_role)
    OR
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_products.task_id
      AND tasks.created_by = auth.uid()
    )
  );

-- Update delete policy
DROP POLICY IF EXISTS "Admins and task owners can delete products" ON public.task_products;

CREATE POLICY "Admins and creators can delete products"
  ON public.task_products
  FOR DELETE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'technical_head'::app_role)
    OR
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_products.task_id
      AND tasks.created_by = auth.uid()
    )
  );