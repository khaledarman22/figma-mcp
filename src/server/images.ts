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
  /** The user supplies it (logo, product photo) instead of generating it. */
  supply?: boolean;
  screenId?: string;
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
  supply?: boolean;
  /** Screenshot of the place it goes, relative to the prompts file. */
  preview?: string;
}

export interface PromptsMeta {
  title?: string;
  style?: string;
  scale?: number;
  imagesDir?: string;
  assetsDir?: string;
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
      e = { imageId: u.imageId, title: titleOf(u), prompt: u.prompt, usages: [], w: u.w, h: u.h, status: 'needed', ...(u.supply ? { supply: true } : {}) };
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

/** The labeled lines every generation brief needs (image-prompts guide, "The brief"). */
export const BRIEF_FIELDS = ['Purpose', 'Reference', 'Subject', 'Elements', 'Setting', 'Composition', 'Safe areas', 'Camera / medium', 'Light', 'Color', 'Mood', 'Consistency', 'Exclusions', 'Deliverable'] as const;

const FIELD_RE = /^\s*(?:[-*]\s*)?\**([A-Za-z][A-Za-z /]{1,30}?)\**\s*:\s*(.*)$/;
const fieldKey = (label: string) => {
  const l = label.toLowerCase().replace(/\s+/g, ' ').trim();
  if (l === 'base image') return 'reference';
  if (l === 'camera' || l === 'medium' || l.startsWith('camera')) return 'camera / medium';
  if (l === 'colors' || l === 'colour' || l === 'palette') return 'color';
  if (l === 'safe area') return 'safe areas';
  return l;
};

/** A brief's labeled fields (lower-case label → text, continuation lines included). */
export function briefFields(prompt: string): Map<string, string> {
  const out = new Map<string, string>();
  let cur: string | undefined;
  for (const line of prompt.split('\n')) {
    const m = line.match(FIELD_RE);
    const key = m && fieldKey(m[1]);
    if (key && (BRIEF_FIELDS as readonly string[]).some((f) => f.toLowerCase() === key)) {
      cur = key;
      out.set(key, m[2].trim());
    } else if (cur && line.trim()) out.set(cur, `${out.get(cur)}\n${line.trim()}`.trim());
  }
  return out;
}

/** What a generation brief still lacks: missing fields, a reference that is not an image, fewer than 3 elements. */
export function briefGaps(prompt: string): string[] {
  const f = briefFields(prompt);
  const gaps: string[] = [];
  for (const name of BRIEF_FIELDS) if (!f.get(name.toLowerCase())) gaps.push(name);
  const ref = f.get('reference');
  if (ref && !referenceImage(ref)) gaps.push('Reference (an image path or URL, not words)');
  const el = f.get('elements');
  if (el && el.split(/\n|;|,(?![^(]*\))/).map((x) => x.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean).length < 3) gaps.push('Elements (list every element: at least 3)');
  return gaps;
}

/** The image path or URL a Reference line points at. */
export function referenceImage(ref: string): string | undefined {
  return ref.match(/(https?:\/\/\S+|[\w./~-]+\.(?:png|jpe?g|gif|webp|avif))/i)?.[1]?.replace(/[),.;]+$/, '');
}

/** Settings and entries (id → status + block) of an existing prompts file. */
export function parsePromptsFile(md: string): { meta: PromptsMeta; entries: Map<string, { status: string; block: string }> } {
  const meta: PromptsMeta = {
    title: md.match(/^# Image prompts — (.+)$/m)?.[1]?.trim(),
    style: md.match(/^\*\*Style for all images:\*\* (.+)$/m)?.[1]?.trim(),
    scale: Number(md.match(/<!-- scale: (\d) -->/)?.[1]) || undefined,
    imagesDir: md.match(/<!-- images: (.+?) -->/)?.[1]?.trim(),
    assetsDir: md.match(/<!-- assets: (.+?) -->/)?.[1]?.trim(),
  };
  const entries = new Map<string, { status: string; block: string }>();
  for (const part of md.split(/^## (?=IMG-\d+)/m).slice(1)) {
    const id = part.match(/^(IMG-\d+)/)?.[1];
    if (!id) continue;
    const status = part.match(/^- \*\*Status:\*\* (.+)$/m)?.[1]?.trim() ?? 'needed';
    // A block ends at the next top-level section ("# From you", "# Placed").
    const body = part.split(/^# /m)[0];
    entries.set(id, { status, block: `## ${body.trimEnd().replace(/\n---$/, '').trimEnd()}` });
  }
  return { meta, entries };
}

export function renderPromptsFile(o: {
  title: string;
  entries: PromptEntry[];
  scale: number;
  imagesDir: string;
  assetsDir?: string;
  style?: string;
  /** Earlier entries no longer in the design: placed ones are kept as history. */
  previous?: Map<string, { status: string; block: string }>;
}): string {
  const assetsDir = o.assetsDir ?? o.imagesDir;
  const generate = o.entries.filter((e) => !e.supply);
  const supply = o.entries.filter((e) => e.supply);
  const L: string[] = [];
  L.push(`# Image prompts — ${o.title}`, '');
  L.push(`<!-- scale: ${o.scale} --> <!-- images: ${o.imagesDir} --> <!-- assets: ${assetsDir} -->`, '');
  L.push('> اعمل كل صورة بالـ prompt بتاعها، واحفظها في فولدر `' + o.imagesDir + '/` (جنب الملف ده) باسم يبدأ بالـ ID، زي `IMG-001.png` أو الاسم المكتوب تحت.');
  if (supply.length) L.push('> الصور اللي تحت «من عندك» مش بتتولّد: دي حاجتك الحقيقية (لوجو، صور منتجات…) — حطها في `' + assetsDir + '/` بالاسم المكتوب.');
  L.push('> بعدها قول «الصور جاهزة»، وهتتحط كل صورة مكانها في فيجما. المقاسات بالبكسل ' + `${o.scale}×` + ' عشان تبقى حادة، ولو أداة الصور بتاخد نسبة بس استخدم الـ ratio.');
  L.push('> الصيغ: PNG أو JPG (لو طلعت WebP حوّلها الأول). صورة كل مكان في `previews/` لو موجودة.', '');
  if (o.style) L.push('**Style for all images:** ' + o.style, '');
  const current = new Set(o.entries.map((e) => e.imageId));
  const kept = [...(o.previous ?? new Map<string, { status: string; block: string }>()).entries()].filter(([id, v]) => !current.has(id) && /^placed/i.test(v.status));
  const table = (list: PromptEntry[]) => {
    L.push('| ID | Image | Used in | Size (px) | Ratio | Status |', '|---|---|---|---|---|---|');
    for (const e of list) {
      const where = [...new Set(e.usages.map((u) => [u.page, u.screen].filter(Boolean).join(' › ')))].join('; ');
      L.push(`| ${e.imageId} | ${e.title} | ${where} | ${Math.round(e.w * o.scale)}×${Math.round(e.h * o.scale)} | ${ratio(e.w, e.h)} | ${e.status} |`);
    }
    L.push('');
  };
  const block = (e: PromptEntry) => {
    L.push('---', '', `## ${e.imageId} — ${e.title}${e.supply ? ' (from you)' : ''}`);
    for (const u of e.usages) L.push(`- **Used in:** ${[u.page, u.path, u.name].filter(Boolean).join(' › ')} · \`${u.nodeId}\` · ${u.w}×${u.h}`);
    const shapes = new Set(e.usages.map((u) => ratio(u.w, u.h)));
    L.push(`- **Size:** ${Math.round(e.w * o.scale)}×${Math.round(e.h * o.scale)} px · ratio ${ratio(e.w, e.h)}${shapes.size > 1 ? ' (used at several shapes: keep the subject centered, each place crops it)' : ''}`);
    L.push(`- **Save as:** \`${e.supply ? assetsDir : o.imagesDir}/${fileNameFor(e)}\``);
    L.push(`- **Status:** ${e.status}`);
    if (e.preview) L.push(`- **Where it goes:** ![${e.imageId} in place](${e.preview})`);
    const ref = !e.supply && referenceImage(briefFields(e.prompt).get('reference') ?? '');
    if (ref) L.push(`- **Reference:** ![${e.imageId} reference](${ref})`);
    const gaps = e.supply || !e.prompt.trim() ? [] : briefGaps(e.prompt);
    if (gaps.length) L.push(`- **Brief incomplete — missing:** ${gaps.join(', ')}`);
    L.push('');
    if (e.supply) L.push('**Needed from you:**', '', e.prompt.trim() || '(describe what is needed)', '');
    else L.push('**Prompt:**', '```text', e.prompt.trim() || '(missing — ask for a prompt for this image)', '```', '');
  };
  if (generate.length) table(generate);
  else if (!supply.length) L.push('_No images waiting._', '');
  for (const e of generate) block(e);
  if (supply.length) {
    L.push('---', '', '# From you — real files, not generated', '');
    table(supply);
    for (const e of supply) block(e);
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
