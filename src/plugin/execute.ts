// execute: run agent-written Plugin API code with a small helper kit (`h`).
// Uses indirect eval of an async function expression — the form reported to work in Figma's
// sandbox (the AsyncFunction constructor is not reliable there).

import { parseColor, toHex } from '../shared/color.ts';
import { newIssues, normalizeSpec } from '../shared/spec.ts';
import { build } from './build.ts';
import { Ctx } from './ctx.ts';
import { badRequest } from './errors.ts';
import { nodeDetails } from './inspect.ts';
import { ensurePage, freeSpot, trashNodes } from './pages.ts';
import { applyProps } from './props.ts';

function isNode(v: unknown): v is BaseNode {
  return !!v && typeof v === 'object' && 'id' in v && 'type' in v && typeof (v as BaseNode).type === 'string' && 'removed' in v;
}

/** JSON-safe copy of whatever the script returned (nodes become {id, name, type}). */
export function toPlain(v: unknown, depth = 0, seen = new Set<unknown>()): unknown {
  if (v === null || v === undefined || typeof v === 'boolean' || typeof v === 'number') return v;
  if (typeof v === 'string') return v.length > 20000 ? v.slice(0, 20000) + '…(truncated)' : v;
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'function') return '[function]';
  if (typeof v === 'symbol') return v === figma.mixed ? '[mixed]' : String(v);
  if (isNode(v)) return v.removed ? { id: v.id, removed: true } : { id: v.id, name: v.name, type: v.type };
  if (v instanceof Uint8Array) return `[${v.length} bytes]`;
  if (depth > 6) return '[…]';
  if (typeof v === 'object') {
    if (seen.has(v)) return '[circular]';
    seen.add(v);
    if (Array.isArray(v)) {
      const arr = v.slice(0, 500).map((x) => toPlain(x, depth + 1, seen));
      if (v.length > 500) arr.push(`…(${v.length - 500} more)`);
      return arr;
    }
    if (v instanceof Map) return toPlain(Object.fromEntries(v), depth + 1, seen);
    if (v instanceof Set) return toPlain([...v], depth + 1, seen);
    if (v instanceof Error) return { error: v.message };
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = toPlain(val, depth + 1, seen);
    return out;
  }
  return String(v);
}

function fmt(a: unknown): string {
  if (typeof a === 'string') return a;
  try {
    return JSON.stringify(toPlain(a));
  } catch {
    return String(a);
  }
}

function helpers(ctx: Ctx, logs: string[]) {
  const node = async (idOrNode: string | SceneNode) => (typeof idOrNode === 'string' ? ctx.sceneNode(idOrNode) : idOrNode);
  return {
    /** await h.node("12:34") — throws a clear error if missing (never hangs). */
    node,
    /** Declarative build, same spec as the build tool (icons/images need the build tool). */
    build: async (spec: unknown, opts: Record<string, unknown> = {}) => {
      const issues = newIssues();
      const s = normalizeSpec(spec, 'spec', issues);
      if (issues.errors.length) throw badRequest(issues.errors.join('\n'));
      return build(s, { focus: false, ...opts }, ctx);
    },
    /** Apply build-style props to an existing node: await h.set(node, {fill: "$color/bg", pad: 16}). */
    set: async (target: string | SceneNode, props: unknown) => {
      const issues = newIssues();
      const s = normalizeSpec(props, 'props', issues, { partial: true });
      if (issues.errors.length) throw badRequest(issues.errors.join('\n'));
      const n = await node(target);
      await applyProps(n, s, { font: {} }, ctx, 'props', { isNew: false });
      return n;
    },
    loadFonts: async (target: string | SceneNode) => ctx.loadFontsIn(await node(target)),
    font: async (family: string, weight?: number, italic?: boolean) => {
      const f = await ctx.resolveFont(family, weight, italic);
      await ctx.loadFont(f);
      return f;
    },
    variable: (name: string) => ctx.variable(name),
    component: (name: string) => ctx.component(name),
    style: (name: string, type: 'PAINT' | 'TEXT' | 'EFFECT' | 'GRID') => ctx.style(name, type),
    /** h.solid("#2563EB", 0.5) → SolidPaint */
    solid: (color: string, opacity?: number): SolidPaint => {
      const c = parseColor(color);
      if (!c) throw badRequest(`bad color ${color}`);
      return { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: opacity ?? c.a };
    },
    hex: (c: RGB | RGBA) => toHex(c),
    /** Bind a COLOR variable as the node's only fill. */
    bindFill: async (target: string | SceneNode, varName: string) => {
      const n = (await node(target)) as SceneNode & MinimalFillsMixin;
      const v = await ctx.variable(varName, 'COLOR');
      const val = (await ctx.resolveVariableValue(v)) as RGBA;
      n.fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: val.r, g: val.g, b: val.b } }, 'color', v)];
      return n;
    },
    /** Bind a FLOAT variable to a numeric field (itemSpacing, paddingLeft, topLeftRadius, width…). */
    bind: async (target: string | SceneNode, field: VariableBindableNodeField, varName: string) => {
      const n = await node(target);
      n.setBoundVariable(field, await ctx.variable(varName));
      return n;
    },
    focus: (nodes: SceneNode | SceneNode[]) => {
      const list = Array.isArray(nodes) ? nodes : [nodes];
      figma.currentPage.selection = list;
      figma.viewport.scrollAndZoomIntoView(list);
    },
    /** Move a top-level node to free canvas space (right of existing content). */
    place: (n: SceneNode) => {
      const spot = freeSpot(figma.currentPage, n);
      n.x = spot.x;
      n.y = spot.y;
      return n;
    },
    inspect: async (target: string | SceneNode) => nodeDetails(await node(target)),
    /** Delete the way the user wants: move to the Trash page (restorable). Never node.remove() user content. */
    trash: async (targets: string | SceneNode | Array<string | SceneNode>) => {
      const list = Array.isArray(targets) ? targets : [targets];
      return trashNodes(await Promise.all(list.map((t) => node(t))));
    },
    /** A page by English name, created on first use (reuses an untouched "Page 1"); switches to it. */
    page: async (name: string) => {
      const { page } = await ensurePage(name);
      if (page !== figma.currentPage) await figma.setCurrentPageAsync(page);
      return page;
    },
    log: (...a: unknown[]) => {
      logs.push(a.map(fmt).join(' '));
    },
  };
}

export async function execute(p: { code: string; params?: unknown; timeoutMs?: number }) {
  if (typeof p.code !== 'string' || !p.code.trim()) throw badRequest('code is empty.');
  const ctx = new Ctx();
  const logs: string[] = [];
  const h = helpers(ctx, logs);
  const shim = {
    log: (...a: unknown[]) => logs.push(a.map(fmt).join(' ')),
    info: (...a: unknown[]) => logs.push(a.map(fmt).join(' ')),
    warn: (...a: unknown[]) => logs.push('warn: ' + a.map(fmt).join(' ')),
    error: (...a: unknown[]) => logs.push('error: ' + a.map(fmt).join(' ')),
  };
  let fn: (figma: PluginAPI, h: unknown, console: unknown, params: unknown) => Promise<unknown>;
  try {
    fn = (0, eval)(`(async function (figma, h, console, params) {\n${p.code}\n})`);
  } catch (e) {
    throw badRequest(`Syntax error: ${e instanceof Error ? e.message : e}. Write plain JavaScript (top-level await and return are fine; no TypeScript).`);
  }
  const timeoutMs = Math.max(1000, Math.min(p.timeoutMs ?? 60_000, 300_000));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Script still running after ${timeoutMs} ms (it may keep running in Figma). Check the canvas before retrying.`)), timeoutMs);
  });
  try {
    const result = await Promise.race([fn(figma, h, shim, p.params ?? {}), timeout]);
    return { result: toPlain(result), logs, warnings: ctx.warnings };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const line = err.stack?.match(/<anonymous>:(\d+):\d+/)?.[1];
    (err as Error & { details?: unknown }).details = { logs, ...(line ? { line: Number(line) - 1 } : {}) };
    throw err;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
