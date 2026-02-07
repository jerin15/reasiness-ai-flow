
-- Add new columns for CRM task differentiation
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS source_origin TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_type TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS origin_label TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS category TEXT;
