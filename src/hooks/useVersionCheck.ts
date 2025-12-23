import { useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';

const APP_VERSION = '1.0.1'; // Increment this on each deployment - must match version.json
const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds (reduced from 30 min)
const MIN_CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes minimum between checks

export const useVersionCheck = () => {
  const hasCheckedRef = useRef(false);
  const lastCheckTimeRef = useRef(Date.now());

  useEffect(() => {
    const checkVersion = async (reason: string = 'periodic') => {
      try {
        logger.log(`🔍 Checking for updates (${reason})...`);
        
        // Add timestamp to prevent caching
        const response = await fetch('/version.json?' + Date.now(), {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        if (!response.ok) {
          logger.warn('⚠️ Version check failed: response not ok');
          return;
        }

        const data = await response.json();
        
        if (data.version !== APP_VERSION) {
          logger.log(`🔄 Version mismatch! Current: ${APP_VERSION}, Available: ${data.version}`);
          
          // Show update notification without auto-reload on first check
          if (!hasCheckedRef.current) {
            logger.log('⏭️ Skipping reload on first check to prevent infinite loop');
            hasCheckedRef.current = true;
            return;
          }
          
          logger.log(`🔄 New version available! Reloading app... (triggered by: ${reason})`);
          
          // Clear all caches before reload
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
            logger.log('🗑️ All caches cleared');
          }
          
          // Force reload from server
          window.location.reload();
        } else {
          logger.log('✅ App version is up to date:', APP_VERSION);
          hasCheckedRef.current = true;
        }
        
        lastCheckTimeRef.current = Date.now();
      } catch (error) {
        console.error('❌ Version check error:', error);
        hasCheckedRef.current = true;
      }
    };

    // Check immediately on mount
    checkVersion('app-startup');

    // Check every hour (reduced from 30 minutes)
    const interval = setInterval(() => {
      checkVersion('hourly-interval');
    }, CHECK_INTERVAL);

    // Check when user returns to the app (tab becomes visible)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const timeSinceLastCheck = Date.now() - lastCheckTimeRef.current;
        // Only check if it's been more than 10 minutes since last check
        if (timeSinceLastCheck > MIN_CHECK_INTERVAL) {
          logger.log('👁️ App became visible, checking for updates...');
          checkVersion('app-resumed');
        }
      }
    };

    // Check when system/browser wakes from sleep
    const handleWakeUp = () => {
      const timeSinceLastCheck = Date.now() - lastCheckTimeRef.current;
      // If more than 15 minutes have passed, likely waking from sleep
      if (timeSinceLastCheck > 15 * 60 * 1000) {
        logger.log('💤 System wake detected, checking for updates...');
        checkVersion('system-wake');
      }
    };

    // Check when page regains focus - but throttle aggressively
    const handleFocus = () => {
      const timeSinceLastCheck = Date.now() - lastCheckTimeRef.current;
      // Only check if it's been more than 15 minutes since last check
      if (timeSinceLastCheck > 15 * 60 * 1000) {
        logger.log('🎯 Page focused, checking for updates...');
        checkVersion('page-focus');
      }
    };

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handleWakeUp);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handleWakeUp);
    };
  }, []);
};
