-- Add columns for external task tracking
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS source_app TEXT,
ADD COLUMN IF NOT EXISTS external_task_id TEXT;

-- Add index for faster lookups by external task id
CREATE INDEX IF NOT EXISTS idx_tasks_external_task_id ON public.tasks(external_task_id) WHERE external_task_id IS NOT NULL;