// service-worker.js — TOMBSTONE (v1.51.0)
//
// This app no longer uses a caching service worker (push-sw.js is the only
// intentional worker). Devices that registered the legacy caching SW years
// ago still let it serve a stale app shell BEFORE any page JavaScript runs,
// which is why users kept seeing old builds and ChunkLoadErrors after
// deploys. The browser's service-worker update check byte-compares this
// file, installs it, and it removes itself at the SW layer — the only layer
// that runs early enough to fix this.
//
// Keep this file served with Cache-Control: no-store. After telemetry shows
// legacy registrations are gone, stop shipping it entirely.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});

// Deliberately no fetch handler — every request goes straight to the network.
