/**
 * <sac-scene-graph> + <sac-scene-item>  —  tree list.
 *
 * Generic hierarchical list with visibility toggles, color wells, delete
 * buttons and expand chevrons — used for scene graphs, layer lists, any
 * tree of toggleable things.
 *
 *   <sac-scene-graph>
 *     <sac-scene-item id="obj-1" label="Group" visible expandable>
 *       <sac-scene-item id="obj-2" label="Mesh" visible color="#3b82f6" can-delete></sac-scene-item>
 *     </sac-scene-item>
 *   </sac-scene-graph>
 *
 * <sac-scene-item> attributes:
 *   label      — display text (default "Unnamed").
 *   visible    — presence = eye open.
 *   color      — hex color; renders a color well.
 *   can-delete — renders a trash button.
 *   active     — selected state.
 *   expanded   — children shown.
 *   expandable — keeps the chevron on a row whose children are built lazily.
 *
 * NOTE: the element's `id` attribute is used as the data id in every event
 * detail — give each item a meaningful id.
 *
 * Events (all bubble + composed, detail.id = element id):
 *   select            — detail also carries `additive` (ctrl/cmd) and
 *                       `range` (shift) so a host can build multi-selection
 *                       without re-implementing hit detection.
 *   toggle-visibility — detail.visible = the REQUESTED new state.
 *   toggle-expand     — detail.expanded.
 *   delete
 *   change-color      — detail.color.
 */
(function () {

    /** Kit i18n: sac.t when globals.js is loaded, the English fallback when
     *  the component runs standalone. */
    const t = (key, fallback) =>
        (window.sac && window.sac.t) ? window.sac.t(key, fallback) : fallback;

class SacSceneGraph extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    width: 100%;
                    overflow-x: hidden;
                    font-family: 'Inter', sans-serif;
                }
            </style>
            <slot></slot>
        `;
    }
}

class SacSceneItem extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    static get observedAttributes() {
        return ['label', 'visible', 'color', 'can-delete', 'active', 'expanded', 'expandable'];
    }

    get visible() { return this.hasAttribute('visible'); }
    set visible(val) { if (val) this.setAttribute('visible', ''); else this.removeAttribute('visible'); }

    get expanded() { return this.hasAttribute('expanded'); }
    set expanded(val) { if (val) this.setAttribute('expanded', ''); else this.removeAttribute('expanded'); }

    get active() { return this.hasAttribute('active'); }
    set active(val) { if (val) this.setAttribute('active', ''); else this.removeAttribute('active'); }

    connectedCallback() {
        this.render();
    }

    attributeChangedCallback() {
        this.render();
    }

    render() {
        const label = this.getAttribute('label') || t('scene.unnamed', 'Unnamed');
        const color = this.getAttribute('color');
        const canDelete = this.hasAttribute('can-delete');
        // `expandable` keeps the chevron on a row whose children are built
        // lazily (children only detected once you actually expand it).
        const isNested = this.children.length > 0 || this.hasAttribute('expandable');

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                }
                .item-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 8px;
                    border-radius: var(--radius-m);
                    cursor: pointer;
                    transition: background 0.2s;
                    user-select: none;
                    /* Reserve the selected state's border on EVERY row —
                       otherwise selecting a row makes it 2px taller and the
                       whole list jumps. */
                    border: 1px solid transparent;
                }
                .item-row:hover {
                    background: color-mix(in srgb, var(--fg) 5%, transparent);
                }
                .item-row.active {
                    background: color-mix(in srgb, var(--accent) 20%, transparent);
                    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
                }
                .icon {
                    width: 14px;
                    height: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0.7;
                    transition: opacity 0.2s;
                }
                .icon:hover { opacity: 1; }
                .label {
                    flex-grow: 1;
                    font-size: 0.75rem;
                    font-weight: 500;
                    color: color-mix(in srgb, var(--fg) 80%, var(--bg));
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .active .label { color: var(--text); }
                .chevron {
                    width: 12px;
                    height: 12px;
                    transition: transform 0.2s;
                    opacity: 0.5;
                }
                .expanded .chevron { transform: rotate(90deg); }
                .children {
                    display: ${this.expanded ? 'block' : 'none'};
                    padding-left: 14px;
                    border-left: 1px solid color-mix(in srgb, var(--fg) 5%, transparent);
                    margin-left: 6px;
                }
                input[type="color"] {
                    width: 14px;
                    height: 14px;
                    padding: 0;
                    border: 1px solid color-mix(in srgb, var(--fg) 40%, transparent);
                    background: none;
                    cursor: pointer;
                    border-radius: var(--radius-s);
                    box-shadow: 0 0 3px color-mix(in srgb, var(--sink) 50%, transparent);
                    transition: transform 0.1s;
                }
                input[type="color"]:hover {
                    transform: scale(1.2);
                    border-color: var(--text);
                }
            </style>
            <div class="item-row ${this.active ? 'active' : ''} ${this.expanded ? 'expanded' : ''}">
                ${isNested ? `
                    <div class="chevron icon" id="btn-expand">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </div>
                ` : '<div style="width: 12px;"></div>'}

                <div class="icon" id="btn-visibility">
                    ${this.visible ?
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' :
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
            }
                </div>

                <div class="label" id="item-label">${label}</div>

                ${color ? `<input type="color" value="${color}" id="item-color">` : ''}

                ${canDelete ? `
                    <div class="icon" id="btn-delete" style="opacity: 0.4">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </div>
                ` : ''}
            </div>
            <div class="children">
                <slot></slot>
            </div>
        `;

        this.shadowRoot.querySelector('.item-row').onclick = (e) => {
            const path = e.composedPath();
            if (path.some(el => el.id === 'btn-visibility')) {
                this.dispatchEvent(new CustomEvent('toggle-visibility', { detail: { id: this.id, visible: !this.visible }, bubbles: true, composed: true }));
            } else if (path.some(el => el.id === 'btn-expand')) {
                this.expanded = !this.expanded;
                this.dispatchEvent(new CustomEvent('toggle-expand', { detail: { id: this.id, expanded: this.expanded }, bubbles: true, composed: true }));
            } else if (path.some(el => el.id === 'btn-delete')) {
                this.dispatchEvent(new CustomEvent('delete', { detail: { id: this.id }, bubbles: true, composed: true }));
            } else if (path.some(el => el.id === 'item-color')) {
                // Color change handled by onchange below.
            } else {
                // Modifier hints so a host can build multi-selections without
                // re-implementing hit detection: `additive` = toggle one
                // (ctrl/cmd), `range` = span from the last anchor (shift).
                this.dispatchEvent(new CustomEvent('select', {
                    detail: { id: this.id, additive: e.ctrlKey || e.metaKey, range: e.shiftKey },
                    bubbles: true, composed: true
                }));
            }
        };

        const colorInput = this.shadowRoot.querySelector('#item-color');
        if (colorInput) {
            colorInput.onchange = (e) => {
                this.dispatchEvent(new CustomEvent('change-color', { detail: { id: this.id, color: e.target.value }, bubbles: true, composed: true }));
            };
        }
    }
}

customElements.define('sac-scene-graph', SacSceneGraph);
customElements.define('sac-scene-item', SacSceneItem);
})();
