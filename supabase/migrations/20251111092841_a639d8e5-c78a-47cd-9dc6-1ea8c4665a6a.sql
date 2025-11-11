-- Add RLS policy to allow users to update their own audit log entries with device info
-- This is needed so enrichLatestAuditLog can update the audit log after triggers create it

CREATE POLICY "Users can update their own audit entries with device info"
ON public.task_audit_log
FOR UPDATE
TO authenticated
USING (changed_by = auth.uid())
WITH CHECK (changed_by = auth.uid());