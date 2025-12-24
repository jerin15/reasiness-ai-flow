import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook that automatically refetches data when:
 * 1. Internet connection is restored
 * 2. Tab becomes visible again
 * 3. Fallback polling interval (safety net for silent real-time failures)
 */
export const useConnectionAwareRefetch = (
  refetchCallback: () => void,
  options: {
    pollingInterval?: number; // Default 30 seconds
    enablePolling?: boolean;  // Default true
  } = {}
) => {
  const { pollingInterval = 30000, enablePolling = true } = options;
  const lastRefetchRef = useRef<number>(Date.now());
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callbackRef = useRef(refetchCallback);
  
  // Keep callback ref updated
  callbackRef.current = refetchCallback;

  const doRefetch = useCallback(() => {
    const now = Date.now();
    // Debounce: don't refetch if we just did within 2 seconds
    if (now - lastRefetchRef.current < 2000) {
      return;
    }
    lastRefetchRef.current = now;
    callbackRef.current();
  }, []);

  useEffect(() => {
    // Handle online event (internet restored)
    const handleOnline = () => {
      console.log('🌐 Connection restored - triggering refetch');
      // Small delay to ensure connection is stable
      setTimeout(doRefetch, 500);
    };

    // Handle visibility change (tab becomes visible)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('👁️ Tab visible - triggering refetch');
        doRefetch();
      }
    };

    // Handle custom connection-restored event (from useOnlineStatus)
    const handleConnectionRestored = () => {
      console.log('🔄 Connection restored event - triggering refetch');
      doRefetch();
    };

    // Set up event listeners
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('connection-restored', handleConnectionRestored);

    // Set up fallback polling as safety net
    if (enablePolling) {
      pollingRef.current = setInterval(() => {
        // Only poll if tab is visible
        if (!document.hidden) {
          console.log('⏰ Fallback polling - triggering refetch');
          doRefetch();
        }
      }, pollingInterval);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('connection-restored', handleConnectionRestored);
      
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [doRefetch, pollingInterval, enablePolling]);

  return { triggerRefetch: doRefetch };
};

/**
 * Dispatch a custom event when connection is restored
 * Call this from components that detect connection restoration
 */
export const dispatchConnectionRestored = () => {
  window.dispatchEvent(new CustomEvent('connection-restored'));
};
