import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MapPin,
  GripVertical,
  Trash2,
  CheckCircle2,
  Circle,
  Navigation,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface RoutePin {
  id: string;
  user_id: string;
  title: string;
  address: string | null;
  latitude: number;
  longitude: number;
  pin_order: number;
  route_date: string;
  status: string;
  notes: string | null;
  created_at: string;
}

interface RoutePinsListProps {
  pins: RoutePin[];
  onPinClick: (pin: RoutePin) => void;
  onPinsChange: () => void;
  selectedPinId?: string;
  canEdit?: boolean;
}

export const RoutePinsList = ({
  pins,
  onPinClick,
  onPinsChange,
  selectedPinId,
  canEdit = true,
}: RoutePinsListProps) => {
  const handleToggleStatus = async (pin: RoutePin) => {
    if (!canEdit) return;
    
    const newStatus = pin.status === 'completed' ? 'pending' : 'completed';
    try {
      const { error } = await supabase
        .from('operations_route_pins')
        .update({ status: newStatus })
        .eq('id', pin.id);

      if (error) throw error;
      onPinsChange();
    } catch (error) {
      console.error('Error updating pin status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (pinId: string) => {
    if (!canEdit) return;
    
    try {
      const { error } = await supabase
        .from('operations_route_pins')
        .delete()
        .eq('id', pinId);

      if (error) throw error;
      toast.success('Pin removed');
      onPinsChange();
    } catch (error) {
      console.error('Error deleting pin:', error);
      toast.error('Failed to remove pin');
    }
  };

  if (pins.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No route pins for today</p>
        {canEdit && (
          <p className="text-xs mt-1">Long press on map to add a pin</p>
        )}
      </div>
    );
  }

  const completedCount = pins.filter((p) => p.status === 'completed').length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          {completedCount}/{pins.length} completed
        </span>
        <Badge variant="secondary" className="text-xs">
          {pins.length} stop{pins.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      <ScrollArea className="h-full max-h-[200px]">
        <div className="space-y-1">
          {pins.map((pin, index) => (
            <div
              key={pin.id}
              className={cn(
                'flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors',
                selectedPinId === pin.id
                  ? 'bg-primary/10 border-primary/30'
                  : 'hover:bg-muted/50',
                pin.status === 'completed' && 'opacity-60'
              )}
              onClick={() => onPinClick(pin)}
            >
              {canEdit && (
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
              )}

              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleStatus(pin);
                }}
                disabled={!canEdit}
              >
                {pin.status === 'completed' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </Button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs shrink-0">
                    {index + 1}
                  </Badge>
                  <span
                    className={cn(
                      'font-medium text-sm truncate',
                      pin.status === 'completed' && 'line-through'
                    )}
                  >
                    {pin.title}
                  </span>
                </div>
                {pin.address && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {pin.address}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Open in maps app
                    window.open(
                      `https://www.google.com/maps/dir/?api=1&destination=${pin.latitude},${pin.longitude}`,
                      '_blank'
                    );
                  }}
                >
                  <Navigation className="h-4 w-4 text-primary" />
                </Button>

                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(pin.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
