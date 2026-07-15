import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);


// Service Worker Management
// Legacy caching service workers stay banned (broken cache state, Feb 2026),
// but the push-only worker (push-sw.js, no fetch/cache handlers) must survive
// or push notification subscriptions silently die on every page load.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        const scriptUrl =
          registration.active?.scriptURL ||
          registration.waiting?.scriptURL ||
          registration.installing?.scriptURL ||
          "";
        if (scriptUrl.includes("push-sw.js")) {
          return; // keep the push worker
        }
        registration.unregister().then(() => {
          console.log("[Main] Legacy service worker unregistered");
        });
      });
    });
    
    // Clear all caches to ensure fresh content
    if ("caches" in window) {
      caches.keys().then((names) => {
        if (names.length > 0) {
          console.log("[Main] Clearing", names.length, "caches...");
          names.forEach((name) => {
            caches.delete(name);
          });
        }
      });
    }
  });
}
