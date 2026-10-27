# Several references → one design, merged automatically

Whenever the board has more than one reference — you found them, or the user sent several, or said "خد من دول" —
you merge them into **one** design on your own: no asking which letter, no asking the user to mark. The result
looks like one designer made it — not a collage of sections in different styles, not an average of layouts that
ends up as none of them, and not a copy of one reference with the others ignored. Same stance as
[references.md](references.md): no write-up about the references; you build, then the user asks for changes.

## 1. You choose what to take, mark it, crop it — then build from the crops

1. **Look at every reference at full size** — open the saved files (`<project>/references/…`) as images, or
   `screenshot` each board frame. Drop the ones that fit nothing in the analysis.
2. **Choose per section, from that section's own board** (`References – Home – Hero` for the hero…; sections from
   [analysis.md](analysis.md)), with the rules in §2: one **skeleton** region
   per section, and the **borrowings** — the specific parts worth taking from the others (a headline treatment, a
   stats strip, a card style, a footer layout).
3. **`reference_crops`** once per board (`for` = `"Home – Hero"`…) with `regions` = your choices for that section, each `{ref: "B", section: "hero"}`
   for a skeleton or `{ref: "C", section: "hero", take: "headline"}` for a borrowing, with `x, y, w, h` as fractions
   of that reference image (0–1; measure on the image you looked at). They are drawn on the board as dashed marks
   named `hero` / `hero: headline` — visible to the user, replacing your earlier marks — and come back as **crops of
   the original image** at full resolution, saved in `<project>/references/crops`.
   On a full-page reference (Land-book, One Page Love) the region is the section's band of the page: `y`/`h` are
   fractions of the whole page height (a 10-section page → each section ≈ 0.05–0.15 tall) — look at the page and
   measure; a band that also shows the next section is too tall.
4. **Check the crops** (they're returned as images): each shows exactly the part you meant, nothing cut off. Wrong
   → adjust that region and call again. Then the coverage lines at the end: **every planned section has a skeleton**
   (`✓`); a `✗` section gets references first (references.md §1 step 3) — never designed from your head while the
   others are built from crops.
5. **Build from the crop images** — look at them, measure from them. Never turn them into a text description and
   design from the text. If another agent designs (a subagent, a designer agent), it gets **the crop files** (paths
   it opens as images), the map line for its section and the identity — not a description of the references.

**The user can always override** — what they say or mark beats your choice:
- "خد من A و C بس", "الهيرو من B" → redo the choice with that and rebuild what changes.
- Marks they draw (a rectangle named `hero` or `hero: الهيدلاين`, or with the word typed inside) or your marks
  they move or resize → `reference_crops` without `regions` reads the board as it is now (their marks + yours) →
  update the affected sections. Their marks show as "(user mark)"; for the same section they win over yours.

## 2. Every reference has a role — never average

Per section:
- **One skeleton.** Exactly one crop/reference sets the composition: columns and their ratios, where image vs. text
  sits, alignment, proportions and density. A user mark decides; otherwise the one whose structure fits the section's purpose and real content ([analysis.md](analysis.md)), then the
  one closest to the identity's patterns, then the first letter.
- **Borrowings.** Each other crop gives exactly the thing it shows — the headline treatment, the stats strip, the card
  style. More than two borrowings from one non-skeleton reference in a section → it is a second skeleton; pick one.
- **The identity owns the skin.** Colors, type, components, icons, imagery, radii and spacing values come from the
  identity ([references.md](references.md) §2, the replacement table). A crop shows *how* something is done (a dark
  hero with one accent on the CTA) — rebuild that with the identity's roles, never its hex values, fonts or text.

**The map** — one line per section, from the crops, kept in the brief (`brief` append) and shown to the user as these
lines when you start building (not as a question):

```
Home – Hero      ← B skeleton (crops/home-hero-B-1-hero.png) · C headline (…-C-2-headline.png) · E stats strip (…-E-3-…)
Home – Services  ← A skeleton (3-column cards) · C section-title style
```

## 3. One system across the page — resolve conflicts, don't merge them

A page made from several references must still have **one** of each of these: grid and content width, type
scale and heading treatment, spacing rhythm (section padding, gaps), radius and border style, card style, button
style, image treatment (crop, radius, overlay), background rhythm between sections, density.

When two references disagree on one of them, pick one — by priority: the user's explicit words → the identity
(and its patterns) → what the section's content and goal need → the skeleton reference of the page's hero. Then
apply that choice to every section, including the ones whose skeleton came from the other reference.

Incompatible picks (an airy editorial page and a dense data dashboard; a playful illustrated style and a strict
corporate one): don't blend. Take the skeleton from the one that fits the analysis, take only neutral traits from the
other (a layout idea, a content pattern), and say so in one line.

## 4. Components come from the crops — never invented on the spot

The components are decided by the references, once, and then reused — not made up on each screen or session, and
not set up "to start with" before the references (a logo gives colors and type, not a button).

1. **The list** is the brief's `Components:` line (analysis.md): buttons, nav, each kind of card, inputs, badges,
   stat items, section headers, **icons**. Add any part the section crops show that isn't on it.
2. **A crop for each component — tight around one instance**, not the section it sits in: a nav-bar crop is not a
   button reference. In the same `reference_crops` call as the sections, add one region per component:
   `{ref: "F", section: "component", take: "button", x, y, w, h}` around one button (primary; a second region for
   the outline one if the references show it), `take: "service card"` around one card, `take: "icons"` around a few
   icons. Pick the reference that shows that component best — from any board; the component board can differ
   from the section's skeleton. The answer ends with `Components: 3/8 have a crop` and the missing ones: crop those
   first. A component no reference shows → crop the closest thing (a testimonial card from a reference's quote
   block, a process step from a numbered list) and say so in its description.
3. **Reuse before create.** `get_design_system` / the `Components` page: one that already does the job is used
   (a variant if the crop needs one) — never a look-alike beside it.
4. **Create from the crop.** Open the crop image and measure from it: shape (pill, rounded, square), height and
   horizontal padding relative to the label, icon position and size, border vs fill, what's inside a card and in
   which order, image ratio, title/meta sizes relative to each other, which parts are optional, the variants the
   references show (filled vs outline, a featured card). The skin is the identity's: tokens, text styles, radius
   scale (the crop decides *which* radius step and whether there is a border, not a new value).
5. **Icons**: the `icons` crop decides the set — outline vs filled, stroke weight, rounded vs sharp, whether icons
   sit in a container (circle, rounded square, none). Pick the Iconify set that draws like that (outline 1.5–2px →
   `lucide`, `tabler`, `iconoir`; thin/regular/bold/fill/duotone → `ph`; linear/bold/broken/duotone → `solar`;
   filled → `mdi`, `material-symbols`; outline/solid → `heroicons`) — `icons` search, compare with the crop — and
   record it in the brief's `## Identity`. One set for the whole product.
6. **Record the source** in the `description`: what it's for + `From: references/crops/<file>.png` — a later
   session (or another agent) extends it from the same crop. `create_component` says when a component has no crop.
7. **Then build the sections** with instances of these components only.

## 5. Build

1. Crops (§1) → map (§2) → `brief` append.
2. Components from their own crops (§4) — every one on the `Components:` line cropped tight, then reuse/create with `From:` in the description, icon set from the icons crop; add any token or
   pattern the borrowings need to the identity first ([identity.md](identity.md) §3).
3. Build section by section on the real page (design.md, Screen recipe), skeleton first, then the borrowed traits.
4. Look — `screenshot` your result next to the skeleton crop **and** each borrowed crop:
   - the skeleton's composition and proportions are there;
   - every crop in the map is visibly there, rebuilt in the identity (tick them off);
   - nothing is a verbatim copy of one reference's section (text, imagery, an exact layout + style combination);
   - the seams: adjacent sections share content width, alignment edges, spacing rhythm and the background
     rhythm — the page reads as one, not as sections from different sites.
5. Fix what fails; `lint`.

## 6. Report and changes

Report: where it is (page, frame + id), the map lines, at most 3 bullets of identity/product changes, images
waiting, one question: what to change.

A section the user rejects as a whole ("مش عاجبني الهيرو، غيّره") is a new reference, not an edit:
[feedback.md](feedback.md) §2. Changes come per trait or per section: "خلّي الهيرو زي C أكتر" → move that section toward C's crop and update the
map; a new or moved mark on the board → `reference_crops` again and rebuild only what changed; "شيل حاجة E" → remove the borrowing; "مش متناسق" → re-check §3 and unify. Smallest `edit` that
does it — no rebuild, no new concept.

## Avoid
- Each section a different reference's style — the collage.
- Averaging two compositions (a 50/50 of a split hero and a centered hero) — pick one.
- Borrowing vague qualities ("B's vibe", "C's feel") — only what a crop shows.
- Designing from your own description of a reference instead of the crop images.
- Taking more than two traits from a single non-skeleton reference for one section — that's a second skeleton.
- Copying any reference's text, imagery, logo, or its exact section (layout + style together).
