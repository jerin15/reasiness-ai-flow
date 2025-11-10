import { useEffect, useRef } from 'react';

const APP_VERSION = '1.0.0'; // Increment this on each deployment

export const useVersionCheck = () => {
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    const checkVersion = async () => {
      try {
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
        }
      } catch (error) {
        console.error('❌ Version check error:', error);
      }
    };

    // Check immediately on mount (but only once)
    if (!hasCheckedRef.current) {
      hasCheckedRef.current = true;
      checkVersion();
    }

    // Then check every 2 minutes
    const interval = setInterval(checkVersion, 120000);
    
    return () => clearInterval(interval);
  }, []);
};
