-- Add 'approved' status to task_status enum if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'approved' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'task_status')
  ) THEN
    ALTER TYPE task_status ADD VALUE 'approved';
  END IF;
END $$;

-- Create index for admin dashboard queries
CREATE INDEX IF NOT EXISTS idx_tasks_admin_dashboard 
ON tasks(status, created_by) 
WHERE deleted_at IS NULL;