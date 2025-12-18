-- Create the task-reports bucket that was missing
INSERT INTO storage.buckets (id, name, public) 
VALUES ('task-reports', 'task-reports', false)
ON CONFLICT (id) DO NOTHING;