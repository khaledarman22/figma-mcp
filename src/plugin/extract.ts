// Design context extraction: a compact, code-oriented tree of a node (layout, sizing, tokens,
// typography, components, assets, interactions) plus dictionaries of the variables, styles and
// components it uses. The MCP server turns this into reference code (React/Tailwind or HTML/CSS).

import { toHex } from '../shared/color.ts';
import { kebab, round } from '../shared/util.ts';
import { Ctx } from './ctx.ts';
import { angleOf } from './paint.ts';
import { describeTransition, screenOf } from './prototype.ts';
import { pageOf } from './inspect.ts';
import { isPlaceholderBox, neededPrompt } from './pages.ts';

export type XPaint =
  | { t: 'solid'; c: string; v?: string }
  | { t: 'gradient'; kind: 'linear' | 'radial' | 'angular' | 'diamond'; angle?: number; stops: Array<{ c: string; p: number; v?: string }> }
  | { t: 'image'; ref: string; fit: string };

export type XEffect =
  | { t: 'shadow' | 'inner'; x: number; y: number; blur: number; spread: number; c: string; v?: string }
  | { t: 'blur' | 'bg-blur'; r: number };

export interface XFont {
  family: string;
  style: string;
  weight: number;
  italic?: boolean;
  size: number;
  lh: number | string;
  ls: number | string;
  case?: string;
  deco?: string;
}

export interface XNode {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: true;
  layout?: {
    dir: 'row' | 'column' | 'grid';
    gap?: number;
    between?: true;
    rowGap?: number;
    colGap?: number;
    cols?: number;
    rows?: number;
    pad?: [number, number, number, number];
    justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
    align?: 'start' | 'center' | 'end' | 'baseline';
    wrap?: true;
  };
  sizing?: { w: 'fixed' | 'hug' | 'fill'; h: 'fixed' | 'hug' | 'fill' };
  abs?: true;
  constraints?: { h: string; v: string };
  min?: { w?: number; h?: number };
  max?: { w?: number; h?: number };
  cell?: { row: number; col: number; rowSpan: number; colSpan: number };
  fills?: XPaint[];
  strokes?: XPaint[];
  strokeW?: number | [number, number, number, number];
  strokeAlign?: string;
  dash?: number[];
  radius?: number | [number, number, number, number];
  effects?: XEffect[];
  opacity?: number;
  blend?: string;
  clip?: true;
  rotation?: number;
  vars?: Record<string, string>;
  styles?: { fill?: string; stroke?: string; text?: string; effect?: string };
  text?: {
    chars: string;
    font: XFont;
    align: string;
    valign: string;
    autoResize: string;
    maxLines?: number;
    segs?: Array<{ chars: string; font?: Partial<XFont>; fills?: XPaint[]; link?: string }>;
    link?: string;
  };
  comp?: { kind: 'instance' | 'component' | 'set'; name: string; variant?: Record<string, string>; props?: Record<string, string | boolean>; key?: string };
  asset?: { kind: 'svg' | 'image'; id: string };
  reactions?: Array<{ trigger: string; action: string; to?: string; toName?: string; transition?: string; url?: string }>;
  children?: XNode[];
  more?: number;
}

export interface XVar {
  name: string;
  collection: string;
  type: string;
  css: string;
  value: string | number | boolean;
  modes?: Record<string, string | number | boolean>;
}

export interface ExtractParams {
  nodeId?: string;
  depth?: number;
  maxNodes?: number;
  includeHidden?: boolean;
  instances?: 'inline' | 'reference';
}

const PATH_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON']);
const SHAPE_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'ELLIPSE', 'RECTANGLE', 'LINE']);

/** A container that is itself visible (fill/stroke/effect) or laid out is UI, not artwork. */
function isStyledContainer(n: SceneNode): boolean {
  if (!('children' in n) || n.type === 'BOOLEAN_OPERATION') return false;
  const f = n as FrameNode;
  if ('layoutMode' in f && f.layoutMode !== 'NONE') return true;
  const visible = (list: unknown) => Array.isArray(list) && (list as Array<{ visible?: boolean }>).some((p) => p.visible !== false);
  return ('fills' in f && visible(f.fills)) || ('strokes' in f && visible(f.strokes)) || ('effects' in f && visible(f.effects));
}

/** Icon-like: only shapes, at least one real path, no text, no image fills, no styled container. */
function isVectorAsset(n: SceneNode): boolean {
  if (isStyledContainer(n)) return false;
  let hasPath = false;
  const ok = (x: SceneNode): boolean => {
    if (x.type === 'TEXT') return false;
    if ('fills' in x && Array.isArray((x as GeometryMixin).fills) && ((x as GeometryMixin).fills as Paint[]).some((f) => f.type === 'IMAGE')) return false;
    if (PATH_TYPES.has(x.type)) {
      hasPath = true;
      return true;
    }
    if (SHAPE_TYPES.has(x.type)) return true;
    if ('children' in x) return x.children.length > 0 && !(x !== n && isStyledContainer(x)) && x.children.every((c) => !c.visible || ok(c));
    return false;
  };
  const res = ok(n);
  return res && hasPath;
}

function fmtLh(lh: LineHeight): number | string {
  return lh.unit === 'AUTO' ? 'auto' : lh.unit === 'PERCENT' ? `${round(lh.value, 1)}%` : round(lh.value, 2);
}
function fmtLs(ls: LetterSpacing): number | string {
  return ls.unit === 'PERCENT' ? `${round(ls.value, 2)}%` : round(ls.value, 2);
}

class Extractor {
  vars = new Map<string, XVar>();
  private varById = new Map<string, string | null>();
  styles = new Map<string, { type: string; name: string }>();
  components = new Map<string, { name: string; key?: string; description?: string; props?: Record<string, unknown>; remote?: boolean }>();
  assets: Array<{ id: string; nodeId: string; name: string; kind: 'svg' | 'image'; w: number; h: number; imageHash?: string; pending?: { imageId?: string; prompt?: string } }> = [];
  private assetNames = new Set<string>();
  fonts = new Set<string>();
  count = 0;
  truncated = false;
  private mainCache = new Map<string, ComponentNode | null>();
  private p: ExtractParams;

  constructor(p: ExtractParams) {
    this.p = p;
  }

  private async varName(alias: VariableAlias | VariableAlias[] | undefined): Promise<string | undefined> {
    if (!alias) return undefined;
    const a = Array.isArray(alias) ? alias[0] : alias;
    if (!a?.id) return undefined;
    if (this.varById.has(a.id)) return this.varById.get(a.id) ?? undefined;
    const v = await figma.variables.getVariableByIdAsync(a.id);
    if (!v) {
      this.varById.set(a.id, null);
      return undefined;
    }
    this.varById.set(a.id, v.name);
    if (!this.vars.has(v.name)) await this.recordVar(v);
    return v.name;
  }

  private async recordVar(v: Variable) {
    const coll = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
    const fmt = async (val: VariableValue, depth = 0): Promise<string | number | boolean> => {
      if (val && typeof val === 'object' && 'type' in val && (val as VariableAlias).type === 'VARIABLE_ALIAS') {
        const t = await figma.variables.getVariableByIdAsync((val as VariableAlias).id);
        return t ? `$${t.name}` : '$?';
      }
      if (val && typeof val === 'object' && 'r' in val) return toHex(val as RGBA);
      return val as string | number | boolean;
    };
    const resolve = async (vv: Variable, modeId: string | undefined, depth = 0): Promise<string | number | boolean> => {
      const c = await figma.variables.getVariableCollectionByIdAsync(vv.variableCollectionId);
      const mid = modeId && modeId in vv.valuesByMode ? modeId : c?.defaultModeId ?? Object.keys(vv.valuesByMode)[0];
      const val = vv.valuesByMode[mid];
      if (val && typeof val === 'object' && 'type' in val && (val as VariableAlias).type === 'VARIABLE_ALIAS' && depth < 10) {
        const t = await figma.variables.getVariableByIdAsync((val as VariableAlias).id);
        return t ? resolve(t, undefined, depth + 1) : '?';
      }
      return fmt(val);
    };
    const modes: Record<string, string | number | boolean> = {};
    if (coll && coll.modes.length > 1) for (const m of coll.modes) modes[m.name] = await resolve(v, m.modeId);
    const web = v.codeSyntax.WEB;
    const css = web ? web.replace(/^var\((.*)\)$/, '$1').trim() : `--${kebab(v.name)}`;
    this.vars.set(v.name, {
      name: v.name,
      collection: coll?.name ?? '?',
      type: v.resolvedType,
      css,
      value: await resolve(v, coll?.defaultModeId),
      modes: Object.keys(modes).length ? modes : undefined,
    });
  }

  private async styleName(id: string | typeof figma.mixed | undefined, type: string): Promise<string | undefined> {
    if (!id || id === figma.mixed) return undefined;
    const s = await figma.getStyleByIdAsync(id);
    if (!s) return undefined;
    this.styles.set(s.name, { type, name: s.name });
    return s.name;
  }

  private async paints(list: ReadonlyArray<Paint> | typeof figma.mixed): Promise<XPaint[] | undefined> {
    if (list === figma.mixed) return undefined;
    const out: XPaint[] = [];
    for (const p of list) {
      if (p.visible === false) continue;
      if (p.type === 'SOLID') {
        const v = await this.varName(p.boundVariables?.color);
        out.push({ t: 'solid', c: toHex(p.color, p.opacity ?? 1), ...(v ? { v } : {}) });
      } else if (p.type === 'GRADIENT_LINEAR' || p.type === 'GRADIENT_RADIAL' || p.type === 'GRADIENT_ANGULAR' || p.type === 'GRADIENT_DIAMOND') {
        const stops = [];
        for (const s of p.gradientStops) {
          const v = await this.varName(s.boundVariables?.color);
          stops.push({ c: toHex(s.color, s.color.a * (p.opacity ?? 1)), p: round(s.position, 3), ...(v ? { v } : {}) });
        }
        const kind = p.type.replace('GRADIENT_', '').toLowerCase() as 'linear' | 'radial' | 'angular' | 'diamond';
        out.push({ t: 'gradient', kind, ...(kind === 'linear' ? { angle: angleOf(p.gradientTransform) } : {}), stops });
      } else if (p.type === 'IMAGE' && p.imageHash) {
        out.push({ t: 'image', ref: p.imageHash, fit: p.scaleMode.toLowerCase() });
      }
    }
    return out.length ? out : undefined;
  }

  private async effects(list: ReadonlyArray<Effect>): Promise<XEffect[] | undefined> {
    const out: XEffect[] = [];
    for (const e of list) {
      if (!e.visible) continue;
      if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
        const v = await this.varName(e.boundVariables?.color);
        out.push({ t: e.type === 'DROP_SHADOW' ? 'shadow' : 'inner', x: e.offset.x, y: e.offset.y, blur: e.radius, spread: e.spread ?? 0, c: toHex(e.color, e.color.a), ...(v ? { v } : {}) });
      } else if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
        out.push({ t: e.type === 'LAYER_BLUR' ? 'blur' : 'bg-blur', r: e.radius });
      }
    }
    return out.length ? out : undefined;
  }

  private assetByKey = new Map<string, string>();

  /** One asset per image (same IMG id or same image hash), however many layers show it. */
  private sharedAsset(n: SceneNode, key: string, make: () => string): string {
    if (!key) return make();
    const known = this.assetByKey.get(key);
    if (known) return known;
    const id = make();
    this.assetByKey.set(key, id);
    return id;
  }

  private addAsset(n: SceneNode, kind: 'svg' | 'image', baseName: string, imageHash?: string, pending?: { imageId?: string; prompt?: string }): string {
    let name = kebab(baseName.replace(/^icon\//, 'icon-')) || kind;
    let i = 2;
    const base = name;
    while (this.assetNames.has(name)) name = `${base}-${i++}`;
    this.assetNames.add(name);
    this.assets.push({ id: name, nodeId: n.id, name, kind, w: round(n.width, 1), h: round(n.height, 1), imageHash, ...(pending ? { pending } : {}) });
    return name;
  }

  private async mainOf(inst: InstanceNode): Promise<ComponentNode | null> {
    if (this.mainCache.has(inst.id)) return this.mainCache.get(inst.id)!;
    const m = await inst.getMainComponentAsync();
    this.mainCache.set(inst.id, m);
    return m;
  }

  async node(n: SceneNode, depth: number, parentAL: boolean): Promise<XNode | null> {
    if (!n.visible && !this.p.includeHidden) return null;
    this.count++;
    const x: XNode = {
      id: n.id,
      name: n.name,
      type: n.type.toLowerCase().replace('rectangle', 'rect').replace('boolean_operation', 'boolean'),
      x: round(n.x, 1),
      y: round(n.y, 1),
      w: round(n.width, 1),
      h: round(n.height, 1),
    };
    if (!n.visible) x.hidden = true;
    const vars: Record<string, string> = {};
    const bv = (n as SceneNode & { boundVariables?: Record<string, VariableAlias | VariableAlias[]> }).boundVariables ?? {};
    for (const [field, alias] of Object.entries(bv)) {
      if (['fills', 'strokes', 'effects', 'componentProperties', 'textRangeFills', 'layoutGrids'].includes(field)) continue;
      const name = await this.varName(alias as VariableAlias);
      if (name) vars[field] = name;
    }

    // Layout of this node (container)
    if ('layoutMode' in n && (n as FrameNode).layoutMode !== 'NONE') {
      const f = n as FrameNode;
      const dir = f.layoutMode === 'HORIZONTAL' ? 'row' : f.layoutMode === 'VERTICAL' ? 'column' : 'grid';
      const between = f.layoutMode !== 'GRID' && f.primaryAxisAlignItems === 'SPACE_BETWEEN';
      x.layout = {
        dir,
        ...(dir === 'grid' ? { rowGap: f.gridRowGap, colGap: f.gridColumnGap, cols: f.gridColumnCount, rows: f.gridRowCount } : between ? { between: true as const } : { gap: f.itemSpacing }),
        pad: [f.paddingTop, f.paddingRight, f.paddingBottom, f.paddingLeft],
        ...(dir !== 'grid'
          ? {
              justify: ({ MIN: 'start', CENTER: 'center', MAX: 'end', SPACE_BETWEEN: 'between', SPACE_AROUND: 'around', SPACE_EVENLY: 'evenly' } as const)[f.primaryAxisAlignItems],
              align: ({ MIN: 'start', CENTER: 'center', MAX: 'end', BASELINE: 'baseline' } as const)[f.counterAxisAlignItems],
            }
          : {}),
        ...(f.layoutWrap === 'WRAP' ? { wrap: true as const, rowGap: f.counterAxisSpacing ?? undefined } : {}),
      };
    }
    // Sizing as a child (or as an auto-layout frame)
    const isAL = !!x.layout;
    if (parentAL || isAL) {
      const c = n as FrameNode;
      x.sizing = { w: c.layoutSizingHorizontal.toLowerCase() as 'fixed', h: c.layoutSizingVertical.toLowerCase() as 'fixed' };
      if (parentAL && c.layoutPositioning === 'ABSOLUTE') x.abs = true;
    }
    if ((!parentAL || x.abs) && 'constraints' in n) {
      const c = (n as ConstraintMixin).constraints;
      x.constraints = { h: c.horizontal.toLowerCase(), v: c.vertical.toLowerCase() };
    }
    if ('minWidth' in n) {
      const m = n as FrameNode;
      if (m.minWidth != null || m.minHeight != null) x.min = { ...(m.minWidth != null ? { w: m.minWidth } : {}), ...(m.minHeight != null ? { h: m.minHeight } : {}) };
      if (m.maxWidth != null || m.maxHeight != null) x.max = { ...(m.maxWidth != null ? { w: m.maxWidth } : {}), ...(m.maxHeight != null ? { h: m.maxHeight } : {}) };
    }
    if (n.parent && 'layoutMode' in n.parent && (n.parent as FrameNode).layoutMode === 'GRID') {
      const g = n as FrameNode;
      try {
        x.cell = { row: g.gridRowAnchorIndex, col: g.gridColumnAnchorIndex, rowSpan: g.gridRowSpan, colSpan: g.gridColumnSpan };
      } catch {
        /* older API */
      }
    }

    // Appearance
    const styles: XNode['styles'] = {};
    if ('fills' in n && n.type !== 'TEXT') {
      const fs = await this.styleName((n as MinimalFillsMixin).fillStyleId as string, 'paint');
      if (fs) styles.fill = fs;
      const fills = await this.paints((n as MinimalFillsMixin).fills);
      if (fills) x.fills = fills;
    }
    if ('strokes' in n && (n as MinimalStrokesMixin).strokes.length) {
      const s = n as MinimalStrokesMixin & SceneNode;
      const st = await this.styleName(s.strokeStyleId, 'paint');
      if (st) styles.stroke = st;
      const strokes = await this.paints(s.strokes);
      if (strokes) {
        x.strokes = strokes;
        const sw = s.strokeWeight;
        if (sw === figma.mixed && 'strokeTopWeight' in n) {
          const i = n as IndividualStrokesMixin;
          x.strokeW = [i.strokeTopWeight, i.strokeRightWeight, i.strokeBottomWeight, i.strokeLeftWeight];
        } else if (typeof sw === 'number') x.strokeW = sw;
        x.strokeAlign = s.strokeAlign.toLowerCase();
        if (s.dashPattern.length) x.dash = [...s.dashPattern];
      }
    }
    if ('cornerRadius' in n) {
      const r = (n as CornerMixin).cornerRadius;
      if (r === figma.mixed && 'topLeftRadius' in n) {
        const c = n as RectangleCornerMixin;
        x.radius = [c.topLeftRadius, c.topRightRadius, c.bottomRightRadius, c.bottomLeftRadius];
      } else if (typeof r === 'number' && r > 0) x.radius = r;
    }
    if ('effects' in n && (n as BlendMixin).effects.length) {
      const es = await this.styleName((n as BlendMixin).effectStyleId, 'effect');
      if (es) styles.effect = es;
      const e = await this.effects((n as BlendMixin).effects);
      if (e) x.effects = e;
    }
    if ('opacity' in n && n.opacity < 1) x.opacity = round(n.opacity, 3);
    if ('blendMode' in n && !['NORMAL', 'PASS_THROUGH'].includes((n as BlendMixin).blendMode)) x.blend = (n as BlendMixin).blendMode.toLowerCase().replace(/_/g, '-');
    if ('clipsContent' in n && (n as FrameNode).clipsContent && 'children' in n && (n as FrameNode).children.length) x.clip = true;
    if ('rotation' in n && Math.abs(n.rotation) > 0.01) x.rotation = round(n.rotation, 2);

    // Text
    if (n.type === 'TEXT') {
      const ts = await this.styleName(n.textStyleId as string, 'text');
      if (ts) styles.text = ts;
      const fsn = await this.styleName(n.fillStyleId as string, 'paint');
      if (fsn) styles.fill = fsn;
      const segs = n.getStyledTextSegments(['fontName', 'fontSize', 'fontWeight', 'textDecoration', 'textCase', 'lineHeight', 'letterSpacing', 'fills', 'hyperlink']);
      const base = segs[0];
      const font = (s: typeof base): XFont => ({
        family: s.fontName.family,
        style: s.fontName.style,
        weight: s.fontWeight,
        ...(/italic|oblique/i.test(s.fontName.style) ? { italic: true } : {}),
        size: s.fontSize,
        lh: fmtLh(s.lineHeight),
        ls: fmtLs(s.letterSpacing),
        ...(s.textCase !== 'ORIGINAL' ? { case: s.textCase.toLowerCase() } : {}),
        ...(s.textDecoration !== 'NONE' ? { deco: s.textDecoration.toLowerCase() } : {}),
      });
      for (const s of segs) this.fonts.add(`${s.fontName.family} ${s.fontName.style}`);
      x.text = {
        chars: n.characters,
        font: font(base),
        align: n.textAlignHorizontal.toLowerCase(),
        valign: n.textAlignVertical.toLowerCase(),
        autoResize: n.textAutoResize.toLowerCase(),
        ...(n.textTruncation === 'ENDING' ? { maxLines: n.maxLines ?? 1 } : {}),
      };
      x.fills = await this.paints(base.fills);
      if (segs.length > 1) {
        const b = font(base);
        x.text.segs = [];
        for (const s of segs) {
          const f = font(s);
          const diff: Partial<XFont> = {};
          for (const k of Object.keys(f) as Array<keyof XFont>) if (JSON.stringify(f[k]) !== JSON.stringify(b[k])) (diff as Record<string, unknown>)[k] = f[k];
          const fills = await this.paints(s.fills);
          x.text.segs.push({
            chars: s.characters,
            ...(Object.keys(diff).length ? { font: diff } : {}),
            ...(JSON.stringify(fills) !== JSON.stringify(x.fills) ? { fills } : {}),
            ...(s.hyperlink && s.hyperlink.type === 'URL' ? { link: s.hyperlink.value } : {}),
          });
        }
      } else if (base.hyperlink && base.hyperlink.type === 'URL') x.text.link = base.hyperlink.value;
    }
    if (Object.keys(styles).length) x.styles = styles;
    if (Object.keys(vars).length) x.vars = vars;

    // Components
    let descend = 'children' in n;
    if (n.type === 'INSTANCE') {
      const main = await this.mainOf(n);
      const owner = main?.parent?.type === 'COMPONENT_SET' ? main.parent : main;
      if (owner) {
        const props: Record<string, string | boolean> = {};
        for (const [k, v] of Object.entries(n.componentProperties)) if (v.type !== 'VARIANT') props[k.split('#')[0]] = v.value as string | boolean;
        x.comp = { kind: 'instance', name: owner.name, ...(main?.variantProperties ? { variant: main.variantProperties } : {}), ...(Object.keys(props).length ? { props } : {}) };
        if (!this.components.has(owner.name)) {
          let defs: Record<string, unknown> | undefined;
          try {
            const d = (owner as ComponentSetNode).componentPropertyDefinitions;
            defs = Object.fromEntries(Object.entries(d).map(([k, def]) => [k.split('#')[0], def.type === 'VARIANT' ? { type: 'variant', options: def.variantOptions } : { type: def.type.toLowerCase(), default: def.defaultValue }]));
          } catch {
            defs = undefined;
          }
          this.components.set(owner.name, { name: owner.name, key: owner.key, description: owner.description || undefined, props: defs, remote: owner.remote || undefined });
        }
      }
      if (this.p.instances === 'reference' && !isVectorAsset(n)) descend = false;
    } else if (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') {
      x.comp = { kind: n.type === 'COMPONENT' ? 'component' : 'set', name: n.name, key: n.key };
    }

    // Assets
    const waiting = neededPrompt(n);
    const imageId = n.type === 'FRAME' || n.type === 'RECTANGLE' ? n.getPluginData('imageId') : '';
    if (waiting !== null) {
      // Not generated yet: code points at the file it will be exported as once the user's image is placed.
      const box = isPlaceholderBox(n);
      x.asset = { kind: 'image', id: this.sharedAsset(n, imageId, () => this.addAsset(n, 'image', imageId ? `${imageId}-${n.name}` : n.name, undefined, { imageId: imageId || undefined, prompt: waiting || undefined })) };
      if (!box) x.fills = [{ t: 'image', ref: '', fit: 'fill' }, ...(x.fills ?? [])];
      if (box) descend = false; // the caption is not content
    } else if (n.type !== 'TEXT' && isVectorAsset(n)) {
      const base = x.comp?.name ?? n.name;
      x.asset = { kind: 'svg', id: this.addAsset(n, 'svg', base) };
      descend = false;
    } else if (x.fills?.some((f) => f.t === 'image')) {
      const img = x.fills.find((f) => f.t === 'image') as { t: 'image'; ref: string };
      // Images placed from IMAGE_PROMPTS.md keep their IMG id in the file name; one image → one file.
      x.asset = { kind: 'image', id: this.sharedAsset(n, imageId || `hash:${img.ref}`, () => this.addAsset(n, 'image', imageId ? `${imageId}-${n.name}` : n.name, img.ref)) };
    }

    // Interactions
    if ('reactions' in n && (n as ReactionMixin).reactions.length) {
      const rs: NonNullable<XNode['reactions']> = [];
      for (const r of (n as ReactionMixin).reactions) {
        const t = r.trigger?.type ?? 'NONE';
        for (const a of r.actions ?? []) {
          if (a.type === 'NODE') {
            const dest = a.destinationId ? await figma.getNodeByIdAsync(a.destinationId) : null;
            rs.push({ trigger: t.toLowerCase(), action: a.navigation.toLowerCase(), to: a.destinationId ?? undefined, toName: dest?.name, transition: describeTransition(a.transition) });
          } else if (a.type === 'URL') rs.push({ trigger: t.toLowerCase(), action: 'url', url: a.url });
          else rs.push({ trigger: t.toLowerCase(), action: a.type.toLowerCase() });
        }
      }
      if (rs.length) x.reactions = rs;
    }

    // Children
    if (descend && 'children' in n) {
      const kids = (n as ChildrenMixin).children;
      const max = this.p.maxNodes ?? 1500;
      if (depth >= (this.p.depth ?? 25) || this.count >= max) {
        if (kids.length) {
          x.more = kids.length;
          this.truncated = true;
        }
      } else {
        const out: XNode[] = [];
        for (const c of kids) {
          if (this.count >= max) {
            x.more = kids.length - out.length;
            this.truncated = true;
            break;
          }
          const xc = await this.node(c, depth + 1, isAL);
          if (xc) out.push(xc);
        }
        if (out.length) x.children = out;
      }
    }
    return x;
  }
}

export async function extract(p: ExtractParams) {
  const ctx = new Ctx();
  let target: SceneNode;
  if (p.nodeId) target = await ctx.sceneNode(p.nodeId);
  else if (figma.currentPage.selection.length === 1) target = figma.currentPage.selection[0];
  else if (figma.currentPage.selection.length > 1) throw new Error('Several layers are selected; pass nodeId or select one.');
  else throw new Error('Pass nodeId (or select one layer in Figma).');
  const ex = new Extractor(p);
  const parentAL = !!target.parent && 'layoutMode' in target.parent && (target.parent as FrameNode).layoutMode !== 'NONE';
  const root = await ex.node(target, 0, parentAL);
  const screen = screenOf(target);
  const page = pageOf(target);
  return {
    root,
    context: {
      page: page?.name,
      screen: screen && screen !== target ? { id: screen.id, name: screen.name, w: round(screen.width), h: round(screen.height) } : undefined,
      topLevel: target.parent?.type === 'PAGE' || target.parent?.type === 'SECTION',
      parentLayout: parentAL,
      file: figma.root.name,
    },
    vars: Object.fromEntries(ex.vars),
    styles: Object.fromEntries(ex.styles),
    components: Object.fromEntries(ex.components),
    assets: ex.assets,
    fonts: [...ex.fonts],
    stats: { nodes: ex.count, truncated: ex.truncated },
  };
}
