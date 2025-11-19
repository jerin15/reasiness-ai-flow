-- Fix RLS policy to allow estimation users to reassign tasks
-- The issue is that WITH CHECK was validating against the NEW values
-- but we need to check the OLD values for who can make the update

DROP POLICY IF EXISTS "Users can update their tasks" ON public.tasks;

CREATE POLICY "Users can update their tasks"
ON public.tasks
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role) 
  OR has_role(auth.uid(), 'estimation'::app_role)
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