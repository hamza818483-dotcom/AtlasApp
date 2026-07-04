// ATLAS APP - Service Worker v1
const CACHE_NAME = 'atlas-app-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/exam.html',
  '/admin.html',
  '/dashboard.html',
  '/ai.html',
  '/class.html',
  '/mock-test.html',
  '/model-test.html',
  '/auth.html',
  '/focus.html',
  '/profile.html',
  '/study.html',
  '/study-aid.html',
  '/study-history.html',
  '/study-tracker.html',
  '/quick-practice.html',
  '/quick-practice-play.html',
  '/quick-practice-leaderboard.html',
  '/english-master.html',
  '/english-master-play.html',
  '/style.css',
  '/dashboard-styles.css',
  '/app.js',
  '/storage.js',
  '/prompts.js',
  '/global-nav.js',
  '/atlas-ui.js',
  '/dashboard-utils.js',
  '/home-features.js',
  '/offline-db.js',
  '/admin-quick-practice.js',
  '/admin-study-tracker.js',
  '/atlas-admin-zoom.js',
  '/mulboi-mcq-admin.js',
  '/manifest.json',
  '/offline.html'
];

// ========== INSTALL ==========
self.addEventListener('install', (event) => {
  console.log('🔄 ATLAS SW: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 ATLAS SW: Caching assets');
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('⚠️ ATLAS SW: Some assets failed to cache', err);
      });
    })
  );
  self.skipWaiting();
});

// ========== ACTIVATE ==========
self.addEventListener('activate', (event) => {
  console.log('✅ ATLAS SW: Activated');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('atlas-app-') && name !== CACHE_NAME)
          .map(name => {
            console.log('🗑️ ATLAS SW: Deleting old cache', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// ========== FETCH (Network First, Cache Fallback) ==========
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip Supabase + External APIs (always network)
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('groq.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('api.')
  ) {
    return; // Let browser handle normally
  }

  // Skip Chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful GET responses
        if (response && response.status === 200 && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline → try cache
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) return cachedResponse;
          // HTML request → show offline page
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/offline.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// ========== PUSH NOTIFICATION ==========
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch(e) {}

  const options = {
    body: data.message || 'ATLAS APP থেকে নতুন আপডেট',
    icon: 'https://cdn.phototourl.com/free/2026-05-15-b45df560-6dc8-4cb7-9040-238612c8a161.png',
    badge: 'https://cdn.phototourl.com/free/2026-05-15-b45df560-6dc8-4cb7-9040-238612c8a161.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/index.html' },
    tag: data.tag || 'atlas-default',
    renotify: true,
    actions: [
      { action: 'open', title: 'খুলুন' },
      { action: 'close', title: 'বন্ধ করুন' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'ATLAS APP 🔔', options)
  );
});

// ========== NOTIFICATION CLICK ==========
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const url = event.notification.data?.url || '/index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Check if URL is already open
      for (let client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});