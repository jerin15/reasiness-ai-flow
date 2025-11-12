-- Add DELETE policy to allow admins to delete any task
CREATE POLICY "Admins and technical heads can delete any task" ON public.tasks
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'technical_head'::app_role) OR
  -- Regular users can delete their own created tasks
  (created_by = auth.uid())
);