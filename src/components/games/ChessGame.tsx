import { useState, useEffect } from "react";
import { Chess, Square } from "chess.js";
import { Button } from "@/components/ui/button";
import { RotateCcw, Brain } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChessGameProps {
  roomId?: string;
}

const pieceSymbols: Record<string, string> = {
  'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
  'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟',
};

// Piece values for evaluation
const pieceValues: Record<string, number> = {
  'p': 100,
  'n': 320,
  'b': 330,
  'r': 500,
  'q': 900,
  'k': 20000
};

// Position bonuses for pieces (encourages good positioning)
const pawnTable = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5,  5, 10, 25, 25, 10,  5,  5,
  0,  0,  0, 20, 20,  0,  0,  0,
  5, -5,-10,  0,  0,-10, -5,  5,
  5, 10, 10,-20,-20, 10, 10,  5,
  0,  0,  0,  0,  0,  0,  0,  0
];

const knightTable = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];

export const ChessGame = ({ roomId }: ChessGameProps) => {
  const { toast } = useToast();
  const [game, setGame] = useState(new Chess());
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<Square[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const isSoloMode = !roomId;

  // Evaluate board position
  const evaluateBoard = (chess: Chess): number => {
    let totalEvaluation = 0;
    const board = chess.board();

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = board[i][j];
        if (piece) {
          const value = getPieceValue(piece, i, j);
          totalEvaluation += piece.color === 'w' ? value : -value;
        }
      }
    }

    return totalEvaluation;
  };

  const getPieceValue = (piece: any, row: number, col: number): number => {
    const baseValue = pieceValues[piece.type] || 0;
    let positionValue = 0;

    // Add position bonuses
    const index = row * 8 + col;
    const reverseIndex = (7 - row) * 8 + col;

    if (piece.type === 'p') {
      positionValue = piece.color === 'w' ? pawnTable[reverseIndex] : pawnTable[index];
    } else if (piece.type === 'n') {
      positionValue = piece.color === 'w' ? knightTable[reverseIndex] : knightTable[index];
    }

    return baseValue + positionValue;
  };

  // Minimax with alpha-beta pruning
  const minimax = (
    chess: Chess,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizingPlayer: boolean
  ): number => {
    if (depth === 0) {
      return evaluateBoard(chess);
    }

    const moves = chess.moves({ verbose: true });

    if (moves.length === 0) {
      if (chess.isCheckmate()) {
        return isMaximizingPlayer ? -10000 : 10000;
      }
      return 0; // Stalemate
    }

    if (isMaximizingPlayer) {
      let maxEval = -Infinity;
      for (const move of moves) {
        chess.move(move);
        const evaluation = minimax(chess, depth - 1, alpha, beta, false);
        chess.undo();
        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        chess.move(move);
        const evaluation = minimax(chess, depth - 1, alpha, beta, true);
        chess.undo();
        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  };

  // Find best move for AI
  const getBestMove = (chess: Chess, depth: number = 3): string | null => {
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) return null;

    let bestMove = moves[0].san;
    let bestValue = Infinity;

    for (const move of moves) {
      chess.move(move);
      const boardValue = minimax(chess, depth - 1, -Infinity, Infinity, true);
      chess.undo();

      if (boardValue < bestValue) {
        bestValue = boardValue;
        bestMove = move.san;
      }
    }

    return bestMove;
  };

  // AI makes a move
  const makeAIMove = async () => {
    setIsThinking(true);
    
    // Add slight delay for better UX
    await new Promise(resolve => setTimeout(resolve, 500));

    const newGame = new Chess(game.fen());
    const bestMove = getBestMove(newGame, 3); // Depth 3 for difficult AI

    if (bestMove) {
      newGame.move(bestMove);
      setGame(newGame);

      if (newGame.isCheckmate()) {
        toast({
          title: "Checkmate!",
          description: "AI wins! Better luck next time.",
          variant: "destructive",
        });
      } else if (newGame.isCheck()) {
        toast({
          title: "Check!",
          description: "You are in check.",
        });
      } else if (newGame.isDraw()) {
        toast({
          title: "Draw!",
          description: "The game is a draw.",
        });
      }
    }

    setIsThinking(false);
  };

  // Trigger AI move when it's black's turn in solo mode
  useEffect(() => {
    if (isSoloMode && game.turn() === 'b' && !game.isGameOver() && !isThinking) {
      makeAIMove();
    }
  }, [game.fen(), isSoloMode]);

  const resetGame = () => {
    setGame(new Chess());
    setSelectedSquare(null);
    setPossibleMoves([]);
    setIsThinking(false);
  };

  const handleSquareClick = (square: Square) => {
    if (isThinking || game.turn() === 'b') return; // Disable moves during AI turn

    if (!selectedSquare) {
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
        const moves = game.moves({ square, verbose: true });
        setPossibleMoves(moves.map(m => m.to as Square));
      }
    } else {
      try {
        const newGame = new Chess(game.fen());
        const move = newGame.move({
          from: selectedSquare,
          to: square,
          promotion: 'q', // Always promote to queen for simplicity
        });

        if (move) {
          setGame(newGame);
          
          if (newGame.isCheckmate()) {
            toast({
              title: "Checkmate!",
              description: "You win!",
            });
          } else if (newGame.isCheck()) {
            toast({
              title: "Check!",
              description: "AI is in check.",
            });
          } else if (newGame.isDraw()) {
            toast({
              title: "Draw!",
              description: "The game is a draw.",
            });
          }
        }
      } catch (e) {
        // Invalid move
      }

      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  };

  const renderBoard = () => {
    const board = game.board();
    const squares = [];

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const square = `${String.fromCharCode(97 + col)}${8 - row}` as Square;
        const piece = board[row][col];
        const isLight = (row + col) % 2 === 0;
        const isSelected = selectedSquare === square;
        const isPossibleMove = possibleMoves.includes(square);

        squares.push(
          <button
            key={square}
            onClick={() => handleSquareClick(square)}
            disabled={isThinking || game.turn() === 'b'}
            className={`
              w-16 h-16 flex items-center justify-center text-4xl
              transition-all hover:opacity-80 relative
              ${isLight ? 'bg-amber-100 dark:bg-amber-900' : 'bg-amber-800 dark:bg-amber-950'}
              ${isSelected ? 'ring-4 ring-primary' : ''}
              ${isPossibleMove ? 'after:absolute after:w-4 after:h-4 after:rounded-full after:bg-primary/50' : ''}
              ${isThinking || game.turn() === 'b' ? 'cursor-not-allowed opacity-60' : ''}
            `}
          >
            {piece && pieceSymbols[piece.color + piece.type.toUpperCase()]}
          </button>
        );
      }
    }

    return squares;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-4">
        <div className="text-lg font-semibold">
          {game.isGameOver() 
            ? game.isCheckmate() 
              ? `Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} wins!`
              : 'Game Over - Draw'
            : `Current Turn: ${game.turn() === 'w' ? 'White (You)' : 'Black (AI)'}`
          }
        </div>
        {isThinking && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Brain className="h-5 w-5 animate-pulse" />
            <span>AI is thinking...</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-8 gap-0 border-2 border-foreground">
        {renderBoard()}
      </div>

      <Button onClick={resetGame} variant="outline">
        <RotateCcw className="h-4 w-4 mr-2" />
        New Game
      </Button>
    </div>
  );
};
