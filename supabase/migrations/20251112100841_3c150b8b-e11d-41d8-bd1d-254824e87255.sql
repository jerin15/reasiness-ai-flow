-- Fix INSERT policy to allow admins to create tasks on behalf of others
-- (needed when triggers create linked tasks)

DROP POLICY IF EXISTS "Users can create tasks" ON public.tasks;

CREATE POLICY "Users can create tasks" ON public.tasks
FOR INSERT
WITH CHECK (
  -- Admins can create tasks on behalf of anyone
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'technical_head'::app_role) OR
  -- Regular users can only create tasks as themselves
  created_by = auth.uid()
);