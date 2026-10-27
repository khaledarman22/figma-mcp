// The design history shared by every Figma file and project (~/.figma-mcp/history.json): the references
// already used, the directions already designed and the searches already made. A new design reads it so the
// same prompt doesn't bring back the same references and the same layout — it must find and build something else.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { homeDir } from './home.ts';

export interface RefEntry {
  /** The page the reference came from (shot/project URL), or the image URL / file when that's all there is. */
  url: string;
  image?: string;
  sha1?: string;
  title?: string;
  file: string;
  date: string;
}

export interface DirectionEntry {
  name: string;
  concept: string;
  layout: string;
  hero?: string;
  nav?: string;
  palette?: string[];
  fonts?: string[];
  style?: string;
  imagery?: string;
  file: string;
  date: string;
}

export interface SearchEntry {
  q: string;
  file: string;
  date: string;
}

export interface History {
  references: RefEntry[];
  directions: DirectionEntry[];
  searches: SearchEntry[];
}

const MAX = 400;
const today = () => new Date().toISOString().slice(0, 10);
export const historyFile = () => path.join(homeDir(), 'history.json');
export const sha1Of = (data: Buffer | string) => crypto.createHash('sha1').update(data).digest('hex');

/** URLs compared without protocol, "www.", query, hash or trailing slash. */
export const normUrl = (u: string) =>
  u.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

export function readHistory(): History {
  try {
    const h = JSON.parse(fs.readFileSync(historyFile(), 'utf8')) as Partial<History>;
    return { references: h.references ?? [], directions: h.directions ?? [], searches: h.searches ?? [] };
  } catch {
    return { references: [], directions: [], searches: [] };
  }
}

export function writeHistory(h: History): void {
  fs.mkdirSync(path.dirname(historyFile()), { recursive: true });
  const trim = <T>(xs: T[]) => xs.slice(-MAX);
  fs.writeFileSync(historyFile(), JSON.stringify({ references: trim(h.references), directions: trim(h.directions), searches: trim(h.searches) }, null, 2) + '\n');
}

const sameRef = (a: { url: string; image?: string; sha1?: string }, b: { url: string; image?: string; sha1?: string }) => {
  if (a.sha1 && b.sha1 && a.sha1 === b.sha1) return true;
  const ka = [a.url, a.image].filter((x): x is string => !!x).map(normUrl);
  return [b.url, b.image].some((x) => !!x && ka.includes(normUrl(x)));
};

/** Earlier uses of this reference in other Figma files. */
export function usedElsewhere(h: History, ref: { url: string; image?: string; sha1?: string }, file: string): RefEntry[] {
  return h.references.filter((x) => x.file !== file && sameRef(x, ref));
}

/** Adds references (once per file); returns, per new one, its earlier uses in other files. */
export function recordReferences(h: History, refs: Array<Omit<RefEntry, 'date' | 'file'>>, file: string): Array<{ ref: Omit<RefEntry, 'date' | 'file'>; before: RefEntry[] }> {
  const out: Array<{ ref: Omit<RefEntry, 'date' | 'file'>; before: RefEntry[] }> = [];
  for (const r of refs) {
    if (!r.url) continue;
    const before = usedElsewhere(h, r, file);
    if (!h.references.some((x) => x.file === file && sameRef(x, r))) h.references.push({ ...r, file, date: today() });
    out.push({ ref: r, before });
  }
  return out;
}

export function recordDirections(h: History, dirs: Array<Omit<DirectionEntry, 'date' | 'file'>>, file: string): void {
  for (const d of dirs) {
    h.directions = h.directions.filter((x) => !(x.file === file && x.name.toLowerCase() === d.name.toLowerCase()));
    h.directions.push({ ...d, file, date: today() });
  }
}

export function recordSearches(h: History, qs: string[], file: string): void {
  for (const q of qs.map((x) => x.trim()).filter(Boolean)) {
    if (!h.searches.some((x) => x.file === file && x.q.toLowerCase() === q.toLowerCase())) h.searches.push({ q, file, date: today() });
  }
}

/** Image sources inside a spec ("src" anywhere), for references placed with build. */
export function specImageSources(spec: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k === 'src' && typeof x === 'string' && !x.startsWith('data:')) out.add(x);
        else walk(x);
      }
    }
  };
  walk(spec);
  return [...out];
}

const describeDirection = (d: DirectionEntry) =>
  `- ${d.date} · ${d.file} · **${d.name}** — concept: ${d.concept}; layout: ${d.layout}` +
  [d.hero && `hero: ${d.hero}`, d.nav && `nav: ${d.nav}`, d.palette?.length && `palette: ${d.palette.join(' ')}`, d.fonts?.length && `fonts: ${d.fonts.join(' + ')}`, d.style && `style: ${d.style}`, d.imagery && `imagery: ${d.imagery}`]
    .filter(Boolean)
    .map((x) => `; ${x}`)
    .join('');

export function renderHistory(h: History, opts: { limit?: number; file?: string } = {}): string {
  const n = opts.limit ?? 20;
  const recent = <T extends { date: string }>(xs: T[]) => xs.slice(-n).reverse();
  const L: string[] = [`Design history (all files) — ${historyFile()}`];
  L.push('', `## Directions already designed (${h.directions.length}) — a new design must differ from these on at least 3 of: concept, layout, hero, nav, palette, fonts, style, imagery`);
  L.push(...(h.directions.length ? recent(h.directions).map(describeDirection) : ['- none yet']));
  L.push('', `## References already used (${h.references.length}) — don't pick these again for another file unless the user asks`);
  L.push(...(h.references.length ? recent(h.references).map((r) => `- ${r.date} · ${r.file} · ${r.title ? `${r.title} · ` : ''}${r.url}${r.image && r.image !== r.url ? ` (image ${r.image})` : ''}`) : ['- none yet']));
  L.push('', `## Searches already made (${h.searches.length}) — use other words, sites and pages`);
  L.push(...(h.searches.length ? recent(h.searches).map((s) => `- ${s.date} · ${s.file} · ${s.q}`) : ['- none yet']));
  return L.join('\n');
}
