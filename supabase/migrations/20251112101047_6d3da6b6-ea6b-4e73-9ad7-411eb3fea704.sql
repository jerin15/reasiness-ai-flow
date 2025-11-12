-- Add INSERT policy for task_history table (currently has NONE)
-- The log_task_change trigger needs this to work

CREATE POLICY "System can insert task history" ON public.task_history
FOR INSERT
WITH CHECK (true);

-- This allows the trigger to log changes without RLS blocking it