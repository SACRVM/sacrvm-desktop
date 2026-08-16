/**
 * <sac-segmented-control value="all">
 *   <button data-value="today">Today</button>
 *   <button data-value="week">Week</button>
 *   <button data-value="all">All</button>
 * </sac-segmented-control>
 *
 * Button group; one active at a time. Active state tracked via the `value`
 * attribute. Buttons live in the light DOM (slotted) so apps can put text,
 * icons or SVG inside them.
 *
 * Attributes:
 *   value — currently-active data-value.
 *
 * Properties:
 *   value — get/set; setting fires `change`.
 *
 * Events:
 *   change — e.detail = new value (string), bubbles + composed.
 *
 * Theming: the active segment uses --accent. For an edit-mode group, set
 * `style="--accent: var(--accent-edit)"` on the control — the per-element
 * accent override is the intended mechanism (no hardcoded per-value colors).
 */
class SacSegmentedControl extends HTMLElement {
    static get observedAttributes() { return ["value"]; }

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback()        { this.render(); this.attach(); }
    attributeChangedCallback() { if (this.shadowRoot.firstChild) this.applyActive(); }

    get value() { return this.getAttribute("value") || ""; }
    set value(v) {
        this.setAttribute("value", v);
        this.dispatchEvent(new CustomEvent("change", { detail: v, bubbles: true, composed: true }));
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: inline-flex;
                    background: var(--field);
                    /* The hairline the input family already wears. Without it
                       the track vanishes on light ground and the inset active
                       segment reads as "shorter than the control". */
                    border: 1px solid var(--border);
                    border-radius: var(--radius-m);
                    padding: 2px;
                    gap: 2px;
                }
                /* NOTE: document styles beat ::slotted() styles for slotted
                   light-DOM children regardless of specificity (CSS scoping
                   cascade order) — ui.css's global button rule would wipe
                   these. !important is the intended mechanism here. */
                ::slotted(button) {
                    padding: 0.35rem 0.75rem !important;
                    border: none !important;
                    background: transparent !important;
                    color: color-mix(in srgb, var(--fg) 78%, var(--bg)) !important;
                    border-radius: var(--radius-s);
                    cursor: pointer;
                    font-size: 0.85rem;
                    font-family: inherit;
                    transition: all 0.15s;
                }
                ::slotted(button:hover) {
                    background: var(--hover) !important;
                    color: var(--text) !important;
                }
                ::slotted(button.active),
                ::slotted(button.active:hover) {
                    background: var(--accent-fill) !important;
                    color: var(--on-accent) !important;
                }
            </style>
            <slot></slot>
        `;
        this.applyActive();
    }

    applyActive() {
        const value = this.value;
        for (const btn of this.querySelectorAll("button[data-value]")) {
            btn.classList.toggle("active", btn.dataset.value === value);
        }
    }

    attach() {
        this.addEventListener("click", (e) => {
            const btn = e.target.closest("button[data-value]");
            if (!btn) return;
            this.value = btn.dataset.value;
        });
    }
}

customElements.define("sac-segmented-control", SacSegmentedControl);
