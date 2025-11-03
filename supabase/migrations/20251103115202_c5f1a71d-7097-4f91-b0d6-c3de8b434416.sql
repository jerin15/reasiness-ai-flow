-- Step 1: Add new enum values for task_status
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'mockup';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'production_file';