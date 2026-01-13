const CACHE_NAME = 'taskspace-v1';
const assets = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/img/perfil-default.png', // Imagen local guardada
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.2/font/bootstrap-icons.css',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(assets))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Si está en caché, lo devolvemos inmediatamente
      if (cachedResponse) return cachedResponse;

      // Si no está en caché, intentamos ir a la red
      return fetch(event.request).catch(() => {
        // ERROR CONTROLADO: Si falla la red y no hay caché...
        // Solo intentamos devolver index.html si es una navegación de página
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        // Para lo demás (imágenes, scripts externos), devolvemos nada o un error limpio
        return new Response('Red no disponible', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});