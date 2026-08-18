const BASE = '/victoria-calendar-3';
const CACHE_NAME = 'kisunchik-v3';
const ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/css/styles.css',
  BASE + '/js/app.js',
  BASE + '/js/firebase-config.js',
  BASE + '/js/cycle-logic.js',
  BASE + '/js/advice.js',
  BASE + '/manifest.json',
  BASE + '/icons/icon-192.png',
  BASE + '/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request).catch(() => caches.match(BASE + '/index.html')))
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(BASE + '/'));
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SHOW_REMINDER') {
    self.registration.showNotification('Кисунчик 💜', {
      body: 'Время заглянуть в дневник цикла 🌸 Не забудь отметить самочувствие!',
      icon: BASE + '/icons/icon-192.png',
      badge: BASE + '/icons/icon-72.png',
      tag: 'daily-cycle'
    });
  }
});
