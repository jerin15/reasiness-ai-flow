-- Add new statuses for designer approval flow
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'with_client';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'approved';