-- Make the designer policy fully permissive for both USING and WITH CHECK
DROP POLICY IF EXISTS "Designers can update mockup workflow tasks" ON public.tasks;

CREATE POLICY "Designers can update mockup workflow tasks"
ON public.tasks
FOR UPDATE  
TO authenticated
USING (
  -- Allow designers to update ANY task (super permissive for testing)
  has_role(auth.uid(), 'designer'::app_role)
)
WITH CHECK (
  -- Allow designers to set ANY values (super permissive for testing)
  has_role(auth.uid(), 'designer'::app_role)
);