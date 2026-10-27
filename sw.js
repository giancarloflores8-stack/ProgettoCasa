/* Conti Chiari - service worker per l'uso offline.
   Va messo nella stessa cartella di index.html (stesso livello nel repository). */
const VERSION = 'cc-v1';
const CORE = ['./', './index.html'];
const CDN = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(CORE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await Promise.all(CDN.map((u) => fetch(new Request(u, { mode: 'no-cors' })).then((r) => cache.put(u, r)).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Pagina: prima la rete (cosi' gli aggiornamenti arrivano subito), se manca la rete usa la copia salvata.
async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))
    ]);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(request)) || (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

// Il resto (script, font, librerie): subito dalla copia salvata, e intanto si aggiorna in silenzio.
function staleWhileRevalidate(event) {
  const request = event.request;
  const job = (async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(request);
    const usable = cached && !(request.mode === 'cors' && cached.type === 'opaque');
    const network = fetch(request).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
      return res;
    }).catch(() => null);
    if (usable) { event.waitUntil(network); return cached; }
    return (await network) || Response.error();
  })();
  return job;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (request.mode === 'navigate') { event.respondWith(networkFirst(request)); return; }
  event.respondWith(staleWhileRevalidate(event));
});
