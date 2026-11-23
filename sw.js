/* Vokabeltraining mit Caren – Offline-Update 4.21
   Auslieferung: im gleichen GitHub-Pages-Verzeichnis wie die bestehende index.html.
   Daten in localStorage werden weder gelesen noch gelöscht.
   Nur der Startpfad dieses Trainers wird abgefangen; andere Apps/Seiten bleiben unberührt.
*/
'use strict';
const CAREN_VERSION = '4.21';
const CACHE_PREFIX = 'caren-vokabeltrainer-offline-';
const CACHE_NAME = CACHE_PREFIX + CAREN_VERSION;
const BASE = self.registration.scope;
const INDEX = new URL('index.html', BASE).href;
const OPTIONAL_ASSETS = [
  new URL('manifest.webmanifest', BASE).href,
  new URL('apple-touch-icon.png', BASE).href,
  new URL('icon-192.png', BASE).href,
  new URL('icon-512.png', BASE).href
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Hauptprogramm muss offline vollständig vorhanden sein, sonst Installation abbrechen.
    const response = await fetch(new Request(INDEX, {cache: 'reload'}));
    if (!response.ok) throw new Error('index.html konnte nicht geladen werden');
    const body = await response.clone().text();
    if (!body.includes('name="caren-build" content="4.21"')) {
      throw new Error('Die veröffentlichte index.html ist noch nicht Version 4.21');
    }
    await cache.put(INDEX, response);
    // Die bestehenden PWA-Ressourcen bei vorhandenen Dateien ebenfalls offline speichern.
    await Promise.all(OPTIONAL_ASSETS.map(async url => {
      try {
        const res = await fetch(new Request(url, {cache: 'reload'}));
        if (res.ok) await cache.put(url, res);
      } catch (_) { /* Fehlende optionale Dateien blockieren den Trainer nicht. */ }
    }));
    // Bei Updates zunächst warten: Die App bietet ihre eigene Aktualisieren-Schaltfläche.
    // Bei Erstinstallation aktiviert der Browser den neuen Worker automatisch.
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'CAREN_GET_VERSION') {
    event.source?.postMessage({type: 'CAREN_VERSION_INFO', version: CAREN_VERSION});
  }
  if (event.data?.type === 'CAREN_APPLY_UPDATE') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
                          .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const basePath = new URL(BASE).pathname;
  const isEntry = url.pathname === basePath || url.pathname === new URL(INDEX).pathname;
  const isOptional = OPTIONAL_ASSETS.some(asset => new URL(asset).pathname === url.pathname);
  if (!isEntry && !isOptional) return; // Keine fremden Seiten oder Apps abfangen.

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const key = isEntry ? INDEX : url.href;
    const cached = await cache.match(key);
    if (cached) return cached;
    try {
      const fresh = await fetch(request);
      if (fresh.ok) await cache.put(key, fresh.clone());
      return fresh;
    } catch (_) {
      return new Response('Offline nicht verfügbar – bitte bei bestehender Internetverbindung einmal neu öffnen.',
        {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
    }
  })());
});
