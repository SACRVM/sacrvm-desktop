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

    /** Where "what is an app here?" is answered in full. */
    const BUILD_GUIDE = "https://sacrvm.github.io/sacrvm-appkit/#/build";

    /**
     * The address a paste resolves to — the same rule sac.apps.inspect() uses,
     * repeated here only so a failure can name it. Reporting where it looked
     * turns "it did not work" into something the author can act on.
     */
    function manifestUrlOf(input) {
        const raw = String(input || "").trim();
        const gh = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)/i.exec(raw);
        if (gh) return `https://${gh[1].toLowerCase()}.github.io/${gh[2].replace(/\.git$/, "")}/app.json`;
        if (/\/app\.json$/i.test(raw)) return raw;
        return raw.replace(/\/+$/, "") + "/app.json";
    }

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
            // Tile color = app highlight, the sac-launcher move: the seed
            // re-themes icon and hover ring, and opening through the tile
            // hands the same seed to the app. The desktop owner's override
            // (tile menu) outranks the accent the manifest declares; the
            // "desktop" sentinel seeds nothing at all, so tile and app wear
            // the desktop's palette and follow every later re-theme live.
            const seed = effectiveAccent(m);
            if (seed) tile.style.setProperty("--accent", seed);
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
            if (action === "tint:reset" && !manifest.accentOverride) {
                b.textContent = "✓ " + label;   // no override = as shipped
            }
            if (action === "tint:desktop" && followsDesktop(manifest)) {
                b.textContent = "✓ " + label;
            }
            return b;
        };

        /* The desktop's own eight seeds, as a recolor row. Swatch colors are
           data here, not theme: each one is a whole accent seed the owner may
           pin this app's tile (and the app it opens) to. */
        const tint = document.createElement("sac-swatch-grid");
        tint.setAttribute("columns", "8");
        tint.setAttribute("selectable", "");
        tint.className = "tile-tint";
        ACCENTS.forEach((a) => {
            const s = document.createElement("sac-swatch");
            s.setAttribute("value", a.value);
            s.setAttribute("label", a.label);
            if ((manifest.accentOverride || "").toLowerCase() === a.value) {
                s.setAttribute("selected", "");
            }
            tint.appendChild(s);
        });
        tint.addEventListener("sac:change", (e) => setTileAccent(manifest, e.detail.value));

        menu.append(
            item("size:medium", "Medium tile"),
            item("size:wide",   "Wide tile"),
            item("size:large",  "Large tile"),
            document.createElement("hr"),
            tint,
            item("tint:reset",   "App's shipped color"),
            item("tint:desktop", "Desktop's color"),
            document.createElement("hr"),
            item("remove", "Remove from this desktop", true),
        );

        menu.addEventListener("sac:select", (e) => {
            const action = e.detail.action;
            if (action === "remove") { uninstall(manifest); return; }
            if (action === "tint:reset")   { setTileAccent(manifest, null); return; }
            if (action === "tint:desktop") { setTileAccent(manifest, FOLLOW_DESKTOP); return; }
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

    /* The owner's recolor is one field with three states: absent (the app
       wears the accent its manifest ships), a color (the owner's pick), or
       this sentinel — "wear the desktop's". The sentinel never reaches any
       CSS: it means seed NOTHING, so tile and app inherit :root and follow
       every later desktop re-theme live, instead of freezing a snapshot. */
    const FOLLOW_DESKTOP = "desktop";
    const followsDesktop = (m) => m.accentOverride === FOLLOW_DESKTOP;
    const effectiveAccent = (m) =>
        followsDesktop(m) ? null : (m.accentOverride || m.accent);

    /* The registry gets the manifest with the owner's recolor folded in, so
       every open path — tile click, deep link, reopen — seeds the app with
       the effective color. Following the desktop folds in as ABSENCE: the
       manifest's accent is stripped, and the kit seeds nothing. The stored
       entry keeps both fields, so "App's shipped color" can always return. */
    const withAccent = (m) => {
        if (followsDesktop(m)) {
            const copy = Object.assign({}, m);
            delete copy.accent;
            return copy;
        }
        return m.accentOverride ? Object.assign({}, m, { accent: m.accentOverride }) : m;
    };

    function setTileAccent(manifest, value) {
        const entry = installed.find((m) => m.id === manifest.id);
        if (!entry) return;
        if (value) entry.accentOverride = value;
        else delete entry.accentOverride;
        save(installed);
        sac.apps.add(withAccent(entry));
        // An app already on the page follows live — the same inline seed the
        // kit plants on open. A view idles hidden in the DOM and keeps it; a
        // window wears it on its frame.
        const appEl = document.querySelector(entry.tag);
        if (appEl) {
            const target = appEl.closest("sac-window") || appEl;
            const seed = effectiveAccent(entry);
            if (seed) target.style.setProperty("--accent", seed);
            else target.style.removeProperty("--accent");
        }
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

    /** Register + persist + repaint. The shared tail of every install path. */
    function adopt(manifest) {
        // How big a tile is, is the desktop owner's decision, not the author's —
        // so an update (or a reinstall) inherits it instead of resetting it.
        const previous = installed.find((m) => m.id === manifest.id);
        if (previous && previous.tile && !manifest.tile) manifest.tile = previous.tile;
        // The owner's recolor is equally the desktop's decision — it survives
        // an update or a reinstall the same way the tile size does.
        if (previous && previous.accentOverride) manifest.accentOverride = previous.accentOverride;
        sac.apps.add(withAccent(manifest));
        installed = installed.filter((m) => m.id !== manifest.id).concat(manifest);
        save(installed);
        renderTiles();
        declareHost();
    }

    /* Refresh-on-open. The tile bakes the manifest snapshot from install
       day, but the code an app runs is fetched live from its origin — so
       the version line drifts. Opening an app contacts its origin anyway,
       and THAT is the one moment the desktop may re-read app.json at no
       new privacy cost. An app never opened keeps its old label, which is
       honest: its code is the old one too. Once per app per session. */
    const refreshed = new Set();

    async function refreshManifest(id) {
        const entry = installed.find((m) => m.id === id);
        if (!entry || !entry.manifestUrl || refreshed.has(id)) return;
        refreshed.add(id);
        let fresh;
        try { fresh = await sac.apps.inspect(entry.manifestUrl); }
        catch (err) { return; }        // offline or gone: the snapshot stays
        // The same address suddenly serving a DIFFERENT app is not an
        // update — installing consented to one id, not to one URL.
        if (fresh.id !== entry.id) return;
        // The desktop owner's decisions ride along, like on a reinstall.
        if (entry.tile) fresh.tile = entry.tile;
        if (entry.accentOverride) fresh.accentOverride = entry.accentOverride;
        // Replace IN PLACE — a background refresh must never reorder tiles.
        installed = installed.map((m) => (m.id === id ? fresh : m));
        save(installed);
        sac.apps.add(withAccent(fresh));
        renderTiles();
        declareHost();
    }

    async function install(input) {
        let manifest;
        try {
            manifest = await sac.apps.inspect(input);
        } catch (err) {
            const answer = await sac.dialog.confirm({
                title: "Not an app this desktop can install",
                message:
                    `This desktop installs SACRVM APPKIT apps — a repository whose GitHub Pages ` +
                    `serves an app.json in its root, next to the one custom element the app is. ` +
                    `Any other repository, however good, has nothing here to read.\n\n` +
                    `Making one is small: start from the template, rename five strings, switch ` +
                    `Pages on.\n\n` +
                    // The address it actually tried, last: it is the useful
                    // detail when something IS an app and still did not load
                    // (Pages off, a typo, a private repo).
                    `Looked for: ${manifestUrlOf(input)}`,
                buttons: [
                    { action: "ok", label: "OK", kind: "default" },
                    { action: "how", label: "How to build one", kind: "primary" },
                ],
            });
            if (answer === "how") window.open(BUILD_GUIDE, "_blank", "noopener");
            return null;
        }
        return confirmInstall(manifest);
    }

    /** The one consent step every install path ends in — pasted URL, store
        entry or link: what the manifest says, where it came from, your yes. */
    async function confirmInstall(manifest) {
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

        adopt(manifest);
        if (typeof sac.toast === "function") {
            sac.toast(`${manifest.name} installed.`, { kind: "success" });
        }
        return manifest;
    }

    /** What a storage handle holds, as a sentence — or null if it is empty. */
    async function usageOf(handle) {
        try {
            const { bytes, count } = await handle.usage();
            if (!count) return null;
            const size = bytes < 1024 ? `${bytes} bytes`
                       : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB`
                       : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
            return { bytes, count, text: `${count} item${count === 1 ? "" : "s"}, ${size}` };
        } catch (err) {
            return null;
        }
    }

    /** What an app has stored here — or null if it stored nothing. */
    async function dataOf(manifest) {
        if (!window.sac || !sac.fs) return null;
        return usageOf(sac.fs.for(manifest.id));
    }

    /* The user's files: the one space every app's Open… / Save as… lands in
       (sac.files.virtual() over sac.fs.shared("files")). It belongs to no
       app, so no app's remove ever touches it — only Settings does. */
    const userFiles = () => (window.sac && sac.fs ? sac.fs.shared("files") : null);

    async function uninstall(manifest) {
        // Data is a second decision, never a side effect: removing an app is
        // about this desktop, deleting what you wrote in it is about your work.
        const data = await dataOf(manifest);
        const unsaved = hasUnsaved(manifest.id);
        const buttons = [
            { action: "cancel", label: "Cancel", kind: "default" },
            { action: "remove", label: data ? "Remove, keep data" : "Remove", kind: "destructive" },
        ];
        if (data) buttons.push({ action: "purge", label: "Remove + delete data", kind: "destructive" });

        const answer = await sac.dialog.confirm({
            title: `Remove ${manifest.name}?`,
            message:
                (unsaved ? `${manifest.name} is open with unsaved work. Removing it closes ` +
                           `it, and that work is lost.\n\n` : "") +
                `It is removed from THIS browser's desktop — that is the only place it was.\n\n` +
                `The app itself stays at ${originLabel(manifest)}, untouched, and ` +
                `installing it again is one paste.` +
                (data ? `\n\nIt has stored ${data.text} here. Kept by default, so reinstalling ` +
                        `brings it back — or delete it now, which cannot be undone.` : ""),
            buttons,
        });
        if (answer !== "remove" && answer !== "purge") return;

        if (answer === "purge") {
            try { await sac.fs.for(manifest.id).clear(); }
            catch (err) { console.warn(`[desktop] could not delete ${manifest.id}'s data:`, err); }
        }

        sac.apps.remove(manifest.id);
        installed = installed.filter((m) => m.id !== manifest.id);
        save(installed);
        renderTiles();
        declareHost();
        if (typeof sac.toast === "function" && answer === "purge") {
            sac.toast(`${manifest.name} and its data are gone.`, { kind: "info" });
        }
    }

    /* Unsaved work: an app flags it (context.setDirty) and the kit keeps the
       answer. Closing a window never loses it — the element stays — but a
       remove unmounts the app, so the remove dialogs say so first. */
    const hasUnsaved = (id) =>
        !!(window.sac && sac.apps && typeof sac.apps.isDirty === "function" && sac.apps.isDirty(id));

    /* ------------------------------------------------------------- store */

    /* The App Store tab: SACRVM's own apps, one click from the install
       dialog instead of a URL to know by heart. A repository is in it when
       its owner is listed here AND it carries the topic — tagging a repo on
       GitHub is how an app joins, no desktop commit needed. The owners are
       the gate: anyone can tag a repo, but only these accounts are asked
       for, so strangers cannot fill the list.

       It stays a shortcut, never a gate of its own: every entry is read
       with sac.apps.inspect() — the same fetch a paste does — and installs
       through the same confirm. Nothing runs before that yes. */
    const STORE_OWNERS = ["SACRVM"];
    const STORE_TOPIC  = "sacrvm-app";

    /* Asked once per session: GitHub's search allows an anonymous visitor
       ten queries a minute, and the list does not change while you look.
       A failure is not kept — the next opening tries again. */
    let storeLoad = null;

    function loadStore() {
        if (storeLoad) return storeLoad;
        storeLoad = (async () => {
            const q = [`topic:${STORE_TOPIC}`, ...STORE_OWNERS.map((o) => `user:${o}`)].join(" ");
            const res = await fetch(
                `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=100`,
                { headers: { Accept: "application/vnd.github+json" } });
            if (!res.ok) {
                throw new Error(res.status === 403 || res.status === 429
                    ? "GitHub is rate-limiting this browser for a minute."
                    : `GitHub answered ${res.status}.`);
            }
            const { items = [] } = await res.json();
            // A tagged repo that serves no manifest (Pages off, not yet
            // published) is simply not listed — it is not an app YET.
            const reads = await Promise.allSettled(items
                .filter((r) => !r.archived && !r.is_template)
                .map((r) => sac.apps.inspect(r.html_url)));
            return reads
                .filter((r) => r.status === "fulfilled")
                .map((r) => r.value)
                .sort((a, b) => a.name.localeCompare(b.name));
        })();
        storeLoad.catch(() => { storeLoad = null; });
        return storeLoad;
    }

    /** One store row per app: what it is, whose it is, and one button. */
    function storeRow(manifest, choose) {
        const row = document.createElement("li");
        row.className = "store-item";
        // The app's own accent on its icon, the way its tile will wear it.
        if (manifest.accent) row.style.setProperty("--accent", manifest.accent);

        const icon = document.createElement("sac-icon");
        icon.setAttribute("name", manifest.icon || "cube");

        const body = document.createElement("span");
        body.className = "store-body";
        const name = document.createElement("span");
        name.className = "store-name";
        name.textContent = manifest.name;
        const desc = document.createElement("span");
        desc.className = "store-desc";
        desc.textContent = manifest.description || "";
        const meta = document.createElement("span");
        meta.className = "store-meta";
        meta.textContent = `${originLabel(manifest)}${manifest.version ? " · v" + manifest.version : ""}`;
        body.append(name, desc, meta);

        // Installed is installed: the store is for adding apps, and opening
        // an app already refreshes its snapshot (refreshManifest).
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn store-btn";
        if (installed.some((m) => m.id === manifest.id)) {
            btn.textContent = "Installed";
            btn.disabled = true;
        } else {
            btn.textContent = "Install";
            btn.classList.add("primary");
            btn.addEventListener("click", () => choose(manifest));
        }

        row.append(icon, body, btn);
        return row;
    }

    /** Fills the store panel; called on the first switch to its tab. */
    async function paintStore(panel, choose) {
        const status = panel.querySelector(".store-status");
        const list = panel.querySelector(".store-list");
        status.hidden = false;
        status.textContent = "Asking GitHub for the list…";
        try {
            const apps = await loadStore();
            list.replaceChildren(...apps.map((m) => storeRow(m, choose)));
            status.hidden = apps.length > 0;
            status.textContent = "No apps in the store right now.";
        } catch (err) {
            console.warn("[desktop] the store could not be loaded:", err);
            status.textContent =
                `The list could not be loaded. ${err.message || "GitHub was not reachable."} ` +
                `Pasting a repository URL still works.`;
        }
    }

    /**
     * The install dialog: two ways to the same confirm. "From URL" takes any
     * of the three URL shapes; "App Store" lists SACRVM's own apps. Resolves
     * { input } for a paste, { manifest } for a store pick, or null.
     *
     * Built here rather than in the kit: sac.dialog only does confirm, and a
     * text-input dialog now exists twice (sac-launcher's add-app form is the
     * other) — one more and it has earned a sac.dialog.prompt.
     */
    function openInstaller() {
        return new Promise((resolve) => {
            let picked = null;
            const dlg = document.createElement("sac-dialog");
            dlg.setAttribute("title", "Install an app");
            dlg.style.setProperty("--dialog-width", "520px");
            dlg.buttons = [
                { action: "cancel", label: "Cancel", kind: "default" },
                { action: "read",   label: "Read manifest", kind: "primary" },
            ];

            const tabs = document.createElement("sac-tab-group");
            tabs.className = "installer-tabs";
            // Said before the paste, not after the failure: this desktop can
            // only read one kind of repository, and that is not obvious.
            tabs.innerHTML = `
                <sac-tab name="url">From URL</sac-tab>
                <sac-tab name="store">App Store</sac-tab>
                <sac-tab-panel name="url">
                    <div class="installer-panel">
                        <p>Paste the app's repository URL — or its app.json, if it lives somewhere else.</p>
                        <input type="url" class="installer-url" placeholder="https://github.com/owner/repo"
                               aria-label="App repository URL">
                        <p class="hint">SACRVM APPKIT apps only — a repository serving an app.json
                           from its GitHub Pages root. Anything else has nothing to read.</p>
                    </div>
                </sac-tab-panel>
                <sac-tab-panel name="store">
                    <div class="installer-panel store">
                        <p class="store-status" hidden></p>
                        <ul class="store-list"></ul>
                    </div>
                </sac-tab-panel>`;
            dlg.appendChild(tabs);

            const input = tabs.querySelector(".installer-url");
            // Enter submits: a one-field dialog that needs the mouse is rude.
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") { e.preventDefault(); dlg.close("read"); }
            });

            // A store pick closes the dialog and hands over the manifest it
            // already read — the confirm that follows needs no second fetch.
            const choose = (manifest) => { picked = manifest; dlg.close("store"); };

            let storePainted = false;
            tabs.addEventListener("sac:tab-show", (e) => {
                const onStore = e.detail.name === "store";
                // "Read manifest" belongs to the URL field; in the store every
                // row carries its own button.
                dlg.setDisabled("read", onStore);
                if (onStore && !storePainted) {
                    storePainted = true;
                    paintStore(tabs.querySelector(".store"), choose);
                }
                if (!onStore) input.focus();
            });

            dlg.addEventListener("sac:action", (e) => {
                const value = input.value.trim();
                setTimeout(() => {
                    dlg.remove();
                    if (e.detail.action === "store" && picked) resolve({ manifest: picked });
                    else if (e.detail.action === "read" && value) resolve({ input: value });
                    else resolve(null);
                }, 120);
            }, { once: true });

            document.body.appendChild(dlg);
            dlg.open();
            input.focus();
        });
    }

    async function promptInstall() {
        const choice = await openInstaller();
        if (!choice) return;
        if (choice.manifest) await confirmInstall(choice.manifest);
        else await install(choice.input);
    }

    /** "A and B", "A, B and C" — for a sentence, not a log line. */
    function andList(names) {
        if (names.length < 2) return names[0] || "";
        return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
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
        // The dialog is its own accent scope (the kit re-derives the accent
        // family on .sac-app elements): opened from an app it wears THAT
        // surface's color, at home it inherits the desktop's.
        dlg.classList.add("sac-app");

        const wrap = document.createElement("div");
        wrap.className = "settings";
        wrap.innerHTML = `
            <label for="me-name">You</label>
            <input type="text" id="me-name" class="me-name" placeholder="Your name"
                   autocomplete="off" maxlength="80">
            <input type="url" id="me-avatar-src" class="me-avatar-src"
                   placeholder="Picture URL (optional)" autocomplete="off">
            <p class="hint">Apps can read this to greet you and colour your avatar.
               It is a name in this browser, nothing more — no account, no
               password, nothing verified, and nothing leaves this device unless
               an app you installed sends it.</p>

            <label>Theme</label>
            <sac-theme-toggle></sac-theme-toggle>

            <label class="accent-label">Accent</label>
            <sac-swatch-grid columns="8" selectable class="accent-swatches">
                ${ACCENTS.map((a) => `<sac-swatch value="${a.value}" label="${a.label}"></sac-swatch>`).join("")}
            </sac-swatch-grid>
            <sac-color-field label="Custom" class="accent-custom"></sac-color-field>
            <div class="settings-actions accent-actions" hidden>
                <button type="button" class="btn accent-reset" hidden>App's shipped color</button>
                <button type="button" class="btn accent-desktop" hidden>Desktop's color</button>
            </div>
            <p class="hint accent-hint"></p>

            <label>This desktop</label>
            <p class="hint">Your apps and these settings live in this browser,
               on this device. Nobody else sees them, and there is no account
               to lose them with.</p>
            <p class="hint files-line"></p>
            <p class="hint orphans" hidden></p>
            <div class="settings-actions">
                <button type="button" class="btn danger remove-all">Remove all apps</button>
                <button type="button" class="btn danger clear-files" hidden>Delete your files</button>
                <button type="button" class="btn danger clear-orphans" hidden>Delete leftover data</button>
            </div>
        `;
        dlg.appendChild(wrap);

        /* Identity. The desktop owns the profile — apps only read it — so this
           field is the one place it is written. Committed on change (blur or
           Enter), because saving on every keystroke would rename you five times
           while you type your own name. */
        const nameField   = wrap.querySelector(".me-name");
        const avatarField = wrap.querySelector(".me-avatar-src");

        function fillIdentity() {
            const me = sac.identity ? sac.identity.get() : null;
            nameField.value   = me ? me.name : "";
            avatarField.value = (me && me.avatar) || "";
        }

        const commitIdentity = () => {
            if (!sac.identity) return;
            const name = nameField.value.trim();
            if (!name) sac.identity.clear();
            else sac.identity.set({ name, avatar: avatarField.value.trim() || undefined });
        };
        nameField.addEventListener("change", commitIdentity);
        avatarField.addEventListener("change", commitIdentity);
        nameField.addEventListener("keydown", (e) => { if (e.key === "Enter") nameField.blur(); });

        const grid        = wrap.querySelector(".accent-swatches");
        const custom      = wrap.querySelector(".accent-custom");
        const accentLabel = wrap.querySelector(".accent-label");
        const accentHint  = wrap.querySelector(".accent-hint");
        const accentReset   = wrap.querySelector(".accent-reset");
        const accentDesktop = wrap.querySelector(".accent-desktop");
        const accentRow     = wrap.querySelector(".accent-actions");

        // null = no swatch speaks for this surface (it follows the desktop):
        // every mark comes off, and the custom field keeps its last color.
        const mark = (value) => {
            const v = (value || "").toLowerCase();
            grid.querySelectorAll("sac-swatch").forEach((s) => {
                s.toggleAttribute("selected", !!v && s.getAttribute("value").toLowerCase() === v);
            });
            if (v && custom.value.toLowerCase() !== v) custom.value = v;
        };

        /* Which surface the section speaks for: null = the desktop, else the
           installed entry of the view on stage. Opened from inside an app,
           the swatches recolor THAT app — the change is visible right behind
           the dialog, and it is the same override the tile menu writes. */
        let accentCtx = null;

        // The dialog wears the color it speaks for — its chrome follows the
        // app context, or falls back to inheriting the desktop's seed.
        const seedDialog = (color) => {
            if (color) dlg.style.setProperty("--accent", color);
            else dlg.style.removeProperty("--accent");
        };

        function paintAccent() {
            const activeId = sac.apps.active();
            accentCtx = activeId ? installed.find((m) => m.id === activeId) || null : null;
            if (accentCtx) {
                accentLabel.textContent = `Accent — ${accentCtx.name}`;
                accentHint.textContent =
                    `This recolors ${accentCtx.name} on this desktop: the app ` +
                    `behind this dialog and its tile follow along. Your ` +
                    `desktop's own accent is set from the home screen.` +
                    (followsDesktop(accentCtx)
                        ? ` Right now it wears your desktop's accent and ` +
                          `follows it live.`
                        : "");
                accentRow.hidden = false;
                accentReset.hidden = !accentCtx.accentOverride;
                accentDesktop.hidden = followsDesktop(accentCtx);
                mark(effectiveAccent(accentCtx));
                seedDialog(effectiveAccent(accentCtx));
            } else {
                accentLabel.textContent = "Accent";
                accentHint.textContent =
                    "One seed re-themes the whole desktop. An app that brings " +
                    "its own accent keeps it — that is the app's identity, not " +
                    "yours, unless you repaint it from its tile or from in here.";
                accentRow.hidden = true;
                mark(storedAccent() || "#3b82f6");
                seedDialog(null);
            }
        }

        const applyPick = (value) => {
            if (accentCtx) {
                // setTileAccent writes the entry accentCtx points at, so
                // repainting the whole section reads the committed state —
                // buttons, marks, hint and dialog seed in one move.
                setTileAccent(accentCtx, value);
                paintAccent();
            } else {
                setAccent(value);
                mark(value);
            }
        };
        // The field fires only on user changes, so this cannot loop with mark().
        grid.addEventListener("sac:change", (e) => applyPick(e.detail.value));
        custom.addEventListener("sac:change", (e) => applyPick(e.detail.value));
        accentReset.addEventListener("click", () => applyPick(null));
        accentDesktop.addEventListener("click", () => applyPick(FOLLOW_DESKTOP));

        wrap.querySelector(".remove-all").addEventListener("click", async () => {
            if (!installed.length) {
                if (typeof sac.toast === "function") sac.toast("Nothing installed.", { kind: "info" });
                return;
            }
            const stored = (await Promise.all(installed.map(dataOf))).filter(Boolean);
            const items = stored.reduce((n, d) => n + d.count, 0);
            const unsaved = installed.filter((m) => hasUnsaved(m.id)).map((m) => m.name);
            const buttons = [
                { action: "cancel", label: "Cancel", kind: "default" },
                { action: "wipe", label: stored.length ? "Remove, keep data" : "Remove all",
                  kind: "destructive", armAfterMs: 1200 },
            ];
            if (stored.length) {
                buttons.push({ action: "purge", label: "Remove + delete data",
                               kind: "destructive", armAfterMs: 1200 });
            }

            const answer = await sac.dialog.confirm({
                title: `Remove all ${installed.length} apps?`,
                message:
                    (unsaved.length ? `${andList(unsaved)} ${unsaved.length === 1 ? "is" : "are"} ` +
                                      `open with unsaved work, which is lost.\n\n` : "") +
                    "This browser's desktop is emptied. Every app stays where it lives — " +
                    "nothing is deleted at any origin." +
                    (stored.length ? `\n\n${stored.length} of them stored ${items} item` +
                                     `${items === 1 ? "" : "s"} here. That is your work, so it is ` +
                                     `kept unless you say otherwise.` : ""),
                buttons,
            });
            if (answer !== "wipe" && answer !== "purge") return;

            for (const m of installed.slice()) {
                if (answer === "purge" && window.sac.fs) {
                    try { await sac.fs.for(m.id).clear(); }
                    catch (err) { console.warn(`[desktop] could not delete ${m.id}'s data:`, err); }
                }
                sac.apps.remove(m.id);
            }
            installed = [];
            save(installed);
            renderTiles();
            declareHost();
        });

        /* Data an app left behind. Removing an app keeps its work on purpose,
           which is right until the app is never coming back — then it is
           invisible clutter, and only the desktop can see it at all. */
        const orphanLine = wrap.querySelector(".orphans");
        const orphanBtn  = wrap.querySelector(".clear-orphans");

        async function findOrphans() {
            if (!window.sac || !sac.fs) return [];
            try {
                const ids = await sac.fs.apps();
                const gone = ids.filter((id) => !installed.some((m) => m.id === id));
                const withData = [];
                for (const id of gone) {
                    const usage = await sac.fs.for(id).usage();
                    if (usage.count) withData.push({ id, ...usage });
                }
                return withData;
            } catch (err) {
                return [];
            }
        }

        async function showOrphans() {
            const orphans = await findOrphans();
            const has = orphans.length > 0;
            orphanLine.hidden = !has;
            orphanBtn.hidden = !has;
            if (!has) return;
            const bytes = orphans.reduce((n, o) => n + o.bytes, 0);
            const size = bytes < 1024 ? `${bytes} bytes` : `${Math.round(bytes / 1024)} KB`;
            orphanLine.textContent =
                `${size} of data belongs to ${orphans.length} app` +
                `${orphans.length === 1 ? "" : "s"} that ${orphans.length === 1 ? "is" : "are"} ` +
                `not on this desktop (${orphans.map((o) => o.id).join(", ")}). ` +
                `Reinstalling picks it up again — deleting it here cannot be undone.`;
            orphanBtn._orphans = orphans;
        }

        orphanBtn.addEventListener("click", async () => {
            const orphans = orphanBtn._orphans || [];
            if (!orphans.length) return;
            const answer = await sac.dialog.confirm({
                title: "Delete leftover data?",
                message:
                    `Everything ${orphans.map((o) => o.id).join(", ")} stored in this browser is ` +
                    `deleted. The apps are already gone from this desktop; this is their work.\n\n` +
                    `It cannot be undone.`,
                buttons: [
                    { action: "cancel", label: "Cancel", kind: "default" },
                    { action: "purge", label: "Delete", kind: "destructive", armAfterMs: 1200 },
                ],
            });
            if (answer !== "purge") return;
            for (const o of orphans) {
                try { await sac.fs.for(o.id).clear(); }
                catch (err) { console.warn(`[desktop] could not delete ${o.id}'s data:`, err); }
            }
            showOrphans();
        });

        /* The user's files. Not an app's drawer, so neither a remove nor the
           leftovers above ever reach them — this line is the one place they
           are counted and the one button that deletes them. */
        const filesLine = wrap.querySelector(".files-line");
        const filesBtn  = wrap.querySelector(".clear-files");

        async function showFiles() {
            const store = userFiles();
            const data = store ? await usageOf(store) : null;
            filesBtn.hidden = !data;
            filesLine.textContent = data
                ? `Your files — what apps open from and save to — are here too: ` +
                  `${data.text}, shared by every app on this desktop.`
                : "Files you save from an app land here too, in one space every " +
                  "app on this desktop shares. Nothing is saved yet.";
        }

        filesBtn.addEventListener("click", async () => {
            const store = userFiles();
            const data = store ? await usageOf(store) : null;
            if (!data) { showFiles(); return; }
            const answer = await sac.dialog.confirm({
                title: "Delete your files?",
                message:
                    `The ${data.text} every app on this desktop opens from and saves ` +
                    `to are deleted from this browser. Files you saved to this device ` +
                    `instead are not touched.\n\nIt cannot be undone.`,
                buttons: [
                    { action: "cancel", label: "Cancel", kind: "default" },
                    { action: "purge", label: "Delete", kind: "destructive", armAfterMs: 1200 },
                ],
            });
            if (answer !== "purge") return;
            try { await store.clear(); }
            catch (err) { console.warn("[desktop] could not delete the user's files:", err); }
            showFiles();
        });

        // Recount on every opening: apps come and go between them — and the
        // accent section speaks for whatever is on stage right now.
        dlg.addEventListener("sac:open", () => { showOrphans(); showFiles(); fillIdentity(); paintAccent(); });
        // A dialog dismissed with Escape still means what was typed in it.
        dlg.addEventListener("sac:action", commitIdentity);
        dlg.addEventListener("sac:action", () => { /* stays in the DOM */ });

        document.body.appendChild(dlg);
        settingsDialog = dlg;
        paintAccent();
        fillIdentity();
        showFiles();
        dlg.open();
    }

    /* --------------------------------------------------------------- info */

    /* The host's About, on the kit's shared About surface — the same
       component every app's About uses, so the two look related by
       construction. The three notices answer the three questions people
       actually ask; everything beyond them lives on how.html. */

    function openInfo() {
        const win = sac.about.open({
            name: "SACRVM DESKTOP",
            icon: "cube",
            description: "A desktop you fill yourself — every app on it " +
                "comes from somebody else's repository.",
            notices: [
                { title: "Yours, in this browser",
                  text: "Apps, settings and the files you save live in this " +
                        "browser's storage — " +
                        "there is no server and no account. Another visitor " +
                        "to this address sees an empty desktop." },
                { title: "Installing is remembering a URL",
                  text: "The desktop reads the app's manifest from the " +
                        "address you paste — a fetch, not an execution — and " +
                        "shows what it says before you confirm. The app's " +
                        "code loads only when you first open it, and " +
                        "removing an app forgets the address again." },
                { title: "What an app may do",
                  text: "An installed app runs its own code in this page. " +
                        "Install what you trust, the way you would a browser " +
                        "extension — the origin is on every tile for exactly " +
                        "that reason." },
                { title: "Built on",
                  text: "SACRVM APPKIT, MIT — vendored verbatim in this " +
                        "repository; kit/VERSION names the release. Its own " +
                        "third-party notices live in the appkit repository." },
            ],
        });
        // The long version, as a link the surface itself cannot carry
        // (notice text is third-party in general, so the kit renders it
        // inert). One append, guarded — reopening resurfaces this window.
        const body = win.querySelector(".sac-about");
        if (body && !body.querySelector(".about-more")) {
            const p = document.createElement("p");
            p.className = "hint about-more";
            const a = document.createElement("a");
            a.href = "how.html";
            a.target = "_blank";
            a.rel = "noopener";
            a.textContent = "The long version — how this works, in full";
            p.appendChild(a);
            body.appendChild(p);
        }
    }

    /* --------------------------------------------------------------- host */

    /* What the desktop injects into every app's own chrome (context.host):
       the way home, the app list for the burger panel, and the home
       ribbon's controls. Data, not a subscription — so it is declared
       again whenever an input changes (install, remove, identity). An app
       already on stage keeps the snapshot it mounted with; the next one
       opened sees the new package. */

    // The key the user actually has: the palette binds mod+k, which is ⌘K
    // on a Mac and Ctrl-K everywhere else.
    const PALETTE_KEY = /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "⌘K" : "Ctrl K";

    function hostPackage() {
        const me = window.sac.identity ? sac.identity.get() : null;
        return {
            name: "SACRVM DESKTOP", icon: "cube", href: "#/",
            // The app list, the way the home grid has it — SAME apps, SAME
            // order, straight from the installed list the grid renders. Each
            // entry rides the href its tile advertises: views are hash
            // addresses, window apps are ?app= links the kit opens in place
            // on a plain click (2.3.1) — a modified/middle click keeps the
            // anchor, a new tab whose deep link opens the window there.
            nav: installed.map((m) => ({
                label: m.name,
                icon: m.icon || "cube",
                href: m.kind === "view" ? `#/${m.id}`
                                        : `?app=${encodeURIComponent(m.id)}`,
            })),
            // The home ribbon's buttons, carried into every app. The second
            // entry is the ONE "you + this desktop" control: the real avatar
            // once somebody said who they are (2.1.0's avatar form — still
            // data, the nav materializes the element), the gear until then.
            toolbar: [
                // The palette, made visible: Ctrl-K is a power feature nobody
                // can see. The button is the affordance, its tooltip teaches
                // the key — the platform's own (⌘K on a Mac), not ours.
                { icon: "search", title: `Apps & commands — ${PALETTE_KEY}`,
                  onClick: () => { if (window.sac.palette) sac.palette.open(); } },
                // The subject is IN the tooltip: injected, this button sits in
                // a ribbon that may hold the app's own info entry too, and a
                // bare label cannot say which of the two it reaches.
                { icon: "info", title: "About SACRVM DESKTOP", onClick: openInfo },
                me ? { avatar: { name: me.name, src: me.avatar || undefined },
                       title: `You: ${me.name} · Settings`, onClick: openSettings }
                   : { icon: "settings", title: "Settings", onClick: openSettings },
            ],
        };
    }

    /* Home's own ribbon eats the SAME toolbar the package injects into every
       app — no href/name, so no jump-home segment to itself. One source, one
       renderer (the kit's host-tools path), zero drift. */
    function paintHomeTools() {
        const nav = document.querySelector("#app-home sac-nav");
        if (nav) nav.host = { toolbar: hostPackage().toolbar };
    }

    /* Window apps into the Ctrl-K palette. The palette lists every registered
       route live, so view apps come free — but a window app has no route, and
       this is its summon-from-anywhere entry: Calculator over your notes,
       without leaving them. Upsert by id; ids the desktop once registered and
       no longer wants are unregistered, and the prefix keeps the desktop out
       of any app's own command namespace. */
    function syncCommands() {
        if (!window.sac || !sac.commands) return;
        const wanted = new Map(installed
            .filter((m) => m.kind !== "view")
            .map((m) => ["desktop:open:" + m.id, m]));
        sac.commands.list().forEach((c) => {
            if (c.id.startsWith("desktop:open:") && !wanted.has(c.id)) {
                sac.commands.unregister(c.id);
            }
        });
        wanted.forEach((m, id) => sac.commands.register({
            id,
            label: `Open ${m.name}`,
            icon: m.icon || "cube",
            group: "Apps",
            run: () => { refreshManifest(m.id); sac.apps.open(m.id); },
        }));
    }

    function declareHost() {
        sac.apps.init({ host: hostPackage() });
        paintHomeTools();
        syncCommands();
    }

    /* --------------------------------------------------------------- boot */

    function boot() {
        installed = load();
        // The ?app= deep link, captured before sac.apps.init() strips it —
        // arriving on it IS opening that app, so its snapshot refreshes too.
        const deepApp = new URLSearchParams(location.search).get("app");
        // Register from the stored manifests: instant, offline, and no
        // network round trip before the desktop is usable. The app's own
        // script is still only fetched when you open it.
        installed.forEach((m) => sac.apps.register(withAccent(m)));
        renderTiles();

        applyAccent(storedAccent());

        // A desktop is a place with its own files: every app's Open… /
        // Save as… (context.files) goes to one shared space in this browser,
        // with the device one click away in the same dialog. Installed
        // before init, so no app ever mounts against the plain default.
        if (sac.files) sac.files.use(sac.files.virtual());

        sac.apps.init({
            viewHost: "#app-stage",
            home: "#app-home",
            host: hostPackage(),
        });
        paintHomeTools();
        syncCommands();   // boot inits by hand, so the palette syncs by hand too
        if (deepApp) refreshManifest(deepApp);

        // Refresh-on-open, wired to every door. Views announce themselves
        // (sac:apps-changed fires on every show, deep links included). A
        // window app opens by a click on some ?app= / [data-app] anchor —
        // tile, burger entry, wherever: composedPath() sees the anchor even
        // inside sac-nav's shadow root, where retargeting hides it from
        // closest(). Observation only — the kit's own handlers do the
        // opening, and the once-per-session set absorbs the overlap.
        document.addEventListener("sac:apps-changed", (e) => {
            if (e.detail.type === "view" && e.detail.id) refreshManifest(e.detail.id);
        });
        document.addEventListener("click", (e) => {
            for (const el of e.composedPath()) {
                if (!(el instanceof HTMLElement)) continue;
                const href = el.tagName === "A" ? (el.getAttribute("href") || "") : "";
                const id = (el.dataset && el.dataset.app) ||
                    (href.startsWith("?app=") ? new URLSearchParams(href).get("app") : null);
                if (id) { refreshManifest(id); return; }
            }
        });
        // Identity is part of the package (the you-button in both ribbons).
        if (window.sac.identity) sac.identity.onChange(declareHost);

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
