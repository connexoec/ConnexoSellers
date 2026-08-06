// Connexo Ventas — Service Worker
// Dos trabajos: (1) hacer la app instalable como PWA — requisito para que el
// push funcione en iOS — y (2) mostrar las notificaciones Web Push aunque la
// app esté cerrada.
const CACHE = 'connexo-sellers-v1';
const PRECACHE = ['/icon-192.png', '/icon-512.png', '/connexo-badge.png'];

self.addEventListener('install', (e) => {
  // Si un icono falta, no queremos que falle la instalación entera del SW.
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Borra los cachés de versiones anteriores; sin esto `caches.match` seguiría
  // sirviendo el asset viejo y el cambio nunca se vería.
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Solo se cachean recursos estáticos propios; el resto pasa directo a la red.
  // Nada de Supabase por caché: los datos deben ser siempre frescos.
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/rest/') || url.href.includes('supabase')) return;
  if (!PRECACHE.includes(url.pathname)) return;
  e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
});

// ── Web Push: pinta la notificación en el dispositivo ────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: 'Connexo Ventas', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Connexo Ventas';
  const options = {
    body: data.body || '',
    // icon = imagen grande: puede ir a todo color.
    icon: '/icon-192.png',
    // badge = ícono chico de la barra de estado. Android lo dibuja usando SOLO
    // el canal alfa y lo pinta de blanco, así que va la silueta transparente:
    // una imagen opaca saldría como un cuadrado blanco.
    badge: '/connexo-badge.png',
    tag: data.tag || 'connexo',
    renotify: true,
    vibrate: [80, 40, 80],
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Al tocar la notificación: enfoca la app y abre la pestaña correcta ───────
//
// ⚠️ Trampa: dentro de un service worker las URLs relativas NO se resuelven
// contra la página sino contra el propio script. Un '?tab=history' a secas se
// convertiría en '/sw.js?tab=history' y el navegador mostraría el código de
// este archivo como texto. Por eso se resuelve siempre contra el scope.
function resolveNotificationTarget(raw) {
  const base = self.registration.scope;
  let u;
  try {
    u = new URL(raw || '/', base);
  } catch (_) {
    return new URL('/', base).href;
  }
  if (u.origin !== new URL(base).origin) return new URL('/', base).href;
  if (u.pathname.endsWith('/sw.js')) u = new URL('/' + u.search + u.hash, base);
  return u.href;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = resolveNotificationTarget(
    event.notification.data && event.notification.data.url
  );
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const origin = new URL(self.registration.scope).origin;
    for (const client of all) {
      if (new URL(client.url).origin !== origin) continue;
      if (!('focus' in client)) continue;
      await client.focus();
      // Si ya está exactamente en el destino no se recarga: se perdería el
      // estado de la pantalla sin ninguna ganancia.
      if ('navigate' in client && client.url !== target) {
        try { await client.navigate(target); } catch (_) { /* ignore */ }
      }
      return;
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
