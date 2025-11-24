-- Temporarily create an ultra-permissive policy for testing
-- This will help identify if the issue is with has_role or something else

DROP POLICY IF EXISTS "TEST: Allow all authenticated to update tasks" ON public.tasks;

CREATE POLICY "TEST: Allow all authenticated to update tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- This policy allows ANY authenticated user to update ANY task
-- If designers still can't update, the issue is NOT with the policy logic