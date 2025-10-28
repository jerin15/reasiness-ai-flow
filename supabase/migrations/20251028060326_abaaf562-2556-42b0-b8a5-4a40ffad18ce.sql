-- Create index for faster admin approval queries (part 2)
CREATE INDEX IF NOT EXISTS idx_tasks_admin_approval 
ON tasks(status) 
WHERE deleted_at IS NULL;