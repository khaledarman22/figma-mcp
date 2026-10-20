# Images the design waits for — prompts for the user

The user makes the images themselves (Midjourney, ChatGPT/DALL·E, Imagen, Firefly, Flux… or a photographer).
Your part: wherever the design needs an image you don't have, leave an honest placeholder with a complete
prompt, keep all prompts in a Markdown file in their project, and put the images in when they come back.

## Flow

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

## Writing a prompt that gives a usable image

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
- Don't put random web images into screens. Web images the user wants as inspiration go on the `References` page.
- No real people's likeness, celebrities, brand names or trademarked characters in prompts.
- One visual style across all images of a product (the `style` line); the same picture keeps the same prompt.
- Size placeholders to their real role (hero, card thumbnail, square avatar) — the prompt file takes the size from them.
