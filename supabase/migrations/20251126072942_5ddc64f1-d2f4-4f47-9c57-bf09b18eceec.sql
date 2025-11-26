-- Add operations-specific fields to tasks table
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS suppliers TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS delivery_instructions TEXT,
ADD COLUMN IF NOT EXISTS delivery_address TEXT;

-- Add comment for clarity
COMMENT ON COLUMN public.tasks.suppliers IS 'Array of suppliers in workflow order (e.g., collect from supplier1, process at supplier2, etc.)';
COMMENT ON COLUMN public.tasks.delivery_instructions IS 'Special instructions for operations team';
COMMENT ON COLUMN public.tasks.delivery_address IS 'Final delivery address/location';