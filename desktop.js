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
        el("empty").hidden = installed.length > 0;

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

            const remove = document.createElement("button");
            remove.className = "tile-remove";
            remove.type = "button";
            remove.title = `Uninstall ${m.name}`;
            remove.setAttribute("aria-label", `Uninstall ${m.name}`);
            remove.textContent = "×";
            remove.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();     // the tile itself is a link
                uninstall(m);
            });

            tile.append(icon, body, remove);
            return tile;
        }));
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
            title: `Uninstall ${manifest.name}?`,
            message: "The app is forgotten here. Nothing is deleted at its origin, and installing it again takes one paste.",
            buttons: [
                { action: "cancel", label: "Cancel", kind: "default" },
                { action: "remove", label: "Uninstall", kind: "destructive" },
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

    /* --------------------------------------------------------------- boot */

    function boot() {
        installed = load();
        // Register from the stored manifests: instant, offline, and no
        // network round trip before the desktop is usable. The app's own
        // script is still only fetched when you open it.
        installed.forEach((m) => sac.apps.register(m));
        renderTiles();

        el("install-btn").addEventListener("click", promptInstall);
        el("empty-install").addEventListener("click", promptInstall);

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
