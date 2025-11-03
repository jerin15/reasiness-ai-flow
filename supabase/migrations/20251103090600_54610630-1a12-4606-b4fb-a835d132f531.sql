-- Remove voice messages table and storage
DROP TABLE IF EXISTS public.voice_messages CASCADE;

-- Remove voice messages storage bucket
DELETE FROM storage.buckets WHERE id = 'voice-messages';

-- Remove voice messages storage policies
DROP POLICY IF EXISTS "Users can upload their voice messages" ON storage.objects;
DROP POLICY IF EXISTS "Users can view voice messages they sent or received" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own voice messages" ON storage.objects;

-- Create WebRTC signaling table for walkie-talkie
CREATE TABLE IF NOT EXISTS public.walkie_talkie_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  callee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice-candidate', 'end-call')),
  signal_data JSONB NOT NULL,
  is_processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.walkie_talkie_signals ENABLE ROW LEVEL SECURITY;

-- Users can view signals meant for them
CREATE POLICY "Users can view their signals"
ON public.walkie_talkie_signals
FOR SELECT
USING (caller_id = auth.uid() OR callee_id = auth.uid());

-- Users can create signals
CREATE POLICY "Users can create signals"
ON public.walkie_talkie_signals
FOR INSERT
WITH CHECK (caller_id = auth.uid());

-- Users can update signals to mark as processed
CREATE POLICY "Users can update their signals"
ON public.walkie_talkie_signals
FOR UPDATE
USING (callee_id = auth.uid())
WITH CHECK (callee_id = auth.uid());

-- Enable realtime for signaling
ALTER PUBLICATION supabase_realtime ADD TABLE public.walkie_talkie_signals;

-- Create active calls table to track who's currently in a call
CREATE TABLE IF NOT EXISTS public.active_walkie_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  callee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(caller_id, callee_id)
);

-- Enable RLS
ALTER TABLE public.active_walkie_calls ENABLE ROW LEVEL SECURITY;

-- Users can view active calls they're part of
CREATE POLICY "Users can view their active calls"
ON public.active_walkie_calls
FOR SELECT
USING (caller_id = auth.uid() OR callee_id = auth.uid());

-- Users can create active calls
CREATE POLICY "Users can create active calls"
ON public.active_walkie_calls
FOR INSERT
WITH CHECK (caller_id = auth.uid());

-- Users can delete their active calls
CREATE POLICY "Users can delete their active calls"
ON public.active_walkie_calls
FOR DELETE
USING (caller_id = auth.uid() OR callee_id = auth.uid());

-- Enable realtime for active calls
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_walkie_calls;