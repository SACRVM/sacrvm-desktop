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
            // (tile menu) outranks the accent the manifest declares; with
            // neither, the tile stays in the desktop's palette.
            const seed = m.accentOverride || m.accent;
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
                b.textContent = "✓ " + label;   // no override = the app's own
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
            item("tint:reset", "App's own color"),
            document.createElement("hr"),
            item("remove", "Remove from this desktop", true),
        );

        menu.addEventListener("sac:select", (e) => {
            const action = e.detail.action;
            if (action === "remove") { uninstall(manifest); return; }
            if (action === "tint:reset") { setTileAccent(manifest, null); return; }
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

    /* The registry gets the manifest with the owner's recolor folded in, so
       every open path — tile click, deep link, reopen — seeds the app with
       the effective color. The stored entry keeps both: the app's own accent
       survives for "App's own color". */
    const withAccent = (m) =>
        m.accentOverride ? Object.assign({}, m, { accent: m.accentOverride }) : m;

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
            const seed = entry.accentOverride || entry.accent;
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

    /** What an app has stored here, as a sentence — or null if it stored nothing. */
    async function dataOf(manifest) {
        if (!window.sac || !sac.fs) return null;
        try {
            const { bytes, count } = await sac.fs.for(manifest.id).usage();
            if (!count) return null;
            const size = bytes < 1024 ? `${bytes} bytes`
                       : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB`
                       : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
            return { bytes, count, text: `${count} item${count === 1 ? "" : "s"}, ${size}` };
        } catch (err) {
            return null;
        }
    }

    async function uninstall(manifest) {
        // Data is a second decision, never a side effect: removing an app is
        // about this desktop, deleting what you wrote in it is about your work.
        const data = await dataOf(manifest);
        const buttons = [
            { action: "cancel", label: "Cancel", kind: "default" },
            { action: "remove", label: data ? "Remove, keep data" : "Remove", kind: "destructive" },
        ];
        if (data) buttons.push({ action: "purge", label: "Remove + delete data", kind: "destructive" });

        const answer = await sac.dialog.confirm({
            title: `Remove ${manifest.name}?`,
            message:
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
            // Said before the paste, not after the failure: this desktop can
            // only read one kind of repository, and that is not obvious.
            const scope = document.createElement("p");
            scope.className = "hint";
            scope.textContent = "SACRVM APPKIT apps only — a repository serving an app.json " +
                                "from its GitHub Pages root. Anything else has nothing to read.";
            const input = document.createElement("input");
            input.type = "url";
            input.placeholder = "https://github.com/owner/repo";
            input.setAttribute("aria-label", "App repository URL");
            input.style.width = "100%";
            // Enter submits: a one-field dialog that needs the mouse is rude.
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") { e.preventDefault(); dlg.close("read"); }
            });
            dlg.append(p, input, scope);

            dlg.addEventListener("sac:action", (e) => {
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

    /* ------------------------------------------------------------- welcome */

    /* An empty desktop is honest but unhelpful: there is nothing to click and
       nothing to learn from. So the first visit offers the two example apps —
       as an offer, with the origins visible and both boxes unticked-able, not
       as a fait accompli. Asked once; the answer is remembered either way. */

    const WELCOME_KEY = "sacrvm.desktop.welcomed";

    const EXAMPLES = [
        {
            id: "calculator",
            url: "https://github.com/SACRVM/sacrvm-calculator",
            name: "Calculator",
            icon: "calculator",
            blurb: "Four functions and a full keyboard, in a floating window.",
        },
        {
            id: "notes",
            url: "https://github.com/SACRVM/sacrvm-notes",
            name: "Notes",
            icon: "note",
            blurb: "Takes the whole stage and puts its note list in the rail.",
        },
    ];

    function welcomed() {
        try { return localStorage.getItem(WELCOME_KEY) === "1"; }
        catch (err) { return false; }
    }

    function markWelcomed() {
        try { localStorage.setItem(WELCOME_KEY, "1"); }
        catch (err) { /* asking again beats crashing */ }
    }

    /** "A and B", "A, B and C" — for a sentence, not a log line. */
    function andList(names) {
        if (names.length < 2) return names[0] || "";
        return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
    }

    async function installExamples(picks) {
        if (!picks.length) return;
        const done = [], failed = [];
        for (const pick of picks) {
            try {
                adopt(await sac.apps.inspect(pick.url));
                done.push(pick.name);
            } catch (err) {
                console.warn(`[desktop] could not install ${pick.name}:`, err);
                failed.push(pick.name);
            }
        }
        if (typeof sac.toast !== "function") return;
        if (done.length) {
            sac.toast(`${andList(done)} installed — open a tile to start.`, { kind: "success" });
        }
        if (failed.length) {
            sac.toast(`Could not reach ${andList(failed)}. The desktop is fine; that origin was not.`,
                      { kind: "error", duration: 8000 });
        }
    }

    /**
     * The first-run offer. It re-reads what is installed every time it
     * opens, so it stays truthful wherever it is opened from.
     */
    function openWelcome() {
        const dlg = document.createElement("sac-dialog");
        dlg.setAttribute("title", "New here?");

        const wrap = document.createElement("div");
        wrap.className = "welcome";
        wrap.innerHTML = `
            <p class="welcome-lead">This desktop ships empty on purpose — every
               app on it comes from somebody's repository, and you decide which.
               Shall I put two working examples on it, so there is something to
               open?</p>

            <ul class="picks">
                ${EXAMPLES.map((ex, i) => `
                    <li>
                        <label class="pick">
                            <input type="checkbox" data-pick="${i}" checked>
                            <sac-icon name="${ex.icon}"></sac-icon>
                            <span class="pick-body">
                                <span class="pick-name">${ex.name}</span>
                                <span class="pick-blurb">${ex.blurb}</span>
                                <span class="pick-origin">${ex.url.replace(/^https:\/\//, "")}</span>
                            </span>
                        </label>
                    </li>`).join("")}
            </ul>

            <p class="hint welcome-hint">They install the ordinary way: their
               manifest is read from their own Pages, nothing is copied here, and
               a tile's ⋯ menu removes them again.</p>
        `;

        if (!installed.length) {
            wrap.querySelector(".welcome-hint").insertAdjacentText("beforeend",
                " Skip this and the desktop stays empty — the tile at the end of " +
                "the grid installs anything, any time.");
        }

        // Already installed → shown, ticked off, and left alone.
        EXAMPLES.forEach((ex, i) => {
            if (!installed.some((m) => m.id === ex.id)) return;
            const box = wrap.querySelector(`[data-pick="${i}"]`);
            box.checked = false;
            box.disabled = true;
            const row = box.closest(".pick");
            row.classList.add("is-installed");
            const note = document.createElement("span");
            note.className = "pick-state";
            note.textContent = "Installed";
            row.querySelector(".pick-body").appendChild(note);
        });

        const pending = EXAMPLES.filter((ex, i) => !wrap.querySelector(`[data-pick="${i}"]`).disabled);
        if (!pending.length) {
            // Nothing left to offer: stop asking a question and answer one.
            wrap.querySelector(".welcome-lead").textContent =
                "Both examples are already on this desktop — open a tile to try them.";
            wrap.querySelector(".welcome-hint").textContent =
                "A tile's ⋯ menu removes one again, and the tile at the end of the " +
                "grid installs any other app from its repository URL.";
        } else if (pending.length < EXAMPLES.length) {
            wrap.querySelector(".welcome-lead").textContent =
                `${pending[0].name} is the example you don't have yet — shall I install it?`;
        }
        dlg.buttons = pending.length
            ? [
                { action: "skip",
                  label: installed.length ? "Not now" : "Start empty",
                  kind: "default" },
                { action: "install", label: "Install selected", kind: "primary" },
              ]
            : [{ action: "ok", label: "Got it", kind: "primary" }];

        dlg.appendChild(wrap);

        dlg.addEventListener("sac:action", (e) => {
            const picks = e.detail.action === "install"
                ? EXAMPLES.filter((ex, i) => wrap.querySelector(`[data-pick="${i}"]`).checked)
                : [];
            markWelcomed();
            // Let the dialog finish closing before tiles appear behind it.
            setTimeout(() => { dlg.remove(); installExamples(picks); }, 140);
        }, { once: true });

        document.body.appendChild(dlg);
        dlg.open();
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
            <button type="button" class="btn accent-reset" hidden>App's own color</button>
            <p class="hint accent-hint"></p>

            <label>This desktop</label>
            <p class="hint">Your apps and these settings live in this browser,
               on this device. Nobody else sees them, and there is no account
               to lose them with.</p>
            <p class="hint orphans" hidden></p>
            <div class="settings-actions">
                <button type="button" class="btn danger remove-all">Remove all apps</button>
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
        const accentReset = wrap.querySelector(".accent-reset");

        const mark = (value) => {
            const v = (value || "#3b82f6").toLowerCase();
            grid.querySelectorAll("sac-swatch").forEach((s) => {
                s.toggleAttribute("selected", s.getAttribute("value").toLowerCase() === v);
            });
            if (custom.value.toLowerCase() !== v) custom.value = v;
        };

        /* Which surface the section speaks for: null = the desktop, else the
           installed entry of the view on stage. Opened from inside an app,
           the swatches recolor THAT app — the change is visible right behind
           the dialog, and it is the same override the tile menu writes. */
        let accentCtx = null;

        function paintAccent() {
            const activeId = sac.apps.active();
            accentCtx = activeId ? installed.find((m) => m.id === activeId) || null : null;
            if (accentCtx) {
                accentLabel.textContent = `Accent — ${accentCtx.name}`;
                accentHint.textContent =
                    `This recolors ${accentCtx.name} on this desktop: the app ` +
                    `behind this dialog and its tile follow along. Your ` +
                    `desktop's own accent is set from the home screen.`;
                accentReset.hidden = !accentCtx.accentOverride;
                mark(accentCtx.accentOverride || accentCtx.accent);
            } else {
                accentLabel.textContent = "Accent";
                accentHint.textContent =
                    "One seed re-themes the whole desktop. An app that brings " +
                    "its own accent keeps it — that is the app's identity, not " +
                    "yours, unless you repaint it from its tile or from in here.";
                accentReset.hidden = true;
                mark(storedAccent() || "#3b82f6");
            }
        }

        const applyPick = (value) => {
            if (accentCtx) {
                setTileAccent(accentCtx, value);
                accentReset.hidden = !value;
                mark(value || accentCtx.accent);
            } else {
                setAccent(value);
                mark(value);
            }
        };
        // The field fires only on user changes, so this cannot loop with mark().
        grid.addEventListener("sac:change", (e) => applyPick(e.detail.value));
        custom.addEventListener("sac:change", (e) => applyPick(e.detail.value));
        accentReset.addEventListener("click", () => applyPick(null));

        wrap.querySelector(".remove-all").addEventListener("click", async () => {
            if (!installed.length) {
                if (typeof sac.toast === "function") sac.toast("Nothing installed.", { kind: "info" });
                return;
            }
            const stored = (await Promise.all(installed.map(dataOf))).filter(Boolean);
            const items = stored.reduce((n, d) => n + d.count, 0);
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

        // Recount on every opening: apps come and go between them — and the
        // accent section speaks for whatever is on stage right now.
        dlg.addEventListener("sac:open", () => { showOrphans(); fillIdentity(); paintAccent(); });
        // A dialog dismissed with Escape still means what was typed in it.
        dlg.addEventListener("sac:action", commitIdentity);
        dlg.addEventListener("sac:action", () => { /* stays in the DOM */ });

        document.body.appendChild(dlg);
        settingsDialog = dlg;
        paintAccent();
        fillIdentity();
        dlg.open();
    }

    /* --------------------------------------------------------------- info */

    /* Three short paragraphs for the three questions people actually ask.
       Everything beyond them lives on how.html — a page can scroll, a modal
       should not have to. */

    async function openInfo() {
        const answer = await sac.dialog.confirm({
            title: "How this works",
            message: [
                "This desktop is yours, and only in this browser. Apps and " +
                "settings live in this browser's storage — there is no " +
                "server and no account. Another visitor to this address " +
                "sees an empty desktop.",

                "Installing is remembering a URL. The desktop reads the " +
                "app's manifest from the address you paste — a fetch, not " +
                "an execution — and shows what it says before you confirm. " +
                "The app's code loads only when you first open it, and " +
                "removing an app forgets the address again.",

                "An installed app runs its own code in this page. Install " +
                "what you trust, the way you would a browser extension — " +
                "the origin is on every tile for exactly that reason.",
            ],
            buttons: [
                { action: "more", label: "The long version", kind: "default" },
                { action: "ok", label: "Got it", kind: "primary" },
            ],
        });
        // A new tab, so whatever is on stage stays on stage.
        if (answer === "more") window.open("how.html", "_blank", "noopener");
    }

    /* --------------------------------------------------------------- host */

    /* What the desktop injects into every app's own chrome (context.host):
       the way home, the app list for the burger panel, and the home
       ribbon's controls. Data, not a subscription — so it is declared
       again whenever an input changes (install, remove, identity). An app
       already on stage keeps the snapshot it mounted with; the next one
       opened sees the new package. */

    function hostPackage() {
        const me = window.sac.identity ? sac.identity.get() : null;
        return {
            name: "SACRVM DESKTOP", icon: "cube", href: "#/",
            // The app list, the way the home grid has it: view apps are
            // addresses, and the router already knows them all.
            nav: sac.router.routes()
                .filter((r) => r.hash !== "#/")
                .map((r) => ({ label: r.label, href: r.hash, icon: r.icon })),
            // The home ribbon's buttons, carried into every app. The second
            // entry is the SAME "you + this desktop" control as at home,
            // spoken in the kit's icon-and-label vocabulary (the injection
            // carries no avatars — yet).
            toolbar: [
                { icon: "info", title: "How this works", onClick: openInfo },
                me ? { icon: "user", label: me.name, title: `You: ${me.name} · Settings`, onClick: openSettings }
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

    function declareHost() {
        sac.apps.init({ host: hostPackage() });
        paintHomeTools();
    }

    /* --------------------------------------------------------------- boot */

    function boot() {
        installed = load();
        // Register from the stored manifests: instant, offline, and no
        // network round trip before the desktop is usable. The app's own
        // script is still only fetched when you open it.
        installed.forEach((m) => sac.apps.register(withAccent(m)));
        renderTiles();

        applyAccent(storedAccent());

        sac.apps.init({
            viewHost: "#app-stage",
            home: "#app-home",
            host: hostPackage(),
        });
        paintHomeTools();
        // Identity is part of the package (the you-button in both ribbons).
        if (window.sac.identity) sac.identity.onChange(declareHost);

        // ?install=<url> installs by link — how you hand somebody an app.
        const wanted = new URLSearchParams(location.search).get("install");
        if (wanted) {
            history.replaceState({}, document.title, location.pathname + location.hash);
            markWelcomed();                 // arrived with an app: no tour needed
            install(wanted);
            return;
        }

        // First visit, empty desktop, no app in the address: make the offer.
        // A beat after paint, so the desktop is seen before it asks anything —
        // and a timeout, not rAF, which never fires in a background tab.
        if (!installed.length && !welcomed() && !location.hash) {
            setTimeout(openWelcome, 500);
        }
    }

    if (window.sacReady) boot();
    else document.addEventListener("sac:ready", boot, { once: true });
})();
