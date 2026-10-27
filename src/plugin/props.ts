// Applies a (partial) spec to an existing Figma node. Used by build (new nodes) and edit (existing).
// Order matters in Figma: layout mode → size → layout sizing → position → appearance → text.

import type { Num, Spec } from '../shared/spec.ts';
import { didYouMean } from '../shared/util.ts';
import type { Ctx } from './ctx.ts';
import { badRequest, notFound } from './errors.ts';
import { applyEffects, applyFills, applyStroke, bindNumber, numberOf, recolorVectors, toPaints } from './paint.ts';
import { setImagePrompt } from './pages.ts';
import { applyText, applyTruncation, type Inherit } from './text.ts';

export interface ApplyOptions {
  isNew: boolean;
  /** Parent spec asked children to stretch on the cross axis (align: "stretch"). */
  crossFill?: boolean;
}

const isVar = (v: unknown): v is string => typeof v === 'string' && v.startsWith('$');

export function isAutoLayout(n: BaseNode | null): n is FrameNode | ComponentNode | InstanceNode | ComponentSetNode {
  return !!n && 'layoutMode' in n && (n as FrameNode).layoutMode !== 'NONE';
}

export function parentLayoutDir(node: SceneNode): 'row' | 'column' | 'grid' | 'none' {
  const p = node.parent;
  if (!p || !('layoutMode' in p)) return 'none';
  const m = (p as FrameNode).layoutMode;
  return m === 'HORIZONTAL' ? 'row' : m === 'VERTICAL' ? 'column' : m === 'GRID' ? 'grid' : 'none';
}

const ALIGN = { start: 'MIN', center: 'CENTER', end: 'MAX', baseline: 'BASELINE', stretch: 'MIN' } as const;
const JUSTIFY = { start: 'MIN', center: 'CENTER', end: 'MAX', between: 'SPACE_BETWEEN', around: 'SPACE_AROUND', evenly: 'SPACE_EVENLY' } as const;
const flip = { MIN: 'MAX', MAX: 'MIN', CENTER: 'CENTER', BASELINE: 'BASELINE', SPACE_BETWEEN: 'SPACE_BETWEEN', SPACE_AROUND: 'SPACE_AROUND', SPACE_EVENLY: 'SPACE_EVENLY' } as const;

async function setNum(node: SceneNode, field: VariableBindableNodeField, v: Num, ctx: Ctx, path: string) {
  const n = await bindNumber(node, field, v, ctx, path);
  if (!isVar(v) && n !== undefined) (node as unknown as Record<string, number>)[field] = n;
}

// ───────────── layout container ─────────────

async function applyLayout(node: SceneNode, s: Partial<Spec>, ctx: Ctx, path: string, rtl: boolean) {
  const hasLayoutProps =
    s.dir !== undefined || s.gap !== undefined || s.pad !== undefined || s.align !== undefined || s.justify !== undefined ||
    s.wrap !== undefined || s.rowGap !== undefined || s.colGap !== undefined || s.cols !== undefined || s.rows !== undefined || s.alignContent !== undefined;
  if (!hasLayoutProps) return;
  if (!('layoutMode' in node)) {
    ctx.warn(`${path}: ${node.type.toLowerCase()} cannot have auto layout (only frames/components); layout props ignored.`);
    return;
  }
  const f = node as FrameNode;
  if (s.dir !== undefined) {
    if (s.dir === 'grid') {
      try {
        f.layoutMode = 'GRID';
      } catch (e) {
        ctx.warn(`${path}: grid auto layout is not available in this Figma version; using a wrapping row instead.`);
        f.layoutMode = 'HORIZONTAL';
        f.layoutWrap = 'WRAP';
      }
    } else f.layoutMode = s.dir === 'row' ? 'HORIZONTAL' : s.dir === 'column' ? 'VERTICAL' : 'NONE';
  }
  const mode = f.layoutMode;
  if (mode === 'NONE') {
    if (s.gap !== undefined || s.align !== undefined || s.justify !== undefined) ctx.warn(`${path}: gap/align/justify need dir row|column|grid.`);
  }
  if (mode === 'GRID') {
    if (s.cols !== undefined) f.gridColumnCount = Math.max(1, Math.round(s.cols));
    try {
      if (s.rows === undefined) {
        f.gridAutoTracks = 'ROWS';
        f.gridItemsPositioning = 'ROW_AUTO_FLOW';
      } else {
        f.gridAutoTracks = 'NONE';
        f.gridRowCount = Math.max(1, Math.round(s.rows));
      }
    } catch {
      if (s.rows !== undefined) f.gridRowCount = Math.max(1, Math.round(s.rows));
    }
    const colGap = s.colGap ?? (s.gap !== undefined && s.gap !== 'auto' ? s.gap : undefined);
    const rowGap = s.rowGap ?? (s.gap !== undefined && s.gap !== 'auto' ? s.gap : undefined);
    if (colGap !== undefined) await setNum(f, 'gridColumnGap', colGap, ctx, `${path}.gap`);
    if (rowGap !== undefined) await setNum(f, 'gridRowGap', rowGap, ctx, `${path}.rowGap`);
  } else {
    if (s.wrap !== undefined) {
      if (s.wrap && mode !== 'HORIZONTAL') ctx.warn(`${path}: wrap only works with dir "row".`);
      else f.layoutWrap = s.wrap ? 'WRAP' : 'NO_WRAP';
    }
    if (s.gap !== undefined) await setNum(f, 'itemSpacing', s.gap, ctx, `${path}.gap`);
    if (s.rowGap !== undefined) await setNum(f, 'counterAxisSpacing', s.rowGap, ctx, `${path}.rowGap`);
    if (s.alignContent !== undefined) f.counterAxisAlignContent = s.alignContent === 'between' ? 'SPACE_BETWEEN' : 'AUTO';
  }
  if (s.pad) {
    const fields = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const;
    for (let i = 0; i < 4; i++) await setNum(f, fields[i], s.pad[i], ctx, `${path}.pad[${i}]`);
  }
  if (mode === 'HORIZONTAL' || mode === 'VERTICAL') {
    if (s.justify !== undefined) {
      let v: FrameNode['primaryAxisAlignItems'] = JUSTIFY[s.justify];
      if (rtl && mode === 'HORIZONTAL') v = flip[v];
      try {
        f.primaryAxisAlignItems = v;
      } catch {
        ctx.warn(`${path}.justify: "${s.justify}" is not supported by this Figma version; using "between".`);
        f.primaryAxisAlignItems = 'SPACE_BETWEEN';
      }
    }
    if (s.align !== undefined) {
      let v: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE' = ALIGN[s.align];
      if (v === 'BASELINE' && mode !== 'HORIZONTAL') {
        ctx.warn(`${path}: baseline alignment needs dir "row"; using start.`);
        v = 'MIN';
      }
      if (rtl && mode === 'VERTICAL') v = flip[v];
      f.counterAxisAlignItems = v;
    } else if (rtl && mode === 'VERTICAL' && s.dir !== undefined) {
      f.counterAxisAlignItems = 'MAX';
    }
    // RTL rows start on the right unless told otherwise.
    if (rtl && mode === 'HORIZONTAL' && s.justify === undefined && s.dir !== undefined) f.primaryAxisAlignItems = 'MAX';
  }
}

// ───────────── sizing ─────────────

type Axis = 'h' | 'v';

function canHug(node: SceneNode): boolean {
  return isAutoLayout(node) || (node.type === 'TEXT' && isAutoLayout(node.parent));
}

async function applySizing(node: SceneNode, s: Partial<Spec>, ctx: Ctx, path: string, o: ApplyOptions) {
  const inAL = isAutoLayout(node.parent) && (node as FrameNode).layoutPositioning !== 'ABSOLUTE';
  const parentDir = parentLayoutDir(node);
  let w = s.w;
  let h = s.h;
  // Defaults for new nodes: auto-layout containers hug; stretch parents make children fill the cross axis.
  if (o.isNew && o.crossFill && inAL) {
    if (parentDir === 'column' && w === undefined) w = 'fill';
    if (parentDir === 'row' && h === undefined) h = 'fill';
  }
  if (o.isNew && isAutoLayout(node) && node.getPluginData('role') !== 'image-placeholder') {
    // (an image placeholder keeps its fixed box: hugging its caption would lose the image's size)
    if (w === undefined) w = 'hug';
    if (h === undefined) h = 'hug';
  }

  const fixedW = w !== undefined && w !== 'fill' && w !== 'hug' ? await numberOf(w, ctx) : undefined;
  const fixedH = h !== undefined && h !== 'fill' && h !== 'hug' ? await numberOf(h, ctx) : undefined;
  if (fixedW || fixedH) {
    const nw = fixedW ? fixedW.n : node.width;
    let nh = fixedH ? fixedH.n : node.height;
    if (node.type === 'LINE') nh = 0;
    if (node.type === 'SECTION' || node.type === 'COMPONENT_SET') (node as SectionNode).resizeWithoutConstraints(Math.max(nw, 0.01), Math.max(nh, 0.01));
    else if ('resize' in node) (node as FrameNode).resize(Math.max(nw, 0.01), node.type === 'LINE' ? 0 : Math.max(nh, 0.01));
    if (fixedW?.variable) node.setBoundVariable('width', fixedW.variable);
    if (fixedH?.variable) node.setBoundVariable('height', fixedH.variable);
  }

  const setAxis = (axis: Axis, value: Spec['w']) => {
    if (value === undefined) return;
    const prop = axis === 'h' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';
    const label = axis === 'h' ? 'w' : 'h';
    if (value === 'fill') {
      if (!inAL) {
        ctx.warn(`${path}.${label}: "fill" needs an auto-layout parent (dir row/column/grid); kept current size.`);
        return;
      }
      (node as FrameNode)[prop] = 'FILL';
    } else if (value === 'hug') {
      if (!canHug(node)) {
        if (node.type !== 'TEXT') ctx.warn(`${path}.${label}: "hug" works on auto-layout frames and text; give a number instead.`);
        return;
      }
      (node as FrameNode)[prop] = 'HUG';
    } else if (inAL || isAutoLayout(node)) {
      (node as FrameNode)[prop] = 'FIXED';
    }
  };
  if (node.type !== 'TEXT') {
    setAxis('h', w);
    setAxis('v', h);
  } else {
    // Text: auto-resize mode follows the requested sizing.
    const t = node as TextNode;
    // A zero-width text would stay zero-wide once auto-resize leaves WIDTH_AND_HEIGHT.
    if ((w === 'fill' || fixedW) && t.width < 1) t.resize(100, Math.max(1, t.height));
    if (w === 'fill') {
      t.textAutoResize = fixedH ? 'NONE' : 'HEIGHT';
      if (inAL) t.layoutSizingHorizontal = 'FILL';
      else if (node.parent && 'width' in node.parent) {
        const pw = (node.parent as FrameNode).width;
        t.resize(Math.max(1, pw - t.x), t.height);
        ctx.warn(`${path}.w: "fill" needs an auto-layout parent; sized to the parent width instead.`);
      }
    } else if (fixedW) {
      if (!fixedH) t.textAutoResize = 'HEIGHT';
      if (inAL) t.layoutSizingHorizontal = 'FIXED';
    } else if (w === 'hug') {
      if (!fixedH && h !== 'fill') t.textAutoResize = 'WIDTH_AND_HEIGHT';
      if (inAL) t.layoutSizingHorizontal = 'HUG';
    }
    if (h === 'fill') {
      if (inAL) {
        t.textAutoResize = 'NONE';
        t.layoutSizingVertical = 'FILL';
      } else ctx.warn(`${path}.h: "fill" needs an auto-layout parent.`);
    } else if (fixedH) {
      t.textAutoResize = 'NONE';
      if (inAL) t.layoutSizingVertical = 'FIXED';
    }
    if (t.width < 1 && t.characters.length > 0) ctx.warn(`${path}: text collapsed to ~0 width — its parent probably hugs; give the parent a width.`);
  }

  const mm: Array<[keyof Spec, 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight']> = [
    ['minW', 'minWidth'], ['maxW', 'maxWidth'], ['minH', 'minHeight'], ['maxH', 'maxHeight'],
  ];
  for (const [k, field] of mm) {
    const v = s[k] as Num | undefined;
    if (v === undefined) continue;
    if (!(inAL || isAutoLayout(node))) {
      ctx.warn(`${path}.${k}: min/max size only works on auto-layout frames or their children.`);
      continue;
    }
    await setNum(node, field, v, ctx, `${path}.${k}`);
  }
}

// ───────────── position ─────────────

const CH = { left: 'MIN', right: 'MAX', center: 'CENTER', stretch: 'STRETCH', scale: 'SCALE' } as const;
const CV = { top: 'MIN', bottom: 'MAX', center: 'CENTER', stretch: 'STRETCH', scale: 'SCALE' } as const;

function applyPosition(node: SceneNode, s: Partial<Spec>, ctx: Ctx, path: string) {
  const parentAL = isAutoLayout(node.parent);
  if (s.absolute !== undefined) {
    if (parentAL) (node as FrameNode).layoutPositioning = s.absolute ? 'ABSOLUTE' : 'AUTO';
    else if (s.absolute) {
      /* already free-positioned */
    }
  }
  const free = !parentAL || (node as FrameNode).layoutPositioning === 'ABSOLUTE';
  if (s.x !== undefined || s.y !== undefined) {
    if (!free) ctx.warn(`${path}: x/y are ignored inside auto layout unless "absolute": true.`);
    else {
      if (s.x !== undefined) node.x = s.x;
      if (s.y !== undefined) node.y = s.y;
    }
  }
  if (s.constraints && 'constraints' in node) {
    const cur = (node as ConstraintMixin).constraints;
    (node as ConstraintMixin).constraints = {
      horizontal: s.constraints.h ? CH[s.constraints.h] : cur.horizontal,
      vertical: s.constraints.v ? CV[s.constraints.v] : cur.vertical,
    };
  }
  if ((s.cell || s.span) && node.parent && (node.parent as FrameNode).layoutMode === 'GRID') {
    const g = node as FrameNode;
    try {
      if (s.span) {
        g.gridRowSpan = s.span[0];
        g.gridColumnSpan = s.span[1];
      }
      if (s.cell) g.setGridChildPosition(s.cell[0], s.cell[1]);
    } catch (e) {
      ctx.warn(`${path}: grid cell/span not applied (${e instanceof Error ? e.message : e}). With automatic flow, order children instead.`);
    }
  }
}

// ───────────── instances ─────────────

/** Finds a descendant by layer name or "Parent/Child" path (breadth-first). */
export function findByPath(root: SceneNode, path: string): SceneNode | null {
  const parts = path.split('/').map((p) => p.trim()).filter(Boolean);
  let current: SceneNode[] = [root];
  for (const part of parts) {
    let found: SceneNode | null = null;
    const queue: SceneNode[] = [];
    for (const c of current) if ('children' in c) queue.push(...c.children);
    while (queue.length && !found) {
      const n = queue.shift()!;
      if (n.name === part || n.name.toLowerCase() === part.toLowerCase()) found = n;
      else if ('children' in n) queue.push(...n.children);
    }
    if (!found) return null;
    current = [found];
  }
  return current[0] ?? null;
}

function propKey(defs: ComponentProperties, name: string): string | undefined {
  if (name in defs) return name;
  const lower = name.toLowerCase();
  return Object.keys(defs).find((k) => k.split('#')[0].toLowerCase() === lower);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Instance properties, waiting briefly when the main component defines a property the instance
 * does not list yet (Figma can lag right after properties were added to a component set).
 */
async function instanceProps(inst: InstanceNode, wanted: string[]): Promise<ComponentProperties> {
  let defs = inst.componentProperties;
  const missing = () => wanted.filter((w) => !propKey(defs, w));
  if (!missing().length) return defs;
  const main = await inst.getMainComponentAsync();
  const owner = main?.parent?.type === 'COMPONENT_SET' ? main.parent : main;
  let ownerNames: string[] = [];
  try {
    ownerNames = owner ? Object.keys(owner.componentPropertyDefinitions).map((k) => k.split('#')[0].toLowerCase()) : [];
  } catch {
    ownerNames = [];
  }
  if (!missing().some((m) => ownerNames.includes(m.toLowerCase()))) return defs;
  for (let i = 0; i < 8 && missing().length; i++) {
    await sleep(80);
    if (i === 3 && main) inst.swapComponent(main); // nudges Figma to refresh the instance
    defs = inst.componentProperties;
  }
  return defs;
}

export async function applyInstanceProps(inst: InstanceNode, s: Partial<Spec>, ctx: Ctx, path: string) {
  const defs = await instanceProps(inst, [...Object.keys(s.variant ?? {}), ...Object.keys(s.props ?? {})]);
  const updates: Record<string, string | boolean> = {};
  if (s.variant) {
    for (const [k, v] of Object.entries(s.variant)) {
      const key = propKey(defs, k);
      if (!key || defs[key].type !== 'VARIANT') {
        const names = Object.entries(defs).filter(([, d]) => d.type === 'VARIANT').map(([n]) => n);
        throw badRequest(`${path}.variant: "${k}" is not a variant property of this component.${didYouMean(k, names)} Variant properties: ${names.join(', ') || 'none'}.`);
      }
      updates[key] = v;
    }
  }
  if (s.props) {
    for (const [k, v] of Object.entries(s.props)) {
      const key = propKey(defs, k);
      if (!key) {
        const names = Object.keys(defs).map((n) => n.split('#')[0]);
        throw badRequest(`${path}.props: no property "${k}" on this instance.${didYouMean(k, names)} Properties: ${names.join(', ') || 'none'}.`);
      }
      const type = defs[key].type;
      if (type === 'BOOLEAN') updates[key] = v === true || v === 'true';
      else if (type === 'INSTANCE_SWAP') {
        const c = await ctx.component(String(v));
        updates[key] = c.type === 'COMPONENT_SET' ? (c.defaultVariant ?? (c.children[0] as ComponentNode)).id : c.id;
      } else updates[key] = String(v);
    }
  }
  if (Object.keys(updates).length) {
    // Fonts of the instance's text must be loaded before TEXT property changes.
    await ctx.loadFontsIn(inst);
    try {
      inst.setProperties(updates);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw badRequest(`${path}: could not set instance properties ${JSON.stringify(updates)}: ${msg}`);
    }
  }
}

/** True for icon-like subtrees: only vector shapes, no text, no instances with text. */
export function isVectorOnly(node: SceneNode): boolean {
  if (node.type === 'TEXT') return false;
  if (!('children' in node)) return ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'ELLIPSE', 'RECTANGLE', 'LINE'].includes(node.type);
  if (!node.children.length) return false;
  return node.children.every((c) => isVectorOnly(c));
}

// ───────────── main entry ─────────────

const BLEND: Record<string, BlendMode> = {
  normal: 'NORMAL', multiply: 'MULTIPLY', screen: 'SCREEN', overlay: 'OVERLAY', darken: 'DARKEN', lighten: 'LIGHTEN',
  'color-dodge': 'COLOR_DODGE', 'color-burn': 'COLOR_BURN', 'hard-light': 'HARD_LIGHT', 'soft-light': 'SOFT_LIGHT',
  difference: 'DIFFERENCE', exclusion: 'EXCLUSION', hue: 'HUE', saturation: 'SATURATION', color: 'COLOR', luminosity: 'LUMINOSITY',
  'pass-through': 'PASS_THROUGH',
};

export async function applyProps(node: SceneNode, s: Partial<Spec>, inh: Inherit, ctx: Ctx, path: string, o: ApplyOptions): Promise<void> {
  const rtl = !!(s.rtl ?? inh.rtl);
  if (s.name !== undefined) node.name = s.name;
  if (s.visible !== undefined) node.visible = s.visible;
  if (s.locked !== undefined) node.locked = s.locked;
  if (s.description !== undefined) {
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') node.description = s.description;
    else ctx.warn(`${path}.description: only components and component sets have descriptions.`);
  }
  if (s.opacity !== undefined && 'opacity' in node) await setNum(node, 'opacity', s.opacity, ctx, `${path}.opacity`);
  if (s.blend !== undefined && 'blendMode' in node) {
    const b = BLEND[s.blend.toLowerCase()];
    if (!b) throw badRequest(`${path}.blend: unknown blend mode "${s.blend}".${didYouMean(s.blend, Object.keys(BLEND))}`);
    (node as BlendMixin).blendMode = b;
  }

  await applyLayout(node, s, ctx, path, rtl);
  if (s.clip !== undefined) {
    if ('clipsContent' in node) (node as FrameNode).clipsContent = s.clip;
    else ctx.warn(`${path}.clip: only frames can clip content.`);
  }

  if (node.type === 'TEXT') {
    await ctx.loadFontsIn(node);
    // Note: auto-resize is set after the characters (see applySizing). Setting HEIGHT on a fresh,
    // empty text node freezes its width at 0 and FILL can no longer widen it.
    const textSpec: Partial<Spec> = { ...s };
    if (s.align !== undefined && s.textAlign === undefined)
      textSpec.textAlign = ({ start: 'start', center: 'center', end: 'end', baseline: 'start', stretch: 'justify' } as const)[s.align];
    if (s.fill !== undefined && s.color === undefined) textSpec.color = s.fill ?? [];
    await applyText(node, textSpec, inh, ctx, path, o.isNew);
  }

  applyPosition(node, s, ctx, path);
  await applySizing(node, s, ctx, path, o);
  if (node.type === 'TEXT') applyTruncation(node, s);
  if (s.device !== undefined) node.setPluginData('device', s.device);
  // A prompt marks the layer as waiting for a generated image (new placeholders get theirs in createNode).
  if (s.prompt !== undefined && !(o.isNew && node.getPluginData('role') === 'image-placeholder')) await setImagePrompt(node, s.prompt, (f) => ctx.loadFont(f));

  if (s.fill !== undefined && node.type !== 'TEXT') await applyFills(node, s.fill, ctx, `${path}.fill`);
  if (s.stroke !== undefined) await applyStroke(node, s.stroke, ctx, `${path}.stroke`);
  if (s.radius !== undefined) {
    if (!('cornerRadius' in node)) ctx.warn(`${path}.radius: ${node.type.toLowerCase()} has no corner radius.`);
    else if (Array.isArray(s.radius)) {
      if (!('topLeftRadius' in node)) throw badRequest(`${path}.radius: per-corner radius needs a frame or rectangle.`);
      const fields = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'] as const;
      for (let i = 0; i < 4; i++) await setNum(node, fields[i], s.radius[i], ctx, `${path}.radius[${i}]`);
    } else if (isVar(s.radius)) {
      const v = await ctx.variable(s.radius, 'FLOAT');
      if ('topLeftRadius' in node) for (const f of ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'] as const) node.setBoundVariable(f, v);
      else node.setBoundVariable('cornerRadius', v);
    } else (node as CornerMixin & SceneNode).cornerRadius = Number(s.radius);
  }
  if (s.effects !== undefined) await applyEffects(node, s.effects, ctx, `${path}.effects`);

  if (s.color !== undefined && node.type !== 'TEXT') {
    if (node.type === 'LINE') {
      const r = await toPaints(s.color, ctx, `${path}.color`);
      if (r.styleId) await node.setStrokeStyleIdAsync(r.styleId);
      else node.strokes = r.paints;
    } else if (['RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR'].includes(node.type)) {
      await applyFills(node, s.color, ctx, `${path}.color`);
    } else if (
      node.type === 'INSTANCE' || node.type === 'VECTOR' || node.type === 'BOOLEAN_OPERATION' ||
      ((node.type === 'FRAME' || node.type === 'GROUP') && (s.type === 'svg' || s.type === 'icon' || isVectorOnly(node)))
    ) {
      const n = await recolorVectors(node, s.color, ctx, `${path}.color`);
      if (!n) ctx.warn(`${path}.color: no vector layers to recolor.`);
    } else if (!o.isNew) {
      ctx.warn(`${path}.color: on a ${node.type.toLowerCase()} "color" only sets the default text color for text created inside it; use "fill" for its background.`);
    }
  }

  if (s.strokeWidth !== undefined && node.type !== 'TEXT') {
    // Icon stroke weight (line icons): applies to every stroked vector inside.
    let n = 0;
    const visit = (x: SceneNode) => {
      if ('strokes' in x && Array.isArray((x as GeometryMixin).strokes) && (x as GeometryMixin).strokes.length && x.type !== 'FRAME' && x.type !== 'INSTANCE' && x.type !== 'COMPONENT') {
        (x as GeometryMixin & SceneNode).strokeWeight = s.strokeWidth!;
        n++;
      }
      if ('children' in x) for (const c of x.children) visit(c);
    };
    visit(node);
    if (!n) ctx.warn(`${path}.strokeWidth: no stroked vectors inside.`);
  }

  if (s.modes) {
    for (const [collName, modeName] of Object.entries(s.modes)) {
      const coll = await ctx.collectionByName(collName);
      const mode = coll.modes.find((m) => m.name.toLowerCase() === modeName.toLowerCase());
      if (!mode) throw notFound(`${path}.modes: collection "${coll.name}" has no mode "${modeName}". Modes: ${coll.modes.map((m) => m.name).join(', ')}.`);
      await ctx.loadFontsIn(node);
      node.setExplicitVariableModeForCollection(coll, mode.modeId);
    }
  }

  if (node.type === 'INSTANCE' && (s.variant || s.props)) await applyInstanceProps(node, s, ctx, path);
  if (node.type === 'INSTANCE' && s.overrides) {
    for (const [p, sub] of Object.entries(s.overrides)) {
      const target = findByPath(node, p);
      if (!target) {
        const names: string[] = [];
        node.findAll((n) => {
          names.push(n.name);
          return false;
        });
        throw notFound(`${path}.overrides: no layer "${p}" inside this instance.${didYouMean(p, names)}`);
      }
      await applyProps(target, sub, inh, ctx, `${path}.overrides.${p}`, { isNew: false });
    }
  }

  if (s.bind) ctx.binds.push({ node, bind: s.bind, path });

  if (s.scroll !== undefined) {
    if ('overflowDirection' in node) (node as FrameNode).overflowDirection = ({ none: 'NONE', vertical: 'VERTICAL', horizontal: 'HORIZONTAL', both: 'BOTH' } as const)[s.scroll];
    else ctx.warn(`${path}.scroll: only frames can scroll.`);
  }
  if (s.annotations?.length) {
    try {
      (node as FrameNode).annotations = s.annotations.map((label) => ({ label }));
    } catch (e) {
      ctx.warn(`${path}.annotations: not applied (${e instanceof Error ? e.message : e}).`);
    }
  }
  if (s.interactions?.length) ctx.pendingInteractions.push({ node, items: s.interactions, path });
  if (s.rotation !== undefined) {
    if ('rotation' in node) (node as LayoutMixin & SceneNode).rotation = s.rotation;
    else ctx.warn(`${path}.rotation: ${node.type.toLowerCase()} cannot rotate.`);
  }
}
