import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Loader2 } from "lucide-react";
import { SudokuGame } from "@/components/games/SudokuGame";
import { ChessGame } from "@/components/games/ChessGame";
import { MemoryGame } from "@/components/games/MemoryGame";
import { WordSearchGame } from "@/components/games/WordSearchGame";
import { MathPuzzleGame } from "@/components/games/MathPuzzleGame";

const BrainGames = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

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

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Brain className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Brain Games</h1>
          </div>
          <p className="text-muted-foreground">Sharpen your mind with challenging puzzles and games</p>
        </div>

        <Tabs defaultValue="sudoku" className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="sudoku">Sudoku</TabsTrigger>
            <TabsTrigger value="chess">Chess</TabsTrigger>
            <TabsTrigger value="memory">Memory Match</TabsTrigger>
            <TabsTrigger value="wordsearch">Word Search</TabsTrigger>
            <TabsTrigger value="math">Math Puzzle</TabsTrigger>
          </TabsList>

          <TabsContent value="sudoku">
            <Card>
              <CardHeader>
                <CardTitle>Sudoku</CardTitle>
                <CardDescription>Fill the 9×9 grid with digits so each column, row, and 3×3 box contains 1-9</CardDescription>
              </CardHeader>
              <CardContent>
                <SudokuGame />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chess">
            <Card>
              <CardHeader>
                <CardTitle>Chess</CardTitle>
                <CardDescription>Play chess against yourself or practice strategies</CardDescription>
              </CardHeader>
              <CardContent>
                <ChessGame />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="memory">
            <Card>
              <CardHeader>
                <CardTitle>Memory Match</CardTitle>
                <CardDescription>Find matching pairs by remembering card positions</CardDescription>
              </CardHeader>
              <CardContent>
                <MemoryGame />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wordsearch">
            <Card>
              <CardHeader>
                <CardTitle>Word Search</CardTitle>
                <CardDescription>Find hidden words in the letter grid</CardDescription>
              </CardHeader>
              <CardContent>
                <WordSearchGame />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="math">
            <Card>
              <CardHeader>
                <CardTitle>Math Puzzle</CardTitle>
                <CardDescription>Solve mathematical equations as fast as you can</CardDescription>
              </CardHeader>
              <CardContent>
                <MathPuzzleGame />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default BrainGames;
