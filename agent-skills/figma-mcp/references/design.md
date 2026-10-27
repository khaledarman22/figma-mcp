# Designing with principles

This guide does not prescribe colors, fonts, radii or a style. It prescribes **how the work is done**, so
that whatever direction the product takes, the result is consistent, buildable and easy to hand to code.
The visual language comes from (in this order): what the user says → the brand/brief → the file's existing
design → the references merged from the board ([references.md](references.md)) → a direction you propose and the user approves. Once it is written down as the
file's identity, it governs every screen and banner ([identity.md](identity.md)).

## The method

### 1. Understand before drawing
- Read the stored brief (`brief` get). No `## Product` block, or the task enters a new area → the request analysis ([analysis.md](analysis.md)): product & audience · the job of this screen/flow · pages and sections with their content · platform & device size · primary action · constraints (brand, accessibility, RTL, existing code) · assumptions · search queries per section.
- How many products? One mobile app → page `App`; two apps (customer + driver) → `App – Customer` and `App – Driver`; plus `Web` / `Dashboard` / `Banners` as needed (main skill, §3).
- New screen/section/page/banner → references first ([references.md](references.md)): the lettered board, the automatic merge into crops, then you build — in the same turn. Not for changes, states or fixes of existing screens.
- Ask only questions whose answers change the design. Otherwise state assumptions and proceed.
- Save what you learn and decide: `brief` set (once) / append (each decision: device size per product, pages, art direction). The next session starts from it.

### 2. Reuse before you create
- `status` shows the pages; `get_design_system` the variables, styles, components and their variants; `get_metadata` on existing screens the layout patterns, spacing and naming in use.
- Extend the file's language: same tokens, same components, same naming, same density, same device size. Never introduce a parallel color, a one-off font size or a look-alike component.
- Libraries: if the file uses library components/variables, keep using them (instances of library components appear in `get_metadata`).

### 3. Foundations before screens
If the file has no system for what you need, create the minimum foundations first ([design-system.md](design-system.md)):
color primitives + semantic roles (with modes when themes are needed), a spacing scale, radii, a type scale as text styles, elevation as effect styles. Derive every value from the direction you agreed — not from defaults.
Then every screen value is a token (`$…`) or a style (`@…`). Raw hex and off-scale numbers are the exception, and only when a token truly doesn't exist yet (then add the token).

### 4. Structure is auto layout, at exact sizes
- Every container is an auto-layout frame (rows, columns, grids). Spacing is `gap`/`pad`, never manual nudging.
- Decide sizing intentionally: **fill** for things that stretch with the screen, **hug** for things sized by content, **fixed** only for real constraints (icons, avatars, media ratios, max widths).
- Free positioning only for overlays: badges, floating buttons, decorations (`absolute` + constraints).
  **Following a reference closely is never a reason for `dir: "none"`** — a hero, a split layout or a collage is
  rows and columns with gaps, fixed widths and `fill`; only a background photo or a badge over it is absolute.
  `build` says "Not auto layout: …" when parts are placed by x/y — rebuild those with rows/columns.
- **Direction (Arabic RTL, English LTR)** — set `rtl: true` once on the screen (or section component) root; it is
  inherited, also by anything built inside it later (`parentId`, `insert`). Write children **in reading order**
  (first = where reading starts: the right in Arabic) — never pre-mirror them by hand, the tool does it, and doing
  both mirrors twice. Use logical values: `justify`/`align`/`textAlign` `start`/`end` (start = right in RTL), never
  `left`/`right` for text that follows the language. Icons that point (arrows, chevrons, "next") point toward the
  reading direction: make both sides as icon components (`arrow-left` and `arrow-right`) so mirroring can swap them.
- **Both languages** — one design, two directions, not two designs: the components get a `Dir` variant
  (`edit` `mirror` with `addVariant: true` on the component set → `Dir=RTL` + its mirrored `Dir=LTR`); the other
  language's page is the page duplicated (`edit` `duplicate`) and mirrored (`edit` `mirror`, `dir: "ltr"`) — rows
  reverse, alignment flips, instances switch to their `Dir=LTR` variant — then its texts replaced with the real
  copy (`text`). Name them `Home – AR` / `Home – EN` side by side. A warning that an instance "can't be rearranged"
  means its component still needs the `Dir` variant.
- **Screens are plain top-level frames sized with `device`** — one size for every screen of a product, kept in the brief: an iOS or cross-platform app → `iphone-16` (393×852) unless the file already uses another; Android-only → `android` (412×917); tablet → `ipad`; web and dashboards → `desktop` (1440×1024); banners and posts → their format (`instagram-post`, `instagram-story`, `facebook-post`, `x-header`, `ad-medium-rectangle`…). No device mockups or bezels around screens.
- Long screens keep the device width and grow in height with the content (`h: "hug"`, `minH` = the device height); header and tab bar `fixed: true` so they stay put while the rest scrolls.
- A responsive web page is one desktop frame with its tablet/mobile frames **beside it on the same page**, built from the same components (a size/breakpoint variant where a component changes shape) — never a parallel set of "mobile" components or a separate copy of the design.
- Name every layer for what it is ("Header", "Order summary", "Price row") — names become code.

### 5. One of each thing
- One frame per screen and per state; one component per thing. To change a screen, change it (`edit`), or rebuild it with `replaceId` (the old version goes to Trash) — never "Home 2", "Home – new" or a second redraw beside the first. `build` refuses a same-name twin on a page; that refusal means *update the existing one*.
- **Component first — nothing is drawn straight onto a page.** Every part goes into a component on the `Components`
  page first, then an instance goes on the page: the buttons, inputs, icons and cards, **and every section**
  (`Section/Nav`, `Section/Hero`, `Section/Services`, … built from instances of the smaller ones). The page frame
  is a column of section instances. Variants for what changes: `Dir` (RTL/LTR) for a product in two languages,
  `Device` (Desktop/Mobile) when the section changes shape, `Tone` (Light/Dark), states. A change to a section is a
  change to its component (it updates every page that uses it); per-page content is an override (text, image,
  instance swap). `build` says when a section or a repeated part was built as plain frames.
- A pattern used twice is a component (or an instance of an existing one). Screens are built from instances, not copies. Components live on the `Components` page.
- Variants for visual states and sizes; text/boolean/instance-swap properties for content. Interactive states (hover/pressed) are wired in the component.
- Never detach to make a one-off change; add the variant or property instead.

### 6. Real content, every state, honest images
- Real copy and data in the product's language (Arabic → RTL + an Arabic-capable font; check `fonts`). Vary lengths: long names, big numbers, empty values.
- Design the states, not just the happy path: empty, loading (skeleton), error, success, disabled, offline, permission, first-time — each its own frame named `Screen – State`.
- No lorem ipsum. Every image you can't supply is a placeholder at its real size with a complete generation `prompt` — or a free stock photo when the brief says so; when the screen is done run `image_prompts` and tell the user where `IMAGE_PROMPTS.md` is (how: [image-prompts.md](image-prompts.md)). When they send the images, `place_images`.

### 7. Hierarchy, rhythm, access
- One primary action per screen; secondary actions visibly secondary.
- A clear type scale (few sizes, consistent line heights); a spacing scale (4/8-based unless the file says otherwise); consistent alignment edges.
- Contrast ≥ 4.5:1 for text (3:1 large), touch targets ≥ 44 px on mobile (≥ 24 px minimum anywhere), visible focus and pressed states, icons with labels when meaning isn't obvious.
- Responsive intent: show how the layout adapts (key breakpoints using the same components and tokens).

### 8. Build in sections, look, fix
- One meaningful region per `build` (header, form, list…), using refs. Look at every result (`screenshot`): clipped text, collapsed widths, overlaps, misalignment, crowding, weak hierarchy. Fix with `edit` before continuing.
- At the end: `lint` the frame — fix contrast, collapsed/clipped text, raw values (`fix: true` binds exact token matches), missing auto layout, generic names. Image placeholders show up as reminders, not errors.
- Never say it's done from code alone.
- Stop when the request is done and the checklist passes. More rounds need a concrete remaining problem — not moving things around or adding embellishment in pursuit of taste.

### 9. Organize and don't destroy
- Pages by purpose with English names, created only when something goes on them (main skill, §3): `App` (or one per app), `Web`, `Dashboard`, `Banners`, `Components`, `References`, `Trash`.
- On a page: screens in flow order left → right; several flows → one Section per flow, named after the journey ("Onboarding", "Checkout"); screens named `Screen` / `Screen – State` ("Payment – Error").
- Deleting moves layers to `Trash` (restorable). Ask before deleting or rebuilding what you didn't create. New work goes beside existing work.

### 10. Communicate
- Report: what was made (page, names + ids), which existing assets were reused, what was added to the system, images waiting (path of `IMAGE_PROMPTS.md` and how many), open questions.
- When the direction is open, offer 2–3 genuinely different directions (layout/concept), each built properly — not three color swaps. Directions are alternatives the user chooses between, named `Home – Direction A/B`; the ones not chosen go to Trash.

## References

A reference the user sent, "design it like this", or "find references" → [references.md](references.md): the
references go on a lettered board on `References`, you merge them automatically (what to take from each → crops) and rebuild closely in the identity
(no write-up), then make the changes they ask for. References never go inside screens, and their images never
become product images.

## Screen recipe

1. `status` → `brief` → `get_design_system` → `get_metadata` (neighbouring screens, same page).
2. New screen → analysis ([analysis.md](analysis.md)) → `references` board → the user's letter ([references.md](references.md)). Then plan: page, device, sections top→bottom, components per section, tokens, states, images.
3. Components first (Component first, §5): the small parts from their crops, then one component per section
   (`create_component` `Section/Hero`, `rtl` on its root, variants it needs) — `screenshot` each.
4. `build` the screen on its page (`page: "App"`, `device`, `rtl` for Arabic): background token, `align: "stretch"`,
   and the sections as instances in order (`{ "type": "instance", "component": "Section/Hero" }`), `fixed` bars.
   Content that differs per page → instance overrides (`props`), not detached copies.
5. `screenshot` after each region → `edit` fixes.
6. States as their own frames (`edit` duplicate, then `rename` to `Screen – State` and `set` the changes).
7. Wire the flow ([prototype.md](prototype.md)) when there is more than one screen.
8. `lint` → fix → final `screenshot` → `image_prompts` if images are waiting → report → `brief` append decisions.

## Checklist before you report
- [ ] On the right page (English name, created only for this); components on `Components`; nothing left on an empty page.
- [ ] Every screen at the product's exact device size; one frame per screen/state; no duplicates or copies.
- [ ] Every container uses auto layout; no stray absolute layers except intentional overlays.
- [ ] Every section on the page is an instance of a `Section/…` component; every repeated part is an instance.
- [ ] Direction: `rtl` on the root, children in reading order, text `start`-aligned follows it; arrows point the
      reading way; a two-language product has `Dir` variants and an AR and an EN page.
- [ ] Colors, spacing, radii, type come from variables/styles; no orphan values.
- [ ] Repeated things are instances of components; nothing detached.
- [ ] Real content; long/short/empty cases considered; states designed where they matter.
- [ ] Every missing image is a placeholder with a full prompt, and `IMAGE_PROMPTS.md` is up to date.
- [ ] Hierarchy is obvious; one primary action; aligned edges; consistent spacing rhythm.
- [ ] Contrast and target sizes pass (`lint` clean of errors).
- [ ] You looked at the final screenshot.

## Avoid
- A default "AI look" imposed on every product (same gradient hero, glass cards, random shadows, emoji icons). The product's own direction decides.
- Hardcoded hex/px when a token exists; one-off text sizes; spacing values off the scale.
- Rectangles pretending to be layout; groups as containers; text boxes resized by hand.
- Placeholder text, fake data that doesn't fit the product, icons from mixed sets, random stock images.
- Rebuilding a whole screen to change one thing; copies of a screen instead of updating it.
- Pages made "for later", pages in mixed languages, components scattered across screen pages.
- Every content group in a bordered card; a centered card as the default layout; color spread timidly and evenly instead of placed with intent; things that look clickable but aren't.
- Fixing a layout by cutting the user's content or softening their claims; inventing a new concept for a routine change.
