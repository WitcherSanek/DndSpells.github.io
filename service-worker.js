/* Manifest version: BaeciECB */
// Caution! Be sure you understand the caveats before publishing an application with
// offline support. See https://aka.ms/blazor-offline-considerations

self.importScripts('./service-worker-assets.js');
self.addEventListener('install', event => event.waitUntil(onInstall(event)));
self.addEventListener('activate', event => event.waitUntil(onActivate(event)));
self.addEventListener('fetch', event => event.respondWith(onFetch(event)));
// Sent by the in-app restart button: take over now instead of waiting for
// every tab to close. Pages reload themselves on the controllerchange that follows.
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'skipWaiting') self.skipWaiting();
});

const cacheNamePrefix = 'offline-cache-';
const cacheName = `${cacheNamePrefix}${self.assetsManifest.version}`;
const offlineAssetsInclude = [ /\.dll$/, /\.pdb$/, /\.wasm/, /\.html/, /\.js$/, /\.json$/, /\.webmanifest$/, /\.css$/, /\.woff$/, /\.woff2$/, /\.ttf$/, /\.otf$/, /\.png$/, /\.webp$/, /\.jpe?g$/, /\.gif$/, /\.ico$/, /\.blat$/, /\.dat$/ ];
const offlineAssetsExclude = [ /^service-worker\.js$/, /^FeatureData\/features\//, /^SpellData\/spells\//, /^FeatData\/feats\//, /^BestiaryData\/bestiary\//, /^BestiaryData\/index\.json$/, /^_framework\/icudt_(CJK|EFIGS)\./ ];
// The per-item HTML folders are excluded because the *-bundle.json files carry the same
// content in one request; the loose files are build inputs, not runtime assets. This matters
// most for BestiaryData/bestiary/ — 2874 files, ~16 MB — which would otherwise dominate the
// precache. BestiaryData/index.json is excluded for a different reason: Bestiary.razor reads
// index-full.json, whose rows are a superset of it, so nothing ever requests it.
// The ICU exclusion is only safe because index.html pins Blazor.start({ applicationCulture }),
// so every visitor deterministically loads icudt_no_CJK. Without that pin the shard is chosen
// from navigator.languages[0] and an English-locale browser would request icudt_EFIGS — which
// this list would then have kept out of the cache, breaking the app offline for those users.
// If the applicationCulture pin is ever removed, remove this exclusion with it.

// Replace with your base path if you are hosting on a subfolder. Ensure there is a trailing '/'.
const base = "/DndSpells.github.io/";
const baseUrl = new URL(base, self.origin);
const manifestUrlList = self.assetsManifest.assets.map(asset => new URL(asset.url, baseUrl).href);

async function onInstall(event) {
    console.info('Service worker: Install');

    // Fetch and cache all matching items from the assets manifest
    const assetsRequests = self.assetsManifest.assets
        .filter(asset => offlineAssetsInclude.some(pattern => pattern.test(asset.url)))
        .filter(asset => !offlineAssetsExclude.some(pattern => pattern.test(asset.url)))
        .map(asset => new Request(asset.url, { integrity: asset.hash, cache: 'no-cache' }));
    await caches.open(cacheName).then(cache => cache.addAll(assetsRequests));

    // Every asset is cached — tell the open pages (none are controlled by this
    // worker yet, hence includeUncontrolled). pwa-interop.js turns this into
    // "available offline" on first install or "update ready" on later ones.
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: 'pwa-cached' }));
}

async function onActivate(event) {
    console.info('Service worker: Activate');

    // Delete unused caches
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys
        .filter(key => key.startsWith(cacheNamePrefix) && key !== cacheName)
        .map(key => caches.delete(key)));
}

async function onFetch(event) {
    let cachedResponse = null;
    if (event.request.method === 'GET') {
        // For all navigation requests, try to serve index.html from cache,
        // unless that request is for an offline resource.
        // If you need some URLs to be server-rendered, edit the following check to exclude those URLs
        const shouldServeIndexHtml = event.request.mode === 'navigate'
            && !manifestUrlList.some(url => url === event.request.url);

        const request = shouldServeIndexHtml ? 'index.html' : event.request;
        const cache = await caches.open(cacheName);
        cachedResponse = await cache.match(request);
    }

    if (cachedResponse) return cachedResponse;
    try {
        return await fetch(event.request);
    } catch {
        return new Response('', { status: 504, statusText: 'Offline and not cached' });
    }
}
