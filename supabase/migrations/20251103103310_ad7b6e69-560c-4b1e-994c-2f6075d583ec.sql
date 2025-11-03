-- Update RLS policy to allow technical_head to update tasks like admin
DROP POLICY IF EXISTS "Admin and owner task updates" ON public.tasks;

CREATE POLICY "Admin and owner task updates" 
ON public.tasks 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role)
  OR (assigned_to = auth.uid()) 
  OR ((created_by = auth.uid()) AND ((assigned_to = auth.uid()) OR (assigned_to IS NULL)))
);