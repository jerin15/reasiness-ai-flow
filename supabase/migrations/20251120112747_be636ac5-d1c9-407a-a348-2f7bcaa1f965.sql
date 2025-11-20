-- Drop the view and recreate without SECURITY DEFINER
DROP VIEW IF EXISTS public.game_leaderboard;

CREATE OR REPLACE VIEW public.game_leaderboard 
WITH (security_invoker = true)
AS
SELECT 
  gs.game_type,
  gs.user_id,
  p.full_name,
  p.email,
  COUNT(*) as games_played,
  SUM(CASE WHEN gs.won THEN 1 ELSE 0 END) as total_wins,
  AVG(gs.score) as avg_score,
  MAX(gs.score) as best_score,
  MIN(gs.completion_time_seconds) as fastest_time,
  RANK() OVER (PARTITION BY gs.game_type ORDER BY MAX(gs.score) DESC) as rank_by_score,
  RANK() OVER (PARTITION BY gs.game_type ORDER BY MIN(gs.completion_time_seconds) ASC) as rank_by_speed
FROM public.game_scores gs
LEFT JOIN public.profiles p ON p.id = gs.user_id
GROUP BY gs.game_type, gs.user_id, p.full_name, p.email;