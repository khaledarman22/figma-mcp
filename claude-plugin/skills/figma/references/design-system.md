# Design system work

A design system is the contract between design and code. Build it so that every value has a name, every
name has one meaning, and every component reads like the code component it will become. Values come from
the product's direction; this guide only defines the structure and the method.

## 1. Discover, then extend
- `get_design_system` and look at existing naming (slashes, casing, English/Arabic), collections, modes, styles, component axes.
- If a system exists, **extend it in its own conventions**. Never create a parallel set of tokens or a second Button.
- The system is half of the product's identity; the other half (component catalog, section patterns, icon set, imagery, voice) and how to lock it so every request follows it: [identity.md](identity.md).
- If the project already has code tokens (CSS variables, Tailwind theme), mirror their names so design and code match (set `codeSyntax`).
- **Where it lives:** every component and variant set on the `Components` page, inside one large auto-layout board with named auto-layout category frames. The tool files it: name it `Category/Name` (`Forms/Input`) and `create_component` / `to-component` put it into that category of the board (created on first use); `parentId` overrides. Icon components land in the board's `Icons` category by themselves. Variables and styles live in the file's panels, not on a page. Never a component inside a screen page; a frame that should become a component → `edit` `to-component` (the main component moves to `Components`, an instance stays in place).

## 2. Variable architecture
| Layer | Collection | Contents | Scopes |
|---|---|---|---|
| Primitives | `Primitives` (1 mode) | raw palette (`blue/500`), spacing steps (`space/4` = 16), radii, font sizes | hidden: `"hidden": true` (scopes []) — never applied directly |
| Semantic | `Theme` / `Color` (modes: Light, Dark, brands…) | roles: `color/bg/default`, `color/bg/surface`, `color/text/primary`, `color/text/muted`, `color/border/subtle`, `color/action/primary`, `color/feedback/danger` … aliasing primitives | inferred from names (bg → fills, text → text fill, border → stroke) or explicit |
| Dimension | `Spacing`, `Radius` (or inside Semantic) | `space/xs…xl` or the numeric scale, `radius/sm|md|lg|full` | GAP, CORNER_RADIUS |
| Component (optional) | `Button`, … | `button/primary/bg` aliasing semantic | specific |

Rules:
- Screens and components use **semantic** tokens only; semantic tokens alias primitives.
- Name by role, not by value (`color/text/muted`, not `gray-500-text`).
- Modes are for alternate values of the same roles (Light/Dark, Brand A/B, Compact/Comfortable). The Figma plan limits modes per collection: the Starter (free) plan allows **one** mode ("Limited to 1 modes only"). Then keep the semantic names, ship the default theme and tell the user a second theme needs a paid plan — or, if they need it now, add a parallel semantic set (`color/dark/bg/default`, …) used only by the dark screens.
- Every variable gets explicit or inferred scopes (keeps pickers clean) and a WEB code syntax (`var(--color-bg-default)` by default) so get_design_context and export_tokens speak the same names.

### Example
```json
{ "collections": [
  { "name": "Primitives", "hidden": true, "variables": [
    { "name": "neutral/0", "value": "#FFFFFF" }, { "name": "neutral/950", "value": "#0A0A0B" },
    { "name": "blue/600", "value": "#2563EB" }, { "name": "blue/400", "value": "#60A5FA" },
    { "name": "space/4", "value": 16 }, { "name": "radius/md", "value": 10 } ] },
  { "name": "Theme", "modes": ["Light", "Dark"], "variables": [
    { "name": "color/bg/default", "values": { "Light": "$neutral/0", "Dark": "$neutral/950" } },
    { "name": "color/action/primary", "values": { "Light": "$blue/600", "Dark": "$blue/400" } } ] }
] }
```
(Values above illustrate structure only — derive the real palette from the brand.)

## 3. Styles
- **Text styles** for the type scale (`Display/LG`, `Heading/H1…H4`, `Body/MD`, `Body/SM`, `Label/MD`, `Caption`). Use `font: "600 32/40 <Family>"` and optional `$variables` for sizes/line-heights. One family (two at most), few weights.
- **Effect styles** for elevation levels (`Elevation/1…4`), shadows tinted with a token when possible.
- **Paint styles** only when the file already uses them or for gradients/images; prefer color variables.
- **Grid styles** for page grids (e.g. 4 cols mobile, 8 tablet, 12 desktop).
`styles` upserts by name; re-running is safe.

## 4. Components
Anatomy first: what is the root (auto layout), what grows (`fill`), what hugs, which parts are optional.

| Need | Use |
|---|---|
| Visual variation (type, size, state) | variant axes (`variants.axes`) |
| Show/hide a part (icon, badge) | boolean property + `bind: {visible}` |
| Editable text | text property + `bind: {text}` |
| Swappable part (icon, avatar, slot) | instance property + `bind: {swap}` |
| Hover/pressed behavior | `interactions` between variants |

Rules:
- One component per thing. To change it, update it (`edit` on the component or its variants) — a second "Button 2" / "Button new" is never the answer, and `create_component` refuses a same-name twin. Screen sizes are a variant/property of the same component (`Size=Mobile|Desktop`) when a component changes shape across breakpoints — not separate "mobile" components.
- Name components like code, with slashes for groups when there are many (`Navigation/Tab bar`, `Forms/Input`); arrange them in the matching auto-layout category frames inside the page's single auto-layout board. Use `gap` and `pad` to space categories and components.
- Root and every part bound to tokens; no raw values.
- Axis names and values read like code props: `Variant` (primary/secondary/ghost), `Size` (sm/md/lg), `State` (default/hover/pressed/disabled/focus). Keep matrices small; split very different things into separate components.
- Every component gets a `description` (what it's for, when not to use it).
- Icons are part of the component: `icon` children inside its auto layout (build makes them instances of the icon components), toggled with a boolean and swapped with an instance-swap property. Never leave the icon out and lay it next to the instance on the screen.
- **Extracted from a screen, then reused.** In screen work, components come out of sections that already match their reference: build the section, check it against the reference, then `edit` `to-component` the button / card / nav link and swap the copies. No component (and no kit of "probably needed" ones) before a section has shown it — only when the user asks for a UI kit itself.
- Verify the set: the tool returns a screenshot of the grid of variants; check every cell (text not clipped, states visibly different, sizes consistent).

### Example — button set from one base spec
```json
{
  "name": "Button",
  "description": "Primary actions. One primary button per view.",
  "spec": {
    "type": "row", "ref": "root", "pad": [12, 20], "gap": 8, "align": "center", "justify": "center",
    "radius": "$radius/md", "fill": "$color/action/primary", "color": "$color/text/on-action",
    "children": [
      { "type": "icon", "ref": "icon", "icon": "lucide:plus", "size": 18, "bind": { "visible": "Show icon" } },
      { "type": "text", "ref": "label", "text": "Button", "style": "Label/MD", "bind": { "text": "Label" } }
    ]
  },
  "variants": {
    "axes": { "Variant": ["Primary", "Secondary"], "Size": ["md", "sm"], "State": ["Default", "Hover", "Disabled"] },
    "patches": [
      { "when": { "Variant": "Secondary" }, "set": { "root": { "fill": "$color/bg/surface", "stroke": "1px solid $color/border/default", "color": "$color/text/primary" } } },
      { "when": { "Size": "sm" }, "set": { "root": { "pad": [8, 14], "gap": 6 }, "label": { "style": "Label/SM" }, "icon": { "size": 16 } } },
      { "when": { "State": "Hover", "Variant": "Primary" }, "set": { "root": { "fill": "$color/action/primary-hover" } } },
      { "when": { "State": "Disabled" }, "set": { "root": { "opacity": 0.4 } } }
    ]
  },
  "props": { "Label": { "type": "text", "default": "Button" }, "Show icon": { "type": "boolean", "default": false } },
  "interactions": [ { "from": { "State": "Default" }, "trigger": "hover", "to": { "State": "Hover" } } ]
}
```
Patches merge into the base by `ref` (`root` = the component itself); later patches win.

## 5. Documentation & handoff
- Foundation docs only when wanted: a `Foundations` frame on the `Components` page (left of the components) showing color roles (swatches bound to the tokens), the type ramp (text using each style) and spacing — built with `build`, so it updates when tokens change. No separate page for it.
- `export_tokens` (css / tailwind / dtcg) gives developers the same names; mention it in your report.
- Record system decisions in the `brief`.

## Checklist
- [ ] Every component on the `Components` page; no duplicates; nothing left on empty pages.
- [ ] Every component is used by the designs it was made for (`COMPONENTS.md`: none *unused*); no hand-drawn copies left.
- [ ] Semantic tokens alias primitives; screens/components use semantic tokens only.
- [ ] Scopes set; code syntax set; modes named (no "Mode 1").
- [ ] Type scale as text styles; elevation as effect styles.
- [ ] Components: auto layout, tokens, properties bound, descriptions, sensible axes, interactive states.
- [ ] Screenshot of each component set checked; `lint` clean.
