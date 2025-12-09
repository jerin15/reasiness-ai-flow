-- Update the designer RLS policy to be more permissive for tasks they completed
DROP POLICY IF EXISTS "Designers can update mockup workflow tasks" ON public.tasks;

CREATE POLICY "Designers can update mockup workflow tasks" 
ON public.tasks 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'designer'::app_role) AND (
    assigned_to = auth.uid() OR
    sent_to_designer_mockup = true OR
    status = 'mockup'::task_status OR
    status = 'with_client'::task_status OR
    status = 'production'::task_status OR
    status = 'done'::task_status OR
    completed_by_designer_id = auth.uid() OR
    came_from_designer_done = true
  )
)
WITH CHECK (
  has_role(auth.uid(), 'designer'::app_role) AND (
    assigned_to = auth.uid() OR
    mockup_completed_by_designer = true OR
    came_from_designer_done = true OR
    sent_to_designer_mockup = true OR
    completed_by_designer_id = auth.uid() OR
    status = 'with_client'::task_status OR
    status = 'production'::task_status OR
    status = 'done'::task_status
  )
);