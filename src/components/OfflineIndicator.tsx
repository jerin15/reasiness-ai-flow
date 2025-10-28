import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const OfflineIndicator = () => {
  const { isOnline, isSyncing } = useOnlineStatus();

  if (isOnline && !isSyncing) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2">
      <Badge 
        variant={isOnline ? "default" : "destructive"}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium shadow-lg"
      >
        {isSyncing ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            Syncing changes...
          </>
        ) : !isOnline ? (
          <>
            <WifiOff className="h-4 w-4" />
            Offline Mode
          </>
        ) : (
          <>
            <Wifi className="h-4 w-4" />
            Online
          </>
        )}
      </Badge>
    </div>
  );
};
