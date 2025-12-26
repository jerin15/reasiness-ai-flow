import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number | null;
  error: string | null;
  permissionStatus: 'prompt' | 'granted' | 'denied' | 'unavailable';
  isTracking: boolean;
}

interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  updateInterval?: number;
  onLocationUpdate?: (location: { lat: number; lng: number }) => void;
}

export const useGeolocation = (
  userId: string | null,
  options: UseGeolocationOptions = {}
) => {
  const {
    enableHighAccuracy = true,
    timeout = 10000,
    maximumAge = 0,
    updateInterval = 5000,
    onLocationUpdate,
  } = options;

  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    heading: null,
    speed: null,
    timestamp: null,
    error: null,
    permissionStatus: 'prompt',
    isTracking: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Check permission status
  const checkPermission = useCallback(async () => {
    if (!navigator.geolocation) {
      setState(prev => ({ ...prev, permissionStatus: 'unavailable' }));
      return 'unavailable';
    }

    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      setState(prev => ({ ...prev, permissionStatus: permission.state as any }));

      permission.addEventListener('change', () => {
        setState(prev => ({ ...prev, permissionStatus: permission.state as any }));
      });

      return permission.state;
    } catch {
      // Some browsers don't support permissions API
      return 'prompt';
    }
  }, []);

  // Update location in database for team visibility
  // Location data is stored in custom_message as JSON for map tracking
  // The UserPresenceIndicator component filters out JSON strings from display
  const updateLocationInDb = useCallback(async (lat: number, lng: number) => {
    if (!userId) return;

    try {
      const locationData = JSON.stringify({
        lat,
        lng,
        updated_at: new Date().toISOString()
      });

      const { error } = await supabase
        .from('user_presence')
        .upsert({
          user_id: userId,
          status: 'online',
          last_active: new Date().toISOString(),
          custom_message: locationData,
        }, { onConflict: 'user_id' });

      if (error) console.error('Error updating location:', error);
    } catch (error) {
      console.error('Error updating location in DB:', error);
    }
  }, [userId]);

  // Handle position success
  const handleSuccess = useCallback((position: GeolocationPosition) => {
    const now = Date.now();
    
    // Throttle updates
    if (now - lastUpdateRef.current < updateInterval) return;
    lastUpdateRef.current = now;

    const newState: Partial<GeolocationState> = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
      timestamp: position.timestamp,
      error: null,
      permissionStatus: 'granted',
    };

    setState(prev => ({ ...prev, ...newState }));

    if (onLocationUpdate) {
      onLocationUpdate({ lat: position.coords.latitude, lng: position.coords.longitude });
    }

    // Update in database for team tracking
    updateLocationInDb(position.coords.latitude, position.coords.longitude);
  }, [updateInterval, onLocationUpdate, updateLocationInDb]);

  // Handle position error
  const handleError = useCallback((error: GeolocationPositionError) => {
    let errorMessage = 'Unknown error';
    let permissionStatus: GeolocationState['permissionStatus'] = 'prompt';

    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage = 'Location permission denied. Please enable location access in your browser settings.';
        permissionStatus = 'denied';
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage = 'Location unavailable. Please try again.';
        break;
      case error.TIMEOUT:
        errorMessage = 'Location request timed out.';
        break;
    }

    setState(prev => ({
      ...prev,
      error: errorMessage,
      permissionStatus,
    }));
  }, []);

  // Request permission and start tracking
  const requestPermission = useCallback(async () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return false;
    }

    return new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          handleSuccess(position);
          toast.success('Location access granted');
          resolve(true);
        },
        (error) => {
          handleError(error);
          if (error.code === error.PERMISSION_DENIED) {
            toast.error('Please enable location access in your browser settings');
          }
          resolve(false);
        },
        { enableHighAccuracy, timeout, maximumAge }
      );
    });
  }, [enableHighAccuracy, timeout, maximumAge, handleSuccess, handleError]);

  // Start continuous tracking
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setState(prev => ({ ...prev, isTracking: true }));

    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      { enableHighAccuracy, timeout, maximumAge }
    );

    toast.success('Live location tracking started');
  }, [enableHighAccuracy, timeout, maximumAge, handleSuccess, handleError]);

  // Stop tracking
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setState(prev => ({ ...prev, isTracking: false }));
    toast.info('Location tracking stopped');
  }, []);

  // Get current position once
  const getCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      handleError,
      { enableHighAccuracy, timeout, maximumAge }
    );
  }, [enableHighAccuracy, timeout, maximumAge, handleSuccess, handleError]);

  // Check permission on mount
  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    ...state,
    requestPermission,
    startTracking,
    stopTracking,
    getCurrentPosition,
    checkPermission,
  };
};
