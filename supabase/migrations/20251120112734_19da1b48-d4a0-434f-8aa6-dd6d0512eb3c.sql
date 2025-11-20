-- Create game_scores table for leaderboard
CREATE TABLE IF NOT EXISTS public.game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game_type text NOT NULL CHECK (game_type IN ('sudoku', 'chess', 'memory', 'wordsearch', 'math')),
  score integer NOT NULL DEFAULT 0,
  completion_time_seconds integer,
  moves_count integer,
  difficulty text DEFAULT 'medium',
  is_multiplayer boolean DEFAULT false,
  opponent_id uuid,
  won boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;

-- Allow users to view all scores (public leaderboard)
CREATE POLICY "Anyone authenticated can view game scores"
ON public.game_scores
FOR SELECT
TO authenticated
USING (true);

-- Allow users to insert their own scores
CREATE POLICY "Users can insert their own scores"
ON public.game_scores
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_game_scores_user_id ON public.game_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_game_type ON public.game_scores(game_type);
CREATE INDEX IF NOT EXISTS idx_game_scores_created_at ON public.game_scores(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_score ON public.game_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_completion_time ON public.game_scores(completion_time_seconds ASC);

-- Create view for leaderboard statistics
CREATE OR REPLACE VIEW public.game_leaderboard AS
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

-- Grant access to the view
GRANT SELECT ON public.game_leaderboard TO authenticated;