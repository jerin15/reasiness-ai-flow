-- Drop the overly complex INSERT policy
DROP POLICY IF EXISTS "Users can create tasks with ownership" ON public.tasks;

-- Create a simpler, more permissive INSERT policy
-- Users can create tasks where they are the creator, and can assign to anyone
CREATE POLICY "Users can create tasks" 
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());