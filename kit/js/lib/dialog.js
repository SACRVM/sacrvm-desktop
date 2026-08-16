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
                // Let the element register before opening, so the open
                // animation starts from its closed state. A timeout, not
                // requestAnimationFrame: a background tab paints no frames,
                // and a dialog that never opens would hang its promise.
                setTimeout(() => dlg.open(), 0);
            });
        },
    };
})();
