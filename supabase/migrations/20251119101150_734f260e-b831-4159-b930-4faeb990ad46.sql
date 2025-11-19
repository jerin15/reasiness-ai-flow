-- Fix RLS policy - WITH CHECK should not validate NEW assigned_to for privileged roles
-- The issue is that when estimation assigns to designer, NEW assigned_to = designer_id
-- which fails the (assigned_to = auth.uid()) check

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
  -- Privileged roles can update to ANY state without restrictions
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role) 
  OR has_role(auth.uid(), 'estimation'::app_role)
  -- Non-privileged users must remain as assignee or creator in the NEW row
  OR (assigned_to = auth.uid() OR created_by = auth.uid())
);