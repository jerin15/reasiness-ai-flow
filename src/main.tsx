// Import logger first to silence console in production
import './lib/logger';

// Request notification permission on load
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission().then(permission => {
    if (import.meta.env.DEV) {
      console.log('🔔 Notification permission:', permission);
    }
  });
}

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
