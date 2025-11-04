-- Create tables for WebRTC signaling
CREATE TABLE IF NOT EXISTS public.call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL,
  callee_id UUID NOT NULL,
  call_type TEXT NOT NULL CHECK (call_type IN ('voice', 'video')),
  status TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'answered', 'ended', 'missed', 'declined')),
  offer TEXT,
  answer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.ice_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id UUID NOT NULL REFERENCES public.call_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  candidate TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ice_candidates ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their calls" ON public.call_sessions FOR SELECT
  USING (caller_id = auth.uid() OR callee_id = auth.uid());

CREATE POLICY "Users can create calls" ON public.call_sessions FOR INSERT
  WITH CHECK (caller_id = auth.uid());

CREATE POLICY "Users can update calls" ON public.call_sessions FOR UPDATE
  USING (caller_id = auth.uid() OR callee_id = auth.uid());

CREATE POLICY "Users can view ICE candidates" ON public.ice_candidates FOR SELECT
  USING (
    call_session_id IN (
      SELECT id FROM public.call_sessions WHERE caller_id = auth.uid() OR callee_id = auth.uid()
    )
  );

CREATE POLICY "Users can create ICE candidates" ON public.ice_candidates FOR INSERT
  WITH CHECK (user_id = auth.uid());