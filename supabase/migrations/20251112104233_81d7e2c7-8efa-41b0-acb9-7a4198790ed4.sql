-- Fix RLS policies for tasks table to allow all authenticated users to create/update tasks

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can create tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admin and owner task updates" ON public.tasks;
DROP POLICY IF EXISTS "Admins and estimation can create products" ON public.task_products;

-- Allow all authenticated users to create tasks
CREATE POLICY "Authenticated users can create tasks" 
ON public.tasks 
FOR INSERT 
TO authenticated
WITH CHECK (created_by = auth.uid());

-- Allow users to update tasks they created or are assigned to
CREATE POLICY "Users can update their tasks" 
ON public.tasks 
FOR UPDATE 
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role) 
  OR assigned_to = auth.uid() 
  OR created_by = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role) 
  OR assigned_to = auth.uid() 
  OR created_by = auth.uid()
);

-- Allow designers, admins, technical_head, estimation, and task creators to create products
CREATE POLICY "Users can create products for their tasks" 
ON public.task_products 
FOR INSERT 
TO authenticated
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