import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw } from "lucide-react";

const words = ['REACT', 'CODE', 'DEBUG', 'CLOUD', 'TASKS', 'ADMIN', 'DESIGN', 'BUILD'];

const createGrid = () => {
  const size = 12;
  const grid = Array(size).fill(0).map(() => Array(size).fill(''));
  
  // Place words
  words.forEach(word => {
    let placed = false;
    while (!placed) {
      const direction = Math.random() > 0.5 ? 'horizontal' : 'vertical';
      const row = Math.floor(Math.random() * size);
      const col = Math.floor(Math.random() * size);
      
      if (direction === 'horizontal' && col + word.length <= size) {
        let canPlace = true;
        for (let i = 0; i < word.length; i++) {
          if (grid[row][col + i] !== '' && grid[row][col + i] !== word[i]) {
            canPlace = false;
            break;
          }
        }
        if (canPlace) {
          for (let i = 0; i < word.length; i++) {
            grid[row][col + i] = word[i];
          }
          placed = true;
        }
      } else if (direction === 'vertical' && row + word.length <= size) {
        let canPlace = true;
        for (let i = 0; i < word.length; i++) {
          if (grid[row + i][col] !== '' && grid[row + i][col] !== word[i]) {
            canPlace = false;
            break;
          }
        }
        if (canPlace) {
          for (let i = 0; i < word.length; i++) {
            grid[row + i][col] = word[i];
          }
          placed = true;
        }
      }
    }
  });
  
  // Fill empty spaces
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (grid[i][j] === '') {
        grid[i][j] = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      }
    }
  }
  
  return grid;
};

export const WordSearchGame = () => {
  const { toast } = useToast();
  const [grid, setGrid] = useState<string[][]>([]);
  const [foundWords, setFoundWords] = useState<Set<string>>(new Set());
  const [selectedCells, setSelectedCells] = useState<[number, number][]>([]);

  useEffect(() => {
    newGame();
  }, []);

  const newGame = () => {
    setGrid(createGrid());
    setFoundWords(new Set());
    setSelectedCells([]);
  };

  const handleCellClick = (row: number, col: number) => {
    const newSelected = [...selectedCells, [row, col] as [number, number]];
    setSelectedCells(newSelected);
    
    // Check if word is found
    const selectedWord = newSelected.map(([r, c]) => grid[r][c]).join('');
    if (words.includes(selectedWord) && !foundWords.has(selectedWord)) {
      const newFound = new Set(foundWords);
      newFound.add(selectedWord);
      setFoundWords(newFound);
      setSelectedCells([]);
      
      toast({
        title: "Word found! 🎉",
        description: selectedWord,
      });
      
      if (newFound.size === words.length) {
        toast({
          title: "Congratulations! 🏆",
          description: "You found all words!",
        });
      }
    } else if (selectedWord.length >= Math.max(...words.map(w => w.length))) {
      setSelectedCells([]);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap gap-2 justify-center">
        {words.map(word => (
          <span
            key={word}
            className={`px-3 py-1 rounded ${
              foundWords.has(word)
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground'
            }`}
          >
            {word}
          </span>
        ))}
      </div>

      <div className="grid gap-1">
        {grid.map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-1">
            {row.map((letter, colIndex) => (
              <button
                key={`${rowIndex}-${colIndex}`}
                onClick={() => handleCellClick(rowIndex, colIndex)}
                className={`
                  w-8 h-8 flex items-center justify-center text-sm font-bold
                  border border-border rounded transition-colors
                  ${selectedCells.some(([r, c]) => r === rowIndex && c === colIndex)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-accent'
                  }
                `}
              >
                {letter}
              </button>
            ))}
          </div>
        ))}
      </div>

      <Button onClick={newGame} variant="outline">
        <RotateCcw className="h-4 w-4 mr-2" />
        New Game
      </Button>
    </div>
  );
};
