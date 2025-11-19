-- Fix RLS policy to allow estimation users to reassign tasks to designers
-- Drop the existing update policy
DROP POLICY IF EXISTS "Users can update their tasks" ON public.tasks;

-- Create new update policy that allows estimation users to update tasks they have access to
CREATE POLICY "Users can update their tasks"
ON public.tasks
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role) 
  OR (assigned_to = auth.uid()) 
  OR (created_by = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role) 
  OR has_role(auth.uid(), 'estimation'::app_role)
  OR (assigned_to = auth.uid()) 
  OR (created_by = auth.uid())
);