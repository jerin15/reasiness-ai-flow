-- Add status_changed_at column to tasks table
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS status_changed_at timestamp with time zone DEFAULT now();

-- Initialize status_changed_at with created_at for existing tasks
UPDATE public.tasks SET status_changed_at = created_at WHERE status_changed_at IS NULL;

-- Create trigger function to update status_changed_at only when status changes
CREATE OR REPLACE FUNCTION public.update_status_changed_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update status_changed_at if status has actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at = NOW();
  END IF;
  
  -- Always update updated_at (existing behavior)
  NEW.updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing handle_updated_at trigger if it exists
DROP TRIGGER IF EXISTS handle_updated_at ON public.tasks;

-- Create new trigger that handles both updated_at and status_changed_at
CREATE TRIGGER handle_task_timestamp_updates
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_status_changed_at();