/**
 * <sac-launcher>  —  User-composed launcher tile grid.
 *
 * Renders one tile per app registered in `sac.apps` (kit/js/lib/apps.js),
 * merged with a per-user layer persisted in localStorage: tile order, hidden
 * apps, and user-added ("custom") apps. The host page registers the built-in
 * apps; the user rearranges, hides and extends them — the launcher is theirs.
 *
 * LIGHT-DOM EXCEPTION: this component intentionally renders into the light
 * DOM, not a shadow root. It is a layout-level pattern host, not a leaf
 * widget: it composes the global `.grid` / `.tile` launcher CSS patterns from
 * ui.css and hosts other sac-* elements inside its tiles. Its few own rules
 * are injected once into document.head, scoped under the `sac-launcher` tag
 * and `.sac-launcher-*` classes.
 *
 * Usage:
 *   <sac-launcher storage="demo-hub"></sac-launcher>
 *
 *   sac.apps.register({ id: "notes", name: "Notes", icon: "note",
 *                       kind: "window", tag: "app-notes", src: "apps/notes.js" });
 *   document.querySelector("sac-launcher").refresh();   // if registered late
 *
 * Attributes:
 *   storage — suffix of the localStorage key `sac.launcher.<storage>` holding
 *             { v: 1, order: [ids], hidden: [ids], custom: [manifests] }.
 *             Without the attribute: pure render of the registry — no
 *             persistence, no edit mode. Persisted ids that no longer exist
 *             are ignored and only dropped from storage the next time the
 *             user changes something. `custom` manifests are (re)registered
 *             into sac.apps on connect — they are the user-added apps.
 *   edit    — presence = edit mode. Toggled by the Edit button; settable by
 *             hand. Ignored (removed) when there is no `storage`.
 *
 * Methods:
 *   refresh() — re-read sac.apps.list() and re-sync the grid in place. The
 *               component re-syncs itself on every "sac:apps-changed" the
 *               runtime emits (and on DOMContentLoaded), so registering apps
 *               after it connected just works; refresh() remains for hosts
 *               that mutate state outside sac.apps.
 *
 * Events:
 *   sac:launcher-change — detail { order, hidden, customCount } after every
 *                         user change (move / hide / show / add / remove).
 *                         Bubbles + composed.
 *
 * Tiles:
 *   kind:"page" apps render as real <a> links; kind:"window" apps render as
 *   real <button> tiles calling sac.apps.open(id). Two optional manifest
 *   fields shape a tile: `badge` (short string — the tile's corner pill,
 *   rendered with the global .tile-badge pattern from ui.css) and `tile`
 *   ("medium" default | "wide" spans 2 grid columns | "large" spans 2
 *   columns AND 2 rows; unknown values fall back to medium silently). All
 *   footprints collapse to medium on narrow viewports (≤768px), matching
 *   the .grid pattern. In edit mode each tile grows keyboard-reachable
 *   controls: move left / move right / hide (or show, on grayed hidden
 *   tiles) and — for custom apps only — remove; the badge hides while
 *   editing so the controls own the corner. Built-in (host-registered)
 *   apps can only be hidden, never removed.
 *   A dashed "Add app" tile opens a <sac-dialog> form: name, icon, tag,
 *   script URL, width, height. The form stays lean by design — user-added
 *   apps are always medium tiles with no badge.
 *
 * Portability note: the "Add app" script URL may be a full cross-origin URL —
 * sac.apps injects it as a classic <script> tag, and classic script tags need
 * no CORS. Any origin serving a guarded single-tag web component (the app
 * contract) can be pulled into a user's launcher.
 */
(function () {

    /** Kit i18n: sac.t when globals.js is loaded, the English fallback when
     *  the component runs standalone. */
    const t = (key, fallback) =>
        (window.sac && window.sac.t) ? window.sac.t(key, fallback) : fallback;

class SacLauncher extends HTMLElement {
    static get observedAttributes() { return ["storage", "edit"]; }

    constructor() {
        super();
        this._state = { order: [], hidden: [], custom: [] }; // persisted layer
        this._order = [];        // effective full order (known ids only)
        this._tiles = new Map(); // id → cell element
        this._grid = null;
        this._dialog = null;
        this._form = null;
        this._formEl = null;
        this._warned = false;
        this._uid = `sac-launcher-${SacLauncher._instances++}`;
        this._onReady = this._onReady.bind(this);
        this._onDialogKeydown = this._onDialogKeydown.bind(this);
    }

    connectedCallback() {
        if (!this._grid) this._build();
        // Host pages typically register their apps in a DOMContentLoaded
        // handler — i.e. AFTER this component (a deferred script) upgraded.
        // The runtime emits "sac:apps-changed" on every register/remove;
        // re-syncing on it makes registration order irrelevant. The
        // DOMContentLoaded re-sync stays as belt and braces.
        document.addEventListener("sac:apps-changed", this._onReady);
        if (document.readyState !== "complete") {
            document.addEventListener("DOMContentLoaded", this._onReady);
        }
        this._loadState();
        this._sync();
        this._syncEditUI();
    }

    disconnectedCallback() {
        document.removeEventListener("sac:apps-changed", this._onReady);
        document.removeEventListener("DOMContentLoaded", this._onReady);
        document.removeEventListener("keydown", this._onDialogKeydown, true);
        if (this._dialog) { this._dialog.remove(); this._dialog = null; }
    }

    attributeChangedCallback(name, oldV, newV) {
        if (!this._grid || oldV === newV) return;
        if (name === "storage") {
            this._loadState();
            this._sync();
            this._syncEditUI();
        } else if (name === "edit") {
            this._syncEditUI();
        }
    }

    /** Re-read the registry and re-sync the grid (targeted updates only). */
    refresh() { this._sync(); }

    _onReady() { this.refresh(); }

    /* ------------------------------------------------------------------ */
    /* Build (once)                                                        */
    /* ------------------------------------------------------------------ */

    _build() {
        SacLauncher._injectStyles();
        this.textContent = "";

        this._grid = document.createElement("div");
        this._grid.className = "grid";

        // The dashed "Add app" tile — always last in the grid, edit mode only.
        this._addCell = document.createElement("div");
        this._addCell.className = "sac-launcher-cell sac-launcher-add-cell";
        this._addBtn = document.createElement("button");
        this._addBtn.type = "button";
        this._addBtn.className = "tile sac-launcher-add";
        const addIcon = document.createElement("sac-icon");
        addIcon.setAttribute("name", "plus");
        const addLabel = document.createElement("span");
        addLabel.textContent = t("launcher.add-app", "Add app");
        this._addBtn.append(addIcon, addLabel);
        this._addBtn.addEventListener("click", () => this._openAddDialog());
        this._addCell.appendChild(this._addBtn);
        this._grid.appendChild(this._addCell);

        this._empty = document.createElement("p");
        this._empty.className = "sac-launcher-empty";
        this._empty.textContent = t("launcher.no-apps", "No apps registered.");
        this._empty.hidden = true;

        this._footer = document.createElement("div");
        this._footer.className = "sac-launcher-footer";
        this._editBtn = document.createElement("button");
        this._editBtn.type = "button";
        this._editBtn.className = "btn sac-launcher-edit";
        this._editBtn.textContent = t("launcher.edit", "Edit");
        this._editBtn.setAttribute("aria-pressed", "false");
        this._editBtn.addEventListener("click", () => this.toggleAttribute("edit"));
        this._footer.appendChild(this._editBtn);

        this.append(this._grid, this._empty, this._footer);
    }

    /* ------------------------------------------------------------------ */
    /* Persistence                                                         */
    /* ------------------------------------------------------------------ */

    _storageKey() {
        const s = this.getAttribute("storage");
        return s ? `sac.launcher.${s}` : null;
    }

    _canEdit() { return this._storageKey() !== null; }

    _loadState() {
        this._state = { order: [], hidden: [], custom: [] };
        const key = this._storageKey();
        if (!key) return;
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const data = JSON.parse(raw);
                if (data && data.v === 1) {
                    if (Array.isArray(data.order))
                        this._state.order = data.order.filter(x => typeof x === "string");
                    if (Array.isArray(data.hidden))
                        this._state.hidden = data.hidden.filter(x => typeof x === "string");
                    if (Array.isArray(data.custom))
                        this._state.custom = data.custom.filter(m =>
                            m && typeof m === "object" && typeof m.id === "string");
                }
            }
        } catch (err) {
            console.warn(`[sac-launcher] could not read ${key}:`, err);
        }
        // Custom manifests are the user's own apps — put them (back) into the
        // registry so sac.apps can open and deep-link them.
        if (window.sac && sac.apps) {
            this._state.custom.forEach(m => sac.apps.register(Object.assign({}, m)));
        }
    }

    _persist() {
        const key = this._storageKey();
        if (!key) return;
        // Stale ids (apps no longer registered) drop out here — on a user
        // change, never proactively on load.
        const known = new Set(this._apps().map(m => m.id));
        this._state.order = this._order.filter(id => known.has(id));
        this._state.hidden = this._state.hidden.filter(id => known.has(id));
        try {
            localStorage.setItem(key, JSON.stringify({
                v: 1,
                order: this._state.order,
                hidden: this._state.hidden,
                custom: this._state.custom,
            }));
        } catch (err) {
            console.warn(`[sac-launcher] could not write ${key}:`, err);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Registry → grid sync (in place)                                     */
    /* ------------------------------------------------------------------ */

    _apps() {
        if (!window.sac || !sac.apps) {
            if (!this._warned) {
                this._warned = true;
                console.warn("[sac-launcher] sac.apps is not loaded — load kit/js/lib/apps.js before the components.");
            }
            return [];
        }
        return sac.apps.list();
    }

    _sync() {
        const apps = this._apps();
        const byId = new Map(apps.map(m => [m.id, m]));

        // Effective order: persisted order (known ids only, stale ids
        // ignored), then any registry entries not yet ordered, appended in
        // registration order.
        const ordered = this._state.order.filter(id => byId.has(id));
        const seen = new Set(ordered);
        apps.forEach(m => { if (!seen.has(m.id)) ordered.push(m.id); });
        this._order = ordered;

        // Drop tiles whose app disappeared (or whose kind changed).
        for (const [id, cell] of Array.from(this._tiles)) {
            const m = byId.get(id);
            const kind = m && m.kind === "page" ? "page" : "window";
            if (!m || cell._kind !== kind) {
                cell.remove();
                this._tiles.delete(id);
            }
        }

        // Create missing tiles, update all in place.
        const customIds = new Set(this._state.custom.map(m => m.id));
        const hidden = new Set(this._state.hidden);
        this._order.forEach((id, i) => {
            const m = byId.get(id);
            let cell = this._tiles.get(id);
            if (!cell) {
                cell = this._makeCell(m);
                this._tiles.set(id, cell);
            }
            this._updateCell(cell, m, {
                hidden: hidden.has(id),
                custom: customIds.has(id),
                first: i === 0,
                last: i === this._order.length - 1,
            });
        });

        // Minimal reorder: only nodes actually out of place are moved, so an
        // untouched tile (and any focus inside it) is never disturbed.
        const desired = this._order.map(id => this._tiles.get(id));
        desired.push(this._addCell);
        let cursor = this._grid.firstElementChild;
        for (const cell of desired) {
            if (cell === cursor) cursor = cursor.nextElementSibling;
            else this._grid.insertBefore(cell, cursor);
        }

        // In edit mode the Add tile is visible, so the empty hint would lie.
        this._empty.hidden = this._order.length > 0 || this.hasAttribute("edit");
    }

    _makeCell(m) {
        const id = m.id;
        const kind = m.kind === "page" ? "page" : "window";

        // Cell wrapper: the tile is a real link/button and the edit controls
        // are real buttons NEXT to it (absolutely positioned on top) — never
        // interactive elements nested inside an interactive element.
        const cell = document.createElement("div");
        cell.className = "sac-launcher-cell";
        cell.dataset.id = id;
        cell._kind = kind;

        let tile;
        if (kind === "page") {
            tile = document.createElement("a");
            tile.className = "tile sac-launcher-tile";
        } else {
            tile = document.createElement("button");
            tile.type = "button";
            tile.className = "tile tile-window sac-launcher-tile";
        }
        tile.addEventListener("click", (e) => {
            if (this.hasAttribute("edit")) { e.preventDefault(); return; }
            if (kind === "window") {
                e.preventDefault();
                // The runtime reports load failures itself (console + toast).
                if (window.sac && sac.apps) sac.apps.open(id).catch(() => {});
            }
        });

        // Corner pill — the global .tile-badge pattern from ui.css, in its
        // accent variant (the plain one is the danger-tinted warning pill).
        // Kept in the DOM and toggled via [hidden] so a re-registered
        // manifest can add or drop its badge without a rebuild.
        cell._badge = document.createElement("span");
        cell._badge.className = "tile-badge accent";
        cell._badge.hidden = true;

        cell._icon = document.createElement("sac-icon");
        const body = document.createElement("div");
        body.className = "sac-launcher-tile-body";
        cell._h = document.createElement("h2");
        cell._p = document.createElement("p");
        body.append(cell._h, cell._p);
        tile.append(cell._badge, cell._icon, body);
        cell._tile = tile;
        cell.appendChild(tile);

        const controls = document.createElement("span");
        controls.className = "sac-launcher-controls";
        const mk = (cls, iconName, handler) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = `sac-launcher-ctrl ${cls}`;
            const ic = document.createElement("sac-icon");
            ic.setAttribute("name", iconName);
            b.appendChild(ic);
            b.addEventListener("click", handler);
            controls.appendChild(b);
            return b;
        };
        cell._left = mk("left", "chevron-left", () => {
            this._move(id, -1);
            this._moveFocus(cell, -1);
        });
        cell._right = mk("right", "chevron-right", () => {
            this._move(id, +1);
            this._moveFocus(cell, +1);
        });
        cell._vis = mk("vis", "eye-off", () => this._toggleHidden(id));
        cell._del = mk("del", "trash", () => this._removeCustom(id));
        cell.appendChild(controls);
        return cell;
    }

    _updateCell(cell, m, f) {
        const name = m.name || m.id;
        cell._icon.setAttribute("name", m.icon || "shapes");
        cell._h.textContent = name;
        cell._p.textContent = m.description || "";
        cell._p.hidden = !m.description;
        if (cell._kind === "page") cell._tile.setAttribute("href", m.href || "#");
        cell.classList.toggle("hidden-app", f.hidden);
        cell.classList.toggle("custom-app", f.custom);

        const badge = m.badge == null ? "" : String(m.badge).trim();
        cell._badge.textContent = badge;
        cell._badge.hidden = !badge;

        // Manifest-declared footprint; unknown values fall back to medium.
        cell.classList.toggle("size-wide", m.tile === "wide");
        cell.classList.toggle("size-large", m.tile === "large");

        cell._left.disabled = f.first;
        cell._left.setAttribute("aria-label",
            t("launcher.move-left", "Move {name} left").replace("{name}", name));
        cell._right.disabled = f.last;
        cell._right.setAttribute("aria-label",
            t("launcher.move-right", "Move {name} right").replace("{name}", name));
        cell._vis.querySelector("sac-icon").setAttribute("name", f.hidden ? "eye" : "eye-off");
        cell._vis.setAttribute("aria-label", (f.hidden
            ? t("launcher.show", "Show {name}")
            : t("launcher.hide", "Hide {name}")).replace("{name}", name));
        cell._del.hidden = !f.custom; // built-ins can only be hidden, never removed
        cell._del.setAttribute("aria-label",
            t("launcher.remove", "Remove {name}").replace("{name}", name));

        // In edit mode the tiles themselves are inert; keyboard focus goes
        // straight to the controls.
        if (this.hasAttribute("edit")) cell._tile.setAttribute("tabindex", "-1");
        else cell._tile.removeAttribute("tabindex");
    }

    _syncEditUI() {
        if (this.hasAttribute("edit") && !this._canEdit()) {
            this.removeAttribute("edit"); // no storage → no edit mode
            return;
        }
        const editing = this.hasAttribute("edit");
        this._footer.hidden = !this._canEdit();
        this._empty.hidden = this._order.length > 0 || editing;
        this._editBtn.textContent = editing ? t("launcher.done", "Done") : t("launcher.edit", "Edit");
        this._editBtn.setAttribute("aria-pressed", String(editing));
        this._tiles.forEach(cell => {
            if (editing) cell._tile.setAttribute("tabindex", "-1");
            else cell._tile.removeAttribute("tabindex");
        });
    }

    /* ------------------------------------------------------------------ */
    /* User changes                                                        */
    /* ------------------------------------------------------------------ */

    _move(id, delta) {
        const i = this._order.indexOf(id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= this._order.length) return;
        [this._order[i], this._order[j]] = [this._order[j], this._order[i]];
        this._state.order = this._order.slice();
        this._afterChange();
    }

    _moveFocus(cell, dir) {
        // Reordering moves the cell in the DOM, which drops focus — put it
        // back on the pressed control (or its counterpart at the boundary).
        const btn = dir < 0 ? cell._left : cell._right;
        (btn.disabled ? (dir < 0 ? cell._right : cell._left) : btn).focus();
    }

    _toggleHidden(id) {
        const i = this._state.hidden.indexOf(id);
        if (i >= 0) this._state.hidden.splice(i, 1);
        else this._state.hidden.push(id);
        this._afterChange();
    }

    _removeCustom(id) {
        const i = this._state.custom.findIndex(m => m.id === id);
        if (i < 0) return; // built-in — only hideable
        this._state.custom.splice(i, 1);
        this._state.hidden = this._state.hidden.filter(x => x !== id);
        this._state.order = this._state.order.filter(x => x !== id);
        if (window.sac && sac.apps) sac.apps.remove(id);
        this._afterChange();
    }

    _afterChange() {
        this._sync();
        this._persist();
        this.dispatchEvent(new CustomEvent("sac:launcher-change", {
            bubbles: true,
            composed: true,
            detail: {
                order: this._order.slice(),
                hidden: this._state.hidden.slice(),
                customCount: this._state.custom.length,
            },
        }));
    }

    /* ------------------------------------------------------------------ */
    /* Add-app dialog                                                      */
    /* ------------------------------------------------------------------ */

    _openAddDialog() {
        if (!this._dialog) this._buildDialog();
        if (typeof this._dialog.open !== "function") {
            console.warn("[sac-launcher] <sac-dialog> is not loaded.");
            return;
        }
        this._clearFormErrors();
        this._showDialog();
    }

    _showDialog() {
        // Our keydown listener must register BEFORE the dialog's own (both
        // capture on document; same node fires in registration order) so we
        // can extend its focus trap across the form inputs.
        document.addEventListener("keydown", this._onDialogKeydown, true);
        this._dialog.open();
        const firstBad = this._formEl.querySelector('[aria-invalid="true"]');
        (firstBad || this._form.name).focus();
    }

    _buildDialog() {
        const dlg = document.createElement("sac-dialog");
        dlg.setAttribute("title", t("launcher.add-app", "Add app"));
        dlg.buttons = [
            { action: "cancel", label: t("launcher.cancel", "Cancel"), kind: "default" },
            { action: "add", label: t("launcher.add", "Add"), kind: "primary" },
        ];

        this._form = {};
        const form = document.createElement("div");
        form.className = "sac-launcher-form";

        const hint = document.createElement("p");
        hint.className = "sac-launcher-form-hint";
        hint.textContent = t("launcher.add-hint",
            "The script is loaded on first open and must define the tag. Any URL works — including other sites.");
        form.appendChild(hint);

        this._formError = document.createElement("p");
        this._formError.className = "sac-launcher-form-error";
        this._formError.setAttribute("role", "alert");
        this._formError.hidden = true;
        form.appendChild(this._formError);

        const field = (key, labelText, placeholder) => {
            const wrap = document.createElement("div");
            const lab = document.createElement("label");
            lab.htmlFor = `${this._uid}-${key}`;
            lab.textContent = labelText;
            const inp = document.createElement("input");
            inp.type = "text";
            inp.id = `${this._uid}-${key}`;
            inp.placeholder = placeholder;
            wrap.append(lab, inp);
            this._form[key] = inp;
            return wrap;
        };
        form.append(
            field("name", t("launcher.field-name", "Name"),
                          t("launcher.placeholder-name", "My App")),
            field("icon", t("launcher.field-icon", "Icon"),
                          t("launcher.placeholder-icon", "shapes (a sac-icon name)")),
            field("tag",  t("launcher.field-tag", "Tag"),
                          t("launcher.placeholder-tag", "app-my-app")),
            field("src",  t("launcher.field-src", "Script URL"),
                          t("launcher.placeholder-src", "apps/my-app.js or https://…")),
        );
        const row = document.createElement("div");
        row.className = "sac-launcher-form-row";
        row.append(
            field("width",  t("launcher.field-width", "Width"),
                            t("launcher.placeholder-width", "500px")),
            field("height", t("launcher.field-height", "Height"),
                            t("launcher.placeholder-height", "600px")));
        form.appendChild(row);

        dlg.appendChild(form);
        document.body.appendChild(dlg);
        dlg.addEventListener("sac-dialog:action", (e) => this._onDialogAction(e.detail.action));
        this._dialog = dlg;
        this._formEl = form;
    }

    _onDialogKeydown(e) {
        const dlg = this._dialog;
        if (!dlg || !dlg.hasAttribute("open")) return;
        const active = document.activeElement;
        const inForm = this._formEl.contains(active);

        if (e.key === "Enter" && inForm && active.tagName === "INPUT") {
            e.preventDefault();
            e.stopImmediatePropagation();
            dlg.close("add");
            return;
        }
        if (e.key !== "Tab") return;

        // Extend the dialog's focus trap (it only knows its own shadow
        // buttons) to a ring of: form inputs → dialog buttons → form inputs.
        const inputs = Array.from(this._formEl.querySelectorAll("input"));
        const btns = dlg.shadowRoot
            ? Array.from(dlg.shadowRoot.querySelectorAll(".btn"))
            : [];
        const ring = inputs.concat(btns);
        if (ring.length === 0) return;
        let idx = ring.indexOf(active);
        if (idx < 0 && dlg.shadowRoot) idx = ring.indexOf(dlg.shadowRoot.activeElement);
        e.preventDefault();
        e.stopImmediatePropagation(); // the dialog's own trap must not also fire
        let next;
        if (e.shiftKey) next = ring[(idx <= 0 ? ring.length : idx) - 1];
        else next = ring[(idx + 1) % ring.length];
        next.focus();
    }

    _onDialogAction(action) {
        document.removeEventListener("keydown", this._onDialogKeydown, true);
        if (action !== "add") {
            if (this.hasAttribute("edit")) this._addBtn.focus();
            return;
        }

        const f = this._form;
        const name = f.name.value.trim();
        const tag = f.tag.value.trim().toLowerCase();
        const src = f.src.value.trim();
        const badName = !name;
        const badTag = !tag || !tag.includes("-") || /\s/.test(tag);
        const badSrc = !src;

        this._clearFormErrors();
        if (badName || badTag || badSrc) {
            const problems = [];
            if (badName) { problems.push(t("launcher.error-name", "a name")); f.name.setAttribute("aria-invalid", "true"); }
            if (badTag) { problems.push(t("launcher.error-tag", "a tag containing a dash")); f.tag.setAttribute("aria-invalid", "true"); }
            if (badSrc) { problems.push(t("launcher.error-src", "a script URL")); f.src.setAttribute("aria-invalid", "true"); }
            this._formError.textContent = t("launcher.error-needs", "An app needs {problems}.")
                .replace("{problems}", problems.join(", "));
            this._formError.hidden = false;
            // Re-open immediately (same task, no repaint between) — the form
            // and its values are light DOM and survive untouched.
            this._showDialog();
            return;
        }

        const size = (v) => {
            v = v.trim();
            if (!v) return null;
            return /^\d+(\.\d+)?$/.test(v) ? `${v}px` : v;
        };
        const manifest = {
            id: this._uniqueId(name),
            name,
            icon: f.icon.value.trim() || "shapes",
            kind: "window",
            tag,
            src,
        };
        const w = size(f.width.value);
        const h = size(f.height.value);
        if (w) manifest.width = w;
        if (h) manifest.height = h;

        if (window.sac && sac.apps) sac.apps.register(Object.assign({}, manifest));
        this._state.custom.push(manifest);
        this._afterChange();
        this._resetForm();
        if (this.hasAttribute("edit")) this._addBtn.focus();
    }

    _clearFormErrors() {
        if (!this._formEl) return;
        this._formError.hidden = true;
        this._formError.textContent = "";
        this._formEl.querySelectorAll("[aria-invalid]").forEach(inp =>
            inp.removeAttribute("aria-invalid"));
    }

    _resetForm() {
        Object.values(this._form).forEach(inp => { inp.value = ""; });
        this._clearFormErrors();
    }

    _uniqueId(name) {
        const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "app";
        const taken = (x) =>
            (window.sac && sac.apps && sac.apps.get(x) !== null) ||
            this._state.custom.some(m => m.id === x);
        let id = base;
        let n = 2;
        while (taken(id)) id = `${base}-${n++}`;
        return id;
    }

    /* ------------------------------------------------------------------ */
    /* Styles (injected once, scoped by tag/class — light-DOM component)   */
    /* ------------------------------------------------------------------ */

    static _injectStyles() {
        if (document.getElementById("sac-launcher-styles")) return;
        const style = document.createElement("style");
        style.id = "sac-launcher-styles";
        style.textContent = `
            sac-launcher { display: block; }

            sac-launcher .sac-launcher-cell { position: relative; }
            sac-launcher .sac-launcher-cell > .tile { width: 100%; height: 100%; }

            /* Manifest-declared footprint (tile: "wide" | "large"). Spans sit
               on the cell — the grid child — so everything positioned against
               the cell (tile, badge, edit controls) covers the full area for
               free. .grid's auto-rows make the large tile's second row real. */
            sac-launcher .sac-launcher-cell.size-wide,
            sac-launcher .sac-launcher-cell.size-large { grid-column: span 2; }
            sac-launcher .sac-launcher-cell.size-large { grid-row: span 2; }
            @media (max-width: 768px) {
                /* Narrow viewports: every footprint collapses to medium,
                   matching the .grid pattern's own .tile.large collapse. */
                sac-launcher .sac-launcher-cell.size-wide,
                sac-launcher .sac-launcher-cell.size-large {
                    grid-column: span 1;
                    grid-row: span 1;
                }
            }

            /* Badge: markup comes from ui.css's .tile-badge; only the toggle
               is ours. In edit mode the move/hide controls own the corner. */
            sac-launcher .tile-badge[hidden] { display: none; }
            sac-launcher[edit] .tile-badge { display: none; }
            sac-launcher button.tile { text-align: left; font-size: inherit; }
            sac-launcher .sac-launcher-tile:focus-visible,
            sac-launcher .sac-launcher-add:focus-visible {
                outline: 2px solid var(--accent);
                outline-offset: 2px;
            }

            /* Hidden apps: gone in normal mode, grayed in edit mode. */
            sac-launcher:not([edit]) .sac-launcher-cell.hidden-app { display: none; }
            sac-launcher[edit] .hidden-app .sac-launcher-tile {
                opacity: 0.45;
                filter: grayscale(1);
            }

            /* Edit mode: the tile itself goes inert — no launch affordance. */
            sac-launcher[edit] .sac-launcher-tile { cursor: default; }
            sac-launcher[edit] .sac-launcher-tile:hover {
                transform: none;
                box-shadow: none;
                border-color: var(--border-strong);
                background: var(--tile);
            }
            sac-launcher[edit] .tile-window.sac-launcher-tile:hover {
                background: color-mix(in srgb, var(--glass-hue) 60%, transparent);
            }
            sac-launcher[edit] .sac-launcher-tile:hover sac-icon { transform: none; }

            /* Per-tile edit controls. */
            sac-launcher .sac-launcher-controls {
                position: absolute;
                top: 12px;
                right: 12px;
                display: none;
                gap: 4px;
            }
            sac-launcher[edit] .sac-launcher-controls { display: flex; }
            sac-launcher .sac-launcher-ctrl {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                padding: 0;
                border: 1px solid var(--border-strong);
                border-radius: var(--radius-m);
                background: var(--glass-strong);
                color: var(--text-muted);
                cursor: pointer;
                --icon-size: 14px;
                transition: background 120ms, color 120ms, border-color 120ms;
            }
            sac-launcher .sac-launcher-ctrl:hover:not(:disabled) {
                background: var(--hover-strong);
                color: var(--text);
            }
            sac-launcher .sac-launcher-ctrl.del:hover:not(:disabled) {
                background: color-mix(in srgb, var(--danger) 12%, transparent);
                color: var(--danger);
                border-color: color-mix(in srgb, var(--danger) 30%, transparent);
            }
            sac-launcher .sac-launcher-ctrl:focus-visible {
                outline: 2px solid var(--accent);
                outline-offset: 2px;
            }
            sac-launcher .sac-launcher-ctrl:disabled { opacity: 0.3; cursor: not-allowed; }
            sac-launcher .sac-launcher-ctrl[hidden] { display: none; }

            /* The dashed "Add app" tile (edit mode only). */
            sac-launcher .sac-launcher-add-cell { display: none; }
            sac-launcher[edit] .sac-launcher-add-cell { display: block; }
            sac-launcher .sac-launcher-add {
                align-items: center;
                justify-content: center;
                gap: 0.6rem;
                background: transparent;
                border: 1px dashed var(--border-strong);
                color: var(--text-muted);
                font-weight: 600;
                font-size: 0.95rem;
            }
            sac-launcher .sac-launcher-add sac-icon {
                margin-bottom: 0;
                color: var(--text-muted);
                --icon-size: 32px;
            }
            sac-launcher .sac-launcher-add:hover {
                transform: none;
                box-shadow: none;
                background: var(--hover);
                border-color: var(--accent);
                color: var(--accent);
            }
            sac-launcher .sac-launcher-add:hover sac-icon {
                transform: none;
                color: var(--accent);
            }

            /* Footer: the unobtrusive Edit toggle. */
            sac-launcher .sac-launcher-footer {
                display: flex;
                justify-content: flex-end;
                margin-top: 1rem;
            }
            sac-launcher .sac-launcher-footer[hidden] { display: none; }
            sac-launcher .sac-launcher-edit {
                width: auto;
                padding: 0.4rem 0.9rem;
                color: var(--text-muted);
            }
            sac-launcher .sac-launcher-edit:hover:not(:disabled) { color: var(--text); }
            sac-launcher[edit] .sac-launcher-edit {
                color: var(--accent);
                background: var(--accent-tint);
                border-color: color-mix(in srgb, var(--accent) 35%, transparent);
            }

            sac-launcher .sac-launcher-empty {
                color: var(--text-dim);
                font-size: 0.9rem;
                margin: 0.5rem 0 0;
            }

            /* Add-app form (slotted into <sac-dialog>, lives in light DOM). */
            .sac-launcher-form {
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding-top: 4px;
            }
            .sac-launcher-form-row { display: flex; gap: 12px; }
            .sac-launcher-form-row > div { flex: 1; }
            .sac-launcher-form-hint {
                margin: 0;
                color: var(--text-dim);
                font-size: 0.8rem;
            }
            .sac-launcher-form-error {
                margin: 0;
                color: var(--danger-text);
                font-size: 0.85rem;
            }
            .sac-launcher-form-error[hidden] { display: none; }
            .sac-launcher-form input[aria-invalid="true"] { border-color: var(--danger); }

            @media (prefers-reduced-motion: reduce) {
                sac-launcher .sac-launcher-ctrl,
                sac-launcher .sac-launcher-edit,
                sac-launcher .sac-launcher-add { transition: none; }
            }
        `;
        document.head.appendChild(style);
    }
}
SacLauncher._instances = 0;

customElements.define("sac-launcher", SacLauncher);
})();
