
-- Fix duplicate notifications by removing the redundant trigger
-- We only need task_audit_trigger, not log_task_changes
DROP TRIGGER IF EXISTS log_task_changes ON tasks;

-- Add comment explaining the remaining trigger
COMMENT ON TRIGGER task_audit_trigger ON tasks IS 'Logs all task changes to task_audit_log and triggers urgent notifications for high/urgent priority tasks';
