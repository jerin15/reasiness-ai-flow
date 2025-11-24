-- Fix the designer mockup workflow policy to allow sending tasks back to estimation
-- The WITH CHECK clause was too restrictive - it needs to only verify the user role
-- because the task fields (like sent_to_designer_mockup) will change during the update

DROP POLICY IF EXISTS "Designers can update mockup workflow tasks" ON public.tasks;

CREATE POLICY "Designers can update mockup workflow tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  -- Check current state: must be a designer with a mockup task
  has_role(auth.uid(), 'designer'::app_role) AND 
  sent_to_designer_mockup = true
)
WITH CHECK (
  -- Only verify user role, allow task state to change
  has_role(auth.uid(), 'designer'::app_role)
);