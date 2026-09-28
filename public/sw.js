/* No application pages, API responses, authentication, or financial data are cached. */
const OFFLINE_CACHE = 'centerpro-public-offline-v1';
self.addEventListener('install', event => { event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.addAll(['/offline.html','/icons/icon-192.png']))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('centerpro-public-offline-') && key !== OFFLINE_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method === 'GET' && url.origin === self.location.origin && url.pathname === '/icons/icon-192.png' && !url.search) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
    return;
  }
  if (event.request.mode === 'navigate') event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
});
