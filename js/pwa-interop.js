// Service worker registration + PWA lifecycle signals for the app.
// The published worker posts { type: 'pwa-cached' } once its install step has
// precached every asset. The dev worker never does, so dev builds show no
// PWA notifications — there is nothing cached to announce.
window.pwaInterop = {
    _ref: null,      // DotNetObjectReference of PwaUpdateService
    _status: null,   // 'offline-ready' | 'update-ready'
    _reg: null,
    _reloading: false,

    init: function () {
        const self = window.pwaInterop;
        // Service workers need a secure context — on plain-http LAN testing
        // navigator.serviceWorker is undefined; the app just runs uncached.
        if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker.addEventListener('message', e => {
            if (!e.data || e.data.type !== 'pwa-cached') return;
            // An existing active worker at message time means this install was an
            // update; otherwise the very first download just completed. (During a
            // first install the worker hasn't activated yet, so reg.active is null.)
            const isUpdate = self._reg ? !!self._reg.active : !!navigator.serviceWorker.controller;
            self._setStatus(isUpdate ? 'update-ready' : 'offline-ready');
        });

        // A new worker took over (restart pressed here or in another tab):
        // reload so the page runs the new version from the new cache.
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (self._reloading) return;
            self._reloading = true;
            location.reload();
        });

        // updateViaCache 'none': update checks must bypass the HTTP cache for
        // importScripts too. service-worker.js itself never changes between
        // deploys — the version lives in the imported service-worker-assets.js,
        // and the default policy ('imports') can satisfy that fetch from a stale
        // HTTP cache entry, making the check miss a deploy entirely. Runtime and
        // offline serving are untouched: this only affects update-check fetches.
        navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' }).then(reg => {
            self._reg = reg;
            // An update finished caching in an earlier session and is still waiting.
            if (reg.waiting) self._setStatus('update-ready');
        });

        // Long-lived tabs (an installed PWA is rarely reloaded) only get the
        // browser's ~daily automatic check — also look for updates whenever the
        // app returns to the foreground. Offline/unreachable checks fail as no-ops.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && self._reg) {
                self._reg.update().catch(() => { });
            }
        });
    },

    _setStatus: function (status) {
        const self = window.pwaInterop;
        self._status = status;
        if (self._ref) self._ref.invokeMethodAsync('OnPwaStatusChanged', status);
    },

    subscribe: function (ref) {
        const self = window.pwaInterop;
        self._ref = ref;
        // The status may have been set while Blazor was still booting.
        if (self._status) ref.invokeMethodAsync('OnPwaStatusChanged', self._status);
    },

    applyUpdate: async function () {
        const reg = await navigator.serviceWorker.getRegistration();
        // skipWaiting in the worker promotes it to active; the controllerchange
        // listener above then reloads every open tab into the new version.
        if (reg && reg.waiting) reg.waiting.postMessage({ type: 'skipWaiting' });
    }
};
window.pwaInterop.init();
