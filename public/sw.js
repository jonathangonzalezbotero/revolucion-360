/* Revolución 360 · service worker.
 * - Precache mínimo: la página sin conexión y su cascarón (íconos, logo, manifiesto).
 * - Red primero para todo. Solo se guardan en caché archivos estáticos que no tienen datos del usuario
 *   (/_next/static, /brand, /icons, /cursos, /insignias, /ilustraciones). NUNCA /api/* ni páginas (HTML), que llevan datos del usuario.
 * - Sin red, una navegación muestra /sin-conexion.
 * - Push: muestra la notificación; al tocarla abre su enlace (solo enlaces internos).
 */
const VERSION = "r360-v2";
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const OFFLINE = "/sin-conexion";
const PRECACHE = [OFFLINE, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/brand/sello.png", "/brand/logo-360.webp"];
const STATIC_PREFIXES = ["/_next/static/", "/brand/", "/icons/", "/cursos/", "/insignias/", "/ilustraciones/"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload", credentials: "omit" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // nunca en caché: siempre la red

  if (req.mode === "navigate") {
    // Páginas: siempre la red, nunca se guardan. Sin red → página sin conexión.
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE, { ignoreSearch: true }).then((r) => r || Response.error())));
    return;
  }

  if (STATIC_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    // Estáticos: red primero; si responde bien, se guarda copia para cuando no haya red.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(STATIC).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || Response.error())),
    );
  }
  // Todo lo demás: el navegador va a la red como siempre.
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = typeof data.title === "string" && data.title ? data.title : "Revolución 360";
  const href = typeof data.href === "string" && data.href.startsWith("/") && !data.href.startsWith("//") ? data.href : "/notificaciones";
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: typeof data.tag === "string" ? data.tag : undefined,
    data: { href },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.href;
  const href = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/notificaciones";
  const target = new URL(href, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          return c.navigate(target).then((w) => (w || c).focus()).catch(() => self.clients.openWindow(target));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
