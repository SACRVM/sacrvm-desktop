# SACRVM DESKTOP

A web desktop you fill yourself. Paste the URL of an app repository and the
app is installed — the desktop remembers *where the app lives*, never a copy
of it.

**Live: <https://desktop.sacrvm.dev/>**

Built with [SACRVM APPKIT](https://github.com/SACRVM/sacrvm-appkit), which is
**vendored** here: `kit/` is a copy this repo owns and upgrades when it
chooses. Zero dependencies, zero build — `npx serve .` and reload.

## Installing an app

1. Paste `github.com/owner/repo`.
2. The desktop reads `owner.github.io/repo/app.json` — a fetch, not an
   execution.
3. It shows what the manifest says and where it came from.
4. You confirm. Only then is the app's script ever loaded, and only when you
   first open the app.

`?install=<url>` does the same by link, which is how you hand somebody an app.

An installed app runs its own code in this page — same realm, full access.
Install what you trust, the way you would a browser extension. Every tile
carries its origin for exactly that reason.

Your installed list lives in this browser (`localStorage`), nowhere else.
There is no server and no account.

## Writing an app

One repo, one app, always the same shape:

```
app.json     manifest: id, name, icon, description, kind, tag, entry, version
app.js       ONE custom element, ONE classic script
app.css      optional, injected by the app itself
index.html   the harness: the app alone, no desktop, F5 to develop
```

`kind` is `"window"` (a dialog-style app, floating) or `"view"` (a fullscreen
app that takes the stage and projects its navigation into the rail).

Start from a template:
<https://sacrvm.github.io/sacrvm-appkit/kit/templates/>

## Known gaps

- `context.fs` and `context.identity` are reserved and still `null` — apps
  needing storage use `localStorage` for now.
- Installed apps are not version-pinned: the desktop re-reads the origin, so
  an author's next release is simply there.
- A text-input dialog is hand-rolled here (`promptUrl` in `desktop.js`); once
  the kit grows `sac.dialog.prompt`, it goes.

## Licence

MIT — see `LICENSE`. The vendored kit is MIT as well.
