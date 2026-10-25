# Build spec — full vocabulary

Used by `build` (`spec`), `edit` (`set.props`, `insert.spec`, `wrap.spec`) and `create_component` (`spec`).
Keys are forgiving: CSS-ish names (`padding`, `borderRadius`, `justifyContent`, `background`, `fontSize`…) are
accepted and normalized; unknown keys produce a warning with a suggestion; invalid values produce an error
with the exact path (`spec.children[2].pad`). All problems come back together before anything is created.

## Contents
1. Node types
2. Layout (auto layout, grid, sizing, position)
3. Appearance (fill, stroke, radius, effects, opacity, modes)
4. Text (content, fonts, styles, segments, inheritance)
5. Instances and components
6. Icons, SVG, images
7. Interactions (inline prototype)
8. Tool options (build / edit / create_component / variables / styles / prototype)
9. Examples

---

## 1. Node types

| type | aliases | notes |
|---|---|---|
| `frame` | box, div, container, card, screen, stack | auto layout `column` by default |
| `row` / `column` / `grid` | hstack / vstack, col | a frame with that `dir` |
| `component` | | like frame; can define `props` (§5) |
| `text` | label, heading, p, span, title | needs `text` (or `segments`) |
| `rect` | rectangle, shape | default 100×100 |
| `ellipse` | circle, oval | |
| `line` | | `color` = stroke color, `w` = length |
| `polygon`, `star` | triangle | |
| `svg` | vector | `svg` markup (needs width/height/viewBox) |
| `icon` | | `icon: "set:name"` (Iconify) |
| `image` | img, photo | `src`, or `prompt` for an image that doesn't exist yet, or `supply` for one the user hands over |
| `instance` | use | `component` (+ `variant`, `props`, `overrides`) |
| `group` | | prefer frames; groups have no layout |
| `section` | | only on a page or in another section |

`type` can be omitted: `text` ⇒ text, `component` ⇒ instance, `icon` ⇒ icon, `svg` ⇒ svg, `src`/`prompt`/`supply`/`placeholder` ⇒ image, otherwise frame.

Common to all: `name` (always give meaningful names), `ref` (your handle — returned in `ids`, usable by interactions and later calls in the same request), `visible`/`hidden`, `locked`, `opacity` (0–1 or `"50%"`), `rotation`, `blend` (multiply, screen, overlay…), `annotations: ["dev note"]`, `description` (components only).

## 2. Layout

### Auto layout (frames, components)
| key | values |
|---|---|
| `dir` | `column` (default) · `row` · `grid` · `none` (free positioning) |
| `gap` | number · `"$space/4"` · `"auto"` (= space-between) |
| `pad` | `16` · `[v, h]` · `[t, h, b]` · `[t, r, b, l]` · `{x, y}` · `{top, right, bottom, left}` — each a number or `"$var"` |
| `align` (cross axis) | `start` · `center` · `end` · `baseline` (rows) · `stretch` (children fill the cross axis) |
| `justify` (main axis) | `start` · `center` · `end` · `between` · `around` · `evenly` |
| `wrap` | `true` (rows only); `rowGap` = gap between wrapped lines; `alignContent: "between"` |
| `clip` | clip content (top-level frames clip by default; nested frames don't) |

### Grid
`{ "dir": "grid", "cols": 3, "gap": 24 }` — rows grow automatically; `rowGap`/`colGap` to differ. Children may set
`span: [rows, cols]` and `cell: [row, col]`.

### Sizing
`w`, `h`: a number (fixed), `"$size/var"` (fixed + bound), `"fill"` (take the free space — needs an auto-layout parent), `"hug"` (wrap content — auto-layout frames and text). Defaults: frames hug; text hugs (one line); shapes keep their size. `size: 48` sets both (on text it is font size; on icons the icon size). `minW`, `maxW`, `minH`, `maxH` (auto-layout frames and their children).

Collapse rule: a `fill` child inside a parent that *hugs* that axis has no space to fill → give the parent a size or make it `fill` too. Build warns when it sees this.

### Device sizes (`device`, alias `preset`)
Sets `w`/`h` exactly unless you pass them (`"device": "iphone-16", "h": "hug", "minH": 852` for a long screen). One size per product.

| Group | `device` → size |
|---|---|
| Phones | `mobile` / `iphone-16` / `iphone-15` 393×852 · `iphone-16-pro` / `iphone-17` / `iphone-17-pro` 402×874 · `iphone-16-plus` 430×932 · `iphone-16-pro-max` / `iphone-17-pro-max` 440×956 · `iphone-14` / `iphone-13` 390×844 · `iphone-se` 375×667 · `android` / `android-compact` 412×917 · `android-small` 360×800 · `android-medium` 700×840 · `android-expanded` 1280×800 |
| Tablets | `tablet` / `ipad` 820×1180 · `ipad-mini` 744×1133 · `ipad-pro-11` 834×1194 · `ipad-pro-13` 1032×1376 |
| Web | `desktop` / `web` / `dashboard` 1440×1024 · `laptop` / `macbook-air` 1280×832 · `macbook-pro-14` 1512×982 · `macbook-pro-16` 1728×1117 · `desktop-hd` 1920×1080 |
| Social | `instagram-post` 1080×1080 · `instagram-portrait` 1080×1350 · `instagram-story` 1080×1920 · `facebook-post` 1200×630 · `x-post` 1600×900 · `x-header` 1500×500 · `linkedin-post` 1200×627 · `linkedin-banner` 1584×396 · `youtube-thumbnail` 1280×720 · `youtube-banner` 2560×1440 |
| Display ads | `ad-leaderboard` 728×90 · `ad-billboard` 970×250 · `ad-medium-rectangle` 300×250 · `ad-large-rectangle` 336×280 · `ad-half-page` 300×600 · `ad-skyscraper` 160×600 · `ad-mobile-banner` 320×50 · `ad-large-mobile-banner` 320×100 |

**iPhone mockup (`mockup`, aliases `deviceFrame`, `chrome`).** A top-level screen with an iPhone `device` (`mobile`,
`iphone-13` … `iphone-17-pro-max`; not `iphone-se`) looks like the phone automatically: the display's corner radius, a
dark bezel drawn as an outside stroke (the frame keeps its exact size), and the status bar (time, Dynamic Island or
notch, signal, battery) and home indicator as instances of `Device/iPhone/Status bar` / `Device/iPhone/Home
indicator` (created on the Components page on first use; light or dark glyphs follow the screen's background). The
chrome sits on top, is ignored by `get_design_context` (no status bar, radius or bezel in code) and by `lint`.
Leave **≥ 54 px** at the top for the status bar (`pad` top, or a header that starts below it) — build warns otherwise.
`"mockup": false` builds a plain frame; `edit` `set` `{ "mockup": true | false }` adds or removes it on an existing
screen. Layers added later (`insert`, `move`) keep the chrome on top.

### Position
Inside auto layout children flow; to overlay something (badge, close button, decoration) use `"absolute": true` + `x`, `y` (relative to the parent) + `constraints: { "h": "left|right|center|stretch|scale", "v": "top|bottom|center|stretch|scale" }`.
Top-level frames are placed in free canvas space automatically unless you pass `x`/`y` (to the tool or the spec).

### RTL
`"rtl": true` on a container (inherited): rows are mirrored (write children in reading order), `start` alignment becomes the right side, text aligns right. Pair with an Arabic-capable font (check `fonts`).

## 3. Appearance

### fill (frames, shapes) — one paint or a list (bottom → top)
- `"#2563EB"`, `"#2563EB80"`, `"rgb(37 99 235 / .5)"`, `"hsl(…)"`, `"transparent"`
- `"$color/bg/surface"` — variable (bound, follows modes)
- `"@Brand/Primary"` — paint style
- `{ "color": "#000", "opacity": 0.4 }`
- `"linear-gradient(135deg, #7C3AED 0%, $color/brand 100%)"` or `{ "gradient": "linear|radial|angular|diamond", "angle": 180, "stops": [["#fff", 0], ["#000", 1]] }`
- `{ "image": "/abs/path.jpg", "fit": "fill|fit|crop|tile" }` (or `src` on the node)
- `null` / `"none"` — no fill (nested frames have no fill by default)

### stroke
`"1px solid #E5E7EB"`, `"2 dashed $color/border/strong"`, or `{ "color": "…", "weight": 1 | [t, r, b, l] | "$border/width", "align": "inside|center|outside", "dash": [4, 4], "cap": "round", "join": "round" }`, `null` to remove.

### radius
`12` · `"$radius/md"` · `[tl, tr, br, bl]` · `"full"` (pill).

### effects (alias `shadow`)
- CSS box-shadow syntax: `"0 1 2 0 rgba(0,0,0,.06), 0 4 12 -2 rgba(0,0,0,.12)"`, `inset` supported, colors may be `$vars`
- `[{ "type": "drop-shadow|inner-shadow", "x": 0, "y": 4, "blur": 12, "spread": -2, "color": "…" }, { "type": "blur", "radius": 8 }, { "type": "background-blur", "radius": 20 }]`
- `"@Elevation/2"` — effect style

### color
CSS meaning — the text color. On a container it is *inherited* by the text and icons inside; on `icon`/`svg`/`instance` it recolors the vector layers; on `line` it is the stroke; on `rect`/`ellipse`/`polygon`/`star` it is the fill.

### modes
`"modes": { "Theme": "Dark" }` — explicit variable mode for this subtree (e.g. a dark section or a dark variant of a screen).

## 4. Text

| key | |
|---|---|
| `text` | content (`\n` for line breaks) |
| `style` | text style name: `"Heading/H1"` (preferred when the file has styles) |
| `font` | `{ family, weight (100–900 or "SemiBold"), style ("Semi Bold Italic"), italic, size, lineHeight, letterSpacing, case, decoration }` or `"600 16/24 Inter"` |
| shorthands | `fontFamily`/`family`, `fontSize`, `fontWeight`/`weight`, `lineHeight` (`24`, `"150%"`, `1.5`, `"auto"`), `letterSpacing` (`-0.2`, `"-2%"`, `"0.02em"`), `textCase`/`uppercase`, `textDecoration`/`underline`, `italic` — all accept `"$vars"` where numeric |
| `color` | text color (or `fill`) |
| `textAlign` (or `align` on text) | `left`, `center`, `right`, `justify` |
| `valign` | `top`, `center`, `bottom` (fixed-height text) |
| `maxLines` / `truncate` | ellipsis after N lines / one line |
| `segments` | rich text: `[{ "text": "Total: " }, { "text": "EGP 1,240", "weight": 700, "color": "$color/text/strong" }, { "text": " terms", "link": "https://…" }]` |
| `link` | hyperlink for the whole text |

Fonts are resolved against what Figma has installed (weights mapped to real style names like "Semi Bold" vs "SemiBold"); an unknown family fails validation with suggestions. Default family: Inter, or whatever a parent's `font` says.

Width behavior: no `w` → single auto-width line; `w: "fill"` or a number → wraps, height grows; `h` number → fixed box.

## 5. Instances and components

```json
{ "type": "instance", "component": "Button", "variant": { "Type": "Secondary", "Size": "sm" },
  "props": { "Label": "Cancel", "Show icon": false, "Icon": "icon/lucide/x" },
  "overrides": { "Label": { "color": "$color/text/danger" }, "Icon/Vector": { "visible": false } },
  "w": "fill" }
```
- `component`: name of a local component or set (any page), a node id, a published key, or a library component already used on the page.
- `variant` picks the variant (validated against the set's axes); `"Type=Secondary, Size=sm"` works too.
- `props`: TEXT, BOOLEAN and INSTANCE_SWAP properties by their display name (swap value = component name/id).
- `overrides`: by layer name or `"Parent/Child"` path inside the instance — any build props.
- `color` on an instance recolors its vectors (icons).

Defining components in a build: `{ "type": "component", "name": "Tag", "props": { "Label": { "type": "text", "default": "New" }, "Show dot": { "type": "boolean", "default": true } }, "children": [ { "type": "ellipse", "w": 6, "h": 6, "bind": { "visible": "Show dot" } }, { "type": "text", "text": "New", "bind": { "text": "Label" } } ] }`. For variant sets use `create_component`.

## 6. Icons, SVG, images

- `{ "type": "icon", "icon": "lucide:arrow-right", "size": 20, "color": "$color/icon/default", "strokeWidth": 1.5 }` — default size 24; color defaults to the inherited text color. Keep one icon set per product (`icons` tool searches names). `build` option `icons: "inline"` makes plain vectors instead of reusable components.
- `{ "type": "svg", "svg": "<svg width='24' height='24' viewBox='0 0 24 24'>…</svg>", "color": "#111" }`
- `{ "type": "image", "src": "/Users/me/project/assets/hero.jpg", "w": "fill", "h": 240, "fit": "fill", "radius": 16 }` — local absolute path, URL or data URI; PNG/JPG/GIF (convert WebP first). With only `w` the height keeps the image's aspect ratio. `.svg` sources become vector nodes.
- `{ "type": "image", "name": "Hero photo", "w": "fill", "h": 240, "prompt": "Purpose: …\nReference: references/IMG-001-ref-….jpg …\nSubject: …\nElements:\n  - …\n…" }` (the full brief from image-prompts.md — every field, never a short phrase) — an image that doesn't exist yet: a gray placeholder captioned with its name and id (IMG-001). The same prompt shares one id. `image_prompts` writes all of them into `IMAGE_PROMPTS.md` in the project; `place_images` puts the generated files in. `placeholder: "<caption>"` changes the caption only. An image the user has and must hand over (logo, product or team photos, a screenshot of their app) is `{ "type": "image", "name": "Logo", "w": 120, "h": 40, "supply": "The brand logo, horizontal, transparent PNG or SVG" }` — same placeholder, listed under "from you" with the folder and file name to save it as; never write a generation prompt for real assets. On any existing frame/rectangle, `edit` `set` `{ "prompt": "…" }` marks it for a new image. How to write prompts: [image-prompts.md](image-prompts.md).

## 7. Interactions (inline)

Inside any spec: `"onClick": "Details"` (navigate to the top-level frame named Details, a ref from the same build, or an id), `"onHover"`, `"onPress"`, or
`"interactions": [{ "trigger": "click", "action": "overlay", "to": "Filter sheet", "transition": "move-in bottom 300ms ease-out" }]`.
Scrolling: `"scroll": "vertical"` on a screen; children with `"fixed": true` stay put (headers, tab bars).
Details and the full action list: the `prototype` tool / [prototype.md](prototype.md).

## 8. Tool options

**build**: `spec`, `page` (English page name — created on first use; components default to `Components`), `parentId` (frame/section/page), `index`, `replaceId` (swap a layer for the new one, same place; the old one goes to Trash), `allowDuplicate` (a same-name top-level layer on the page is refused otherwise), `x`, `y`, `icons`, `focus` (default true), `screenshot` (default true at top level). Returns `built`, `page`, `ids` (refs → node ids), `warnings`. For designs and the component catalog, build one auto-layout board on the page, build auto-layout groups inside it with `parentId`, then put each screen or component in its group with `parentId`; keep these containers set to `dir: "row"` or `"column"` and size them to hug content.

**edit** ops: `{op:"set", id|ids, props}`, `{op:"text", id, text}`, `{op:"rename", id, name}`, `{op:"delete", ids, permanent?}` (moves to the Trash page unless `permanent`), `{op:"restore", ids, parent?}`, `{op:"move", id|ids, parent?, index?, x?, y?}`, `{op:"duplicate", id, count?, parent?, index?, ref?}`, `{op:"insert", parent, index?, spec, ref?}`, `{op:"wrap", ids, spec?, ref?}`, `{op:"unwrap", id}`, `{op:"swap", id, component, variant?}`, `{op:"detach", ids}`, `{op:"reset", ids}`, `{op:"to-component", ids, name?, keepInPlace?}` (main component → Components page, an instance stays), `{op:"combine-variants", ids, name}`, `{op:"group", ids, name?}`, `{op:"ungroup", ids}`, `{op:"flatten", ids}`, `{op:"boolean", ids, operation: union|subtract|intersect|exclude}`, `{op:"select", ids}`, `{op:"page", name, create?, background?}` (`background: "#D4D4D8"` sets the page's canvas color), `{op:"place-image", id|ids, src, fit?}` (a real image into a placeholder).

**create_component**: `name`, `spec`, `props`, `variants: { axes, patches: [{when, set: {root|<ref>: props}}], exclude }`, `interactions: [{from, trigger, to, transition}]`, `description`, `page` (default: the Components board, in the category named by `Category/Name`), `parentId`, `x`, `y`, `gap`, `allowDuplicate`.

**image_prompts**: `outFile` (default `IMAGE_PROMPTS.md` in the workspace `design/<file>/`), `imagesDir` (default `images`), `assetsDir` (default `assets`, for supplied images), `scale` (default 2), `style` (shared art direction), `previews` (default true: a screenshot of each screen under `previews/`), `within`. **place_images**: `files` (`{"IMG-001": "/path"}`), `dir` (default: the `images` and `assets` folders), `promptsFile`, `fit`. **workspace**: `action: status | open | sync`, `skill` (default true), `references` (default true). **image_library**: `action: list | add | remove`; list: `query`, `orientation`, `minWidth`, `minHeight`; add: `items: [{src, title, description?, tags?, source?, author?, license?}]`, `upload` (default true → page `Library`); remove: `ids`.

**variables**: `collections: [{ name, modes?, hidden?, renameModes?, variables: [{ name, value | values: {Mode: v}, type?, scopes?, codeSyntax?, description?, hidden? }] }]`, `delete`, `deleteCollections`. Aliases: `"$name"` / `"$Collection:name"`.

**styles**: `text: [{ name, font | fontSize/lineHeight/…, description? }]`, `paint: [{ name, fill }]`, `effect: [{ name, effects }]`, `grid: [{ name, grids: [{ pattern: columns|rows|grid, count, gutter, offset, size, align }] }]`, `delete`.

## 9. Examples

### A settings list section (inside an existing screen)
```json
{ "type": "column", "name": "Account", "w": "fill", "gap": 0, "radius": "$radius/lg", "fill": "$color/bg/surface",
  "stroke": "1px solid $color/border/subtle", "clip": true,
  "children": [
    { "type": "row", "name": "Row / Profile", "w": "fill", "pad": [14, 16], "gap": 12, "align": "center", "onClick": "Profile",
      "children": [
        { "type": "icon", "icon": "lucide:user", "size": 20, "color": "$color/icon/muted" },
        { "type": "text", "text": "Profile", "style": "Body/MD", "w": "fill" },
        { "type": "icon", "icon": "lucide:chevron-right", "size": 16, "color": "$color/icon/muted" } ] },
    { "type": "rect", "name": "Divider", "w": "fill", "h": 1, "fill": "$color/border/subtle" },
    { "type": "row", "name": "Row / Notifications", "w": "fill", "pad": [14, 16], "gap": 12, "align": "center",
      "children": [
        { "type": "icon", "icon": "lucide:bell", "size": 20, "color": "$color/icon/muted" },
        { "type": "text", "text": "Notifications", "style": "Body/MD", "w": "fill" },
        { "type": "instance", "component": "Switch", "variant": { "State": "On" } } ] } ] }
```
→ `build` with `parentId` of the screen's content column.

### A responsive card grid
```json
{ "type": "grid", "name": "Products", "cols": 3, "gap": 24, "w": "fill",
  "children": [ { "type": "instance", "component": "Product card", "w": "fill", "props": { "Title": "Linen shirt", "Price": "EGP 950" } } ] }
```
(Repeat children with real, varied content — names, prices, lengths.)

### RTL screen header
```json
{ "type": "row", "name": "Header", "rtl": true, "font": { "family": "IBM Plex Sans Arabic" }, "w": "fill", "pad": [12, 16], "justify": "between", "align": "center",
  "children": [ { "type": "text", "text": "طلباتي", "style": "Heading/H3" }, { "type": "icon", "icon": "lucide:search", "size": 22 } ] }
```
