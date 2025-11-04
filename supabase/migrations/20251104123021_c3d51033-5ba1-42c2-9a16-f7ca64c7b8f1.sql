-- Create voice announcements table
CREATE TABLE IF NOT EXISTS public.voice_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  recipient_id UUID REFERENCES auth.users(id),
  audio_url TEXT NOT NULL,
  duration INTEGER NOT NULL,
  message_text TEXT,
  is_played BOOLEAN DEFAULT FALSE,
  is_broadcast BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user presence table
CREATE TABLE IF NOT EXISTS public.user_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'available',
  custom_message TEXT,
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create urgent notifications table
CREATE TABLE IF NOT EXISTS public.urgent_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  recipient_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT DEFAULT 'high',
  is_acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  is_broadcast BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.voice_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urgent_notifications ENABLE ROW LEVEL SECURITY;

-- Voice announcements policies
CREATE POLICY "Users can view their announcements"
  ON public.voice_announcements FOR SELECT
  USING (recipient_id = auth.uid() OR is_broadcast = true OR sender_id = auth.uid());

CREATE POLICY "Users can create announcements"
  ON public.voice_announcements FOR INSERT
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Recipients can update played status"
  ON public.voice_announcements FOR UPDATE
  USING (recipient_id = auth.uid() OR (is_broadcast = true))
  WITH CHECK (recipient_id = auth.uid() OR (is_broadcast = true));

-- User presence policies
CREATE POLICY "Everyone can view presence"
  ON public.user_presence FOR SELECT
  USING (true);

CREATE POLICY "Users can update own presence"
  ON public.user_presence FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own presence status"
  ON public.user_presence FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Urgent notifications policies
CREATE POLICY "Users can view their notifications"
  ON public.urgent_notifications FOR SELECT
  USING (recipient_id = auth.uid() OR is_broadcast = true OR sender_id = auth.uid());

CREATE POLICY "Users can create notifications"
  ON public.urgent_notifications FOR INSERT
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Recipients can acknowledge"
  ON public.urgent_notifications FOR UPDATE
  USING (recipient_id = auth.uid() OR (is_broadcast = true))
  WITH CHECK (recipient_id = auth.uid() OR (is_broadcast = true));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.urgent_notifications;

-- Create function to update presence timestamp
CREATE OR REPLACE FUNCTION public.update_presence_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for presence updates
CREATE TRIGGER update_presence_updated_at
  BEFORE UPDATE ON public.user_presence
  FOR EACH ROW
  EXECUTE FUNCTION public.update_presence_timestamp();