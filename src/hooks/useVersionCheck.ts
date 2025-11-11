import { useEffect, useRef } from 'react';

const APP_VERSION = '1.0.1'; // Increment this on each deployment - must match version.json
const CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes in milliseconds

export const useVersionCheck = () => {
  const hasCheckedRef = useRef(false);
  const lastCheckTimeRef = useRef(Date.now());

  useEffect(() => {
    const checkVersion = async (reason: string = 'periodic') => {
      try {
        console.log(`🔍 Checking for updates (${reason})...`);
        
        // Add timestamp to prevent caching
        const response = await fetch('/version.json?' + Date.now(), {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        if (!response.ok) {
          console.warn('⚠️ Version check failed: response not ok');
          return;
        }

        const data = await response.json();
        
        if (data.version !== APP_VERSION) {
          console.log(`🔄 Version mismatch! Current: ${APP_VERSION}, Available: ${data.version}`);
          
          // Show update notification without auto-reload on first check
          if (!hasCheckedRef.current) {
            console.log('⏭️ Skipping reload on first check to prevent infinite loop');
            hasCheckedRef.current = true;
            return;
          }
          
          console.log(`🔄 New version available! Reloading app... (triggered by: ${reason})`);
          
          // Clear all caches before reload
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
            console.log('🗑️ All caches cleared');
          }
          
          // Force reload from server
          window.location.reload();
        } else {
          console.log('✅ App version is up to date:', APP_VERSION);
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

    // Check every 30 minutes
    const interval = setInterval(() => {
      checkVersion('30-minute-interval');
    }, CHECK_INTERVAL);

    // Check when user returns to the app (tab becomes visible)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const timeSinceLastCheck = Date.now() - lastCheckTimeRef.current;
        // Only check if it's been more than 5 minutes since last check
        if (timeSinceLastCheck > 5 * 60 * 1000) {
          console.log('👁️ App became visible, checking for updates...');
          checkVersion('app-resumed');
        }
      }
    };

    // Check when system/browser wakes from sleep
    const handleWakeUp = () => {
      const timeSinceLastCheck = Date.now() - lastCheckTimeRef.current;
      // If more than 10 minutes have passed, likely waking from sleep
      if (timeSinceLastCheck > 10 * 60 * 1000) {
        console.log('💤 System wake detected, checking for updates...');
        checkVersion('system-wake');
      }
    };

    // Check when page regains focus
    const handleFocus = () => {
      const timeSinceLastCheck = Date.now() - lastCheckTimeRef.current;
      // Only check if it's been more than 5 minutes since last check
      if (timeSinceLastCheck > 5 * 60 * 1000) {
        console.log('🎯 Page focused, checking for updates...');
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
