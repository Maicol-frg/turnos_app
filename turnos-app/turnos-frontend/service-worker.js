const CACHE = 'turnos-v1';
const ARCHIVOS = ['./index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)));
});

self.addEventListener('fetch', (e) => {
  // Solo cachea la interfaz; las llamadas a /api/ siempre van a la red (son datos en vivo)
  if (e.request.url.includes('/api/')) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
