import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Map, 
  Bell, 
  Settings,
  Menu,
  X,
  MapPin,
  User,
  Radio
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { OperationsLocationMap } from './OperationsLocationMap';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface OperationsMobileShellProps {
  userId: string;
  userName: string;
  operationsUsers: Array<{ id: string; full_name: string | null; email: string }>;
}

export const OperationsMobileShell = ({ 
  userId, 
  userName,
  operationsUsers 
}: OperationsMobileShellProps) => {
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [notificationCount] = useState(0);

  // Load token from localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem('mapbox_token');
    if (savedToken) {
      setMapboxToken(savedToken);
    } else {
      setShowTokenInput(true);
    }
  }, []);

  const handleSaveToken = () => {
    if (tempToken.trim()) {
      localStorage.setItem('mapbox_token', tempToken.trim());
      setMapboxToken(tempToken.trim());
      setShowTokenInput(false);
      toast.success('Mapbox token saved');
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 bg-background border-b px-4 py-3 flex items-center justify-between safe-area-inset-top">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">{userName}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Radio className="h-3 w-3 text-green-500 animate-pulse" />
              <span>Operations</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
              >
                {notificationCount}
              </Badge>
            )}
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px]">
              <SheetHeader>
                <SheetTitle>Settings</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Mapbox Token</label>
                  <Input
                    type="password"
                    placeholder="Enter Mapbox public token"
                    value={tempToken || mapboxToken}
                    onChange={(e) => setTempToken(e.target.value)}
                  />
                  <Button 
                    size="sm" 
                    className="w-full"
                    onClick={handleSaveToken}
                  >
                    Save Token
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Get your token from <a href="https://mapbox.com" target="_blank" rel="noopener" className="text-primary underline">mapbox.com</a>
                  </p>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {showTokenInput && !mapboxToken ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <MapPin className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Enable Live Map</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              Enter your Mapbox public token to enable live location tracking
            </p>
            <div className="w-full max-w-xs space-y-3">
              <Input
                type="text"
                placeholder="pk.eyJ1IjoieW91ci10b2tlbi4uLiI"
                value={tempToken}
                onChange={(e) => setTempToken(e.target.value)}
                className="text-center"
              />
              <Button className="w-full" onClick={handleSaveToken}>
                <Map className="h-4 w-4 mr-2" />
                Enable Map
              </Button>
              <a 
                href="https://mapbox.com" 
                target="_blank" 
                rel="noopener" 
                className="text-xs text-primary underline block"
              >
                Get a free token from Mapbox.com →
              </a>
            </div>
          </div>
        ) : (
          <OperationsLocationMap
            userId={userId}
            mapboxToken={mapboxToken}
            operationsUsers={operationsUsers}
          />
        )}
      </main>
    </div>
  );
};
