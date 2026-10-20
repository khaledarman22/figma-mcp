# execute — Plugin API code inside Figma

Use when `build`/`edit`/the other tools can't express the change. The code runs in the plugin's main
thread with the full Plugin API.

## Contract
- Plain JavaScript (no TypeScript). Top-level `await` and `return` work — do not wrap in an IIFE.
- The return value comes back as JSON (nodes become `{id, name, type}`); `console.log` lines come back too.
- **Return every id you created or changed** — the next call needs them (no state survives between calls).
- `params` (tool argument) is available as `params`.
- Default timeout 60 s (max 300 s). A timeout does not stop a running script; look at the canvas before retrying.
- A synchronous infinite loop freezes the plugin (the user must close and re-run it). Keep loops bounded.

## Helper kit `h`
| helper | does |
|---|---|
| `await h.node(id)` | node by id, clear error if missing (never hangs) |
| `await h.build(spec, {parentId})` | the build tool from code (no Iconify icons / file images here — pass `svg`) |
| `await h.set(nodeOrId, props)` | apply build props to an existing node (fonts loaded for you) |
| `await h.loadFonts(node)` | load every font used in a subtree before editing text |
| `await h.font(family, weight, italic)` | resolve + load a real FontName |
| `await h.variable("color/bg")` / `h.component("Button")` / `h.style("Heading/H1", "TEXT")` | lookups with suggestions |
| `h.solid("#2563EB", 0.5)` | SolidPaint |
| `await h.bindFill(node, "color/bg")` / `await h.bind(node, "itemSpacing", "space/4")` | variable bindings |
| `h.focus(nodes)` / `h.place(node)` | select+zoom / move to free canvas space |
| `await h.inspect(node)` | the get_node view of a node |
| `await h.page("App")` | the page by English name, created on first use (an untouched "Page 1" is renamed), and switches to it |
| `await h.trash(nodeOrIds)` | delete the user-facing way: move to the Trash page (restorable) |

Never `node.remove()` the user's content (use `h.trash`), never `figma.createPage()` directly (use `h.page`, so
pages are only created when used and stay in order), and put components on the `Components` page.

## Plugin API rules that bite
- **Dynamic page loading**: use `figma.getNodeByIdAsync`, `await figma.setCurrentPageAsync(page)` (never assign `figma.currentPage`), `await instance.getMainComponentAsync()`, `await node.setFillStyleIdAsync(id)` / `setTextStyleIdAsync` / `setEffectStyleIdAsync` / `setStrokeStyleIdAsync`, `await page.loadAsync()` before reading another page, `await figma.loadAllPagesAsync()` before whole-document searches, `await node.setReactionsAsync([...])` (reactions are read-only otherwise).
- **Fonts**: load before *any* text mutation (characters, size, style, appendChild of text into instances…). Style names are file-specific ("Semi Bold" vs "SemiBold") — use `h.font` or `figma.listAvailableFontsAsync()`.
- **Colors are 0–1**, paint `color` is `{r,g,b}` (alpha goes in `opacity`); variable COLOR values are `{r,g,b,a}`.
- **Paints/effects arrays are immutable**: clone, change, reassign. `setBoundVariableForPaint` returns a new paint.
- **Sizing order**: set `layoutMode` → `appendChild` into the auto-layout parent → `resize()` (resets sizing to FIXED) → then `layoutSizingHorizontal/Vertical = 'FILL' | 'HUG'`. `HUG` only on auto-layout frames or text; `FILL` only inside auto layout. `counterAxisAlignItems` has no STRETCH (use FILL on children).
- **Text that wraps**: `textAutoResize = 'HEIGHT'` + a width (FIXED via resize, or FILL in a sized parent).
- **width/height are read-only** — `resize()`; `resizeWithoutConstraints()` for sections and component sets.
- **New top-level nodes land at (0,0)** — `h.place(node)`.
- **Component properties**: `addComponentProperty` returns the generated key (`"Label#12:3"`) — use it in `componentPropertyReferences`. Properties live on the component set, never on a variant.
- **combineAsVariants** stacks variants at 0,0 — lay them out and `resizeWithoutConstraints` the set.
- **Variables**: new collections start with one mode named "Mode 1" (rename it); always set `scopes`; modes per collection are limited by the Figma plan.
- **detachInstance()** can change ancestor ids; re-find nodes afterwards.
- `figma.notify` works (the user sees a toast) but output must be returned, not shown.

## Example — rename generic layers under a frame
```js
const root = await h.node("12:34");
const renamed = [];
for (const n of root.findAll(n => /^(Frame|Rectangle|Group) \d+$/.test(n.name))) {
  const kind = n.type === "TEXT" ? "Text" : ("layoutMode" in n && n.layoutMode !== "NONE") ? (n.layoutMode === "HORIZONTAL" ? "Row" : "Column") : "Box";
  n.name = kind;
  renamed.push(n.id);
}
return { renamed };
```
