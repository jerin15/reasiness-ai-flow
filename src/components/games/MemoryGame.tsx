import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw } from "lucide-react";

const emojis = ['🎮', '🎯', '🎨', '🎭', '🎪', '🎬', '🎸', '🎹', '🎺', '🎻', '🎲', '🎰'];

type Card = {
  id: number;
  emoji: string;
  flipped: boolean;
  matched: boolean;
};

interface MemoryGameProps {
  roomId?: string;
}

export const MemoryGame = ({ roomId }: MemoryGameProps) => {
  const { toast } = useToast();
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);

  const initializeGame = () => {
    const gameEmojis = emojis.slice(0, 8);
    const cardPairs = [...gameEmojis, ...gameEmojis]
      .map((emoji, index) => ({
        id: index,
        emoji,
        flipped: false,
        matched: false,
      }))
      .sort(() => Math.random() - 0.5);
    
    setCards(cardPairs);
    setFlippedCards([]);
    setMoves(0);
  };

  useEffect(() => {
    initializeGame();
  }, []);

  useEffect(() => {
    if (flippedCards.length === 2) {
      const [first, second] = flippedCards;
      const firstCard = cards[first];
      const secondCard = cards[second];

      if (firstCard.emoji === secondCard.emoji) {
        setTimeout(() => {
          setCards(prev => prev.map((card, idx) => 
            idx === first || idx === second ? { ...card, matched: true } : card
          ));
          setFlippedCards([]);
          
          // Check if all matched
          if (cards.filter(c => !c.matched).length === 2) {
            toast({
              title: "Congratulations! 🎉",
              description: `You won in ${moves + 1} moves!`,
            });
          }
        }, 500);
      } else {
        setTimeout(() => {
          setCards(prev => prev.map((card, idx) => 
            idx === first || idx === second ? { ...card, flipped: false } : card
          ));
          setFlippedCards([]);
        }, 1000);
      }
      setMoves(prev => prev + 1);
    }
  }, [flippedCards, cards, moves, toast]);

  const handleCardClick = (index: number) => {
    if (flippedCards.length === 2 || cards[index].flipped || cards[index].matched) {
      return;
    }

    setCards(prev => prev.map((card, idx) => 
      idx === index ? { ...card, flipped: true } : card
    ));
    setFlippedCards(prev => [...prev, index]);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-lg font-semibold">Moves: {moves}</div>

      <div className="grid grid-cols-4 gap-3">
        {cards.map((card, index) => (
          <button
            key={card.id}
            onClick={() => handleCardClick(index)}
            className={`
              w-20 h-20 rounded-lg flex items-center justify-center text-4xl
              transition-all duration-300 transform
              ${card.flipped || card.matched 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-secondary hover:bg-secondary/80'
              }
              ${card.matched ? 'opacity-50' : ''}
            `}
            disabled={card.matched}
          >
            {card.flipped || card.matched ? card.emoji : '?'}
          </button>
        ))}
      </div>

      <Button onClick={initializeGame} variant="outline">
        <RotateCcw className="h-4 w-4 mr-2" />
        New Game
      </Button>
    </div>
  );
};
