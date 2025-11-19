-- Simplify RLS policy to allow estimation users to reassign tasks
-- The WITH CHECK needs to be less restrictive for users with privileged roles

DROP POLICY IF EXISTS "Users can update their tasks" ON public.tasks;

CREATE POLICY "Users can update their tasks"
ON public.tasks
FOR UPDATE
USING (
  -- Can update if you have privileged role
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role) 
  OR has_role(auth.uid(), 'estimation'::app_role)
  -- Or if you're assigned to the task
  OR (assigned_to = auth.uid()) 
  -- Or if you created the task
  OR (created_by = auth.uid())
)
WITH CHECK (
  -- Privileged roles can update to any state
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role) 
  OR has_role(auth.uid(), 'estimation'::app_role)
  -- Non-privileged users can only update their own tasks
  OR (
    -- For non-privileged users, they must remain as assigned_to or created_by
    (assigned_to = auth.uid() OR created_by = auth.uid())
    AND
    -- And the update must keep them as assigned or they're the creator
    (assigned_to = auth.uid() OR created_by = auth.uid())
  )
);