-- Drop the existing policy
DROP POLICY IF EXISTS "Users can update their tasks" ON tasks;

-- Create updated policy that includes designers for mockup tasks
CREATE POLICY "Users can update their tasks"
ON tasks
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role) 
  OR has_role(auth.uid(), 'estimation'::app_role) 
  OR (assigned_to = auth.uid()) 
  OR (created_by = auth.uid())
  OR (has_role(auth.uid(), 'designer'::app_role) AND sent_to_designer_mockup = true)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role) 
  OR has_role(auth.uid(), 'estimation'::app_role) 
  OR (assigned_to = auth.uid()) 
  OR (created_by = auth.uid())
  OR (has_role(auth.uid(), 'designer'::app_role) AND sent_to_designer_mockup = true)
);