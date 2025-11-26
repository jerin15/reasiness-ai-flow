
-- Drop the duplicate restrictive policy I just created
DROP POLICY IF EXISTS "Admins can update all operations tasks" ON public.tasks;

-- The existing "Admins and privileged roles can update any task" policy 
-- already allows admins to update any task without restrictions
-- No need for additional admin-specific policies for operations tasks
