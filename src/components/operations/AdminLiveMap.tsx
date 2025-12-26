import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  MapPin, 
  RefreshCw,
  Users,
  Clock,
  Navigation,
  Signal,
  SignalZero,
  Truck
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface TeamMemberLocation {
  userId: string;
  name: string;
  email: string;
  lat: number;
  lng: number;
  updatedAt: string;
  isOnline: boolean;
}

interface OperationsUser {
  id: string;
  full_name: string | null;
  email: string;
}

interface AdminLiveMapProps {
  mapboxToken: string;
  operationsUsers: OperationsUser[];
}

export const AdminLiveMap = ({ 
  mapboxToken,
  operationsUsers 
}: AdminLiveMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  
  const [teamLocations, setTeamLocations] = useState<TeamMemberLocation[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch team locations from database
  const fetchTeamLocations = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const teamIds = operationsUsers.map(u => u.id);
      
      if (teamIds.length === 0) {
        setTeamLocations([]);
        return;
      }

      const { data, error } = await supabase
        .from('user_presence')
        .select('user_id, custom_message, last_active, status')
        .in('user_id', teamIds);

      if (error) throw error;

      const locations: TeamMemberLocation[] = [];
      const now = new Date();
      
      operationsUsers.forEach(user => {
        const presence = data?.find(p => p.user_id === user.id);
        
        if (presence?.custom_message) {
          try {
            const locationData = JSON.parse(presence.custom_message);
            if (locationData.lat && locationData.lng) {
              const lastActive = new Date(presence.last_active || locationData.updated_at);
              const minutesSinceUpdate = (now.getTime() - lastActive.getTime()) / 60000;
              
              locations.push({
                userId: user.id,
                name: user.full_name || user.email.split('@')[0],
                email: user.email,
                lat: locationData.lat,
                lng: locationData.lng,
                updatedAt: locationData.updated_at || presence.last_active,
                isOnline: presence.status === 'online' && minutesSinceUpdate < 10,
              });
            }
          } catch {
            // Invalid JSON, skip
          }
        }
      });

      setTeamLocations(locations);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error fetching team locations:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [operationsUsers]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [55.2708, 25.2048], // Dubai default
      zoom: 11,
      attributionControl: false,
    });

    map.current.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      'top-right'
    );

    map.current.on('load', () => {
      setMapReady(true);
    });

    return () => {
      map.current?.remove();
    };
  }, [mapboxToken]);

  // Update markers when locations change
  useEffect(() => {
    if (!mapReady || !map.current) return;

    // Remove old markers
    markersRef.current.forEach((marker, id) => {
      if (!teamLocations.find(loc => loc.userId === id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Add or update markers
    teamLocations.forEach(member => {
      const existingMarker = markersRef.current.get(member.userId);

      if (existingMarker) {
        existingMarker.setLngLat([member.lng, member.lat]);
      } else {
        // Create custom marker element
        const el = document.createElement('div');
        el.className = 'admin-team-marker';
        el.innerHTML = `
          <div class="relative cursor-pointer group">
            <div class="absolute -inset-2 ${member.isOnline ? 'bg-green-500/30 animate-ping' : 'bg-gray-400/20'} rounded-full"></div>
            <div class="relative w-12 h-12 ${member.isOnline ? 'bg-primary' : 'bg-gray-400'} rounded-full border-4 border-white shadow-xl flex items-center justify-center text-white font-bold text-lg">
              ${member.name.charAt(0).toUpperCase()}
            </div>
            <div class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${member.isOnline ? 'bg-green-500' : 'bg-gray-400'}"></div>
          </div>
        `;

        el.addEventListener('click', () => {
          setSelectedMember(member.userId);
          map.current?.flyTo({
            center: [member.lng, member.lat],
            zoom: 15,
            duration: 1000,
          });
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([member.lng, member.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 25 }).setHTML(`
              <div class="p-2">
                <div class="font-bold text-base">${member.name}</div>
                <div class="text-xs text-gray-500">${member.isOnline ? '🟢 Online' : '⚫ Offline'}</div>
                <div class="text-xs text-gray-400 mt-1">
                  Last seen: ${formatDistanceToNow(new Date(member.updatedAt), { addSuffix: true })}
                </div>
              </div>
            `)
          )
          .addTo(map.current!);

        markersRef.current.set(member.userId, marker);
      }
    });

    // Fit bounds to show all markers
    if (teamLocations.length > 0 && !selectedMember) {
      const bounds = new mapboxgl.LngLatBounds();
      teamLocations.forEach(loc => {
        bounds.extend([loc.lng, loc.lat]);
      });
      
      map.current.fitBounds(bounds, {
        padding: 80,
        maxZoom: 14,
        duration: 1000,
      });
    }
  }, [mapReady, teamLocations, selectedMember]);

  // Initial fetch and periodic refresh
  useEffect(() => {
    fetchTeamLocations();
    const interval = setInterval(fetchTeamLocations, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [fetchTeamLocations]);

  // Real-time subscription for presence changes
  useEffect(() => {
    const channel = supabase
      .channel('admin-team-locations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence',
        },
        () => {
          fetchTeamLocations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTeamLocations]);

  const focusOnMember = (member: TeamMemberLocation) => {
    setSelectedMember(member.userId);
    if (map.current) {
      map.current.flyTo({
        center: [member.lng, member.lat],
        zoom: 16,
        duration: 1000,
      });
      
      // Open popup
      const marker = markersRef.current.get(member.userId);
      marker?.togglePopup();
    }
  };

  const showAllMembers = () => {
    setSelectedMember(null);
    if (map.current && teamLocations.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      teamLocations.forEach(loc => {
        bounds.extend([loc.lng, loc.lat]);
      });
      
      map.current.fitBounds(bounds, {
        padding: 80,
        maxZoom: 14,
        duration: 1000,
      });
    }
  };

  const onlineCount = teamLocations.filter(m => m.isOnline).length;
  const totalMembers = operationsUsers.length;

  return (
    <div className="flex flex-col lg:flex-row h-[600px] lg:h-[700px] gap-4">
      {/* Team Members Panel */}
      <Card className="lg:w-80 shrink-0 flex flex-col">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Operations Team
            </h3>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={fetchTeamLocations}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Signal className="h-4 w-4 text-green-500" />
              <span>{onlineCount} online</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <SignalZero className="h-4 w-4" />
              <span>{totalMembers - onlineCount} offline</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Last updated: {formatDistanceToNow(lastRefresh, { addSuffix: true })}
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {/* Show All Button */}
            {teamLocations.length > 1 && (
              <Button
                variant={selectedMember === null ? "secondary" : "ghost"}
                className="w-full justify-start gap-3"
                onClick={showAllMembers}
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Truck className="h-4 w-4 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-sm">Show All</p>
                  <p className="text-xs text-muted-foreground">View entire team</p>
                </div>
              </Button>
            )}

            {/* Team Members */}
            {operationsUsers.map(user => {
              const location = teamLocations.find(l => l.userId === user.id);
              const isOnline = location?.isOnline;
              const hasLocation = !!location;

              return (
                <Button
                  key={user.id}
                  variant={selectedMember === user.id ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3 h-auto py-3",
                    !hasLocation && "opacity-50"
                  )}
                  onClick={() => location && focusOnMember(location)}
                  disabled={!hasLocation}
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className={cn(
                        isOnline ? "bg-primary text-primary-foreground" : "bg-muted"
                      )}>
                        {(user.full_name || user.email)[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background",
                      isOnline ? "bg-green-500" : "bg-gray-400"
                    )} />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium text-sm truncate">
                      {user.full_name || user.email.split('@')[0]}
                    </p>
                    {hasLocation ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(location.updatedAt), { addSuffix: true })}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No location shared
                      </p>
                    )}
                  </div>
                  {hasLocation && (
                    <Navigation className="h-4 w-4 text-primary shrink-0" />
                  )}
                </Button>
              );
            })}

            {operationsUsers.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No operations team members</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Map Container */}
      <div className="flex-1 relative rounded-lg overflow-hidden border">
        <div ref={mapContainer} className="absolute inset-0" />
        
        {/* Map Overlay - Status */}
        <div className="absolute top-3 left-3 z-10">
          <Badge variant="secondary" className="gap-1.5 py-1.5 px-3 bg-background/90 backdrop-blur-sm shadow-lg">
            {onlineCount > 0 ? (
              <>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {onlineCount} member{onlineCount !== 1 ? 's' : ''} tracking
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-gray-400" />
                No active tracking
              </>
            )}
          </Badge>
        </div>

        {/* No Locations Message */}
        {mapReady && teamLocations.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
            <div className="text-center p-6 max-w-sm">
              <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">No Locations Available</h3>
              <p className="text-sm text-muted-foreground">
                Operations team members need to enable location sharing in their mobile app to appear on the map.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
