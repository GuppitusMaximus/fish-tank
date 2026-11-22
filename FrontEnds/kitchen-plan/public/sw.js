// Caches the app shell only. Plan data (/api), the subscription URL
// (/owner) and anything else are always fetched from the network and never
// written to a cache, and mutations pass straight through: nothing is queued
// or replayed while offline.
const CACHE_NAME = "kitchen-plan-shell-v3";
const APP_SHELL = ["/", "/app.js", "/app.css", "/manifest.webmanifest", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

function shellRequest(url, request) {
  if (APP_SHELL.includes(url.pathname) && !url.search) return url.pathname;
  // Recipe pages share the shell; their content comes from /api.
  if (request.mode === "navigate" && /^\/recipes\/[A-Za-z0-9-]{1,64}$/.test(url.pathname)) return "/";
  return null;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const shellPath = shellRequest(url, request);
  if (!shellPath) return;
  // Network first (the server marks the shell no-cache) so a deploy is
  // picked up at once; the cached shell only answers when the kitchen
  // server is unreachable.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && shellPath === url.pathname) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(shellPath, copy)));
        }
        return response;
      })
      .catch(() => caches.match(shellPath).then((cached) => cached ?? Response.error())),
  );
});
