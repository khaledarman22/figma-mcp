// Variables: bulk upsert (collections, modes, values, aliases, scopes, code syntax) and full read.

import { parseColor } from '../shared/color.ts';
import { didYouMean, kebab } from '../shared/util.ts';
import { Ctx } from './ctx.ts';
import { badRequest } from './errors.ts';

export interface VarDef {
  name: string;
  type?: string;
  value?: unknown;
  values?: Record<string, unknown>;
  scopes?: string[] | 'auto';
  codeSyntax?: { web?: string; ios?: string; android?: string } | string | false;
  description?: string;
  hidden?: boolean;
}

export interface CollectionDef {
  name: string;
  modes?: string[];
  renameModes?: Record<string, string>;
  hidden?: boolean;
  variables?: VarDef[];
}

export interface VariablesParams {
  collections?: CollectionDef[];
  delete?: string[];
  deleteCollections?: string[];
}

const TYPES: Record<string, VariableResolvedDataType> = {
  color: 'COLOR', number: 'FLOAT', float: 'FLOAT', dimension: 'FLOAT', spacing: 'FLOAT', string: 'STRING', text: 'STRING', boolean: 'BOOLEAN', bool: 'BOOLEAN',
};

const ALL_SCOPES: VariableScope[] = [
  'ALL_SCOPES', 'TEXT_CONTENT', 'CORNER_RADIUS', 'WIDTH_HEIGHT', 'GAP', 'ALL_FILLS', 'FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR',
  'STROKE_FLOAT', 'EFFECT_FLOAT', 'EFFECT_COLOR', 'OPACITY', 'COLOR_OPACITY', 'FONT_FAMILY', 'FONT_STYLE', 'FONT_WEIGHT', 'FONT_SIZE', 'LINE_HEIGHT',
  'LETTER_SPACING', 'PARAGRAPH_SPACING', 'PARAGRAPH_INDENT',
];

/** Scopes from the token's name — keeps primitives and semantics out of the wrong pickers. */
export function inferScopes(name: string, type: VariableResolvedDataType): VariableScope[] | null {
  const n = name.toLowerCase();
  if (type === 'COLOR') {
    if (/(shadow|elevation)/.test(n)) return ['EFFECT_COLOR'];
    if (/(border|stroke|outline|divider|separator|ring)/.test(n)) return ['STROKE_COLOR'];
    if (/(^|[/\-_])(text|fg|foreground|on-|label|heading|body|link|content)/.test(n)) return ['TEXT_FILL'];
    if (/icon/.test(n)) return ['SHAPE_FILL', 'STROKE_COLOR'];
    if (/(bg|background|surface|fill|canvas|container|overlay|backdrop|layer|card|page)/.test(n)) return ['FRAME_FILL', 'SHAPE_FILL'];
    return ['ALL_FILLS', 'STROKE_COLOR', 'EFFECT_COLOR'];
  }
  if (type === 'FLOAT') {
    if (/(font-?size|text-?size|type-?size)/.test(n)) return ['FONT_SIZE'];
    if (/(line-?height|leading)/.test(n)) return ['LINE_HEIGHT'];
    if (/(letter-?spacing|tracking)/.test(n)) return ['LETTER_SPACING'];
    if (/(font-?weight)/.test(n)) return ['FONT_WEIGHT'];
    if (/paragraph/.test(n)) return ['PARAGRAPH_SPACING'];
    if (/(radius|radii|corner|rounded)/.test(n)) return ['CORNER_RADIUS'];
    if (/(border-?width|stroke-?width|stroke)/.test(n)) return ['STROKE_FLOAT'];
    if (/(opacity|alpha)/.test(n)) return ['OPACITY'];
    if (/(blur|shadow|elevation)/.test(n)) return ['EFFECT_FLOAT'];
    if (/(space|spacing|gap|padding|margin|inset|gutter|stack)/.test(n)) return ['GAP'];
    if (/(size|width|height|dimension|breakpoint)/.test(n)) return ['WIDTH_HEIGHT'];
    return null;
  }
  if (type === 'STRING') {
    if (/(family|typeface|font-?name)/.test(n)) return ['FONT_FAMILY'];
    if (/(font-?style|weight)/.test(n)) return ['FONT_STYLE'];
    return ['TEXT_CONTENT'];
  }
  return null;
}

async function inferType(def: VarDef, aliasTypes: Map<string, VariableResolvedDataType>, ctx: Ctx): Promise<VariableResolvedDataType | undefined> {
  if (def.type) {
    const t = TYPES[def.type.toLowerCase()];
    if (!t) throw badRequest(`variable "${def.name}": unknown type "${def.type}" (color, number, string, boolean).`);
    return t;
  }
  const samples = def.values ? Object.values(def.values) : [def.value];
  for (const v of samples) {
    if (typeof v === 'number') return 'FLOAT';
    if (typeof v === 'boolean') return 'BOOLEAN';
    if (typeof v === 'string') {
      if (v.startsWith('$')) {
        const t = aliasTypes.get(v.slice(1).toLowerCase());
        if (t) return t;
        try {
          return (await ctx.variable(v)).resolvedType;
        } catch {
          continue; // maybe defined later in this same call
        }
      }
      if (parseColor(v)) return 'COLOR';
      if (/^-?\d*\.?\d+(px)?$/.test(v.trim())) return 'FLOAT';
      return 'STRING';
    }
    if (v && typeof v === 'object' && 'r' in (v as object)) return 'COLOR';
  }
  return undefined;
}

async function toValue(raw: unknown, type: VariableResolvedDataType, ctx: Ctx, where: string): Promise<VariableValue> {
  if (typeof raw === 'string' && raw.startsWith('$')) {
    const target = await ctx.variable(raw);
    if (target.resolvedType !== type) throw badRequest(`${where}: alias ${raw} is ${target.resolvedType}, expected ${type}.`);
    return figma.variables.createVariableAlias(target);
  }
  if (raw && typeof raw === 'object' && 'alias' in (raw as object)) return toValue(`$${String((raw as { alias: string }).alias).replace(/^\$/, '')}`, type, ctx, where);
  switch (type) {
    case 'COLOR': {
      if (raw && typeof raw === 'object' && 'r' in (raw as object)) {
        const c = raw as { r: number; g: number; b: number; a?: number };
        return { r: c.r, g: c.g, b: c.b, a: c.a ?? 1 };
      }
      const c = parseColor(String(raw));
      if (!c) throw badRequest(`${where}: cannot read color ${JSON.stringify(raw)}.`);
      return c;
    }
    case 'FLOAT': {
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
      if (!Number.isFinite(n)) throw badRequest(`${where}: expected a number, got ${JSON.stringify(raw)}.`);
      return n;
    }
    case 'BOOLEAN':
      return raw === true || raw === 'true';
    default:
      return String(raw);
  }
}

export async function upsertVariables(p: VariablesParams) {
  const ctx = new Ctx();
  const report: Array<Record<string, unknown>> = [];
  const errors: string[] = [];

  // Pass 0: collections and modes.
  const plan: Array<{ coll: VariableCollection; def: CollectionDef }> = [];
  for (const def of p.collections ?? []) {
    if (!def.name) throw badRequest('every collection needs a name.');
    const existing = (await ctx.collections()).find((c) => c.name.toLowerCase() === def.name.toLowerCase());
    const coll = existing ?? figma.variables.createVariableCollection(def.name);
    const modesAdded: string[] = [];
    if (def.renameModes) {
      for (const [from, to] of Object.entries(def.renameModes)) {
        const m = coll.modes.find((x) => x.name.toLowerCase() === from.toLowerCase());
        if (m) coll.renameMode(m.modeId, to);
        else errors.push(`collection "${def.name}": no mode "${from}" to rename.`);
      }
    }
    if (def.modes?.length) {
      if (!existing) coll.renameMode(coll.modes[0].modeId, def.modes[0]);
      else if (coll.modes.length === 1 && /^mode 1$/i.test(coll.modes[0].name)) coll.renameMode(coll.modes[0].modeId, def.modes[0]);
      for (const m of def.modes) {
        if (coll.modes.some((x) => x.name.toLowerCase() === m.toLowerCase())) continue;
        try {
          coll.addMode(m);
          modesAdded.push(m);
        } catch (e) {
          errors.push(`collection "${def.name}": could not add mode "${m}" (${e instanceof Error ? e.message : e}). Your Figma plan may limit modes per collection.`);
        }
      }
    } else if (!existing && /^mode 1$/i.test(coll.modes[0].name)) {
      coll.renameMode(coll.modes[0].modeId, 'Default');
    }
    plan.push({ coll, def });
    report.push({ collection: coll.name, id: coll.id, created: !existing, modes: coll.modes.map((m) => m.name), modesAdded });
  }
  ctx.invalidateVariables();

  // Pass 1: create or find variables (so aliases inside the same call resolve).
  const aliasTypes = new Map<string, VariableResolvedDataType>();
  for (const { def } of plan) for (const v of def.variables ?? []) if (v.type && TYPES[v.type.toLowerCase()]) aliasTypes.set(v.name.toLowerCase(), TYPES[v.type.toLowerCase()]);
  // Two rounds so alias-typed variables can learn their type from earlier ones.
  const created: Array<{ v: Variable; def: VarDef; coll: VariableCollection; isNew: boolean }> = [];
  const pending: Array<{ def: VarDef; coll: VariableCollection; collDef: CollectionDef }> = [];
  for (const { coll, def } of plan) for (const v of def.variables ?? []) pending.push({ def: v, coll, collDef: def });
  const localByKey = new Map<string, Variable>();
  for (const x of await figma.variables.getLocalVariablesAsync()) localByKey.set(`${x.variableCollectionId}::${x.name}`, x);
  for (let round = 0; round < 3 && pending.length; round++) {
    for (let i = 0; i < pending.length; ) {
      const { def, coll } = pending[i];
      const existing = localByKey.get(`${coll.id}::${def.name}`);
      let type = existing?.resolvedType;
      if (!type) {
        try {
          type = await inferType(def, aliasTypes, ctx);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
          pending.splice(i, 1);
          continue;
        }
      }
      if (!type) {
        i++;
        continue;
      }
      aliasTypes.set(def.name.toLowerCase(), type);
      aliasTypes.set(`${coll.name.toLowerCase()}:${def.name.toLowerCase()}`, type);
      const v = existing ?? figma.variables.createVariable(def.name, coll, type);
      localByKey.set(`${coll.id}::${def.name}`, v);
      created.push({ v, def, coll, isNew: !existing });
      pending.splice(i, 1);
    }
  }
  for (const { def } of pending) errors.push(`variable "${def.name}": cannot infer its type; add "type".`);
  ctx.invalidateVariables();

  // Pass 2: values, scopes, code syntax, descriptions.
  let updated = 0;
  for (const { v, def, coll, isNew } of created) {
    const collDef = plan.find((x) => x.coll === coll)?.def;
    try {
      if (def.values) {
        for (const [modeName, raw] of Object.entries(def.values)) {
          const mode = coll.modes.find((m) => m.name.toLowerCase() === modeName.toLowerCase());
          if (!mode) {
            errors.push(`variable "${def.name}": collection "${coll.name}" has no mode "${modeName}".${didYouMean(modeName, coll.modes.map((m) => m.name))}`);
            continue;
          }
          v.setValueForMode(mode.modeId, await toValue(raw, v.resolvedType, ctx, `variable "${def.name}" [${modeName}]`));
        }
      } else if (def.value !== undefined) {
        const val = await toValue(def.value, v.resolvedType, ctx, `variable "${def.name}"`);
        for (const m of coll.modes) v.setValueForMode(m.modeId, val);
      } else if (isNew) {
        errors.push(`variable "${def.name}": created without a value — give "value" or "values".`);
      }
      const hidden = def.hidden ?? collDef?.hidden;
      if (Array.isArray(def.scopes)) {
        const bad = def.scopes.filter((s) => !ALL_SCOPES.includes(s as VariableScope));
        if (bad.length) errors.push(`variable "${def.name}": unknown scopes ${bad.join(', ')}.${didYouMean(bad[0], ALL_SCOPES)}`);
        else v.scopes = def.scopes as VariableScope[];
      } else if (hidden) {
        v.scopes = [];
      } else if (isNew || def.scopes === 'auto') {
        const s = inferScopes(def.name, v.resolvedType);
        if (s) v.scopes = s;
      }
      if (def.codeSyntax !== false) {
        const cs = typeof def.codeSyntax === 'string' ? { web: def.codeSyntax } : def.codeSyntax;
        if (cs?.web) v.setVariableCodeSyntax('WEB', cs.web);
        else if (isNew) v.setVariableCodeSyntax('WEB', `var(--${kebab(def.name)})`);
        if (cs?.ios) v.setVariableCodeSyntax('iOS', cs.ios);
        if (cs?.android) v.setVariableCodeSyntax('ANDROID', cs.android);
      }
      if (def.description !== undefined) v.description = def.description;
      updated++;
    } catch (e) {
      errors.push(`variable "${def.name}": ${e instanceof Error ? e.message : e}`);
    }
  }

  // Deletions.
  const deleted: string[] = [];
  for (const name of p.delete ?? []) {
    try {
      const v = await ctx.variable(name);
      v.remove();
      deleted.push(name);
    } catch (e) {
      errors.push(`delete "${name}": ${e instanceof Error ? e.message : e}`);
    }
  }
  for (const name of p.deleteCollections ?? []) {
    try {
      const c = await ctx.collectionByName(name);
      c.remove();
      deleted.push(`collection ${name}`);
    } catch (e) {
      errors.push(`delete collection "${name}": ${e instanceof Error ? e.message : e}`);
    }
  }

  return {
    collections: report,
    variables: { created: created.filter((c) => c.isNew).length, updated: updated - created.filter((c) => c.isNew).length },
    deleted,
    errors,
    sample: created.slice(0, 8).map(({ v }) => ({ name: v.name, type: v.resolvedType, scopes: v.scopes, web: v.codeSyntax.WEB })),
  };
}

// ───────────── read ─────────────

export type VarValueOut = string | number | boolean | { r: number; g: number; b: number; a: number } | { alias: string; name?: string; collection?: string };

/** Full dump: collections, modes, every variable's values per mode (aliases with names). */
export async function readVariables(p: { collection?: string; includeLibraries?: boolean } = {}) {
  const [collections, vars] = await Promise.all([figma.variables.getLocalVariableCollectionsAsync(), figma.variables.getLocalVariablesAsync()]);
  const byId = new Map(vars.map((v) => [v.id, v]));
  const collName = new Map(collections.map((c) => [c.id, c.name]));
  const external = new Map<string, { name: string; collection?: string }>();
  const wantColl = p.collection?.toLowerCase();
  const colls = collections.filter((c) => !wantColl || c.name.toLowerCase() === wantColl);
  const outVars: Array<Record<string, unknown>> = [];
  for (const v of vars) {
    if (!colls.some((c) => c.id === v.variableCollectionId)) continue;
    const values: Record<string, VarValueOut> = {};
    for (const [modeId, val] of Object.entries(v.valuesByMode)) {
      if (val && typeof val === 'object' && 'type' in val && (val as VariableAlias).type === 'VARIABLE_ALIAS') {
        const id = (val as VariableAlias).id;
        let target = byId.get(id) ? { name: byId.get(id)!.name, collection: collName.get(byId.get(id)!.variableCollectionId) } : external.get(id);
        if (!target) {
          const t = await figma.variables.getVariableByIdAsync(id);
          if (t) {
            const tc = await figma.variables.getVariableCollectionByIdAsync(t.variableCollectionId);
            target = { name: t.name, collection: tc?.name };
          } else target = { name: '?' };
          external.set(id, target);
        }
        values[modeId] = { alias: id, name: target.name, collection: target.collection };
      } else values[modeId] = val as VarValueOut;
    }
    outVars.push({
      id: v.id,
      key: v.key,
      name: v.name,
      collectionId: v.variableCollectionId,
      type: v.resolvedType,
      scopes: v.scopes,
      codeSyntax: v.codeSyntax,
      description: v.description || undefined,
      hidden: v.hiddenFromPublishing || undefined,
      values,
    });
  }
  let libraries: Array<Record<string, unknown>> | undefined;
  if (p.includeLibraries) {
    try {
      const libs = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
      libraries = libs.map((l) => ({ name: l.name, library: l.libraryName, key: l.key }));
    } catch {
      libraries = [];
    }
  }
  return {
    collections: colls.map((c) => ({
      id: c.id,
      name: c.name,
      modes: c.modes.map((m) => ({ id: m.modeId, name: m.name })),
      defaultModeId: c.defaultModeId,
      hidden: c.hiddenFromPublishing || undefined,
      count: c.variableIds.length,
    })),
    variables: outVars,
    libraries,
  };
}
