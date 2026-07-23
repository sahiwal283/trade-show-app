import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Self-heal after deploys: a device holding a stale index.html requests
// hashed chunks that no longer exist on the server (deploys wipe the web
// root), and every lazy view then fails to load — which users experience as
// "the app is full of bugs". Vite fires vite:preloadError for exactly this;
// one hard reload fetches the fresh shell. The sessionStorage guard stops a
// reload loop if the network itself is down.
window.addEventListener('vite:preloadError', (event) => {
  const RELOAD_GUARD = 'chunk_reload_at';
  const last = Number(sessionStorage.getItem(RELOAD_GUARD) || 0);
  if (Date.now() - last < 30_000) return; // already tried recently — let it fail visibly
  sessionStorage.setItem(RELOAD_GUARD, String(Date.now()));
  event.preventDefault(); // suppress the unhandled rejection; we're handling it
  console.warn('[Main] Stale chunk detected after deploy — reloading for fresh build');
  window.location.reload();
});

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
