// Declarative builder: spec tree → Figma nodes. Pre-validates names (variables, styles,
// components, fonts) so a bad call fails before touching the file, and removes the partial
// result if something still goes wrong mid-way.

import type { Spec } from '../shared/spec.ts';
import { walkSpec } from '../shared/spec.ts';
import { Ctx } from './ctx.ts';
import { badRequest } from './errors.ts';
import { applyPendingInteractions } from './prototype.ts';
import { applyMockup, ensureCanvas, isMockupDevice, keepChromeOnTop, mockupScreenOf } from './device.ts';
import { pageOf } from './inspect.ts';
import { addCaption, captionText, ensurePage, fitSections, freeSpot, componentHome, iconBoard, ICONS_ROLE, isTrashPage, rolePage, setImagePrompt, trashNodes } from './pages.ts';
import { applyProps, isAutoLayout } from './props.ts';
import { DEFAULT_FAMILY, inheritFrom, type Inherit } from './text.ts';

export interface BuildOptions {
  parentId?: string;
  /** Page by name (English, e.g. "App", "Web"); created on first use. */
  page?: string;
  index?: number;
  x?: number;
  y?: number;
  replaceId?: string;
  focus?: boolean;
  /** Bring the target page into view (default true; components are built without switching). */
  switchPage?: boolean;
  /** Allow a second top-level layer with the same name on the page (normally refused: update the existing one). */
  allowDuplicate?: boolean;
  icons?: 'component' | 'inline';
}

const PLUGIN_KEY = 'figma-mcp';

// ───────────── preflight ─────────────

/** Resolves every name the spec mentions, so errors come back together and early. */
export async function preflight(spec: Spec, ctx: Ctx, inherited: Inherit): Promise<void> {
  const problems: string[] = [];
  const tasks: Array<Promise<unknown>> = [];
  const check = (p: Promise<unknown>) => tasks.push(p.catch((e) => problems.push(e instanceof Error ? e.message : String(e))));
  const fonts = new Map<string, { family: string; weight?: number; italic?: boolean; style?: string }>();

  const visit = (s: Spec, path: string, inh: Inherit) => {
    const paintRefs = [...(s.fill ?? []), ...(s.color ?? []), ...(s.stroke?.paints ?? [])];
    for (const p of paintRefs) {
      if (p.kind === 'solid' && p.color.startsWith('$')) check(ctx.variable(p.color, 'COLOR').catch((e) => Promise.reject(new Error(`${path}: ${e.message}`))));
      if (p.kind === 'style') check(ctx.style(p.name, 'PAINT').catch((e) => Promise.reject(new Error(`${path}: ${e.message}`))));
    }
    const nums = [s.gap, s.rowGap, s.colGap, s.opacity, s.minW, s.maxW, s.minH, s.maxH, s.w, s.h, ...(Array.isArray(s.radius) ? s.radius : [s.radius]), ...(s.pad ?? [])];
    for (const n of nums) if (typeof n === 'string' && n.startsWith('$')) check(ctx.variable(n, 'FLOAT').catch((e) => Promise.reject(new Error(`${path}: ${e.message}`))));
    for (const e of s.effects ?? []) if (e.kind === 'style') check(ctx.style(e.name, 'EFFECT').catch((err) => Promise.reject(new Error(`${path}: ${err.message}`))));
    if (s.style && s.type === 'text') check(ctx.style(s.style, 'TEXT').catch((e) => Promise.reject(new Error(`${path}: ${e.message}`))));
    if (s.type === 'instance' && s.component) check(ctx.component(s.component).catch((e) => Promise.reject(new Error(`${path}: ${e.message}`))));
    if (s.modes) for (const c of Object.keys(s.modes)) check(ctx.collectionByName(c).catch((e) => Promise.reject(new Error(`${path}.modes: ${e.message}`))));
    const childInh = inheritFrom(inh, s);
    if (s.type === 'text') {
      const f = { ...inh.font, ...(s.font ?? {}) };
      if (!s.style || s.font?.family || s.font?.weight || s.font?.style) {
        const family = f.family ?? DEFAULT_FAMILY;
        fonts.set(`${family}|${f.weight}|${f.italic}|${f.style}`, { family, weight: f.weight, italic: f.italic, style: s.font?.style ?? f.style });
      }
    }
    s.children?.forEach((c, i) => visit(c, `${path}.children[${i}]`, childInh));
  };
  visit(spec, 'spec', inherited);
  for (const f of fonts.values()) check(ctx.resolveFont(f.family, f.weight, f.italic, f.style).then((fn) => ctx.loadFont(fn)));
  await Promise.all(tasks);
  if (problems.length) throw badRequest(`Nothing was created — fix these first:\n- ${[...new Set(problems)].join('\n- ')}`);
}

// ───────────── creation ─────────────

/** One reusable component per icon ("icon/lucide/search"); screens get instances. */
async function iconComponent(name: string, svg: string, ctx: Ctx): Promise<ComponentNode> {
  const compName = `icon/${name.replace(':', '/')}`;
  try {
    const c = await ctx.component(compName, { libraryScan: false });
    if (c.type === 'COMPONENT') return c;
  } catch {
    /* not there yet */
  }
  const frame = figma.createNodeFromSvg(svg);
  const comp = figma.createComponentFromNode(frame);
  comp.name = compName;
  comp.fills = [];
  comp.description = `Icon ${name} (Iconify). Recolor through the instance's vector layers or a color variable.`;
  const holder = await iconBoard();
  holder.appendChild(comp);
  ctx.registerComponent(comp);
  return comp;
}

function findVariant(set: ComponentSetNode, want: Record<string, string> | undefined, path: string): ComponentNode {
  const variants = set.children.filter((c): c is ComponentNode => c.type === 'COMPONENT');
  const base = set.defaultVariant ?? variants[0];
  if (!want || !Object.keys(want).length) return base;
  const defaults = base.variantProperties ?? {};
  const target: Record<string, string> = { ...defaults, ...want };
  const norm = (s: string) => s.toLowerCase().trim();
  const axes = Object.keys(defaults);
  for (const k of Object.keys(want)) {
    if (!axes.some((a) => norm(a) === norm(k))) {
      throw badRequest(`${path}.variant: "${set.name}" has no variant property "${k}". Properties: ${axes.join(', ')}.`);
    }
  }
  const hit = variants.find((v) => {
    const vp = v.variantProperties ?? {};
    return Object.entries(target).every(([k, val]) => {
      const key = Object.keys(vp).find((x) => norm(x) === norm(k));
      return key !== undefined && norm(vp[key]) === norm(val);
    });
  });
  if (hit) return hit;
  const options = axes.map((a) => `${a}: ${[...new Set(variants.map((v) => v.variantProperties?.[a]))].join('|')}`).join('; ');
  throw badRequest(`${path}.variant: no variant of "${set.name}" matches ${JSON.stringify(want)}. Options — ${options}.`);
}

async function createNode(s: Spec, ctx: Ctx, path: string, opts: BuildOptions): Promise<{ node: SceneNode; natural?: { w: number; h: number } }> {
  switch (s.type) {
    case 'frame':
      return { node: figma.createFrame() };
    case 'component':
      return { node: figma.createComponent() };
    case 'text':
      return { node: figma.createText() };
    case 'rect':
      return { node: figma.createRectangle() };
    case 'ellipse':
      return { node: figma.createEllipse() };
    case 'line':
      return { node: figma.createLine() };
    case 'polygon':
      return { node: figma.createPolygon() };
    case 'star':
      return { node: figma.createStar() };
    case 'section':
      return { node: figma.createSection() };
    case 'svg': {
      try {
        const n = figma.createNodeFromSvg(s.svg ?? '');
        if (!s.name) n.name = 'svg';
        return { node: n };
      } catch (e) {
        throw badRequest(`${path}.svg: Figma could not parse this SVG (${e instanceof Error ? e.message : e}). It needs a root <svg> with width, height and viewBox.`);
      }
    }
    case 'icon': {
      if (!s.svg) throw badRequest(`${path}: icon "${s.icon}" has no SVG (icons are fetched by the MCP server; inside execute use type "svg").`);
      if ((opts.icons ?? 'component') === 'inline') {
        const n = figma.createNodeFromSvg(s.svg);
        n.name = s.icon ?? 'icon';
        return { node: n };
      }
      const comp = await iconComponent(s.icon ?? 'icon', s.svg, ctx);
      return { node: comp.createInstance() };
    }
    case 'image': {
      if (s.imageData) {
        const rect = figma.createRectangle();
        rect.name = 'Image';
        const img = figma.createImage(figma.base64Decode(s.imageData));
        rect.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: ({ fill: 'FILL', fit: 'FIT', crop: 'CROP', tile: 'TILE' } as const)[s.fit ?? 'fill'] }];
        let natural: { w: number; h: number } | undefined;
        try {
          const size = await img.getSizeAsync();
          natural = { w: size.width, h: size.height };
        } catch {
          /* size unknown */
        }
        return { node: rect, natural };
      }
      // Placeholder: a neutral box that carries the missing image's prompt (and IMG id) until the
      // real image arrives (image_prompts → the user generates it → place_images).
      const f = figma.createFrame();
      f.name = 'Image placeholder';
      f.fills = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }];
      f.layoutMode = 'VERTICAL';
      f.primaryAxisAlignItems = 'CENTER';
      f.counterAxisAlignItems = 'CENTER';
      f.paddingTop = f.paddingBottom = f.paddingLeft = f.paddingRight = 12;
      f.resize(240, 160);
      f.setPluginData('role', 'image-placeholder');
      f.setPluginData('placeholder', s.placeholder ?? '');
      const load = (fn: FontName) => ctx.loadFont(fn);
      const need = s.prompt ?? s.supply;
      const imageId = need ? await setImagePrompt(f, need, load, s.prompt === undefined) : '';
      const tiny = (typeof s.w === 'number' && s.w < 72) || (typeof s.h === 'number' && s.h < 48);
      if (!tiny && (s.placeholder || imageId)) await addCaption(f, captionText(s.placeholder ?? s.name ?? '', imageId), { family: DEFAULT_FAMILY, style: 'Regular' }, load);
      return { node: f };
    }
    case 'instance': {
      const c = await ctx.component(s.component ?? '');
      const comp = c.type === 'COMPONENT_SET' ? findVariant(c, s.variant, path) : c;
      if (c.type === 'COMPONENT' && s.variant && Object.keys(s.variant).length) ctx.warn(`${path}.variant: "${c.name}" has no variants; ignored.`);
      return { node: comp.createInstance() };
    }
    case 'group':
      throw badRequest('internal: groups are built by buildGroup');
  }
}

export async function buildNode(
  spec: Spec,
  parent: BaseNode & ChildrenMixin,
  inh: Inherit,
  ctx: Ctx,
  path: string,
  o: { index?: number; crossFill?: boolean; opts: BuildOptions },
): Promise<SceneNode> {
  if (spec.type === 'group') return buildGroup(spec, parent, inh, ctx, path, o);
  if (spec.type === 'section' && parent.type !== 'PAGE' && parent.type !== 'SECTION') {
    throw badRequest(`${path}: sections can only live on a page or inside another section.`);
  }
  if (parent.type === 'INSTANCE') throw badRequest(`${path}: cannot add layers inside an instance; edit its main component or use overrides.`);

  const { node, natural } = await createNode(spec, ctx, path, o.opts);
  if (o.index !== undefined && o.index >= 0 && o.index <= parent.children.length) parent.insertChild(o.index, node);
  else parent.appendChild(node);
  ctx.created.push(node);
  if (spec.ref) ctx.refs.set(spec.ref, node);

  const topLevel = parent.type === 'PAGE' || parent.type === 'SECTION';
  const s: Spec = { ...spec };
  if ((s.type === 'frame' || s.type === 'component') && s.dir === undefined) s.dir = 'column';
  if (s.type === 'frame' || s.type === 'component') {
    if (s.fill === undefined && !(topLevel && s.type === 'frame')) (node as FrameNode).fills = [];
    if (s.clip === undefined) (node as FrameNode).clipsContent = topLevel && s.type === 'frame';
  }
  // Icons and svg take the inherited text color, like CSS currentColor.
  if ((s.type === 'icon' || s.type === 'svg') && s.color === undefined && inh.color) s.color = inh.color;
  if (s.type === 'icon' || s.type === 'svg') {
    const size = s.size ?? (s.type === 'icon' ? 24 : undefined);
    if (size !== undefined && s.w === undefined && s.h === undefined) {
      s.w = size;
      s.h = size;
    }
  }
  if (s.type === 'image' && natural && s.imageData) {
    const ratio = natural.h / natural.w;
    if (s.w === undefined && s.h === undefined) {
      const scale = Math.min(1, 1200 / Math.max(natural.w, natural.h));
      s.w = Math.round(natural.w * scale);
      s.h = Math.round(natural.h * scale);
    } else if (typeof s.w === 'number' && s.h === undefined) s.h = Math.round(s.w * ratio);
    else if (typeof s.h === 'number' && s.w === undefined) s.w = Math.round(s.h / ratio);
  }

  // Warn about the classic collapse: a FILL child inside a parent that hugs on that axis.
  const kids = s.children ?? [];
  const dir = s.dir ?? 'none';
  if (kids.length && (s.type === 'frame' || s.type === 'component')) {
    const effW = s.w ?? (o.crossFill && parent.type !== 'PAGE' && (parent as FrameNode).layoutMode === 'VERTICAL' ? 'fill' : 'hug');
    const effH = s.h ?? (o.crossFill && parent.type !== 'PAGE' && (parent as FrameNode).layoutMode === 'HORIZONTAL' ? 'fill' : 'hug');
    kids.forEach((k, i) => {
      if (k.absolute) return;
      if (k.w === 'fill' && effW === 'hug')
        ctx.warn(`${path}.children[${i}]: w "fill" inside a parent that hugs its width — it will shrink to its minimum. Give ${path} a width (number or "fill").`);
      if (k.h === 'fill' && effH === 'hug') ctx.warn(`${path}.children[${i}]: h "fill" inside a parent that hugs its height. Give ${path} a height.`);
    });
  }

  await applyProps(node, s, inh, ctx, path, { isNew: true, crossFill: o.crossFill });

  if (kids.length) {
    if (!('appendChild' in node)) throw badRequest(`${path}: a ${s.type} cannot contain children.`);
    const childInh = inheritFrom(inh, s);
    const order = kids.map((k, i) => ({ k, i }));
    if (childInh.rtl && dir === 'row') order.reverse();
    const created: Array<{ spec: Spec; node: SceneNode }> = [];
    for (const { k, i } of order) {
      const child = await buildNode(k, node as BaseNode & ChildrenMixin, childInh, ctx, `${path}.children[${i}]`, { crossFill: s.align === 'stretch', opts: o.opts });
      created.push({ spec: k, node: child });
    }
    const fixed = created.filter((c) => c.spec.fixed);
    if (fixed.length) {
      const f = node as FrameNode;
      for (const c of fixed) f.appendChild(c.node); // fixed children are the top-most layers
      f.numberOfFixedChildren = fixed.length;
      if (f.overflowDirection === 'NONE') ctx.warn(`${path}: has fixed children but does not scroll; set scroll: "vertical".`);
    }
  }

  // Hugging frames change size as children arrive; position them once their size is final.
  if ((s.x !== undefined || s.y !== undefined) && (s.absolute || !isAutoLayout(parent))) {
    if (s.x !== undefined) node.x = s.x;
    if (s.y !== undefined) node.y = s.y;
  }

  if (s.type === 'component' && s.props && Object.keys(s.props).length) {
    await defineComponentProps(node as ComponentNode, s.props as Record<string, unknown>, ctx, path);
  }
  return node;
}

async function buildGroup(spec: Spec, parent: BaseNode & ChildrenMixin, inh: Inherit, ctx: Ctx, path: string, o: { index?: number; crossFill?: boolean; opts: BuildOptions }): Promise<SceneNode> {
  const childInh = inheritFrom(inh, spec);
  const kids: SceneNode[] = [];
  for (let i = 0; i < (spec.children ?? []).length; i++) {
    kids.push(await buildNode(spec.children![i], parent, childInh, ctx, `${path}.children[${i}]`, { opts: o.opts }));
  }
  const g = figma.group(kids, parent, o.index);
  ctx.created.push(g);
  if (spec.ref) ctx.refs.set(spec.ref, g);
  const { children: _c, ...rest } = spec;
  await applyProps(g, { ...rest, name: spec.name ?? 'Group' }, inh, ctx, path, { isNew: true });
  return g;
}

// ───────────── component properties ─────────────

const PROP_TYPES: Record<string, ComponentPropertyType> = {
  text: 'TEXT', string: 'TEXT', boolean: 'BOOLEAN', bool: 'BOOLEAN', toggle: 'BOOLEAN',
  instance: 'INSTANCE_SWAP', swap: 'INSTANCE_SWAP', 'instance-swap': 'INSTANCE_SWAP', slot: 'INSTANCE_SWAP',
};

function isInside(node: BaseNode, owner: BaseNode): boolean {
  let n: BaseNode | null = node;
  while (n) {
    if (n === owner) return true;
    n = n.parent;
  }
  return false;
}

/**
 * Adds TEXT/BOOLEAN/INSTANCE_SWAP properties to a component or component set and wires the
 * layers that declared `bind` to them. Returns property name → generated key.
 */
export async function defineComponentProps(owner: ComponentNode | ComponentSetNode, defs: Record<string, unknown>, ctx: Ctx, path: string): Promise<Record<string, string>> {
  const keys: Record<string, string> = {};
  const binds = ctx.binds.filter((b) => isInside(b.node, owner));
  for (const [name, raw] of Object.entries(defs)) {
    const def = (typeof raw === 'object' && raw !== null ? raw : { type: typeof raw === 'boolean' ? 'boolean' : 'text', default: raw }) as {
      type?: string;
      default?: unknown;
      preferred?: string[];
      description?: string;
    };
    const t = PROP_TYPES[String(def.type ?? 'text').toLowerCase()];
    if (!t) throw badRequest(`${path}.props.${name}: type must be text, boolean or instance.`);
    let defaultValue: string | boolean;
    let options: ComponentPropertyOptions | undefined;
    if (t === 'BOOLEAN') defaultValue = def.default === undefined ? true : def.default === true || def.default === 'true';
    else if (t === 'TEXT') {
      const bound = binds.find((b) => b.bind.text?.toLowerCase() === name.toLowerCase() && b.node.type === 'TEXT');
      defaultValue = def.default !== undefined ? String(def.default) : bound ? (bound.node as TextNode).characters : name;
    } else {
      let dflt = def.default !== undefined ? String(def.default) : undefined;
      if (!dflt) {
        const bound = binds.find((b) => b.bind.swap?.toLowerCase() === name.toLowerCase() && b.node.type === 'INSTANCE');
        if (bound) dflt = (await (bound.node as InstanceNode).getMainComponentAsync())?.id;
      }
      if (!dflt) throw badRequest(`${path}.props.${name}: an instance-swap property needs a default component.`);
      const c = await ctx.component(dflt);
      defaultValue = c.type === 'COMPONENT_SET' ? (c.defaultVariant ?? (c.children[0] as ComponentNode)).id : c.id;
      if (def.preferred?.length) {
        const preferredValues: InstanceSwapPreferredValue[] = [];
        for (const pv of def.preferred) {
          const pc = await ctx.component(pv);
          preferredValues.push({ type: pc.type === 'COMPONENT_SET' ? 'COMPONENT_SET' : 'COMPONENT', key: pc.key });
        }
        options = { preferredValues };
      }
    }
    keys[name.toLowerCase()] = owner.addComponentProperty(name, t, defaultValue, options);
  }
  for (const b of binds) {
    const refs: { [k: string]: string } = { ...(b.node.componentPropertyReferences ?? {}) };
    const want: Array<['characters' | 'visible' | 'mainComponent', string | undefined, ComponentPropertyType]> = [
      ['characters', b.bind.text, 'TEXT'],
      ['visible', b.bind.visible, 'BOOLEAN'],
      ['mainComponent', b.bind.swap, 'INSTANCE_SWAP'],
    ];
    for (const [field, propName, type] of want) {
      if (!propName) continue;
      const key = keys[propName.toLowerCase()];
      if (!key) {
        throw badRequest(`${b.path}.bind: no ${type.toLowerCase()} property "${propName}" is defined. Defined: ${Object.keys(defs).join(', ') || 'none'}.`);
      }
      if (field === 'characters' && b.node.type !== 'TEXT') throw badRequest(`${b.path}.bind.text: only text layers can bind a text property.`);
      if (field === 'mainComponent' && b.node.type !== 'INSTANCE') throw badRequest(`${b.path}.bind.swap: only instances can bind an instance-swap property.`);
      refs[field] = key;
    }
    if (b.node.type === 'TEXT') await ctx.loadFontsIn(b.node);
    b.node.componentPropertyReferences = refs;
  }
  ctx.binds = ctx.binds.filter((b) => !binds.includes(b));
  return keys;
}

// ───────────── entry ─────────────

export function summarize(node: SceneNode) {
  return { id: node.id, name: node.name, type: node.type, x: Math.round(node.x), y: Math.round(node.y), w: Math.round(node.width), h: Math.round(node.height) };
}

export async function build(spec: Spec, opts: BuildOptions = {}, existingCtx?: Ctx) {
  const ctx = existingCtx ?? new Ctx();
  let parent: BaseNode & ChildrenMixin = figma.currentPage;
  let createdPage: PageNode | undefined;
  let index = opts.index;
  let replace: SceneNode | undefined;
  if (opts.replaceId) {
    replace = await ctx.sceneNode(opts.replaceId, 'replaceId');
    if (!replace.parent) throw badRequest('replaceId: node has no parent.');
    parent = replace.parent as BaseNode & ChildrenMixin;
    index = parent.children.indexOf(replace);
  } else if (opts.parentId) {
    const p = await ctx.node(opts.parentId, 'parentId');
    if (!('appendChild' in p)) throw badRequest(`parentId ${opts.parentId}: a ${p.type.toLowerCase()} cannot contain layers.`);
    if (p.type === 'PAGE') {
      await (p as PageNode).loadAsync();
      if (p !== figma.currentPage && opts.switchPage !== false) await figma.setCurrentPageAsync(p as PageNode);
    }
    parent = p as BaseNode & ChildrenMixin;
  } else if (opts.page || spec.type === 'component') {
    // Components live in the Components page's board unless told otherwise.
    const r = opts.page ? await ensurePage(opts.page) : await rolePage('components');
    if (r.created) createdPage = r.page;
    if (r.page !== figma.currentPage && (opts.switchPage ?? spec.type !== 'component')) await figma.setCurrentPageAsync(r.page);
    parent = spec.type === 'component' && r.page.getPluginData('role') === 'components' ? await componentHome(spec.name ?? '') : r.page;
  }
  if (!replace && spec.type === 'component' && spec.name && !opts.allowDuplicate) {
    const twin = await ctx.localComponentNamed(spec.name);
    if (twin) throw badRequest(`Component "${twin.name}" already exists (${twin.id}). Update that component (edit it or its variants) and place instances of it instead of making a second one.`);
  }
  const targetPage = parent.type === 'PAGE' ? (parent as PageNode) : pageOf(parent);
  if (isTrashPage(targetPage)) throw badRequest('That is the Trash page. Build on a content page (page: "App", "Web", "Dashboard", …) or restore layers with edit {op: "restore"}.');
  if (!replace && (parent.type === 'PAGE' || parent.type === 'SECTION') && spec.name && !opts.allowDuplicate) {
    const want = spec.name.trim().toLowerCase();
    const twin = parent.children.find((c) => c.name.trim().toLowerCase() === want);
    if (twin) {
      throw badRequest(
        `"${twin.name}" already exists on ${parent.type === 'PAGE' ? 'page' : 'section'} "${parent.name}" (${twin.id}). Update it instead of making a second copy: edit it, or build with replaceId: "${twin.id}" (the old version goes to the Trash page). Use another name for a different state (e.g. "${spec.name} – Empty"), or allowDuplicate: true if a copy is really wanted.`,
      );
    }
  }
  if (parent.type === 'PAGE' && targetPage?.getPluginData('role') === 'components' && spec.type !== 'component' && spec.type !== 'section') {
    ctx.warn('Built on the Components page: keep only components (and their documentation) there; screens go on their own page (App, Web, Dashboard…).');
  }

  const inh: Inherit = { font: {}, color: undefined, rtl: undefined };
  // Inherit text color/font/rtl from an existing parent chain is not attempted; specs are explicit.
  try {
    await ctx.loadFont({ family: DEFAULT_FAMILY, style: 'Regular' });
  } catch {
    /* Inter missing is unusual; real fonts are resolved per node */
  }
  await preflight(spec, ctx, inh);

  const placeOnCanvas = (parent.type === 'PAGE' || parent.type === 'SECTION') && !replace;
  const spot = placeOnCanvas && opts.x === undefined && opts.y === undefined && spec.x === undefined && spec.y === undefined ? freeSpot(parent) : undefined;

  let root: SceneNode | undefined;
  try {
    root = await buildNode(spec, parent, inh, ctx, 'spec', { index, crossFill: false, opts });
    if (replace) {
      if (!isAutoLayout(parent)) {
        root.x = replace.x;
        root.y = replace.y;
      }
      await trashNodes([replace]); // the old version stays restorable on the Trash page
    } else if (spot) {
      root.x = spot.x;
      root.y = spot.y;
    } else if (placeOnCanvas && (opts.x !== undefined || opts.y !== undefined)) {
      if (opts.x !== undefined) root.x = opts.x;
      if (opts.y !== undefined) root.y = opts.y;
    }
    const topLevel = parent.type === 'PAGE' || parent.type === 'SECTION';
    if (topLevel && root.type === 'FRAME' && spec.mockup !== false && isMockupDevice(spec.device) && targetPage?.getPluginData('role') !== 'components') {
      for (const w of await applyMockup(root, spec.device!)) ctx.warn(w);
    } else if (!topLevel) keepChromeOnTop(mockupScreenOf(parent));
    if (topLevel && targetPage?.getPluginData('role') !== 'trash') ensureCanvas(targetPage, root);
    if (targetPage) fitSections(targetPage);
    const linked = await applyPendingInteractions(ctx);
    if (ctx.binds.length) {
      for (const b of ctx.binds) ctx.warn(`${b.path}.bind: ignored — binds only work inside a component that defines "props".`);
      ctx.binds = [];
    }
    if (opts.focus !== false && root.parent && pageOf(root) === figma.currentPage) {
      figma.currentPage.selection = [root];
      figma.viewport.scrollAndZoomIntoView([root]);
    }
    const ids: Record<string, string> = {};
    for (const [ref, n] of ctx.refs) ids[ref] = n.id;
    return { root: summarize(root), page: pageOf(root)?.name, ids, created: ctx.created.length, interactions: linked, warnings: ctx.warnings };
  } catch (e) {
    // Leave the file as it was.
    const first = root ?? ctx.created[0];
    try {
      if (first && !first.removed) first.remove();
      for (const n of ctx.created) if (!n.removed && n.parent?.type === 'PAGE' && n !== first && n.getPluginData('role') !== ICONS_ROLE) n.remove();
      if (createdPage && !createdPage.removed && !createdPage.children.length && figma.root.children.length > 1) {
        if (figma.currentPage === createdPage) await figma.setCurrentPageAsync(figma.root.children.find((p) => p !== createdPage)!);
        createdPage.remove(); // no empty page left behind
      }
    } catch {
      /* best effort */
    }
    throw e;
  }
}

/** Collects every icon name and image source in a spec (the server fetches them). */
export function specAssets(spec: Spec): { icons: string[]; images: string[] } {
  const icons = new Set<string>();
  const images = new Set<string>();
  walkSpec(spec, (s) => {
    if (s.type === 'icon' && s.icon && !s.svg) icons.add(s.icon);
    if (s.type === 'image' && s.src && !s.imageData) images.add(s.src);
    for (const p of s.fill ?? []) if (p.kind === 'image' && p.src && !p.imageData) images.add(p.src);
  });
  return { icons: [...icons], images: [...images] };
}

export { PLUGIN_KEY };
