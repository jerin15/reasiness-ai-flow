-- Allow recipients to mark messages as read
CREATE POLICY "Recipients can mark messages as read"
ON public.messages
FOR UPDATE
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());