-- Make recipient_id nullable to support group messages
ALTER TABLE public.messages ALTER COLUMN recipient_id DROP NOT NULL;