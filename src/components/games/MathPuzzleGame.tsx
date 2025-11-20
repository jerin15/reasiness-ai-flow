import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw, Clock } from "lucide-react";

type Puzzle = {
  question: string;
  answer: number;
};

const generatePuzzle = (): Puzzle => {
  const operations = ['+', '-', '*'];
  const op = operations[Math.floor(Math.random() * operations.length)];
  const num1 = Math.floor(Math.random() * 50) + 1;
  const num2 = Math.floor(Math.random() * 50) + 1;
  
  let answer: number;
  let question: string;
  
  switch (op) {
    case '+':
      answer = num1 + num2;
      question = `${num1} + ${num2}`;
      break;
    case '-':
      answer = num1 - num2;
      question = `${num1} - ${num2}`;
      break;
    case '*':
      const smallNum1 = Math.floor(Math.random() * 12) + 1;
      const smallNum2 = Math.floor(Math.random() * 12) + 1;
      answer = smallNum1 * smallNum2;
      question = `${smallNum1} × ${smallNum2}`;
      break;
    default:
      answer = 0;
      question = '';
  }
  
  return { question, answer };
};

export const MathPuzzleGame = () => {
  const { toast } = useToast();
  const [puzzle, setPuzzle] = useState<Puzzle>(generatePuzzle());
  const [userAnswer, setUserAnswer] = useState('');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (isPlaying && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0) {
      setIsPlaying(false);
      toast({
        title: "Time's up!",
        description: `Final score: ${score}`,
      });
    }
  }, [timeLeft, isPlaying, score, toast]);

  const startGame = () => {
    setScore(0);
    setTimeLeft(60);
    setIsPlaying(true);
    setPuzzle(generatePuzzle());
    setUserAnswer('');
  };

  const checkAnswer = () => {
    const answer = parseInt(userAnswer);
    if (answer === puzzle.answer) {
      setScore(score + 1);
      toast({
        title: "Correct! ✓",
        description: "+1 point",
      });
      setPuzzle(generatePuzzle());
      setUserAnswer('');
    } else {
      toast({
        title: "Wrong answer",
        description: `The correct answer was ${puzzle.answer}`,
        variant: "destructive",
      });
      setPuzzle(generatePuzzle());
      setUserAnswer('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isPlaying) {
      checkAnswer();
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 max-w-md mx-auto">
      {!isPlaying ? (
        <Button onClick={startGame} size="lg">
          Start Game
        </Button>
      ) : (
        <>
          <div className="flex items-center gap-4 text-lg font-semibold">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <span>{timeLeft}s</span>
            </div>
            <div>Score: {score}</div>
          </div>

          <div className="text-4xl font-bold text-center">
            {puzzle.question} = ?
          </div>

          <div className="flex gap-2 w-full">
            <Input
              type="number"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Your answer"
              className="text-2xl text-center"
              autoFocus
            />
            <Button onClick={checkAnswer} size="lg">
              Submit
            </Button>
          </div>

          <Button onClick={startGame} variant="outline">
            <RotateCcw className="h-4 w-4 mr-2" />
            Restart
          </Button>
        </>
      )}
    </div>
  );
};
