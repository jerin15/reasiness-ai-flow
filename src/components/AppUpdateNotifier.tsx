import { useEffect } from 'react';
import { toast } from 'sonner';
import { Workbox } from 'workbox-window';

export const AppUpdateNotifier = () => {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const wb = new Workbox('/sw.js', { type: 'module' });

      wb.addEventListener('installed', (event) => {
        if (event.isUpdate) {
          console.log('🔄 New version detected');
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
      }).catch((error) => {
        console.error('❌ Service Worker registration error:', error);
      });
    }
  }, []);

  return null;
};
