-- Create game_rooms table for multiplayer games
CREATE TABLE IF NOT EXISTS public.game_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type text NOT NULL CHECK (game_type IN ('sudoku', 'chess', 'memory', 'wordsearch', 'math')),
  created_by uuid NOT NULL,
  player1_id uuid NOT NULL,
  player2_id uuid,
  game_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_turn uuid,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'completed')),
  winner_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  room_name text NOT NULL
);

-- Enable RLS
ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;

-- Allow admins and technical heads to view all game rooms
CREATE POLICY "Admins and tech heads can view game rooms"
ON public.game_rooms
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'technical_head'::app_role)
);

-- Allow admins and technical heads to create game rooms
CREATE POLICY "Admins and tech heads can create game rooms"
ON public.game_rooms
FOR INSERT
TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'technical_head'::app_role))
  AND created_by = auth.uid()
  AND player1_id = auth.uid()
);

-- Allow players to update their game rooms
CREATE POLICY "Players can update their game rooms"
ON public.game_rooms
FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'technical_head'::app_role))
  AND (player1_id = auth.uid() OR player2_id = auth.uid())
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'technical_head'::app_role))
  AND (player1_id = auth.uid() OR player2_id = auth.uid())
);

-- Allow creators to delete their game rooms
CREATE POLICY "Creators can delete game rooms"
ON public.game_rooms
FOR DELETE
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'technical_head'::app_role))
  AND created_by = auth.uid()
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rooms;

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION public.update_game_room_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_game_rooms_timestamp
BEFORE UPDATE ON public.game_rooms
FOR EACH ROW
EXECUTE FUNCTION public.update_game_room_timestamp();