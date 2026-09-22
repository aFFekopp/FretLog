importScripts('/version.js');
const CACHE_NAME = 'fretlog-v' + APP_VERSION;
const ASSETS_TO_CACHE = [
    '/',
    '/sessions',
    '/library',
    '/statistics',
    '/settings',
    '/static/css/styles.css',
    '/static/js/app.js',
    '/static/js/data.js',
    '/static/js/utils.js',
    '/static/js/timer.js',
    '/static/js/theme.js',
    '/static/js/base-init.js',
    '/static/js/service-worker-register.js',
    '/static/js/library-page.js',
    '/static/js/sessions-page.js',
    '/static/js/statistics-page.js',
    '/static/js/settings-page.js',
    '/static/img/fretlog_icon.png',
];

// Install Event - Cache assets
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Opened cache:', CACHE_NAME);
            return Promise.all(ASSETS_TO_CACHE.map(asset =>
                cache.add(asset).catch(error => console.warn('Could not cache asset:', asset, error))
            ));
        })
    );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ])
    );
});

// Fetch Event - Serve from cache or network
self.addEventListener('fetch', (event) => {
    // Skip API calls and non-GET requests
    if (event.request.url.includes('/api/') || event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        event.request.mode === 'navigate'
            ? fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.ok) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
                    }
                    return networkResponse;
                })
                .catch(() => caches.match(event.request))
            : caches.match(event.request, { ignoreSearch: true }).then((response) => {
                if (response) return response;

                return fetch(event.request).then((networkResponse) => {
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                        return networkResponse;
                    }

                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
                    return networkResponse;
                });
            })
    );
});
