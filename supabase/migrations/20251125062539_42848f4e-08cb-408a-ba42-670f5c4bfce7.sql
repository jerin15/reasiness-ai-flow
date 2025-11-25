-- Drop the test policy as it's too permissive
DROP POLICY IF EXISTS "TEST: Allow all authenticated to update tasks" ON public.tasks;

-- Create a specific policy for designers to update mockup workflow tasks
DROP POLICY IF EXISTS "Designers can update mockup workflow tasks" ON public.tasks;

CREATE POLICY "Designers can update mockup workflow tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'designer'::app_role) AND
  (
    -- Allow updating tasks assigned to the designer
    assigned_to = auth.uid() OR
    -- Allow updating tasks that were sent to designer for mockup
    sent_to_designer_mockup = true OR
    -- Allow updating tasks in mockup status
    status = 'mockup'::task_status OR
    status = 'with_client'::task_status
  )
)
WITH CHECK (
  has_role(auth.uid(), 'designer'::app_role) AND
  (
    -- Allow updating tasks assigned to the designer
    assigned_to = auth.uid() OR
    -- Allow reassigning mockup tasks back to estimation
    (sent_to_designer_mockup = true OR mockup_completed_by_designer = true)
  )
);