// Image hand-off: layers waiting for an image carry a generation prompt and an IMG id; this keeps
// them in a Markdown file in the user's project (IMAGE_PROMPTS.md) and matches the images the user
// generates back to their layers by id.

import fs from 'node:fs';
import path from 'node:path';
import { kebab } from '../shared/util.ts';

/** One layer waiting for an image (from the plugin's `placeholders`). */
export interface Usage {
  nodeId: string;
  imageId: string;
  name: string;
  page: string;
  screen?: string;
  path: string;
  w: number;
  h: number;
  prompt: string;
}

/** One image to generate; several layers can use it (same prompt → same id). */
export interface PromptEntry {
  imageId: string;
  title: string;
  prompt: string;
  usages: Usage[];
  w: number;
  h: number;
  status: string;
}

export interface PromptsMeta {
  title?: string;
  style?: string;
  scale?: number;
  imagesDir?: string;
}

const COMMON_RATIOS: Array<[number, number]> = [
  [1, 1], [4, 5], [5, 4], [3, 4], [4, 3], [2, 3], [3, 2], [9, 16], [16, 9], [10, 16], [16, 10], [1, 2], [2, 1], [21, 9], [3, 1], [1, 3],
];

/** "3:4", "≈ 16:9" when a common ratio is within 3%, else "1.43:1 (nearest 3:2)" — generators take standard ratios and cover-fit crops the rest. */
export function ratio(w: number, h: number): string {
  if (!w || !h) return '—';
  const r = w / h;
  let best: [number, number] | undefined;
  let err = Infinity;
  for (const [a, b] of COMMON_RATIOS) {
    const e = Math.abs(a / b - r) / r;
    if (e < err) {
      err = e;
      best = [a, b];
    }
  }
  if (best && err < 0.005) return `${best[0]}:${best[1]}`;
  if (best && err < 0.03) return `≈ ${best[0]}:${best[1]}`;
  const exact = r >= 1 ? `${r.toFixed(2)}:1` : `1:${(1 / r).toFixed(2)}`;
  return best ? `${exact} (nearest ${best[0]}:${best[1]})` : exact;
}

export const fileNameFor = (e: Pick<PromptEntry, 'imageId' | 'title'>) => `${e.imageId}-${kebab(e.title).slice(0, 40) || 'image'}.png`;

const titleOf = (u: Usage) => (u.name && !/^image( placeholder)?$/i.test(u.name) ? u.name : u.screen ? `${u.screen} image` : 'Image');

/** Layers → one entry per image id, sized for the largest place it is used. */
export function groupUsages(usages: Usage[]): PromptEntry[] {
  const byId = new Map<string, PromptEntry>();
  for (const u of usages) {
    let e = byId.get(u.imageId);
    if (!e) {
      e = { imageId: u.imageId, title: titleOf(u), prompt: u.prompt, usages: [], w: u.w, h: u.h, status: 'needed' };
      byId.set(u.imageId, e);
    }
    e.usages.push(u);
    if (!e.prompt && u.prompt) e.prompt = u.prompt;
    if (u.w * u.h > e.w * e.h) {
      e.w = u.w;
      e.h = u.h;
    }
  }
  return [...byId.values()].sort((a, b) => a.imageId.localeCompare(b.imageId, 'en', { numeric: true }));
}

/** Settings and entries (id → status + block) of an existing prompts file. */
export function parsePromptsFile(md: string): { meta: PromptsMeta; entries: Map<string, { status: string; block: string }> } {
  const meta: PromptsMeta = {
    title: md.match(/^# Image prompts — (.+)$/m)?.[1]?.trim(),
    style: md.match(/^\*\*Style for all images:\*\* (.+)$/m)?.[1]?.trim(),
    scale: Number(md.match(/<!-- scale: (\d) -->/)?.[1]) || undefined,
    imagesDir: md.match(/<!-- images: (.+?) -->/)?.[1]?.trim(),
  };
  const entries = new Map<string, { status: string; block: string }>();
  for (const part of md.split(/^## (?=IMG-\d+)/m).slice(1)) {
    const id = part.match(/^(IMG-\d+)/)?.[1];
    if (!id) continue;
    const status = part.match(/^- \*\*Status:\*\* (.+)$/m)?.[1]?.trim() ?? 'needed';
    entries.set(id, { status, block: `## ${part.replace(/\n---\s*$/, '').trimEnd()}` });
  }
  return { meta, entries };
}

export function renderPromptsFile(o: {
  title: string;
  entries: PromptEntry[];
  scale: number;
  imagesDir: string;
  style?: string;
  /** Earlier entries no longer in the design: placed ones are kept as history. */
  previous?: Map<string, { status: string; block: string }>;
}): string {
  const L: string[] = [];
  L.push(`# Image prompts — ${o.title}`, '');
  L.push(`<!-- scale: ${o.scale} --> <!-- images: ${o.imagesDir} -->`, '');
  L.push('> اعمل كل صورة بالـ prompt بتاعها، واحفظها في فولدر `' + o.imagesDir + '/` (جنب الملف ده) باسم يبدأ بالـ ID، زي `IMG-001.png` أو الاسم المكتوب تحت.');
  L.push('> بعدها قول «الصور جاهزة»، وهتتحط كل صورة مكانها في فيجما. المقاسات بالبكسل ' + `${o.scale}×` + ' عشان تبقى حادة، ولو أداة الصور بتاخد نسبة بس استخدم الـ ratio.');
  L.push('> الصيغ: PNG أو JPG (لو طلعت WebP حوّلها الأول).', '');
  if (o.style) L.push('**Style for all images:** ' + o.style, '');
  const current = new Set(o.entries.map((e) => e.imageId));
  const kept = [...(o.previous ?? new Map<string, { status: string; block: string }>()).entries()].filter(([id, v]) => !current.has(id) && /^placed/i.test(v.status));
  if (o.entries.length) {
    L.push('| ID | Image | Used in | Size (px) | Ratio | Status |', '|---|---|---|---|---|---|');
    for (const e of o.entries) {
      const where = [...new Set(e.usages.map((u) => [u.page, u.screen].filter(Boolean).join(' › ')))].join('; ');
      L.push(`| ${e.imageId} | ${e.title} | ${where} | ${Math.round(e.w * o.scale)}×${Math.round(e.h * o.scale)} | ${ratio(e.w, e.h)} | ${e.status} |`);
    }
    L.push('');
  } else L.push('_No images waiting._', '');
  for (const e of o.entries) {
    L.push('---', '', `## ${e.imageId} — ${e.title}`);
    for (const u of e.usages) L.push(`- **Used in:** ${[u.page, u.path, u.name].filter(Boolean).join(' › ')} · \`${u.nodeId}\` · ${u.w}×${u.h}`);
    const shapes = new Set(e.usages.map((u) => ratio(u.w, u.h)));
    L.push(`- **Size:** ${Math.round(e.w * o.scale)}×${Math.round(e.h * o.scale)} px · ratio ${ratio(e.w, e.h)}${shapes.size > 1 ? ' (used at several shapes: keep the subject centered, each place crops it)' : ''}`);
    L.push(`- **Save as:** \`${o.imagesDir}/${fileNameFor(e)}\``);
    L.push(`- **Status:** ${e.status}`, '');
    L.push('**Prompt:**', '```text', e.prompt.trim() || '(missing — ask for a prompt for this image)', '```', '');
  }
  if (kept.length) {
    L.push('---', '', '# Placed', '');
    for (const [, v] of kept) L.push(v.block, '');
  }
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

/** Files in dir named "IMG-001…" (any case/separator) → IMG id → absolute path (first match per id). */
export function matchImageFiles(dir: string): { byId: Map<string, string>; unmatched: string[] } {
  const byId = new Map<string, string>();
  const unmatched: string[] = [];
  if (!fs.existsSync(dir)) return { byId, unmatched };
  for (const f of fs.readdirSync(dir).sort()) {
    if (f.startsWith('.') || !IMAGE_EXT.test(f)) continue;
    const id = imageIdOf(f);
    if (!id) {
      unmatched.push(f);
      continue;
    }
    if (!byId.has(id)) byId.set(id, path.join(dir, f));
  }
  return { byId, unmatched };
}

/** "img_7-hero.png" → "IMG-007" */
export function imageIdOf(name: string): string | undefined {
  const m = path.basename(name).match(/^img[-_ ]?(\d{1,4})(?!\d)/i);
  return m ? `IMG-${m[1].padStart(3, '0')}` : undefined;
}
