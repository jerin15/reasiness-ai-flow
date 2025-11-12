-- Fix the WITH CHECK clause to allow admins to update tasks to ANY state
-- even if the resulting row has created_by/assigned_to pointing to other users

DROP POLICY IF EXISTS "Admin and owner task updates" ON public.tasks;

CREATE POLICY "Admin and owner task updates" ON public.tasks
FOR UPDATE
USING (
  -- Who can SELECT the row to update it
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'technical_head'::app_role) OR 
  (assigned_to = auth.uid()) OR 
  (created_by = auth.uid())
)
WITH CHECK (
  -- What state can the updated row be in
  -- Admins and technical heads can update to ANY state (including soft delete of others' tasks)
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'technical_head'::app_role) OR
  -- Non-admins can only update if they still own the task after update
  (assigned_to = auth.uid()) OR 
  (created_by = auth.uid())
);