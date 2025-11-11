-- Add field to track when designer completes individual products
ALTER TABLE public.task_products 
ADD COLUMN IF NOT EXISTS designer_completed BOOLEAN DEFAULT false;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_task_products_designer_completed 
ON public.task_products(task_id, designer_completed) 
WHERE approval_status = 'approved';