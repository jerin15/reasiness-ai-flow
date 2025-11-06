-- Add field to track if task came from designer's done pipeline
ALTER TABLE public.tasks 
ADD COLUMN came_from_designer_done boolean DEFAULT false;