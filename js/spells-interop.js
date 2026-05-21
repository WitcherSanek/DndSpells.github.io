window.spellsInterop = {
    getPopupHeights: () =>
        Array.from(document.querySelectorAll('.spell-popup')).map(p => p.offsetHeight),

    getWrapperWidth: () => {
        const wrapper = document.querySelector('.spells-page-wrapper');
        return wrapper ? wrapper.getBoundingClientRect().width : 0;
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
