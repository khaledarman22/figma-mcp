// Name → Figma object resolution (variables, styles, fonts, components) with "did you mean"
// errors. One Ctx lives for one request; indexes are built lazily and only once per request.

import { didYouMean, normalizeNodeId } from '../shared/util.ts';
import type { InteractionSpec, Spec } from '../shared/spec.ts';
import { badRequest, notFound } from './errors.ts';

export type AnyStyle = PaintStyle | TextStyle | EffectStyle | GridStyle;
export type ComponentLike = ComponentNode | ComponentSetNode;

interface VarIndex {
  byName: Map<string, Variable[]>;
  byQualified: Map<string, Variable>;
  collections: Map<string, VariableCollection>;
  collectionsByName: Map<string, VariableCollection>;
  all: Variable[];
}

interface FontFamily {
  family: string;
  styles: string[];
}

// Library variables rarely change during a session; cache them at module level.
let libraryVarCache: Map<string, { key: string; name: string; collection: string; library: string }[]> | null = null;
// Fonts list is large and stable; cache for 5 minutes.
let fontCache: { at: number; families: Map<string, FontFamily> } | null = null;

const WEIGHT_WORDS: Array<[string, number]> = [
  ['extralight', 200], ['ultralight', 200], ['semibold', 600], ['demibold', 600], ['extrabold', 800], ['ultrabold', 800],
  ['hairline', 100], ['thin', 100], ['light', 300], ['regular', 400], ['normal', 400], ['book', 400], ['roman', 400],
  ['medium', 500], ['bold', 700], ['black', 900], ['heavy', 900],
];

export function weightOfStyle(style: string): number {
  const s = style.toLowerCase().replace(/italic|oblique/g, '').replace(/[\s_-]+/g, '');
  const n = s.match(/([1-9]00)/);
  if (n) return parseInt(n[1], 10);
  for (const [w, v] of WEIGHT_WORDS) if (s.includes(w)) return v;
  return 400;
}

const isItalic = (style: string) => /italic|oblique/i.test(style);
const normStyle = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');

/**
 * figma.getNodeByIdAsync can hang forever on a well-formed id that does not exist
 * (reported against several bridges). Race it against a short timer.
 */
export async function getNodeSafe(id: string, timeoutMs = 4000): Promise<BaseNode | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([figma.getNodeByIdAsync(id), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export class Ctx {
  warnings: string[] = [];
  refs = new Map<string, SceneNode>();
  created: SceneNode[] = [];
  binds: Array<{ node: SceneNode; bind: NonNullable<Spec['bind']>; path: string }> = [];
  pendingInteractions: Array<{ node: SceneNode; items: InteractionSpec[]; path: string }> = [];
  loadedFonts = new Set<string>();

  private varIndex?: Promise<VarIndex>;
  private styleIndex?: Promise<Map<string, AnyStyle[]>>;
  private componentIndex?: Map<string, ComponentLike[]>;
  private componentIndexScope: 'none' | 'page' | 'all' = 'none';

  warn(msg: string) {
    if (!this.warnings.includes(msg)) this.warnings.push(msg);
  }

  // ───────────── nodes ─────────────

  async node(idOrRef: string, label = 'node'): Promise<BaseNode> {
    const ref = this.refs.get(idOrRef);
    if (ref) return ref;
    const id = normalizeNodeId(idOrRef);
    const n = await getNodeSafe(id);
    if (!n) {
      const refs = [...this.refs.keys()];
      throw notFound(`${label} ${JSON.stringify(idOrRef)} not found (ids look like "12:34"; refs: ${refs.length ? refs.join(', ') : 'none defined'}).`);
    }
    return n;
  }

  async sceneNode(idOrRef: string, label = 'node'): Promise<SceneNode> {
    const n = await this.node(idOrRef, label);
    if (n.type === 'DOCUMENT' || n.type === 'PAGE') throw badRequest(`${label} ${JSON.stringify(idOrRef)} is a ${n.type.toLowerCase()}, not a layer.`);
    return n as SceneNode;
  }

  // ───────────── variables ─────────────

  private buildVarIndex(): Promise<VarIndex> {
    if (!this.varIndex) {
      this.varIndex = (async () => {
        const [collections, vars] = await Promise.all([
          figma.variables.getLocalVariableCollectionsAsync(),
          figma.variables.getLocalVariablesAsync(),
        ]);
        const idx: VarIndex = { byName: new Map(), byQualified: new Map(), collections: new Map(), collectionsByName: new Map(), all: vars };
        for (const c of collections) {
          idx.collections.set(c.id, c);
          idx.collectionsByName.set(c.name.toLowerCase(), c);
        }
        for (const v of vars) {
          const key = v.name.toLowerCase();
          const list = idx.byName.get(key) ?? [];
          list.push(v);
          idx.byName.set(key, list);
          const c = idx.collections.get(v.variableCollectionId);
          if (c) idx.byQualified.set(`${c.name.toLowerCase()}:${key}`, v);
        }
        return idx;
      })();
    }
    return this.varIndex;
  }

  invalidateVariables() {
    this.varIndex = undefined;
  }

  async collections(): Promise<VariableCollection[]> {
    return [...(await this.buildVarIndex()).collections.values()];
  }

  async collectionByName(name: string): Promise<VariableCollection> {
    const idx = await this.buildVarIndex();
    const c = idx.collectionsByName.get(name.toLowerCase()) ?? idx.collections.get(name);
    if (!c) throw notFound(`Variable collection ${JSON.stringify(name)} not found.${didYouMean(name, [...idx.collections.values()].map((x) => x.name))}`);
    return c;
  }

  /** "$color/bg", "color/bg", "$Semantic:color/bg" → Variable (local first, then enabled libraries). */
  async variable(ref: string, expected?: VariableResolvedDataType): Promise<Variable> {
    const raw = ref.replace(/^\$/, '').trim();
    const idx = await this.buildVarIndex();
    let v: Variable | undefined;
    const colon = raw.indexOf(':');
    if (colon > 0 && !raw.startsWith('VariableID')) {
      v = idx.byQualified.get(raw.toLowerCase());
    }
    if (!v && raw.startsWith('VariableID:')) {
      v = (await figma.variables.getVariableByIdAsync(raw)) ?? undefined;
    }
    if (!v) {
      let list = idx.byName.get(raw.toLowerCase()) ?? [];
      if (expected && list.length > 1) list = list.filter((x) => x.resolvedType === expected);
      if (list.length > 1) {
        // Prefer variables meant to be picked (non-empty scopes) over hidden primitives.
        const visible = list.filter((x) => x.scopes.length > 0);
        if (visible.length === 1) list = visible;
      }
      if (list.length > 1) {
        const names = list.map((x) => `$${idx.collections.get(x.variableCollectionId)?.name}:${x.name}`);
        throw badRequest(`Variable "${raw}" exists in several collections; qualify it: ${names.join(' or ')}.`);
      }
      v = list[0];
    }
    if (!v) v = await this.libraryVariable(raw);
    if (!v) {
      const names = idx.all.map((x) => x.name);
      throw notFound(`Variable "$${raw}" not found.${didYouMean(raw, names)}${names.length ? '' : ' This file has no local variables yet — create them with the variables tool.'}`);
    }
    if (expected && v.resolvedType !== expected) {
      throw badRequest(`Variable "$${raw}" is ${v.resolvedType}, but ${expected} is needed here.`);
    }
    return v;
  }

  private async libraryVariable(name: string): Promise<Variable | undefined> {
    try {
      if (!libraryVarCache) {
        libraryVarCache = new Map();
        const cols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
        const lists = await Promise.all(cols.map((c) => figma.teamLibrary.getVariablesInLibraryCollectionAsync(c.key).catch(() => [])));
        cols.forEach((c, i) => {
          for (const lv of lists[i]) {
            const key = lv.name.toLowerCase();
            const arr = libraryVarCache!.get(key) ?? [];
            arr.push({ key: lv.key, name: lv.name, collection: c.name, library: c.libraryName });
            libraryVarCache!.set(key, arr);
          }
        });
      }
      const colon = name.indexOf(':');
      const [collection, varName] = colon > 0 ? [name.slice(0, colon).toLowerCase(), name.slice(colon + 1)] : [null, name];
      const hits = (libraryVarCache.get(varName.toLowerCase()) ?? []).filter((h) => !collection || h.collection.toLowerCase() === collection);
      if (!hits.length) return undefined;
      if (hits.length > 1) this.warn(`Variable "${name}" exists in several libraries; using ${hits[0].library} / ${hits[0].collection}.`);
      return await figma.variables.importVariableByKeyAsync(hits[0].key);
    } catch {
      return undefined;
    }
  }

  /** Resolves a variable's value (following aliases) for a mode of its own collection. */
  async resolveVariableValue(v: Variable, modeId?: string, depth = 0): Promise<VariableValue> {
    const coll = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
    const mid = modeId && modeId in v.valuesByMode ? modeId : coll?.defaultModeId ?? Object.keys(v.valuesByMode)[0];
    const val = v.valuesByMode[mid];
    if (val && typeof val === 'object' && 'type' in val && (val as VariableAlias).type === 'VARIABLE_ALIAS' && depth < 10) {
      const target = await figma.variables.getVariableByIdAsync((val as VariableAlias).id);
      if (target) return this.resolveVariableValue(target, undefined, depth + 1);
    }
    return val;
  }

  // ───────────── styles ─────────────

  private buildStyleIndex(): Promise<Map<string, AnyStyle[]>> {
    if (!this.styleIndex) {
      this.styleIndex = (async () => {
        const [p, t, e, g] = await Promise.all([
          figma.getLocalPaintStylesAsync(),
          figma.getLocalTextStylesAsync(),
          figma.getLocalEffectStylesAsync(),
          figma.getLocalGridStylesAsync(),
        ]);
        const m = new Map<string, AnyStyle[]>();
        for (const s of [...p, ...t, ...e, ...g] as AnyStyle[]) {
          const k = s.name.toLowerCase();
          m.set(k, [...(m.get(k) ?? []), s]);
        }
        return m;
      })();
    }
    return this.styleIndex;
  }

  invalidateStyles() {
    this.styleIndex = undefined;
  }

  async style<T extends AnyStyle['type']>(name: string, type: T): Promise<Extract<AnyStyle, { type: T }>> {
    const clean = name.replace(/^@/, '').trim();
    if (/^S:[0-9a-f]+/.test(clean)) {
      const s = await figma.getStyleByIdAsync(clean);
      if (s && s.type === type) return s as Extract<AnyStyle, { type: T }>;
    }
    const idx = await this.buildStyleIndex();
    const hit = (idx.get(clean.toLowerCase()) ?? []).find((s) => s.type === type);
    if (!hit) {
      const names = [...idx.values()].flat().filter((s) => s.type === type).map((s) => s.name);
      throw notFound(`${type.toLowerCase()} style "${clean}" not found.${didYouMean(clean, names)}${names.length ? '' : ` This file has no local ${type.toLowerCase()} styles.`}`);
    }
    return hit as Extract<AnyStyle, { type: T }>;
  }

  // ───────────── fonts ─────────────

  private async families(): Promise<Map<string, FontFamily>> {
    if (fontCache && Date.now() - fontCache.at < 5 * 60_000) return fontCache.families;
    const fonts = await figma.listAvailableFontsAsync();
    const fams = new Map<string, FontFamily>();
    for (const f of fonts) {
      const k = f.fontName.family.toLowerCase();
      const fam = fams.get(k) ?? { family: f.fontName.family, styles: [] };
      fam.styles.push(f.fontName.style);
      fams.set(k, fam);
    }
    fontCache = { at: Date.now(), families: fams };
    return fams;
  }

  async listFonts(query?: string): Promise<FontFamily[]> {
    const fams = [...(await this.families()).values()];
    if (!query) return fams;
    const q = query.toLowerCase();
    return fams.filter((f) => f.family.toLowerCase().includes(q));
  }

  /** Picks a real style name for family + weight/italic, or validates an explicit style. */
  async resolveFont(family: string, weight?: number, italic?: boolean, style?: string): Promise<FontName> {
    const fams = await this.families();
    const fam = fams.get(family.toLowerCase());
    if (!fam) {
      throw notFound(`Font family "${family}" is not available in Figma.${didYouMean(family, [...fams.values()].map((f) => f.family))} Install it on this computer, or choose another family (fonts tool lists them).`);
    }
    if (style) {
      const hit = fam.styles.find((s) => normStyle(s) === normStyle(style));
      if (hit) return { family: fam.family, style: hit };
      throw notFound(`"${fam.family}" has no style "${style}". Available: ${fam.styles.join(', ')}.`);
    }
    const want = weight ?? 400;
    let pool = fam.styles.filter((s) => isItalic(s) === !!italic);
    if (!pool.length) {
      if (italic) this.warn(`"${fam.family}" has no italic styles; using upright.`);
      pool = fam.styles;
    }
    let best = pool[0];
    let bestScore = Infinity;
    for (const s of pool) {
      const w = weightOfStyle(s);
      // Prefer plain names ("Bold") over decorated ones ("Bold Condensed") at equal weight.
      const score = Math.abs(w - want) * 10 + s.split(/\s+/).length;
      if (score < bestScore) {
        best = s;
        bestScore = score;
      }
    }
    const got = weightOfStyle(best);
    if (Math.abs(got - want) >= 100) this.warn(`"${fam.family}" has no weight ${want}; using "${best}".`);
    return { family: fam.family, style: best };
  }

  async loadFont(font: FontName): Promise<void> {
    const key = `${font.family}::${font.style}`;
    if (this.loadedFonts.has(key)) return;
    await figma.loadFontAsync(font);
    this.loadedFonts.add(key);
  }

  /** Loads every font used in a subtree (needed before editing existing text). */
  async loadFontsIn(node: BaseNode): Promise<void> {
    const texts: TextNode[] = [];
    if (node.type === 'TEXT') texts.push(node);
    if ('findAllWithCriteria' in node) texts.push(...(node as ChildrenMixin).findAllWithCriteria({ types: ['TEXT'] }));
    const fonts = new Map<string, FontName>();
    for (const t of texts) {
      if (t.hasMissingFont) continue;
      if (t.fontName !== figma.mixed) fonts.set(`${t.fontName.family}::${t.fontName.style}`, t.fontName);
      else for (const seg of t.getStyledTextSegments(['fontName'])) fonts.set(`${seg.fontName.family}::${seg.fontName.style}`, seg.fontName);
    }
    await Promise.all([...fonts.values()].map((f) => this.loadFont(f)));
  }

  // ───────────── components ─────────────

  private indexComponents(nodes: ReadonlyArray<SceneNode>, into: Map<string, ComponentLike[]>) {
    for (const n of nodes) {
      if (n.type === 'COMPONENT_SET' || (n.type === 'COMPONENT' && n.parent?.type !== 'COMPONENT_SET')) {
        const k = n.name.toLowerCase();
        into.set(k, [...(into.get(k) ?? []), n]);
      }
    }
  }

  private async ensureComponentIndex(scope: 'page' | 'all'): Promise<Map<string, ComponentLike[]>> {
    if (this.componentIndex && (this.componentIndexScope === 'all' || scope === 'page')) return this.componentIndex;
    const m = new Map<string, ComponentLike[]>();
    if (scope === 'page') {
      this.indexComponents(figma.currentPage.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] }), m);
    } else {
      await figma.loadAllPagesAsync();
      for (const page of figma.root.children) {
        if (page.getPluginData('role') === 'trash') continue; // trashed components are not offered for reuse
        this.indexComponents(page.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] }), m);
      }
    }
    this.componentIndex = m;
    this.componentIndexScope = scope;
    return m;
  }

  registerComponent(c: ComponentLike) {
    if (!this.componentIndex) return;
    const k = c.name.toLowerCase();
    this.componentIndex.set(k, [...(this.componentIndex.get(k) ?? []), c]);
  }

  /** A local component or set with exactly this name (any case), outside the Trash. */
  async localComponentNamed(name: string): Promise<ComponentLike | undefined> {
    return (await this.ensureComponentIndex('all')).get(name.trim().toLowerCase())?.[0];
  }

  async allComponentNames(): Promise<string[]> {
    return [...(await this.ensureComponentIndex('all')).values()].flat().map((c) => c.name);
  }

  /** Component (set) by id, key, or name (current page → all pages → library components used in the file). */
  async component(ref: string, opts: { libraryScan?: boolean } = {}): Promise<ComponentLike> {
    const r = ref.trim();
    if (/^I?\d+[:\-]\d+/.test(r)) {
      const n = await getNodeSafe(normalizeNodeId(r));
      if (n && (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET')) return n;
      if (n && n.type === 'INSTANCE') {
        const main = await n.getMainComponentAsync();
        if (main) return main.parent?.type === 'COMPONENT_SET' ? main.parent : main;
      }
      if (n) throw badRequest(`Node ${r} is a ${n.type}, not a component.`);
    }
    if (/^[0-9a-f]{40}$/i.test(r)) {
      try {
        return await figma.importComponentSetByKeyAsync(r);
      } catch {
        try {
          return await figma.importComponentByKeyAsync(r);
        } catch {
          throw notFound(`No published component or set with key ${r} is available to this file.`);
        }
      }
    }
    const key = r.toLowerCase();
    for (const scope of ['page', 'all'] as const) {
      const idx = await this.ensureComponentIndex(scope);
      const hits = idx.get(key);
      if (hits?.length) {
        if (hits.length > 1) this.warn(`${hits.length} components are named "${r}"; using ${hits[0].id}. Pass an id to choose.`);
        return hits[0];
      }
    }
    // Library components already used somewhere on this page.
    for (const inst of opts.libraryScan === false ? [] : figma.currentPage.findAllWithCriteria({ types: ['INSTANCE'] }).slice(0, 400)) {
      const main = await inst.getMainComponentAsync();
      if (!main) continue;
      const owner: ComponentLike = main.parent?.type === 'COMPONENT_SET' ? main.parent : main;
      if (owner.name.toLowerCase() === key) return owner;
    }
    const names = await this.allComponentNames();
    throw notFound(`Component "${r}" not found.${didYouMean(r, names)}${names.length ? '' : ' This file has no local components; create one with create_component or pass a library component key.'}`);
  }
}
