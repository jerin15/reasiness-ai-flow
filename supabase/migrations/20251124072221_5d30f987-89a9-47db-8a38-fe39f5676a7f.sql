-- Drop the existing restrictive policy for designers
DROP POLICY IF EXISTS "Users can update their tasks" ON public.tasks;

-- Create separate policies for better control

-- Policy 1: Admins, technical heads, and estimation can update any task
CREATE POLICY "Admins and technical heads can update tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'technical_head'::app_role) OR
  has_role(auth.uid(), 'estimation'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'technical_head'::app_role) OR
  has_role(auth.uid(), 'estimation'::app_role)
);

-- Policy 2: Users can update tasks assigned to them or created by them
CREATE POLICY "Users can update their own tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  assigned_to = auth.uid() OR 
  (created_by = auth.uid() AND (assigned_to IS NULL OR assigned_to = auth.uid()))
)
WITH CHECK (
  assigned_to = auth.uid() OR 
  (created_by = auth.uid() AND (assigned_to IS NULL OR assigned_to = auth.uid()))
);

-- Policy 3: Designers can update mockup tasks and send them back
CREATE POLICY "Designers can update mockup tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'designer'::app_role) AND 
  sent_to_designer_mockup = true
)
WITH CHECK (
  has_role(auth.uid(), 'designer'::app_role) AND 
  (sent_to_designer_mockup = true OR mockup_completed_by_designer = true)
);