-- Update RLS policy to ensure admins can soft-delete any task
-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Admins can delete tasks" ON public.tasks;

-- Create new policy that allows admins to soft delete (update deleted_at)
CREATE POLICY "Admins can soft delete any task"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'technical_head'::app_role) OR
  (assigned_to = auth.uid()) OR 
  (created_by = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'technical_head'::app_role) OR
  (assigned_to = auth.uid()) OR 
  (created_by = auth.uid())
);