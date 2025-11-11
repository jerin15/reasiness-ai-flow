-- Add fields to track tasks sent back to designer by admin
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS sent_back_to_designer BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS admin_remarks TEXT;