-- Add fields to track designer mockup workflow
ALTER TABLE public.tasks
ADD COLUMN sent_to_designer_mockup BOOLEAN DEFAULT FALSE,
ADD COLUMN mockup_completed_by_designer BOOLEAN DEFAULT FALSE;