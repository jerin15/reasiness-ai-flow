self.addEventListener('install', event => {
  console.log('✅ Service Worker installed');
  self.skipWaiting(); // Activate immediately
});

self.addEventListener('activate', event => {
  console.log('✅ Service Worker activated');
  event.waitUntil(
    Promise.all([
      clients.claim(), // Take control immediately
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            // Clear old caches on activate
            if (cacheName.includes('supabase-cache') || cacheName.includes('workbox')) {
              console.log('🗑️ Clearing cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

// Network-first strategy for all requests
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Don't cache Supabase realtime or auth requests
        if (event.request.url.includes('supabase.co') && 
            (event.request.url.includes('realtime') || 
             event.request.url.includes('auth') ||
             event.request.url.includes('rest'))) {
          return response;
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache only if network fails
        return caches.match(event.request);
      })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  console.log('🔔 Notification clicked:', event.notification.tag);
  event.notification.close();
  
  // Focus or open the app window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // If a window is already open, focus it
        for (const client of clientList) {
          if ('focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

// Handle background notifications - KEEP SERVICE WORKER ALIVE
self.addEventListener('push', event => {
  console.log('📬 Push notification received:', event);
  
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'You have a new notification',
      icon: '/rea-logo-icon.png',
      badge: '/rea-logo-icon.png',
      vibrate: [200, 100, 200],
      tag: data.tag || 'notification',
      requireInteraction: true, // Keep notification visible
      silent: false,
      data: data.data || {}
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'REAssist Notification', options)
    );
  }
});

// Keep service worker alive for background notifications
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'KEEP_ALIVE') {
    console.log('💓 Service Worker keep-alive ping');
    event.ports[0].postMessage({ type: 'KEEP_ALIVE_RESPONSE' });
  }
});
