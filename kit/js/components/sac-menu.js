/**
 * <sac-menu>
 *   <button slot="trigger" class="btn" style="width:auto">Actions</button>
 *   <button data-action="rename"><sac-icon name="pencil"></sac-icon> Rename</button>
 *   <button data-action="duplicate"><sac-icon name="copy"></sac-icon> Duplicate</button>
 *   <hr>
 *   <button data-action="delete" data-danger><sac-icon name="trash"></sac-icon> Delete</button>
 * </sac-menu>
 *
 * Dropdown menu — the `.floating-menu` CSS recipe with behavior attached.
 * Trigger and items both live in the light DOM (slotted) so apps can put any
 * markup inside them; the component only positions, styles and wires them.
 *
 * The panel is `position: fixed` and anchored to the trigger's viewport rect
 * on open, so it is never clipped by an `overflow: hidden` ancestor. It flips
 * above the trigger when there is no room below, is clamped 8px inside the
 * viewport, and re-anchors on scroll/resize while open.
 *
 * Items are plain <button data-action="…"> elements — an <hr> between them
 * draws a separator, `data-danger` tints the hover state red. Anything else
 * you slot (headers, spans) is left alone.
 *
 * Attributes:
 *   open — presence = panel visible. Reflected by open()/close()/toggle();
 *          settable directly (the panel positions itself either way).
 *
 * Methods:
 *   open() / close() / toggle() — show, hide, flip.
 *
 * Events:
 *   sac:menu-select — detail { action } — the clicked item's data-action.
 *                     Bubbles + composed. The menu closes right after.
 *
 * Slots:
 *   trigger — the element that opens the menu (a .btn, an icon button, …).
 *             Gets aria-haspopup / aria-expanded kept in sync.
 *   (default) — menu items and separators.
 *
 * Keyboard (while open):
 *   ArrowDown / ArrowUp — move focus between items (wraps, skips [disabled])
 *   Enter               — activates the focused item (native button click)
 *   Escape              — closes and returns focus to the trigger
 *   Tab                 — closes and lets focus move on
 */
class SacMenu extends HTMLElement {
    static get observedAttributes() { return ["open"]; }

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this._onDocPointer = this._onDocPointer.bind(this);
        this._onDocKeydown = this._onDocKeydown.bind(this);
        this._onReposition = this._onReposition.bind(this);
    }

    connectedCallback() {
        if (!this.shadowRoot.firstChild) this._render();
        document.addEventListener("pointerdown", this._onDocPointer, true);
        document.addEventListener("keydown", this._onDocKeydown, true);
        window.addEventListener("scroll", this._onReposition, true);
        window.addEventListener("resize", this._onReposition);
        this._syncTrigger();
        if (this.hasAttribute("open")) this._position();
    }

    disconnectedCallback() {
        document.removeEventListener("pointerdown", this._onDocPointer, true);
        document.removeEventListener("keydown", this._onDocKeydown, true);
        window.removeEventListener("scroll", this._onReposition, true);
        window.removeEventListener("resize", this._onReposition);
    }

    attributeChangedCallback() {
        if (!this.shadowRoot.firstChild) return;   // pre-upgrade attribute
        this._syncTrigger();
        if (this.hasAttribute("open")) this._position();
        else this._clearHighlight();
    }

    /* ---------------------------------------------------------------- API */

    open() {
        if (this.hasAttribute("open")) return;
        this.setAttribute("open", "");             // → attributeChangedCallback positions
    }

    close() {
        if (!this.hasAttribute("open")) return;
        this.removeAttribute("open");
    }

    toggle() {
        if (this.hasAttribute("open")) this.close();
        else this.open();
    }

    /* ------------------------------------------------------------- render */

    _render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: inline-flex;
                }
                .trigger {
                    display: inline-flex;
                }
                /* The .floating-menu recipe, re-implemented in the shadow root
                   (global classes do not pierce shadow boundaries). */
                .panel {
                    position: fixed;
                    top: 0;
                    left: 0;
                    z-index: 9999;                 /* same layer as sac-chip-input's dropdown */
                    min-width: 180px;
                    background: var(--glass-strong);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid var(--border-strong);
                    border-radius: var(--radius-l);
                    padding: 6px;
                    box-shadow: var(--shadow-2);
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    user-select: none;
                    /* Custom properties inherit through the flattened tree, so
                       this sizes <sac-icon> inside slotted items. */
                    --icon-size: 16px;

                    opacity: 0;
                    visibility: hidden;            /* keeps items out of the tab order while closed */
                    transform: translateY(-4px);
                    transition: opacity 120ms var(--ease-smooth),
                                transform 120ms var(--ease-smooth),
                                visibility 120ms var(--ease-smooth);
                }
                :host([open]) .panel {
                    opacity: 1;
                    visibility: visible;
                    transform: translateY(0);
                }
                @media (prefers-reduced-motion: reduce) {
                    .panel,
                    :host([open]) .panel {
                        transition: none;
                        transform: none;
                    }
                }

                /* NOTE: document styles beat ::slotted() styles for slotted
                   light-DOM children regardless of specificity (CSS scoping
                   cascade order) — ui.css's global button rule would wipe
                   these. !important is the intended mechanism here. */
                ::slotted(button) {
                    display: flex !important;
                    align-items: center;
                    gap: 0.6rem;
                    width: 100%;
                    padding: 8px 10px !important;
                    border: none !important;
                    background: none !important;
                    border-radius: var(--radius-m);
                    color: color-mix(in srgb, var(--fg) 82%, var(--bg)) !important;
                    font-size: 0.88rem;
                    font-family: inherit;
                    text-align: left;
                    cursor: pointer;
                }
                ::slotted(button:hover),
                ::slotted(button.hl) {
                    background: var(--hover) !important;
                    color: var(--text) !important;
                }
                ::slotted(button[data-danger]:hover),
                ::slotted(button[data-danger].hl) {
                    background: color-mix(in srgb, var(--danger) 14%, transparent) !important;
                    color: var(--danger-text) !important;
                }
                ::slotted(button[disabled]) {
                    opacity: 0.3;
                    cursor: not-allowed;
                }
                ::slotted(hr) {
                    border: none;
                    border-top: 1px solid var(--border);
                    margin: 4px 2px;
                    width: auto;
                }
            </style>
            <span class="trigger"><slot name="trigger"></slot></span>
            <div class="panel" role="menu"><slot></slot></div>
        `;

        this._triggerBox  = this.shadowRoot.querySelector(".trigger");
        this._panel       = this.shadowRoot.querySelector(".panel");
        this._triggerSlot = this.shadowRoot.querySelector('slot[name="trigger"]');
        this._itemSlot    = this.shadowRoot.querySelector("slot:not([name])");

        // Trigger click — delegated on the slot wrapper, so any markup works.
        this._triggerBox.addEventListener("click", () => this.toggle());
        this._triggerSlot.addEventListener("slotchange", () => this._syncTrigger());

        // Item click — light DOM, so listen on the host and walk composedPath.
        this.addEventListener("click", (e) => this._onItemClick(e));
    }

    /* ---------------------------------------------------------- positioning */

    _triggerEl() {
        return this._triggerSlot.assignedElements({ flatten: true })[0] || null;
    }

    _syncTrigger() {
        const el = this._triggerEl();
        if (!el) return;
        el.setAttribute("aria-haspopup", "true");
        el.setAttribute("aria-expanded", this.hasAttribute("open") ? "true" : "false");
    }

    _onReposition() {
        this._position();
    }

    /** Anchor the fixed-position panel to the trigger's viewport rect: left
     *  edges aligned, below when there's room, flipped above otherwise, and
     *  clamped 8px inside the viewport on both axes. */
    _position() {
        if (!this.hasAttribute("open") || !this._panel) return;
        const anchor = this._triggerEl() || this._triggerBox;
        const rect   = anchor.getBoundingClientRect();
        const panel  = this._panel.getBoundingClientRect();
        const margin = 8;
        const gap    = 4;

        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const openUp = spaceBelow < panel.height + gap + margin && spaceAbove > spaceBelow;

        let top = openUp ? rect.top - panel.height - gap : rect.bottom + gap;
        top = Math.max(margin, Math.min(top, window.innerHeight - panel.height - margin));

        let left = rect.left;
        left = Math.max(margin, Math.min(left, window.innerWidth - panel.width - margin));

        this._panel.style.top  = `${top}px`;
        this._panel.style.left = `${left}px`;
    }

    /* -------------------------------------------------------------- items */

    /** Slotted, enabled action buttons — the keyboard navigation set. */
    _items() {
        if (!this._itemSlot) return [];
        return this._itemSlot.assignedElements({ flatten: true })
            .filter(el => el.matches("button:not([disabled])"));
    }

    _clearHighlight() {
        for (const el of this.querySelectorAll("button.hl")) el.classList.remove("hl");
    }

    _highlight(el) {
        this._clearHighlight();
        if (el) el.classList.add("hl");
    }

    _moveFocus(delta) {
        const items = this._items();
        if (items.length === 0) return;
        const current = items.indexOf(document.activeElement);
        const next = current === -1
            ? (delta > 0 ? 0 : items.length - 1)
            : (current + delta + items.length) % items.length;
        items[next].focus();
        this._highlight(items[next]);
    }

    _focusTrigger() {
        const el = this._triggerEl();
        if (el && typeof el.focus === "function") el.focus();
    }

    _onItemClick(e) {
        if (!this.hasAttribute("open")) return;
        const path = e.composedPath();
        const stop = path.indexOf(this);                       // ignore anything above the host
        const btn = path.slice(0, stop === -1 ? path.length : stop).find(n =>
            n.nodeType === 1 &&
            n.matches("button[data-action]") &&
            n.getAttribute("slot") !== "trigger"
        );
        if (!btn || btn.disabled) return;
        this.dispatchEvent(new CustomEvent("sac:menu-select", {
            detail: { action: btn.dataset.action },
            bubbles: true,
            composed: true,
        }));
        this.close();
    }

    /* ----------------------------------------------------------- listeners */

    _onDocPointer(e) {
        if (!this.hasAttribute("open")) return;
        if (e.composedPath().includes(this)) return;           // trigger + panel both sit under the host
        this.close();
    }

    _onDocKeydown(e) {
        if (!this.hasAttribute("open")) return;
        switch (e.key) {
            case "Escape":
                e.preventDefault();
                e.stopPropagation();
                this.close();
                this._focusTrigger();
                break;
            case "ArrowDown":
                e.preventDefault();
                this._moveFocus(1);
                break;
            case "ArrowUp":
                e.preventDefault();
                this._moveFocus(-1);
                break;
            case "Tab":
                this.close();                                  // no preventDefault: focus moves on
                break;
        }
    }
}

customElements.define("sac-menu", SacMenu);
