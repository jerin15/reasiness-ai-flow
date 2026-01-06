-- Add assigned_to column to task_workflow_steps for operations self-assignment
ALTER TABLE public.task_workflow_steps 
ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_task_workflow_steps_assigned_to 
ON public.task_workflow_steps(assigned_to);

-- Add geocoding columns for supplier addresses
ALTER TABLE public.task_workflow_steps 
ADD COLUMN IF NOT EXISTS location_lat double precision,
ADD COLUMN IF NOT EXISTS location_lng double precision;