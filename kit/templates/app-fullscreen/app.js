/**
 * <app-my-fullscreen-app> — a FULLSCREEN app (manifest kind: "view").
 *
 * It takes over the desktop's stage and lives at "#/<id>", with its own state
 * addressed after that: "#/my-fullscreen-app/second". Anything that used to
 * be a page of its own belongs here.
 *
 * Two things a dialog app does not do:
 *   - it PROJECTS its navigation into the desktop's rail (context.sidebar)
 *     instead of drawing one, so every app wears the same chrome
 *   - it owns a sub-route: context.route in, context.deepLink.set() out,
 *     context.onRoute() for the back button and pasted links
 */
(function () {
    const BASE = sac.app.base();

    // Whatever your app's sections are. Two is enough to show the shape.
    const SECTIONS = [
        { id: "first",  label: "First",  icon: "star" },
        { id: "second", label: "Second", icon: "shapes" },
    ];

    class AppMyFullscreenApp extends sac.app.Element {
        build() {
            sac.app.styles(BASE + "app.css", "app-my-fullscreen-app-css");
            this.innerHTML = `<div class="page"></div>`;
            this._page = this.querySelector(".page");
        }

        onMount(context) {
            this._ctx = context;
            this._show(context.route || SECTIONS[0].id);
            // Rail clicks, the back button and pasted URLs all arrive here.
            this._offRoute = context.onRoute((route) => this._show(route || SECTIONS[0].id));
        }

        onUnmount() {
            if (this._offRoute) { this._offRoute(); this._offRoute = null; }
            this._ctx.sidebar.clear();
        }

        _show(id) {
            const section = SECTIONS.find((s) => s.id === id) || SECTIONS[0];

            // Render only the active section: a desktop keeps this element
            // alive when you switch away, so what you leave behind is kept.
            this._page.innerHTML = `
                <h1>${section.label}</h1>
                <p class="lead">This section is addressable —
                   <code>${this._ctx.href(section.id)}</code>.</p>
            `;

            // The rail is a NAVIGATION rail. Sliders and colour fields stay
            // inside your own area; they are not navigation.
            this._ctx.sidebar.set([
                { section: "My Fullscreen App" },
                ...SECTIONS.map((s) => ({
                    label:  s.label,
                    icon:   s.icon,
                    // context.href, never a hand-built "#/id/route": the host
                    // owns the address space, and standalone there is no id.
                    href:   this._ctx.href(s.id),
                    active: s.id === section.id,
                })),
            ]);

            // Make the current state linkable. replaceState — switching
            // sections is not a new page in the history.
            this._ctx.deepLink.set(section.id);
        }
    }

    sac.app.define("app-my-fullscreen-app", AppMyFullscreenApp);
})();
