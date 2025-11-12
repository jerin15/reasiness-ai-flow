-- Add client_service role to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'client_service';

-- Add new statuses for Client Service Executive pipeline
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'new_calls';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'follow_up';