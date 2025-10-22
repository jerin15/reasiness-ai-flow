-- Add new status value for client approval
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'client_approval';

-- Create enum for my_status field
CREATE TYPE my_task_status AS ENUM ('pending', 'done_from_my_side');

-- Add new columns to tasks table
ALTER TABLE tasks 
  ADD COLUMN IF NOT EXISTS assigned_by TEXT,
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS my_status my_task_status DEFAULT 'pending';