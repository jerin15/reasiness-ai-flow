-- Add 'quotation' status to task_status enum for client service pipeline
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'quotation';