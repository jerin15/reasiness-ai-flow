-- Add new task statuses for technical_head role
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'developing';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'testing';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'under_review';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'deployed';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'trial_and_error';