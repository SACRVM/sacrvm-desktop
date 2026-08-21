/**
 * <sac-nav brand="MY APP" brand-icon="cube" brand-href="#/" app-name="EDITOR">
 *   <div slot="context">…persistent controls (survive toolbar repaints)…</div>
 *   <div slot="toolbar" class="toolbar">…per-page buttons…</div>
 * </sac-nav>
 *
 * Fixed 50px glassmorphic ribbon + 300px slide-out panel. NOTHING here is
 * hardcoded to an app: the panel nav list is computed from
 * sac.router.routes() and re-rendered whenever a route registers
 * (sac:route-registered), the hash changes, or the scope changes
 * (sac:scope-changed). Works for hash-SPA routes AND plain multi-page hrefs
 * (register them with tagName = null; active state then matches
 * location.pathname).
 *
 * Attributes:
 *   brand      — brand text left of the separator (optional).
 *   brand-icon — sac.icons name rendered before the brand text (optional).
 *   brand-href — where the brand links to (default "#/", scope-aware).
 *   app-name   — accent-colored text after "BRAND ·".
 *   host-href  — the HOST'S jump-home address. This is the injection point
 *   host-label   of the app contract: a hosted app copies context.host into
 *   host-icon    these three (observed, so setting them in mount() works)
 *                and its own nav grows a muted "⌂ HOST ·" jump before the
 *                brand. Standalone they are absent and nothing renders.
 *
 * Slots:
 *   context — persistent controls (e.g. a scope switcher).
 *   toolbar — right-aligned content inside the ribbon. This is the OWNER'S
 *             chrome: the page or host that writes the <sac-nav> markup puts
 *             its own buttons here. There is no projection surface — an app
 *             draws its own toolbar in its own area; a host injects context
 *             into the app, it does not offer the app its hull.
 *
 * Layout contract: content below needs padding-top: 50px (#app-root and
 * .main-layout in ui.css do this).
 */
(function () {

    /** Kit i18n: sac.t when globals.js is loaded, the English fallback when
     *  the component runs standalone. */
    const t = (key, fallback) =>
        (window.sac && window.sac.t) ? window.sac.t(key, fallback) : fallback;

class SacNav extends HTMLElement {
    static get observedAttributes() { return ["host-href", "host-label", "host-icon"]; }

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.isOpen = false;
    }

    connectedCallback() {
        this.render();
        this.attachPersistentHandlers();
    }

    attributeChangedCallback() {
        // Hosted apps copy context.host in during mount(), after connect.
        if (this.shadowRoot.firstChild) this.render();
    }

    disconnectedCallback() {
        if (this._escHandler)   document.removeEventListener("keydown", this._escHandler);
        if (this._hashHandler)  window.removeEventListener("hashchange", this._hashHandler);
        if (this._routeHandler) window.removeEventListener("sac:route-registered", this._routeHandler);
        if (this._scopeHandler) window.removeEventListener("sac:scope-changed", this._scopeHandler);
    }

    render() {
        const brand     = this.getAttribute("brand") || "";
        const brandIcon = this.getAttribute("brand-icon") || "";
        const brandHref = this.getAttribute("brand-href") || "#/";
        const appName   = this.getAttribute("app-name") || "";
        // The host's presence in the app's own chrome (see the header).
        const hostHref  = this.getAttribute("host-href") || "";
        const hostLabel = this.getAttribute("host-label") || "";
        const hostIcon  = this.getAttribute("host-icon") || "home";

        const routes = (window.sac?.router?.routes() || []).filter(r => r.hash !== "#/");
        // currentResource() strips any scope prefix so "active" state
        // highlights the right nav item in every scope.
        const currentResource = window.sac?.router?.currentResource?.() || window.location.hash || "#/";
        const hrefFor = (h) => (h.startsWith("#") && window.sac?.scope?.hashFor) ? sac.scope.hashFor(h) : h;
        // A route with sub-routes stays active while you are inside it:
        // "#/styleguide" owns "#/styleguide/components" (sac.apps view apps
        // address their own state that way).
        const isActive = (r) => r.hash.startsWith("#")
            ? (r.hash === currentResource || currentResource.startsWith(r.hash + "/"))
            : window.location.pathname === r.hash;

        // Kit strings: attribute position gets quote-escaping, the empty
        // state is a text node and gets &/< escaping instead.
        const esc = (s) => String(s).replace(/"/g, "&quot;");
        const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
        const L = {
            menu:       esc(t("nav.menu", "Menu")),
            noSections: escText(t("nav.no-sections", "No sections yet.")),
        };

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    position: fixed;
                    top: 0; left: 0; right: 0;
                    z-index: 9999;
                }
                .ribbon {
                    height: 50px;
                    display: flex;
                    align-items: center;
                    padding: 0 1rem;
                    background: var(--glass-strong);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border-bottom: 1px solid var(--border-strong);
                }
                /* Burger that morphs into an X while the panel is open —
                   open state is readable from the ribbon alone. */
                .menu-btn {
                    background: none;
                    border: none;
                    cursor: pointer;
                    width: 32px;
                    height: 32px;
                    margin-right: 0.5rem;
                    border-radius: var(--radius-m);
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    gap: 4px;
                    padding: 0;
                }
                .menu-btn:hover { background: var(--hover); }
                .menu-btn span {
                    display: block;
                    width: 18px;
                    height: 2px;
                    background: var(--text);
                    border-radius: var(--radius-s);
                    transition: all 0.3s ease;
                }
                .menu-btn.active span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
                .menu-btn.active span:nth-child(2) { opacity: 0; }
                .menu-btn.active span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }
                .brand-mark {
                    color: var(--accent);
                    margin-right: 0.6rem;
                    display: flex;
                    align-items: center;
                }
                .brand-mark sac-icon { --icon-size: 22px; }
                .brand {
                    font-family: 'Outfit', sans-serif;
                    font-weight: 800;
                    font-size: 0.95rem;
                    letter-spacing: 0.08em;
                    color: var(--text);
                    display: flex; align-items: center; gap: 0.5rem;
                    text-decoration: none;
                }
                .brand .sep { color: color-mix(in srgb, var(--fg) 30%, transparent); }
                .brand .app-name { color: var(--accent); }

                /* The host's injected presence: muted, before the brand. */
                .host-jump {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    padding: 4px 8px;
                    border-radius: var(--radius-m);
                    color: var(--text-muted);
                    text-decoration: none;
                    font-family: 'Outfit', sans-serif;
                    font-weight: 700;
                    font-size: 0.8rem;
                    letter-spacing: 0.06em;
                }
                .host-jump:hover { background: var(--hover); color: var(--text); }
                .host-jump sac-icon { --icon-size: 15px; }
                .host-sep {
                    margin: 0 0.5rem 0 0.25rem;
                    color: color-mix(in srgb, var(--fg) 30%, transparent);
                }
                .spacer { flex: 1; }
                .toolbar-slot { display: flex; gap: 0.25rem; align-items: center; }
                .context { display: flex; align-items: center; margin-right: 0.6rem; }
                .context:empty { margin-right: 0; }

                .backdrop {
                    position: fixed;
                    top: 50px; left: 0; right: 0; bottom: 0;
                    background: color-mix(in srgb, var(--sink) 50%, transparent);
                    opacity: 0;
                    visibility: hidden;
                    transition: opacity 0.3s, visibility 0.3s;
                    z-index: 1;
                }
                .backdrop.open { opacity: 1; visibility: visible; }

                .panel {
                    position: fixed;
                    top: 50px; left: 0; bottom: 0;
                    width: 300px;
                    background: color-mix(in srgb, var(--glass-hue) 95%, transparent);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border-right: 1px solid var(--border-strong);
                    transform: translateX(-110%);
                    visibility: hidden;
                    transition: transform 0.5s var(--ease-swift), visibility 0.5s;
                    z-index: 2;
                    padding: 1.5rem 0;
                    overflow-y: auto;
                }
                .panel.open {
                    transform: translateX(0);
                    visibility: visible;
                }
                .nav-list { list-style: none; padding: 0; margin: 0; }
                .nav-item {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.75rem 1.5rem;
                    color: color-mix(in srgb, var(--fg) 78%, var(--bg));
                    text-decoration: none;
                    font-size: 0.95rem;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .nav-item:hover {
                    background: color-mix(in srgb, var(--fg) 5%, transparent);
                    color: var(--text);
                }
                .nav-item.active {
                    background: var(--accent-tint);
                    color: var(--accent);
                }
                .nav-item sac-icon { --icon-size: 18px; }
                .panel-empty {
                    padding: 1rem 1.5rem;
                    color: var(--text-dim);
                    font-size: 0.85rem;
                    font-style: italic;
                }

                /* Scrollbar theme — duplicated because the global rule in
                   ui.css doesn't pierce Shadow DOM. */
                ::-webkit-scrollbar { width: 10px; height: 10px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb {
                    background: var(--scrollbar-thumb);
                    background-clip: content-box;
                    border: 2px solid transparent;
                    border-radius: var(--radius-s);
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: var(--scrollbar-thumb-hover);
                    background-clip: content-box;
                }
            </style>
            <nav class="ribbon">
                <button class="menu-btn" aria-label="${L.menu}" aria-expanded="false">
                    <span></span><span></span><span></span>
                </button>
                ${hostHref ? `
                <a class="host-jump" href="${hostHref.replace(/"/g, "&quot;")}"
                   title="${(hostLabel || "Home").replace(/"/g, "&quot;")}">
                    <sac-icon name="${hostIcon}"></sac-icon>
                    ${hostLabel ? `<span>${hostLabel}</span>` : ``}
                </a>
                <span class="sep host-sep">·</span>` : ``}
                <a class="brand" href="${hrefFor(brandHref)}">
                    ${brandIcon ? `<span class="brand-mark"><sac-icon name="${brandIcon}"></sac-icon></span>` : ``}
                    ${brand ? `<span>${brand}</span>` : ``}
                    ${brand && appName ? `<span class="sep">·</span>` : ``}
                    ${appName ? `<span class="app-name">${appName}</span>` : ``}
                </a>
                <div class="spacer"></div>
                <div class="context"><slot name="context"></slot></div>
                <div class="toolbar-slot"><slot name="toolbar"></slot></div>
            </nav>
            <div class="backdrop"></div>
            <aside class="panel">
                ${routes.length === 0
                    ? `<div class="panel-empty">${L.noSections}</div>`
                    : `<ul class="nav-list">
                         ${routes.map(r => `
                             <li>
                                 <a class="nav-item ${isActive(r) ? "active" : ""}" href="${hrefFor(r.hash)}">
                                     ${r.icon ? `<sac-icon name="${r.icon}"></sac-icon>` : ""}
                                     <span>${r.label}</span>
                                 </a>
                             </li>
                         `).join("")}
                       </ul>`}
            </aside>
        `;

        // Re-attach handlers on freshly-rendered shadow-root children.
        this.attachEphemeralHandlers();
    }

    attachEphemeralHandlers() {
        const menuBtn  = this.shadowRoot.querySelector(".menu-btn");
        const backdrop = this.shadowRoot.querySelector(".backdrop");
        const panel    = this.shadowRoot.querySelector(".panel");

        const setOpen = (open) => {
            this.isOpen = open;
            backdrop.classList.toggle("open", open);
            panel.classList.toggle("open", open);
            menuBtn.classList.toggle("active", open);
            menuBtn.setAttribute("aria-expanded", String(open));
        };
        this._setOpen = setOpen;

        menuBtn.addEventListener("click",  () => setOpen(!this.isOpen));
        backdrop.addEventListener("click", () => setOpen(false));

        // Clicking a panel nav-item also closes the panel.
        this.shadowRoot.querySelectorAll(".nav-item").forEach(el => {
            el.addEventListener("click", () => setOpen(false));
        });

        // Restore panel state after a re-render (routes changed while open).
        if (this.isOpen) setOpen(true);
    }

    attachPersistentHandlers() {
        this._escHandler = (e) => {
            if (e.key === "Escape" && this.isOpen) this._setOpen?.(false);
        };
        document.addEventListener("keydown", this._escHandler);

        this._hashHandler = () => this.render();
        window.addEventListener("hashchange", this._hashHandler);

        // Re-render when a new route registers so the panel fills in even if
        // view scripts run after the nav's first render.
        this._routeHandler = () => this.render();
        window.addEventListener("sac:route-registered", this._routeHandler);

        // Scope switch: hrefs pick up the new prefix, active-state moves.
        this._scopeHandler = () => this.render();
        window.addEventListener("sac:scope-changed", this._scopeHandler);
    }
}

customElements.define("sac-nav", SacNav);
})();
