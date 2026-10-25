# Design → code, with principles

`get_design_context` gives an exact **spec**: layout mirroring Figma's engine, every bound token as
`var(--token, fallback)`, components, assets, interactions and a screenshot. Your job is to turn that spec
into code that belongs in *this* project — same framework, same components, same tokens, same conventions —
and that behaves correctly at every size.

## 1. Understand the target project (before pulling anything)
- Framework and language (package.json, tsconfig), styling system (Tailwind? version and config; CSS modules; styled-components; plain CSS), component library (shadcn/ui, MUI, internal `components/`), icon package, routing, i18n/RTL support, where assets live (`public/`, `src/assets`).
- Existing tokens: CSS variables, Tailwind theme, theme files. Existing components that match the design's components.
- Conventions: file structure, naming, how similar screens are written. Read one or two comparable files.
- A `DESIGN.md` (or a design-system skill) in the project is the identity for code: follow it ([identity.md](identity.md) §6).
- Stop exploring once you know the stack, the primitives to reuse and how you will verify.
- If `ui-ux-pro-max` is installed, `--stack <stack>` gives stack-specific UI rules (design.md, Design knowledge).

## 2. Tokens once, first
- `export_tokens` in the project's format (`tailwind` for Tailwind v4, `css` otherwise, `dtcg` for token pipelines) — write to the project's theme file only when the project has no equivalent yet, or reconcile with the existing one.
- If the project already defines the same tokens under other names, map them: the design-context code uses `var(--figma-name)`; replace each with the project's token/class. Never paste raw hex/px where a token exists.
- Text styles → the project's typography utilities/components. Fonts → make sure they load.

## 3. Components: reuse, then build what's missing
- From `get_design_system` (or the Components section of a design context) list the Figma components the screen uses.
- For each: existing code component? → pass a `componentMap` so the context emits `<Button variant="…">` instead of internals (and `instances: "reference"` for big screens). Missing? → implement it once as a real component from its component set: variant axes → props, boolean/text/instance-swap properties → props/children/slots, interactive variants → states (`:hover`, `:active`, `disabled`, focus ring).
- Icons named `icon/<set>/<name>` come from Iconify sets — use the project's icon package (`lucide-react` for `lucide`, etc.) instead of exported SVGs when available.

## 4. Pull section by section
- `get_metadata` on the screen → pick sections (header, content blocks, footer).
- `get_design_context` per section with `assetsDir` = the project's asset folder (absolute path) so images/SVGs are written there and the code references them; keep `screenshot` on.
- Very large frames: lower `maxNodes`, follow the "more children" notes.

## 5. Adapt — the rules
- **Layout semantics stay**: auto layout → flex/grid; `fill` → `flex-1`/`w-full`/`self-stretch`; `hug` → content size; fixed sizes only where the design means them (icons, avatars, media, max-widths). Never hardcode the artboard width: a 390 px screen is "the viewport".
- **Responsive**: when the file has several breakpoints, derive the breakpoint rules from their differences; otherwise make the layout fluid and choose sensible breakpoints (and say so).
- **Semantic HTML & accessibility**: real `button`/`a`/`input`/`label`/`nav`/`main`/`h1–h6`, alt text, accessible names for icon buttons, focus states, keyboard reachability, `dir="rtl"` for Arabic.
- **Tokens, not values**; **components, not copies**; no `data-node-id` attributes in final code unless the project wants them.
- **Text**: real strings go through the project's i18n if it has one; respect truncation (`line-clamp`) and wrapping as designed.
- **Interactions**: prototype links become routes/handlers; overlays become modals/sheets; hover/pressed variants become CSS states. `prototype` with `read: true` lists the flow.
- **States**: implement the empty/loading/error states that exist in the file (look for screens named `… – Empty`, `… – Error` or `… / Empty`).
- **Images not generated yet**: the assets list marks them `NOT GENERATED YET (IMG-…)` and the code points at their future file. Keep the path, keep the box's size/ratio, and tell the user which images are still waiting (`IMAGE_PROMPTS.md`; `place_images` puts them into Figma, then export again).
- **Where to look**: screens live on `App` / `Web` / `Dashboard` pages, components on `Components`; ignore `Trash` and `References`.
- Don't add dependencies (e.g. Tailwind) the project doesn't use; translate the reference code instead.
- **Scope**: change the requested screens and components. Touch a shared primitive only when it is the cause or the result needs it, then check its other users.
- **Content is a constraint**: copy, claims and behavior come from the design and the product; don't solve a layout problem by dropping content. No loading states or async behavior for content that is static.

## 6. Verify
- Run the app (use the project's run skill / dev server) and compare against the design screenshot at the same width: spacing, alignment, type, colors, radii, states. Fix differences; small deviations need a reason (platform conventions, accessibility).
- Check other widths and RTL if relevant, with realistic data: long names, many rows, empty values, keyboard focus.
- A passing build, typecheck or unit test is not proof of the visual result. If the real screen can't be opened, say so and what you checked instead.
- Report: files created/changed, tokens/components added, deviations and why, anything needing the designer.

## Quick reference
```
status → get_design_system → export_tokens(format) → get_metadata(screen)
→ get_design_context(section, assetsDir, componentMap) ×N → implement → run & compare → report
```
