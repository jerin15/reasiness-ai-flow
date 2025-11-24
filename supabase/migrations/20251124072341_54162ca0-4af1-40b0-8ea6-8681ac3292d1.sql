-- Drop the designer-specific policy that's too restrictive
DROP POLICY IF EXISTS "Designers can update mockup tasks" ON public.tasks;

-- Create a new policy that allows designers to send tasks back
CREATE POLICY "Designers can update and reassign mockup tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'designer'::app_role) AND 
  (sent_to_designer_mockup = true OR assigned_to = auth.uid())
)
WITH CHECK (
  -- Allow the update if user is a designer, regardless of new assigned_to value
  -- This allows designers to send tasks back to estimation
  has_role(auth.uid(), 'designer'::app_role)
);