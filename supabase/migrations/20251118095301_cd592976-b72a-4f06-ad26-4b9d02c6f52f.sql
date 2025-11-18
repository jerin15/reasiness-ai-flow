-- Remove duplicate trigger that's causing multiple notifications
-- We already have task_audit_trigger, don't need task_change_logger
DROP TRIGGER IF EXISTS task_change_logger ON tasks;

-- Also ensure the log_task_change function is removed if it exists
DROP FUNCTION IF EXISTS log_task_change();

-- Add comment to document the remaining trigger
COMMENT ON TRIGGER task_audit_trigger ON tasks IS 'Primary trigger for logging task changes and triggering urgent notifications';
