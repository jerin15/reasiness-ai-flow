import { useEffect } from 'react';
import { toast } from 'sonner';
import { Workbox } from 'workbox-window';

export const AppUpdateNotifier = () => {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const wb = new Workbox('/sw.js', { type: 'module' });

      wb.addEventListener('installed', (event) => {
        if (event.isUpdate) {
          console.log('🔄 New version detected! Auto-updating...');
          toast.info('New version available! Updating...', {
            duration: 2000,
          });
          
          // Auto-reload after 2 seconds
          setTimeout(() => {
            wb.messageSkipWaiting();
            window.location.reload();
          }, 2000);
        } else {
          console.log('✅ Service Worker installed for the first time');
        }
      });

      wb.addEventListener('activated', (event) => {
        if (!event.isUpdate) {
          console.log('📱 App ready to work offline');
        }
      });

      wb.addEventListener('waiting', () => {
        console.log('⏳ New service worker waiting to activate');
        wb.messageSkipWaiting();
      });

      wb.register().then((registration) => {
        console.log('✅ Service Worker registered successfully');
        
        // Check for updates every 60 seconds
        setInterval(() => {
          console.log('🔍 Checking for updates...');
          registration?.update();
        }, 60000);
      }).catch((error) => {
        console.error('❌ Service Worker registration error:', error);
      });
    }
  }, []);

  return null;
};
