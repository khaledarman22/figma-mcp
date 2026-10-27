# Images the design needs — where each one comes from

## Decide per image (once per product, then keep it in the brief)

| The image is… | Source |
|---|---|
| a logo, product photo, team photo, screenshot of their app | **the user's file** — ask for it; never generated or sourced |
| an icon | `icon` from the identity's one Iconify set — never an image |
| anything else, by default | **placeholder + prompt → `IMAGE_PROMPTS.md`**, the user generates it (flow below) |
| a real-looking photo now, when the user prefers it (or the brief says `Images: stock`) | **free stock photo** (below) |
| your client has its own image-generation tool and the user wants you to use it | generate with the prompt you would have written, save the file in the user's project, `place_images` `files` |

Write the choice into the brief once (`brief` append `Images: prompts | stock | generated`) and don't ask again.

### Free stock photos
1. `stock_photos` with 2–4 concrete words per slot ("egyptian family breakfast", "modern clinic reception") and the
   orientation of the slot. It searches Unsplash/Pexels when a key is configured and shows previews.
   Without a key it says so: search with your own web search (`site:unsplash.com/photos …`,
   `site:pexels.com/photo …`, `site:pixabay.com`) — only links you actually saw. A free key makes it one call
   (UNSPLASH_ACCESS_KEY / PEXELS_API_KEY, or `~/.figma-mcp/keys.json`); offer that to the user once.
2. Pick by the slot's job: subject, framing, empty space where text sits over it, light and palette against the
   identity's imagery words, the product's market (Egyptian product → Egyptian people and places). No watermarks,
   visible brands or text in the photo. Try 2–3 queries before settling.
3. Place it: a placeholder → `place_images` `files: {"IMG-003": "<src>"}` (keeps `IMAGE_PROMPTS.md` honest); a
   new layer → `src` in `build`; an existing layer → `edit` `place-image`. The `src` is the direct link
   (images.unsplash.com / images.pexels.com / cdn.pixabay.com) or the Unsplash/Pexels/Pixabay photo page itself.
4. `screenshot` and check the crop. Record photographer + page in the brief when the user wants credits.

Never: images from design galleries (Dribbble, Behance, Pinterest, Awwwards…) — the tools refuse them outside
`References`; random web images; one photo style mixed with another.

## Prompts for the user to generate

The user makes the images themselves (Midjourney, ChatGPT/DALL·E, Imagen, Firefly, Flux… or a photographer).
Your part: wherever the design needs an image you don't have, leave an honest placeholder with a complete
prompt, keep all prompts in a Markdown file in their project, and put the images in when they come back.

### Flow

1. **Placeholder where the image belongs** — real size, a name that says what it is, and the prompt:
   `{ "type": "image", "name": "Hero photo", "w": "fill", "h": 320, "radius": 16, "prompt": "…" }`
   It becomes a gray box captioned with the name and an id (`IMG-001`). The same prompt anywhere in the file
   gets the same id, so one image fills every place that uses it.
   An existing image or frame that needs a new picture: `edit` `set` `{ "prompt": "…" }` on it (a frame keeps its
   gradient/translucent overlays on top of the new image).
2. **`image_prompts`** when the screen or section is done (again after changes) → writes `IMAGE_PROMPTS.md` in the
   project: per image the id, where it is used, the exact pixel size (2× by default; `scale: 3` for phone apps that
   ship @3x), the ratio, the file name to save as, and the prompt. `style` writes one shared art direction at the top
   (medium, palette, light) — set it once per product; later runs keep it.
3. **Tell the user** (their language): where the file is, how many images, and *"save them in the `images` folder
   next to it with names starting with the id (IMG-001.png…), then tell me"*.
4. **When they're back: `place_images`** (or `files: {"IMG-003": "/path/any-name.jpg"}` when they sent files named
   differently). Then screenshot the screens that changed and check the crops: subject visible, text over the
   image still readable (add or strengthen an overlay if not).
5. Images not made yet stay placeholders: `lint` lists them as reminders and `get_design_context` points the code
   at the future file, so nothing is lost.

### Writing a prompt that gives a usable image

The prompt is a brief for a picture that has a job in a layout. English, complete, specific — never "a nice image of …".

1. **Subject & action** — who or what, doing what, how many; age/look where it matters, right for the product's
   audience (an Egyptian product shows Egyptian people, streets, food and products).
2. **Setting** — place, time of day, props that tell the product's story.
3. **Composition for this layout** — framing (close-up / medium / wide), camera angle, where the subject sits and
   where calm empty space must stay ("subject on the right third, empty area on the left for the headline"),
   safe margins because the edges get cropped.
4. **Style / medium** — photograph (lens, depth of field: "50mm, shallow depth of field"), flat illustration,
   3D render, isometric, line art… One medium for all images of a product.
5. **Light & color** — lighting (soft daylight, golden hour, studio softbox) and a palette tied to the product's
   tokens ("deep teal #0F766E accents, warm sand background").
6. **Mood** — the feeling it must carry (calm, confident, playful, premium).
7. **Exclusions** — "no text, no logos, no watermark, no UI elements"; nothing distorted.
8. **Format** — the ratio from the file (for generators that take it, e.g. `--ar 16:9`).

Example:
> Warm editorial photograph of a young Egyptian woman in her late twenties ordering coffee at a small modern café
> counter in Zamalek, smiling at the barista, medium shot at eye level, subject on the right third with a soft
> empty background on the left for a headline, morning daylight from a side window, 50mm shallow depth of field,
> palette of warm sand and deep teal accents, calm and welcoming mood, no text, no logos, no watermark.

## Rules

- Icons are not images — use `icon` (Iconify). Logos, product photos and team photos are real assets: ask the user
  for the files; a placeholder with a prompt only for a concept they asked for.
- Don't put random web images into screens. Web images the user wants as inspiration go on the `References` page (`references`).
- No real people's likeness, celebrities, brand names or trademarked characters in prompts.
- One visual style across all images of a product (the `style` line); the same picture keeps the same prompt.
- Size placeholders to their real role (hero, card thumbnail, square avatar) — the prompt file takes the size from them.
