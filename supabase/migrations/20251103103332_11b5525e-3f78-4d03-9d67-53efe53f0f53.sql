-- Update RLS policy to allow technical_head to delete tasks like admin
DROP POLICY IF EXISTS "Admins can delete tasks" ON public.tasks;

CREATE POLICY "Admins can delete tasks" 
ON public.tasks 
FOR DELETE 
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'technical_head'::app_role)
);