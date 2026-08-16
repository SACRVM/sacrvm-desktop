/**
 * SACRVM DESKTOP — the shell.
 *
 * It owns three things and nothing else: the ribbon, the rail and the stage.
 * Everything on it is an app, and every app is somebody else's repository.
 *
 * Installing = remembering a URL. The desktop never copies an app's code; it
 * stores the manifest it read and the address it read it from, so the author's
 * next release is simply there the next time you open the app.
 *
 * The install path deliberately splits reading from running:
 *   sac.apps.inspect(url)  fetches and validates app.json — data only
 *   [you confirm, seeing the name, the version and the origin]
 *   sac.apps.add(manifest) registers it; the app's script is injected later,
 *                          on first open, exactly like any other app
 */
(function () {
    const STORAGE_KEY = "sacrvm.desktop.apps.v1";

    /* -------------------------------------------------------- persistence */

    /** @returns {Array<object>} installed manifests, in install order. */
    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const data = raw ? JSON.parse(raw) : [];
            return Array.isArray(data) ? data : [];
        } catch (err) {
            console.warn("[desktop] could not read the installed list:", err);
            return [];
        }
    }

    function save(manifests) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(manifests));
        } catch (err) {
            console.warn("[desktop] could not save the installed list:", err);
        }
    }

    let installed = [];

    /* --------------------------------------------------------------- tiles */

    const el = (id) => document.getElementById(id);

    function renderTiles() {
        const grid = el("tiles");
        grid.replaceChildren(...installed.map((m) => {
            // A view app is addressed by hash, so it is a plain link; a window
            // app opens in place, so it is a [data-app] tile. Same as any
            // shell — the desktop adds no mechanism of its own.
            const isView = m.kind === "view";
            const tile = document.createElement("a");
            tile.className = "tile" + (isView ? "" : " tile-window");
            tile.href = isView ? `#/${m.id}` : `?app=${encodeURIComponent(m.id)}`;
            if (!isView) tile.dataset.app = m.id;

            const icon = document.createElement("sac-icon");
            icon.setAttribute("name", m.icon || "cube");

            const body = document.createElement("div");
            const h2 = document.createElement("h2");
            h2.textContent = m.name;
            const desc = document.createElement("p");
            desc.textContent = m.description || "";
            const meta = document.createElement("p");
            meta.className = "tile-meta";
            // The origin is on every tile, always: an installed app runs its
            // own code here, and you should be able to see whose.
            meta.textContent = `${originLabel(m)}${m.version ? " · v" + m.version : ""}`;
            body.append(h2, desc, meta);

            tile.append(icon, body, tileMenu(m));
            if (m.tile === "wide" || m.tile === "large") tile.classList.add("size-" + m.tile);
            return tile;
        }));

        // The tile that closes the grid: installing belongs where the apps
        // are, not in the chrome. Dashed, like the kit's own add tile — it
        // reads as "a slot", not as an app.
        const add = document.createElement("button");
        add.type = "button";
        add.className = "tile tile-add";
        add.id = "install-tile";
        const addIcon = document.createElement("sac-icon");
        addIcon.setAttribute("name", "plus");
        const addLabel = document.createElement("span");
        addLabel.textContent = installed.length ? "Install app" : "Install your first app";
        add.append(addIcon, addLabel);
        add.addEventListener("click", promptInstall);
        grid.appendChild(add);
    }

    /**
     * The tile's own menu: size, and the way out. A menu rather than a bare
     * × — an × invites a misclick and says nothing about what it removes.
     */
    function tileMenu(manifest) {
        const menu = document.createElement("sac-menu");
        menu.className = "tile-menu";

        const trigger = document.createElement("button");
        trigger.slot = "trigger";
        trigger.type = "button";
        trigger.className = "tile-menu-btn";
        trigger.title = `${manifest.name} options`;
        trigger.setAttribute("aria-label", `${manifest.name} options`);
        trigger.textContent = "⋯";          // midline horizontal ellipsis
        menu.appendChild(trigger);

        const item = (action, label, danger) => {
            const b = document.createElement("button");
            b.dataset.action = action;
            b.textContent = label;
            if (danger) b.setAttribute("data-danger", "");
            if (action.startsWith("size:") &&
                (manifest.tile || "medium") === action.slice(5)) {
                b.textContent = "✓ " + label;   // the current size, marked
            }
            return b;
        };

        menu.append(
            item("size:medium", "Medium tile"),
            item("size:wide",   "Wide tile"),
            item("size:large",  "Large tile"),
            document.createElement("hr"),
            item("remove", "Remove from this desktop", true),
        );

        menu.addEventListener("sac:menu-select", (e) => {
            const action = e.detail.action;
            if (action === "remove") { uninstall(manifest); return; }
            if (action.startsWith("size:")) setTileSize(manifest, action.slice(5));
        });

        // The tile is a link: a click inside its menu must not follow it.
        menu.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); });
        return menu;
    }

    function setTileSize(manifest, size) {
        const entry = installed.find((m) => m.id === manifest.id);
        if (!entry) return;
        entry.tile = size;
        save(installed);
        renderTiles();
    }

    function originLabel(manifest) {
        try {
            return new URL(manifest.manifestUrl || manifest.src).host;
        } catch (err) {
            return "unknown origin";
        }
    }

    /* ------------------------------------------------------------ install */

    async function install(input) {
        let manifest;
        try {
            manifest = await sac.apps.inspect(input);
        } catch (err) {
            await sac.dialog.confirm({
                title: "Nothing to install",
                message: `${err.message}\n\nAn app repository publishes its Pages with an app.json in the root.`,
                buttons: [{ action: "ok", label: "OK", kind: "default" }],
            });
            return null;
        }

        const known = installed.find((m) => m.id === manifest.id);
        const answer = await sac.dialog.confirm({
            title: known ? `Update ${manifest.name}?` : `Install ${manifest.name}?`,
            message:
                `${manifest.description || "No description."}\n\n` +
                `Origin: ${new URL(manifest.manifestUrl).origin}\n` +
                `Version: ${manifest.version || "unversioned"} · runs as: ${manifest.kind}\n\n` +
                `Installing lets this app run its own code in your desktop.`,
            buttons: [
                { action: "cancel", label: "Cancel", kind: "default" },
                { action: "install", label: known ? "Update" : "Install", kind: "primary" },
            ],
        });
        if (answer !== "install") return null;

        sac.apps.add(manifest);
        installed = installed.filter((m) => m.id !== manifest.id).concat(manifest);
        save(installed);
        renderTiles();
        if (typeof sac.toast === "function") {
            sac.toast(`${manifest.name} installed.`, { kind: "success" });
        }
        return manifest;
    }

    async function uninstall(manifest) {
        const answer = await sac.dialog.confirm({
            title: `Remove ${manifest.name}?`,
            message:
                `It is removed from THIS browser's desktop — that is the only place it was.\n\n` +
                `The app itself stays at ${originLabel(manifest)}, untouched, and ` +
                `installing it again is one paste.`,
            buttons: [
                { action: "cancel", label: "Cancel", kind: "default" },
                { action: "remove", label: "Remove", kind: "destructive" },
            ],
        });
        if (answer !== "remove") return;

        sac.apps.remove(manifest.id);
        installed = installed.filter((m) => m.id !== manifest.id);
        save(installed);
        renderTiles();
    }

    /**
     * The install prompt: one field, any of the three URL shapes.
     *
     * Built here rather than in the kit: sac.dialog only does confirm, and a
     * text-input dialog now exists twice (sac-launcher's add-app form is the
     * other) — one more and it has earned a sac.dialog.prompt.
     */
    function promptUrl() {
        return new Promise((resolve) => {
            const dlg = document.createElement("sac-dialog");
            dlg.setAttribute("title", "Install an app");
            dlg.buttons = [
                { action: "cancel", label: "Cancel", kind: "default" },
                { action: "read",   label: "Read manifest", kind: "primary" },
            ];

            const p = document.createElement("p");
            p.textContent = "Paste the app's repository URL — or its app.json, if it lives somewhere else.";
            const input = document.createElement("input");
            input.type = "url";
            input.placeholder = "https://github.com/owner/repo";
            input.setAttribute("aria-label", "App repository URL");
            input.style.width = "100%";
            // Enter submits: a one-field dialog that needs the mouse is rude.
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") { e.preventDefault(); dlg.close("read"); }
            });
            dlg.append(p, input);

            dlg.addEventListener("sac-dialog:action", (e) => {
                const value = input.value.trim();
                setTimeout(() => {
                    dlg.remove();
                    resolve(e.detail.action === "read" && value ? value : null);
                }, 120);
            }, { once: true });

            document.body.appendChild(dlg);
            dlg.open();
            input.focus();
        });
    }

    async function promptInstall() {
        const url = await promptUrl();
        if (url) await install(url);
    }

    /* ----------------------------------------------------------- settings */

    const ACCENT_KEY = "sacrvm.desktop.accent";
    // Seeds, not a palette: each one is a whole theme, because everything
    // accent-derived follows it. The kit's default leads.
    const ACCENTS = [
        { value: "#3b82f6", label: "Blue (default)" },
        { value: "#14b8a6", label: "Teal" },
        { value: "#10b981", label: "Green" },
        { value: "#a855f7", label: "Violet" },
        { value: "#ec4899", label: "Pink" },
        { value: "#f97316", label: "Orange" },
        { value: "#eab308", label: "Yellow" },
        { value: "#64748b", label: "Slate" },
    ];

    function applyAccent(value) {
        if (value) document.documentElement.style.setProperty("--accent", value);
        else document.documentElement.style.removeProperty("--accent");
    }

    function storedAccent() {
        try { return localStorage.getItem(ACCENT_KEY) || ""; }
        catch (err) { return ""; }
    }

    function setAccent(value) {
        applyAccent(value);
        try {
            if (value) localStorage.setItem(ACCENT_KEY, value);
            else localStorage.removeItem(ACCENT_KEY);
        } catch (err) { /* a desktop without storage still themes fine */ }
    }

    /**
     * Built once and kept: the theme toggle inside it is the kit's one source
     * of truth for the theme, so it must not be thrown away between openings.
     */
    let settingsDialog = null;

    function openSettings() {
        if (settingsDialog) { settingsDialog.open(); return; }

        const dlg = document.createElement("sac-dialog");
        dlg.setAttribute("title", "Settings");
        dlg.buttons = [{ action: "done", label: "Done", kind: "primary" }];

        const wrap = document.createElement("div");
        wrap.className = "settings";
        wrap.innerHTML = `
            <label>Theme</label>
            <sac-theme-toggle></sac-theme-toggle>

            <label>Accent</label>
            <sac-swatch-grid columns="8" selectable class="accent-swatches">
                ${ACCENTS.map((a) => `<sac-swatch value="${a.value}" label="${a.label}"></sac-swatch>`).join("")}
            </sac-swatch-grid>
            <sac-color-field label="Custom" class="accent-custom"></sac-color-field>
            <p class="hint">One seed re-themes the whole desktop. An app that
               brings its own accent keeps it — that is the app's identity, not
               yours.</p>

            <label>This desktop</label>
            <p class="hint">Your apps and these settings live in this browser,
               on this device. Nobody else sees them, and there is no account
               to lose them with.</p>
            <button type="button" class="btn danger remove-all">Remove all apps</button>
        `;
        dlg.appendChild(wrap);

        const grid   = wrap.querySelector(".accent-swatches");
        const custom = wrap.querySelector(".accent-custom");

        const mark = (value) => {
            const v = (value || "#3b82f6").toLowerCase();
            grid.querySelectorAll("sac-swatch").forEach((s) => {
                s.toggleAttribute("selected", s.getAttribute("value").toLowerCase() === v);
            });
            if (custom.value.toLowerCase() !== v) custom.value = v;
        };

        grid.addEventListener("sac:swatch-select", (e) => {
            setAccent(e.detail.value);
            mark(e.detail.value);
        });
        // The field fires only on user changes, so this cannot loop with mark().
        custom.addEventListener("sac:color-change", (e) => {
            setAccent(e.detail.value);
            mark(e.detail.value);
        });

        wrap.querySelector(".remove-all").addEventListener("click", async () => {
            if (!installed.length) {
                if (typeof sac.toast === "function") sac.toast("Nothing installed.", { kind: "info" });
                return;
            }
            const answer = await sac.dialog.confirm({
                title: `Remove all ${installed.length} apps?`,
                message:
                    "This browser's desktop is emptied. Every app stays where it lives — " +
                    "nothing is deleted at any origin.",
                buttons: [
                    { action: "cancel", label: "Cancel", kind: "default" },
                    { action: "wipe", label: "Remove all", kind: "destructive", armAfterMs: 1200 },
                ],
            });
            if (answer !== "wipe") return;
            installed.slice().forEach((m) => sac.apps.remove(m.id));
            installed = [];
            save(installed);
            renderTiles();
        });

        dlg.addEventListener("sac-dialog:action", () => { /* stays in the DOM */ });

        document.body.appendChild(dlg);
        settingsDialog = dlg;
        mark(storedAccent() || "#3b82f6");
        dlg.open();
    }

    /* --------------------------------------------------------------- info */

    let infoDialog = null;

    function openInfo() {
        if (infoDialog) { infoDialog.open(); return; }

        const dlg = document.createElement("sac-dialog");
        dlg.setAttribute("title", "How this works");
        dlg.buttons = [{ action: "ok", label: "Got it", kind: "primary" }];

        const wrap = document.createElement("div");
        wrap.className = "info";
        wrap.innerHTML = `
            <h3>Whose desktop is this?</h3>
            <p><strong>Yours, and only in this browser.</strong> Your installed apps and
               settings live in this browser's storage, on this device. Another visitor
               to this address sees an empty desktop; your phone sees a different one.
               There is no server and no account.</p>

            <h3>Where do the apps live?</h3>
            <p>At their own origin — <code>owner.github.io/repo/</code> — never here.
               Installing stores the address and the manifest that was read from it,
               so the author's next release is simply there.
               <strong>Removing an app forgets that address in this browser.</strong>
               Nothing is deleted at the origin, and nothing on GitHub.</p>

            <h3>What installing does</h3>
            <ol class="steps">
                <li>You paste <code>github.com/owner/repo</code>.</li>
                <li>The desktop reads <code>owner.github.io/repo/app.json</code> —
                    a fetch, not an execution.</li>
                <li>It shows you what the manifest says, and where it came from.</li>
                <li>You confirm. Only then is the app's script ever loaded, and only
                    when you first open the app.</li>
            </ol>
            <p class="note">An installed app runs its own code in this page. Install
               what you trust, the way you would a browser extension — the origin is
               on every tile for exactly that reason.</p>

            <p class="hint">Want to write one?
               <a href="https://sacrvm.github.io/sacrvm-appkit/kit/templates/">Start from a template</a>
               — a dialog app or a fullscreen app, both a handful of lines.</p>
        `;
        dlg.appendChild(wrap);

        document.body.appendChild(dlg);
        infoDialog = dlg;
        dlg.open();
    }

    /* --------------------------------------------------------------- boot */

    function boot() {
        installed = load();
        // Register from the stored manifests: instant, offline, and no
        // network round trip before the desktop is usable. The app's own
        // script is still only fetched when you open it.
        installed.forEach((m) => sac.apps.register(m));
        renderTiles();

        applyAccent(storedAccent());
        el("info-btn").addEventListener("click", openInfo);
        el("settings-btn").addEventListener("click", openSettings);

        sac.apps.init({ viewHost: "#app-stage", home: "#app-home" });

        // ?install=<url> installs by link — how you hand somebody an app.
        const wanted = new URLSearchParams(location.search).get("install");
        if (wanted) {
            history.replaceState({}, document.title, location.pathname + location.hash);
            install(wanted);
        }
    }

    if (window.sacReady) boot();
    else document.addEventListener("sac:ready", boot, { once: true });
})();
