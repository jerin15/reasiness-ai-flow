import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Brain, Loader2, ArrowLeft, Trophy, Home } from "lucide-react";
import { GameLobby } from "@/components/games/GameLobby";
import { GameLeaderboard } from "@/components/games/GameLeaderboard";
import { SudokuGame } from "@/components/games/SudokuGame";
import { ChessGame } from "@/components/games/ChessGame";
import { MemoryGame } from "@/components/games/MemoryGame";
import { WordSearchGame } from "@/components/games/WordSearchGame";
import { MathPuzzleGame } from "@/components/games/MathPuzzleGame";

const BrainGames = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [gameMode, setGameMode] = useState<'lobby' | 'solo' | 'multiplayer'>('lobby');
  const [activeGameRoom, setActiveGameRoom] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState("sudoku");

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate('/auth');
        return;
      }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .single();

      if (roleData?.role === 'admin' || roleData?.role === 'technical_head') {
        setAuthorized(true);
      } else {
        navigate('/');
      }
      
      setLoading(false);
    };

    checkAccess();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  const handleStartGame = (roomId: string, isMultiplayer: boolean) => {
    if (isMultiplayer && roomId) {
      setActiveGameRoom(roomId);
      setGameMode('multiplayer');
    } else {
      setActiveGameRoom(null);
      setGameMode('solo');
    }
  };

  const handleBackToLobby = () => {
    setActiveGameRoom(null);
    setGameMode('lobby');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  if (showLeaderboard) {
    return (
      <div className="min-h-screen bg-background p-3 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <Button
            variant="outline"
            onClick={() => setShowLeaderboard(false)}
            className="mb-4"
            size="sm"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Games
          </Button>
          <GameLeaderboard />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Brain className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              <h1 className="text-2xl sm:text-3xl font-bold">Brain Games</h1>
            </div>
            <p className="text-sm sm:text-base text-muted-foreground">Sharpen your mind with challenging puzzles</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/')} variant="outline" size="sm" className="sm:size-default">
              <Home className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
            <Button onClick={() => setShowLeaderboard(true)} variant="outline" size="sm" className="sm:size-default">
              <Trophy className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Leaderboard</span>
            </Button>
          </div>
        </div>

        <Tabs value={currentTab} onValueChange={(val) => {
          setCurrentTab(val);
          setGameMode('lobby');
          setActiveGameRoom(null);
        }} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1 p-1 mb-6 sm:grid sm:grid-cols-5">
            <TabsTrigger value="sudoku" className="flex-1 min-w-[80px] text-xs sm:text-sm">Sudoku</TabsTrigger>
            <TabsTrigger value="chess" className="flex-1 min-w-[80px] text-xs sm:text-sm">Chess</TabsTrigger>
            <TabsTrigger value="memory" className="flex-1 min-w-[80px] text-xs sm:text-sm">Memory</TabsTrigger>
            <TabsTrigger value="wordsearch" className="flex-1 min-w-[80px] text-xs sm:text-sm">Words</TabsTrigger>
            <TabsTrigger value="math" className="flex-1 min-w-[80px] text-xs sm:text-sm">Math</TabsTrigger>
          </TabsList>

          <TabsContent value="sudoku">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Sudoku
                  {gameMode !== 'lobby' && (
                    <Button variant="outline" size="sm" onClick={handleBackToLobby}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Lobby
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>Fill the 9×9 grid with digits so each column, row, and 3×3 box contains 1-9</CardDescription>
              </CardHeader>
              <CardContent>
                {gameMode === 'lobby' ? (
                  <GameLobby gameType="sudoku" onStartGame={handleStartGame} />
                ) : (
                  <SudokuGame roomId={activeGameRoom || undefined} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chess">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Chess
                  {gameMode !== 'lobby' && (
                    <Button variant="outline" size="sm" onClick={handleBackToLobby}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Lobby
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>Play chess against another player or practice strategies</CardDescription>
              </CardHeader>
              <CardContent>
                {gameMode === 'lobby' ? (
                  <GameLobby gameType="chess" onStartGame={handleStartGame} />
                ) : (
                  <ChessGame roomId={activeGameRoom || undefined} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="memory">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Memory Match
                  {gameMode !== 'lobby' && (
                    <Button variant="outline" size="sm" onClick={handleBackToLobby}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Lobby
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>Find matching pairs by remembering card positions</CardDescription>
              </CardHeader>
              <CardContent>
                {gameMode === 'lobby' ? (
                  <GameLobby gameType="memory" onStartGame={handleStartGame} />
                ) : (
                  <MemoryGame roomId={activeGameRoom || undefined} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wordsearch">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Word Search
                  {gameMode !== 'lobby' && (
                    <Button variant="outline" size="sm" onClick={handleBackToLobby}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Lobby
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>Find hidden words in the letter grid</CardDescription>
              </CardHeader>
              <CardContent>
                {gameMode === 'lobby' ? (
                  <GameLobby gameType="wordsearch" onStartGame={handleStartGame} />
                ) : (
                  <WordSearchGame roomId={activeGameRoom || undefined} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="math">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Math Puzzle
                  {gameMode !== 'lobby' && (
                    <Button variant="outline" size="sm" onClick={handleBackToLobby}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Lobby
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>Solve mathematical equations as fast as you can</CardDescription>
              </CardHeader>
              <CardContent>
                {gameMode === 'lobby' ? (
                  <GameLobby gameType="math" onStartGame={handleStartGame} />
                ) : (
                  <MathPuzzleGame roomId={activeGameRoom || undefined} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default BrainGames;
