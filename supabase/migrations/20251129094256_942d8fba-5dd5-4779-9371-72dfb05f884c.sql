-- Add field to track which designer completed the mockup
ALTER TABLE public.tasks 
ADD COLUMN completed_by_designer_id UUID REFERENCES auth.users(id);