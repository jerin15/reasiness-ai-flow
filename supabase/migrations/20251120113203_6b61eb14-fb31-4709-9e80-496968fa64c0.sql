-- Add foreign key relationships to game_rooms table
ALTER TABLE game_rooms 
ADD CONSTRAINT game_rooms_player1_id_fkey 
FOREIGN KEY (player1_id) 
REFERENCES profiles(id) 
ON DELETE CASCADE;

ALTER TABLE game_rooms 
ADD CONSTRAINT game_rooms_player2_id_fkey 
FOREIGN KEY (player2_id) 
REFERENCES profiles(id) 
ON DELETE CASCADE;