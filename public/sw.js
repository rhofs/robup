// Push-only service worker — no offline/caching strategy, this app doesn't need one yet. A
// service worker's own script is required infrastructure for the Push API regardless (the
// browser delivers a push event to this file even when no tab is open), not a choice.
//
// When a Siqt tab is open and in front, the push is handed to that tab instead, which shows it as
// the in-app banner (components/InAppBanner.tsx) — an operating-system notification for the window
// you are already looking at is noise, and the banner can be skipped when you are in the very
// conversation it is about. Browsers allow a push without a system notification only while a page
// of the site is focused, which is exactly this case; otherwise the notification is shown as before.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Siqt', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Siqt';
  const url = data.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const focused = windowClients.find(
        (c) => c.url.startsWith(self.location.origin) && c.focused && c.visibilityState === 'visible'
      );
      if (focused) {
        focused.postMessage({ type: 'siqt-push', title, body: data.body || '', url });
        return;
      }
      return self.registration.showNotification(title, { body: data.body || '', data: { url } });
    })
  );
});

// Focuses an already-open tab on this origin instead of always opening a new one, and tells it
// where to go — it used to only focus, so a click landed on whatever screen that tab last showed.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'siqt-open', url });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
