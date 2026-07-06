// ============================================================
// Service Worker – cacht nur die App-Shell (HTML/CSS/JS/Icons),
// damit die App auch offline sofort startet. Google-Drive-Daten
// werden NIE gecacht - die App arbeitet immer live gegen Drive.
// ============================================================
const CACHE_NAME = 'vault-app-shell-v2';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/config.js',
  './js/drive.js',
  './js/markdown.js',
  './js/vault.js',
  './js/tasks.js',
  './js/board.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Alles was gegen Google (Auth/Drive) geht: nie aus dem Cache, immer live.
  if (url.includes('googleapis.com') || url.includes('accounts.google.com')) {
    return; // Browser macht normalen Netzwerk-Request.
  }

  // App-Shell: cache-first, damit die Oberfläche auch offline sofort lädt.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).catch(() => cached)
      );
    })
  );
});
