// Service Worker registration - manual update only
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js')
    .then((registration) => {
      console.log('✅ Service Worker registered');
      
      // Keep service worker alive for background notifications
      setInterval(() => {
        if (navigator.serviceWorker.controller) {
          const messageChannel = new MessageChannel();
          messageChannel.port1.onmessage = (event) => {
            if (event.data.type === 'KEEP_ALIVE_RESPONSE') {
              console.log('💓 Service Worker is alive');
            }
          };
          navigator.serviceWorker.controller.postMessage(
            { type: 'KEEP_ALIVE' },
            [messageChannel.port2]
          );
        }
      }, 25000); // Every 25 seconds to keep alive
    })
    .catch(error => {
      console.error('❌ Service Worker registration failed:', error);
    });
  
  // Request notification permission on load
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      console.log('🔔 Notification permission:', permission);
    });
  }
}

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
