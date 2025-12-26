import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, 
  Navigation, 
  Locate, 
  AlertTriangle,
  Radio,
  User,
  RefreshCw,
  Route,
  Plus
} from 'lucide-react';
import { useGeolocation } from '@/hooks/useGeolocation';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { RoutePinDialog } from './RoutePinDialog';
import { RoutePinsList, RoutePin } from './RoutePinsList';

interface TeamMemberLocation {
  userId: string;
  name: string;
  lat: number;
  lng: number;
  updatedAt: string;
}

interface OperationsLocationMapProps {
  userId: string;
  mapboxToken: string;
  operationsUsers: Array<{ id: string; full_name: string | null; email: string }>;
}

export const OperationsLocationMap = ({ 
  userId, 
  mapboxToken,
  operationsUsers 
}: OperationsLocationMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const userMarker = useRef<mapboxgl.Marker | null>(null);
  const teamMarkers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const routeMarkers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  
  const [teamLocations, setTeamLocations] = useState<TeamMemberLocation[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [routePins, setRoutePins] = useState<RoutePin[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string>();
  const [showRoutePanel, setShowRoutePanel] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pendingPinCoords, setPendingPinCoords] = useState<{ lat: number; lng: number } | null>(null);

  const {
    latitude,
    longitude,
    accuracy,
    permissionStatus,
    isTracking,
    error,
    requestPermission,
    startTracking,
    stopTracking,
    getCurrentPosition,
  } = useGeolocation(userId, {
    enableHighAccuracy: true,
    updateInterval: 3000,
  });

  // Fetch route pins for today
  const fetchRoutePins = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('operations_route_pins')
        .select('*')
        .eq('user_id', userId)
        .eq('route_date', today)
        .order('pin_order', { ascending: true });

      if (error) throw error;
      setRoutePins((data as RoutePin[]) || []);
    } catch (error) {
      console.error('Error fetching route pins:', error);
    }
  }, [userId]);

  // Fetch team locations from database
  const fetchTeamLocations = useCallback(async () => {
    try {
      const teamIds = operationsUsers.map(u => u.id);
      
      const { data, error } = await supabase
        .from('user_presence')
        .select('user_id, custom_message, last_active')
        .in('user_id', teamIds)
        .eq('status', 'online');

      if (error) throw error;

      const locations: TeamMemberLocation[] = [];
      
      data?.forEach(presence => {
        if (presence.custom_message) {
          try {
            const locationData = JSON.parse(presence.custom_message);
            if (locationData.lat && locationData.lng) {
              const user = operationsUsers.find(u => u.id === presence.user_id);
              locations.push({
                userId: presence.user_id,
                name: user?.full_name || user?.email || 'Team Member',
                lat: locationData.lat,
                lng: locationData.lng,
                updatedAt: locationData.updated_at || presence.last_active,
              });
            }
          } catch {
            // Invalid JSON, skip
          }
        }
      });

      setTeamLocations(locations);
    } catch (error) {
      console.error('Error fetching team locations:', error);
    }
  }, [operationsUsers]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return;

    // Wait for container to have dimensions
    const initMap = () => {
      if (!mapContainer.current) return;
      
      const rect = mapContainer.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        // Container not ready, retry
        setTimeout(initMap, 100);
        return;
      }

      try {
        mapboxgl.accessToken = mapboxToken;

        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [55.2708, 25.2048], // Dubai default
          zoom: 12,
          attributionControl: false,
        });

        map.current.addControl(
          new mapboxgl.NavigationControl({ visualizePitch: true }),
          'bottom-right'
        );

        map.current.addControl(
          new mapboxgl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
            showUserHeading: true,
          }),
          'bottom-right'
        );

        map.current.on('load', () => {
          console.log('Mapbox map loaded successfully');
          setMapReady(true);
        });

        map.current.on('error', (e) => {
          console.error('Mapbox error:', e);
        });
      } catch (err) {
        console.error('Error initializing Mapbox:', err);
      }
    };

    // Small delay to ensure container is rendered
    setTimeout(initMap, 50);

    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
      map.current?.remove();
      map.current = null;
      setMapReady(false);
    };
  }, [mapboxToken]);

  // Add long-press handler for adding pins
  useEffect(() => {
    if (!mapReady || !map.current) return;

    const handleMouseDown = (e: mapboxgl.MapMouseEvent) => {
      longPressTimer.current = setTimeout(() => {
        setPendingPinCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        setPinDialogOpen(true);
      }, 600);
    };

    const handleMouseUp = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    const handleTouchStart = (e: mapboxgl.MapTouchEvent) => {
      if (e.originalEvent.touches.length === 1) {
        longPressTimer.current = setTimeout(() => {
          setPendingPinCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
          setPinDialogOpen(true);
        }, 600);
      }
    };

    const handleTouchEnd = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    map.current.on('mousedown', handleMouseDown);
    map.current.on('mouseup', handleMouseUp);
    map.current.on('mouseleave', handleMouseUp);
    map.current.on('touchstart', handleTouchStart);
    map.current.on('touchend', handleTouchEnd);
    map.current.on('touchcancel', handleTouchEnd);
    map.current.on('dragstart', handleMouseUp);

    return () => {
      if (map.current) {
        map.current.off('mousedown', handleMouseDown);
        map.current.off('mouseup', handleMouseUp);
        map.current.off('mouseleave', handleMouseUp);
        map.current.off('touchstart', handleTouchStart);
        map.current.off('touchend', handleTouchEnd);
        map.current.off('touchcancel', handleTouchEnd);
        map.current.off('dragstart', handleMouseUp);
      }
    };
  }, [mapReady]);

  // Update user marker when location changes
  useEffect(() => {
    if (!mapReady || !map.current || !latitude || !longitude) return;

    if (!userMarker.current) {
      // Create custom marker element
      const el = document.createElement('div');
      el.className = 'user-marker';
      el.innerHTML = `
        <div class="relative">
          <div class="absolute -inset-3 bg-primary/20 rounded-full animate-ping"></div>
          <div class="w-8 h-8 bg-primary rounded-full border-4 border-white shadow-lg flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
        </div>
      `;

      userMarker.current = new mapboxgl.Marker(el)
        .setLngLat([longitude, latitude])
        .setPopup(new mapboxgl.Popup().setHTML('<strong>You are here</strong>'))
        .addTo(map.current);

      // Center map on first location
      map.current.flyTo({
        center: [longitude, latitude],
        zoom: 14,
        duration: 1000,
      });
    } else {
      userMarker.current.setLngLat([longitude, latitude]);
    }
  }, [mapReady, latitude, longitude]);

  // Update team markers
  useEffect(() => {
    if (!mapReady || !map.current) return;

    teamLocations.forEach(member => {
      if (member.userId === userId) return; // Skip self

      const existingMarker = teamMarkers.current.get(member.userId);

      if (existingMarker) {
        existingMarker.setLngLat([member.lng, member.lat]);
      } else {
        const el = document.createElement('div');
        el.className = 'team-marker';
        el.innerHTML = `
          <div class="w-7 h-7 bg-secondary rounded-full border-3 border-white shadow-md flex items-center justify-center text-xs font-bold text-secondary-foreground">
            ${member.name.charAt(0).toUpperCase()}
          </div>
        `;

        const marker = new mapboxgl.Marker(el)
          .setLngLat([member.lng, member.lat])
          .setPopup(new mapboxgl.Popup().setHTML(`
            <div class="p-1">
              <strong>${member.name}</strong>
              <p class="text-xs text-gray-500">Last updated: ${new Date(member.updatedAt).toLocaleTimeString()}</p>
            </div>
          `))
          .addTo(map.current!);

        teamMarkers.current.set(member.userId, marker);
      }
    });
  }, [mapReady, teamLocations, userId]);

  // Fetch team locations and route pins periodically
  useEffect(() => {
    fetchTeamLocations();
    fetchRoutePins();
    const interval = setInterval(() => {
      fetchTeamLocations();
      fetchRoutePins();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchTeamLocations, fetchRoutePins]);

  // Real-time subscription for team locations and route pins
  useEffect(() => {
    const channel = supabase
      .channel('team-locations-and-pins')
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'operations_route_pins',
        },
        () => {
          fetchRoutePins();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTeamLocations, fetchRoutePins]);

  // Update route markers
  useEffect(() => {
    if (!mapReady || !map.current) return;

    // Remove old route markers
    routeMarkers.current.forEach((marker, id) => {
      if (!routePins.find(pin => pin.id === id)) {
        marker.remove();
        routeMarkers.current.delete(id);
      }
    });

    // Add or update route markers
    routePins.forEach((pin, index) => {
      const existingMarker = routeMarkers.current.get(pin.id);

      if (existingMarker) {
        existingMarker.setLngLat([pin.longitude, pin.latitude]);
      } else {
        const el = document.createElement('div');
        el.className = 'route-pin-marker';
        const isCompleted = pin.status === 'completed';
        el.innerHTML = `
          <div class="relative cursor-pointer">
            <div class="w-8 h-8 ${isCompleted ? 'bg-green-500' : 'bg-orange-500'} rounded-full border-3 border-white shadow-lg flex items-center justify-center text-white font-bold text-sm">
              ${index + 1}
            </div>
          </div>
        `;

        el.addEventListener('click', () => {
          setSelectedPinId(pin.id);
          setShowRoutePanel(true);
          map.current?.flyTo({
            center: [pin.longitude, pin.latitude],
            zoom: 16,
            duration: 800,
          });
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([pin.longitude, pin.latitude])
          .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML(`
            <div class="p-2">
              <div class="font-bold">${pin.title}</div>
              ${pin.address ? `<p class="text-xs text-gray-500">${pin.address}</p>` : ''}
              <p class="text-xs mt-1 ${isCompleted ? 'text-green-600' : 'text-orange-600'}">
                ${isCompleted ? '✓ Completed' : '○ Pending'}
              </p>
            </div>
          `))
          .addTo(map.current!);

        routeMarkers.current.set(pin.id, marker);
      }
    });
  }, [mapReady, routePins]);

  const centerOnMe = () => {
    if (latitude && longitude && map.current) {
      map.current.flyTo({
        center: [longitude, latitude],
        zoom: 15,
        duration: 800,
      });
    }
  };

  const handlePinClick = (pin: RoutePin) => {
    setSelectedPinId(pin.id);
    if (map.current) {
      map.current.flyTo({
        center: [pin.longitude, pin.latitude],
        zoom: 16,
        duration: 800,
      });
    }
  };

  return (
    <div className="h-full w-full flex flex-col" style={{ minHeight: '400px' }}>
      {/* Map Status Bar */}
      <div className="p-3 bg-background border-b flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {permissionStatus === 'granted' ? (
            <Badge variant="default" className="gap-1">
              <Radio className="h-3 w-3 animate-pulse" />
              {isTracking ? 'Live' : 'Ready'}
            </Badge>
          ) : permissionStatus === 'denied' ? (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Location Denied
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <MapPin className="h-3 w-3" />
              Location Off
            </Badge>
          )}

          {accuracy && (
            <span className="text-xs text-muted-foreground">
              ±{Math.round(accuracy)}m
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={showRoutePanel ? 'default' : 'outline'}
            onClick={() => setShowRoutePanel(!showRoutePanel)}
            className="gap-1"
          >
            <Route className="h-4 w-4" />
            {routePins.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {routePins.length}
              </Badge>
            )}
          </Button>

          {permissionStatus !== 'granted' && (
            <Button 
              size="sm" 
              variant="default"
              onClick={requestPermission}
              className="gap-1"
            >
              <MapPin className="h-4 w-4" />
              Enable
            </Button>
          )}

          {permissionStatus === 'granted' && !isTracking && (
            <Button 
              size="sm" 
              variant="default"
              onClick={startTracking}
              className="gap-1"
            >
              <Navigation className="h-4 w-4" />
              Track
            </Button>
          )}

          {isTracking && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={stopTracking}
              className="gap-1"
            >
              <Radio className="h-4 w-4" />
              Stop
            </Button>
          )}

          {latitude && longitude && (
            <Button
              size="sm"
              variant="ghost"
              onClick={centerOnMe}
            >
              <Locate className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 bg-destructive/10 border-b border-destructive/30 text-destructive text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="line-clamp-2">{error}</span>
        </div>
      )}

      {/* Route Planning Panel */}
      {showRoutePanel && (
        <div className="p-3 bg-background border-b">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <Route className="h-4 w-4 text-primary" />
              Today's Route
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (latitude && longitude) {
                  setPendingPinCoords({ lat: latitude, lng: longitude });
                  setPinDialogOpen(true);
                }
              }}
              disabled={!latitude || !longitude}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              Add Current
            </Button>
          </div>
          <RoutePinsList
            pins={routePins}
            onPinClick={handlePinClick}
            onPinsChange={fetchRoutePins}
            selectedPinId={selectedPinId}
            canEdit={true}
          />
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Long press on map to add a pin
          </p>
        </div>
      )}

      {/* Map Container */}
      <div className="flex-1 relative" style={{ minHeight: '300px' }}>
        <div ref={mapContainer} className="absolute inset-0 w-full h-full" style={{ minHeight: '300px' }} />

        {/* Team Online Indicator */}
        {teamLocations.length > 0 && (
          <div className="absolute top-3 left-3 bg-background/90 backdrop-blur-sm rounded-lg shadow-lg p-2 z-10">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-primary" />
              <span className="font-medium">{teamLocations.length} team online</span>
            </div>
          </div>
        )}

        {/* Refresh Button */}
        <Button
          size="icon"
          variant="secondary"
          className="absolute top-3 right-3 shadow-lg z-10"
          onClick={() => {
            getCurrentPosition();
            fetchTeamLocations();
            fetchRoutePins();
          }}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Team Members List */}
      {teamLocations.length > 0 && (
        <div className="p-3 border-t bg-muted/30 max-h-32 overflow-auto">
          <div className="flex flex-wrap gap-2">
            {teamLocations.map(member => (
              <Badge 
                key={member.userId} 
                variant={member.userId === userId ? 'default' : 'secondary'}
                className="gap-1 cursor-pointer"
                onClick={() => {
                  if (map.current) {
                    map.current.flyTo({
                      center: [member.lng, member.lat],
                      zoom: 15,
                      duration: 800,
                    });
                  }
                }}
              >
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  member.userId === userId ? "bg-green-400 animate-pulse" : "bg-secondary-foreground/50"
                )} />
                {member.userId === userId ? 'You' : member.name.split(' ')[0]}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Route Pin Dialog */}
      {pendingPinCoords && (
        <RoutePinDialog
          open={pinDialogOpen}
          onOpenChange={(open) => {
            setPinDialogOpen(open);
            if (!open) setPendingPinCoords(null);
          }}
          latitude={pendingPinCoords.lat}
          longitude={pendingPinCoords.lng}
          userId={userId}
          onPinAdded={fetchRoutePins}
        />
      )}
    </div>
  );
};
