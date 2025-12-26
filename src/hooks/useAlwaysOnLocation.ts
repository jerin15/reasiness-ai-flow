import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseAlwaysOnLocationOptions {
  userId: string | null;
  enabled?: boolean;
  updateInterval?: number; // in ms
}

/**
 * Check if current time is within tracking hours (before 8 PM)
 */
const isWithinTrackingHours = (): boolean => {
  const now = new Date();
  const hours = now.getHours();
  // Track from 6 AM to 8 PM (20:00)
  return hours >= 6 && hours < 20;
};

/**
 * Always-on location tracking hook for operations team.
 * Starts tracking automatically and persists in background.
 * Updates location to database even when user is not viewing the map.
 * Only tracks between 6 AM and 8 PM.
 */
export const useAlwaysOnLocation = ({
  userId,
  enabled = true,
  updateInterval = 10000, // Update every 10 seconds
}: UseAlwaysOnLocationOptions) => {
  const watchIdRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const isActiveRef = useRef(false);
  const [isTracking, setIsTracking] = useState(false);

  // Update location in database
  const updateLocationInDb = useCallback(async (lat: number, lng: number) => {
    if (!userId) return;

    // Don't update if outside tracking hours
    if (!isWithinTrackingHours()) {
      console.log('Outside tracking hours (6 AM - 8 PM), skipping location update');
      return;
    }

    try {
      const now = new Date().toISOString();
      const locationData = JSON.stringify({
        lat,
        lng,
        updated_at: now
      });

      await supabase
        .from('user_presence')
        .upsert({
          user_id: userId,
          status: 'online',
          last_active: now,
          custom_message: locationData,
        }, { onConflict: 'user_id' });
    } catch (error) {
      console.error('Background location update error:', error);
    }
  }, [userId]);

  // Handle position update
  const handlePosition = useCallback((position: GeolocationPosition) => {
    const now = Date.now();
    
    // Check tracking hours first
    if (!isWithinTrackingHours()) {
      return;
    }
    
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
    
    // Don't start if outside tracking hours
    if (!isWithinTrackingHours()) {
      console.log('Outside tracking hours (6 AM - 8 PM), not starting tracking');
      return;
    }
    
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
        setIsTracking(true);
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
            setIsTracking(true);
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
    setIsTracking(false);
  }, []);

  // Auto-start on mount if enabled and within tracking hours
  useEffect(() => {
    if (!enabled || !userId) return;

    // Check if within tracking hours before starting
    if (isWithinTrackingHours()) {
      startBackgroundTracking();
    }

    // Also set up visibility change listener to resume tracking when app comes back
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled && userId) {
        if (isWithinTrackingHours()) {
          startBackgroundTracking();
        } else {
          stopBackgroundTracking();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopBackgroundTracking();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, userId, startBackgroundTracking, stopBackgroundTracking]);

  // Keep-alive: periodically ensure tracking is active during allowed hours
  useEffect(() => {
    if (!enabled || !userId) return;

    const keepAliveInterval = setInterval(() => {
      if (isWithinTrackingHours()) {
        if (!isActiveRef.current) {
          startBackgroundTracking();
        }
      } else {
        // Outside tracking hours, stop tracking
        if (isActiveRef.current) {
          stopBackgroundTracking();
          console.log('Stopping tracking - outside tracking hours (8 PM reached)');
        }
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(keepAliveInterval);
  }, [enabled, userId, startBackgroundTracking, stopBackgroundTracking]);

  return {
    isTracking,
    startTracking: startBackgroundTracking,
    stopTracking: stopBackgroundTracking,
    isWithinTrackingHours: isWithinTrackingHours(),
  };
};
