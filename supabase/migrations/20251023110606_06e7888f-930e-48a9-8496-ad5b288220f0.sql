-- Add 'production' to task_type enum
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'production';