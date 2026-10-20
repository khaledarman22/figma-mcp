# figma-mcp — notes for working on the tool itself

Local bridge between Claude Code and Figma Desktop: MCP server (stdio) + WebSocket hub + Figma development
plugin + Claude Code plugin (skills, guard hook). README.md (Arabic) is the user guide.

## Layout
- `src/shared/` — protocol, build-spec normalizer (`spec.ts`), colors, utils. No Node/DOM/Figma globals: bundled into server and plugin.
- `src/plugin/` — Figma plugin main thread. `main.ts` routes methods; `build.ts`/`props.ts`/`text.ts`/`paint.ts` apply specs; `extract.ts` feeds codegen; `pages.ts` owns file organization (pages by purpose created on first use, Components/References/Trash roles, Trash + restore, empty-page cleanup, sections that grow, image placeholders and IMG ids); `lint.ts`, `prototype.ts`, `variables.ts`, `styles.ts`, `components.ts`, `edit.ts`, `execute.ts`, `inspect.ts`, `export.ts`.
- `src/ui/` — plugin iframe: WebSocket to the hub, activity log, Pause.
- `src/server/` — MCP tools (`tools.ts`), hub/agent bridge (`hub.ts`), codegen, tokens, assets (Iconify/images), `IMAGE_PROMPTS.md` hand-off (`images.ts`), output path guard (`files.ts`).
- `src/guard/` — PreToolUse hook keeping this folder clean from other projects' sessions.
- Built, committed runtime: `claude-plugin/dist/*.mjs`, `figma-plugin/code.js`, `figma-plugin/ui.html`, and `agent-skills/` (portable copies of `claude-plugin/skills` for Codex/OpenCode/Antigravity/… — generated, never edit by hand).
- Install: `npm run setup` / `setup.command` → `scripts/setup.mjs` (interactive list) over `scripts/clients.mjs` (per-tool config locations, detect + install; also used by doctor). Tools other than Claude Code start the fixed launcher `~/.figma-mcp/launch.mjs` (template `scripts/home-launch.mjs`), which finds this folder even after it moves; Figma imports the plugin copy in `~/.figma-mcp/figma-plugin`. `src/server/home.ts` (every server start) and `scripts/build.mjs` keep those copies and the installed skill folders (marked `.figma-mcp` with a content hash) current. `CLIENTS.md` is the Arabic guide.

## Commands
- `npm run build` — bundles everything with esbuild and stamps `version+contenthash` into server and plugin.
- `npm run check` — typecheck (server, plugin, ui) + build + tests. Run before finishing any change.
- `npm run doctor` — runtime health (hub ports, connected files, logs).
- Tests use Node's built-in runner with native TypeScript; `test/integration.test.ts` runs real server processes against `test/fake-plugin.ts`.

## Rules
- Server code never writes to stdout (it is the MCP channel) — use `log()`.
- Plugin code: async Plugin API only (`documentAccess: dynamic-page`); bundle target ES2017; use `getNodeSafe` instead of raw `getNodeByIdAsync`.
- New spec keys: add to `KNOWN_KEYS`/`KEY_ALIASES` in `spec.ts`, apply in `props.ts`, document in `claude-plugin/skills/figma/references/build-spec.md`, add a test.
- New tool or method: plugin method in `main.ts` (give it a deadline in `DEADLINES` if it can be slow), tool in `tools.ts`, row in the core skill's tool map and the README.
- Skills must stay client-neutral (Claude-only details phrased as "in Claude Code: …"); cross-references use `figma-mcp:<skill>`, which the build rewrites to `figma-mcp-<skill>` for other agents.
- Outputs produced while *using* the tool never go into this folder (`resolveOutput` enforces it).
- File organization is enforced in code, not only in skills: deletes go to Trash (`trashNodes`), components default to the Components page, same-name top-level twins are refused, pages come from `ensurePage` (never `figma.createPage()` directly).
- Tests that start servers or run setup must isolate the user's home: `FIGMA_MCP_HOME` (and `HOME` when skills/configs are involved) pointing at temp dirs.
- Real-Figma checks: `scripts/e2e.mjs`, `scripts/e2e-extra.mjs` (each recreates its own test page) and `scripts/e2e-org.mjs` (organization rules; removes the pages a previous run created).
- After a build: a running Figma plugin swaps in the new methods on the next call (hot reload via `__reload`); only changes to `src/ui/` need the plugin re-run. Sessions load the new server after `/reload-plugins` or a restart.
