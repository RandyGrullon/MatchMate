/* Notificaciones de MatchMate dentro del service worker (lo carga el SW de la app con importScripts). */

// Push de la Edge Function send-push (recordatorios de prácticas y torneos): llega aunque la app esté cerrada.
// El mensaje es JSON: {title, body, url, tag}.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'MatchMate', {
      body: data.body || '',
      tag: data.tag,
      // Los 3 recordatorios de un evento comparten tag: el nuevo reemplaza al anterior, pero igual suena.
      renotify: Boolean(data.tag),
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      data: { url: data.url || '/' },
    }),
  );
});

// Tocar la notificación: abre la app donde corresponde (o la trae al frente). Solo rutas de la app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  if (url.origin !== self.location.origin) url = new URL('/', self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(url.href).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
