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

    /** Register + persist + repaint. The shared tail of every install path. */
    function adopt(manifest) {
        // How big a tile is, is the desktop owner's decision, not the author's —
        // so an update (or a reinstall) inherits it instead of resetting it.
        const previous = installed.find((m) => m.id === manifest.id);
        if (previous && previous.tile && !manifest.tile) manifest.tile = previous.tile;
        sac.apps.add(manifest);
        installed = installed.filter((m) => m.id !== manifest.id).concat(manifest);
        save(installed);
        renderTiles();
    }

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
     * The first-run offer. Also reachable from the info dialog, which is why
     * it re-reads what is installed every time it opens.
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

        dlg.addEventListener("sac-dialog:action", (e) => {
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
            <p class="hint orphans" hidden></p>
            <div class="settings-actions">
                <button type="button" class="btn danger remove-all">Remove all apps</button>
                <button type="button" class="btn danger clear-orphans" hidden>Delete leftover data</button>
            </div>
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

        // Recount on every opening: apps come and go between them.
        dlg.addEventListener("sac-dialog:open", showOrphans);
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

            <h3>And what you write in them?</h3>
            <p>Also here, in this browser — each app gets its own drawer, and it can
               only reach its own. Removing an app <strong>keeps</strong> what it stored,
               so reinstalling brings your work back; the remove dialog offers to delete
               it too, and says how much there is.</p>

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

            <p class="hint">Nothing to open yet?
               <button type="button" class="link-btn examples-btn">Install the two example apps</button>
               — or, to write your own,
               <a href="https://sacrvm.github.io/sacrvm-appkit/#/build" target="_blank" rel="noopener">read
               how an app is built</a>: a manifest, one custom element, and a
               template repository to start from.</p>
        `;
        dlg.appendChild(wrap);

        wrap.querySelector(".examples-btn").addEventListener("click", () => {
            dlg.close(null);
            setTimeout(openWelcome, 140);
        });

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
