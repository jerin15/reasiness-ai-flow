-- The issue is that WITH CHECK evaluates the NEW row after update
-- When designer sends back, assigned_to changes to estimation user
-- We need to allow this specific transition

DROP POLICY IF EXISTS "Designers can update mockup workflow tasks" ON public.tasks;

-- More permissive policy for designers working on mockup tasks
CREATE POLICY "Designers can update mockup workflow tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  -- Current state: designer with mockup task OR task assigned to designer
  has_role(auth.uid(), 'designer'::app_role) AND 
  (sent_to_designer_mockup = true OR assigned_to = auth.uid())
)
WITH CHECK (
  -- After update: still a designer, allow any valid state changes
  has_role(auth.uid(), 'designer'::app_role) AND
  -- Allow either keeping mockup workflow OR completing it
  (sent_to_designer_mockup = true OR mockup_completed_by_designer = true OR came_from_designer_done = true)
);