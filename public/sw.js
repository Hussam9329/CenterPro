/* No application pages, API responses, authentication, or financial data are cached. */
const OFFLINE_CACHE = 'centerpro-public-offline-v1';
self.addEventListener('install', event => { event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.addAll(['/offline.html','/icons/icon-192.png']))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('centerpro-public-offline-') && key !== OFFLINE_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => { if (event.request.mode === 'navigate') event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html'))); });
