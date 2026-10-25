# Troubleshooting

| Symptom | Cause → fix |
|---|---|
| `NO_PLUGIN` / status says not connected | The plugin isn't running. Figma Desktop → the file → Plugins → Development → **Figma MCP**, keep the panel open. First time: Import plugin from manifest → `~/.figma-mcp/figma-plugin/manifest.json` (made by `npm run setup` in the figma-mcp folder). Browser Figma can't run development plugins. |
| Panel says "Waiting for Claude Code…" | The hub starts with the first agent session that uses figma-mcp. The panel connects within seconds when Figma is in front; when Figma's window is hidden behind other windows its timers are throttled and it can take up to a minute (tools wait up to 60 s for it). Ask the user to bring Figma to the front if it takes longer. |
| `TIMEOUT` with "a Figma call never returned" | Figma did not settle an operation (often while Figma was offline). The plugin skipped it and is ready again; check the canvas, then retry. |
| Plugin closed by itself | Figma runs one plugin at a time: opening another plugin closes Figma MCP. Re-run it. |
| `PAUSED` | The user paused Claude in the panel. Ask them to press Resume. |
| `TIMEOUT` | Figma was busy (very large build/extract) or frozen. Check the canvas (`get_metadata`, `screenshot`) before retrying; split big work into sections. If Figma is frozen, close and re-run the plugin. |
| `PLUGIN_DISCONNECTED` during a call | The plugin/file closed mid-operation. Check what was applied, then continue. |
| `HUB_UNAVAILABLE` | The Claude session hosting the hub just ended; this session takes over automatically — retry in a moment. |
| "server process is older than the installed build" note | Not a blocker — keep working, every tool works. The client keeps an old server process alive (OpenCode's background service, a long Codex thread). At the end tell the user to restart the client's MCP servers (`opencode service restart`; Codex: new thread; Claude Code: `/reload-plugins`). Re-running the Figma plugin does not help. |
| "plugin build differs" note | Not a blocker — keep working. Normally the server pushes the new build into the running plugin by itself; only if a tool then fails with `UNKNOWN_METHOD`, ask the user to close and re-run the plugin. |
| "Limited to 1 modes" / "cannot use Set Variable Mode" | Figma plan limits (Starter: one mode per collection, no set-mode prototype actions). Report it and continue with what the plan allows. |
| `UNKNOWN_METHOD` | Plugin older than the server — re-run the plugin. |
| Font errors | Use `fonts` to see exact families/styles; install missing fonts on the machine (Figma Desktop sees local fonts). |
| Variable/style/component not found | Names are exact paths ("color/bg/default"); the error lists the closest names. Library variables must be enabled in the file (Assets → Libraries). |
| Text is a thin vertical line | It fills a parent that hugs its width. Give the parent a width or `w: "fill"`. |
| Images rejected | Use absolute paths or URLs; PNG/JPG/GIF only (convert WebP/AVIF: `sips -s format png in.webp --out out.png` on macOS). |
| `"…" already exists on page …` | Same-name top-level layer or component: update the existing one (`edit`, or `build` with `replaceId`) instead of making a copy; another state gets another name (`Home – Empty`). |
| "That is the Trash page" | Nothing is built on Trash. Pass `page` (App, Web, …), or `edit` `restore` to bring layers back. |
| `place_images` placed nothing | Files must start with the image id (`IMG-001…`) in the images folder next to `IMAGE_PROMPTS.md`, or pass `files: {"IMG-001": "/path"}`. Run `image_prompts` first if the layers have no ids yet. |
| Icons fail | Needs internet for the first fetch (cached afterwards). Check names with `icons`. Offline → `{type: "svg", svg: …}`. |
| Tool can't start the server / `can't find the figma-mcp folder` | The figma-mcp folder moved or was deleted and the launcher could not find it. The user opens the folder in a terminal and runs `npm run setup` (or double-clicks `setup.command`). |
| Port busy | The hub uses localhost 7457 (falls back to 7458/7459). Another program on all three → free one. `npm run doctor` in the figma-mcp folder shows the state. |
| Writes refused into the figma-mcp folder | By design: the tool folder stays clean. Write into the user's project. |

Logs: `~/.claude/plugins/data/<figma-mcp>/server.log` (or `~/.figma-mcp/server.log`).
