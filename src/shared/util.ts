// Small helpers shared by the Figma plugin and the MCP server.
// Keep this file free of Node, DOM and Figma globals: it is bundled into both.

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1);
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-./:]+/g, '');

/** Closest candidates to `input`, best first. Used for "did you mean" messages. */
export function suggest(input: string, candidates: Iterable<string>, max = 3): string[] {
  const target = norm(input);
  const scored: Array<[number, string]> = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
    const n = norm(c);
    let score = levenshtein(target, n);
    if (n.includes(target) || target.includes(n)) score = Math.min(score, Math.abs(n.length - target.length) * 0.5);
    const lastSeg = norm(c.split('/').pop() || c);
    if (lastSeg === target) score = Math.min(score, 0.5);
    scored.push([score, c]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length);
  const limit = Math.max(2, target.length * 0.6);
  return scored.filter(([s]) => s <= limit).slice(0, max).map(([, c]) => c);
}

export function didYouMean(input: string, candidates: Iterable<string>): string {
  const s = suggest(input, candidates);
  return s.length ? ` Did you mean ${s.map((x) => JSON.stringify(x)).join(' or ')}?` : '';
}

/** "Color/BG Default" → "color-bg-default" */
export function kebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9؀-ۿ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** "login screen / v2" → "LoginScreenV2" (always starts with a letter) */
export function pascal(s: string): string {
  const words = s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  let out = words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
  if (!out) out = 'Component';
  if (/^[0-9]/.test(out)) out = 'C' + out;
  return out;
}

export function camel(s: string): string {
  const p = pascal(s);
  return p[0].toLowerCase() + p.slice(1);
}

export function round(n: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

export function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep merge for spec patches: objects merge, everything else (arrays included) replaces. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(out[k]) && isPlainObject(v) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/** Accepts "1:23", "1-23", "I1:2;3:4" or a Figma URL with ?node-id=1-23. */
export function normalizeNodeId(input: string): string {
  const s = String(input).trim();
  const m = s.match(/[?&]node-id=([^&#]+)/);
  if (m) return decodeURIComponent(m[1]).replace(/-/g, ':');
  if (/^I?\d+-\d+(;\d+-\d+)*$/.test(s)) return s.replace(/-/g, ':');
  return s;
}

/** File key from a Figma URL (design/file/proto/board), or null. */
export function fileKeyFromUrl(input: string): string | null {
  const m = String(input).match(/figma\.com\/(?:design|file|proto|board|slides)\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
