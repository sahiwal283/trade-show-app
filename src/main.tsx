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
// TEMPORARILY DISABLED: Unregister all service workers to fix broken cache state
// Re-enable after Feb 16, 2026 when all users have recovered
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Unregister ALL service workers to fix broken state
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      if (registrations.length > 0) {
        console.log("[Main] Unregistering", registrations.length, "service workers...");
        registrations.forEach((registration) => {
          registration.unregister().then(() => {
            console.log("[Main] Service worker unregistered");
          });
        });
      }
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
