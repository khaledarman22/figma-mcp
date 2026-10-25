# Images the design waits for — prompts for the user

The user makes the images themselves (Midjourney, ChatGPT/DALL·E, Imagen, Firefly, Flux… or a photographer or
illustrator). Your part: decide which images the design needs, leave an honest placeholder where each one goes,
write a brief so complete that whoever makes the image produces *this* design's picture and not a generic one,
and put the images in when they come back. Everything lives in the file's workspace (`design/<file>/`, main skill §3).

## Two kinds of image

| Kind | Build it as | Ends up in |
|---|---|---|
| Doesn't exist yet — generated or commissioned (hero photo, illustration, background, card image) | `{ "type": "image", "name": "Hero photo", "w": "fill", "h": 320, "prompt": "…" }` | `images/` |
| The user already has it — logo, product/team photos, screenshots of their app, certificates | `{ "type": "image", "name": "Logo", "w": 120, "h": 40, "supply": "The brand logo, horizontal version, transparent PNG or SVG" }` | `assets/` |

Never write a generation prompt for something real (a logo, the actual product, real staff). If the user sent
the file already, use it directly (`src`, after copying it into `assets/`).

## Look in the library first

`image_library` (list, `query` by subject/tags, `orientation`, `minWidth`) shows every image already collected for
this design — `LIBRARY.md` in the workspace and the Figma page `Library`. Reuse before searching:
- **Fits as it is** → `build` `{type: "image", src: "<its file>"}` or `place_images` `files: {"IMG-004": "<its file>"}`.
- **Close but not right** (crop, color, a detail) → keep the placeholder and write its prompt as an edit of that
  image: first line `Base image: library/LIB-004-….jpg (attach it to the generator)`, then only what changes.
- **Nothing fits** and the user wants real photos or references from the web → search (if your client can search
  and open the web), prefer free-license sources (Unsplash, Pexels, Pixabay, Wikimedia Commons with its license), and
  `image_library` `add` every image you keep — with an honest title, description, tags, the page URL as `source`, the
  author and the license. Each one is stored once (duplicates are recognized), so the next request finds it.
  Images without a clear license are references only (the library marks them so) — never shipped in a product.

## Flow

1. **Decide the images with the layout**, not after: which boxes need a picture, what job each one does (sets the
   mood, shows the product, explains a step, fills an empty state), and at what real size. One image per job; the
   same picture used in several places keeps one prompt (same prompt → same `IMG` id → one file fills them all).
2. **Placeholder where the image belongs**, at its real size with a name that says what it is, and a full `prompt`
   or `supply`. An existing image or frame that needs a new picture: `edit` `set` `{ "prompt": "…" }` on it (a frame
   keeps its gradient/translucent overlays on top of the new image).
3. **`image_prompts`** when the screen or section is done (again after changes) → `IMAGE_PROMPTS.md` in the
   workspace: per image the id, where it is used, a **preview** (screenshot of the screen with the gray box and its
   id, in `previews/`), the exact pixel size (2× by default; `scale: 3` for phone apps that ship @3x), the ratio, the
   file name, and the prompt; supplied images in their own "from you" section. `style` writes one shared art
   direction at the top — take it from the identity's imagery words (identity guide); later runs keep it.
4. **Tell the user** (their language): where the file is, how many images to generate and how many files they must
   hand over — *"generated images go in `images/` with names starting with the id (IMG-001.png…); your own files
   (logo, product photos) go in `assets/` with the names written in the file; then tell me"*.
5. **When they're back: `place_images`** — it looks in both folders (or `files: {"IMG-003": "/path/any-name.jpg"}`
   for files named differently). Then screenshot the screens that changed and check the crops: subject visible,
   text over the image still readable (add or strengthen an overlay if not).
6. Images not made yet stay placeholders: `lint` lists them as reminders and `get_design_context` points the code
   at the future file, so nothing is lost.

## A reference for every image

Before writing a brief, find a **reference image** for it — a real photo, illustration or render that shows the
look you mean (angle, light, framing, medium). Without one, the generator guesses.
1. Search (your client's web search / fetch or a browser tool): Unsplash, Pexels, Pinterest, Behance, Dribbble,
   Freepik for the subject + medium + mood (`"woman ordering coffee counter morning light editorial"`). Bot checks
   and logins: skip the site (design guide, § No reference given). The `image_library` comes first.
2. Download the best one into the workspace `references/` as `IMG-001-ref-<what>.jpg` (convert WebP/AVIF to PNG/JPG),
   open it and check it really matches. Crop to the part that matters when the rest would mislead.
3. Put it on `References` as `Reference – IMG-001 <title> (<site>)`, with a note of what to take and what to leave.
4. Write its path in the brief's `Reference:` line with the source URL and what to take / leave. The prompts file
   shows it next to the brief so the user attaches it to the generator (image prompt / style reference).
A reference is a guide, never the deliverable: never place it into the design as the final image.

## The brief — every prompt answers all of these

Write in English, as a structured multi-line brief (generators accept it as is; people can read it). Every field,
every time — **not two words**: `"hero image of a café"` is not a prompt. A prompt that could fit any product is not
finished. `image_prompts` checks each brief and lists what is missing (`Brief incomplete — missing: …`); fix
those with `edit` `set` `{prompt}` and run it again before telling the user anything.

```text
Purpose: <the job of this image in this screen — e.g. "hero of the onboarding welcome screen, sets a calm, trusted tone before sign-up">
Reference: <references/IMG-001-ref-<what>.jpg (source URL) — take: <angle, light, framing…>; leave: <the person, the brand…>>
Subject: <who/what, how many, age/look/clothing where it matters, doing what — right for the product's audience (an Egyptian product shows Egyptian people, streets, food and products)>
Elements: <every element in the picture, one per line — what it is, where (foreground/background, left/right third), size in the frame, color/material:
  - main subject …
  - secondary objects / props …
  - background …
  - texture, surface, small details that make it real …>
Setting: <place, time of day, season, props that tell the product's story>
Composition: <framing (close-up / medium / wide), camera height and angle, where the subject sits (e.g. "right third"), where calm empty space must stay and why ("left 45% stays plain for the headline and the button")>
Safe areas: <what gets covered or cropped — text overlay zone, rounded corners, the mobile crop of a desktop image; "keep the face inside the central 60%">
Camera / medium: <photo: lens, depth of field ("50mm, f/2, shallow depth of field") · or illustration: style, line, shading · or 3D: material, render look — one medium for all images of a product>
Light: <soft daylight from a window on the left, golden hour, studio softbox…>
Color: <palette tied to the tokens with hex ("warm sand #F4E9DC background, deep teal #0F766E accents"); what must contrast with the UI on top>
Mood: <the feeling — calm, confident, playful, premium — and what it must not feel like>
Consistency: <the shared style line, repeated — so every image belongs to the same family>
Exclusions: <no text, no logos, no watermark, no UI elements, no extra fingers/distorted hands, no brand names>
Deliverable: <ratio from the file ("--ar 16:9" for generators that take it), PNG or JPG, transparent background if it sits on a colored surface>
```

Example (one image):
```text
Purpose: hero of the café app's home screen; it must make ordering feel warm and personal.
Reference: references/IMG-001-ref-cafe-counter.jpg (https://unsplash.com/photos/…) — take: eye-level medium shot, window light from the left, soft background; leave: the person's look and the café's branding.
Subject: a young Egyptian woman in her late twenties, casual linen shirt, smiling at the barista while ordering at a small modern café counter.
Elements:
  - foreground right: the woman, waist up, about 45% of the frame height, cream linen shirt, one hand resting on the counter
  - mid-ground right: the barista, out of focus, back half-turned, dark green apron
  - counter: light oak, running across the bottom 25% of the frame, two white ceramic cups with teal rims and a small card reader
  - background left: plain warm-white plaster wall, soft and out of focus — the headline area
  - background right: two potted monstera plants, a wooden shelf with jars, blurred
  - details: steam rising from one cup, morning light catching the edge of the counter
Setting: Zamalek café in the morning, light wood counter, a few ceramic cups, plants in the background.
Composition: medium shot at eye level; subject on the right third; the left 40% is a soft, out-of-focus wall for the headline.
Safe areas: the bottom 25% sits under a gradient and the "Order now" button — nothing important there; keep her face in the central 60% for the mobile crop.
Camera / medium: editorial photograph, 50mm, f/2, shallow depth of field.
Light: soft morning daylight from a window on the left, gentle shadows.
Color: warm sand #F4E9DC and cream, deep teal #0F766E accents in the cups; no saturated reds.
Mood: calm, welcoming, everyday — not glossy advertising.
Consistency: warm editorial photography, natural light, sand and teal palette.
Exclusions: no text, no logos, no watermark, no visible brand names, natural hands.
Deliverable: --ar 4:3, JPG.
```

A `supply` entry says exactly what to hand over: which version (horizontal / icon-only / dark background), format
(SVG or transparent PNG), minimum size, and anything that must be visible ("front of the box, label readable").

## Rules

- Every generated image: a reference image + every brief field + the full elements list. `image_prompts` must report no incomplete brief before you hand the file to the user.
- Icons are not images — use `icon` (Iconify).
- Don't put random web images into screens. Web images the user wants as inspiration go on the `References` page.
- No real people's likeness, celebrities, brand names or trademarked characters in prompts.
- One visual style across all images of a product (the `style` line + the Consistency line); the same picture keeps the same prompt.
- Size placeholders to their real role (hero, card thumbnail, square avatar) — the prompt file takes the size from them.
