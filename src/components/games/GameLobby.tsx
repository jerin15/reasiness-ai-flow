import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Users, Play, Plus, Loader2 } from "lucide-react";

type GameRoom = {
  id: string;
  game_type: string;
  room_name: string;
  player1_id: string;
  player2_id: string | null;
  status: string;
  created_at: string;
  profiles: {
    full_name: string | null;
    email: string;
  };
};

interface GameLobbyProps {
  gameType: 'sudoku' | 'chess' | 'memory' | 'wordsearch' | 'math';
  onStartGame: (roomId: string, isMultiplayer: boolean) => void;
}

export const GameLobby = ({ gameType, onStartGame }: GameLobbyProps) => {
  const { toast } = useToast();
  const [rooms, setRooms] = useState<GameRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomName, setRoomName] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string>("");

  useEffect(() => {
    getCurrentUser();
    fetchRooms();
    
    const channel = supabase
      .channel('game_rooms_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_rooms',
          filter: `game_type=eq.${gameType}`
        },
        () => {
          fetchRooms();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameType]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const fetchRooms = async () => {
    try {
      const { data, error } = await supabase
        .from('game_rooms')
        .select(`
          *,
          profiles!game_rooms_player1_id_fkey (
            full_name,
            email
          )
        `)
        .eq('game_type', gameType)
        .in('status', ['waiting', 'in_progress'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRooms(data as any || []);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      toast({
        title: "Error loading rooms",
        description: "Could not load game rooms",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createRoom = async () => {
    if (!roomName.trim()) {
      toast({
        title: "Room name required",
        description: "Please enter a room name",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from('game_rooms')
        .insert({
          game_type: gameType,
          room_name: roomName,
          created_by: user.id,
          player1_id: user.id,
          status: 'waiting',
          game_state: {}
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Room created!",
        description: "Waiting for another player to join...",
      });

      setRoomName("");
      onStartGame(data.id, true);
    } catch (error) {
      console.error('Error creating room:', error);
      toast({
        title: "Error creating room",
        description: "Could not create game room",
        variant: "destructive",
      });
    }
  };

  const joinRoom = async (roomId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from('game_rooms')
        .update({
          player2_id: user.id,
          status: 'in_progress',
          current_turn: user.id
        })
        .eq('id', roomId)
        .is('player2_id', null);

      if (error) throw error;

      toast({
        title: "Joined room!",
        description: "Starting game...",
      });

      onStartGame(roomId, true);
    } catch (error) {
      console.error('Error joining room:', error);
      toast({
        title: "Error joining room",
        description: "Could not join game room",
        variant: "destructive",
      });
    }
  };

  const getGameTypeName = () => {
    const names: Record<string, string> = {
      sudoku: 'Sudoku',
      chess: 'Chess',
      memory: 'Memory Match',
      wordsearch: 'Word Search',
      math: 'Math Puzzle'
    };
    return names[gameType] || gameType;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Game Lobby - {getGameTypeName()}</CardTitle>
          <CardDescription>Create a room or join an existing game</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter room name..."
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && createRoom()}
            />
            <Button onClick={createRoom}>
              <Plus className="h-4 w-4 mr-2" />
              Create Room
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Users className="h-4 w-4" />
              Available Rooms ({rooms.length})
            </div>
            
            {rooms.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No active rooms. Create one to start playing!
              </div>
            ) : (
              <div className="grid gap-2">
                {rooms.map((room) => (
                  <Card key={room.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="font-semibold">{room.room_name}</div>
                          <div className="text-sm text-muted-foreground">
                            Host: {room.profiles?.full_name || room.profiles?.email || 'Unknown'}
                          </div>
                        </div>
                        <Badge variant={room.status === 'waiting' ? 'secondary' : 'default'}>
                          {room.status === 'waiting' ? 'Waiting' : 'In Progress'}
                        </Badge>
                      </div>
                      
                      {room.status === 'waiting' && room.player1_id !== currentUserId && (
                        <Button size="sm" onClick={() => joinRoom(room.id)}>
                          <Play className="h-4 w-4 mr-2" />
                          Join
                        </Button>
                      )}
                      
                      {room.player1_id === currentUserId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onStartGame(room.id, true)}
                        >
                          Resume
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onStartGame('', false)}
            >
              Play Solo
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
