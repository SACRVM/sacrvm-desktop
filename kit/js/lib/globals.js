/**
 * SACRVM APPKIT — global namespace.
 * Load FIRST (classic deferred script). Populated incrementally by the other
 * lib scripts: icons.js, router.js, scope.js, dialog.js, pan-zoom.js,
 * apps.js, hotkeys.js, color.js, fs.js, identity.js.
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
        identity: null, // populated by identity.js (who is at this desktop)
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

        /* There is deliberately NO toolbar or sidebar projection here. An
         * app is complete: it draws its own chrome — toolbar (the .toolbar
         * recipe) and rail (<sac-sidebar> with the `items` property) — in
         * its own markup. A host injects context INTO the app
         * (context.host: jump-home, suite navigation, toolbar controls —
         * the way identity already works); it never offers the app a hull to
         * project fragments into. Actions the command palette should reach
         * are registered on sac.commands. */
    };
})();
