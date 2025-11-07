-- Fix infinite recursion in tasks RLS policy
DROP POLICY IF EXISTS "Admin and owner task updates" ON public.tasks;

-- Create a simpler policy without recursive queries
-- This allows:
-- 1. Admins and technical heads full control
-- 2. Task creators can update their tasks
-- 3. Assignees can update their tasks
CREATE POLICY "Admin and owner task updates" ON public.tasks
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role)
  OR created_by = auth.uid()
  OR assigned_to = auth.uid()
);