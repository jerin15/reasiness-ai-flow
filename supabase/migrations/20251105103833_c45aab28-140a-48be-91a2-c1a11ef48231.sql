-- Enable realtime for call_sessions table so call notifications work
ALTER PUBLICATION supabase_realtime ADD TABLE call_sessions;