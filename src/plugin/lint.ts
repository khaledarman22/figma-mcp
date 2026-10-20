// Design audit against working principles (tokens, auto layout, naming, accessibility,
// structure). Optional safe auto-fixes bind raw values to the one variable that matches exactly.

import { composite, contrastRatio, toHex, type RGBA } from '../shared/color.ts';
import { round } from '../shared/util.ts';
import { Ctx } from './ctx.ts';
import { isPlaceholderBox, neededPrompt } from './pages.ts';
import { isVectorOnly } from './props.ts';

export interface LintParams {
  nodeId?: string;
  rules?: string[];
  fix?: boolean | string[];
  grid?: number;
  limit?: number;
}

interface Issue {
  rule: string;
  severity: 'error' | 'warn' | 'info';
  id: string;
  name: string;
  message: string;
  fixed?: boolean;
}

export const RULES: Record<string, { severity: Issue['severity']; about: string; fixable?: boolean }> = {
  'contrast': { severity: 'error', about: 'Text contrast below WCAG AA (4.5:1, or 3:1 for large text).' },
  'text-collapsed': { severity: 'error', about: 'Text squeezed to ~0 width (parent hugs while text fills).' },
  'clipped-content': { severity: 'warn', about: 'Content sticks out of a frame that clips it (cut-off text/elements).' },
  'unbound-color': { severity: 'warn', about: 'Raw color not bound to a variable or style.', fixable: true },
  'text-style': { severity: 'warn', about: 'Text without a text style or typography variables.' },
  'no-autolayout': { severity: 'warn', about: 'Frame with several children positioned by hand instead of auto layout.' },
  'detached': { severity: 'warn', about: 'Detached component instance.' },
  'touch-target': { severity: 'warn', about: 'Interactive layer smaller than 24×24 (WCAG 2.2 target size).' },
  'unbound-spacing': { severity: 'info', about: 'Gap/padding not bound to a spacing variable.', fixable: true },
  'unbound-radius': { severity: 'info', about: 'Corner radius not bound to a radius variable.', fixable: true },
  'off-grid': { severity: 'info', about: 'Spacing not on the spacing grid (default 4).' },
  'default-name': { severity: 'info', about: 'Generic layer name ("Frame 12").' },
  'group': { severity: 'info', about: 'Group used as a container (prefer frames with auto layout).' },
  'empty-frame': { severity: 'info', about: 'Empty frame with no fill or stroke.' },
  'hidden': { severity: 'info', about: 'Hidden layer left in the design.' },
  'placeholder': { severity: 'info', about: 'Image placeholder still waiting for the real image.' },
};

const DEFAULT_NAME = /^(Frame|Rectangle|Ellipse|Group|Vector|Line|Polygon|Star|Component|Instance|Section|Image|Union|Subtract|Intersect|Exclude|Text|Auto layout|Container)( \d+)?$/i;

interface VarCandidate {
  v: Variable;
  value: RGBA | number;
  alias: boolean;
}

async function variableIndex() {
  const ctx = new Ctx();
  const vars = await figma.variables.getLocalVariablesAsync();
  const colors: VarCandidate[] = [];
  const floats: VarCandidate[] = [];
  for (const v of vars) {
    if (!v.scopes.length) continue; // hidden primitives are not meant to be applied directly
    const coll = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
    const raw = coll ? v.valuesByMode[coll.defaultModeId] : undefined;
    const alias = !!raw && typeof raw === 'object' && 'type' in raw && (raw as VariableAlias).type === 'VARIABLE_ALIAS';
    const val = await ctx.resolveVariableValue(v);
    if (v.resolvedType === 'COLOR' && val && typeof val === 'object' && 'r' in val) colors.push({ v, value: val as RGBA, alias });
    if (v.resolvedType === 'FLOAT' && typeof val === 'number') floats.push({ v, value: val, alias });
  }
  return { colors, floats };
}

const scopeOk = (v: Variable, wanted: VariableScope[]) => v.scopes.includes('ALL_SCOPES') || v.scopes.some((s) => wanted.includes(s));

function pick(cands: VarCandidate[]): VarCandidate | null {
  if (cands.length === 1) return cands[0];
  const semantic = cands.filter((c) => c.alias);
  if (semantic.length === 1) return semantic[0];
  return null;
}

function backgroundOf(n: SceneNode): RGBA | null {
  const layers: RGBA[] = [];
  let p: BaseNode | null = n.parent;
  while (p && p.type !== 'PAGE' && p.type !== 'DOCUMENT') {
    if ('fills' in p && Array.isArray((p as MinimalFillsMixin).fills)) {
      const fills = ((p as MinimalFillsMixin).fills as Paint[]).filter((f) => f.visible !== false);
      for (let i = fills.length - 1; i >= 0; i--) {
        const f = fills[i];
        if (f.type === 'IMAGE' || f.type.startsWith('GRADIENT')) return null; // unknown background
        if (f.type === 'SOLID') {
          const c = { ...f.color, a: f.opacity ?? 1 };
          layers.push(c);
          if (c.a >= 0.99) {
            // compose collected translucent layers over this opaque one
            let base: RGBA = { ...c, a: 1 };
            for (let k = layers.length - 2; k >= 0; k--) base = composite(layers[k], base);
            return base;
          }
        }
      }
    }
    p = p.parent;
  }
  let base: RGBA = { r: 1, g: 1, b: 1, a: 1 }; // canvas default under screens
  for (let k = layers.length - 1; k >= 0; k--) base = composite(layers[k], base);
  return base;
}

export async function lint(p: LintParams) {
  const ctx = new Ctx();
  const roots: SceneNode[] = [];
  if (p.nodeId) roots.push(await ctx.sceneNode(p.nodeId));
  else if (figma.currentPage.selection.length) roots.push(...figma.currentPage.selection);
  else roots.push(...figma.currentPage.children.filter((c) => c.getPluginData('role') !== 'icons'));
  const enabled = new Set(p.rules?.length ? p.rules : Object.keys(RULES));
  const fixRules = new Set(p.fix === true ? Object.keys(RULES).filter((r) => RULES[r].fixable) : Array.isArray(p.fix) ? p.fix : []);
  const grid = p.grid ?? 4;
  const issues: Issue[] = [];
  const add = (rule: string, n: BaseNode, message: string, fixed?: boolean) => {
    if (!enabled.has(rule)) return;
    issues.push({ rule, severity: RULES[rule].severity, id: n.id, name: n.name, message, ...(fixed ? { fixed } : {}) });
  };
  const needVars = ['unbound-color', 'unbound-spacing', 'unbound-radius'].some((r) => enabled.has(r));
  const idx = needVars ? await variableIndex() : { colors: [], floats: [] };
  const hasSpacingVars = idx.floats.some((c) => scopeOk(c.v, ['GAP']));
  const hasRadiusVars = idx.floats.some((c) => scopeOk(c.v, ['CORNER_RADIUS']));
  const stats = { nodes: 0, fonts: new Map<string, number>(), fontSizes: new Map<number, number>(), radii: new Map<number, number>(), gaps: new Map<number, number>(), colors: new Map<string, number>() };
  const bump = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);

  const checkPaints = async (n: SceneNode, kind: 'fills' | 'strokes') => {
    const node = n as GeometryMixin & SceneNode;
    const paints = node[kind];
    if (!Array.isArray(paints) || !paints.length) return;
    const styleId = kind === 'fills' ? (node as MinimalFillsMixin).fillStyleId : (node as MinimalStrokesMixin).strokeStyleId;
    if (styleId && styleId !== figma.mixed) return;
    const next = [...paints] as Paint[];
    let changed = false;
    for (let i = 0; i < next.length; i++) {
      const paint = next[i];
      if (paint.type !== 'SOLID' || paint.visible === false || paint.boundVariables?.color) continue;
      const hex = toHex(paint.color, paint.opacity ?? 1);
      bump(stats.colors, hex);
      const wanted: VariableScope[] = kind === 'strokes' ? ['STROKE_COLOR'] : n.type === 'TEXT' ? ['TEXT_FILL', 'ALL_FILLS'] : n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'INSTANCE' ? ['FRAME_FILL', 'ALL_FILLS'] : ['SHAPE_FILL', 'ALL_FILLS'];
      const cands = idx.colors.filter((c) => scopeOk(c.v, wanted) && toHex(c.value as RGBA, (c.value as RGBA).a * 1) === toHex(paint.color, (paint.opacity ?? 1)));
      const choice = pick(cands);
      if (choice && fixRules.has('unbound-color')) {
        const base: SolidPaint = { type: 'SOLID', color: paint.color, opacity: 1 };
        next[i] = figma.variables.setBoundVariableForPaint(base, 'color', choice.v);
        changed = true;
        add('unbound-color', n, `${kind === 'strokes' ? 'stroke' : 'fill'} ${hex} → bound to $${choice.v.name}`, true);
      } else {
        const hint = choice ? ` — matches $${choice.v.name} (run with fix)` : cands.length > 1 ? ` — matches ${cands.length} variables: ${cands.slice(0, 3).map((c) => '$' + c.v.name).join(', ')}` : '';
        add('unbound-color', n, `${kind === 'strokes' ? 'stroke' : 'fill'} ${hex} is a raw value${hint}`);
      }
    }
    if (changed) {
      if (n.type === 'TEXT') await ctx.loadFontsIn(n);
      node[kind] = next;
    }
  };

  const bindFloat = (n: SceneNode, field: VariableBindableNodeField, value: number, scope: VariableScope, rule: string, label: string): boolean => {
    const cands = idx.floats.filter((c) => scopeOk(c.v, [scope]) && Math.abs((c.value as number) - value) < 0.01);
    const choice = pick(cands);
    if (choice && fixRules.has(rule)) {
      n.setBoundVariable(field, choice.v);
      add(rule, n, `${label} ${value} → bound to $${choice.v.name}`, true);
      return true;
    }
    if (value !== 0) add(rule, n, `${label} ${value} is a raw value${choice ? ` — matches $${choice.v.name} (run with fix)` : cands.length ? ` — ${cands.length} matching variables` : ' — no matching variable'}`);
    return false;
  };

  const visit = async (n: SceneNode, inInstance: boolean) => {
    stats.nodes++;
    if (!n.visible) {
      if (!inInstance) add('hidden', n, 'hidden layer');
      return;
    }
    const prompt = neededPrompt(n);
    if (prompt !== null) {
      // Temporary by design: remind about the missing image instead of auditing its gray box.
      const id = n.getPluginData('imageId');
      add('placeholder', n, prompt ? `waits for its image${id ? ` ${id}` : ''} — list it with image_prompts` : 'image placeholder without a prompt — set {prompt} so it can be generated');
      if (isPlaceholderBox(n)) return;
    }
    // Instances get layout and visuals from their main component: audit the component, not each copy.
    const tokenRules = !inInstance && n.type !== 'INSTANCE';
    if (tokenRules && DEFAULT_NAME.test(n.name) && n.type !== 'TEXT') add('default-name', n, `generic name "${n.name}"`);
    if (tokenRules && n.type === 'GROUP' && n.children.length > 1 && !isVectorOnly(n)) add('group', n, 'group used as a container');
    if (tokenRules && 'detachedInfo' in n && (n as FrameNode).detachedInfo) add('detached', n, 'detached from its component');

    if (tokenRules && 'fills' in n) await checkPaints(n, 'fills');
    if (tokenRules && 'strokes' in n) await checkPaints(n, 'strokes');

    if ('layoutMode' in n) {
      const f = n as FrameNode;
      const kids = 'children' in f ? f.children.filter((c) => c.visible) : [];
      if (tokenRules && f.layoutMode === 'NONE' && kids.length >= 2 && n.type !== 'COMPONENT_SET' && !isVectorOnly(n)) {
        add('no-autolayout', n, `${kids.length} children positioned by hand`);
      }
      if (tokenRules && f.layoutMode !== 'NONE') {
        const bv = f.boundVariables ?? {};
        const fields: Array<[VariableBindableNodeField, number, string]> = [];
        if (f.primaryAxisAlignItems !== 'SPACE_BETWEEN' && f.layoutMode !== 'GRID') fields.push(['itemSpacing', f.itemSpacing, 'gap']);
        fields.push(['paddingTop', f.paddingTop, 'padding-top'], ['paddingRight', f.paddingRight, 'padding-right'], ['paddingBottom', f.paddingBottom, 'padding-bottom'], ['paddingLeft', f.paddingLeft, 'padding-left']);
        for (const [field, value, label] of fields) {
          if ((bv as Record<string, unknown>)[field]) continue;
          if (field === 'itemSpacing') bump(stats.gaps, value);
          if (value % grid !== 0) add('off-grid', n, `${label} ${value} is not a multiple of ${grid}`);
          if (hasSpacingVars) bindFloat(n, field, value, 'GAP', 'unbound-spacing', label);
        }
      }
      if (tokenRules && n.type === 'FRAME' && !kids.length && !(f.fills as Paint[]).some((x) => x.visible !== false) && !f.strokes.length) add('empty-frame', n, 'empty frame');
      if (f.clipsContent && kids.length) {
        for (const c of kids) {
          if (c.x < -0.5 || c.y < -0.5 || c.x + c.width > f.width + 0.5 || c.y + c.height > f.height + 0.5) {
            add('clipped-content', c, `extends outside "${f.name}" which clips it (${round(c.x)},${round(c.y)} ${round(c.width)}×${round(c.height)} in ${round(f.width)}×${round(f.height)})`);
            break;
          }
        }
      }
    }
    if (tokenRules && 'cornerRadius' in n) {
      const r = (n as CornerMixin).cornerRadius;
      const bv = (n as FrameNode).boundVariables ?? {};
      if (typeof r === 'number' && r > 0 && !bv.topLeftRadius) {
        bump(stats.radii, r);
        if (hasRadiusVars && 'topLeftRadius' in n) {
          const cands = idx.floats.filter((c) => scopeOk(c.v, ['CORNER_RADIUS']) && Math.abs((c.value as number) - r) < 0.01);
          const choice = pick(cands);
          if (choice && fixRules.has('unbound-radius')) {
            for (const f of ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'] as const) n.setBoundVariable(f, choice.v);
            add('unbound-radius', n, `radius ${r} → bound to $${choice.v.name}`, true);
          } else add('unbound-radius', n, `radius ${r} is a raw value${choice ? ` — matches $${choice.v.name} (run with fix)` : ''}`);
        }
      }
    }
    if (n.type === 'TEXT') {
      const fontName = n.fontName;
      if (fontName !== figma.mixed) bump(stats.fonts, fontName.family);
      if (n.fontSize !== figma.mixed) bump(stats.fontSizes, n.fontSize);
      if (tokenRules && !n.textStyleId && !(n.boundVariables?.fontSize)) add('text-style', n, `no text style (${fontName !== figma.mixed ? `${fontName.family} ${fontName.style}` : 'mixed'} ${n.fontSize !== figma.mixed ? n.fontSize : ''})`);
      if (n.width < 2 && n.characters.trim().length > 0) add('text-collapsed', n, `text is ${round(n.width, 1)}px wide`);
      if (enabled.has('contrast') && Array.isArray(n.fills)) {
        const solid = (n.fills as Paint[]).find((f) => f.visible !== false && f.type === 'SOLID') as SolidPaint | undefined;
        const bg = backgroundOf(n);
        if (solid && bg) {
          const fg = composite({ ...solid.color, a: (solid.opacity ?? 1) * ('opacity' in n ? n.opacity : 1) }, bg);
          const ratio = contrastRatio(fg, bg);
          const size = n.fontSize !== figma.mixed ? n.fontSize : 16;
          const weight = typeof n.fontWeight === 'number' ? n.fontWeight : 400;
          const large = size >= 24 || (size >= 18.66 && weight >= 700);
          const min = large ? 3 : 4.5;
          if (ratio < min) add('contrast', n, `contrast ${round(ratio, 2)}:1 (${toHex(fg)} on ${toHex(bg)}), needs ${min}:1`);
        }
      }
    }
    if ('reactions' in n && (n as ReactionMixin).reactions.length && (n.width < 24 || n.height < 24)) add('touch-target', n, `interactive layer is ${round(n.width)}×${round(n.height)}`);

    if ('children' in n && !(tokenRules && isVectorOnly(n))) {
      for (const c of (n as ChildrenMixin).children) await visit(c, inInstance || n.type === 'INSTANCE');
    }
  };
  for (const r of roots) await visit(r, false);

  const limit = p.limit ?? 80;
  const order = { error: 0, warn: 1, info: 2 } as const;
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  const summary: Record<string, number> = {};
  for (const i of issues) summary[i.rule] = (summary[i.rule] ?? 0) + 1;
  const top = <K>(m: Map<K, number>, n = 12) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${k}×${c}`);
  return {
    scope: roots.map((r) => ({ id: r.id, name: r.name })),
    summary,
    fixed: issues.filter((i) => i.fixed).length,
    issues: issues.slice(0, limit),
    more: Math.max(0, issues.length - limit),
    stats: {
      nodes: stats.nodes,
      fontFamilies: top(stats.fonts),
      fontSizes: top(stats.fontSizes, 20),
      radii: top(stats.radii),
      gaps: top(stats.gaps),
      rawColors: stats.colors.size,
    },
    rules: Object.fromEntries(Object.entries(RULES).map(([k, v]) => [k, v.about])),
  };
}
