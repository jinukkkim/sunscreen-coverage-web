// Notification display only: no background scheduling, location access, or caching.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const client = clients.find(client => new URL(client.url).origin === self.location.origin);
    return client ? client.focus() : self.clients.openWindow('/');
  }));
});
