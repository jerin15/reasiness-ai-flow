-- Add revision_notes column to tasks table for storing CRM revision notes
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS revision_notes TEXT DEFAULT NULL;