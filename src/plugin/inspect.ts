// Read-only inspection: status, metadata outline, node details, search, fonts, brief.

import { toHex } from '../shared/color.ts';
import { clip, round } from '../shared/util.ts';
import { Ctx, getNodeSafe } from './ctx.ts';
import { badRequest } from './errors.ts';
import { describeReactions } from './prototype.ts';
import { describeEffect } from './styles.ts';

declare const __FIGMA_MCP_VERSION__: string | undefined;
export const PLUGIN_VERSION: string = typeof __FIGMA_MCP_VERSION__ === 'string' ? __FIGMA_MCP_VERSION__ : 'dev';

export function selectionSummary() {
  return figma.currentPage.selection.slice(0, 50).map((n) => ({ id: n.id, name: n.name, type: n.type, w: Math.round(n.width), h: Math.round(n.height) }));
}

export function status() {
  const brief = figma.root.getPluginData('brief');
  return {
    file: { name: figma.root.name, key: figma.fileKey ?? null, editorType: figma.editorType },
    user: figma.currentUser?.name ?? null,
    page: { id: figma.currentPage.id, name: figma.currentPage.name },
    pages: figma.root.children.map((p) => ({ id: p.id, name: p.name })),
    selection: selectionSummary(),
    brief: brief ? clip(brief.split('\n')[0], 120) : null,
    pluginVersion: PLUGIN_VERSION,
  };
}

// ───────────── metadata outline (XML-ish, like Figma's get_metadata) ─────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function layoutAttr(n: SceneNode): string {
  if (!('layoutMode' in n)) return '';
  const f = n as FrameNode;
  if (f.layoutMode === 'NONE') return '';
  const dir = f.layoutMode === 'HORIZONTAL' ? 'row' : f.layoutMode === 'VERTICAL' ? 'column' : 'grid';
  return ` layout="${dir}"`;
}

export async function metadata(p: { nodeId?: string; depth?: number; maxNodes?: number; includeHidden?: boolean }) {
  const ctx = new Ctx();
  const depth = p.depth ?? 4;
  const max = p.maxNodes ?? 600;
  const lines: string[] = [];
  let count = 0;
  let truncated = false;
  const roots: BaseNode[] = [];
  if (p.nodeId) roots.push(await ctx.node(p.nodeId));
  else if (figma.currentPage.selection.length) roots.push(...figma.currentPage.selection);
  else roots.push(figma.currentPage);

  const walk = async (n: BaseNode, d: number, indent: string) => {
    if (count >= max) {
      truncated = true;
      return;
    }
    count++;
    if (n.type === 'PAGE') {
      lines.push(`${indent}<page id="${n.id}" name="${esc(n.name)}" children="${(n as PageNode).children.length}">`);
      for (const c of (n as PageNode).children) await walk(c, d + 1, indent + '  ');
      lines.push(`${indent}</page>`);
      return;
    }
    const s = n as SceneNode;
    if (!s.visible && !p.includeHidden) {
      lines.push(`${indent}<${s.type.toLowerCase()} id="${s.id}" name="${esc(s.name)}" hidden="true"/>`);
      return;
    }
    let attrs = `id="${s.id}" name="${esc(s.name)}" x="${round(s.x, 1)}" y="${round(s.y, 1)}" w="${round(s.width, 1)}" h="${round(s.height, 1)}"${layoutAttr(s)}`;
    if (s.type === 'INSTANCE') {
      const main = await s.getMainComponentAsync();
      const owner = main?.parent?.type === 'COMPONENT_SET' ? main.parent.name : main?.name;
      if (owner) attrs += ` component="${esc(owner)}"`;
      if (main?.parent?.type === 'COMPONENT_SET' && main.variantProperties) attrs += ` variant="${esc(Object.entries(main.variantProperties).map(([k, v]) => `${k}=${v}`).join(', '))}"`;
    }
    if (s.type === 'TEXT') {
      lines.push(`${indent}<text ${attrs}>${esc(clip(s.characters.replace(/\s+/g, ' '), 80))}</text>`);
      return;
    }
    const kids = 'children' in s ? (s as ChildrenMixin).children : [];
    const tag = s.type.toLowerCase();
    if (!kids.length || s.type === 'INSTANCE' && d >= depth) {
      lines.push(`${indent}<${tag} ${attrs}${kids.length ? ` children="${kids.length}"` : ''}/>`);
      return;
    }
    if (d >= depth) {
      lines.push(`${indent}<${tag} ${attrs} children="${kids.length}"/>`);
      return;
    }
    lines.push(`${indent}<${tag} ${attrs}>`);
    for (const c of kids) await walk(c, d + 1, indent + '  ');
    lines.push(`${indent}</${tag}>`);
  };
  for (const r of roots) await walk(r, 0, '');
  return { xml: lines.join('\n'), nodes: count, truncated, page: { id: figma.currentPage.id, name: figma.currentPage.name } };
}

// ───────────── node details ─────────────

async function varLabel(alias: VariableAlias | VariableAlias[] | undefined, cache: Map<string, string>): Promise<string | undefined> {
  if (!alias) return undefined;
  const a = Array.isArray(alias) ? alias[0] : alias;
  if (!a) return undefined;
  if (cache.has(a.id)) return cache.get(a.id);
  const v = await figma.variables.getVariableByIdAsync(a.id);
  const label = v ? `$${v.name}` : `$${a.id}`;
  cache.set(a.id, label);
  return label;
}

async function paintsOut(paints: ReadonlyArray<Paint> | typeof figma.mixed, cache: Map<string, string>): Promise<unknown> {
  if (paints === figma.mixed) return 'mixed';
  const out = [];
  for (const p of paints) {
    if (p.visible === false) continue;
    if (p.type === 'SOLID') {
      const v = await varLabel(p.boundVariables?.color, cache);
      out.push(v ? `${v} (${toHex(p.color, p.opacity ?? 1)})` : toHex(p.color, p.opacity ?? 1));
    } else if (p.type === 'IMAGE') out.push({ image: p.imageHash, fit: p.scaleMode.toLowerCase() });
    else if (p.type.startsWith('GRADIENT')) {
      const g = p as GradientPaint;
      out.push({ gradient: p.type.replace('GRADIENT_', '').toLowerCase(), stops: g.gradientStops.map((s) => `${toHex(s.color, s.color.a)} ${round(s.position * 100, 0)}%`) });
    } else out.push(p.type.toLowerCase());
  }
  return out;
}

async function styleName(id: string | typeof figma.mixed | undefined): Promise<string | undefined> {
  if (!id || id === figma.mixed) return id === figma.mixed ? 'mixed' : undefined;
  const s = await figma.getStyleByIdAsync(id);
  return s ? `@${s.name}` : undefined;
}

export async function nodeDetails(n: SceneNode, cache = new Map<string, string>()): Promise<Record<string, unknown>> {
  const o: Record<string, unknown> = {
    id: n.id,
    name: n.name,
    type: n.type,
    x: round(n.x, 1),
    y: round(n.y, 1),
    w: round(n.width, 1),
    h: round(n.height, 1),
  };
  if (!n.visible) o.visible = false;
  if (n.locked) o.locked = true;
  if (n.parent) o.parent = { id: n.parent.id, name: n.parent.name, type: n.parent.type };
  if ('rotation' in n && n.rotation) o.rotation = round(n.rotation, 1);
  if ('opacity' in n && n.opacity !== 1) o.opacity = round(n.opacity, 3);
  const bv = (n as SceneNode & { boundVariables?: Record<string, VariableAlias | VariableAlias[]> }).boundVariables ?? {};
  const vars: Record<string, string> = {};
  for (const [field, alias] of Object.entries(bv)) {
    if (field === 'fills' || field === 'strokes' || field === 'effects' || field === 'componentProperties' || field === 'textRangeFills') continue;
    const l = await varLabel(alias as VariableAlias, cache);
    if (l) vars[field] = l;
  }
  if (Object.keys(vars).length) o.variables = vars;

  if ('layoutMode' in n) {
    const f = n as FrameNode;
    if (f.layoutMode !== 'NONE') {
      o.layout = {
        dir: f.layoutMode === 'HORIZONTAL' ? 'row' : f.layoutMode === 'VERTICAL' ? 'column' : 'grid',
        gap: f.layoutMode === 'GRID' ? { row: f.gridRowGap, col: f.gridColumnGap } : f.primaryAxisAlignItems === 'SPACE_BETWEEN' ? 'auto' : f.itemSpacing,
        pad: [f.paddingTop, f.paddingRight, f.paddingBottom, f.paddingLeft],
        justify: f.layoutMode === 'GRID' ? undefined : f.primaryAxisAlignItems.toLowerCase().replace('min', 'start').replace('max', 'end').replace('space_between', 'between'),
        align: f.layoutMode === 'GRID' ? undefined : f.counterAxisAlignItems.toLowerCase().replace('min', 'start').replace('max', 'end'),
        wrap: f.layoutWrap === 'WRAP' || undefined,
        rowGap: f.layoutWrap === 'WRAP' ? f.counterAxisSpacing : undefined,
        cols: f.layoutMode === 'GRID' ? f.gridColumnCount : undefined,
        rows: f.layoutMode === 'GRID' ? f.gridRowCount : undefined,
      };
    }
    if (f.clipsContent) o.clip = true;
    if (f.overflowDirection && f.overflowDirection !== 'NONE') o.scroll = f.overflowDirection.toLowerCase();
  }
  if (n.parent && 'layoutMode' in n.parent && (n.parent as FrameNode).layoutMode !== 'NONE') {
    const c = n as FrameNode;
    o.sizing = { w: c.layoutSizingHorizontal.toLowerCase(), h: c.layoutSizingVertical.toLowerCase() };
    if (c.layoutPositioning === 'ABSOLUTE') o.absolute = true;
  } else if ('layoutMode' in n && (n as FrameNode).layoutMode !== 'NONE') {
    const c = n as FrameNode;
    o.sizing = { w: c.layoutSizingHorizontal.toLowerCase(), h: c.layoutSizingVertical.toLowerCase() };
  }
  if ('constraints' in n && !(n.parent && 'layoutMode' in n.parent && (n.parent as FrameNode).layoutMode !== 'NONE')) {
    const c = (n as ConstraintMixin).constraints;
    o.constraints = { h: c.horizontal.toLowerCase(), v: c.vertical.toLowerCase() };
  }
  if ('minWidth' in n) {
    const m = n as FrameNode;
    const mm: Record<string, number> = {};
    if (m.minWidth != null) mm.minW = m.minWidth;
    if (m.maxWidth != null) mm.maxW = m.maxWidth;
    if (m.minHeight != null) mm.minH = m.minHeight;
    if (m.maxHeight != null) mm.maxH = m.maxHeight;
    if (Object.keys(mm).length) o.minMax = mm;
  }
  if ('fills' in n && n.type !== 'TEXT') {
    const fs = await styleName((n as MinimalFillsMixin).fillStyleId as string);
    const fills = await paintsOut((n as MinimalFillsMixin).fills, cache);
    if (fs) o.fill = fs;
    else if (Array.isArray(fills) ? fills.length : fills) o.fill = fills;
  }
  if ('strokes' in n && (n as MinimalStrokesMixin).strokes.length) {
    const s = n as MinimalStrokesMixin & SceneNode;
    const weight = 'strokeTopWeight' in n && (n as IndividualStrokesMixin).strokeTopWeight !== undefined && (s.strokeWeight === figma.mixed)
      ? [(n as IndividualStrokesMixin).strokeTopWeight, (n as IndividualStrokesMixin).strokeRightWeight, (n as IndividualStrokesMixin).strokeBottomWeight, (n as IndividualStrokesMixin).strokeLeftWeight]
      : s.strokeWeight;
    o.stroke = { color: (await styleName(s.strokeStyleId)) ?? (await paintsOut(s.strokes, cache)), weight, align: s.strokeAlign.toLowerCase(), dash: s.dashPattern.length ? s.dashPattern : undefined };
  }
  if ('cornerRadius' in n) {
    const r = (n as CornerMixin).cornerRadius;
    if (r === figma.mixed && 'topLeftRadius' in n) {
      const c = n as RectangleCornerMixin;
      o.radius = [c.topLeftRadius, c.topRightRadius, c.bottomRightRadius, c.bottomLeftRadius];
    } else if (r) o.radius = r;
  }
  if ('effects' in n && (n as BlendMixin).effects.length) {
    const es = await styleName((n as BlendMixin).effectStyleId);
    o.effects = es ?? (n as BlendMixin).effects.filter((e) => e.visible).map(describeEffect);
  }
  if (n.type === 'TEXT') {
    o.text = clip(n.characters, 2000);
    o.textStyle = await styleName(n.textStyleId as string);
    o.font = n.fontName === figma.mixed ? 'mixed' : `${n.fontName.family} ${n.fontName.style}`;
    o.fontSize = n.fontSize === figma.mixed ? 'mixed' : n.fontSize;
    const lh = n.lineHeight;
    o.lineHeight = lh === figma.mixed ? 'mixed' : lh.unit === 'AUTO' ? 'auto' : lh.unit === 'PERCENT' ? `${round(lh.value, 1)}%` : lh.value;
    const ls = n.letterSpacing;
    o.letterSpacing = ls === figma.mixed ? 'mixed' : ls.unit === 'PERCENT' ? `${round(ls.value, 2)}%` : ls.value;
    o.color = (await styleName(n.fillStyleId as string)) ?? (await paintsOut(n.fills, cache));
    o.textAlign = n.textAlignHorizontal.toLowerCase();
    o.autoResize = n.textAutoResize.toLowerCase();
    if (n.textTruncation === 'ENDING') o.maxLines = n.maxLines;
  }
  if (n.type === 'INSTANCE') {
    const main = await n.getMainComponentAsync();
    const owner = main?.parent?.type === 'COMPONENT_SET' ? main.parent : main;
    o.component = owner ? { id: owner.id, key: owner.key, name: owner.name, remote: owner.remote || undefined, variant: main?.variantProperties ?? undefined } : null;
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n.componentProperties)) if (v.type !== 'VARIANT') props[k.split('#')[0]] = v.value;
    if (Object.keys(props).length) o.props = props;
    if (n.overrides.length) o.overrides = n.overrides.length;
  }
  if (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') {
    o.key = n.key;
    if (n.description) o.description = n.description;
    if (n.type === 'COMPONENT_SET' || n.parent?.type !== 'COMPONENT_SET') {
      const defs = (n as ComponentSetNode).componentPropertyDefinitions;
      o.properties = Object.fromEntries(
        Object.entries(defs).map(([k, d]) => [k.split('#')[0], d.type === 'VARIANT' ? { type: 'variant', options: d.variantOptions, default: d.defaultValue } : { type: d.type.toLowerCase(), default: d.defaultValue }]),
      );
    } else if (n.variantProperties) o.variant = n.variantProperties;
  }
  if ('componentPropertyReferences' in n && n.componentPropertyReferences && Object.keys(n.componentPropertyReferences).length) {
    o.boundProps = Object.fromEntries(Object.entries(n.componentPropertyReferences).map(([k, v]) => [k, String(v).split('#')[0]]));
  }
  if ('explicitVariableModes' in n && Object.keys(n.explicitVariableModes).length) {
    const modes: Record<string, string> = {};
    for (const [collId, modeId] of Object.entries(n.explicitVariableModes)) {
      const c = await figma.variables.getVariableCollectionByIdAsync(collId);
      modes[c?.name ?? collId] = c?.modes.find((m) => m.modeId === modeId)?.name ?? modeId;
    }
    o.modes = modes;
  }
  if ('reactions' in n && (n as ReactionMixin).reactions.length) o.interactions = await describeReactions(n, new Map());
  if ('annotations' in n && (n as FrameNode).annotations?.length) o.annotations = (n as FrameNode).annotations.map((a) => a.label ?? a.labelMarkdown);
  if ('children' in n) {
    const kids = (n as ChildrenMixin).children;
    o.children = kids.slice(0, 60).map((c) => `${c.id} ${c.type.toLowerCase()} "${clip(c.name, 40)}"`);
    if (kids.length > 60) o.moreChildren = kids.length - 60;
  }
  return o;
}

export async function getNodes(p: { ids?: string[] }) {
  const ctx = new Ctx();
  const ids = p.ids?.length ? p.ids : figma.currentPage.selection.map((n) => n.id);
  if (!ids.length) throw badRequest('Pass ids (or select layers in Figma).');
  const cache = new Map<string, string>();
  const out = [];
  for (const id of ids.slice(0, 30)) out.push(await nodeDetails(await ctx.sceneNode(id), cache));
  return { nodes: out };
}

// ───────────── search ─────────────

export async function search(p: { query?: string; types?: string[]; within?: string; in?: 'name' | 'text' | 'both'; limit?: number; allPages?: boolean }) {
  const ctx = new Ctx();
  const limit = p.limit ?? 50;
  const q = (p.query ?? '').toLowerCase();
  const types = (p.types ?? []).map((t) => t.toUpperCase().replace('RECT', 'RECTANGLE').replace('RECTANGLEANGLE', 'RECTANGLE')) as NodeType[];
  const where = p.in ?? 'both';
  let roots: Array<BaseNode & ChildrenMixin> = [figma.currentPage];
  if (p.within) roots = [(await ctx.node(p.within)) as BaseNode & ChildrenMixin];
  else if (p.allPages) {
    await figma.loadAllPagesAsync();
    roots = [...figma.root.children];
  }
  const results: Array<Record<string, unknown>> = [];
  let scanned = 0;
  for (const root of roots) {
    if (!('findAllWithCriteria' in root)) continue;
    const candidates: SceneNode[] = types.length
      ? (root as ChildrenMixin).findAllWithCriteria({ types: types as Array<SceneNode['type']> })
      : (root as ChildrenMixin).findAll(() => true);
    for (const n of candidates) {
      scanned++;
      const nameHit = where !== 'text' && (!q || n.name.toLowerCase().includes(q));
      const textHit = where !== 'name' && n.type === 'TEXT' && q && n.characters.toLowerCase().includes(q);
      if (!nameHit && !textHit) continue;
      const path: string[] = [];
      let par = n.parent;
      while (par && par.type !== 'PAGE' && path.length < 6) {
        path.unshift(par.name);
        par = par.parent;
      }
      results.push({
        id: n.id,
        name: n.name,
        type: n.type,
        page: par?.type === 'PAGE' ? par.name : undefined,
        path: path.join(' / ') || undefined,
        text: n.type === 'TEXT' ? clip(n.characters, 60) : undefined,
      });
      if (results.length >= limit) break;
    }
    if (results.length >= limit) break;
  }
  return { results, scanned, more: results.length >= limit };
}

export async function fonts(p: { query?: string; limit?: number }) {
  const ctx = new Ctx();
  const list = await ctx.listFonts(p.query);
  return { families: list.slice(0, p.limit ?? 40).map((f) => ({ family: f.family, styles: f.styles })), total: list.length };
}

export async function brief(p: { action?: 'get' | 'set' | 'append'; text?: string }) {
  const current = figma.root.getPluginData('brief');
  const action = p.action ?? 'get';
  if (action === 'get') return { brief: current || null };
  if (!p.text) throw badRequest('text is required.');
  const stamp = new Date().toISOString().slice(0, 10);
  const next = action === 'set' ? p.text : `${current ? `${current}\n` : ''}- ${stamp}: ${p.text}`;
  if (next.length > 90_000) throw badRequest('The brief is too long (90k chars max); summarise it with action "set".');
  figma.root.setPluginData('brief', next);
  return { brief: next, length: next.length };
}

export async function navigate(p: { page?: string; select?: string[]; zoom?: boolean }) {
  const ctx = new Ctx();
  if (p.page) {
    const target = figma.root.children.find((pg) => pg.id === p.page || pg.name.toLowerCase() === p.page!.toLowerCase());
    if (!target) throw badRequest(`No page "${p.page}". Pages: ${figma.root.children.map((x) => x.name).join(', ')}.`);
    await figma.setCurrentPageAsync(target);
  }
  if (p.select?.length) {
    const nodes: SceneNode[] = [];
    for (const id of p.select) {
      const n = await getNodeSafe(id);
      if (n && n.type !== 'PAGE' && n.type !== 'DOCUMENT') nodes.push(n as SceneNode);
    }
    if (nodes.length) {
      const page = nodes[0].parent ? pageOf(nodes[0]) : null;
      if (page && page !== figma.currentPage) await figma.setCurrentPageAsync(page);
      figma.currentPage.selection = nodes;
      if (p.zoom !== false) figma.viewport.scrollAndZoomIntoView(nodes);
    }
  }
  void ctx;
  return { page: figma.currentPage.name, selection: selectionSummary() };
}

export function pageOf(n: BaseNode): PageNode | null {
  let p: BaseNode | null = n;
  while (p && p.type !== 'PAGE') p = p.parent;
  return p as PageNode | null;
}
