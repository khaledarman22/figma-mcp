// Text: fonts (resolved against fonts installed in Figma), styles, rich segments, variable bindings.

import type { FontSpec, Num, PaintSpec, SegmentSpec, Spec } from '../shared/spec.ts';
import type { Ctx } from './ctx.ts';
import { badRequest } from './errors.ts';
import { toPaints } from './paint.ts';

/** Props inherited down the tree, CSS-style. */
export interface Inherit {
  font: FontSpec;
  color?: PaintSpec[];
  rtl?: boolean;
}

export const DEFAULT_FAMILY = 'Inter';

const isVar = (v: unknown): v is string => typeof v === 'string' && v.startsWith('$');

export function lineHeightOf(v: Num): LineHeight | null {
  if (typeof v === 'number') return { unit: 'PIXELS', value: v };
  const s = String(v).trim().toLowerCase();
  if (s === 'auto') return { unit: 'AUTO' };
  if (s.endsWith('%')) return { unit: 'PERCENT', value: parseFloat(s) };
  return null;
}

export function letterSpacingOf(v: Num): LetterSpacing | null {
  if (typeof v === 'number') return { unit: 'PIXELS', value: v };
  const s = String(v).trim();
  if (s.endsWith('%')) return { unit: 'PERCENT', value: parseFloat(s) };
  return null;
}

const CASE: Record<string, TextCase> = {
  original: 'ORIGINAL', upper: 'UPPER', lower: 'LOWER', title: 'TITLE', 'small-caps': 'SMALL_CAPS', 'small-caps-forced': 'SMALL_CAPS_FORCED',
};
const DECORATION: Record<string, TextDecoration> = { none: 'NONE', underline: 'UNDERLINE', strike: 'STRIKETHROUGH' };

function hasFontIdentity(f: FontSpec | undefined): boolean {
  return !!f && (f.family !== undefined || f.weight !== undefined || f.italic !== undefined || f.style !== undefined);
}

/** The FontName a node should use, from its own font spec + inherited font. */
export async function fontFor(own: FontSpec | undefined, inherited: FontSpec, ctx: Ctx, fallback?: FontName): Promise<FontName> {
  const family = own?.family ?? inherited.family ?? fallback?.family ?? DEFAULT_FAMILY;
  const style = own?.style ?? (own?.family === undefined && own?.weight === undefined && own?.italic === undefined ? inherited.style : undefined);
  const weight = own?.weight ?? inherited.weight;
  const italic = own?.italic ?? inherited.italic;
  if (!style && weight === undefined && italic === undefined && fallback && family === fallback.family) return fallback;
  return ctx.resolveFont(family, weight, italic, style);
}

async function applyTypography(node: TextNode, f: FontSpec, ctx: Ctx, path: string, start?: number, end?: number): Promise<void> {
  const range = start !== undefined && end !== undefined && end > start;
  if (f.size !== undefined) {
    if (isVar(f.size)) {
      const v = await ctx.variable(f.size, 'FLOAT');
      if (range) node.setRangeBoundVariable(start!, end!, 'fontSize', v);
      else node.setBoundVariable('fontSize', v);
    } else if (range) node.setRangeFontSize(start!, end!, Number(f.size));
    else node.fontSize = Number(f.size);
  }
  if (f.lineHeight !== undefined) {
    if (isVar(f.lineHeight)) {
      const v = await ctx.variable(f.lineHeight, 'FLOAT');
      if (range) node.setRangeBoundVariable(start!, end!, 'lineHeight', v);
      else node.setBoundVariable('lineHeight', v);
    } else {
      const lh = lineHeightOf(f.lineHeight);
      if (!lh) throw badRequest(`${path}.lineHeight: use a px number, "150%", "auto" or "$variable".`);
      if (range) node.setRangeLineHeight(start!, end!, lh);
      else node.lineHeight = lh;
    }
  }
  if (f.letterSpacing !== undefined) {
    if (isVar(f.letterSpacing)) {
      const v = await ctx.variable(f.letterSpacing, 'FLOAT');
      if (range) node.setRangeBoundVariable(start!, end!, 'letterSpacing', v);
      else node.setBoundVariable('letterSpacing', v);
    } else {
      const ls = letterSpacingOf(f.letterSpacing);
      if (!ls) throw badRequest(`${path}.letterSpacing: use a px number, "-2%" or "$variable".`);
      if (range) node.setRangeLetterSpacing(start!, end!, ls);
      else node.letterSpacing = ls;
    }
  }
  if (f.case) {
    if (range) node.setRangeTextCase(start!, end!, CASE[f.case]);
    else node.textCase = CASE[f.case];
  }
  if (f.decoration) {
    if (range) node.setRangeTextDecoration(start!, end!, DECORATION[f.decoration]);
    else node.textDecoration = DECORATION[f.decoration];
  }
}

/** Range overrides for rich text; runs after the base styling so it wins over it. */
async function applySegmentOverrides(node: TextNode, segments: SegmentSpec[], baseFont: FontName, inherited: FontSpec, ctx: Ctx, path: string) {
  let i = 0;
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[k];
    const start = i;
    const end = i + seg.text.length;
    i = end;
    if (end <= start) continue;
    const p = `${path}.segments[${k}]`;
    if (hasFontIdentity(seg.font)) {
      const fn = await fontFor(seg.font, { ...inherited, family: inherited.family ?? baseFont.family }, ctx, baseFont);
      await ctx.loadFont(fn);
      node.setRangeFontName(start, end, fn);
    }
    if (seg.font) await applyTypography(node, seg.font, ctx, p, start, end);
    if (seg.color) {
      const r = await toPaints(seg.color, ctx, `${p}.color`);
      if (r.styleId) await node.setRangeFillStyleIdAsync(start, end, r.styleId);
      else node.setRangeFills(start, end, r.paints);
    }
    if (seg.link) node.setRangeHyperlink(start, end, { type: 'URL', value: seg.link });
  }
}

/**
 * Applies text content and typography. `isNew` nodes get inherited font/color defaults;
 * existing nodes only change what the spec mentions.
 */
export async function applyText(node: TextNode, spec: Partial<Spec>, inh: Inherit, ctx: Ctx, path: string, isNew: boolean): Promise<void> {
  if (!isNew) await ctx.loadFontsIn(node);

  let styleFont: FontName | undefined;
  if (spec.style) {
    const style = await ctx.style(spec.style, 'TEXT');
    await ctx.loadFont(style.fontName);
    styleFont = style.fontName;
    await node.setTextStyleIdAsync(style.id);
  }

  // Font identity: explicit font props win over the text style; new nodes fall back to inherited.
  let base: FontName | undefined;
  if (hasFontIdentity(spec.font) || (isNew && !styleFont)) {
    base = await fontFor(spec.font, inh.font, ctx, styleFont);
    await ctx.loadFont(base);
    if (styleFont && (base.family !== styleFont.family || base.style !== styleFont.style)) {
      ctx.warn(`${path}: font overrides text style "${spec.style}" (${base.family} ${base.style}).`);
    }
    if (!styleFont || base.family !== styleFont.family || base.style !== styleFont.style) node.fontName = base;
  } else {
    base = styleFont ?? (node.fontName !== figma.mixed ? node.fontName : undefined);
  }

  if (spec.segments?.length) node.characters = spec.segments.map((x) => x.text).join('');
  else if (spec.text !== undefined) node.characters = spec.text;

  // Inherited size/line-height only for new nodes without a text style.
  const typo: FontSpec = isNew && !styleFont
    ? { size: inh.font.size, lineHeight: inh.font.lineHeight, letterSpacing: inh.font.letterSpacing, case: inh.font.case, decoration: inh.font.decoration, ...stripUndefined(spec.font ?? {}) }
    : spec.font ?? {};
  await applyTypography(node, typo, ctx, path);

  // Text styles carry no color, so inherited color applies with or without one.
  const color = spec.color ?? (isNew ? inh.color : undefined);
  if (color) {
    const r = await toPaints(color, ctx, `${path}.color`);
    if (r.styleId) await node.setFillStyleIdAsync(r.styleId);
    else node.fills = r.paints;
  }

  const align = spec.textAlign ?? (isNew && inh.rtl ? 'right' : undefined);
  if (align) node.textAlignHorizontal = ({ left: 'LEFT', center: 'CENTER', right: 'RIGHT', justify: 'JUSTIFIED' } as const)[align];
  if (spec.valign) node.textAlignVertical = ({ top: 'TOP', center: 'CENTER', bottom: 'BOTTOM' } as const)[spec.valign];
  if (spec.paragraphSpacing !== undefined) node.paragraphSpacing = spec.paragraphSpacing;
  if (spec.link) node.setRangeHyperlink(0, node.characters.length, { type: 'URL', value: spec.link });
  if (spec.segments?.length) await applySegmentOverrides(node, spec.segments, base ?? { family: DEFAULT_FAMILY, style: 'Regular' }, inh.font, ctx, path);
}

/** Truncation must be set after auto-resize: changing textAutoResize resets it. */
export function applyTruncation(node: TextNode, spec: Partial<Spec>): void {
  if (spec.maxLines === undefined && spec.truncate === undefined) return;
  const lines = spec.maxLines ?? (spec.truncate ? 1 : null);
  if (lines === null || spec.truncate === false) {
    node.textTruncation = 'DISABLED';
  } else {
    node.textTruncation = 'ENDING';
    node.maxLines = lines;
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

/** Merges a node's own font/color/rtl into what its children inherit. */
export function inheritFrom(inh: Inherit, spec: Partial<Spec>): Inherit {
  return {
    font: { ...inh.font, ...stripUndefined(spec.font ?? {}) },
    color: spec.color && (spec.type === 'frame' || spec.type === 'component' || spec.type === 'section' || spec.type === 'group') ? spec.color : inh.color,
    rtl: spec.rtl ?? inh.rtl,
  };
}
