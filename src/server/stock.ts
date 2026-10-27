// Free-license stock photos through the official Unsplash and Pexels APIs. Keys come from the
// environment (UNSPLASH_ACCESS_KEY, PEXELS_API_KEY) or ~/.figma-mcp/keys.json; without one the
// agent searches those sites itself and passes the photo link as an image src.

import fs from 'node:fs';
import path from 'node:path';
import { homeDir } from './home.ts';

export interface StockPhoto {
  provider: 'unsplash' | 'pexels';
  id: string;
  description: string;
  /** Direct image link to use as src (large). */
  src: string;
  preview: string;
  page: string;
  author: string;
  w: number;
  h: number;
}

export type Orientation = 'landscape' | 'portrait' | 'square';

export function stockKeys(): { unsplash?: string; pexels?: string } {
  let file: Record<string, string> = {};
  try {
    file = JSON.parse(fs.readFileSync(path.join(homeDir(), 'keys.json'), 'utf8')) as Record<string, string>;
  } catch {
    /* no keys file */
  }
  return {
    unsplash: process.env.UNSPLASH_ACCESS_KEY || file.unsplash || file.UNSPLASH_ACCESS_KEY || undefined,
    pexels: process.env.PEXELS_API_KEY || file.pexels || file.PEXELS_API_KEY || undefined,
  };
}

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

async function unsplash(key: string, query: string, count: number, orientation?: Orientation): Promise<StockPhoto[]> {
  const o = orientation === 'square' ? 'squarish' : orientation;
  const body = await getJson<{ results?: Array<{ id: string; alt_description?: string | null; description?: string | null; width: number; height: number; urls: { raw: string; small: string }; links: { html: string }; user: { name: string } }> }>(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&content_filter=high${o ? `&orientation=${o}` : ''}`,
    { authorization: `Client-ID ${key}`, 'accept-version': 'v1' },
  );
  return (body.results ?? []).map((r) => ({
    provider: 'unsplash', id: r.id, description: r.alt_description ?? r.description ?? '', src: `${r.urls.raw}&w=2400&fm=jpg&q=85`, preview: r.urls.small,
    page: r.links.html, author: r.user.name, w: r.width, h: r.height,
  }));
}

async function pexels(key: string, query: string, count: number, orientation?: Orientation): Promise<StockPhoto[]> {
  const body = await getJson<{ photos?: Array<{ id: number; alt?: string; width: number; height: number; url: string; photographer: string; src: { large2x: string; medium: string } }> }>(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}${orientation ? `&orientation=${orientation}` : ''}`,
    { authorization: key },
  );
  return (body.photos ?? []).map((r) => ({
    provider: 'pexels', id: String(r.id), description: r.alt ?? '', src: r.src.large2x, preview: r.src.medium, page: r.url, author: r.photographer, w: r.width, h: r.height,
  }));
}

/** Searches every configured provider; errors per provider are reported, not thrown. */
export async function searchStock(query: string, opts: { count?: number; orientation?: Orientation } = {}): Promise<{ photos: StockPhoto[]; providers: string[]; errors: string[] }> {
  const keys = stockKeys();
  const count = Math.min(Math.max(opts.count ?? 6, 1), 20);
  const jobs: Array<[string, () => Promise<StockPhoto[]>]> = [];
  if (keys.unsplash) jobs.push(['unsplash', () => unsplash(keys.unsplash!, query, count, opts.orientation)]);
  if (keys.pexels) jobs.push(['pexels', () => pexels(keys.pexels!, query, count, opts.orientation)]);
  const errors: string[] = [];
  const lists = await Promise.all(jobs.map(async ([name, run]) => {
    try {
      return await run();
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : e}`);
      return [];
    }
  }));
  // Interleave so one provider doesn't fill the list.
  const photos: StockPhoto[] = [];
  for (let i = 0; photos.length < count && lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i] && photos.length < count) photos.push(l[i]);
  return { photos, providers: jobs.map(([n]) => n), errors };
}

/** A small preview to show the model (null when it can't be fetched). */
export async function previewBytes(url: string): Promise<Buffer | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length < 1_500_000 ? buf : null;
  } catch {
    return null;
  }
}
