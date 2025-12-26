import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseAlwaysOnLocationOptions {
  userId: string | null;
  enabled?: boolean;
  updateInterval?: number; // in ms
}

/**
 * Always-on location tracking hook for operations team.
 * Starts tracking automatically and persists in background.
 * Updates location to database even when user is not viewing the map.
 */
export const useAlwaysOnLocation = ({
  userId,
  enabled = true,
  updateInterval = 10000, // Update every 10 seconds
}: UseAlwaysOnLocationOptions) => {
  const watchIdRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const isActiveRef = useRef(false);

  // Update location in database
  const updateLocationInDb = useCallback(async (lat: number, lng: number) => {
    if (!userId) return;

    try {
      const locationData = JSON.stringify({
        lat,
        lng,
        updated_at: new Date().toISOString()
      });

      await supabase
        .from('user_presence')
        .upsert({
          user_id: userId,
          status: 'online',
          last_active: new Date().toISOString(),
          custom_message: locationData,
        }, { onConflict: 'user_id' });
    } catch (error) {
      console.error('Background location update error:', error);
    }
  }, [userId]);

  // Handle position update
  const handlePosition = useCallback((position: GeolocationPosition) => {
    const now = Date.now();
    
    // Throttle updates
    if (now - lastUpdateRef.current < updateInterval) return;
    lastUpdateRef.current = now;

    updateLocationInDb(
      position.coords.latitude,
      position.coords.longitude
    );
  }, [updateInterval, updateLocationInDb]);

  // Start background tracking
  const startBackgroundTracking = useCallback(() => {
    if (!navigator.geolocation) return;
    if (isActiveRef.current) return;
    
    // Check if permission was previously granted
    navigator.permissions?.query({ name: 'geolocation' }).then((result) => {
      if (result.state === 'granted') {
        // Permission already granted, start watching
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }

        watchIdRef.current = navigator.geolocation.watchPosition(
          handlePosition,
          (error) => {
            console.log('Background location error:', error.message);
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 5000,
          }
        );

        isActiveRef.current = true;
        console.log('Always-on location tracking started');
      } else if (result.state === 'prompt') {
        // Need to request permission - do it silently
        navigator.geolocation.getCurrentPosition(
          (position) => {
            handlePosition(position);
            // Now start watching
            startBackgroundTracking();
          },
          () => {
            // Permission denied or error - just log it
            console.log('Location permission not granted for background tracking');
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
    }).catch(() => {
      // Permissions API not supported, try to get current position
      navigator.geolocation.getCurrentPosition(
        (position) => {
          handlePosition(position);
          // Start watching
          if (watchIdRef.current === null) {
            watchIdRef.current = navigator.geolocation.watchPosition(
              handlePosition,
              () => {},
              { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
            );
            isActiveRef.current = true;
          }
        },
        () => {}
      );
    });
  }, [handlePosition]);

  // Stop tracking
  const stopBackgroundTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    isActiveRef.current = false;
  }, []);

  // Auto-start on mount if enabled
  useEffect(() => {
    if (!enabled || !userId) return;

    // Start tracking immediately
    startBackgroundTracking();

    // Also set up visibility change listener to resume tracking when app comes back
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled && userId) {
        startBackgroundTracking();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopBackgroundTracking();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, userId, startBackgroundTracking, stopBackgroundTracking]);

  // Keep-alive: periodically ensure tracking is active
  useEffect(() => {
    if (!enabled || !userId) return;

    const keepAliveInterval = setInterval(() => {
      if (!isActiveRef.current) {
        startBackgroundTracking();
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(keepAliveInterval);
  }, [enabled, userId, startBackgroundTracking]);

  return {
    isTracking: isActiveRef.current,
    startTracking: startBackgroundTracking,
    stopTracking: stopBackgroundTracking,
  };
};
