-- The root cause: Multiple UPDATE policies can match simultaneously
-- ALL matching policies must pass for the update to succeed
-- We need to ensure ONLY the designer policy matches for mockup tasks

-- Drop all UPDATE policies and rebuild with mutually exclusive conditions
DROP POLICY IF EXISTS "Admins and privileged roles can update any task" ON public.tasks;
DROP POLICY IF EXISTS "Designers can update mockup workflow tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can update their assigned tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can update their created tasks" ON public.tasks;

-- Policy 1: Admins, technical heads, and estimation have full access
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

-- Policy 2: ONLY for designers on mockup workflow tasks
-- This must be exclusive - no other policy should match
CREATE POLICY "Designers can update mockup workflow tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'designer'::app_role) AND 
  sent_to_designer_mockup = true
)
WITH CHECK (
  -- Only verify designer role - allow ALL state changes
  has_role(auth.uid(), 'designer'::app_role)
);

-- Policy 3: Regular users can update their assigned tasks
-- EXPLICITLY exclude all mockup workflow tasks
CREATE POLICY "Users can update their assigned tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  assigned_to = auth.uid() AND
  -- Exclude mockup workflow entirely
  (sent_to_designer_mockup IS NULL OR sent_to_designer_mockup = false) AND
  -- Exclude if user is designer (they should use the designer policy)
  NOT has_role(auth.uid(), 'designer'::app_role)
)
WITH CHECK (
  assigned_to = auth.uid() AND
  (sent_to_designer_mockup IS NULL OR sent_to_designer_mockup = false) AND
  NOT has_role(auth.uid(), 'designer'::app_role)
);

-- Policy 4: Users can update tasks they created
-- EXPLICITLY exclude all mockup workflow tasks
CREATE POLICY "Users can update their created tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid() AND 
  (assigned_to IS NULL OR assigned_to = auth.uid()) AND
  -- Exclude mockup workflow entirely
  (sent_to_designer_mockup IS NULL OR sent_to_designer_mockup = false) AND
  -- Exclude if user is designer
  NOT has_role(auth.uid(), 'designer'::app_role)
)
WITH CHECK (
  created_by = auth.uid() AND 
  (assigned_to IS NULL OR assigned_to = auth.uid()) AND
  (sent_to_designer_mockup IS NULL OR sent_to_designer_mockup = false) AND
  NOT has_role(auth.uid(), 'designer'::app_role)
);