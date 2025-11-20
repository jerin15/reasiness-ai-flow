import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw, Lightbulb } from "lucide-react";

const generateSudoku = () => {
  const base = 3;
  const side = base * base;
  
  // Generate a valid complete board
  const board = Array(side).fill(0).map(() => Array(side).fill(0));
  
  const pattern = (r: number, c: number) => (base * (r % base) + Math.floor(r / base) + c) % side;
  const shuffle = (s: number[]) => s.sort(() => Math.random() - 0.5);
  
  const rBase = Array.from({ length: base }, (_, i) => i);
  const rows = shuffle([...Array.from({ length: base }, () => shuffle([...rBase]))].flat());
  const cols = shuffle([...Array.from({ length: base }, () => shuffle([...rBase]))].flat());
  const nums = shuffle(Array.from({ length: side }, (_, i) => i + 1));
  
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < side; c++) {
      board[rows[r]][cols[c]] = nums[pattern(r, c)];
    }
  }
  
  // Remove numbers to create puzzle
  const squares = side * side;
  const empties = Math.floor(squares * 0.5);
  
  for (let i = 0; i < empties; i++) {
    const r = Math.floor(Math.random() * side);
    const c = Math.floor(Math.random() * side);
    board[r][c] = 0;
  }
  
  return board;
};

export const SudokuGame = () => {
  const { toast } = useToast();
  const [puzzle, setPuzzle] = useState<number[][]>([]);
  const [solution, setSolution] = useState<number[][]>([]);
  const [userBoard, setUserBoard] = useState<number[][]>([]);
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);

  useEffect(() => {
    newGame();
  }, []);

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

  const handleNumberInput = (num: number) => {
    if (!selectedCell) return;
    
    const [row, col] = selectedCell;
    const newBoard = [...userBoard];
    newBoard[row][col] = num;
    setUserBoard(newBoard);
    
    // Check if puzzle is complete
    if (newBoard.every((row, i) => row.every((cell, j) => cell === solution[i][j]))) {
      toast({
        title: "Congratulations! 🎉",
        description: "You've solved the puzzle!",
      });
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
