import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type PostgresChangesEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface SubscriptionConfig {
  table: string;
  event?: PostgresChangesEvent;
  schema?: string;
  filter?: string;
}

/**
 * Hook that pauses real-time subscriptions when the tab is not visible
 * This significantly reduces CPU/memory usage when the app is in the background
 */
export const useVisibilityAwareSubscription = <T extends { [key: string]: any }>(
  channelName: string,
  subscriptionConfig: SubscriptionConfig,
  onPayload: (payload: RealtimePostgresChangesPayload<T>) => void,
  deps: any[] = []
) => {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const onPayloadRef = useRef(onPayload);
  
  // Keep callback ref updated
  onPayloadRef.current = onPayload;

  const subscribe = useCallback(() => {
    if (channelRef.current) return;

    const channel = supabase.channel(channelName);
    
    // Use type assertion to handle the generic postgres_changes subscription
    (channel as any).on(
      'postgres_changes',
      {
        event: subscriptionConfig.event || '*',
        schema: subscriptionConfig.schema || 'public',
        table: subscriptionConfig.table,
        filter: subscriptionConfig.filter,
      },
      (payload: RealtimePostgresChangesPayload<T>) => {
        onPayloadRef.current(payload);
      }
    );
    
    channel.subscribe();
    channelRef.current = channel;
    setIsSubscribed(true);
  }, [channelName, subscriptionConfig.table, subscriptionConfig.event, subscriptionConfig.filter, subscriptionConfig.schema]);

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setIsSubscribed(false);
    }
  }, []);

  useEffect(() => {
    // Subscribe when visible
    if (!document.hidden) {
      subscribe();
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab became hidden - unsubscribe to save resources
        unsubscribe();
      } else {
        // Tab became visible - resubscribe
        subscribe();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribe();
    };
  }, [subscribe, unsubscribe, ...deps]);

  return { isSubscribed, unsubscribe, resubscribe: subscribe };
};

/**
 * Debounced callback that limits how often a function can be called
 */
export const useDebouncedCallback = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T => {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  
  // Update callback ref on each render
  callbackRef.current = callback;

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]) as T;
};

/**
 * Throttled callback that ensures a function is called at most once per interval
 */
export const useThrottledCallback = <T extends (...args: any[]) => any>(
  callback: T,
  interval: number
): T => {
  const lastCallRef = useRef<number>(0);
  const callbackRef = useRef(callback);
  
  callbackRef.current = callback;

  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCallRef.current >= interval) {
      lastCallRef.current = now;
      callbackRef.current(...args);
    }
  }, [interval]) as T;
};
