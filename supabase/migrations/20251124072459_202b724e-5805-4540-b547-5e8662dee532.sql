-- Drop all existing UPDATE policies to rebuild them properly
DROP POLICY IF EXISTS "Admins and technical heads can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can update their own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Designers can update and reassign mockup tasks" ON public.tasks;

-- Policy 1: Admins, technical heads, and estimation have full update access
CREATE POLICY "Admins and privileged roles can update any task"
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

-- Policy 2: Designers can update mockup tasks and send them back
CREATE POLICY "Designers can update mockup workflow tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'designer'::app_role) AND 
  sent_to_designer_mockup = true
)
WITH CHECK (
  has_role(auth.uid(), 'designer'::app_role) AND 
  sent_to_designer_mockup = true
);

-- Policy 3: Regular users can update tasks assigned to them (excluding designers on mockup tasks)
CREATE POLICY "Users can update their assigned tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  assigned_to = auth.uid() AND
  NOT (has_role(auth.uid(), 'designer'::app_role) AND sent_to_designer_mockup = true)
)
WITH CHECK (
  assigned_to = auth.uid() AND
  NOT (has_role(auth.uid(), 'designer'::app_role) AND sent_to_designer_mockup = true)
);

-- Policy 4: Users can update tasks they created (if assigned to themselves or unassigned)
CREATE POLICY "Users can update their created tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid() AND 
  (assigned_to IS NULL OR assigned_to = auth.uid()) AND
  NOT (has_role(auth.uid(), 'designer'::app_role) AND sent_to_designer_mockup = true)
)
WITH CHECK (
  created_by = auth.uid() AND 
  (assigned_to IS NULL OR assigned_to = auth.uid()) AND
  NOT (has_role(auth.uid(), 'designer'::app_role) AND sent_to_designer_mockup = true)
);