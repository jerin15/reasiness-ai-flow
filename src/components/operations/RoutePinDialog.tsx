import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MapPin, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RoutePinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  latitude: number;
  longitude: number;
  userId: string;
  onPinAdded: () => void;
}

export const RoutePinDialog = ({
  open,
  onOpenChange,
  latitude,
  longitude,
  userId,
  onPinAdded,
}: RoutePinDialogProps) => {
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Please enter a title for this pin');
      return;
    }

    setIsLoading(true);
    try {
      // Get the next pin order for today
      const today = new Date().toISOString().split('T')[0];
      const { data: existingPins } = await supabase
        .from('operations_route_pins')
        .select('pin_order')
        .eq('user_id', userId)
        .eq('route_date', today)
        .order('pin_order', { ascending: false })
        .limit(1);

      const nextOrder = (existingPins?.[0]?.pin_order ?? -1) + 1;

      const { error } = await supabase.from('operations_route_pins').insert({
        user_id: userId,
        title: title.trim(),
        address: address.trim() || null,
        latitude,
        longitude,
        notes: notes.trim() || null,
        pin_order: nextOrder,
        route_date: today,
      });

      if (error) throw error;

      toast.success('Route pin added');
      onPinAdded();
      onOpenChange(false);
      setTitle('');
      setAddress('');
      setNotes('');
    } catch (error) {
      console.error('Error adding route pin:', error);
      toast.error('Failed to add route pin');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Add Route Pin
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Location Name *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Client Office, Supplier Warehouse"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g., Building 5, Street 10, Dubai"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional details..."
              rows={2}
            />
          </div>

          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">
              Coordinates: {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Pin
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
