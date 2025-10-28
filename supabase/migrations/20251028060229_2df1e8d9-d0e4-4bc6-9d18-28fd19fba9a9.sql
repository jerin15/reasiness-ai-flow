-- Add new task statuses for admin approval workflow (part 1)
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'admin_cost_approval';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'rejected';