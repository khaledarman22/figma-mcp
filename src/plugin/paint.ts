// Spec paints / strokes / effects → Figma objects, with variable bindings.

import { parseColor, type RGBA } from '../shared/color.ts';
import type { EffectSpec, Num, PaintSpec, StrokeSpec } from '../shared/spec.ts';
import { badRequest } from './errors.ts';
import type { Ctx } from './ctx.ts';

const isVar = (v: unknown): v is string => typeof v === 'string' && v.startsWith('$');

/** A color string or "$variable" → {rgba, variable?}. Variables resolve to their default-mode value. */
export async function colorOf(input: string, ctx: Ctx, path: string): Promise<{ rgba: RGBA; variable?: Variable }> {
  if (isVar(input)) {
    const v = await ctx.variable(input, 'COLOR');
    const val = await ctx.resolveVariableValue(v);
    const c = val as RGBA;
    return { rgba: { r: c.r ?? 0, g: c.g ?? 0, b: c.b ?? 0, a: c.a ?? 1 }, variable: v };
  }
  const c = parseColor(input);
  if (!c) throw badRequest(`${path}: cannot read color ${JSON.stringify(input)} (use #RRGGBB, #RRGGBBAA, rgb(), hsl() or "$variable").`);
  return { rgba: c };
}

/** CSS angle (0 = to top, 90 = to right, 180 = to bottom) → Figma gradientTransform. */
export function gradientTransform(angleDeg: number): Transform {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  return [
    [dx, dy, 0.5 - 0.5 * dx - 0.5 * dy],
    [-dy, dx, 0.5 + 0.5 * dy - 0.5 * dx],
  ];
}

/** Inverse of gradientTransform: CSS angle in degrees. */
export function angleOf(t: Transform): number {
  const dx = t[0][0];
  const dy = t[0][1];
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return Math.round(((deg % 360) + 360) % 360);
}

const SCALE_MODE = { fill: 'FILL', fit: 'FIT', crop: 'CROP', tile: 'TILE' } as const;

export interface ResolvedPaints {
  paints: Paint[];
  styleId?: string;
}

export async function toPaints(specs: PaintSpec[] | null, ctx: Ctx, path: string): Promise<ResolvedPaints> {
  if (!specs || !specs.length) return { paints: [] };
  const style = specs.find((s) => s.kind === 'style');
  if (style && style.kind === 'style') {
    if (specs.length > 1) ctx.warn(`${path}: a paint style replaces the whole fill list; other paints ignored.`);
    const s = await ctx.style(style.name, 'PAINT');
    return { paints: [...s.paints], styleId: s.id };
  }
  const out: Paint[] = [];
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    const p = specs.length > 1 ? `${path}[${i}]` : path;
    if (s.kind === 'solid') {
      const { rgba, variable } = await colorOf(s.color, ctx, p);
      const base: SolidPaint = { type: 'SOLID', color: { r: rgba.r, g: rgba.g, b: rgba.b }, opacity: variable ? s.opacity ?? 1 : rgba.a * (s.opacity ?? 1) };
      out.push(variable ? figma.variables.setBoundVariableForPaint(base, 'color', variable) : base);
    } else if (s.kind === 'gradient') {
      const stops: ColorStop[] = [];
      for (const st of s.stops) {
        const { rgba, variable } = await colorOf(st.color, ctx, `${p}.stops`);
        const stop: ColorStop = variable
          ? { position: st.position, color: rgba, boundVariables: { color: figma.variables.createVariableAlias(variable) } }
          : { position: st.position, color: rgba };
        stops.push(stop);
      }
      const type = ({ linear: 'GRADIENT_LINEAR', radial: 'GRADIENT_RADIAL', angular: 'GRADIENT_ANGULAR', diamond: 'GRADIENT_DIAMOND' } as const)[s.gradient];
      const transform: Transform = s.gradient === 'linear' ? gradientTransform(s.angle) : [[1, 0, 0], [0, 1, 0]];
      out.push({ type, gradientTransform: transform, gradientStops: stops, opacity: s.opacity ?? 1 });
    } else if (s.kind === 'image') {
      if (!s.imageData) {
        throw badRequest(`${p}: image "${s.src ?? ''}" was not loaded. Image sources are read by the MCP server (absolute file path or http(s) URL); inside execute use figma.createImage(bytes).`);
      }
      const image = figma.createImage(figma.base64Decode(s.imageData));
      out.push({ type: 'IMAGE', imageHash: image.hash, scaleMode: SCALE_MODE[s.fit], opacity: s.opacity ?? 1 });
    }
  }
  return { paints: out };
}

/** Sets fills (or a fill style) on a node. */
export async function applyFills(node: SceneNode, specs: PaintSpec[] | null, ctx: Ctx, path: string): Promise<void> {
  if (!('fills' in node)) {
    ctx.warn(`${path}: ${node.type.toLowerCase()} has no fills.`);
    return;
  }
  const r = await toPaints(specs, ctx, path);
  if (r.styleId) await (node as MinimalFillsMixin).setFillStyleIdAsync(r.styleId);
  else (node as MinimalFillsMixin).fills = r.paints;
}

export async function bindNumber(node: SceneNode, field: VariableBindableNodeField, value: Num, ctx: Ctx, path: string): Promise<number | undefined> {
  if (isVar(value)) {
    const v = await ctx.variable(value, 'FLOAT');
    node.setBoundVariable(field, v);
    const resolved = await ctx.resolveVariableValue(v);
    return typeof resolved === 'number' ? resolved : undefined;
  }
  if (typeof value !== 'number') throw badRequest(`${path}: expected a number or "$variable".`);
  return value;
}

/** Numeric value of a Num without binding (variables resolved to their current value). */
export async function numberOf(value: Num, ctx: Ctx): Promise<{ n: number; variable?: Variable }> {
  if (isVar(value)) {
    const v = await ctx.variable(value as string, 'FLOAT');
    const resolved = await ctx.resolveVariableValue(v);
    return { n: typeof resolved === 'number' ? resolved : 0, variable: v };
  }
  return { n: Number(value) };
}

export async function applyStroke(node: SceneNode, s: StrokeSpec | null, ctx: Ctx, path: string): Promise<void> {
  if (!('strokes' in node)) {
    ctx.warn(`${path}: ${node.type.toLowerCase()} has no strokes.`);
    return;
  }
  const n = node as MinimalStrokesMixin & SceneNode;
  if (s === null) {
    n.strokes = [];
    return;
  }
  if (s.paints.length) {
    const r = await toPaints(s.paints, ctx, `${path}.color`);
    if (r.styleId) await n.setStrokeStyleIdAsync(r.styleId);
    else n.strokes = r.paints;
  }
  if (s.weight !== undefined) {
    if (Array.isArray(s.weight)) {
      if (!('strokeTopWeight' in node)) throw badRequest(`${path}.weight: per-side stroke weights need a frame or rectangle.`);
      const fields = ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'] as const;
      for (let i = 0; i < 4; i++) {
        const val = await bindNumber(node, fields[i], s.weight[i], ctx, `${path}.weight[${i}]`);
        if (val !== undefined && typeof s.weight[i] === 'number') (node as unknown as IndividualStrokesMixin)[fields[i]] = val;
      }
    } else {
      const val = await bindNumber(node, 'strokeWeight', s.weight, ctx, `${path}.weight`);
      if (val !== undefined && typeof s.weight === 'number') n.strokeWeight = val;
    }
  }
  if (s.align) n.strokeAlign = ({ inside: 'INSIDE', center: 'CENTER', outside: 'OUTSIDE' } as const)[s.align];
  if (s.dash) n.dashPattern = s.dash;
  if (s.cap && 'strokeCap' in node) (node as unknown as GeometryMixin).strokeCap = ({ none: 'NONE', round: 'ROUND', square: 'SQUARE' } as const)[s.cap];
  if (s.join) n.strokeJoin = ({ miter: 'MITER', bevel: 'BEVEL', round: 'ROUND' } as const)[s.join];
}

export async function toEffects(specs: EffectSpec[] | null, ctx: Ctx, path: string): Promise<{ effects: Effect[]; styleId?: string }> {
  if (!specs || !specs.length) return { effects: [] };
  const style = specs.find((s) => s.kind === 'style');
  if (style && style.kind === 'style') {
    if (specs.length > 1) ctx.warn(`${path}: an effect style replaces the whole effect list; other effects ignored.`);
    const s = await ctx.style(style.name, 'EFFECT');
    return { effects: [...s.effects], styleId: s.id };
  }
  const out: Effect[] = [];
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    const p = `${path}[${i}]`;
    if (s.kind === 'drop-shadow' || s.kind === 'inner-shadow') {
      const { rgba, variable } = await colorOf(s.color, ctx, `${p}.color`);
      const [x, y, blur, spread] = await Promise.all([numberOf(s.x, ctx), numberOf(s.y, ctx), numberOf(s.blur, ctx), numberOf(s.spread, ctx)]);
      let e: Effect =
        s.kind === 'drop-shadow'
          ? { type: 'DROP_SHADOW', color: rgba, offset: { x: x.n, y: y.n }, radius: blur.n, spread: spread.n, visible: true, blendMode: 'NORMAL', showShadowBehindNode: false }
          : { type: 'INNER_SHADOW', color: rgba, offset: { x: x.n, y: y.n }, radius: blur.n, spread: spread.n, visible: true, blendMode: 'NORMAL' };
      if (variable) e = figma.variables.setBoundVariableForEffect(e, 'color', variable);
      if (x.variable) e = figma.variables.setBoundVariableForEffect(e, 'offsetX', x.variable);
      if (y.variable) e = figma.variables.setBoundVariableForEffect(e, 'offsetY', y.variable);
      if (blur.variable) e = figma.variables.setBoundVariableForEffect(e, 'radius', blur.variable);
      if (spread.variable) e = figma.variables.setBoundVariableForEffect(e, 'spread', spread.variable);
      out.push(e);
    } else if (s.kind === 'layer-blur' || s.kind === 'background-blur') {
      const r = await numberOf(s.radius, ctx);
      let e: Effect = { type: s.kind === 'layer-blur' ? 'LAYER_BLUR' : 'BACKGROUND_BLUR', blurType: 'NORMAL', radius: r.n, visible: true };
      if (r.variable) e = figma.variables.setBoundVariableForEffect(e, 'radius', r.variable);
      out.push(e);
    }
  }
  return { effects: out };
}

export async function applyEffects(node: SceneNode, specs: EffectSpec[] | null, ctx: Ctx, path: string): Promise<void> {
  if (!('effects' in node)) {
    ctx.warn(`${path}: ${node.type.toLowerCase()} has no effects.`);
    return;
  }
  const r = await toEffects(specs, ctx, path);
  if (r.styleId) await (node as BlendMixin).setEffectStyleIdAsync(r.styleId);
  else (node as BlendMixin).effects = r.effects;
}

/** Recolors the visible vector layers of an icon/svg/instance (strokes stay strokes, fills stay fills). */
export async function recolorVectors(root: SceneNode, specs: PaintSpec[], ctx: Ctx, path: string): Promise<number> {
  const r = await toPaints(specs, ctx, path);
  if (!r.paints.length && !r.styleId) return 0;
  const targets: SceneNode[] = [];
  const visit = (n: SceneNode) => {
    if (['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'ELLIPSE', 'RECTANGLE', 'LINE'].includes(n.type)) targets.push(n);
    if ('children' in n && n.type !== 'BOOLEAN_OPERATION') for (const c of n.children) visit(c);
  };
  visit(root);
  let count = 0;
  for (const t of targets) {
    const g = t as GeometryMixin & SceneNode;
    const hasStroke = Array.isArray(g.strokes) && g.strokes.some((s) => s.visible !== false);
    const hasFill = Array.isArray(g.fills) && (g.fills as Paint[]).some((f) => f.visible !== false);
    if (hasStroke) {
      if (r.styleId) await g.setStrokeStyleIdAsync(r.styleId);
      else g.strokes = r.paints;
      count++;
    }
    if (hasFill) {
      if (r.styleId) await g.setFillStyleIdAsync(r.styleId);
      else g.fills = r.paints;
      count++;
    }
  }
  return count;
}
