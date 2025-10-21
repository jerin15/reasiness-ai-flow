-- Update RLS policy to allow anyone to modify any task
DROP POLICY IF EXISTS "Users can update tasks" ON public.tasks;

CREATE POLICY "Anyone can update tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (deleted_at IS NULL);

-- The delete policy is already correct - only admins can delete tasks
-- No changes needed for: "Admins can delete tasks" policy