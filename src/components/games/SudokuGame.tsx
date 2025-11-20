import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RotateCcw, Lightbulb } from "lucide-react";

// Check if a number is valid in a position
const isValid = (board: number[][], row: number, col: number, num: number): boolean => {
  // Check row
  for (let x = 0; x < 9; x++) {
    if (board[row][x] === num) return false;
  }
  
  // Check column
  for (let x = 0; x < 9; x++) {
    if (board[x][col] === num) return false;
  }
  
  // Check 3x3 box
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (board[boxRow + i][boxCol + j] === num) return false;
    }
  }
  
  return true;
};

// Solve sudoku using backtracking
const solveSudoku = (board: number[][]): boolean => {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === 0) {
        for (let num = 1; num <= 9; num++) {
          if (isValid(board, row, col, num)) {
            board[row][col] = num;
            if (solveSudoku(board)) return true;
            board[row][col] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
};

// Generate a valid complete Sudoku board
const generateCompleteSudoku = (): number[][] => {
  const board = Array(9).fill(0).map(() => Array(9).fill(0));
  
  // Fill diagonal 3x3 boxes first (they don't depend on each other)
  for (let box = 0; box < 9; box += 3) {
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);
    let idx = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        board[box + i][box + j] = nums[idx++];
      }
    }
  }
  
  // Solve the rest
  solveSudoku(board);
  return board;
};

const generateSudoku = () => {
  // Generate a complete valid board
  const completeBoard = generateCompleteSudoku();
  const board = JSON.parse(JSON.stringify(completeBoard));
  
  // Remove numbers to create puzzle (remove ~40-50 cells for medium difficulty)
  const cellsToRemove = 45;
  let removed = 0;
  
  while (removed < cellsToRemove) {
    const row = Math.floor(Math.random() * 9);
    const col = Math.floor(Math.random() * 9);
    
    if (board[row][col] !== 0) {
      board[row][col] = 0;
      removed++;
    }
  }
  
  return board;
};

interface SudokuGameProps {
  roomId?: string;
}

export const SudokuGame = ({ roomId }: SudokuGameProps) => {
  const { toast } = useToast();
  const [puzzle, setPuzzle] = useState<number[][]>([]);
  const [solution, setSolution] = useState<number[][]>([]);
  const [userBoard, setUserBoard] = useState<number[][]>([]);
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);
  const [isMultiplayer] = useState(!!roomId);

  useEffect(() => {
    if (isMultiplayer && roomId) {
      loadMultiplayerGame();
      const cleanup = subscribeToGameUpdates();
      return cleanup;
    } else {
      newGame();
    }
  }, [roomId, isMultiplayer]);

  const loadMultiplayerGame = async () => {
    try {
      const { data, error } = await supabase
        .from('game_rooms')
        .select('game_state')
        .eq('id', roomId)
        .single();

      if (error) throw error;

      if (data?.game_state && Object.keys(data.game_state).length > 0) {
        const state = data.game_state as any;
        setPuzzle(state.puzzle);
        setSolution(state.solution);
        setUserBoard(state.userBoard);
      } else {
        newGame();
      }
    } catch (error) {
      console.error('Error loading multiplayer game:', error);
      newGame();
    }
  };

  const subscribeToGameUpdates = () => {
    if (!roomId) return;

    const channel = supabase
      .channel(`game_room_${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_rooms',
          filter: `id=eq.${roomId}`
        },
        (payload) => {
          const state = payload.new.game_state as any;
          if (state?.userBoard) {
            setUserBoard(state.userBoard);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const syncGameState = async () => {
    if (!isMultiplayer || !roomId) return;

    try {
      await supabase
        .from('game_rooms')
        .update({
          game_state: {
            puzzle,
            solution,
            userBoard
          }
        })
        .eq('id', roomId);
    } catch (error) {
      console.error('Error syncing game state:', error);
    }
  };

  const newGame = () => {
    const newPuzzle = generateSudoku();
    const sol = JSON.parse(JSON.stringify(newPuzzle));
    setPuzzle(JSON.parse(JSON.stringify(newPuzzle)));
    setSolution(sol);
    setUserBoard(JSON.parse(JSON.stringify(newPuzzle)));
    setSelectedCell(null);
  };

  const handleCellClick = (row: number, col: number) => {
    if (puzzle[row][col] === 0) {
      setSelectedCell([row, col]);
    }
  };

  const handleNumberInput = async (num: number) => {
    if (!selectedCell) return;
    
    const [row, col] = selectedCell;
    
    // Validate the move
    if (!isValid(userBoard, row, col, num)) {
      toast({
        title: "Invalid move!",
        description: "This number conflicts with Sudoku rules",
        variant: "destructive",
      });
      return;
    }
    
    const newBoard = [...userBoard];
    newBoard[row][col] = num;
    setUserBoard(newBoard);
    
    if (isMultiplayer && roomId) {
      await syncGameState();
    }
    
    // Check if puzzle is complete
    const isComplete = newBoard.every((row, i) => row.every((cell, j) => cell === solution[i][j]));
    if (isComplete) {
      await saveScore();
      toast({
        title: "Congratulations! 🎉",
        description: "You've solved the puzzle!",
      });
    }
  };

  const saveScore = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Calculate score based on time and hints used (simplified)
      const score = 1000; // Base score for completion

      await supabase.from('game_scores').insert({
        user_id: user.id,
        game_type: 'sudoku',
        score: score,
        completion_time_seconds: Math.floor((Date.now() - Date.now()) / 1000), // Would need to track start time
        won: true,
        is_multiplayer: isMultiplayer,
      });
    } catch (error) {
      console.error('Error saving score:', error);
    }
  };

  const getHint = () => {
    if (!selectedCell) {
      toast({
        title: "Select a cell first",
        description: "Click on an empty cell to get a hint",
        variant: "destructive",
      });
      return;
    }
    
    const [row, col] = selectedCell;
    const newBoard = [...userBoard];
    newBoard[row][col] = solution[row][col];
    setUserBoard(newBoard);
    setSelectedCell(null);
    
    toast({
      title: "Hint used!",
      description: "The correct number has been filled in",
    });
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="grid grid-cols-9 gap-0 border-2 border-foreground">
        {userBoard.map((row, rowIndex) => (
          row.map((cell, colIndex) => (
            <button
              key={`${rowIndex}-${colIndex}`}
              onClick={() => handleCellClick(rowIndex, colIndex)}
              className={`
                w-12 h-12 flex items-center justify-center text-lg font-semibold
                border border-border hover:bg-accent transition-colors
                ${puzzle[rowIndex][colIndex] !== 0 ? 'bg-muted text-muted-foreground' : 'bg-background'}
                ${selectedCell?.[0] === rowIndex && selectedCell?.[1] === colIndex ? 'ring-2 ring-primary' : ''}
                ${colIndex % 3 === 0 ? 'border-l-2 border-l-foreground' : ''}
                ${rowIndex % 3 === 0 ? 'border-t-2 border-t-foreground' : ''}
                ${colIndex === 8 ? 'border-r-2 border-r-foreground' : ''}
                ${rowIndex === 8 ? 'border-b-2 border-b-foreground' : ''}
              `}
            >
              {cell !== 0 ? cell : ''}
            </button>
          ))
        ))}
      </div>

      <div className="grid grid-cols-9 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <Button
            key={num}
            onClick={() => handleNumberInput(num)}
            variant="outline"
            className="w-12 h-12"
            disabled={!selectedCell}
          >
            {num}
          </Button>
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={newGame} variant="outline">
          <RotateCcw className="h-4 w-4 mr-2" />
          New Game
        </Button>
        <Button onClick={getHint} variant="outline">
          <Lightbulb className="h-4 w-4 mr-2" />
          Hint
        </Button>
      </div>
    </div>
  );
};
