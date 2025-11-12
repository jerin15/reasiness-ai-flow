-- Fix UPDATE policies for task_products to allow designers, estimation, and assigned users

-- Drop existing restrictive UPDATE policies
DROP POLICY IF EXISTS "Technical heads and creators can update product details" ON public.task_products;

-- Allow designers, estimation, technical_head, admins, and task creators/assignees to update product details
CREATE POLICY "Users can update products for their tasks" 
ON public.task_products 
FOR UPDATE 
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role) 
  OR has_role(auth.uid(), 'estimation'::app_role)
  OR has_role(auth.uid(), 'designer'::app_role)
  OR EXISTS (
    SELECT 1 FROM tasks 
    WHERE tasks.id = task_products.task_id 
    AND (tasks.created_by = auth.uid() OR tasks.assigned_to = auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role) 
  OR has_role(auth.uid(), 'estimation'::app_role)
  OR has_role(auth.uid(), 'designer'::app_role)
  OR EXISTS (
    SELECT 1 FROM tasks 
    WHERE tasks.id = task_products.task_id 
    AND (tasks.created_by = auth.uid() OR tasks.assigned_to = auth.uid())
  )
);