import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskAgingIndicatorProps {
  lastActivityAt: string;
  priority?: string;
}

export const TaskAgingIndicator = ({ lastActivityAt, priority }: TaskAgingIndicatorProps) => {
  const getAgeInHours = () => {
    return Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60));
  };

  const hours = getAgeInHours();

  if (hours < 24) {
    return null; // Don't show indicator for fresh tasks
  }

  if (hours >= 72) {
    return (
      <Badge 
        variant="destructive" 
        className={cn(
          "flex items-center gap-1 animate-pulse",
          priority === 'urgent' && "bg-red-600"
        )}
      >
        <AlertTriangle className="h-3 w-3" />
        {Math.floor(hours / 24)}d old
      </Badge>
    );
  } else if (hours >= 48) {
    return (
      <Badge 
        variant="secondary" 
        className="flex items-center gap-1 bg-orange-500 text-white animate-pulse"
      >
        <Clock className="h-3 w-3" />
        {hours}h old
      </Badge>
    );
  } else {
    return (
      <Badge 
        variant="secondary" 
        className="flex items-center gap-1 bg-yellow-500 text-white"
      >
        <Clock className="h-3 w-3" />
        {hours}h old
      </Badge>
    );
  }
};