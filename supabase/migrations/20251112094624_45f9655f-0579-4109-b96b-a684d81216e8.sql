-- Fix RLS policy to allow admins to soft delete ANY task
-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Admins can soft delete any task" ON public.tasks;

-- Create a simpler policy that allows admins to update/delete ANY task
CREATE POLICY "Admins can soft delete any task" ON public.tasks
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'technical_head'::app_role) OR 
  (assigned_to = auth.uid()) OR 
  (created_by = auth.uid())
)
WITH CHECK (
  -- Admins and technical heads can update ANY task (including soft delete)
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'technical_head'::app_role) OR
  -- Non-admins must own the task
  (assigned_to = auth.uid()) OR 
  (created_by = auth.uid())
);