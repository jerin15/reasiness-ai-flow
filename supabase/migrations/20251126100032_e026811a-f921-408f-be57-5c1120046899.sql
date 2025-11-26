-- Fix RLS policy to allow designers to send mockup tasks back to estimators
-- Drop the existing restrictive designer policy
DROP POLICY IF EXISTS "Designers can update mockup workflow tasks" ON public.tasks;

-- Create a more permissive policy that allows designers to complete and send back mockups
CREATE POLICY "Designers can update mockup workflow tasks" 
ON public.tasks 
FOR UPDATE
USING (
  has_role(auth.uid(), 'designer'::app_role) 
  AND (
    (assigned_to = auth.uid()) 
    OR (sent_to_designer_mockup = true) 
    OR (status = 'mockup'::task_status) 
    OR (status = 'with_client'::task_status)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'designer'::app_role) 
  AND (
    -- Allow if designer is still assigned
    (assigned_to = auth.uid())
    -- Allow if mockup workflow flags indicate completion/send-back
    OR (mockup_completed_by_designer = true)
    OR (came_from_designer_done = true)
    -- Allow if still in designer workflow
    OR (sent_to_designer_mockup = true)
  )
);