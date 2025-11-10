-- Update RLS policies to ensure only admins can update product approval status
DROP POLICY IF EXISTS "Admins and creators can update products" ON public.task_products;

-- Create separate policies for different update scenarios
CREATE POLICY "Admins can update product approval status" 
ON public.task_products 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Technical heads and creators can update product details" 
ON public.task_products 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'technical_head'::app_role) OR 
  (EXISTS ( 
    SELECT 1
    FROM tasks
    WHERE tasks.id = task_products.task_id 
    AND tasks.created_by = auth.uid()
  ))
)
WITH CHECK (
  has_role(auth.uid(), 'technical_head'::app_role) OR 
  (EXISTS ( 
    SELECT 1
    FROM tasks
    WHERE tasks.id = task_products.task_id 
    AND tasks.created_by = auth.uid()
  ))
);