/**
 * <sac-tab-group active="one">
 *     <sac-tab name="one">First</sac-tab>
 *     <sac-tab name="two">Second</sac-tab>
 *     <sac-tab-panel name="one">…any content…</sac-tab-panel>
 *     <sac-tab-panel name="two">…</sac-tab-panel>
 * </sac-tab-group>
 *
 * Three elements, one file — they are useless apart.
 *
 * The group owns the state: a single `active` attribute holding a tab NAME.
 * Everything else is derived from it, in place: the group toggles [active] on
 * the matching <sac-tab> and <sac-tab-panel> children, and those two style
 * themselves off :host([active]). No panel is ever moved, re-rendered or
 * re-parented — switching tabs is two attribute flips, so panel content
 * (a canvas, a scroll position, a half-filled form) survives every switch.
 *
 * Tabs auto-assign themselves to the group's "tab" slot (`slot="tab"` is set
 * in connectedCallback), so authors never write slot attributes by hand;
 * panels stay in the default slot. Order in the light DOM is free: tabs and
 * panels may be interleaved or grouped, the slots sort them out.
 *
 * Keyboard (WAI-ARIA tabs pattern, focus follows activation):
 *   ArrowLeft / ArrowRight — previous / next tab, wrapping at both ends
 *   Home / End             — first / last tab
 *   Tab                    — leaves the strip (roving tabindex: only the
 *                            active tab is in the tab order)
 * Disabled tabs are skipped by the keyboard walk and are not clickable.
 *
 * sac-tab-group
 *   Attributes: active — name of the active tab; observed, applied in place.
 *                        Absent on connect → the first tab is activated.
 *   Properties: active — get/set, reflects the attribute. Setting it does NOT
 *                        fire sac:tab-show (the caller already knows); user
 *                        interaction does.
 *   Events:     sac:tab-show — detail { name }, bubbles + composed, fired only
 *                        when the active tab actually changes.
 *
 * sac-tab
 *   Attributes: name     — the key matching a panel's name.
 *               active   — set BY THE GROUP, not by hand.
 *               disabled — greyed out, unclickable, skipped by the keyboard.
 *   Methods:    focus()  — forwards to the shadow-internal <button>.
 *
 * sac-tab-panel
 *   Attributes: name   — the key matching a tab's name.
 *               active — set BY THE GROUP, not by hand. Hidden unless present.
 *
 * Accessibility note: the strip is role="tablist" and each tab's internal
 * button is role="tab" with aria-selected kept in sync; panels are
 * role="tabpanel". aria-controls / aria-labelledby are deliberately NOT wired:
 * IDREF relationships cannot cross a shadow boundary (the button lives in the
 * tab's shadow root, the panel in the light DOM), and inventing ids on the
 * consumer's markup would be worse than the relationship is worth.
 */
(function () {

    const TAB_TAG   = "sac-tab";
    const PANEL_TAG = "sac-tab-panel";

    /* ====================================================================
       <sac-tab-group>
       ==================================================================== */
    class SacTabGroup extends HTMLElement {
        static get observedAttributes() { return ["active"]; }

        constructor() {
            super();
            this.attachShadow({ mode: "open" });
            this._syncing = false;
            this._onClick = this._onClick.bind(this);
            this._onKeyDown = this._onKeyDown.bind(this);
        }

        connectedCallback() {
            if (!this.shadowRoot.firstChild) this._render();
            this.addEventListener("click", this._onClick);
            // Children are usually not parsed yet when this runs, so the
            // slots do the waking up: every tab/panel that arrives (now or
            // later, statically or via JS) re-runs the sync.
            for (const slot of this.shadowRoot.querySelectorAll("slot")) {
                slot.addEventListener("slotchange", () => this._sync());
            }
            this.shadowRoot.querySelector(".strip")
                .addEventListener("keydown", this._onKeyDown);
            this._sync();
        }

        disconnectedCallback() {
            this.removeEventListener("click", this._onClick);
        }

        attributeChangedCallback() {
            if (this.shadowRoot.firstChild) this._sync();
        }

        get active() { return this.getAttribute("active") || ""; }
        set active(v) {
            if (v == null) this.removeAttribute("active");
            else this.setAttribute("active", String(v));
        }

        _tabs()   { return Array.from(this.querySelectorAll(`:scope > ${TAB_TAG}`)); }
        _panels() { return Array.from(this.querySelectorAll(`:scope > ${PANEL_TAG}`)); }

        /**
         * The single source of truth, applied IN PLACE. Never re-renders the
         * shadow root — it only toggles attributes on the light-DOM children.
         */
        _sync() {
            if (this._syncing) return;
            const tabs = this._tabs();
            if (!tabs.length) return;

            let name = this.getAttribute("active");
            if (name == null) {
                // No choice made: the first tab wins. Writing the attribute
                // re-enters this method via attributeChangedCallback, hence
                // the guard — this call carries on and does the toggling.
                const first = tabs.find(t => !t.hasAttribute("disabled")) || tabs[0];
                const firstName = first.getAttribute("name");
                if (firstName == null) return;
                this._syncing = true;
                this.setAttribute("active", firstName);
                this._syncing = false;
                name = firstName;
            }

            for (const tab of tabs) {
                tab.toggleAttribute("active", tab.getAttribute("name") === name);
            }
            for (const panel of this._panels()) {
                panel.toggleAttribute("active", panel.getAttribute("name") === name);
            }
        }

        /** Set + sync + announce. `moveFocus` for the keyboard walk. */
        _activate(tab, moveFocus) {
            const name = tab.getAttribute("name");
            if (name == null || tab.hasAttribute("disabled")) return;
            const changed = name !== this.getAttribute("active");
            this.setAttribute("active", name);      // → attributeChangedCallback → _sync()
            this._sync();                            // idempotent; covers the unchanged case
            if (moveFocus) tab.focus();
            if (!changed) return;
            this.dispatchEvent(new CustomEvent("sac:tab-show", {
                detail:   { name },
                bubbles:  true,
                composed: true,
            }));
        }

        _onClick(e) {
            // composedPath() so a click on whatever the author slotted INTO
            // the tab (an icon, a <strong>) still resolves to the tab itself.
            const tab = e.composedPath().find(
                n => n && n.nodeType === 1 && n.localName === TAB_TAG && n.parentElement === this
            );
            if (tab) this._activate(tab, false);
        }

        _onKeyDown(e) {
            const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
            if (!keys.includes(e.key)) return;
            const tabs = this._tabs().filter(t => !t.hasAttribute("disabled"));
            if (!tabs.length) return;

            const current = Math.max(tabs.findIndex(t => t.hasAttribute("active")), 0);
            let next = current;
            if (e.key === "ArrowLeft")       next = (current - 1 + tabs.length) % tabs.length;
            else if (e.key === "ArrowRight") next = (current + 1) % tabs.length;
            else if (e.key === "Home")       next = 0;
            else                             next = tabs.length - 1;

            e.preventDefault();
            this._activate(tabs[next], true);
        }

        _render() {
            this.shadowRoot.innerHTML = `
                <style>
                    :host { display: block; }
                    .strip {
                        display: flex;
                        gap: 2px;
                        border-bottom: 1px solid var(--border);
                    }
                </style>
                <div class="strip" role="tablist"><slot name="tab"></slot></div>
                <div class="body"><slot></slot></div>
            `;
        }
    }

    /* ====================================================================
       <sac-tab>
       ==================================================================== */
    class SacTab extends HTMLElement {
        static get observedAttributes() { return ["active", "disabled"]; }

        constructor() {
            super();
            this.attachShadow({ mode: "open" });
        }

        connectedCallback() {
            if (!this.shadowRoot.firstChild) this._render();
            this._btn = this.shadowRoot.querySelector("button");
            // Auto-assign to the group's strip slot so authors never write
            // slot="tab" by hand. An explicit slot (someone re-slotting the
            // tab elsewhere) is respected.
            if (!this.slot) this.slot = "tab";
            this._sync();
        }

        attributeChangedCallback() {
            if (this._btn) this._sync();
        }

        /** The host is not focusable — forward to the real button. */
        focus(options) {
            if (this._btn) this._btn.focus(options);
            else super.focus(options);
        }

        _sync() {
            const active = this.hasAttribute("active");
            const disabled = this.hasAttribute("disabled");
            this._btn.setAttribute("aria-selected", active ? "true" : "false");
            // Roving tabindex: exactly one tab of a group is in the tab order.
            this._btn.tabIndex = active && !disabled ? 0 : -1;
            if (disabled) this._btn.setAttribute("aria-disabled", "true");
            else this._btn.removeAttribute("aria-disabled");
        }

        _render() {
            this.shadowRoot.innerHTML = `
                <style>
                    :host { display: block; }
                    :host([disabled]) {
                        opacity: 0.4;
                        pointer-events: none;
                    }
                    /* Shadow-internal button: ui.css's global button rule
                       cannot reach in here, so this is the whole style — and
                       no !important is needed (unlike ::slotted() buttons,
                       see sac-segmented-control). */
                    button {
                        display: block;
                        width: 100%;
                        padding: 0.5rem 0.95rem;
                        font-family: inherit;
                        font-size: 0.85rem;
                        font-weight: 500;
                        color: color-mix(in srgb, var(--fg) 72%, var(--bg));
                        background: none;
                        border: none;
                        /* Sits ON the group's 1px strip border: the -1px pulls
                           the 2px underline down over that line. */
                        border-bottom: 2px solid transparent;
                        margin-bottom: -1px;
                        border-radius: var(--radius-m) var(--radius-m) 0 0;
                        cursor: pointer;
                        transition: color 0.15s, border-color 0.15s, background 0.15s;
                    }
                    button:hover {
                        color: var(--text);
                        background: var(--hover);
                    }
                    button:focus-visible {
                        outline: 2px solid var(--accent);
                        outline-offset: -2px;
                    }
                    :host([active]) button {
                        color: var(--accent);
                        border-bottom-color: var(--accent);
                    }
                    :host([disabled]) button { cursor: default; }

                    @media (prefers-reduced-motion: reduce) {
                        button { transition: none; }
                    }
                </style>
                <button type="button" role="tab"><slot></slot></button>
            `;
        }
    }

    /* ====================================================================
       <sac-tab-panel>
       ==================================================================== */
    class SacTabPanel extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: "open" });
        }

        connectedCallback() {
            if (!this.shadowRoot.firstChild) this._render();
            if (!this.hasAttribute("role")) this.setAttribute("role", "tabpanel");
        }

        _render() {
            this.shadowRoot.innerHTML = `
                <style>
                    :host {
                        display: none;
                        padding-top: 1rem;
                    }
                    :host([active]) { display: block; }
                </style>
                <slot></slot>
            `;
        }
    }

    customElements.define("sac-tab-group", SacTabGroup);
    customElements.define(TAB_TAG, SacTab);
    customElements.define(PANEL_TAG, SacTabPanel);
})();
