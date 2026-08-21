// Push-only service worker — no offline/caching strategy, this app doesn't need one yet. A
// service worker's own script is required infrastructure for the Push API regardless (the
// browser delivers a push event to this file even when no tab is open), not a choice.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Siqt', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Siqt';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      data: { url: data.url || '/' },
    })
  );
});

// Focuses an already-open tab on this origin instead of always opening a new one — same
// "don't proliferate tabs" courtesy most notification-driven apps give.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
