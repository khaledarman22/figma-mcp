// Local styles: upsert text / paint / effect / grid styles by name, and read them back.

import { newIssues, normalizeSpec, type FontSpec } from '../shared/spec.ts';
import { toCssColor } from '../shared/color.ts';
import { Ctx } from './ctx.ts';
import { badRequest } from './errors.ts';
import { toEffects, toPaints } from './paint.ts';
import { fontFor, letterSpacingOf, lineHeightOf } from './text.ts';

export interface StylesParams {
  text?: Array<{ name: string; font?: unknown; description?: string; [k: string]: unknown }>;
  paint?: Array<{ name: string; fill?: unknown; color?: unknown; description?: string }>;
  effect?: Array<{ name: string; effects?: unknown; shadow?: unknown; description?: string }>;
  grid?: Array<{ name: string; grids: GridDef[]; description?: string }>;
  delete?: string[];
}

interface GridDef {
  pattern?: 'columns' | 'rows' | 'grid';
  count?: number;
  gutter?: number;
  offset?: number;
  size?: number;
  align?: 'stretch' | 'center' | 'start' | 'end';
  color?: string;
}

const CASE: Record<string, TextCase> = { original: 'ORIGINAL', upper: 'UPPER', lower: 'LOWER', title: 'TITLE', 'small-caps': 'SMALL_CAPS', 'small-caps-forced': 'SMALL_CAPS_FORCED' };
const DECO: Record<string, TextDecoration> = { none: 'NONE', underline: 'UNDERLINE', strike: 'STRIKETHROUGH' };

async function findStyle<T extends BaseStyle>(list: T[], name: string): Promise<T | undefined> {
  return list.find((s) => s.name.toLowerCase() === name.toLowerCase());
}

export async function upsertStyles(p: StylesParams) {
  const ctx = new Ctx();
  const out = { text: [] as string[], paint: [] as string[], effect: [] as string[], grid: [] as string[], deleted: [] as string[], errors: [] as string[], warnings: [] as string[] };
  const [texts, paints, effects, grids] = await Promise.all([
    figma.getLocalTextStylesAsync(),
    figma.getLocalPaintStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync(),
  ]);

  for (const def of p.text ?? []) {
    try {
      if (!def.name) throw badRequest('text style needs a name.');
      const issues = newIssues();
      // Reuse the node normalizer so "600 16/24 Inter", fontSize, lineHeight: 1.5 … all work.
      const { name: _n, description, ...rest } = def;
      const spec = normalizeSpec({ type: 'text', text: '', ...rest }, `text["${def.name}"]`, issues);
      if (issues.errors.length) throw badRequest(issues.errors.join('; '));
      const f: FontSpec = spec.font ?? {};
      let style = await findStyle(texts, def.name);
      const isNew = !style;
      if (!style) {
        style = figma.createTextStyle();
        style.name = def.name;
      }
      const fn = await fontFor(f, {}, ctx, isNew ? undefined : style.fontName);
      await ctx.loadFont(fn);
      style.fontName = fn;
      const bind = async (field: VariableBindableTextField, v: unknown) => {
        const variable = await ctx.variable(String(v), 'FLOAT');
        style!.setBoundVariable(field, variable);
      };
      if (f.size !== undefined) {
        if (typeof f.size === 'string' && f.size.startsWith('$')) await bind('fontSize', f.size);
        else style.fontSize = Number(f.size);
      }
      if (f.lineHeight !== undefined) {
        if (typeof f.lineHeight === 'string' && f.lineHeight.startsWith('$')) await bind('lineHeight', f.lineHeight);
        else {
          const lh = lineHeightOf(f.lineHeight);
          if (lh) style.lineHeight = lh;
        }
      }
      if (f.letterSpacing !== undefined) {
        if (typeof f.letterSpacing === 'string' && f.letterSpacing.startsWith('$')) await bind('letterSpacing', f.letterSpacing);
        else {
          const ls = letterSpacingOf(f.letterSpacing);
          if (ls) style.letterSpacing = ls;
        }
      }
      if (f.case) style.textCase = CASE[f.case];
      if (f.decoration) style.textDecoration = DECO[f.decoration];
      if (spec.paragraphSpacing !== undefined) style.paragraphSpacing = spec.paragraphSpacing;
      if (description !== undefined) style.description = String(description);
      out.text.push(`${isNew ? '+' : '~'} ${style.name} (${fn.family} ${fn.style} ${String(style.fontSize)})`);
      out.warnings.push(...issues.warnings, ...ctx.warnings.splice(0));
    } catch (e) {
      out.errors.push(`text "${def.name}": ${e instanceof Error ? e.message : e}`);
    }
  }

  for (const def of p.paint ?? []) {
    try {
      if (!def.name) throw badRequest('paint style needs a name.');
      const issues = newIssues();
      const spec = normalizeSpec({ type: 'rect', fill: def.fill ?? def.color }, `paint["${def.name}"]`, issues);
      if (issues.errors.length) throw badRequest(issues.errors.join('; '));
      if (!spec.fill?.length) throw badRequest('give "fill" (color, "$variable", gradient or image).');
      if (spec.fill.some((x) => x.kind === 'style')) throw badRequest('a paint style cannot reference another style.');
      const r = await toPaints(spec.fill, ctx, `paint["${def.name}"]`);
      let style = await findStyle(paints, def.name);
      const isNew = !style;
      if (!style) {
        style = figma.createPaintStyle();
        style.name = def.name;
      }
      style.paints = r.paints;
      if (def.description !== undefined) style.description = def.description;
      out.paint.push(`${isNew ? '+' : '~'} ${style.name}`);
    } catch (e) {
      out.errors.push(`paint "${def.name}": ${e instanceof Error ? e.message : e}`);
    }
  }

  for (const def of p.effect ?? []) {
    try {
      if (!def.name) throw badRequest('effect style needs a name.');
      const issues = newIssues();
      const spec = normalizeSpec({ type: 'rect', effects: def.effects ?? def.shadow }, `effect["${def.name}"]`, issues);
      if (issues.errors.length) throw badRequest(issues.errors.join('; '));
      if (!spec.effects?.length) throw badRequest('give "effects" (e.g. "0 4 12 -2 rgba(0,0,0,0.12)").');
      const r = await toEffects(spec.effects, ctx, `effect["${def.name}"]`);
      let style = await findStyle(effects, def.name);
      const isNew = !style;
      if (!style) {
        style = figma.createEffectStyle();
        style.name = def.name;
      }
      style.effects = r.effects;
      if (def.description !== undefined) style.description = def.description;
      out.effect.push(`${isNew ? '+' : '~'} ${style.name}`);
    } catch (e) {
      out.errors.push(`effect "${def.name}": ${e instanceof Error ? e.message : e}`);
    }
  }

  for (const def of p.grid ?? []) {
    try {
      const layoutGrids: LayoutGrid[] = (def.grids ?? []).map((g) => {
        const color = { r: 1, g: 0, b: 0, a: 0.1 };
        if ((g.pattern ?? 'columns') === 'grid') return { pattern: 'GRID', sectionSize: g.size ?? 8, visible: true, color };
        const alignment = ({ stretch: 'STRETCH', center: 'CENTER', start: 'MIN', end: 'MAX' } as const)[g.align ?? 'stretch'];
        const base = { pattern: g.pattern === 'rows' ? 'ROWS' : 'COLUMNS', count: g.count ?? 12, gutterSize: g.gutter ?? 16, visible: true, color } as const;
        return alignment === 'STRETCH'
          ? { ...base, alignment, offset: g.offset ?? 0 }
          : alignment === 'CENTER'
            ? { ...base, alignment, sectionSize: g.size ?? 64 }
            : { ...base, alignment, offset: g.offset ?? 0, sectionSize: g.size ?? 64 };
      });
      let style = await findStyle(grids, def.name);
      const isNew = !style;
      if (!style) {
        style = figma.createGridStyle();
        style.name = def.name;
      }
      style.layoutGrids = layoutGrids;
      if (def.description !== undefined) style.description = def.description;
      out.grid.push(`${isNew ? '+' : '~'} ${style.name}`);
    } catch (e) {
      out.errors.push(`grid "${def.name}": ${e instanceof Error ? e.message : e}`);
    }
  }

  for (const name of p.delete ?? []) {
    const s = [...texts, ...paints, ...effects, ...grids].find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (s) {
      s.remove();
      out.deleted.push(name);
    } else out.errors.push(`delete: no style "${name}".`);
  }
  return out;
}

function describePaint(p: Paint): string {
  if (p.type === 'SOLID') return toCssColor(p.color, p.opacity ?? 1);
  if (p.type.startsWith('GRADIENT')) {
    const g = p as GradientPaint;
    return `${p.type.toLowerCase().replace('gradient_', '')}-gradient(${g.gradientStops.map((s) => `${toCssColor(s.color, s.color.a)} ${Math.round(s.position * 100)}%`).join(', ')})`;
  }
  return p.type.toLowerCase();
}

export function describeEffect(e: Effect): string {
  if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
    return `${e.type === 'INNER_SHADOW' ? 'inset ' : ''}${e.offset.x} ${e.offset.y} ${e.radius} ${e.spread ?? 0} ${toCssColor(e.color, e.color.a)}`;
  }
  if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') return `${e.type === 'LAYER_BLUR' ? 'blur' : 'backdrop-blur'}(${e.radius})`;
  return e.type.toLowerCase();
}

async function varName(alias: VariableAlias | undefined): Promise<string | undefined> {
  if (!alias) return undefined;
  const v = await figma.variables.getVariableByIdAsync(alias.id);
  return v ? `$${v.name}` : undefined;
}

export async function readStyles() {
  const [texts, paints, effects, grids] = await Promise.all([
    figma.getLocalTextStylesAsync(),
    figma.getLocalPaintStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync(),
  ]);
  const text = [];
  for (const s of texts) {
    const bv = s.boundVariables ?? {};
    text.push({
      id: s.id,
      key: s.key,
      name: s.name,
      family: s.fontName.family,
      style: s.fontName.style,
      size: s.fontSize,
      lineHeight: s.lineHeight.unit === 'AUTO' ? 'auto' : s.lineHeight.unit === 'PERCENT' ? `${Math.round(s.lineHeight.value)}%` : s.lineHeight.value,
      letterSpacing: s.letterSpacing.unit === 'PERCENT' ? `${s.letterSpacing.value}%` : s.letterSpacing.value,
      case: s.textCase !== 'ORIGINAL' ? s.textCase.toLowerCase() : undefined,
      decoration: s.textDecoration !== 'NONE' ? s.textDecoration.toLowerCase() : undefined,
      vars: {
        fontSize: await varName(bv.fontSize as VariableAlias | undefined),
        lineHeight: await varName(bv.lineHeight as VariableAlias | undefined),
        fontFamily: await varName(bv.fontFamily as VariableAlias | undefined),
        fontWeight: await varName(bv.fontWeight as VariableAlias | undefined),
      },
      description: s.description || undefined,
    });
  }
  const paint = [];
  for (const s of paints) {
    const vars = await Promise.all(s.paints.map((p) => (p.type === 'SOLID' ? varName(p.boundVariables?.color) : Promise.resolve(undefined))));
    paint.push({ id: s.id, key: s.key, name: s.name, value: s.paints.map(describePaint).join(', '), vars: vars.filter(Boolean), description: s.description || undefined });
  }
  return {
    text,
    paint,
    effect: effects.map((s) => ({ id: s.id, key: s.key, name: s.name, value: s.effects.map(describeEffect).join(', '), description: s.description || undefined })),
    grid: grids.map((s) => ({ id: s.id, name: s.name, grids: s.layoutGrids.map((g) => ({ pattern: g.pattern.toLowerCase(), ...('count' in g ? { count: g.count, gutter: g.gutterSize } : {}), ...('sectionSize' in g && g.sectionSize ? { size: g.sectionSize } : {}) })) })),
  };
}
