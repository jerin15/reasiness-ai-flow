-- Fix the RLS policy to allow proper task movement
DROP POLICY IF EXISTS "Admin and owner task updates" ON public.tasks;

-- Create a proper policy that allows:
-- 1. Admins and technical heads can do anything
-- 2. Task creators can update and reassign their tasks
-- 3. Assignees can update their tasks (status, etc) but only reassign to themselves
CREATE POLICY "Admin and owner task updates" ON public.tasks
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
)
WITH CHECK (
  -- Admins and technical heads can do anything
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role)
  -- Task creators can fully update their tasks including reassigning
  OR created_by = auth.uid()
  -- Assignees can update their tasks but not change who it's assigned to
  OR (assigned_to = auth.uid() AND assigned_to = (SELECT t.assigned_to FROM tasks t WHERE t.id = tasks.id))
);