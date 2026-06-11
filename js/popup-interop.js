window.popupInterop = {
    getWrapperWidth: () => {
        const wrapper = document.querySelector('.canvas-wrapper');
        return wrapper ? wrapper.getBoundingClientRect().width : 0;
    },

    getPopupSize: (key) => {
        const body = document.querySelector(`.popup-body[data-popup-key="${CSS.escape(key)}"]`);
        const popup = body ? body.closest('.popup') : null;
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
    _wrapper: null,
    _label: null,
    // Captured once per pinch by _beginGesture so _applyZoom never has to read
    // rect/scroll mid-gesture (each such read forces a layout flush per frame).
    _gestureRect: null,
    _scrollX: 0,
    _scrollY: 0,
    _wheelTimer: 0,
    // Active popup body that was at scrollTop 0 and got nudged to 1px for the gesture
    // (see _beginGesture); restored by _endGesture after the overflow flip settles.
    _nudgedBody: null,

    initZoom: function (ref, min, max, initial) {
        const self = window.popupInterop;
        self._zoomRef = ref;
        self._zoomMin = min;
        self._zoomMax = max;
        // Navigation recreates the canvas DOM, so re-resolve cached nodes before applying.
        const wrapper = document.querySelector('.canvas-wrapper');
        self._wrapper = wrapper;
        self._label = document.querySelector('.canvas-zoom-reset');
        self._applyZoom(initial, false);

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
        const self = window.popupInterop;
        const wrapper = self._wrapper;
        if (wrapper) {
            const r = wrapper.getBoundingClientRect();
            self._applyZoom(value, true, r.left + r.width / 2, r.top + r.height / 2, false);
        } else {
            self._applyZoom(value, true, undefined, undefined, false);
        }
    },

    // focalClientX/Y (optional): keep the content point under that screen point fixed.
    _applyZoom: function (value, committed, focalClientX, focalClientY, notify) {
        const self = window.popupInterop;
        let z1 = Math.min(self._zoomMax, Math.max(self._zoomMin, value));
        z1 = Math.round(z1 * 1000) / 1000;
        const z0 = self._zoom;

        self._zoom = z1;
        const wrapper = self._wrapper;
        // Only .popup-canvas consumes --zoom, so set it on the wrapper to keep style
        // invalidation scoped to the canvas subtree instead of the whole document.
        (wrapper || document.documentElement).style.setProperty('--zoom', z1);

        if (wrapper && z0 > 0 && z1 !== z0 && focalClientX !== undefined) {
            // Mid-gesture, use the rect/scroll captured by _beginGesture: the wrapper
            // itself is never scaled, so its rect can't change during the pinch, and
            // reading rect/scroll here would force a layout flush on every frame
            // (layout is already dirty from the --zoom write above).
            let rect, sx, sy;
            if (self._gestureRect) {
                rect = self._gestureRect;
                sx = self._scrollX;
                sy = self._scrollY;
            } else {
                rect = wrapper.getBoundingClientRect();
                sx = wrapper.scrollLeft;
                sy = wrapper.scrollTop;
            }
            const fx = focalClientX - rect.left;
            const fy = focalClientY - rect.top;
            const ratio = z1 / z0;
            // The scroll write flushes layout once (the browser clamps against the new
            // scale); reading the clamped values straight back is then free.
            wrapper.scrollLeft = (sx + fx) * ratio - fx;
            wrapper.scrollTop = (sy + fy) * ratio - fy;
            if (self._gestureRect) {
                self._scrollX = wrapper.scrollLeft;
                self._scrollY = wrapper.scrollTop;
            }
        }

        // Live pinch/gesture frames update the % label directly here (a textContent
        // write doesn't force layout). .NET is notified only on commit, so Blazor does
        // not re-diff the whole popup list on every frame — the visual zoom is already
        // done by the --zoom CSS var above.
        self._updateZoomLabel(z1);
        // notify === false: caller is button zoom, which already ran in .NET and will
        // persist itself — skip the JS→.NET callback so it doesn't re-render the popup
        // list a second time. Pinch/wheel leave notify undefined and still commit here.
        if (committed && notify !== false && self._zoomRef) {
            self._zoomRef.invokeMethodAsync('OnZoomChanged', z1, committed);
        }
    },

    _updateZoomLabel: function (z) {
        const label = window.popupInterop._label;
        if (label) label.textContent = Math.round(z * 100) + '%';
    },

    // Toggle a class on the wrapper for the duration of a pinch gesture. The CSS sets
    // .popup-body to overflow-y: hidden while it's on, so popup scrollbars are gone and
    // the scroll containers aren't re-painted/re-composited on every zoom frame (a source
    // of Android zoom flicker). overflow:hidden keeps scrollTop, so scroll position is
    // preserved; it flips back to auto on release.
    _setZooming: function (on) {
        const wrapper = window.popupInterop._wrapper;
        if (wrapper) wrapper.classList.toggle('zooming', on);
    },

    _beginGesture: function () {
        const self = window.popupInterop;
        const wrapper = self._wrapper;
        if (wrapper) {
            // One read per gesture; _applyZoom works off these for every frame.
            self._gestureRect = wrapper.getBoundingClientRect();
            self._scrollX = wrapper.scrollLeft;
            self._scrollY = wrapper.scrollTop;

            // A scrollable popup body sitting at scrollTop 0 blanks for a frame when
            // .zooming comes off: the overflow hidden→auto flip makes Chrome rebuild its
            // scroller layer from scratch, and the frame presents before the tiles are
            // rastered. A body that is scrolled keeps its compositor scroll state alive
            // through overflow:hidden (observed on Android Chrome), so the flip is cheap.
            // Nudge an unscrolled active body 1px for the duration of the gesture to put
            // it on that path; _endGesture restores it once the flip has settled.
            const body = wrapper.querySelector('.popup-active .popup-body');
            self._nudgedBody = null;
            if (body && body.scrollTop === 0) {
                body.scrollTop = 1; // no-op (clamped) if the body has nothing to scroll
                if (body.scrollTop === 1) self._nudgedBody = body;
            }
        }
        self._setZooming(true);
    },

    _endGesture: function () {
        const self = window.popupInterop;
        self._gestureRect = null;
        self._setZooming(false);
        const nudged = self._nudgedBody;
        self._nudgedBody = null;
        if (nudged) {
            // Two rAFs: the overflow flip must commit (with the body still "scrolled")
            // before the offset goes back to 0, or this recreates the unscrolled case.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (!self._gestureRect && nudged.isConnected && nudged.scrollTop === 1) {
                    nudged.scrollTop = 0;
                }
            }));
        }
    },

    _onWheel: function (e) {
        if (!e.altKey) return; // plain wheel = scroll; Alt+wheel = zoom
        e.preventDefault();
        const self = window.popupInterop;
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        // Apply uncommitted, then commit once the wheel goes quiet — a fast spin would
        // otherwise re-render the popup list and write localStorage on every tick.
        self._applyZoom(self._zoom * factor, false, e.clientX, e.clientY);
        clearTimeout(self._wheelTimer);
        self._wheelTimer = setTimeout(() => self._applyZoom(self._zoom, true), 200);
    },

    _dist: function (a, b) {
        return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    },

    _onTouchStart: function (e) {
        if (e.touches.length !== 2) return;
        const self = window.popupInterop;
        self._pinchStartDist = self._dist(e.touches[0], e.touches[1]);
        self._pinchStartZoom = self._zoom;
        self._beginGesture();
        e.preventDefault();
    },

    _onTouchMove: function (e) {
        if (e.touches.length !== 2) return;
        e.preventDefault(); // suppress native two-finger pan/zoom (Android)
        const self = window.popupInterop;
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
        const self = window.popupInterop;
        if (e.touches.length < 2 && self._pinchStartDist > 0) {
            self._pinchStartDist = 0;
            self._endGesture();
            self._applyZoom(self._zoom, true); // commit final value for persistence
        }
    },

    _onGestureStart: function (e) {
        e.preventDefault();
        const self = window.popupInterop;
        self._iosGesture = true;
        self._gestureStartZoom = self._zoom;
        self._beginGesture();
    },

    _onGestureChange: function (e) {
        e.preventDefault();
        const self = window.popupInterop;
        self._applyZoom(self._gestureStartZoom * e.scale, false, e.clientX, e.clientY);
    },

    _onGestureEnd: function (e) {
        e.preventDefault();
        const self = window.popupInterop;
        self._iosGesture = false;
        // The trailing touchend must not see a live pinch, or it would commit a second
        // time (double OnZoomChanged + double save).
        self._pinchStartDist = 0;
        self._endGesture();
        self._applyZoom(self._zoom, true);
    },

    ensureVisible: function (key) {
        const body = document.querySelector(`.popup-body[data-popup-key="${CSS.escape(key)}"]`);
        if (!body) return;
        const shell = body.closest('.popup-shell');
        if (!shell) return;
        const wrapper = shell.closest('.canvas-wrapper');
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
        const self = window.popupInterop;
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
        const self = window.popupInterop;
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
