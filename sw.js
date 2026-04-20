// sw.js — Service Worker Coop'Art Booking
// Cache les ressources statiques pour un fonctionnement hors ligne

const CACHE_NAME    = 'coopart-booking-v1';
const CACHE_STATIC  = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/firebase.js',
    './js/utils.js',
    './js/contacts.js',
    './js/planning.js',
    './js/modules/adminMethods.js',
    './js/modules/annuaireMethods.js',
    './js/modules/appComputed.js',
    './js/modules/collaboratorMethods.js',
    './js/modules/crmMethods.js',
    './js/modules/gouvMethods.js',
    './js/modules/importMethods.js',
    './js/modules/mapMethods.js',
    './js/modules/projectMethods.js',
    './js/modules/searchMethods.js',
    './js/modules/venueMethods.js',
    './icons/icon-192x192.png',
    './icons/icon-512x512.png',
    './icons/apple-touch-icon.png',
    './manifest.json',
];

// ── Installation : mise en cache des ressources statiques ──
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CACHE_STATIC))
            .then(() => self.skipWaiting())
    );
});

// ── Activation : nettoyage des anciens caches ──
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Stratégie : Network First pour Firebase, Cache First pour statiques ──
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Firebase et CDN externes → toujours réseau (pas de cache)
    if (
        url.hostname.includes('firebase') ||
        url.hostname.includes('googleapis') ||
        url.hostname.includes('gstatic') ||
        url.hostname.includes('unpkg') ||
        url.hostname.includes('cdnjs') ||
        url.hostname.includes('jsdelivr') ||
        url.hostname.includes('sheetjs') ||
        url.hostname.includes('openstreetmap')
    ) {
        return; // Laisser le navigateur gérer
    }

    // Ressources locales → Cache First (avec fallback réseau)
    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                if (cached) return cached;
                return fetch(event.request)
                    .then(response => {
                        // Mettre en cache les nouvelles ressources statiques
                        if (response && response.status === 200 && response.type === 'basic') {
                            const clone = response.clone();
                            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                        }
                        return response;
                    })
                    .catch(() => {
                        // Hors ligne et pas en cache → page offline basique
                        if (event.request.destination === 'document') {
                            return caches.match('./index.html');
                        }
                    });
            })
    );
});
