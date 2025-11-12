-- Drop the duplicate UPDATE policy we just created
DROP POLICY IF EXISTS "Admins can soft delete any task" ON public.tasks;

-- The existing "Admin and owner task updates" policy should handle all updates
-- It already has the correct USING clause and with_check:true which allows admins to update any task