import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

type Piece = {
  type: 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
  color: 'w' | 'b';
} | null;

const initialBoard: Piece[][] = [
  [{ type: 'r', color: 'b' }, { type: 'n', color: 'b' }, { type: 'b', color: 'b' }, { type: 'q', color: 'b' }, { type: 'k', color: 'b' }, { type: 'b', color: 'b' }, { type: 'n', color: 'b' }, { type: 'r', color: 'b' }],
  [{ type: 'p', color: 'b' }, { type: 'p', color: 'b' }, { type: 'p', color: 'b' }, { type: 'p', color: 'b' }, { type: 'p', color: 'b' }, { type: 'p', color: 'b' }, { type: 'p', color: 'b' }, { type: 'p', color: 'b' }],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [{ type: 'p', color: 'w' }, { type: 'p', color: 'w' }, { type: 'p', color: 'w' }, { type: 'p', color: 'w' }, { type: 'p', color: 'w' }, { type: 'p', color: 'w' }, { type: 'p', color: 'w' }, { type: 'p', color: 'w' }],
  [{ type: 'r', color: 'w' }, { type: 'n', color: 'w' }, { type: 'b', color: 'w' }, { type: 'q', color: 'w' }, { type: 'k', color: 'w' }, { type: 'b', color: 'w' }, { type: 'n', color: 'w' }, { type: 'r', color: 'w' }],
];

const pieceSymbols: Record<string, string> = {
  'wk': '♔', 'wq': '♕', 'wr': '♖', 'wb': '♗', 'wn': '♘', 'wp': '♙',
  'bk': '♚', 'bq': '♛', 'br': '♜', 'bb': '♝', 'bn': '♞', 'bp': '♟',
};

export const ChessGame = () => {
  const [board, setBoard] = useState<Piece[][]>(JSON.parse(JSON.stringify(initialBoard)));
  const [selectedSquare, setSelectedSquare] = useState<[number, number] | null>(null);
  const [currentTurn, setCurrentTurn] = useState<'w' | 'b'>('w');

  const resetGame = () => {
    setBoard(JSON.parse(JSON.stringify(initialBoard)));
    setSelectedSquare(null);
    setCurrentTurn('w');
  };

  const handleSquareClick = (row: number, col: number) => {
    if (!selectedSquare) {
      const piece = board[row][col];
      if (piece && piece.color === currentTurn) {
        setSelectedSquare([row, col]);
      }
    } else {
      const [fromRow, fromCol] = selectedSquare;
      const piece = board[fromRow][fromCol];
      
      // Simple move logic (no validation for actual chess rules)
      const newBoard = board.map(r => [...r]);
      newBoard[row][col] = piece;
      newBoard[fromRow][fromCol] = null;
      
      setBoard(newBoard);
      setSelectedSquare(null);
      setCurrentTurn(currentTurn === 'w' ? 'b' : 'w');
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-lg font-semibold">
        Current Turn: {currentTurn === 'w' ? 'White' : 'Black'}
      </div>

      <div className="grid grid-cols-8 gap-0 border-2 border-foreground">
        {board.map((row, rowIndex) => (
          row.map((piece, colIndex) => {
            const isLight = (rowIndex + colIndex) % 2 === 0;
            const isSelected = selectedSquare?.[0] === rowIndex && selectedSquare?.[1] === colIndex;
            
            return (
              <button
                key={`${rowIndex}-${colIndex}`}
                onClick={() => handleSquareClick(rowIndex, colIndex)}
                className={`
                  w-16 h-16 flex items-center justify-center text-4xl
                  transition-colors hover:opacity-80
                  ${isLight ? 'bg-amber-100 dark:bg-amber-900' : 'bg-amber-800 dark:bg-amber-950'}
                  ${isSelected ? 'ring-4 ring-primary' : ''}
                `}
              >
                {piece && pieceSymbols[piece.color + piece.type]}
              </button>
            );
          })
        ))}
      </div>

      <Button onClick={resetGame} variant="outline">
        <RotateCcw className="h-4 w-4 mr-2" />
        Reset Game
      </Button>
    </div>
  );
};
