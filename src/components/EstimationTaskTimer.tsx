import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EstimationTaskTimerProps {
  lastActivityAt: string;
  status: string;
  type: string;
  timeLimit?: number; // in hours
}

export const EstimationTaskTimer = ({ 
  lastActivityAt, 
  status, 
  type,
  timeLimit = 2 
}: EstimationTaskTimerProps) => {
  const [hoursIdle, setHoursIdle] = useState(0);
  const [shouldPlaySound, setShouldPlaySound] = useState(false);

  useEffect(() => {
    // Only show for quotation tasks in critical stages
    if (type !== 'quotation' || !['todo', 'supplier_quotes', 'client_approval', 'admin_approval'].includes(status)) {
      return;
    }

    const updateTimer = () => {
      const idle = (Date.now() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60);
      setHoursIdle(idle);

      // Play sound if overdue
      if (idle >= timeLimit && !shouldPlaySound) {
        setShouldPlaySound(true);
        playAlertSound();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [lastActivityAt, status, type, timeLimit, shouldPlaySound]);

  const playAlertSound = () => {
    // Create audio context for alert sound
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.3;

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.2);
  };

  if (type !== 'quotation' || !['todo', 'supplier_quotes', 'client_approval', 'admin_approval'].includes(status)) {
    return null;
  }

  const percentage = (hoursIdle / timeLimit) * 100;
  const minutesRemaining = Math.max(0, (timeLimit - hoursIdle) * 60);
  const hoursRemaining = Math.floor(minutesRemaining / 60);
  const minsRemaining = Math.floor(minutesRemaining % 60);

  const getColorClass = () => {
    if (percentage >= 100) return 'text-red-600 dark:text-red-400 animate-pulse';
    if (percentage >= 90) return 'text-red-500 dark:text-red-400 animate-pulse';
    if (percentage >= 75) return 'text-orange-500 dark:text-orange-400 animate-pulse';
    if (percentage >= 50) return 'text-yellow-600 dark:text-yellow-500';
    return 'text-green-600 dark:text-green-500';
  };

  const getBgClass = () => {
    if (percentage >= 100) return 'bg-red-100 dark:bg-red-950 border-red-300 dark:border-red-800';
    if (percentage >= 90) return 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900';
    if (percentage >= 75) return 'bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-900';
    if (percentage >= 50) return 'bg-yellow-50 dark:bg-yellow-950/50 border-yellow-200 dark:border-yellow-900';
    return 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-900';
  };

  return (
    <div className={cn('px-2 py-1.5 rounded-md border', getBgClass())}>
      <div className="flex items-center gap-2">
        <Clock className={cn('h-4 w-4', getColorClass())} />
        <div className="flex-1 min-w-0">
          <div className={cn('text-xs font-medium', getColorClass())}>
            {hoursIdle < 1 
              ? `${Math.floor(hoursIdle * 60)}m idle`
              : `${hoursIdle.toFixed(1)}h idle`
            }
          </div>
          {percentage < 100 ? (
            <div className="text-xs text-muted-foreground">
              {hoursRemaining > 0 ? `${hoursRemaining}h ` : ''}{minsRemaining}m until escalation
            </div>
          ) : (
            <div className={cn('text-xs font-semibold', getColorClass())}>
              ⚠️ OVERDUE BY {(hoursIdle - timeLimit).toFixed(1)}h
            </div>
          )}
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
        <div 
          className={cn(
            'h-full transition-all duration-500',
            percentage >= 100 ? 'bg-red-600' :
            percentage >= 75 ? 'bg-orange-500' :
            percentage >= 50 ? 'bg-yellow-500' :
            'bg-green-500'
          )}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
};
