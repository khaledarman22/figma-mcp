// Color parsing and math. Channels are 0..1 (Figma's convention).

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED: Record<string, string> = {
  transparent: '#00000000',
  white: '#ffffff',
  black: '#000000',
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function parseHex(hex: string): RGBA | null {
  let h = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(h)) return null;
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
}

function parseChannel(v: string, max: number): number {
  const t = v.trim();
  if (t.endsWith('%')) return clamp01(parseFloat(t) / 100);
  return clamp01(parseFloat(t) / max);
}

function parseAlpha(v: string | undefined): number {
  if (v === undefined) return 1;
  const t = v.trim();
  return clamp01(t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t));
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

/** Parses #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba(), hsl()/hsla() and a few names. */
export function parseColor(input: string): RGBA | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (NAMED[s]) return parseHex(NAMED[s]);
  if (s.startsWith('#')) return parseHex(s);
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(s)) return parseHex(s);
  let m = s.match(/^rgba?\(\s*([^,\s]+)[,\s]+([^,\s]+)[,\s]+([^,\s/)]+)(?:\s*[,/]\s*([^)\s]+))?\s*\)$/);
  if (m) return { r: parseChannel(m[1], 255), g: parseChannel(m[2], 255), b: parseChannel(m[3], 255), a: parseAlpha(m[4]) };
  m = s.match(/^hsla?\(\s*([^,\s]+?)(?:deg)?[,\s]+([^,\s]+)[,\s]+([^,\s/)]+)(?:\s*[,/]\s*([^)\s]+))?\s*\)$/);
  if (m) {
    const [r, g, b] = hslToRgb(parseFloat(m[1]), parseChannel(m[2], 100), parseChannel(m[3], 100));
    return { r, g, b, a: parseAlpha(m[4]) };
  }
  return null;
}

const to255 = (n: number) => Math.round(clamp01(n) * 255);
const hex2 = (n: number) => to255(n).toString(16).padStart(2, '0');

/** "#RRGGBB", or "#RRGGBBAA" when alpha < 1. Uppercase, like Figma's UI. */
export function toHex(c: { r: number; g: number; b: number; a?: number }, alpha?: number): string {
  const a = alpha ?? c.a ?? 1;
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`.toUpperCase();
  return a < 0.999 ? base + hex2(a).toUpperCase() : base;
}

export function toCssColor(c: { r: number; g: number; b: number; a?: number }, alpha?: number): string {
  const a = alpha ?? c.a ?? 1;
  if (a >= 0.999) return toHex(c).toLowerCase();
  return `rgba(${to255(c.r)},${to255(c.g)},${to255(c.b)},${Math.round(a * 1000) / 1000})`;
}

function channelLum(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminance(c: { r: number; g: number; b: number }): number {
  return 0.2126 * channelLum(c.r) + 0.7152 * channelLum(c.g) + 0.0722 * channelLum(c.b);
}

export function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Alpha-composite `fg` over an opaque `bg`. */
export function composite(fg: RGBA, bg: { r: number; g: number; b: number }): RGBA {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

export function sameColor(a: RGBA, b: RGBA, tolerance = 0.6 / 255): boolean {
  return (
    Math.abs(a.r - b.r) <= tolerance &&
    Math.abs(a.g - b.g) <= tolerance &&
    Math.abs(a.b - b.b) <= tolerance &&
    Math.abs(a.a - b.a) <= 0.01
  );
}
