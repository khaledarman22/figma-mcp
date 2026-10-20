// Loads what the Figma sandbox cannot: icon SVGs (Iconify, cached on disk outside the tool
// folder) and image bytes from local files / URLs / data URIs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectAssetRefs, expandVariants, newIssues, normalizeSpec, type AssetMap, type Spec, type VariantsInput } from '../shared/spec.ts';
import { projectDir } from './files.ts';
import { dataDir } from './log.ts';

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const ICON_API = 'https://api.iconify.design';

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'figma-mcp' } });
  } finally {
    clearTimeout(t);
  }
}

export async function loadIcon(name: string): Promise<string> {
  const m = name.match(/^([a-z0-9-]+):([a-z0-9-]+)$/i);
  if (!m) throw new Error(`icon "${name}": use "set:name", e.g. "lucide:arrow-right" (search names with the icons tool).`);
  const [, set, icon] = m;
  const cacheFile = path.join(dataDir(), 'icons', set.toLowerCase(), `${icon.toLowerCase()}.svg`);
  try {
    return fs.readFileSync(cacheFile, 'utf8');
  } catch {
    /* not cached */
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(`${ICON_API}/${set}/${icon}.svg?width=24&height=24`, 12_000);
  } catch (e) {
    throw new Error(`icon "${name}": could not reach api.iconify.design (${e instanceof Error ? e.message : e}). Offline? Use {type: "svg", svg: "<svg…>"} instead.`);
  }
  const body = await res.text();
  if (!res.ok || !body.includes('<svg') || body.trim() === '404') {
    throw new Error(`icon "${name}" does not exist in Iconify. Find valid names with the icons tool (e.g. query "${icon}", set "${set}").`);
  }
  // Figma reads currentColor as black; recolor happens in Figma through the node's color.
  const svg = body.replace(/currentColor/g, '#000000');
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, svg);
  } catch {
    /* cache is optional */
  }
  return svg;
}

export async function searchIcons(query: string, set?: string, limit = 30): Promise<{ icons: string[]; total: number }> {
  const params = new URLSearchParams({ query, limit: String(Math.min(Math.max(limit, 1), 120)) });
  if (set) params.set('prefix', set);
  const res = await fetchWithTimeout(`${ICON_API}/search?${params}`, 12_000);
  if (!res.ok) throw new Error(`Iconify search failed (${res.status}).`);
  const data = (await res.json()) as { icons?: string[]; total?: number };
  return { icons: data.icons ?? [], total: data.total ?? 0 };
}

function sniff(buf: Buffer): 'png' | 'jpg' | 'gif' | 'webp' | 'svg' | 'avif' | 'unknown' {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  if (buf.slice(4, 12).toString().includes('ftypavif')) return 'avif';
  const head = buf.slice(0, 512).toString('utf8').trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  return 'unknown';
}

export async function loadImage(src: string): Promise<{ data?: string; svg?: string }> {
  let buf: Buffer;
  if (src.startsWith('data:')) {
    const m = src.match(/^data:[^;,]*(;base64)?,(.*)$/s);
    if (!m) throw new Error('bad data: URI');
    buf = m[1] ? Buffer.from(m[2], 'base64') : Buffer.from(decodeURIComponent(m[2]));
  } else if (/^https?:\/\//i.test(src)) {
    let res: Response;
    try {
      res = await fetchWithTimeout(src, 25_000);
    } catch (e) {
      throw new Error(`could not download ${src} (${e instanceof Error ? e.message : e}).`);
    }
    if (!res.ok) throw new Error(`download failed for ${src} (HTTP ${res.status}).`);
    const ab = await res.arrayBuffer();
    buf = Buffer.from(ab);
  } else {
    let file = src.startsWith('file://') ? new URL(src).pathname : src;
    if (file.startsWith('~/')) file = path.join(os.homedir(), file.slice(2));
    if (!path.isAbsolute(file)) {
      const base = projectDir();
      if (!base) throw new Error(`image "${src}" is a relative path; pass an absolute path.`);
      file = path.join(base, file);
    }
    if (!fs.existsSync(file)) throw new Error(`image file not found: ${file}`);
    const st = fs.statSync(file);
    if (st.size > MAX_IMAGE_BYTES) throw new Error(`image ${file} is larger than 25 MB.`);
    buf = fs.readFileSync(file);
  }
  if (buf.length > MAX_IMAGE_BYTES) throw new Error(`image ${src} is larger than 25 MB.`);
  const kind = sniff(buf);
  if (kind === 'svg') return { svg: buf.toString('utf8') };
  if (kind === 'png' || kind === 'jpg' || kind === 'gif') return { data: buf.toString('base64') };
  throw new Error(`image ${src} is ${kind.toUpperCase()}; Figma accepts PNG, JPEG or GIF (convert it first, e.g. "sips -s format png in.webp --out out.png" on macOS).`);
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift() as T);
  }));
}

/** Finds icons/images in raw specs (any shape the tools accept) and loads them. */
export async function loadAssetsFor(raws: Array<{ spec: unknown; partial?: boolean; variants?: VariantsInput }>): Promise<{ assets: AssetMap; errors: string[] }> {
  const refs = { icons: new Set<string>(), images: new Set<string>() };
  for (const r of raws) {
    if (r.spec === undefined || r.spec === null) continue;
    const specs: unknown[] = [];
    if (r.variants) {
      for (const v of expandVariants(r.spec, r.variants, newIssues())) specs.push(v.spec);
    } else specs.push(r.spec);
    for (const s of specs) {
      const spec: Spec = normalizeSpec(s, 'spec', newIssues(), { partial: r.partial });
      collectAssetRefs(spec, refs);
    }
  }
  const assets: AssetMap = { icons: {}, images: {} };
  const errors: string[] = [];
  await pool([...refs.icons], 8, async (name) => {
    try {
      assets.icons![name] = await loadIcon(name);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  });
  await pool([...refs.images], 4, async (src) => {
    try {
      assets.images![src] = await loadImage(src);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  });
  return { assets, errors };
}
