-- Add flag to track when admin removes task from FOR PRODUCTION panel
-- This prevents the task from reappearing after being removed
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS admin_removed_from_production boolean DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.tasks.admin_removed_from_production IS 'Set to true when admin removes task from FOR PRODUCTION panel - prevents it from reappearing';