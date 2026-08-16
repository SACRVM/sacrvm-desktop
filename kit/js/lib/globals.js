/**
 * SACRVM APPKIT — global namespace.
 * Load FIRST (classic deferred script). Populated incrementally by the other
 * lib scripts: icons.js, router.js, scope.js, dialog.js, pan-zoom.js,
 * apps.js, hotkeys.js, color.js, fs.js.
 *
 * Consumers (and mods) use window.sac to interact with the system without
 * rebuilding a component (e.g. sac.icons.register, sac.router.navigate).
 */
(function () {
    if (window.sac) return; // idempotent
    window.sac = {
        router:   null, // populated by router.js
        icons:    null, // populated by icons.js
        scope:    null, // populated by scope.js (optional)
        dialog:   null, // populated by dialog.js
        toast:    null, // installed by sac-toast.js
        hotkeys:  null, // populated by hotkeys.js
        color:    null, // populated by color.js (shared color math)
        fs:       null, // populated by fs.js (per-app storage behind context.fs)
        apps:     null, // populated by apps.js (app registry, windows, deep links)
        commands: null, // installed by sac-command-palette.js (app command registry)
        palette:  null, // installed by sac-command-palette.js (the connected instance)

        /**
         * i18n — the kit's few UI strings (tooltips, aria-labels, button
         * text). English lives inline in the components as the fallback, so
         * the kit needs zero setup. To translate, assign a flat key table in
         * a deferred script loaded AFTER globals.js and BEFORE the component
         * scripts (components read strings when they render):
         *
         *     Object.assign(sac.i18n, {
         *         "calendar.prev-month": "Voriger Monat",
         *         "window.close": "Schließen",
         *     });
         *
         * Language is boot-time, like the browser locale that drives the
         * Intl month names. Components stay standalone: without globals.js
         * they simply render their English fallbacks. Key list: style guide.
         * Date/number OUTPUT is never translated here — that is Intl's job,
         * always in the browser's locale.
         */
        i18n: Object.create(null),
        t(key, fallback) {
            const v = this.i18n[key];
            return v === undefined ? fallback : v;
        },

        /**
         * Nav ribbon toolbar projection — views call sac.toolbar.set([...])
         * to project action icons into the fixed <sac-nav> ribbon. <sac-nav>
         * registers itself as the renderer on connect; the router clears the
         * items between view swaps, so an outgoing view never cleans up.
         *
         * Item shape: { icon, title, onClick, active?, disabled? }
         */
        toolbar: {
            _items: [],
            _nav:   null,
            set(items) {
                this._items = Array.isArray(items) ? items : [];
                this._nav?.renderToolbar();
            },
            clear() { this.set([]); }
        },

        /**
         * Sidebar projection — the left-rail counterpart to sac.toolbar. A
         * view app projects its own navigation into the shell's rail instead
         * of drawing one, so every app in the shell wears the same chrome:
         *
         *   context.sidebar.set([
         *       { section: "Reference" },
         *       { label: "Tokens", icon: "star", href: "#/styleguide/tokens", active: true },
         *       { label: "Rebuild", icon: "sync", onClick: () => rebuild() },
         *   ]);
         *
         * Item shape: { label, icon?, href?, onClick?, active?, disabled? } —
         * or { section } alone for a group heading. href renders a link
         * (hash sub-routes), onClick a button; give one, not both.
         *
         * <sac-sidebar> registers itself as the renderer on connect, and
         * hides itself while there are no items. sac.apps swaps the items
         * when the active view changes — apps use context.sidebar, which is
         * scoped to them, rather than this global directly.
         */
        sidebar: {
            _items: [],
            _host:  null,
            set(items) {
                this._items = Array.isArray(items) ? items : [];
                this._host?.renderSidebar();
            },
            clear() { this.set([]); }
        }
    };
})();
