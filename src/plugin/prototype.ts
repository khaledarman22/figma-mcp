// Prototype interactions: spec → Figma reactions, flows, scrolling; and reading them back.
// Units: Figma's plugin API stores transition durations and trigger delays in SECONDS.

import { parseColor } from '../shared/color.ts';
import { interactions as normalizeInteractions, newIssues, type ActionSpec, type EasingSpec, type InteractionSpec, type TransitionSpec, type TriggerSpec } from '../shared/spec.ts';
import { didYouMean, normalizeNodeId } from '../shared/util.ts';
import { Ctx, getNodeSafe } from './ctx.ts';
import { badRequest, notFound } from './errors.ts';

function toTrigger(t: TriggerSpec): Trigger {
  const delay = (t.delayMs ?? 0) / 1000;
  switch (t.kind) {
    case 'click':
      return { type: 'ON_CLICK' };
    case 'hover':
      return { type: 'ON_HOVER' };
    case 'press':
      return { type: 'ON_PRESS' };
    case 'drag':
      return { type: 'ON_DRAG' };
    case 'mouse-enter':
      return { type: 'MOUSE_ENTER', delay, deprecatedVersion: false };
    case 'mouse-leave':
      return { type: 'MOUSE_LEAVE', delay, deprecatedVersion: false };
    case 'mouse-down':
      return { type: 'MOUSE_DOWN', delay };
    case 'mouse-up':
      return { type: 'MOUSE_UP', delay };
    case 'after':
      return { type: 'AFTER_TIMEOUT', timeout: (t.delayMs ?? 800) / 1000 };
    case 'key':
      return { type: 'ON_KEY_DOWN', device: 'KEYBOARD', keyCodes: t.keyCodes?.length ? t.keyCodes : [13] };
  }
}

function toEasing(e: EasingSpec): Easing {
  switch (e.kind) {
    case 'bezier':
      return { type: 'CUSTOM_CUBIC_BEZIER', easingFunctionCubicBezier: { x1: e.points[0], y1: e.points[1], x2: e.points[2], y2: e.points[3] } };
    case 'spring':
      return { type: 'CUSTOM_SPRING', easingFunctionSpring: { mass: e.mass, stiffness: e.stiffness, damping: e.damping, initialVelocity: 0 } };
    default: {
      const map = {
        linear: 'LINEAR', 'ease-in': 'EASE_IN', 'ease-out': 'EASE_OUT', 'ease-in-out': 'EASE_IN_AND_OUT', 'ease-in-back': 'EASE_IN_BACK',
        'ease-out-back': 'EASE_OUT_BACK', 'ease-in-out-back': 'EASE_IN_AND_OUT_BACK', gentle: 'GENTLE', quick: 'QUICK', bouncy: 'BOUNCY', slow: 'SLOW',
      } as const;
      return { type: map[e.kind] };
    }
  }
}

export function toTransition(t: TransitionSpec | null | undefined): Transition | null {
  if (!t) return null;
  const easing = toEasing(t.easing);
  const duration = Math.max(0.001, t.durationMs / 1000);
  if (t.type === 'move-in' || t.type === 'move-out' || t.type === 'push' || t.type === 'slide-in' || t.type === 'slide-out') {
    const type = ({ 'move-in': 'MOVE_IN', 'move-out': 'MOVE_OUT', push: 'PUSH', 'slide-in': 'SLIDE_IN', 'slide-out': 'SLIDE_OUT' } as const)[t.type];
    const direction = ({ left: 'LEFT', right: 'RIGHT', top: 'TOP', bottom: 'BOTTOM' } as const)[t.direction ?? 'left'];
    return { type, direction, matchLayers: t.matchLayers ?? false, easing, duration };
  }
  const type = ({ dissolve: 'DISSOLVE', 'smart-animate': 'SMART_ANIMATE', 'scroll-animate': 'SCROLL_ANIMATE' } as const)[t.type];
  return { type, easing, duration };
}

/** The top-level frame (screen) that contains a node. */
export function screenOf(node: BaseNode): SceneNode | null {
  let n: BaseNode | null = node;
  while (n && n.parent && n.parent.type !== 'PAGE' && n.parent.type !== 'SECTION') n = n.parent;
  return n && n.type !== 'PAGE' && n.type !== 'DOCUMENT' ? (n as SceneNode) : null;
}

function owningVariant(node: BaseNode): ComponentNode | null {
  let n: BaseNode | null = node;
  while (n) {
    if (n.type === 'COMPONENT' && n.parent?.type === 'COMPONENT_SET') return n;
    n = n.parent;
  }
  return null;
}

/** "State=Hover" (relative to the source's variant) or a node id/ref/name. */
async function resolveDestination(to: string, a: ActionSpec, source: SceneNode, ctx: Ctx, path: string): Promise<SceneNode> {
  if (a.kind === 'change-to' && /=/.test(to) && !/^\d+:\d+$/.test(to)) {
    const variant = owningVariant(source);
    if (!variant || !variant.parent || variant.parent.type !== 'COMPONENT_SET') {
      throw badRequest(`${path}: "change-to ${to}" only works on layers inside a variant of a component set.`);
    }
    const want: Record<string, string> = { ...(variant.variantProperties ?? {}) };
    for (const kv of to.split(',')) {
      const [k, v] = kv.split('=').map((x) => x.trim());
      if (k && v !== undefined) want[k] = v;
    }
    const set = variant.parent;
    const hit = set.children.find((c) => {
      const vp = (c as ComponentNode).variantProperties ?? {};
      return Object.entries(want).every(([k, v]) => (vp[k] ?? '').toLowerCase() === v.toLowerCase());
    });
    if (!hit) throw notFound(`${path}: no variant ${Object.entries(want).map(([k, v]) => `${k}=${v}`).join(', ')} in "${set.name}".`);
    return hit as SceneNode;
  }
  const ref = ctx.refs.get(to);
  if (ref) return ref;
  if (/^I?\d+[:\-]\d+/.test(to) || /node-id=/.test(to)) {
    const n = await getNodeSafe(normalizeNodeId(to));
    if (!n) throw notFound(`${path}: destination ${to} not found.`);
    return n as SceneNode;
  }
  if (/\s>\s/.test(to)) return resolveSource(to, ctx, path);
  // A screen by name on the current page.
  const screens = figma.currentPage.children.flatMap((c) => (c.type === 'SECTION' ? [...c.children] : [c]));
  const hits = screens.filter((s) => s.name.toLowerCase() === to.toLowerCase());
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) throw badRequest(`${path}: ${hits.length} frames are named "${to}"; use an id (${hits.map((h) => h.id).join(', ')}).`);
  throw notFound(`${path}: destination "${to}" is not a ref, node id or top-level frame name.${didYouMean(to, screens.map((s) => s.name))}`);
}

async function toAction(a: ActionSpec, source: SceneNode, ctx: Ctx, path: string): Promise<Action> {
  switch (a.kind) {
    case 'back':
      return { type: 'BACK' };
    case 'close':
      return { type: 'CLOSE' };
    case 'url':
      return { type: 'URL', url: a.url ?? '', openInNewTab: a.newTab ?? true };
    case 'set-mode': {
      const coll = await ctx.collectionByName(a.collection ?? '');
      const mode = coll.modes.find((m) => m.name.toLowerCase() === (a.mode ?? '').toLowerCase());
      if (!mode) throw notFound(`${path}: collection "${coll.name}" has no mode "${a.mode}". Modes: ${coll.modes.map((m) => m.name).join(', ')}.`);
      return { type: 'SET_VARIABLE_MODE', variableCollectionId: coll.id, variableModeId: mode.modeId };
    }
    case 'set-variable': {
      const v = await ctx.variable(a.variable ?? '');
      let value: VariableValue;
      if (v.resolvedType === 'COLOR') {
        const c = parseColor(String(a.value));
        if (!c) throw badRequest(`${path}: "${a.value}" is not a color.`);
        value = c;
      } else if (v.resolvedType === 'FLOAT') value = Number(a.value);
      else if (v.resolvedType === 'BOOLEAN') value = a.value === true || a.value === 'true';
      else value = String(a.value);
      return { type: 'SET_VARIABLE', variableId: v.id, variableValue: { type: v.resolvedType, resolvedType: v.resolvedType, value } };
    }
    default: {
      const dest = await resolveDestination(a.to ?? '', a, source, ctx, path);
      const navigation = ({ navigate: 'NAVIGATE', overlay: 'OVERLAY', swap: 'SWAP', 'scroll-to': 'SCROLL_TO', 'change-to': 'CHANGE_TO' } as const)[a.kind];
      if ((navigation === 'NAVIGATE' || navigation === 'OVERLAY' || navigation === 'SWAP') && dest.parent?.type !== 'PAGE' && dest.parent?.type !== 'SECTION') {
        throw badRequest(`${path}: "${a.kind}" needs a top-level frame (a screen) as destination; "${dest.name}" is nested inside "${dest.parent?.name}".`);
      }
      if (navigation === 'SCROLL_TO' && screenOf(dest) !== screenOf(source)) {
        throw badRequest(`${path}: "scroll-to" destination must be inside the same screen as the trigger.`);
      }
      const action: Action = {
        type: 'NODE',
        destinationId: dest.id,
        navigation,
        transition: toTransition(a.transition),
        ...(a.resetScroll !== undefined ? { resetScrollPosition: a.resetScroll } : {}),
        ...(a.offset ? { overlayRelativePosition: a.offset } : {}),
      };
      return action;
    }
  }
}

/** A trigger layer: ref, node id, a top-level frame name, or "Screen > Layer > Sublayer" by names. */
export async function resolveSource(from: string, ctx: Ctx, path: string): Promise<SceneNode> {
  const ref = ctx.refs.get(from);
  if (ref) return ref;
  if (/^I?\d+[:\-]\d+/.test(from) || /node-id=/.test(from)) return ctx.sceneNode(from, path);
  const parts = from.split(/\s+>\s+/).map((p) => p.trim()).filter(Boolean);
  const screens = figma.currentPage.children.flatMap((c) => (c.type === 'SECTION' ? [...c.children] : [c]));
  const hits = screens.filter((sc) => sc.name.toLowerCase() === parts[0].toLowerCase());
  if (hits.length !== 1) {
    if (hits.length > 1) throw badRequest(`${path}: ${hits.length} top-level frames are named "${parts[0]}"; use an id.`);
    throw notFound(`${path}: "${parts[0]}" is not a ref, id or top-level frame on this page.${didYouMean(parts[0], screens.map((x) => x.name))}`);
  }
  let node: SceneNode = hits[0];
  for (const part of parts.slice(1)) {
    const queue: SceneNode[] = 'children' in node ? [...(node as ChildrenMixin).children] : [];
    let found: SceneNode | null = null;
    while (queue.length && !found) {
      const n = queue.shift()!;
      if (n.name.toLowerCase() === part.toLowerCase()) found = n;
      else if ('children' in n) queue.push(...(n as ChildrenMixin).children);
    }
    if (!found) throw notFound(`${path}: no layer "${part}" inside "${node.name}".`);
    node = found;
  }
  return node;
}

export async function toReaction(item: InteractionSpec, source: SceneNode, ctx: Ctx, path: string): Promise<Reaction> {
  const actions: Action[] = [];
  for (let i = 0; i < item.actions.length; i++) actions.push(await toAction(item.actions[i], source, ctx, `${path}.actions[${i}]`));
  return { trigger: toTrigger(item.trigger), actions };
}

/** Applies interactions collected during a build (after every ref exists). */
export async function applyPendingInteractions(ctx: Ctx): Promise<number> {
  let count = 0;
  for (const { node, items, path } of ctx.pendingInteractions) {
    if (!('setReactionsAsync' in node)) {
      ctx.warn(`${path}: ${node.type.toLowerCase()} cannot have prototype interactions.`);
      continue;
    }
    const reactions: Reaction[] = [...((node as ReactionMixin).reactions ?? [])];
    for (let i = 0; i < items.length; i++) reactions.push(await toReaction(items[i], node, ctx, `${path}.interactions[${i}]`));
    await (node as ReactionMixin).setReactionsAsync(reactions);
    count += items.length;
  }
  ctx.pendingInteractions = [];
  return count;
}

// ───────────── tool: prototype ─────────────

export interface PrototypeParams {
  links?: unknown[];
  replace?: boolean;
  flows?: Array<{ name: string; start: string }>;
  replaceFlows?: boolean;
  scroll?: Array<{ id: string; overflow?: string; fixed?: number }>;
  clear?: string[];
}

export async function prototype(p: PrototypeParams) {
  const ctx = new Ctx();
  const issues = newIssues();
  const links = normalizeInteractions(p.links ?? [], 'links', issues);
  links.forEach((l, i) => {
    if (!l.from) issues.errors.push(`links[${i}]: "from" (the layer that triggers it) is required.`);
  });
  if (issues.errors.length) throw badRequest(issues.errors.join('\n'));

  const cleared: string[] = [];
  for (const id of p.clear ?? []) {
    const n = await ctx.sceneNode(id);
    if ('setReactionsAsync' in n) {
      await (n as ReactionMixin).setReactionsAsync([]);
      cleared.push(n.id);
    }
  }

  // Group by source so each node gets one setReactionsAsync call.
  const bySource = new Map<string, { node: SceneNode; reactions: Reaction[] }>();
  for (let i = 0; i < links.length; i++) {
    const l = links[i];
    const node = await resolveSource(l.from!, ctx, `links[${i}].from`);
    if (!('setReactionsAsync' in node)) throw badRequest(`links[${i}].from: ${node.type.toLowerCase()} cannot have interactions.`);
    let entry = bySource.get(node.id);
    if (!entry) {
      entry = { node, reactions: p.replace ? [] : [...((node as ReactionMixin).reactions ?? [])] };
      bySource.set(node.id, entry);
    }
    entry.reactions.push(await toReaction(l, node, ctx, `links[${i}]`));
  }
  for (const { node, reactions } of bySource.values()) await (node as ReactionMixin).setReactionsAsync(reactions);

  const flows: Array<{ name: string; nodeId: string }> = [];
  if (p.flows?.length) {
    const page = figma.currentPage;
    const existing = p.replaceFlows ? [] : [...page.flowStartingPoints];
    for (const f of p.flows) {
      const n = await ctx.sceneNode(f.start, `flow "${f.name}"`);
      if (n.parent?.type !== 'PAGE' && n.parent?.type !== 'SECTION') throw badRequest(`flow "${f.name}": the starting point must be a top-level frame.`);
      const i = existing.findIndex((e) => e.nodeId === n.id || e.name === f.name);
      if (i >= 0) existing.splice(i, 1);
      existing.push({ nodeId: n.id, name: f.name });
      flows.push({ name: f.name, nodeId: n.id });
    }
    page.flowStartingPoints = existing;
  }

  const scrolled: string[] = [];
  for (const s of p.scroll ?? []) {
    const n = await ctx.sceneNode(s.id);
    if (!('overflowDirection' in n)) throw badRequest(`scroll ${s.id}: only frames can scroll.`);
    const f = n as FrameNode;
    if (s.overflow) {
      const map = { none: 'NONE', vertical: 'VERTICAL', horizontal: 'HORIZONTAL', both: 'BOTH' } as const;
      const v = map[s.overflow.toLowerCase() as keyof typeof map];
      if (!v) throw badRequest(`scroll ${s.id}: overflow must be none|vertical|horizontal|both.`);
      f.overflowDirection = v;
    }
    if (s.fixed !== undefined) f.numberOfFixedChildren = Math.max(0, Math.min(s.fixed, f.children.length));
    scrolled.push(f.id);
  }

  return {
    linked: links.length,
    sources: [...bySource.values()].map((e) => ({ id: e.node.id, name: e.node.name, reactions: e.reactions.length })),
    flows,
    scrolled,
    cleared,
    warnings: ctx.warnings,
  };
}

// ───────────── reading ─────────────

const TRIGGER_NAMES: Record<string, string> = {
  ON_CLICK: 'click', ON_HOVER: 'hover', ON_PRESS: 'press', ON_DRAG: 'drag', MOUSE_ENTER: 'mouse-enter', MOUSE_LEAVE: 'mouse-leave',
  MOUSE_DOWN: 'mouse-down', MOUSE_UP: 'mouse-up', AFTER_TIMEOUT: 'after', ON_KEY_DOWN: 'key', ON_MEDIA_HIT: 'media-hit', ON_MEDIA_END: 'media-end',
};

export function describeTransition(t: Transition | null): string | undefined {
  if (!t) return undefined;
  const parts = [t.type.toLowerCase().replace(/_/g, '-')];
  if ('direction' in t) parts.push(t.direction.toLowerCase());
  parts.push(`${Math.round(t.duration * 1000)}ms`);
  parts.push(t.easing.type.toLowerCase().replace(/_/g, '-'));
  return parts.join(' ');
}

async function describeAction(a: Action, names: Map<string, string>): Promise<Record<string, unknown>> {
  if (a.type === 'NODE') {
    let destName = a.destinationId ? names.get(a.destinationId) : undefined;
    if (a.destinationId && destName === undefined) {
      const n = await getNodeSafe(a.destinationId, 1500);
      destName = n?.name ?? '?';
      names.set(a.destinationId, destName);
    }
    return { action: a.navigation.toLowerCase().replace('_', '-'), to: a.destinationId, toName: destName, transition: describeTransition(a.transition) };
  }
  if (a.type === 'URL') return { action: 'url', url: a.url };
  if (a.type === 'BACK' || a.type === 'CLOSE') return { action: a.type.toLowerCase() };
  if (a.type === 'SET_VARIABLE_MODE') return { action: 'set-mode', collection: a.variableCollectionId, mode: a.variableModeId };
  if (a.type === 'SET_VARIABLE') return { action: 'set-variable', variable: a.variableId, value: a.variableValue?.value };
  return { action: a.type.toLowerCase() };
}

export async function describeReactions(node: SceneNode, names: Map<string, string>): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  for (const r of ((node as ReactionMixin).reactions ?? []) as Reaction[]) {
    const t = r.trigger;
    const trig: Record<string, unknown> = { trigger: t ? TRIGGER_NAMES[t.type] ?? t.type : 'none' };
    if (t && t.type === 'AFTER_TIMEOUT') trig.delayMs = Math.round(t.timeout * 1000);
    if (t && (t.type === 'MOUSE_ENTER' || t.type === 'MOUSE_LEAVE' || t.type === 'MOUSE_UP' || t.type === 'MOUSE_DOWN') && t.delay) trig.delayMs = Math.round(t.delay * 1000);
    if (t && t.type === 'ON_KEY_DOWN') trig.keyCodes = t.keyCodes;
    const actions = r.actions ?? (r.action ? [r.action] : []);
    out.push({ ...trig, actions: await Promise.all(actions.map((a) => describeAction(a, names))) });
  }
  return out;
}

/** Every interaction under a root (default: current page), plus flows and scroll settings. */
export async function readPrototype(p: { root?: string }) {
  const ctx = new Ctx();
  const root: BaseNode = p.root ? await ctx.node(p.root) : figma.currentPage;
  const names = new Map<string, string>();
  const nodes: SceneNode[] = [];
  const visit = (n: BaseNode) => {
    if ('reactions' in n && ((n as ReactionMixin).reactions?.length ?? 0) > 0) nodes.push(n as SceneNode);
    if ('children' in n) for (const c of (n as ChildrenMixin).children) visit(c);
  };
  visit(root);
  const links = [];
  for (const n of nodes) {
    names.set(n.id, n.name);
    const screen = screenOf(n);
    links.push({ from: n.id, fromName: n.name, screen: screen?.name, reactions: await describeReactions(n, names) });
  }
  const scrolling: Array<Record<string, unknown>> = [];
  const page = figma.currentPage;
  for (const c of page.children) {
    if ('overflowDirection' in c && (c as FrameNode).overflowDirection !== 'NONE') {
      scrolling.push({ id: c.id, name: c.name, overflow: (c as FrameNode).overflowDirection.toLowerCase(), fixedChildren: (c as FrameNode).numberOfFixedChildren });
    }
  }
  return { flows: page.flowStartingPoints.map((f) => ({ ...f })), links, scrolling };
}
