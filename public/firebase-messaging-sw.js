// Firebase Messaging Service Worker
// Handles background push notifications and app-shell caching

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js')

// Firebase config is injected at runtime via postMessage from the main app,
// or you can hardcode it here since this file is not bundled by Vite.
// The SW reads config from a dedicated endpoint or uses self.__WB_MANIFEST.
// For simplicity, we use a self-contained config object:
let messaging = null

self.addEventListener('message', (event) => {
  if (event.data?.type === 'FIREBASE_CONFIG') {
    const config = event.data.config
    if (!firebase.apps.length) {
      firebase.initializeApp(config)
    }
    messaging = firebase.messaging()
    messaging.onBackgroundMessage((payload) => {
      const { title, body } = payload.notification || {}
      self.registration.showNotification(title || 'Homebase', {
        body: body || '',
        icon: '/icons/icon-192.svg',
        badge: '/icons/icon-72.svg',
        data: payload.data,
      })
    })
  }
})

// ── App shell caching ────────────────────────────────────────────────────────

const CACHE = 'homebase-v1'
const SHELL = ['/', '/index.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  // Only cache GET requests for same-origin
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res.ok) {
          caches.open(CACHE).then((cache) => cache.put(e.request, res.clone()))
        }
        return res
      })
      return cached || network
    })
  )
})

// Notification click — open or focus app
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.startsWith(self.location.origin))
      if (existing) return existing.focus()
      return clients.openWindow('/')
    })
  )
})
