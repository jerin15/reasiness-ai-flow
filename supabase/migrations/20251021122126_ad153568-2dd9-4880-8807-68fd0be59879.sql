-- Drop the restrictive update policy
DROP POLICY IF EXISTS "All users can update any task" ON public.tasks;

-- Create a completely open update policy - anyone can update any task
CREATE POLICY "Everyone can update all tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);