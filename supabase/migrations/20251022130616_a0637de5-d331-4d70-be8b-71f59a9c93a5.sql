-- Add supplier_name column to tasks table
ALTER TABLE public.tasks
ADD COLUMN supplier_name text;