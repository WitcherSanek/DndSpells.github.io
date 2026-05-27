window.spellsInterop = {
    getPopupHeights: () =>
        Array.from(document.querySelectorAll('.spell-popup')).map(p => p.offsetHeight),

    getWrapperWidth: () => {
        const wrapper = document.querySelector('.spells-page-wrapper');
        return wrapper ? wrapper.getBoundingClientRect().width : 0;
    },

    getPopupSize: (file) => {
        const body = document.querySelector(`.spell-popup-body[data-spell-file="${CSS.escape(file)}"]`);
        const popup = body ? body.closest('.spell-popup') : null;
        if (!popup) return [0, 0];
        // offsetWidth/Height are layout (unscaled) px — the canvas transform must not skew resize math.
        return [popup.offsetWidth, popup.offsetHeight];
    },

    // ----- Canvas zoom -----
    _zoom: 1,
    _zoomMin: 0.25,
    _zoomMax: 2,
    _zoomRef: null,
    _pinchStartDist: 0,
    _pinchStartZoom: 1,
    _iosGesture: false,
    _gestureStartZoom: 1,

    initZoom: function (ref, min, max, initial) {
        const self = window.spellsInterop;
        self._zoomRef = ref;
        self._zoomMin = min;
        self._zoomMax = max;
        self._applyZoom(initial, false);

        const wrapper = document.querySelector('.spells-page-wrapper');
        if (!wrapper || wrapper.dataset.zoomWired) return;
        wrapper.dataset.zoomWired = '1';

        wrapper.addEventListener('wheel', self._onWheel, { passive: false });
        wrapper.addEventListener('touchstart', self._onTouchStart, { passive: false });
        wrapper.addEventListener('touchmove', self._onTouchMove, { passive: false });
        wrapper.addEventListener('touchend', self._onTouchEnd, { passive: false });
        wrapper.addEventListener('touchcancel', self._onTouchEnd, { passive: false });
        // Safari/iOS proprietary pinch events (it ignores user-scalable=no).
        wrapper.addEventListener('gesturestart', self._onGestureStart, { passive: false });
        wrapper.addEventListener('gesturechange', self._onGestureChange, { passive: false });
        wrapper.addEventListener('gestureend', self._onGestureEnd, { passive: false });
    },

    setZoom: function (value) {
        // No pointer for button presses: zoom around the viewport centre.
        const self = window.spellsInterop;
        const wrapper = document.querySelector('.spells-page-wrapper');
        if (wrapper) {
            const r = wrapper.getBoundingClientRect();
            self._applyZoom(value, true, r.left + r.width / 2, r.top + r.height / 2);
        } else {
            self._applyZoom(value, true);
        }
    },

    // focalClientX/Y (optional): keep the content point under that screen point fixed.
    _applyZoom: function (value, committed, focalClientX, focalClientY) {
        const self = window.spellsInterop;
        let z1 = Math.min(self._zoomMax, Math.max(self._zoomMin, value));
        z1 = Math.round(z1 * 1000) / 1000;
        const z0 = self._zoom;

        self._zoom = z1;
        document.documentElement.style.setProperty('--zoom', z1);

        const wrapper = document.querySelector('.spells-page-wrapper');
        if (wrapper && z0 > 0 && z1 !== z0 && focalClientX !== undefined) {
            const rect = wrapper.getBoundingClientRect();
            const fx = focalClientX - rect.left;
            const fy = focalClientY - rect.top;
            const ratio = z1 / z0;
            // Setting scroll forces reflow with the new scale, then clamps to range.
            wrapper.scrollLeft = (wrapper.scrollLeft + fx) * ratio - fx;
            wrapper.scrollTop = (wrapper.scrollTop + fy) * ratio - fy;
        }

        if (self._zoomRef) {
            self._zoomRef.invokeMethodAsync('OnZoomChanged', z1, committed);
        }
    },

    _onWheel: function (e) {
        if (!e.altKey) return; // plain wheel = scroll; Alt+wheel = zoom
        e.preventDefault();
        const self = window.spellsInterop;
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        self._applyZoom(self._zoom * factor, true, e.clientX, e.clientY);
    },

    _dist: function (a, b) {
        return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    },

    _onTouchStart: function (e) {
        if (e.touches.length !== 2) return;
        const self = window.spellsInterop;
        self._pinchStartDist = self._dist(e.touches[0], e.touches[1]);
        self._pinchStartZoom = self._zoom;
        e.preventDefault();
    },

    _onTouchMove: function (e) {
        if (e.touches.length !== 2) return;
        e.preventDefault(); // suppress native two-finger pan/zoom (Android)
        const self = window.spellsInterop;
        if (self._iosGesture) return; // iOS drives zoom via gesture events instead
        if (self._pinchStartDist > 0) {
            const t0 = e.touches[0], t1 = e.touches[1];
            const d = self._dist(t0, t1);
            const midX = (t0.clientX + t1.clientX) / 2;
            const midY = (t0.clientY + t1.clientY) / 2;
            self._applyZoom(self._pinchStartZoom * (d / self._pinchStartDist), false, midX, midY);
        }
    },

    _onTouchEnd: function (e) {
        const self = window.spellsInterop;
        if (e.touches.length < 2 && self._pinchStartDist > 0) {
            self._pinchStartDist = 0;
            self._applyZoom(self._zoom, true); // commit final value for persistence
        }
    },

    _onGestureStart: function (e) {
        e.preventDefault();
        const self = window.spellsInterop;
        self._iosGesture = true;
        self._gestureStartZoom = self._zoom;
    },

    _onGestureChange: function (e) {
        e.preventDefault();
        const self = window.spellsInterop;
        self._applyZoom(self._gestureStartZoom * e.scale, false, e.clientX, e.clientY);
    },

    _onGestureEnd: function (e) {
        e.preventDefault();
        const self = window.spellsInterop;
        self._iosGesture = false;
        self._applyZoom(self._zoom, true);
    },

    _scrollPositions: new Map(),

    syncScroll: function () {
        const self = window.spellsInterop;
        const bodies = document.querySelectorAll('.spell-popup-body[data-spell-file]');
        bodies.forEach(body => {
            const file = body.getAttribute('data-spell-file');
            if (!body.dataset.scrollWired) {
                body.dataset.scrollWired = '1';
                body.addEventListener('scroll', () => {
                    self._scrollPositions.set(file, body.scrollTop);
                }, { passive: true });
            }
            const saved = self._scrollPositions.get(file);
            if (saved !== undefined && body.scrollTop !== saved) {
                body.scrollTop = saved;
            }
        });
    },

    forgetScroll: function (file) {
        window.spellsInterop._scrollPositions.delete(file);
    },

    ensureVisible: function (file) {
        const body = document.querySelector(`.spell-popup-body[data-spell-file="${CSS.escape(file)}"]`);
        if (!body) return;
        const shell = body.closest('.spell-popup-shell');
        if (!shell) return;
        const wrapper = shell.closest('.spells-page-wrapper');
        if (!wrapper) return;

        const wRect = wrapper.getBoundingClientRect();
        const sRect = shell.getBoundingClientRect();

        let dy = 0;
        if (sRect.bottom > wRect.bottom) dy = sRect.bottom - wRect.bottom;
        else if (sRect.top < wRect.top) dy = sRect.top - wRect.top;

        let dx = 0;
        if (sRect.right > wRect.right) dx = sRect.right - wRect.right;
        else if (sRect.left < wRect.left) dx = sRect.left - wRect.left;

        if (dx === 0 && dy === 0) return;
        wrapper.scrollBy({ top: dy, left: dx, behavior: 'smooth' });
    },

    _viewportHandler: null,

    trackViewport: function () {
        const self = window.spellsInterop;
        const vv = window.visualViewport;
        if (!vv) return;
        if (self._viewportHandler) {
            vv.removeEventListener('resize', self._viewportHandler);
            vv.removeEventListener('scroll', self._viewportHandler);
        }
        const update = () => {
            document.documentElement.style.setProperty('--vvh', vv.height + 'px');
            document.documentElement.style.setProperty('--vvtop', vv.offsetTop + 'px');
        };
        update();
        self._viewportHandler = update;
        vv.addEventListener('resize', update);
        vv.addEventListener('scroll', update);
    },

    untrackViewport: function () {
        const self = window.spellsInterop;
        const vv = window.visualViewport;
        if (vv && self._viewportHandler) {
            vv.removeEventListener('resize', self._viewportHandler);
            vv.removeEventListener('scroll', self._viewportHandler);
        }
        self._viewportHandler = null;
        document.documentElement.style.removeProperty('--vvh');
        document.documentElement.style.removeProperty('--vvtop');
    }
};
