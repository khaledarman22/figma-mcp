# Designing with principles

This guide does not prescribe colors, fonts, radii or a style. It prescribes **how the work is done**, so
that whatever direction the product takes, the result is consistent, buildable and easy to hand to code.
The visual language comes from (in this order): what the user says → the brand/brief → the file's existing
design → a reference the user gave (or, when none, references you found and placed on `References`) → a direction you propose and the user approves. Once it is written down as the
file's identity, it governs every screen and banner ([identity.md](identity.md)).

## The method

### 1. Understand before drawing
- Read the stored brief (`brief` get). If there is none, or the task enters a new area, establish:
  product & audience · the job of this screen/flow · platform & device size · primary action · content that will really be there · constraints (brand, accessibility, RTL, existing code).
- A new product gets a short product brief first (with the user, a few questions at a time), saved with `brief` set:
  **pitch** (one sentence) · **problem** · **audience** (who, context of use) · **what makes it different** ·
  **platforms** · **features** as user stories ("as a … I want … so that …") · **per screen**: its job, the key
  content and the primary action. Keep the MVP scope realistic; the screens list comes from the stories.
- How many products? One mobile app → page `App`; two apps (customer + driver) → `App – Customer` and `App – Driver`; plus `Web` / `Dashboard` / `Banners` as needed (main skill, §3).
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
- Every container is an auto-layout frame (rows, columns, grids). Things that belong together — a card's image, title and price; a label and its field; a row of actions — sit in **one auto-layout frame**, nested as the content is nested. Spacing is `gap`/`pad`, never manual nudging. `dir: "none"` only for a canvas of overlays (`build` warns when related children are placed by hand); never a group as a container.
- Decide sizing intentionally: **fill** for things that stretch with the screen, **hug** for things sized by content, **fixed** only for real constraints (icons, avatars, media ratios, max widths).
- Free positioning only for overlays: badges, floating buttons, decorations (`absolute` + constraints).
- **Screens are frames sized with `device` inside auto-layout design groups** — one size for every screen of a product, kept in the brief: an iOS or cross-platform app → `iphone-16` (393×852) unless the file already uses another; Android-only → `android` (412×917); tablet → `ipad`; web and dashboards → `desktop` (1440×1024); banners and posts → their format (`instagram-post`, `instagram-story`, `facebook-post`, `x-header`, `ad-medium-rectangle`…). The page has one large auto-layout board; its named flow/group frames are auto layout too. Place screens inside those groups, preserving exact device dimensions. iPhone screens get the phone look by themselves — display radius, bezel, status bar and home indicator (build-spec.md, iPhone mockup) — so every mobile screen is presented the same way; leave 54 px at the top for the status bar. No other mockups, bezels or device photos around screens.
- Long screens keep the device width and grow in height with the content (`h: "hug"`, `minH` = the device height); header and tab bar `fixed: true` so they stay put while the rest scrolls.
- A responsive web page is one desktop frame with its tablet/mobile frames **beside it on the same page**, built from the same components (a size/breakpoint variant where a component changes shape) — never a parallel set of "mobile" components or a separate copy of the design.
- Name every layer for what it is ("Header", "Order summary", "Price row") — names become code.

### 5. One of each thing
- One frame per screen and per state; one component per thing. To change a screen, change it (`edit`), or rebuild it with `replaceId` (the old version goes to Trash) — never "Home 2", "Home – new" or a second redraw beside the first. `build` refuses a same-name twin on a page; that refusal means *update the existing one*.
- A pattern used twice is a component (or an instance of an existing one). Screens are built from instances, not copies. Components live on the `Components` page. Before building, read `COMPONENTS.md` in the workspace — it lists what exists and the exact instance spec for each; a `build` warning "drawn by hand but the component … exists" means: replace it with that instance.
- Variants for visual states and sizes; text/boolean/instance-swap properties for content. Interactive states (hover/pressed) are wired in the component.
- Never detach to make a one-off change; add the variant or property instead.

### 6. Real content, every state, honest images
- Real copy and data in the product's language (Arabic → RTL + an Arabic-capable font; check `fonts`). Vary lengths: long names, big numbers, empty values.
- Design the states, not just the happy path: empty, loading (skeleton), error, success, disabled, offline, permission, first-time — each its own frame named `Screen – State`.
- No lorem ipsum. Every image you can't supply is a placeholder at its real size with a complete generation `prompt`; when the screen is done run `image_prompts` and tell the user where `IMAGE_PROMPTS.md` is (how to write the prompts: [image-prompts.md](image-prompts.md)). When they send the images, `place_images`.

### 7. Hierarchy, rhythm, access
- One primary action per screen; secondary actions visibly secondary.
- A clear type scale (few sizes, consistent line heights); a spacing scale (4/8-based unless the file says otherwise); consistent alignment edges.
- Contrast ≥ 4.5:1 for text (3:1 large) — checked again in every theme (dark mode has its own pairs); touch targets ≥ 44 px on mobile (≥ 24 px minimum anywhere) with ≥ 8 px between them; visible focus and pressed states; icons with labels when meaning isn't obvious; body text ≥ 16 px on mobile, never under 12 px.
- Forms: a visible label on every field (a placeholder is not a label), helper text where the format matters, errors next to the field they belong to (plus a summary on long forms), and only the fields needed now.
- Navigation: a bottom tab bar holds 3–5 destinations; back always goes where users expect; the current place is visible; nothing important hides behind hover alone.
- Mobile safe areas: content clear of the status bar, notch and home indicator; fixed bars respect them.
- Motion (prototypes): 150–300 ms for UI feedback, meaning over decoration, and a calm alternative for reduced motion.
- Responsive intent: show how the layout adapts (key breakpoints using the same components and tokens).

### 8. Build in sections, look, fix
- One meaningful region per `build` (header, form, list…), using refs. Look at every result (`screenshot`): clipped text, collapsed widths, overlaps, misalignment, crowding, weak hierarchy. Fix with `edit` before continuing.
- At the end: `lint` the frame — fix contrast, collapsed/clipped text, raw values (`fix: true` binds exact token matches), missing auto layout, generic names. Image placeholders show up as reminders, not errors.
- Never say it's done from code alone.
- Stop when the request is done and the checklist passes. More rounds need a concrete remaining problem — not moving things around or adding embellishment in pursuit of taste.

### 9. Organize and don't destroy
- Pages by purpose with English names, created only when something goes on them (main skill, §3): `App` (or one per app), `Web`, `Dashboard`, `Banners`, `Components`, `References`, `Trash`.
- On a page: one auto-layout design board containing named auto-layout frames for each flow or group ("Onboarding", "Checkout"); screens inside each group run left → right and are named `Screen` / `Screen – State` ("Payment – Error"). Reuse the existing board and group when adding a screen.
- Deleting moves layers to `Trash` (restorable). Ask before deleting or rebuilding what you didn't create. New work goes beside existing work.

### 10. Communicate
- Report: what was made (page, names + ids), which existing assets were reused, what was added to the system, images waiting (path of `IMAGE_PROMPTS.md` and how many), open questions.
- When the direction is open, offer 2–3 genuinely different directions (layout/concept), each built properly — not three color swaps. Directions are alternatives the user chooses between, named `Home – Direction A/B`; the ones not chosen go to Trash.

## Design knowledge (optional): ui-ux-pro-max

If the `ui-ux-pro-max` skill is installed (look for `ui-ux-pro-max/scripts/search.py` in the skill folders:
`~/.claude/skills`, `~/.agents/skills`, `~/.codex/skills`, or the project's), use its database inside this workflow:
- **Directions** (identity guide, path C): `python3 <dir>/scripts/search.py "<product> <industry> <mood>" --design-system -f markdown`
  gives a palette, font pairing, style and anti-patterns — raw material for the 2–3 directions, checked against the
  brief and the platform (it can suggest a landing-page pattern for an app; ignore what does not fit).
- **UX checks** before you report: `--domain ux` with one concern per query (`"form error placement"`,
  `"bottom navigation"`, `"dark mode contrast"`); apply what is verified for this product.
- **Code**: `--stack <react|nextjs|flutter|swiftui|…>` for stack-specific UI rules (to-code guide).
- Never `--persist`: its `design-system/…/MASTER.md` would be a second source. What you adopt goes into the
  identity (tokens, components, the brief's `## Identity`) and reaches the project through `workspace sync`.
- No match → say so; don't present fallback defaults as data.

## References

**What counts as a reference:** an example of the *kind of thing being designed* — a website, an app screen, a
dashboard, a banner, a UI section. **Brand material is not a reference**: a logo, a palette, a color or mood photo,
fonts, a brand book. It sets the identity; it says nothing about layout, structure or patterns. A user who sent only
brand material sent **no reference** — find them (next section).

When the user sends a reference (an image file, a link, a screenshot) or asks you to find one (finding them: the next section):
1. **Put it in the file first.** On the `References` page (`build` with `page: "References"`): a frame named `Reference – <what> (<source>)` holding the image (`src` = the path or image URL) at its natural size, with a one-line note of what to take from it. Several references for one task sit side by side. Brand material the user sent goes there too, but named `Brand – <what> (user)` (`Brand – Logo (user)`, `Brand – Palette (user)`) — so it never counts as a reference. A reference that only exists inside the chat has no file — ask the user to save it and give you the path (or drop it into the project).
2. **Read it for principles, not pixels:** structure, hierarchy, density, spacing rhythm, patterns, the feeling. Write down what you take and what you leave.
3. **Design on the real page** (`App`, `Web`, …) with the file's own tokens and components, at the product's device size. If the user asked for "the same as this", recreate it faithfully — still with auto layout, tokens, components and real content — and say where you deviated and why (accessibility, platform conventions).
4. References never go inside screens, and their images never become product images.

### No reference given → find them before designing
A new screen, flow, landing page, dashboard or banner the user asked for **without** a reference starts with
references you find yourself — **also when the user gave a logo, colors or other brand material** (§ What counts as
a reference). Skip only when the user says not to, the task is a small edit to something that exists (a label, a
color, one component), or the `References` page already holds `Reference – …` frames of UI for this kind of screen
(reuse those; `Brand – …` frames don't count). This comes **before** tokens, components and screens: the references
shape the structure, so finding them after building is too late. Your plan names them (`References: … (found)` or
`References: … (from the user)`); a plan without that line is not ready.

1. **Search** (your client's web search / fetch; in Claude Code: WebSearch + WebFetch, or a browser tool when
   one is connected). Queries from the brief: product type + screen + platform + mood, in English —
   `"food delivery app checkout screen ui"`, `"saas analytics dashboard dark"`. Where to look:
   | Kind | Sites |
   |---|---|
   | App / dashboard UI | `dribbble.com`, `behance.net`, `pinterest.com`, `uplabs.com` |
   **Quality bar:** award-level or shipped work — Awwwards/Godly winners, Land-book and Lapa picks, Dribbble and
   Behance shots with high likes/appreciations from studios. Template marketplaces (Contra, Webflow/Framer/Dorik
   templates, ThemeForest, Envato) and generic AI mockups only when nothing better exists, and say so.
   | Websites / landing pages | `land-book.com`, `lapa.ninja`, `godly.website`, `awwwards.com`, `siteinspire.com`, plus Dribbble/Behance |
   | Real shipped apps | `screenlane.com`, `pttrns.com` (Mobbin needs a login — use it only if the user gives you access) |
   Use `site:` queries (`site:dribbble.com fintech app onboarding`) — the search results give you the shot/project
   URLs. **Dribbble, Behance, Land-book and Lapa answer plain HTTP fetches with a bot check (202/403)**: open them
   in a browser tool when your client has one (in Claude Code: Claude in Chrome or the built-in browser) — look for
   it before you give up on those sites; blocked with no browser → the other sites in the table, not templates. Pinterest,
   Godly, UpLabs, Pttrns, Awwwards and Screenlane usually open with a plain fetch. Never log in, solve or bypass
   a check, or scrape in bulk; a page you can't open is skipped — try the next site.
2. **Get the image itself**, not the page: open the shot/project/pin page and take its main image — the
   `og:image` meta tag, or the largest image in the page (`cdn.dribbble.com/userupload/…`,
   `mir-s3-cdn-cf.behance.net/project_modules/…`, `i.pinimg.com/originals/…`; drop resize parameters to get the full
   size). Download it into the workspace `references/` folder as `<source>-<what>.png` and look at it (open the
   image) before keeping it. Figma takes PNG/JPEG/GIF only: convert WebP/AVIF first (`sips -s format png in.webp --out out.png` on macOS,
   `magick in.webp out.png` elsewhere).
3. **Choose 2–4**, not a gallery: the ones that fit the product, the platform (no desktop shot for a mobile app)
   and the brief/identity. Throw away pure concept art (unreadable text, impossible layouts, decoration with no UI).
4. **Mark the part you will use.** For each reference decide what you take — "the card list density", "the
   header with the search inside it", "the bottom sheet checkout", "the icon style" — and crop that region into its own file
   (`sips -c <h> <w> --cropOffset <y> <x> in.png --out part.png`, or `magick in.png -crop WxH+X+Y part.png`; check the
   crop by looking at it).
5. **Upload to Figma** on `References`, one frame per reference, side by side: `Reference – <what> (<site>)`
   holding the full image, the cropped part next to it, and a note text: what to take, what to leave, and the
   source URL + author. Record them in the `brief` (append) so later screens reuse them.
6. **Show the user before building anything on them**: the 2–4 references (the cropped parts) and one line each
   on what you take — then ask "these, or other ones?" and wait. References are a taste decision; tokens,
   components and screens built on references the user dislikes are all wasted. Approved → design (§ References,
   steps 2–4). Rejected → search again (other sites, other words), don't argue for the old ones. The identity still wins: a reference gives structure, density and patterns, not a
   second palette or font.

### Icons follow the references too
The icon look comes from the approved references (the user's or the ones you found), never from habit — not
`lucide` by default. Before the first icon, zoom into the icons of the reference parts and write down:
- **Style:** line / filled / duotone / mixed (line by default, filled when active or selected).
- **Weight and corners:** thin (≈1–1.5 px), regular (≈2 px), bold; round or sharp ends and corners.
- **Size and container:** bare icons, or inside a circle / rounded square / tinted pill; container size, radius, fill
  (a tint of the accent, a surface color, an outline).
- **Color:** one neutral, the accent, or on-accent white; which ones are colored.
- **Character:** geometric and minimal, friendly and rounded, technical, playful.

Then pick the **one** Iconify set that matches (check names with the `icons` tool):
| Reference looks like | Set |
|---|---|
| thin, elegant line | `ph:*-thin` / `ph:*-light`, `solar:*-linear`, `iconoir` |
| regular rounded line | `lucide`, `tabler`, `hugeicons`, `ph` (regular) |
| bold / filled | `ph:*-bold` / `ph:*-fill`, `solar:*-bold`, `mingcute:*-fill`, `ri:*-fill`, `heroicons:*-solid` |
| duotone (two tones) | `ph:*-duotone`, `solar:*-bold-duotone` / `solar:*-line-duotone` |
| Material / Android | `material-symbols` (outlined / rounded) |
Fine-tune with `strokeWidth` and `size` to the measured weight and size; the container is part of the component
(an auto-layout frame around the `icon` child with its fill and radius), not drawn per screen. Record the set, style,
weight, sizes and container in the brief (`## Identity` → Iconography) so every later screen uses the same icons.
Show it in the reference note: `Icons: duotone, 1.5 px, in 40 px tinted circles → ph duotone`.

No web access in this client → say so and ask the user for 1–3 references (files or links), or proceed from the brief if they prefer.

## Screen recipe

1. `status` → `brief` → `get_design_system` → `get_metadata` (neighbouring screens, same page).
2. No UI reference from the user → find 2–4, put them on `References`, show them to the user and wait for a yes (§ No reference given). Plan: page, device, sections top→bottom, components per section, tokens, states, images.
3. Find or `build` the page's auto-layout board and the relevant auto-layout flow/group within it. `build` the screen shell with `parentId` = that group's id and `device`: background token, padding, `align: "stretch"`, header/content/footer regions (refs), `fixed` bars.
4. For each region in turn: the components **this region** needs and the file lacks → `create_component`, shaped after the region's reference part (icons as `icon` children inside their auto layout, in the icon set and style taken from the references — § Icons follow the references too; description `source: Reference – <name>`) → `build` the region into its ref (`parentId`) from instances (`"type": "instance"`, spec copied from `COMPONENTS.md`), real content, image placeholders with prompts. Frames and text only for what is not a component. No component for a region you are not building now.
5. `screenshot` after each region, next to its reference part → `edit` fixes.
6. States as their own frames (`edit` duplicate, then `rename` to `Screen – State` and `set` the changes).
7. Wire the flow ([prototype.md](prototype.md)) when there is more than one screen.
8. `COMPONENTS.md`: every component made for these screens is used (no *unused*) → `lint` → fix → final `screenshot` → `image_prompts` if images are waiting → report → `brief` append decisions.

## Checklist before you report
- [ ] Icons: one set whose style, weight, size and container match the references.
- [ ] References: the user's UI references, or 2–4 you found and placed on `References` before designing (brand material alone doesn't count).
- [ ] On the right page (English name, created only for this); components on `Components`; nothing left on an empty page.
- [ ] Every screen at the product's exact device size; one frame per screen/state; no duplicates or copies.
- [ ] One auto-layout board per design page; its flow/group frames use auto layout and contain the screens.
- [ ] Every container uses auto layout; no stray absolute layers except intentional overlays.
- [ ] Colors, spacing, radii, type come from variables/styles; no orphan values.
- [ ] Repeated things are instances of components; nothing detached; no component left *unused* (`COMPONENTS.md`).
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
