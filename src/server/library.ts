// The image library of a workspace: images found on the web or given by the user, kept once in
// design-<file>/library/ with what they show, their size and license (library.json + LIBRARY.md), so the
// next request reuses them — as they are, or as the base of an edit prompt — instead of searching again.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { kebab } from '../shared/util.ts';
import type { Workspace } from './workspace.ts';

export interface LibraryItem {
  id: string;
  file: string;
  title: string;
  description?: string;
  tags: string[];
  width: number;
  height: number;
  orientation: 'landscape' | 'portrait' | 'square';
  source?: string;
  author?: string;
  license?: string;
  sha1: string;
  added: string;
  figmaId?: string;
}

const DATA = 'library.json';

/** Pixel size from the file header (PNG, JPEG, GIF, WebP). */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

const extOf = (buf: Buffer) => (buf[0] === 0x89 ? 'png' : buf[0] === 0xff ? 'jpg' : buf.toString('ascii', 0, 3) === 'GIF' ? 'gif' : 'webp');

export function readLibrary(ws: Workspace): LibraryItem[] {
  try {
    return JSON.parse(fs.readFileSync(path.join(ws.dir, DATA), 'utf8')).images as LibraryItem[];
  } catch {
    return [];
  }
}

export function writeLibrary(ws: Workspace, items: LibraryItem[]): void {
  fs.writeFileSync(path.join(ws.dir, DATA), JSON.stringify({ updated: new Date().toISOString(), images: items }, null, 2) + '\n');
  fs.writeFileSync(path.join(ws.dir, 'LIBRARY.md'), renderLibrary(ws.meta.figma.name, items));
}

/** Adds one image (bytes already loaded) unless the same file is there; returns the entry and whether it is new. */
export function addToLibrary(ws: Workspace, items: LibraryItem[], buf: Buffer, meta: { title: string; description?: string; tags?: string[]; source?: string; author?: string; license?: string }): { item: LibraryItem; added: boolean } {
  const sha1 = crypto.createHash('sha1').update(buf).digest('hex');
  const twin = items.find((x) => x.sha1 === sha1 || (meta.source && x.source === meta.source));
  if (twin) return { item: twin, added: false };
  const size = imageSize(buf);
  if (!size) throw new Error(`"${meta.title}": not a PNG, JPEG, GIF or WebP image.`);
  const n = items.reduce((m, x) => Math.max(m, Number(x.id.slice(4)) || 0), 0) + 1;
  const id = `LIB-${String(n).padStart(3, '0')}`;
  const file = `library/${id}-${kebab(meta.title).slice(0, 40) || 'image'}.${extOf(buf)}`;
  fs.mkdirSync(path.join(ws.dir, 'library'), { recursive: true });
  fs.writeFileSync(path.join(ws.dir, file), buf);
  const r = size.width / size.height;
  const item: LibraryItem = {
    id,
    file,
    title: meta.title.trim(),
    ...(meta.description ? { description: meta.description.trim() } : {}),
    tags: [...new Set((meta.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))],
    width: size.width,
    height: size.height,
    orientation: r > 1.05 ? 'landscape' : r < 0.95 ? 'portrait' : 'square',
    ...(meta.source ? { source: meta.source } : {}),
    ...(meta.author ? { author: meta.author } : {}),
    ...(meta.license ? { license: meta.license } : {}),
    sha1,
    added: new Date().toISOString().slice(0, 10),
  };
  items.push(item);
  return { item, added: true };
}

/** Entries matching every word of the query (title, description, tags) and the size filters. */
export function searchLibrary(items: LibraryItem[], q: { query?: string; orientation?: string; minWidth?: number; minHeight?: number }): LibraryItem[] {
  const words = (q.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((x) => {
    const hay = [x.title, x.description ?? '', ...x.tags].join(' ').toLowerCase();
    if (words.some((w) => !hay.includes(w))) return false;
    if (q.orientation && x.orientation !== q.orientation) return false;
    if (q.minWidth && x.width < q.minWidth) return false;
    if (q.minHeight && x.height < q.minHeight) return false;
    return true;
  });
}

const shipNote = (x: LibraryItem) => (!x.license || /unknown|reference|editorial/i.test(x.license) ? ' — reference only until licensed' : '');

export function describeItem(x: LibraryItem, ws: Workspace): string {
  return `${x.id} "${x.title}" · ${x.width}×${x.height} ${x.orientation} · ${x.tags.join(', ') || 'no tags'} · ${x.license ?? 'license unknown'}${shipNote(x)} · ${path.join(ws.dir, x.file)}${x.figmaId ? ` · Figma ${x.figmaId}` : ''}`;
}

export function renderLibrary(fileName: string, items: LibraryItem[]): string {
  const L = [
    `# Image library — ${fileName}`,
    '',
    'Images already collected for this design (from the web or from you), with what they show, their size and license.',
    'Look here before searching again. Use one as it is (`src` = its file, or `place_images` `files`), or as the base of an',
    'edit prompt in IMAGE_PROMPTS.md ("Base image: library/LIB-004-….jpg — change: …"). The Figma page "Library" shows them all.',
    '',
  ];
  if (!items.length) return [...L, '_Empty._', ''].join('\n');
  L.push('| ID | Image | Size | Tags | Source · license |', '|---|---|---|---|---|');
  for (const x of items) {
    const src = x.source ? `[source](${x.source})` : 'from you';
    L.push(`| ${x.id} | **${x.title}**${x.description ? ` — ${x.description.replace(/\|/g, '/')}` : ''}<br>\`${x.file}\` | ${x.width}×${x.height} ${x.orientation} | ${x.tags.join(', ')} | ${src}${x.author ? ` · ${x.author}` : ''} · ${x.license ?? 'license unknown'}${shipNote(x)} |`);
  }
  return L.join('\n') + '\n';
}
