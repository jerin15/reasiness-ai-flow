import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Clock, Target, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type LeaderboardEntry = {
  game_type: string;
  user_id: string;
  full_name: string | null;
  email: string;
  games_played: number;
  total_wins: number;
  avg_score: number;
  best_score: number;
  fastest_time: number | null;
  rank_by_score: number;
  rank_by_speed: number;
};

export const GameLeaderboard = () => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGame, setActiveGame] = useState<string>("sudoku");

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await supabase
        .from('game_leaderboard')
        .select('*')
        .order('best_score', { ascending: false });

      if (error) throw error;
      setLeaderboard(data || []);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getGameData = (gameType: string) => {
    return leaderboard
      .filter(entry => entry.game_type === gameType)
      .sort((a, b) => b.best_score - a.best_score)
      .slice(0, 10);
  };

  const getSpeedLeaders = (gameType: string) => {
    return leaderboard
      .filter(entry => entry.game_type === gameType && entry.fastest_time)
      .sort((a, b) => (a.fastest_time || Infinity) - (b.fastest_time || Infinity))
      .slice(0, 10);
  };

  const formatTime = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Badge className="bg-yellow-500">🥇 1st</Badge>;
    if (rank === 2) return <Badge className="bg-gray-400">🥈 2nd</Badge>;
    if (rank === 3) return <Badge className="bg-amber-600">🥉 3rd</Badge>;
    return <Badge variant="outline">#{rank}</Badge>;
  };

  const gameNames: Record<string, string> = {
    sudoku: 'Sudoku',
    chess: 'Chess',
    memory: 'Memory Match',
    wordsearch: 'Word Search',
    math: 'Math Puzzle'
  };

  if (loading) {
    return <div className="text-center p-8">Loading leaderboard...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-yellow-500" />
          Game Leaderboards
        </CardTitle>
        <CardDescription>Top players across all brain games</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeGame} onValueChange={setActiveGame}>
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="sudoku">Sudoku</TabsTrigger>
            <TabsTrigger value="chess">Chess</TabsTrigger>
            <TabsTrigger value="memory">Memory</TabsTrigger>
            <TabsTrigger value="wordsearch">Word Search</TabsTrigger>
            <TabsTrigger value="math">Math</TabsTrigger>
          </TabsList>

          {Object.keys(gameNames).map((gameType) => (
            <TabsContent key={gameType} value={gameType} className="space-y-6">
              {/* Top Scores */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Top Scores
                </h3>
                <div className="space-y-2">
                  {getGameData(gameType).length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">
                      No scores yet. Be the first to play!
                    </div>
                  ) : (
                    getGameData(gameType).map((entry, index) => (
                      <div
                        key={entry.user_id}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {getRankBadge(index + 1)}
                          <div>
                            <div className="font-medium">{entry.full_name || entry.email}</div>
                            <div className="text-sm text-muted-foreground">
                              {entry.games_played} games • {entry.total_wins} wins
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-primary">{entry.best_score}</div>
                          <div className="text-xs text-muted-foreground">best score</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Speed Leaders */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Fastest Times
                </h3>
                <div className="space-y-2">
                  {getSpeedLeaders(gameType).length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">
                      No timed games yet
                    </div>
                  ) : (
                    getSpeedLeaders(gameType).map((entry, index) => (
                      <div
                        key={entry.user_id}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {getRankBadge(index + 1)}
                          <div>
                            <div className="font-medium">{entry.full_name || entry.email}</div>
                            <div className="text-sm text-muted-foreground">
                              Avg: {entry.avg_score?.toFixed(0)} pts
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-primary">
                            {formatTime(entry.fastest_time)}
                          </div>
                          <div className="text-xs text-muted-foreground">fastest time</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Stats Overview */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-secondary/30 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {getGameData(gameType).reduce((sum, e) => sum + e.games_played, 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Games</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {getGameData(gameType).length}
                  </div>
                  <div className="text-xs text-muted-foreground">Active Players</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {getGameData(gameType)[0]?.best_score || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">High Score</div>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
};
