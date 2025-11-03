-- Temporarily disable the audit log triggers
ALTER TABLE tasks DISABLE TRIGGER task_audit_trigger;
ALTER TABLE tasks DISABLE TRIGGER task_change_logger;

-- Update existing tasks to use new status names
UPDATE tasks 
SET status = 'mockup' 
WHERE status = 'mockup_pending';

UPDATE tasks 
SET status = 'production_file' 
WHERE status = 'production_pending';

-- Re-enable the audit log triggers
ALTER TABLE tasks ENABLE TRIGGER task_audit_trigger;
ALTER TABLE tasks ENABLE TRIGGER task_change_logger;