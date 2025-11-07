-- Fix RLS policy to allow all task movements
DROP POLICY IF EXISTS "Admin and owner task updates" ON public.tasks;

-- Simplified policy that allows:
-- 1. Admins and technical heads full control
-- 2. Task creators can update their tasks (including reassigning)
-- 3. Task assignees can update their assigned tasks
CREATE POLICY "Admin and owner task updates" ON public.tasks
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
)
WITH CHECK (true);