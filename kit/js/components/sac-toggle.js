/**
 * <sac-toggle label="Pinned" checked>
 *
 * Custom switch. Fires `change` events with `e.detail` = boolean
 * (bubbles, composed).
 *
 * The checked state is styled purely via :host([checked]) — attribute
 * changes never re-render the shadow DOM (re-rendering would kill the
 * knob's slide transition; same in-place rule as sac-slider).
 *
 * Attributes:
 *   label   — text to the left of the switch.
 *   checked — presence = on.
 *
 * Properties:
 *   checked — get/set, reflects the attribute.
 */
class SacToggle extends HTMLElement {
    static get observedAttributes() { return ["label", "checked"]; }

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        if (!this.shadowRoot.firstChild) {
            this.render();
            this.attach();
        }
    }

    attributeChangedCallback(name) {
        if (!this.shadowRoot.firstChild) return;
        if (name === "label") {
            const el = this.shadowRoot.querySelector(".label");
            if (el) el.textContent = this.getAttribute("label") || "";
        }
        // checked: handled entirely by :host([checked]) CSS — nothing to do.
    }

    get checked() { return this.hasAttribute("checked"); }
    set checked(v) {
        if (v) this.setAttribute("checked", "");
        else   this.removeAttribute("checked");
    }

    render() {
        const label = this.getAttribute("label") || "";
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.25rem 0;
                    cursor: pointer;
                    color: var(--text);
                    font-size: 0.875rem;
                }
                .label { user-select: none; }
                .switch {
                    position: relative;
                    width: 28px;
                    height: 14px;
                    background: color-mix(in srgb, var(--fg) 15%, transparent);
                    border-radius: 999px;
                    transition: background 0.2s;
                    flex-shrink: 0;
                }
                .knob {
                    position: absolute;
                    top: 1px; left: 1px;
                    width: 12px; height: 12px;
                    background: var(--text);
                    border-radius: 50%;
                    transition: transform 0.2s, background 0.2s;
                }
                :host([checked]) .switch { background: var(--accent); }
                :host([checked]) .knob   { transform: translateX(14px); background: var(--on-accent); }
            </style>
            <span class="label">${label}</span>
            <div class="switch"><div class="knob"></div></div>
        `;
    }

    attach() {
        this.addEventListener("click", () => {
            this.checked = !this.checked;
            this.dispatchEvent(new CustomEvent("change", {
                detail: this.checked,
                bubbles: true,
                composed: true
            }));
        });
    }
}

customElements.define("sac-toggle", SacToggle);
