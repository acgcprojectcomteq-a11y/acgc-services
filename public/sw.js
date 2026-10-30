const CACHE_NAME = 'acgc-shell-v5'
const APP_SHELL = ['./', './index.html', './pwa-192x192.png', './pwa-512x512.png', './manifest.webmanifest']

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
	)
	self.skipWaiting()
})

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(
				keys
					.filter((key) => key !== CACHE_NAME)
					.map((key) => caches.delete(key)),
			),
		),
	)
	self.clients.claim()
})

self.addEventListener('fetch', (event) => {
	const requestUrl = new URL(event.request.url)

	if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith('/api')) {
		return
	}

	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request)
				.then((response) => {
					const responseCopy = response.clone()
					caches.open(CACHE_NAME)
						.then((cache) => cache.put('./index.html', responseCopy))
						.catch(() => {})
					return response
				})
				.catch(async () => {
					const cachedShell = await caches.match('./index.html')
					return cachedShell || new Response('The app is offline and no cached page is available.', {
						status: 503,
						headers: { 'Content-Type': 'text/plain; charset=utf-8' },
					})
				}),
		)
		return
	}

	event.respondWith(
		caches.match(event.request).then((cachedResponse) => {
			if (cachedResponse) {
				return cachedResponse
			}

			return fetch(event.request)
				.then((response) => {
					if (response.ok) {
						const responseCopy = response.clone()
						caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy))
					}
					return response
				})
				.catch(() => new Response('This file is temporarily unavailable offline.', {
					status: 503,
					headers: { 'Content-Type': 'text/plain; charset=utf-8' },
				}))
		}),
	)
})
