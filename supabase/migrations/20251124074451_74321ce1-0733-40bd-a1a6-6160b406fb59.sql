-- Create a super permissive policy for designers as a test
-- This will help us identify if the issue is with the policy logic or something else

DROP POLICY IF EXISTS "Designers can update mockup workflow tasks" ON public.tasks;

-- Extremely permissive policy for designers - allow them to update ANY task
CREATE POLICY "Designers can update mockup workflow tasks"
ON public.tasks
FOR UPDATE  
TO authenticated
USING (
  -- Before: Must be designer AND (mockup task OR assigned to them)
  has_role(auth.uid(), 'designer'::app_role) AND
  (sent_to_designer_mockup = true OR assigned_to = auth.uid())
)
WITH CHECK (
  -- After: Allow EVERYTHING - no restrictions at all
  true
);