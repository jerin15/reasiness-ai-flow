-- Simplify the designer policy - just allow designers to update ANY mockup task completely
-- No restrictions on the new state after update

DROP POLICY IF EXISTS "Designers can update mockup workflow tasks" ON public.tasks;

CREATE POLICY "Designers can update mockup workflow tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  -- Can update if: designer AND (mockup task OR assigned to them)
  has_role(auth.uid(), 'designer'::app_role) AND 
  (sent_to_designer_mockup = true OR assigned_to = auth.uid())
)
WITH CHECK (
  -- After update: just verify user is a designer, allow ALL field changes
  has_role(auth.uid(), 'designer'::app_role)
);