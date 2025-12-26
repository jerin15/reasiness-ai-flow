-- Add supplier_name to task_products for multi-supplier support per product
ALTER TABLE public.task_products
ADD COLUMN IF NOT EXISTS supplier_name text;

-- Add due_date to task_workflow_steps for individual step deadlines
ALTER TABLE public.task_workflow_steps
ADD COLUMN IF NOT EXISTS due_date timestamp with time zone;