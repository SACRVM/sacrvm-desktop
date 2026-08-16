/**
 * sac.dialog — promise-based confirm dialog helper.
 *
 * Thin wrapper around <sac-dialog>. Constructs the element, waits for the
 * user's response, removes the element, resolves with the chosen action.
 *
 *   const answer = await sac.dialog.confirm({
 *       title:   "Delete this item?",
 *       message: "This item will be permanently deleted.",
 *       buttons: [
 *           { action: "cancel", label: "Cancel", kind: "default" },
 *           { action: "delete", label: "Delete", kind: "destructive", armAfterMs: 2000 },
 *       ],
 *   });
 *
 * Resolves with the clicked button's `action` string, or `null` if the dialog
 * was dismissed via Escape / backdrop / programmatic close. Callers treat
 * `null` the same as "cancel."
 */
(function () {
    if (!window.sac) return;

    sac.dialog = {
        confirm({ title, message, buttons }) {
            return new Promise((resolve) => {
                const dlg = document.createElement("sac-dialog");
                if (title) dlg.setAttribute("title", title);
                dlg.buttons = Array.isArray(buttons) ? buttons : [];

                if (message) {
                    // textContent — never innerHTML. Callers may pass
                    // user-sourced strings.
                    const p = document.createElement("p");
                    p.textContent = message;
                    dlg.appendChild(p);
                }

                dlg.addEventListener("sac-dialog:action", (e) => {
                    // Let the fade-out transition run before removal.
                    setTimeout(() => {
                        dlg.remove();
                        resolve(e.detail.action);
                    }, 120);
                }, { once: true });

                document.body.appendChild(dlg);
                // Give the browser one frame to register the element so the
                // open animation actually runs (otherwise it starts mid-anim).
                requestAnimationFrame(() => dlg.open());
            });
        },
    };
})();
