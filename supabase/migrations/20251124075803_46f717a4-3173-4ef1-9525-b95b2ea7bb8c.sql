-- Fix the urgent_notifications INSERT policy to allow designers
DROP POLICY IF EXISTS "Users can create notifications" ON public.urgent_notifications;

CREATE POLICY "Users can create notifications"
ON public.urgent_notifications
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid() OR 
  has_role(auth.uid(), 'designer'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'technical_head'::app_role)
);