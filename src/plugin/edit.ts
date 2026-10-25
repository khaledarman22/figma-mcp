// Batch edits on existing layers. Ops run in order and share refs; the first failure stops the
// batch and the result says which ops were already applied.

import { applyAssets, newIssues, normalizeSpec, type AssetMap, type Spec } from '../shared/spec.ts';
import { buildNode, preflight, summarize } from './build.ts';
import { Ctx } from './ctx.ts';
import { badRequest, explainFigmaError } from './errors.ts';
import { applyPendingInteractions } from './prototype.ts';
import { applyProps, isAutoLayout } from './props.ts';
import { keepChromeOnTop, mockupScreenOf, setCanvas } from './device.ts';
import { parseColor } from '../shared/color.ts';
import { pageOf } from './inspect.ts';
import { componentHome, ensurePage, fitSections, freeSpot, placeImage, restoreNodes, rolePage, trashNodes } from './pages.ts';

export interface EditOp {
  op: string;
  id?: string;
  ids?: string[];
  ref?: string;
  props?: unknown;
  spec?: unknown;
  parent?: string;
  index?: number;
  x?: number;
  y?: number;
  name?: string;
  text?: string;
  component?: string;
  variant?: Record<string, string>;
  count?: number;
  gap?: number;
  zoom?: boolean;
  create?: boolean;
  /** page op: canvas color of the page. */
  background?: string;
  operation?: 'union' | 'subtract' | 'intersect' | 'exclude';
  permanent?: boolean;
  keepInPlace?: boolean;
  src?: string;
  fit?: 'fill' | 'fit' | 'crop' | 'tile';
}

const OPS = ['set', 'text', 'delete', 'restore', 'move', 'duplicate', 'rename', 'insert', 'wrap', 'unwrap', 'swap', 'detach', 'reset', 'to-component', 'combine-variants', 'select', 'page', 'group', 'ungroup', 'flatten', 'boolean', 'place-image'];

async function idsOf(op: EditOp, ctx: Ctx, i: number): Promise<SceneNode[]> {
  const ids = op.ids ?? (op.id ? [op.id] : []);
  if (!ids.length) throw badRequest(`ops[${i}] (${op.op}): needs "id" or "ids".`);
  const nodes: SceneNode[] = [];
  for (const id of ids) nodes.push(await ctx.sceneNode(id, `ops[${i}]`));
  return nodes;
}

function container(n: BaseNode, label: string): BaseNode & ChildrenMixin {
  if (!('appendChild' in n)) throw badRequest(`${label}: a ${n.type.toLowerCase()} cannot contain layers.`);
  if (n.type === 'INSTANCE') throw badRequest(`${label}: cannot add layers inside an instance.`);
  return n as BaseNode & ChildrenMixin;
}

export async function edit(p: { ops: EditOp[]; focus?: boolean; assets?: AssetMap }) {
  if (!Array.isArray(p.ops) || !p.ops.length) throw badRequest('ops is empty.');
  const ctx = new Ctx();
  const results: Array<Record<string, unknown>> = [];
  const touched: SceneNode[] = [];
  for (let i = 0; i < p.ops.length; i++) {
    const op = p.ops[i];
    const label = `ops[${i}] (${op.op})`;
    try {
      if (!OPS.includes(op.op)) throw badRequest(`${label}: unknown op. Ops: ${OPS.join(', ')}.`);
      const r = await runOp(op, ctx, label, i, touched, p.assets);
      results.push({ op: op.op, ok: true, ...r });
    } catch (e) {
      const msg = explainFigmaError(e);
      return {
        ok: false,
        failedAt: i,
        error: `${label}: ${msg}`,
        applied: results,
        note: i > 0 ? `ops 0–${i - 1} were applied; fix op ${i} and send the remaining ops only.` : 'nothing was applied.',
        warnings: ctx.warnings,
      };
    }
  }
  await applyPendingInteractions(ctx);
  fitSections(figma.currentPage);
  for (const n of touched) {
    const pg = !n.removed ? pageOf(n) : null;
    if (pg && pg !== figma.currentPage) fitSections(pg);
  }
  if (p.focus && touched.length) {
    const alive = touched.filter((n) => !n.removed);
    if (alive.length) {
      figma.currentPage.selection = alive;
      figma.viewport.scrollAndZoomIntoView(alive);
    }
  }
  const ids: Record<string, string> = {};
  for (const [ref, n] of ctx.refs) ids[ref] = n.id;
  return { ok: true, results, ids, warnings: ctx.warnings };
}

async function runOp(op: EditOp, ctx: Ctx, label: string, i: number, touched: SceneNode[], assets?: AssetMap): Promise<Record<string, unknown>> {
  switch (op.op) {
    case 'set': {
      const issues = newIssues();
      const props = normalizeSpec(op.props ?? {}, `${label}.props`, issues, { partial: true });
      issues.errors.push(...applyAssets(props, assets));
      if (issues.errors.length) throw badRequest(issues.errors.join('; '));
      if (props.children) throw badRequest(`${label}: "set" cannot add children; use "insert".`);
      ctx.warnings.push(...issues.warnings);
      const nodes = await idsOf(op, ctx, i);
      for (const n of nodes) {
        await applyProps(n, props, { font: {} }, ctx, `${label}[${n.id}]`, { isNew: false });
        touched.push(n);
      }
      return { ids: nodes.map((n) => n.id) };
    }
    case 'text': {
      const [n] = await idsOf(op, ctx, i);
      if (n.type !== 'TEXT') throw badRequest(`${label}: ${n.id} is a ${n.type.toLowerCase()}, not text.`);
      await ctx.loadFontsIn(n);
      n.characters = op.text ?? '';
      touched.push(n);
      return { id: n.id };
    }
    case 'rename': {
      const [n] = await idsOf(op, ctx, i);
      n.name = op.name ?? n.name;
      return { id: n.id, name: n.name };
    }
    case 'delete': {
      // Deleting moves layers to the Trash page (restorable); permanent: true really removes them.
      const nodes = await idsOf(op, ctx, i);
      const ids = nodes.map((n) => n.id);
      if (op.permanent) {
        for (const n of nodes) if (!n.removed) n.remove();
        return { deleted: ids, permanent: true };
      }
      const r = await trashNodes(nodes);
      return { trashed: r.trashed, page: r.page, ...(r.removedPages.length ? { removedEmptyPages: r.removedPages } : {}), note: 'moved to the Trash page — restore with {op: "restore", ids}' };
    }
    case 'restore': {
      const nodes = await idsOf(op, ctx, i);
      const parent = op.parent ? container(await ctx.node(op.parent, `${label}.parent`), label) : undefined;
      return { restored: await restoreNodes(nodes, parent) };
    }
    case 'place-image': {
      const nodes = await idsOf(op, ctx, i);
      const img = op.src ? assets?.images?.[op.src] : undefined;
      if (!img?.data) throw badRequest(`${label}: image "${op.src ?? ''}" was not loaded (absolute path or URL; PNG/JPG/GIF).`);
      for (const n of nodes) if (n.type !== 'FRAME' && n.type !== 'RECTANGLE') throw badRequest(`${label}: place images into a frame or rectangle ("${n.name}" is a ${n.type.toLowerCase()}).`);
      return placeImage({ ids: nodes.map((n) => n.id), imageData: img.data, fit: op.fit });
    }
    case 'move': {
      const nodes = await idsOf(op, ctx, i);
      const parent = op.parent ? container(await ctx.node(op.parent, `${label}.parent`), label) : null;
      for (const n of nodes) {
        if (parent) {
          if (op.index !== undefined) parent.insertChild(Math.min(op.index, parent.children.length), n);
          else parent.appendChild(n);
        } else if (op.index !== undefined && n.parent && 'insertChild' in n.parent) {
          (n.parent as ChildrenMixin).insertChild(Math.min(op.index, (n.parent as ChildrenMixin).children.length - 1), n);
        }
        if (op.x !== undefined) n.x = op.x;
        if (op.y !== undefined) n.y = op.y;
        touched.push(n);
      }
      keepChromeOnTop(mockupScreenOf(parent ?? nodes[0]?.parent ?? null));
      return { ids: nodes.map((n) => n.id) };
    }
    case 'duplicate': {
      const [n] = await idsOf(op, ctx, i);
      const count = Math.max(1, Math.min(op.count ?? 1, 50));
      const parent = op.parent ? container(await ctx.node(op.parent, `${label}.parent`), label) : (n.parent as BaseNode & ChildrenMixin);
      const copies: SceneNode[] = [];
      for (let k = 0; k < count; k++) {
        const c = n.clone();
        if (op.index !== undefined) parent.insertChild(Math.min(op.index + k, parent.children.length), c);
        else if (parent === n.parent) parent.insertChild(parent.children.indexOf(n) + 1 + k, c);
        else parent.appendChild(c);
        if (!isAutoLayout(parent)) {
          if (op.x !== undefined) c.x = op.x;
          else if (parent.type === 'PAGE' || parent.type === 'SECTION') c.x = n.x + (n.width + (op.gap ?? 80)) * (k + 1);
          if (op.y !== undefined) c.y = op.y;
        }
        copies.push(c);
        touched.push(c);
      }
      if (op.ref) ctx.refs.set(op.ref, copies[0]);
      return { ids: copies.map((c) => c.id) };
    }
    case 'insert': {
      if (!op.parent) throw badRequest(`${label}: needs "parent".`);
      const parent = container(await ctx.node(op.parent, `${label}.parent`), label);
      const issues = newIssues();
      const spec = normalizeSpec(op.spec ?? op.props ?? {}, `${label}.spec`, issues);
      issues.errors.push(...applyAssets(spec, assets));
      if (issues.errors.length) throw badRequest(issues.errors.join('; '));
      ctx.warnings.push(...issues.warnings);
      await preflight(spec, ctx, { font: {} });
      const node = await buildNode(spec, parent, { font: {} }, ctx, label, { index: op.index, opts: { focus: false } });
      keepChromeOnTop(mockupScreenOf(parent));
      if (op.ref) ctx.refs.set(op.ref, node);
      touched.push(node);
      return summarize(node);
    }
    case 'wrap': {
      const nodes = await idsOf(op, ctx, i);
      const parent = nodes[0].parent as BaseNode & ChildrenMixin;
      if (!parent || nodes.some((n) => n.parent !== parent)) throw badRequest(`${label}: all layers must share the same parent.`);
      const index = Math.min(...nodes.map((n) => parent.children.indexOf(n)));
      const issues = newIssues();
      const spec: Spec = normalizeSpec({ type: 'frame', ...((op.spec ?? op.props ?? {}) as object) }, `${label}.spec`, issues);
      issues.errors.push(...applyAssets(spec, assets));
      if (issues.errors.length) throw badRequest(issues.errors.join('; '));
      delete spec.children;
      const minX = Math.min(...nodes.map((n) => n.x));
      const minY = Math.min(...nodes.map((n) => n.y));
      await preflight(spec, ctx, { font: {} });
      const frame = (await buildNode(spec, parent, { font: {} }, ctx, label, { index, opts: { focus: false } })) as FrameNode;
      const ordered = [...nodes].sort((a, b) => (frame.layoutMode === 'HORIZONTAL' ? a.x - b.x : a.y - b.y));
      for (const n of ordered) frame.appendChild(n);
      if (!isAutoLayout(parent)) {
        frame.x = minX;
        frame.y = minY;
      }
      if (op.ref) ctx.refs.set(op.ref, frame);
      touched.push(frame);
      return summarize(frame);
    }
    case 'unwrap': {
      const [n] = await idsOf(op, ctx, i);
      if (!('children' in n) || n.type === 'INSTANCE') throw badRequest(`${label}: only frames/groups can be unwrapped.`);
      const parent = n.parent as BaseNode & ChildrenMixin;
      const index = parent.children.indexOf(n);
      const kids = [...(n as ChildrenMixin).children];
      const abs = kids.map((k) => ({ k, x: k.absoluteTransform[0][2], y: k.absoluteTransform[1][2] }));
      kids.forEach((k, j) => parent.insertChild(index + j, k));
      if (!isAutoLayout(parent)) {
        const t = parent.type === 'PAGE' ? null : (parent as unknown as SceneNode).absoluteTransform;
        const px = t ? t[0][2] : 0;
        const py = t ? t[1][2] : 0;
        for (const a of abs) {
          a.k.x = a.x - px;
          a.k.y = a.y - py;
        }
      }
      if (!n.removed) n.remove();
      return { ids: kids.map((k) => k.id) };
    }
    case 'swap': {
      const [n] = await idsOf(op, ctx, i);
      if (n.type !== 'INSTANCE') throw badRequest(`${label}: only instances can be swapped.`);
      const c = await ctx.component(op.component ?? '');
      let comp: ComponentNode;
      if (c.type === 'COMPONENT_SET') {
        const want = op.variant ?? {};
        const variants = c.children as ComponentNode[];
        comp = variants.find((v) => Object.entries(want).every(([k, val]) => v.variantProperties?.[k]?.toLowerCase() === val.toLowerCase())) ?? c.defaultVariant ?? variants[0];
      } else comp = c;
      await ctx.loadFontsIn(n);
      n.swapComponent(comp);
      touched.push(n);
      return { id: n.id, component: comp.name };
    }
    case 'detach': {
      const nodes = await idsOf(op, ctx, i);
      const out = [];
      for (const n of nodes) {
        if (n.type !== 'INSTANCE') throw badRequest(`${label}: ${n.id} is not an instance.`);
        out.push(n.detachInstance().id);
      }
      return { ids: out, note: 'detached frames have new ids' };
    }
    case 'reset': {
      const nodes = await idsOf(op, ctx, i);
      for (const n of nodes) if (n.type === 'INSTANCE') n.resetOverrides();
      return { ids: nodes.map((n) => n.id) };
    }
    case 'to-component': {
      // The main component goes to the Components page's board (its category); an instance takes its place in the design.
      const nodes = await idsOf(op, ctx, i);
      const out = [];
      for (const n of nodes) {
        const twin = await ctx.localComponentNamed(op.name ?? n.name);
        if (twin) ctx.warn(`${label}: a component named "${twin.name}" already exists (${twin.id}) — swap instances to it rather than keeping two.`);
        const c = figma.createComponentFromNode(n);
        if (op.name) c.name = op.name;
        ctx.registerComponent(c);
        if (op.ref) ctx.refs.set(op.ref, c);
        let instance: InstanceNode | undefined;
        const home = (await rolePage('components')).page;
        if (!op.keepInPlace && pageOf(c) !== home && c.parent) {
          const parent = c.parent as BaseNode & ChildrenMixin;
          const idx = parent.children.indexOf(c);
          const sizing = { h: c.layoutSizingHorizontal, v: c.layoutSizingVertical, pos: c.layoutPositioning, grow: c.layoutGrow, align: c.layoutAlign, x: c.x, y: c.y, constraints: c.constraints };
          instance = c.createInstance();
          parent.insertChild(idx, instance);
          if (sizing.pos === 'ABSOLUTE') instance.layoutPositioning = 'ABSOLUTE';
          if (!isAutoLayout(parent) || sizing.pos === 'ABSOLUTE') {
            instance.x = sizing.x;
            instance.y = sizing.y;
            if (parent.type !== 'PAGE' && parent.type !== 'SECTION') instance.constraints = sizing.constraints;
          } else {
            instance.layoutAlign = sizing.align;
            instance.layoutGrow = sizing.grow;
          }
          if (isAutoLayout(parent) || isAutoLayout(instance)) {
            instance.layoutSizingHorizontal = sizing.h;
            instance.layoutSizingVertical = sizing.v;
          }
          (await componentHome(c.name)).appendChild(c);
          if (c.layoutSizingHorizontal === 'FILL') c.layoutSizingHorizontal = 'FIXED';
          if (c.layoutSizingVertical === 'FILL') c.layoutSizingVertical = 'FIXED';
        }
        out.push({ id: c.id, name: c.name, key: c.key, page: pageOf(c)?.name, ...(instance ? { instance: instance.id } : {}) });
      }
      return { components: out };
    }
    case 'combine-variants': {
      const nodes = await idsOf(op, ctx, i);
      if (nodes.some((n) => n.type !== 'COMPONENT')) throw badRequest(`${label}: every layer must be a component named like "Prop=Value".`);
      const parent = nodes[0].parent as BaseNode & ChildrenMixin;
      const set = figma.combineAsVariants(nodes as ComponentNode[], parent);
      if (op.name) set.name = op.name;
      let x = 24;
      for (const c of set.children) {
        c.x = x;
        c.y = 24;
        x += c.width + 24;
      }
      set.resizeWithoutConstraints(x, Math.max(...set.children.map((c) => c.height)) + 48);
      if (op.ref) ctx.refs.set(op.ref, set);
      return { id: set.id, name: set.name, key: set.key };
    }
    case 'select': {
      const nodes = await idsOf(op, ctx, i);
      const page = pageOf(nodes[0]);
      if (page && page !== figma.currentPage) await figma.setCurrentPageAsync(page);
      figma.currentPage.selection = nodes;
      if (op.zoom !== false) figma.viewport.scrollAndZoomIntoView(nodes);
      return { selected: nodes.map((n) => n.id) };
    }
    case 'page': {
      const name = op.name ?? op.id ?? '';
      let page = figma.root.children.find((pg) => pg.id === name || pg.name.toLowerCase() === name.toLowerCase());
      let created = false;
      if (!page) {
        if (!op.create) throw badRequest(`${label}: no page "${name}" (pass create: true). Pages: ${figma.root.children.map((x) => x.name).join(', ')}.`);
        const r = await ensurePage(name); // reuses an untouched "Page 1" instead of leaving it empty
        page = r.page;
        created = r.created;
      }
      await figma.setCurrentPageAsync(page);
      if (op.background !== undefined) {
        const c = parseColor(String(op.background));
        if (!c) throw badRequest(`${label}.background: "${op.background}" is not a color (e.g. "#D4D4D8").`);
        setCanvas(page, { r: c.r, g: c.g, b: c.b });
      }
      return { page: { id: page.id, name: page.name }, created };
    }
    case 'group': {
      const nodes = await idsOf(op, ctx, i);
      const parent = nodes[0].parent as BaseNode & ChildrenMixin;
      const g = figma.group(nodes, parent);
      if (op.name) g.name = op.name;
      if (op.ref) ctx.refs.set(op.ref, g);
      return { id: g.id };
    }
    case 'ungroup': {
      const nodes = await idsOf(op, ctx, i);
      const out: string[] = [];
      for (const n of nodes) {
        if (n.type !== 'GROUP') throw badRequest(`${label}: ${n.id} is not a group.`);
        out.push(...figma.ungroup(n).map((c) => c.id));
      }
      return { ids: out };
    }
    case 'flatten': {
      const nodes = await idsOf(op, ctx, i);
      const v = figma.flatten(nodes);
      if (op.name) v.name = op.name;
      return { id: v.id };
    }
    case 'boolean': {
      const nodes = await idsOf(op, ctx, i);
      const parent = nodes[0].parent as BaseNode & ChildrenMixin;
      const fn = { union: figma.union, subtract: figma.subtract, intersect: figma.intersect, exclude: figma.exclude }[op.operation ?? 'union'];
      // Like the editor: the result keeps the bottom shape's paint.
      const first = nodes[0] as SceneNode & Partial<GeometryMixin>;
      const fills = Array.isArray(first.fills) ? JSON.parse(JSON.stringify(first.fills)) : null;
      const b = fn.call(figma, nodes, parent);
      if (fills && fills.length) b.fills = fills;
      if (op.name) b.name = op.name;
      return { id: b.id };
    }
  }
  throw badRequest(`${label}: unknown op.`);
}
