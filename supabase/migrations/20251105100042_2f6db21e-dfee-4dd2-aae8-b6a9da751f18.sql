-- Create table to store AI parsing history and learning data
CREATE TABLE IF NOT EXISTS public.ai_task_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  raw_input TEXT NOT NULL,
  parsed_data JSONB NOT NULL,
  was_accepted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  feedback TEXT
);

-- Add AI metadata to tasks table
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_confidence_score NUMERIC(3,2),
ADD COLUMN IF NOT EXISTS original_input TEXT;

-- Enable RLS
ALTER TABLE public.ai_task_suggestions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own AI suggestions"
  ON public.ai_task_suggestions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own AI suggestions"
  ON public.ai_task_suggestions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own AI suggestions"
  ON public.ai_task_suggestions FOR UPDATE
  USING (auth.uid() = user_id);