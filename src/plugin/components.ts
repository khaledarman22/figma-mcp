// create_component: a component, or a component set generated from variant axes + patches,
// with TEXT/BOOLEAN/INSTANCE_SWAP properties and interactive-component wiring.

import { applyAssets, expandVariants, interactions as normalizeInteractions, newIssues, normalizeSpec, type AssetMap, type Spec, type VariantsInput } from '../shared/spec.ts';
import { build, buildNode, defineComponentProps, preflight, summarize } from './build.ts';
import { Ctx } from './ctx.ts';
import { pageOf } from './inspect.ts';
import { ensurePage, fitSections, freeSpot, rolePage } from './pages.ts';
import { badRequest } from './errors.ts';
import { applyPendingInteractions, toReaction } from './prototype.ts';
import type { Inherit } from './text.ts';

export interface CreateComponentParams {
  name: string;
  spec: unknown;
  props?: Record<string, unknown>;
  variants?: VariantsInput;
  /** Interactive components: e.g. {from: {State: "Default"}, trigger: "hover", to: {State: "Hover"}}. */
  interactions?: Array<{ from?: Record<string, string | string[]>; trigger?: unknown; to: Record<string, string>; transition?: unknown }>;
  description?: string;
  parentId?: string;
  /** Page for the component (default: the Components page, created on first use). */
  page?: string;
  allowDuplicate?: boolean;
  x?: number;
  y?: number;
  gap?: number;
  focus?: boolean;
  assets?: AssetMap;
}

/** Components live on the Components page unless the call says otherwise. */
async function componentParent(p: CreateComponentParams): Promise<string | undefined> {
  if (p.parentId) return p.parentId;
  const { page } = p.page ? await ensurePage(p.page) : await rolePage('components');
  return page.id;
}

const matches = (props: Record<string, string>, cond: Record<string, string | string[]> = {}) =>
  Object.entries(cond).every(([k, v]) => (Array.isArray(v) ? v.map(String).includes(props[k]) : String(v) === props[k]));

function layoutVariantGrid(set: ComponentSetNode, axes: string[], gap: number) {
  const variants = set.children as ComponentNode[];
  const last = axes[axes.length - 1];
  const rowKey = (v: ComponentNode) => axes.slice(0, -1).map((a) => v.variantProperties?.[a] ?? '').join('|');
  const rows: string[] = [];
  const cols: string[] = [];
  for (const v of variants) {
    const r = rowKey(v);
    const c = v.variantProperties?.[last] ?? '';
    if (!rows.includes(r)) rows.push(r);
    if (!cols.includes(c)) cols.push(c);
  }
  const colW = cols.map((c) => Math.max(...variants.filter((v) => (v.variantProperties?.[last] ?? '') === c).map((v) => v.width)));
  const rowH = rows.map((r) => Math.max(...variants.filter((v) => rowKey(v) === r).map((v) => v.height)));
  const pad = gap;
  for (const v of variants) {
    const ci = cols.indexOf(v.variantProperties?.[last] ?? '');
    const ri = rows.indexOf(rowKey(v));
    v.x = pad + colW.slice(0, ci).reduce((a, b) => a + b + gap, 0);
    v.y = pad + rowH.slice(0, ri).reduce((a, b) => a + b + gap, 0);
  }
  let maxX = 0;
  let maxY = 0;
  for (const v of variants) {
    maxX = Math.max(maxX, v.x + v.width);
    maxY = Math.max(maxY, v.y + v.height);
  }
  set.resizeWithoutConstraints(maxX + pad, maxY + pad);
}

export async function createComponent(p: CreateComponentParams) {
  if (!p.name) throw badRequest('name is required.');
  if (/[=,]/.test(p.name)) throw badRequest('Component names cannot contain "=" or ",".');
  const issues = newIssues();

  // ── single component ──
  if (!p.variants) {
    const spec = normalizeSpec(p.spec ?? {}, 'spec', issues);
    issues.errors.push(...applyAssets(spec, p.assets));
    if (issues.errors.length) throw badRequest(issues.errors.join('\n'));
    spec.type = 'component';
    spec.name = p.name;
    if (p.description) spec.description = p.description;
    if (p.props) spec.props = p.props as Spec['props'];
    const res = await build(spec, { parentId: await componentParent(p), x: p.x, y: p.y, focus: p.focus, switchPage: false, allowDuplicate: p.allowDuplicate });
    const node = (await figma.getNodeByIdAsync(res.root.id)) as ComponentNode;
    return {
      component: { ...res.root, key: node.key, page: res.page },
      properties: Object.keys(node.componentPropertyDefinitions),
      ids: res.ids,
      warnings: [...issues.warnings, ...res.warnings],
    };
  }

  // ── component set from axes ──
  const expanded = expandVariants(p.spec, p.variants, issues);
  const specs: Spec[] = expanded.map((v, i) => {
    const s = normalizeSpec(v.spec, `variants[${i}] (${v.name})`, issues);
    issues.errors.push(...applyAssets(s, p.assets));
    s.type = 'component';
    s.name = v.name;
    delete s.props;
    return s;
  });
  if (issues.errors.length) throw badRequest(`Nothing was created — fix these first:\n- ${[...new Set(issues.errors)].join('\n- ')}`);

  const ctx = new Ctx();
  const inh: Inherit = { font: {} };
  const n = await ctx.node((await componentParent(p))!, 'parentId');
  if (!('appendChild' in n)) throw badRequest(`parentId: a ${n.type.toLowerCase()} cannot contain layers.`);
  if (n.type === 'PAGE') await (n as PageNode).loadAsync();
  const parent = n as BaseNode & ChildrenMixin;
  const twin = parent.children.find((c) => c.name.trim().toLowerCase() === p.name.trim().toLowerCase());
  if (twin && !p.allowDuplicate) {
    throw badRequest(`"${twin.name}" already exists on "${parent.name}" (${twin.id}). Update that component (edit its variants, or edit {op: "delete"} it first — it goes to the Trash page) instead of making a second one.`);
  }
  await preflight(specs[0], ctx, inh);
  const spot = p.x === undefined && p.y === undefined && (parent.type === 'PAGE' || parent.type === 'SECTION') ? freeSpot(parent) : { x: p.x ?? 0, y: p.y ?? 0 };

  const comps: ComponentNode[] = [];
  let set: ComponentSetNode | undefined;
  try {
    for (let i = 0; i < specs.length; i++) {
      const node = await buildNode(specs[i], parent, inh, ctx, `variants[${i}] (${specs[i].name})`, { opts: { focus: false } });
      comps.push(node as ComponentNode);
    }
    set = figma.combineAsVariants(comps, parent);
    set.name = p.name;
    if (p.description) set.description = p.description;
    layoutVariantGrid(set, Object.keys(p.variants.axes), p.gap ?? 24);
    set.x = spot.x;
    set.y = spot.y;
    ctx.registerComponent(set);

    const keys = p.props ? await defineComponentProps(set, p.props, ctx, 'props') : {};
    if (ctx.binds.length) {
      for (const b of ctx.binds) ctx.warn(`${b.path}.bind: "${JSON.stringify(b.bind)}" has no matching entry in props; ignored.`);
      ctx.binds = [];
    }

    // Interactions declared inside variant specs (e.g. change-to "State=Hover").
    await applyPendingInteractions(ctx);

    // Interactive components: rules between variants.
    let wired = 0;
    for (const [ri, rule] of (p.interactions ?? []).entries()) {
      const ruleIssues = newIssues();
      const [base] = normalizeInteractions({ trigger: rule.trigger ?? 'hover', changeTo: 'x', transition: rule.transition }, `interactions[${ri}]`, ruleIssues);
      if (ruleIssues.errors.length) throw badRequest(ruleIssues.errors.join('\n'));
      for (const v of set.children as ComponentNode[]) {
        const props = v.variantProperties ?? {};
        if (!matches(props, rule.from)) continue;
        const want = { ...props, ...rule.to };
        const target = (set.children as ComponentNode[]).find((c) => Object.entries(want).every(([k, val]) => c.variantProperties?.[k] === val));
        if (!target || target === v) continue;
        const reaction = await toReaction({ ...base, actions: [{ ...base.actions[0], kind: 'change-to', to: target.id }] }, v, ctx, `interactions[${ri}]`);
        await v.setReactionsAsync([...v.reactions, reaction]);
        wired++;
      }
    }

    const home = pageOf(set);
    if (home) fitSections(home);
    if (p.focus !== false && home === figma.currentPage) {
      figma.currentPage.selection = [set];
      figma.viewport.scrollAndZoomIntoView([set]);
    }
    const ids: Record<string, string> = {};
    for (const [ref, n] of ctx.refs) ids[ref] = n.id;
    return {
      componentSet: { ...summarize(set), key: set.key, page: pageOf(set)?.name },
      variants: comps.map((c) => ({ id: c.id, name: c.name })),
      properties: Object.keys(set.componentPropertyDefinitions),
      propertyKeys: keys,
      interactiveLinks: wired,
      warnings: [...issues.warnings, ...ctx.warnings],
    };
  } catch (e) {
    try {
      if (set && !set.removed) set.remove();
      else for (const c of comps) if (!c.removed) c.remove();
      for (const n of ctx.created) if (!n.removed && n.parent?.type === 'PAGE' && n.getPluginData('role') !== 'icons') n.remove();
    } catch {
      /* best effort */
    }
    throw e;
  }
}
