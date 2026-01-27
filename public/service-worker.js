// ExpenseApp Service Worker
// Version: 1.31.1 - Multi-brand Zoho expense account IDs per category
// Date: November 4, 2025
//
// New Features:
// - Trade Show Checklist management for coordinators
// - Flight, hotel, and car rental tracking per attendee
// - Booth and electricity ordering checklist
// - Booth shipping tracking (manual or carrier)
// - Checklist summary in event details modal
// - Mobile camera capture with environment hint
// - 10MB max file size (increased from 5MB)
//
// Bug Fixes:
// - Fixed version embedding system (build-time generation)
// - Fixed UX issue where OCR failures left users stuck
//
// Previous changes from v1.4.2:
// - IMPROVED: Renamed reimbursement status "Required (approved)" → "Approved (pending payment)"
// - Added formatReimbursementStatus() helper for consistent display
// - Updated table, detail modal, dropdowns, and confirmations
//
// Changes from v1.4.0:
// - FIXED: Auto-approval now works from "needs further review" status (entity assignment & reimbursement)
// - FIXED: Reimbursement buttons now show when status is NULL
// - FIXED: Mark as Paid button shows for all approved reimbursements (not just approved expenses)
//
// Changes from v1.1.14:
// - FIXED: Session timing out without showing warning modal
// - FIXED: Token refresh using wrong URL in production
// - FIXED: Immediate logout on 401 bypassing session manager
//
// Root Causes:
// 1. Token refresh used relative URL '/api/auth/refresh' instead of full URL
// 2. In production, this caused refresh to fail silently
// 3. JWT expired after 20 minutes while session timeout is 15 minutes
// 4. When JWT expired first, any API call triggered immediate 401 logout
// 5. 401 logout bypassed session manager's warning system
//
// Solutions Applied:
// - sessionManager now uses VITE_API_URL for token refresh (proper base URL)
// - Added better error logging for token refresh failures
// - Modified apiClient unauthorized callback to check session manager state
// - If within 5 minutes of session timeout, let session manager handle it
// - Only force immediate logout if token expired unexpectedly
// - This ensures warning modal always shows for inactivity timeouts
//
// Timeline Now Works Correctly:
// T+0: Login (JWT valid for 20 minutes)
// T+10min: Token refresh (JWT extended to T+30)
// T+10min inactivity: Warning shows (5 min until logout)
// T+15min inactivity: Logout with warning
// T+20min: Another token refresh (if active)
// T+30min: Token expires (if inactive), but session already logged out at T+15
//
// Changes from v1.0.49:
// - Added 'temporary' role to database CHECK constraint
// - Changed to "best effort" approach
// - Better logging for participant creation
//
// Changes from v1.0.48:
// - Event creation uses database transactions
// - Dynamic version display
//
// Changes from v1.0.32:
// - Implemented participant-based access control for expense submission
// - Admin/accountant/developer can submit to any event
// - Regular users restricted to their events
//
// Changes from v1.0.31:
// - Fixed "Unknown User" bug in Approvals page
// - Added user_name and event_name to Expense interface
//
// Changes from v1.0.30:
// - Consolidated all constants into appConstants.ts
// - Deleted duplicate types/constants.ts file
// - Added APP_VERSION, APP_NAME, DEMO_CREDENTIALS
// - Added ROLE_LABELS and ROLE_COLORS
// - Expanded STORAGE_KEYS with all localStorage keys
// - Single source of truth for all app constants
// 
// Changes from v1.0.23:
// - Removed meaningless decorations from Dashboard stat cards
// - Removed fake "+12.5%" trend (was always there, provided no value)
// - Removed useless "Normal" status under Pending Approvals
// - Removed redundant "1 total" under Active Events
// - Cards now show only the important info (number and title)
// - Button text always "Push to Zoho" (was "Go to Reports" for multiple events)
// - Makes sense since we navigate directly to event with most items anyway
//
// Changes from v1.0.22:
// - Fixed "Push to Zoho" link in Dashboard pending tasks
// - Now navigates DIRECTLY to the event's detailed report (not general Reports page)
// - Backend provides event info (which events have unsynced expenses)
// - If single event: goes directly to that event's report (instant push)
// - If multiple events: goes to event with most unsynced expenses
// - Button text changes: "Push to Zoho" (single) vs "Go to Reports" (multiple)
// - No more clicking trade show cards - straight to push button!
// - Uses URL hash deep linking: #event=123
// - Events auto-remove from expense dropdown 1 month + 1 day after end date
// - Consolidated documentation files into AI_MASTER_GUIDE.md
// - Restored CHANGELOG.md for GitHub best practices
// - Simplified sync bar logic - no longer shows "All Synced" message
// - Bar ONLY shows when there's actual activity (offline, syncing, pending, failed)
// - Removed persistent "All Synced" bar that wouldn't hide
// - Added "Reject" button for pending user registrations
// - Admins can now reject/delete pending users with confirmation modal
// - Added UUID polyfill for crypto.randomUUID() compatibility
// - Fixes "crypto.randomUUID is not a function" error in older browsers
// - Fixed auto-logout on token expiration
// - Prevents empty data display on auth errors
// - Background Sync API integration for offline queue processing
// - Sync event handler for automatic retry
// - Better offline support with sync queue
// - Network-first strategy for API calls (fixes stale data on mobile)
// - Cache-first only for static assets
// - Proper cache versioning

const CACHE_NAME = 'trade-show-app-v1.31.1';
const STATIC_CACHE = 'trade-show-app-static-v1.31.1';
const urlsToCache = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.json'
];

// Install event - cache essential static files only
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing v1.31.1...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[ServiceWorker] Caching static files');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('[ServiceWorker] Cache installation failed:', error);
      })
  );
  // Force immediate activation
  self.skipWaiting();
});

// Fetch event - SMART CACHING STRATEGY
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // STRATEGY 1: NETWORK-FIRST for API calls
  // Always fetch fresh data from server for API endpoints
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Don't cache API responses (they should always be fresh)
          return response;
        })
        .catch((error) => {
          console.log('[ServiceWorker] API fetch failed, app offline:', url.pathname);
          // Return offline message for API calls
          return new Response(
            JSON.stringify({ 
              error: 'You are offline. Please check your connection.' 
            }),
            { 
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }
  
  // STRATEGY 2: CACHE-FIRST for static assets
  // HTML, JS, CSS, images can be cached
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version but also fetch update in background
          fetch(request).then((response) => {
            if (response && response.status === 200) {
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(request, response);
              });
            }
          }).catch(() => {
            // Ignore fetch errors for background updates
          });
          return cachedResponse;
        }
        
        // Not in cache, fetch from network
        return fetch(request)
          .then((response) => {
            // Check if valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Cache static assets only
            const responseToCache = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseToCache);
            });
            
            return response;
          })
          .catch(() => {
            // Return offline fallback
            return caches.match('/index.html');
          });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating v1.31.1...');
  const cacheWhitelist = [CACHE_NAME, STATIC_CACHE];
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })    .then(() => {
      console.log('[ServiceWorker] v1.30.7 activated and ready!');
      // Claim all clients immediately
      return self.clients.claim();
    })
  );
});

// Message event - handle commands from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[ServiceWorker] Received SKIP_WAITING message');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'SYNC_NOW') {
    console.log('[ServiceWorker] Received SYNC_NOW message');
    // Trigger sync if supported
    if (self.registration.sync) {
      self.registration.sync.register('expense-sync').then(() => {
        console.log('[ServiceWorker] Sync registered');
      }).catch((error) => {
        console.error('[ServiceWorker] Sync registration failed:', error);
      });
    }
  }
});

// Background Sync event - process sync queue when online
// Note: Not supported on iOS Safari - fallback handled in app
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Sync event triggered:', event.tag);
  
  if (event.tag === 'expense-sync') {
    event.waitUntil(
      processSyncQueue()
        .then(() => {
          console.log('[ServiceWorker] Sync queue processed successfully');
        })
        .catch((error) => {
          console.error('[ServiceWorker] Sync queue processing failed:', error);
          // Re-throw to retry sync later
          throw error;
        })
    );
  }
});

// Process sync queue by notifying all clients
async function processSyncQueue() {
  console.log('[ServiceWorker] Processing sync queue...');
  
  try {
    // Notify all clients to process their sync queues
    const clients = await self.clients.matchAll({
      includeUncontrolled: true,
      type: 'window'
    });
    
    if (clients.length === 0) {
      console.log('[ServiceWorker] No clients available for sync');
      return;
    }
    
    // Send sync message to all clients
    const syncPromises = clients.map(client => {
      return new Promise((resolve, reject) => {
        const messageChannel = new MessageChannel();
        
        messageChannel.port1.onmessage = (event) => {
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data);
          }
        };
        
        client.postMessage({
          type: 'PROCESS_SYNC_QUEUE'
        }, [messageChannel.port2]);
        
        // Timeout after 30 seconds
        setTimeout(() => {
          reject(new Error('Sync timeout'));
        }, 30000);
      });
    });
    
    await Promise.all(syncPromises);
    console.log('[ServiceWorker] All clients synced successfully');
    
  } catch (error) {
    console.error('[ServiceWorker] Sync failed:', error);
    throw error;
  }
}

// Periodic Background Sync (if supported)
// This allows syncing even when the app is closed
self.addEventListener('periodicsync', (event) => {
  console.log('[ServiceWorker] Periodic sync event triggered:', event.tag);
  
  if (event.tag === 'expense-periodic-sync') {
    event.waitUntil(
      processSyncQueue()
        .then(() => {
          console.log('[ServiceWorker] Periodic sync completed');
        })
        .catch((error) => {
          console.error('[ServiceWorker] Periodic sync failed:', error);
        })
    );
  }
});
