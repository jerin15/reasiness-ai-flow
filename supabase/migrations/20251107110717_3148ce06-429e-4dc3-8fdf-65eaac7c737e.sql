-- Fix RLS policy to allow task creators to assign tasks to other users
DROP POLICY IF EXISTS "Admin and owner task updates" ON public.tasks;

CREATE POLICY "Admin and owner task updates"
ON public.tasks
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'technical_head'::app_role) OR 
  (assigned_to = auth.uid()) OR 
  (created_by = auth.uid())  -- Allow creators to update tasks they created, even when assigning to others
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'technical_head'::app_role) OR 
  (assigned_to = auth.uid()) OR 
  (created_by = auth.uid())
);