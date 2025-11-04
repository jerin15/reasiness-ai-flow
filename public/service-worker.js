self.addEventListener('install', event => {
  console.log('✅ Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('✅ Service Worker activated');
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
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

// Handle background notifications (for future push notifications)
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
      requireInteraction: false,
      data: data.data || {}
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'REAssist Notification', options)
    );
  }
});
