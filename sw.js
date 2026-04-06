// Minimal service worker for PWA installability
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  clients.claim()
})

// Network-first: just pass-through for now
self.addEventListener('fetch', (event) => {
  // You can add caching strategies here later
})
