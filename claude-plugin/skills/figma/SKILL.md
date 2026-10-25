---
name: figma
description: The one entry point for figma-mcp — the local bridge to Figma Desktop through the "Figma MCP" plugin (tools mcp__plugin_figma-mcp_figma__* in Claude Code, figma-mcp elsewhere). Load it once for any Figma work and it routes itself — it reads the matching guide for designing screens, flows and banners (also from a reference), one brand identity kept across everything (defining it, extracting it from a site or screenshots, auditing consistency), design systems (variables, styles, components, variants), prototypes, design → code and images to generate, and keeps doing that for every later request in the conversation. Covers connecting, the tool map, file organization, the build-spec vocabulary, verification and error recovery. Triggers include "figma-mcp", "Figma", "فيجما", "صمم", "ديزاين", "شاشة", "كمبوننت", "فاريبلز", "ديزاين سيستم", "هوية", "براند", "وحّد التصميم", "بروتوتايب", "اسحب التصميم", "حوّل لكود", "ريفرنس", "بيهانس", "دريبل", "بنترست", "صور", a figma.com URL, or a node id like 12:34.
---

# figma-mcp — working in Figma through the local bridge

You drive Figma Desktop through a development plugin ("Figma MCP") that the user runs in their file.
Every call acts on the live file the user is looking at, so work like a careful colleague: inspect
first, change in small verified steps, keep the file organized, and never leave half-finished or mystery layers behind.

## Router — you pick the guide, never the user

The user calls figma-mcp once (or simply asks for Figma work); from then on this skill governs every Figma
request in the conversation. For each request, decide what kind of work it is and **read the matching guide
before the first tool call** — several when the request spans them. When a later request changes the kind of
work, read that guide then. Never ask the user which skill or guide to use, and never ask them to call
figma-mcp again.

| The request is about… | Read first |
|---|---|
| Screens, flows, landing pages, dashboards, banners, redesigns, polish — or designing from a reference | [references/design.md](references/design.md) |
| One identity for everything: define or lock the brand, extract it from a site/screenshots, unify or audit consistency, carry it to code (`DESIGN.md`) | [references/identity.md](references/identity.md) |
| Variables/tokens, styles, components and variants, themes, a UI kit | [references/design-system.md](references/design-system.md) |
| A clickable prototype: links, transitions, overlays, scrolling, flows | [references/prototype.md](references/prototype.md) |
| Building it in code: implement or pull a screen, export tokens/assets | [references/to-code.md](references/to-code.md) |
| Images the design needs that don't exist yet (each: a reference image + the full brief + every element), or images the user sent back | [references/image-prompts.md](references/image-prompts.md) |
| `build` / `edit` / `create_component` beyond the basics in §4 | [references/build-spec.md](references/build-spec.md) |
| Something only the Plugin API can do (`execute`) | [references/execute.md](references/execute.md) |
| An error or odd behavior | [references/troubleshooting.md](references/troubleshooting.md) |

Usual combinations: "design the app / a screen" → design (+ design-system when it needs components or tokens;
+ identity when the file has no `## Identity` in its brief yet, or the work is for a new product);
"make it look like <brand/site>" → identity + design-system;
"make it clickable" → prototype; "build it in the project" → to-code (+ design-system for the tokens).
Only reading or inspecting a file → this page is enough.

## 0. Tools

The tools come from the figma-mcp MCP server; each client prefixes them its own way — Claude Code:
`mcp__plugin_figma-mcp_figma__<tool>`; Codex / OpenCode / Antigravity / others: the server name you registered
(usually `figma-mcp`) + the tool name. If your client defers MCP tools (Claude Code), load the ones you need in
**one** search call, e.g. `select:mcp__plugin_figma-mcp_figma__status,mcp__plugin_figma-mcp_figma__get_metadata,mcp__plugin_figma-mcp_figma__build,mcp__plugin_figma-mcp_figma__edit,mcp__plugin_figma-mcp_figma__screenshot`.
If your client does not show images returned by tools, call `screenshot` with `saveTo` and open the PNG with your image viewer.

| Need | Tool |
|---|---|
| Is Figma connected? which file/page/selection? | `status` |
| Structure + ids (cheap) | `get_metadata` |
| Exact properties of layers (before editing) | `get_node` |
| See it | `screenshot` |
| What the file already has (tokens, styles, components) | `get_design_system` |
| Find layers by name/text | `search` |
| Create layouts/screens/sections | `build` |
| Change existing layers (props, text, move, wrap, swap, delete → Trash, restore…) | `edit` |
| Tokens | `variables`, `styles` |
| Components & variant sets | `create_component` |
| Prototype links, flows, scrolling | `prototype` |
| Audit against principles (+ safe auto-fix) | `lint` |
| Images the design waits for → prompts file; generated images → into place | `image_prompts`, `place_images` |
| Images already collected (web or user) → reuse; new finds → store once | `image_library` |
| Design → code | `get_design_context`, `export_tokens`, `export` |
| Anything else in the Plugin API | `execute` |
| Fonts / icon names | `fonts`, `icons` |
| Persistent design brief stored in the file | `brief` |
| The file's folder in the project (identity, tokens, references, images) → refresh from Figma | `workspace` |

## 1. Connect (every session)

1. `status`. It lists connected files with page and selection, pages, and the stored brief.
2. Not connected → tell the user (in their language): *Figma Desktop → open the file → Plugins → Development → **Figma MCP** — keep its panel open.*
   First time only: *Plugins → Development → Import plugin from manifest… → `~/.figma-mcp/figma-plugin/manifest.json`* (made by `npm run setup` in the figma-mcp folder; that path never moves). Not installed in this tool yet → the user runs `npm run setup` there.
3. Several files connected → pass `file: "<name>"` on calls; the choice sticks for the session.
4. `PAUSED` error → the user pressed Pause in the plugin panel. Ask them to Resume; never work around it.
5. A "plugin build differs" note → ask the user to close and re-run the plugin (it loads the new build).
6. Anything odd → [references/troubleshooting.md](references/troubleshooting.md).

"This", "here", "الشاشة دي" = the current selection (shown by `status`). Figma URLs and `12-34` ids are accepted anywhere an id is.

## 2. The loop

**Orient → References → Plan → per section: components it needs → section from instances → Look → Check usage → Report.**

1. **Orient.** `status` (pages!) → `brief` (get) → the workspace's `COMPONENTS.md` (what already exists and how to place it; `get_design_system` when there is no workspace) → `get_metadata` on the area you will touch. A `## Identity` block in the brief is binding: its tokens, components, patterns, icon set and imagery words are the only ones you use ([references/identity.md](references/identity.md)). Never design blind and never assume a file is empty — check other pages. New screen/flow/page/banner and the user gave no UI reference → find 2–4 on Dribbble, Behance, Pinterest and similar, crop the part you'll use and place them on `References` **before tokens, components and screens** ([references/design.md](references/design.md), § No reference given). A logo, colors or a mood photo are brand material, not a reference — still search. Something with the same name already there? Update it, don't make a second one.
2. **Plan in words** (3–8 lines; show the user when non-trivial): purpose, which page, device size, structure top→bottom, components to reuse vs. create, tokens to use, states to cover, images needed, and the references (`References: … (found / from the user)`). For every section: which reference part it follows and which components it is made of (button, input, card, list item, tab bar…) — a component no section names is not made. Ask only questions whose answers change the result.
3. **Section by section, components just in time.** Take one section (hero, services grid, footer…) at a time: look at the reference part you cropped for it → create **only the components this section needs**, shaped after that part (its spacing, radius, layout, hierarchy; description `source: Reference – <name>`) with icons as `icon` children inside their auto layout → build the section from instances right away → screenshot it next to the reference → next section. Never create a kit up front: a component for a section you are not building now is a component nobody uses. Exception: the user asks for a design system / UI kit itself ([references/design-system.md](references/design-system.md)).
4. **Build in sections.** One meaningful region per `build` call (a header, a form, a card list) — big enough to be efficient, small enough to retry. Use `ref` names so later calls can target layers. Every part that exists as a component goes in as `{ "type": "instance", "component": "<name>" }` with its `variant`/`props` — copy the instance spec from `COMPONENTS.md`; never redraw it with frames and text. `build` warns when a layer is a hand-drawn copy of an existing component — replace it with the instance it names. Drew something first and only then saw it should be a component? `edit` `to-component` on that layer (an instance stays in the screen), don't `create_component` a second copy.
5. **Prove the components are used.** After each section and at the end, re-read `COMPONENTS.md`: every component you made this task shows usage > 0. *Unused* means a screen still has a hand-drawn copy (`edit` `swap` it to the instance) or the component wasn't needed (Trash it).
6. **Look.** `build` returns a screenshot for top-level work; otherwise call `screenshot`. Check: clipped or overflowing text, collapsed widths, overlaps, alignment, spacing rhythm, hierarchy, contrast. Fix with `edit` before moving on.
7. **Audit.** `lint` on the finished frame; fix errors and warnings (use `fix: true` for exact token matches).
8. **Report.** What you made and where (page, names + ids), decisions taken, images waiting (the prompts file), open questions. Record lasting decisions with `brief` (append); when the identity changed, `workspace sync`.

## 3. Where things go — one structure in every file

Pages have **English names** and one purpose each. A page is created the moment the first thing goes on it
(`page` on `build` / `create_component`) — never ahead of time, and never left empty: an untouched "Page 1"
is renamed instead of kept, and a page the tool created disappears when its last layer is deleted.

| Page | Holds |
|---|---|
| `App` — one page per app when there are several: `App – Customer`, `App – Driver` | the mobile app's screens |
| `Web` | website / landing pages — each desktop frame with its tablet/mobile frames beside it |
| `Dashboard` | admin and dashboard screens |
| `Banners` | banners, social posts, ads |
| `Components` | one auto-layout board: every component and variant set in category frames, the Icons category, foundation docs if any — no screens |
| `References` | references the user sent or you found (Dribbble, Behance, Pinterest…): `Reference – <what> (<source>)` — full image, the cropped part you use, a note with the source URL |
| `Trash` | everything deleted, restorable |

Other purposes get a short English page of their own (`Emails`, `Print`, `Presentation`). If the file already has
its own structure, extend it and don't rename the user's pages. New pages are ordered content first, then
Components, References, Trash.

- **Components always live on `Components`, inside one auto-layout board.** The tool keeps that board: `create_component` and `to-component` put a component named `Forms/Input` into the board's `Forms` category (created on first use) and an ungrouped name into the board itself; `parentId` picks another category frame. Icon components (`icon/<set>/<name>`) go into the board's `Icons` category by themselves — never a separate icons frame beside the board. Move existing loose components into the board without recreating them; grow the existing board and categories instead of making a new board.
- **One frame per screen** (and per state: `Home`, `Home – Empty`). Changing a screen changes that frame — `edit`, or `build` with `replaceId` (the old version goes to Trash). Never a second copy ("Home 2", "Home – new", a separate mobile redraw); `build` refuses a same-name twin on the page.
- **Designs use the same nested structure.** On each design page, keep one large auto-layout board. Inside it, use auto-layout frames for flows or design groups (`Onboarding`, `Checkout`, …); place the exact-device-size screen/state frames inside those groups in flow order. Build the board and group first, then build each screen with `parentId` set to its group. Move existing loose screens into the groups without redrawing them. The board and groups hug their contents; screens keep their own fixed device width and intended height. Use `gap` and `pad` for spacing, not canvas coordinates or Sections as layout containers.
- **Deleting moves to Trash** (`edit` `delete`; `restore` puts it back where it was). Real deletion (`permanent: true`) or emptying the Trash only when the user asks. Nothing is built on the Trash page.
- **References** go on `References` before you design from them ([references/design.md](references/design.md), § References).
- **Images that don't exist yet** carry a full generation brief — a reference image, every field, every element; never a two-word prompt — (or `supply` for the user's own files) and are listed in the workspace's `IMAGE_PROMPTS.md` ([references/image-prompts.md](references/image-prompts.md)).

### The workspace — one folder per Figma file in the project

The first design change to a file (`build`, `create_component`, `variables`, `styles`, `image_prompts`) opens
`<project>/design/<file>/` in the folder the session works in (the tool says so once; `status` shows it; matched by
file key, so a renamed file keeps its folder). Everything the design produces outside Figma lives there:

| In the workspace | What |
|---|---|
| `COMPONENTS.md` | every component and variant set: variants, properties, how many designs use it, the instance spec to place it — rewritten by the tool after every component change; **read it before building** |
| `DESIGN.md` | the identity, generated from Figma by `workspace sync` (the part between the markers); the user's notes below it are kept |
| `tokens/` | `tokens.css`, `tailwind.css`, `tokens.json` (DTCG) — same names as the variables |
| `references/` | the `References` page exported + `REFERENCES.md`; reference files the user gives you go here first |
| `IMAGE_PROMPTS.md`, `previews/` | images to make, each with a screenshot of where it goes |
| `images/`, `assets/` | generated images come back to `images/`; the user's own files (logo, product photos) go to `assets/` |
| `library/`, `LIBRARY.md` | images collected from the web or the user, each with what it shows, size and license; also on the Figma page `Library` — **check it before searching for images again** |

`workspace sync` also writes a small project skill (`.claude/skills/<file>-design` and `.agents/skills/<file>-design`)
that sends every agent working in the project to `DESIGN.md`. **Run `workspace sync` after the identity changes** —
tokens, styles, components, the brief's `## Identity` block, references — and before handing work to code.
Figma is the source of truth: never edit the generated part of `DESIGN.md` or the tokens by hand.

## 4. Building — the spec in one screen

`build` takes one JSON tree (`build { page: "App", spec: … }`). Full vocabulary and examples: [references/build-spec.md](references/build-spec.md). The essentials:

```json
{
  "type": "frame", "name": "Sign in", "device": "iphone-16", "fill": "$color/bg/default",
  "pad": [64, 24, 32, 24], "gap": "$space/6", "align": "stretch",
  "font": { "family": "Inter" }, "color": "$color/text/primary",
  "children": [
    { "type": "text", "ref": "title", "text": "Welcome back", "style": "Heading/H1" },
    { "type": "text", "text": "Sign in to continue", "style": "Body/MD", "color": "$color/text/muted" },
    { "type": "image", "name": "Welcome illustration", "w": "fill", "h": 180, "prompt": "Purpose: …\nReference: references/IMG-001-ref-….jpg (URL) — take: …; leave: …\nSubject: …\nElements:\n  - …\nSetting: …\nComposition: … (every field — image-prompts.md)" },
    { "type": "instance", "component": "Input", "variant": { "State": "Default" }, "props": { "Label": "Email" } },
    { "type": "row", "gap": 8, "align": "center", "children": [
      { "type": "icon", "icon": "lucide:shield-check", "size": 16 },
      { "type": "text", "text": "Secure login", "size": 13 }
    ]},
    { "type": "instance", "component": "Button", "variant": { "Type": "Primary" }, "props": { "Label": "Sign in" }, "onClick": "Home" }
  ]
}
```

- Frames are **auto layout by default** (`dir: column`); `dir: "row" | "grid" | "none"`. Sizes: number, `"fill"`, `"hug"` (default for frames).
- **The page canvas** turns a neutral gray the first time a design lands on a page, so screens stand out (a canvas the user picked is kept; `edit` `{op: "page", name, background: "#…"}` sets one).
- **iPhone screens look like the phone** by themselves (radius, bezel, status bar, home indicator — ignored by code export); keep 54 px free at the top. `mockup: false` for a plain frame.
- **Related things share one auto-layout frame** (a card's parts, a label and its field, a row of buttons), nested like the content; `build` warns about hand-placed groups of children.
- **Exact sizes:** `device` sets the frame size — `mobile`/`iphone-16` 393×852, `iphone-16-pro` 402×874, `android` 412×917, `ipad` 820×1180, `desktop` 1440×1024, `instagram-post` 1080×1080, `instagram-story` 1080×1920, `ad-medium-rectangle` 300×250… (all in build-spec.md). One size for every screen of a product; long screens keep the width and grow in height (`h: "hug"`, `minH` = the device height).
- `align: "stretch"` makes children fill the cross axis. A `fill` child needs a parent with a real size on that axis — a hugging parent collapses it (build warns you).
- Text wraps only with a width (`w: "fill"` or a number); otherwise it is one auto-width line.
- `"$name"` binds a variable, `"@Name"` uses a style; both must exist (build checks every name first and suggests corrections).
- `font`, `color` and `rtl` set on a container are inherited by the text and icons inside it.
- Icons: `"icon": "set:name"` from Iconify (`icons` tool to search). The set and style (line/filled/duotone, weight, size, container) are taken from the references, never `lucide` by habit ([references/design.md](references/design.md), § Icons follow the references too). They become reusable components `icon/<set>/<name>` in the Icons category of the Components board; the instance takes `color` and `size`. An icon that belongs to a component (a button's leading icon, an input's search glyph, a tab's icon) is an `icon` child **inside that component's auto layout** — with a boolean or instance-swap property when it varies — never an icon laid next to the instance in the screen.
- Images: `src` = absolute file path or URL (PNG/JPG/GIF). An image that doesn't exist yet: `{ "type": "image", "name": "<what it is>", "prompt": "<the full brief: reference image, every field, every element>" }` → a gray placeholder with an id (IMG-001); then `image_prompts` (it flags incomplete briefs).
- Nothing is created if validation fails; if Figma fails mid-way the partial result is removed. Read `warnings` in every result.

## 5. Editing

`edit` runs ops in order and stops at the first failure (it tells you which ops were applied):
`set` (any build prop on existing layers, incl. `prompt`), `text`, `rename`, `delete` (→ Trash), `restore`, `move`, `duplicate`, `insert` (build a child into a parent), `wrap` (put layers into a new auto-layout frame), `unwrap`, `swap`, `detach`, `reset`, `to-component`, `combine-variants`, `group`, `ungroup`, `flatten`, `boolean`, `select`, `page`, `place-image`.

- Read before you write: `get_node` shows what is set (and which variable/style is behind each value).
- Change the smallest thing that fixes the problem. Rebuilding a whole frame loses the user's manual tweaks.
- For many similar edits, one `edit` call with many ops beats many calls.

## 6. Escape hatch: `execute`

For what the tools don't cover (vector math, bulk renames, exotic properties). Plain JavaScript,
top-level `await` and `return`; `h` helpers: `node`, `build`, `set`, `loadFonts`, `font`, `variable`,
`component`, `style`, `solid`, `bindFill`, `bind`, `focus`, `place`, `inspect`, `page` (get/create a page by
name), `trash` (delete the Trash way — never `node.remove()` on the user's content). The file uses dynamic page
loading — always the async APIs. Rules and pitfalls: [references/execute.md](references/execute.md).

## 7. Non-negotiables

- **Never write into the figma-mcp tool folder.** Exports, tokens, prompt files and code go into the user's project (absolute paths). The server refuses writes there, and in Claude Code a hook blocks edits there too.
- **Don't destroy.** Deleting means Trash. New work goes next to existing work. Ask before deleting or rebuilding anything you didn't create.
- **No duplicates.** One frame per screen, one component per thing; update instead of copying.
- **A component is made to be used.** Make it before the screens that need it, and build those screens from its instances. After `create_component` (or `to-component`), replace every hand-drawn copy with an instance (`search` by name → `edit` `swap`). A component listed as *unused* in `COMPONENTS.md` is unfinished work: use it where it belongs, or move it to Trash when it isn't needed. Never report a task where you created components and the screens don't use them.
- **After an error, look before retrying.** `TIMEOUT` and `PLUGIN_DISCONNECTED` mean the change may be partly applied: `get_metadata`/`screenshot` first.
- **Never report a visual result you have not seen** (screenshot).
- Speak the user's language (Egyptian Arabic when they do); keep page names, layer names, tokens, prompts and code in English unless the file already uses another language for layers.
