# sacrvm-desktop

The example desktop for [SACRVM APPKIT](https://github.com/SACRVM/sacrvm-appkit),
live at [desktop.sacrvm.dev](https://desktop.sacrvm.dev/). It is a host, not an
app: it owns the ribbon, the rail and the stage, and everything on it comes from
somebody else's repository. Read `README.md` first.

**Installing is remembering a URL.** Paste `github.com/owner/repo`, the desktop
reads `owner.github.io/repo/app.json` — a fetch, never an execution — shows what
the manifest says and where it came from, and only on your confirmation
registers it. The app's script is fetched later, when you first open it. The
list lives in this browser's `localStorage`; there is no server and no account,
and removing an app forgets an address, nothing more. Say so in the UI wherever
the question could come up — people ask "whose desktop is this?" and the answer
belongs on screen, not in a table nobody reads.

**Reading and running stay separate**: `sac.apps.inspect(url)` returns data;
`sac.apps.add(manifest)` is the step that can run code. Never collapse the two.

**No build step, ever.** Vanilla custom elements, plain CSS, `npx serve .` and
F5 — no node_modules, no bundler, no TypeScript.

**The kit IS vendored here** (`kit/`), because a desktop hosts apps it does not
know in advance and must load the whole kit. Upgrading is a deliberate copy from
the appkit repo, committed on its own. Fix kit bugs in the appkit and copy the
result over — never patch `kit/` in place, or the next upgrade silently reverts
it. The desktop adds no colours of its own: tokens only, so a theme or accent
swap carries the whole shell.

## Firepit inbox

At the start of a session, read any pending messages in `.firepit/inbox/*.md` — cross-project notes Firepit routes here. Act on each, then mark it done with the `firepit_inbox_complete` MCP tool, passing the message's filename as the `id`.

## Firepit knowledge

Before researching something that may already be known, query the knowledge base with the `firepit_knowledge_search` MCP tool (scope `both` covers this project plus the global base). Save durable findings with `firepit_knowledge_add` — written in English, per the indexing convention. The created markdown files live under `.firepit/knowledge/` and are committed like any other file.

## Firepit pinned knowledge

@.firepit/knowledge-pinned.md

The import above auto-loads the knowledge docs marked `pin: true` in their frontmatter — always-on rules that apply every session without a search. Firepit regenerates the file from the pinned docs; don't edit it directly. Pin/unpin via the pinned flag on `firepit_knowledge_add` / `firepit_knowledge_update`, and keep the pinned set small — everything else stays reachable through `firepit_knowledge_search`.

## Firepit artifacts

When you produce a file the user will want to open — a report, screenshot, diagram, generated image, log excerpt, build output, or an executable you built for them to run — pin it with the `firepit_artifact_add` MCP tool so it appears in the project's paperclip pane. Do this as you produce it, not at the end of the session; a path buried in scrollback is a path the user has to hunt for. Pinning only links the file — it stays where it is, and `firepit_artifact_remove` never deletes it. Check `firepit_artifact_list` first so you update an existing entry instead of piling up near-duplicates, and unpin what has gone stale.

## Firepit conventions

<!-- claude-firepit-fragments -->

@../.firepit/projects/claude.md
@../.firepit/projects/claude-github-public.md

The two imports above are shared files in the Firepit central repo — edit them there and every project follows. They carry policy; the tools themselves are described by Firepit's MCP server at the handshake, so nothing is duplicated between the two.
