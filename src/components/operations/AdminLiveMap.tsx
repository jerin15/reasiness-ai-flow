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
  Truck,
  Route
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { RoutePin } from './RoutePinsList';

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
  const routeMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  
  const [teamLocations, setTeamLocations] = useState<TeamMemberLocation[]>([]);
  const [allRoutePins, setAllRoutePins] = useState<Map<string, RoutePin[]>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRoutePins, setShowRoutePins] = useState(true);

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
      const currentHour = now.getHours();
      const isTrackingHours = currentHour >= 6 && currentHour < 20; // 6 AM to 8 PM
      
      operationsUsers.forEach(user => {
        const presence = data?.find(p => p.user_id === user.id);
        
        if (presence?.custom_message) {
          try {
            const locationData = JSON.parse(presence.custom_message);
            if (locationData.lat && locationData.lng) {
              const lastActive = new Date(presence.last_active || locationData.updated_at);
              const secondsSinceUpdate = (now.getTime() - lastActive.getTime()) / 1000;
              
              // User is online if:
              // 1. Status is 'online'
              // 2. Last update was within 60 seconds
              // 3. We're within tracking hours
              const isOnline = presence.status === 'online' && 
                              secondsSinceUpdate < 60 && 
                              isTrackingHours;
              
              locations.push({
                userId: user.id,
                name: user.full_name || user.email.split('@')[0],
                email: user.email,
                lat: locationData.lat,
                lng: locationData.lng,
                updatedAt: locationData.updated_at || presence.last_active,
                isOnline,
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

  // Fetch all route pins for all operations users
  const fetchAllRoutePins = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const teamIds = operationsUsers.map(u => u.id);
      
      if (teamIds.length === 0) {
        setAllRoutePins(new Map());
        return;
      }

      const { data, error } = await supabase
        .from('operations_route_pins')
        .select('*')
        .in('user_id', teamIds)
        .eq('route_date', today)
        .order('pin_order', { ascending: true });

      if (error) throw error;

      const pinsMap = new Map<string, RoutePin[]>();
      (data as RoutePin[])?.forEach(pin => {
        const existing = pinsMap.get(pin.user_id) || [];
        existing.push(pin);
        pinsMap.set(pin.user_id, existing);
      });

      setAllRoutePins(pinsMap);
    } catch (error) {
      console.error('Error fetching route pins:', error);
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
                <div class="text-xs ${member.isOnline ? 'text-green-600' : 'text-gray-500'}">
                  ${member.isOnline ? '🟢 Live Now' : `⚫ Last seen: ${formatDistanceToNow(new Date(member.updatedAt), { addSuffix: true })}`}
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
    fetchAllRoutePins();
    const interval = setInterval(() => {
      fetchTeamLocations();
      fetchAllRoutePins();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchTeamLocations, fetchAllRoutePins]);

  // Real-time subscription for presence and route pins changes
  useEffect(() => {
    const channel = supabase
      .channel('admin-team-locations-pins')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, () => fetchTeamLocations())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operations_route_pins' }, () => fetchAllRoutePins())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTeamLocations, fetchAllRoutePins]);

  // Update route pin markers
  useEffect(() => {
    if (!mapReady || !map.current || !showRoutePins) {
      routeMarkersRef.current.forEach(m => m.remove());
      routeMarkersRef.current.clear();
      return;
    }

    const allPinIds = new Set<string>();
    allRoutePins.forEach((pins, memberId) => {
      const member = operationsUsers.find(u => u.id === memberId);
      const memberName = member?.full_name || member?.email?.split('@')[0] || 'Unknown';
      
      pins.forEach((pin, index) => {
        allPinIds.add(pin.id);
        const existing = routeMarkersRef.current.get(pin.id);
        if (existing) {
          existing.setLngLat([pin.longitude, pin.latitude]);
        } else {
          const el = document.createElement('div');
          const isCompleted = pin.status === 'completed';
          el.innerHTML = `<div class="w-6 h-6 ${isCompleted ? 'bg-green-500' : 'bg-orange-500'} rounded-full border-2 border-white shadow-md flex items-center justify-center text-white font-bold text-xs">${index + 1}</div>`;
          
          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([pin.longitude, pin.latitude])
            .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML(`
              <div class="p-2"><strong>${memberName}</strong><br/><span class="text-sm">${pin.title}</span><br/><span class="text-xs ${isCompleted ? 'text-green-600' : 'text-orange-600'}">${isCompleted ? '✓ Done' : '○ Pending'}</span></div>
            `))
            .addTo(map.current!);
          routeMarkersRef.current.set(pin.id, marker);
        }
      });
    });

    routeMarkersRef.current.forEach((m, id) => {
      if (!allPinIds.has(id)) { m.remove(); routeMarkersRef.current.delete(id); }
    });
  }, [mapReady, allRoutePins, showRoutePins, operationsUsers]);

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
            <div className="flex items-center gap-1">
              <Button 
                variant={showRoutePins ? "default" : "ghost"} 
                size="icon" 
                onClick={() => setShowRoutePins(!showRoutePins)}
                title="Toggle route pins"
              >
                <Route className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => { fetchTeamLocations(); fetchAllRoutePins(); }}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
            </div>
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
                      isOnline ? (
                        <p className="text-xs text-green-600 flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          Live now
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(location.updatedAt), { addSuffix: true })}
                        </p>
                      )
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
      <div className="flex-1 relative rounded-lg overflow-hidden border min-h-[400px]">
        <div ref={mapContainer} className="absolute inset-0 w-full h-full" style={{ minHeight: '400px' }} />
        
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
