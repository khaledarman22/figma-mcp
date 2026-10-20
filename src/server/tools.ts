// MCP tool definitions. Each tool validates input, calls the plugin through the bridge and
// formats a compact answer (text, and images where seeing the result matters).

import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeError, type PluginInfo } from '../shared/protocol.ts';
import { clip, kebab, normalizeNodeId } from '../shared/util.ts';
import { loadAssetsFor, loadImage, searchIcons } from './assets.ts';
import { groupUsages, imageIdOf, matchImageFiles, parsePromptsFile, ratio, renderPromptsFile, type Usage } from './images.ts';
import { generate, type ComponentMapping, type XNode, type XVar } from './codegen.ts';
import { figmaPluginBundle, PathError, projectDir, resolveOutput, uniquePath } from './files.ts';
import { compact, truncateText, yaml } from './format.ts';
import { NO_PLUGIN_HELP, type Bridge } from './hub.ts';
import { log } from './log.ts';
import { exportTokens, summarizeVariables, type TokenFormat, type VariablesDump } from './tokens.ts';

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
interface ToolResult {
  [k: string]: unknown;
  content: Content[];
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

const MAX_TEXT = 90_000;

const fileParam = z.string().optional().describe('Which connected Figma file to use (file name, part of it, file key or session id). Omit to use the current one.');
const nodeIdParam = z.string().optional().describe('Node id ("12:34"), "12-34", or a Figma URL with ?node-id=. Omit to use the selection.');

function textResult(text: string, extra: Content[] = [], meta?: Record<string, unknown>): ToolResult {
  const t = truncateText(text, MAX_TEXT);
  return { content: [{ type: 'text', text: t.text }, ...extra], ...(meta ? { _meta: meta } : {}) };
}

function errorResult(e: unknown): ToolResult {
  if (e instanceof BridgeError) {
    const d = e.details === undefined ? undefined : compact(e.details);
    const details = d !== undefined && !(typeof d === 'object' && d !== null && !Object.keys(d).length) ? `\n${yaml(d)}` : '';
    return { isError: true, content: [{ type: 'text', text: `${e.code}: ${e.message}${details}` }] };
  }
  if (e instanceof PathError) return { isError: true, content: [{ type: 'text', text: `PATH: ${e.message}` }] };
  const msg = e instanceof Error ? e.message : String(e);
  return { isError: true, content: [{ type: 'text', text: msg }] };
}

export interface Ctx {
  bridge: Bridge;
  version: string;
}

const reloaded = new Map<string, boolean>();

/** A plugin running an older build gets the current bundle pushed into it (methods swap in place). */
async function ensureFresh(c: Ctx, file?: string): Promise<void> {
  if (c.version === 'dev' || !c.bridge.plugins_().length) return;
  let target: PluginInfo;
  try {
    target = c.bridge.pick(file ?? c.bridge.stickyTarget ?? undefined);
  } catch {
    return;
  }
  if (target.version === c.version || target.version === 'dev' || reloaded.has(target.sessionId)) return;
  reloaded.set(target.sessionId, false);
  const code = figmaPluginBundle();
  if (!code || !code.includes(c.version)) return;
  try {
    await c.bridge.request('__reload', { code }, { target: target.sessionId, timeoutMs: 30_000 });
    reloaded.set(target.sessionId, true);
    log(`updated plugin in "${target.file.name}" from ${target.version} to ${c.version}`);
  } catch (e) {
    log('plugin update failed:', e instanceof Error ? e.message : e);
  }
}

/** Calls the plugin and returns result + notes (multi-file choice, version drift). */
async function call<T>(c: Ctx, method: string, params: unknown, file?: string, timeoutMs?: number): Promise<{ result: T; notes: string[]; plugin?: PluginInfo }> {
  await ensureFresh(c, file);
  const r = await c.bridge.request<T>(method, params, { target: file, timeoutMs });
  const notes: string[] = [];
  if (r.note) notes.push(r.note);
  const pv = r.plugin?.version;
  if (pv && pv !== c.version && pv !== 'dev' && c.version !== 'dev' && !reloaded.get(r.plugin!.sessionId)) {
    notes.push(`The Figma plugin build (${pv}) differs from this server (${c.version}). Close and re-run "Figma MCP" in Figma to load the current build.`);
  }
  return { result: r.result, notes, plugin: r.plugin };
}

const withNotes = (text: string, notes: string[]) => (notes.length ? `${text}\n\n${notes.map((n) => `⚠ ${n}`).join('\n')}` : text);

function imageContent(img: { data?: string; format?: string }): Content | null {
  if (!img.data) return null;
  return { type: 'image', data: img.data, mimeType: img.format === 'JPG' ? 'image/jpeg' : 'image/png' };
}

async function screenshotOf(c: Ctx, nodeId: string, file?: string, maxPx = 1024): Promise<Content[]> {
  try {
    const { result } = await call<{ images: Array<{ data?: string; format?: string; error?: string }> }>(c, 'screenshot', { nodeId, maxPx }, file, 60_000);
    return result.images.map(imageContent).filter((x): x is Content => !!x);
  } catch (e) {
    log('screenshot after write failed', e instanceof Error ? e.message : e);
    return [];
  }
}

function wrap<A>(fn: (a: A) => Promise<ToolResult>) {
  return async (a: A): Promise<ToolResult> => {
    try {
      return await fn(a);
    } catch (e) {
      return errorResult(e);
    }
  };
}

function assetsPrefixFor(dir: string): string {
  const norm = dir.split(path.sep).join('/');
  const pub = norm.match(/\/public(\/.*)?$/);
  if (pub) return `${pub[1] ?? ''}/`;
  const proj = projectDir();
  if (proj && dir.startsWith(proj)) return `./${path.relative(proj, dir).split(path.sep).join('/')}/`;
  return `./${path.basename(dir)}/`;
}

async function loadAssetsOrThrow(raws: Parameters<typeof loadAssetsFor>[0]) {
  const { assets, errors } = await loadAssetsFor(raws);
  if (errors.length) throw new BridgeError('BAD_REQUEST', `Nothing was created — could not load assets:\n- ${errors.join('\n- ')}`);
  return assets;
}

export function registerTools(server: McpServer, c: Ctx) {
  // ───────────── status ─────────────
  server.registerTool(
    'status',
    {
      title: 'Figma connection status',
      description:
        'Start here. Shows whether Figma is connected (the "Figma MCP" plugin running in Figma Desktop), every connected file with its current page and selection, the pages, the file\'s stored design brief, and versions. If nothing is connected it says exactly what the user must do.',
      inputSchema: { file: fileParam },
      annotations: { readOnlyHint: true },
    },
    wrap(async ({ file }) => {
      const b = c.bridge;
      if (!b.plugins_().length) await b.waitForPlugin(20_000);
      const plugins = b.plugins_();
      const head = `figma-mcp ${c.version} · ${b.mode === 'hub' ? `hub on localhost:${b.port} (hosted by this session)` : b.mode === 'agent' ? `connected to hub on localhost:${b.port}` : `hub ${b.mode}`}`;
      if (!plugins.length) return textResult(`${head}\n\nNot connected. ${NO_PLUGIN_HELP}\nIf the plugin panel is open and says "Waiting for Claude Code…", it reconnects by itself — within seconds when Figma is in front, up to a minute when Figma's window is hidden behind others (bring Figma to the front to speed it up), then call status again.`);
      const { result, notes, plugin } = await call<Record<string, unknown>>(c, 'status', {}, file);
      const lines = [head, '', `Connected files (${plugins.length}):`];
      for (const p of plugins) {
        const sel = p.selection.length ? p.selection.slice(0, 5).map((s) => `${s.name} (${s.id}) ${s.type.toLowerCase()} ${s.w}×${s.h}`).join(', ') + (p.selection.length > 5 ? ` +${p.selection.length - 5}` : '') : 'nothing selected';
        lines.push(`- ${p.sessionId === plugin?.sessionId ? '▶' : ' '} "${p.file.name}" · page "${p.page.name}" · ${sel}${p.paused ? ' · PAUSED by the user' : ''} · session ${p.sessionId}`);
      }
      const r = result as { pages?: Array<{ name: string }>; brief?: string | null; user?: string | null };
      lines.push('', `Pages: ${(r.pages ?? []).map((p) => p.name).join(' · ')}`);
      if (r.user) lines.push(`User: ${r.user}`);
      lines.push(r.brief ? `Brief: ${r.brief} (brief tool → full text)` : 'Brief: none yet — after understanding the product, save one with the brief tool.');
      return textResult(withNotes(lines.join('\n'), notes));
    }),
  );

  // ───────────── reading ─────────────
  server.registerTool(
    'get_metadata',
    {
      title: 'Structure outline',
      description:
        'Cheap XML outline (ids, types, names, x/y/w/h, auto-layout direction, component of each instance, text content) of a node, the selection, or the whole current page. Use it to find ids and understand hierarchy before reading details, screenshots or edits. Large trees: lower depth, then drill into children.',
      inputSchema: {
        nodeId: nodeIdParam,
        depth: z.number().int().min(0).max(30).optional().describe('Levels below the root (default 4).'),
        maxNodes: z.number().int().min(10).max(5000).optional().describe('Stop after this many nodes (default 600).'),
        includeHidden: z.boolean().optional(),
        file: fileParam,
      },
      annotations: { readOnlyHint: true },
    },
    wrap(async ({ nodeId, depth, maxNodes, includeHidden, file }) => {
      const { result, notes } = await call<{ xml: string; nodes: number; truncated: boolean; page: { name: string } }>(c, 'metadata', { nodeId: nodeId && normalizeNodeId(nodeId), depth, maxNodes, includeHidden }, file);
      const tail = result.truncated ? `\n<!-- stopped at ${result.nodes} nodes; narrow with nodeId or depth -->` : '';
      return textResult(withNotes(`<!-- page "${result.page.name}" -->\n${result.xml}${tail}`, notes));
    }),
  );

  server.registerTool(
    'get_node',
    {
      title: 'Layer details',
      description:
        'Exact properties of layers: layout (dir/gap/pad/align), sizing (fill/hug/fixed), constraints, fills/strokes/effects with the variable ($name) or style (@Name) behind them, typography, component/instance properties, variable modes, interactions, children ids. Read this before editing something.',
      inputSchema: { ids: z.array(z.string()).max(30).optional().describe('Node ids (default: selection).'), file: fileParam },
      annotations: { readOnlyHint: true },
    },
    wrap(async ({ ids, file }) => {
      const { result, notes } = await call<{ nodes: unknown[] }>(c, 'get_nodes', { ids: ids?.map(normalizeNodeId) }, file);
      return textResult(withNotes(yaml(compact(result.nodes)), notes));
    }),
  );

  server.registerTool(
    'screenshot',
    {
      title: 'See layers',
      description:
        'Renders layers to images so you can check the result with your own eyes: cropped or overflowing text, overlaps, spacing rhythm, alignment, hierarchy, contrast. Use after building or editing, and before claiming a design is done.',
      inputSchema: {
        nodeId: nodeIdParam,
        nodeIds: z.array(z.string()).max(6).optional(),
        maxPx: z.number().int().min(64).max(2400).optional().describe('Longest side in px (default 1280).'),
        scale: z.number().min(0.05).max(4).optional().describe('Render scale before the maxPx cap (default 2).'),
        saveTo: z.string().optional().describe('Also write the PNGs into this folder (absolute, or relative to the project) — for clients that do not show tool images; open them with your image viewer tool.'),
        file: fileParam,
      },
      annotations: { readOnlyHint: true },
    },
    wrap(async ({ nodeId, nodeIds, maxPx, scale, saveTo, file }) => {
      const { result, notes } = await call<{ images: Array<{ nodeId: string; name: string; type?: string; w?: number; h?: number; scale?: number; data?: string; format?: string; error?: string }> }>(
        c,
        'screenshot',
        { nodeId: nodeId && normalizeNodeId(nodeId), nodeIds: nodeIds?.map(normalizeNodeId), maxPx, scale },
        file,
        90_000,
      );
      const content: Content[] = [];
      const captions: string[] = [];
      const dir = saveTo ? resolveOutput(saveTo) : null;
      if (dir) fs.mkdirSync(dir, { recursive: true });
      for (const img of result.images) {
        if (img.error) captions.push(`✕ ${img.name} (${img.nodeId}): ${img.error}`);
        else {
          let saved = '';
          if (dir && img.data) {
            const f = uniquePath(dir, kebab(img.name) || 'screenshot', img.format === 'JPG' ? 'jpg' : 'png', true);
            fs.writeFileSync(f, Buffer.from(img.data, 'base64'));
            saved = ` → ${f}`;
          }
          captions.push(`${img.name} (${img.nodeId}) ${img.type?.toLowerCase() ?? ''} ${img.w}×${img.h} @${img.scale}x${saved}`);
          const ic = imageContent(img);
          if (ic) content.push(ic);
        }
      }
      return { content: [{ type: 'text', text: withNotes(captions.join('\n'), notes) }, ...content] };
    }),
  );

  server.registerTool(
    'get_design_context',
    {
      title: 'Design → code context',
      description:
        'Pull a design for implementation (like Figma\'s get_design_context): reference code for a node — React + Tailwind (default) or HTML + CSS, or the raw extracted tree as JSON — plus the variables it uses (as CSS custom properties with values per mode), components and their properties, assets (icons/images; pass assetsDir to export them into the project), fonts, interactions, and a screenshot. ' +
        'The code mirrors Figma\'s layout engine (auto layout → flex/grid, fill/hug/fixed, constraints) and uses var(--token, fallback) for bound values. It is a precise SPEC: adapt it to the project\'s framework, existing components, tokens and conventions (load the figma-mcp to-code skill). Big screens: start from get_metadata and pull sections.',
      inputSchema: {
        nodeId: nodeIdParam,
        framework: z.enum(['react-tailwind', 'html-css', 'json']).optional().describe('Default react-tailwind.'),
        assetsDir: z.string().optional().describe('Absolute folder inside the user project to export the node\'s icons/images into (e.g. <project>/src/assets/figma). Omit to only list them.'),
        assetsPrefix: z.string().optional().describe('How code references exported assets (default derived from assetsDir, e.g. "/figma/" under public/).'),
        instances: z.enum(['inline', 'reference']).optional().describe('inline (default): render component internals; reference: emit <ComponentName .../> placeholders for instances (when the project already has those components).'),
        componentMap: z
          .record(
            z.object({
              import: z.string().optional(),
              name: z.string(),
              props: z.record(z.union([z.string(), z.object({ prop: z.string(), values: z.record(z.string()).optional() })])).optional(),
            }),
          )
          .optional()
          .describe('Figma component name → code component, e.g. {"Button": {"import": "@/components/ui/button", "name": "Button", "props": {"Type": {"prop": "variant", "values": {"Primary": "default"}}, "Label": "children"}}}.'),
        depth: z.number().int().min(1).max(60).optional(),
        maxNodes: z.number().int().min(20).max(4000).optional().describe('Default 1500.'),
        nodeIds: z.boolean().optional().describe('Add data-node-id attributes (default true).'),
        screenshot: z.boolean().optional().describe('Attach a screenshot (default true).'),
        file: fileParam,
      },
      annotations: { readOnlyHint: false },
    },
    wrap(async (a) => {
      const framework = a.framework ?? 'react-tailwind';
      const { result, notes } = await call<{
        root: XNode | null;
        context: { page?: string; screen?: { id: string; name: string; w: number; h: number }; topLevel: boolean; parentLayout: boolean; file: string };
        vars: Record<string, XVar>;
        styles: Record<string, { type: string; name: string }>;
        components: Record<string, { name: string; key?: string; description?: string; props?: Record<string, unknown>; remote?: boolean }>;
        assets: Array<{ id: string; nodeId: string; name: string; kind: 'svg' | 'image'; w: number; h: number; pending?: { imageId?: string; prompt?: string } }>;
        fonts: string[];
        stats: { nodes: number; truncated: boolean };
      }>(c, 'extract', { nodeId: a.nodeId && normalizeNodeId(a.nodeId), depth: a.depth, maxNodes: a.maxNodes, instances: a.instances }, a.file, 120_000);
      const root = result.root;
      if (!root) throw new BridgeError('NOT_FOUND', 'The node is hidden; nothing to extract (pass includeHidden via get_metadata to find visible children).');
      if (framework === 'json') return textResult(withNotes(JSON.stringify(compact(result)), notes), [], { 'anthropic/maxResultSizeChars': 200_000 });

      // Assets: export into the project if asked.
      const assetPaths: Record<string, string> = {};
      let assetNote = '';
      const pending = result.assets.filter((as) => as.pending);
      const ready = result.assets.filter((as) => !as.pending);
      if (a.assetsDir && result.assets.length) {
        const dir = resolveOutput(a.assetsDir);
        fs.mkdirSync(dir, { recursive: true });
        const prefix = a.assetsPrefix ?? assetsPrefixFor(dir);
        // Images that are not generated yet keep their future file name; nothing is exported for them.
        for (const as of pending) assetPaths[as.id] = `${prefix}${as.id}.png`;
        const items = ready.map((as) => (as.kind === 'svg' ? { nodeId: as.nodeId, format: 'SVG' } : { nodeId: as.nodeId, original: true, format: 'PNG', scale: 2 }));
        const ex = items.length ? await call<{ files: Array<{ nodeId: string; ext?: string; data?: string; error?: string }> }>(c, 'export', { items }, a.file, 120_000) : { result: { files: [] } };
        const written: string[] = [];
        ex.result.files.forEach((f, i) => {
          const as = ready[i];
          if (!f.data || f.error) {
            written.push(`✕ ${as.id}: ${f.error ?? 'no data'}`);
            return;
          }
          const file = uniquePath(dir, as.id, f.ext === 'svg' ? 'svg' : f.ext ?? 'png', true);
          fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
          assetPaths[as.id] = `${prefix}${path.basename(file)}`;
          written.push(path.basename(file));
        });
        assetNote = written.length ? ` → exported to ${dir}: ${written.join(', ')}` : '';
      } else {
        for (const as of result.assets) assetPaths[as.id] = `./assets/${as.id}.${as.kind === 'svg' ? 'svg' : 'png'}`;
        if (result.assets.length) assetNote = ' (not exported — pass assetsDir to write them into the project)';
      }

      const gen = generate(root, {
        framework,
        assetPaths,
        vars: result.vars,
        nodeIds: a.nodeIds,
        componentMap: a.componentMap as Record<string, ComponentMapping> | undefined,
        topLevel: result.context.topLevel,
      });

      const out: string[] = [];
      const ctxLine = [
        `${root.type} ${Math.round(root.w)}×${Math.round(root.h)}`,
        result.context.page ? `page "${result.context.page}"` : '',
        result.context.topLevel ? 'top-level screen' : result.context.screen ? `inside "${result.context.screen.name}" (${result.context.screen.w}×${result.context.screen.h})` : '',
      ].filter(Boolean).join(' · ');
      out.push(`# "${root.name}" (${root.id}) — ${ctxLine}`);
      out.push('', `## Code (${framework})`, '```' + (framework === 'html-css' ? 'html' : 'tsx'), gen.code, '```');
      if (gen.css) out.push('```css', gen.css, '```');

      const varNames = Object.keys(result.vars);
      if (varNames.length) {
        out.push('', `## Tokens (${varNames.length}) — Figma variable → CSS custom property`);
        for (const n of varNames) {
          const v = result.vars[n];
          const modes = v.modes ? ' · ' + Object.entries(v.modes).map(([m, val]) => `${m} ${val}`).join(' / ') : '';
          out.push(`- ${n} → ${v.css} = ${v.value}${modes} [${v.collection}]`);
        }
      }
      const styleNames = Object.values(result.styles);
      if (styleNames.length) out.push('', `## Styles: ${styleNames.map((s) => `${s.name} (${s.type})`).join(', ')}`);
      const comps = Object.values(result.components);
      if (comps.length) {
        out.push('', `## Components (${comps.length})`);
        for (const cm of comps) {
          const props = cm.props ? Object.entries(cm.props).map(([k, d]) => `${k}: ${(d as { type: string; options?: string[] }).options ? (d as { options: string[] }).options.join('|') : (d as { type: string }).type}`).join('; ') : '';
          out.push(`- ${cm.name}${cm.remote ? ' (library)' : ''}${props ? ` — ${props}` : ''}${cm.description ? ` — ${clip(cm.description, 100)}` : ''}`);
        }
        const icons = comps.filter((cm) => /^icon\/[a-z0-9-]+\/[a-z0-9-]+$/i.test(cm.name));
        if (icons.length) out.push(`  Icons come from Iconify sets (${[...new Set(icons.map((i) => i.name.split('/')[1]))].join(', ')}): prefer the matching icon package in code (e.g. lucide-react).`);
      }
      if (result.assets.length) {
        out.push('', `## Assets (${result.assets.length})${assetNote}`);
        for (const as of result.assets) {
          const wait = as.pending ? ` · NOT GENERATED YET${as.pending.imageId ? ` (${as.pending.imageId})` : ''} — run image_prompts; the user makes it, place_images puts it in Figma, then export again` : '';
          out.push(`- ${as.id} · ${as.kind} ${as.w}×${as.h} · node ${as.nodeId}${assetPaths[as.id] ? ` · ${assetPaths[as.id]}` : ''}${wait}`);
        }
      }
      const inter: string[] = [];
      const walk = (x: XNode) => {
        for (const r of x.reactions ?? []) inter.push(`- "${x.name}" (${x.id}): ${r.trigger.replace('on_', '')} → ${r.action}${r.toName ? ` "${r.toName}"` : r.url ? ` ${r.url}` : ''}${r.transition ? ` (${r.transition})` : ''}`);
        x.children?.forEach(walk);
      };
      walk(root);
      if (inter.length) out.push('', '## Interactions', ...inter);
      if (result.fonts.length) out.push('', `## Fonts: ${result.fonts.join(', ')}`);
      const noteList = [...gen.notes];
      if (result.context.topLevel) noteList.push(`Root is a ${Math.round(root.w)}px-wide screen: it is emitted fluid (w-full); keep fixed widths only where the design means them.`);
      if (result.stats.truncated) noteList.push(`Extraction stopped at ${result.stats.nodes} nodes — pull the truncated children separately.`);
      noteList.push('Reference code: keep layout semantics, map var(--…) to the project\'s tokens (export_tokens), reuse existing components, use semantic HTML and accessible names; do not add Tailwind if the project does not use it.');
      out.push('', '## Notes', ...noteList.map((n) => `- ${n}`));
      const shots = a.screenshot === false ? [] : await screenshotOf(c, root.id, a.file);
      return textResult(withNotes(out.join('\n'), notes), shots, { 'anthropic/maxResultSizeChars': 200_000 });
    }),
  );

  server.registerTool(
    'get_design_system',
    {
      title: 'Design system inventory',
      description:
        'What the file already has, in one call: variable collections (modes, values, aliases, scopes), text/color/effect styles, components and component sets (variant axes, properties, where they live), and enabled library variable collections. Use before designing (reuse instead of inventing) and before coding (map tokens and components).',
      inputSchema: {
        include: z.array(z.enum(['variables', 'styles', 'components'])).optional(),
        query: z.string().optional().describe('Filter components by name.'),
        file: fileParam,
      },
      annotations: { readOnlyHint: true },
    },
    wrap(async ({ include, query, file }) => {
      const { result, notes } = await call<{
        file: string;
        pages: string[];
        variables?: VariablesDump & { libraries?: Array<{ name: string; library: string }> };
        styles?: { text: Array<Record<string, unknown>>; paint: Array<Record<string, unknown>>; effect: Array<Record<string, unknown>>; grid: Array<Record<string, unknown>> };
        components?: { components: Array<Record<string, unknown>>; total: number };
      }>(c, 'design_system', { include, query }, file, 120_000);
      const out: string[] = [`# Design system of "${result.file}"`, `Pages: ${result.pages.join(' · ')}`];
      if (result.variables) {
        out.push('', `## Variables (${result.variables.variables.length})`);
        out.push(result.variables.variables.length ? summarizeVariables(result.variables) : 'none');
        if (result.variables.libraries?.length) out.push(`Library collections available: ${result.variables.libraries.map((l) => `${l.library} / ${l.name}`).join(', ')}`);
      }
      if (result.styles) {
        const s = result.styles;
        out.push('', `## Styles`);
        out.push(`Text (${s.text.length}):`, ...s.text.map((t) => `- ${t.name}: ${t.family} ${t.style} ${t.size}/${t.lineHeight}${t.letterSpacing ? ` ls ${t.letterSpacing}` : ''}${t.case ? ` ${t.case}` : ''}`));
        out.push(`Color (${s.paint.length}):`, ...s.paint.map((p) => `- ${p.name}: ${p.value}${(p.vars as string[] | undefined)?.length ? ` (${(p.vars as string[]).join(', ')})` : ''}`));
        out.push(`Effect (${s.effect.length}):`, ...s.effect.map((e) => `- ${e.name}: ${e.value}`));
        if (s.grid.length) out.push(`Grid (${s.grid.length}):`, ...s.grid.map((g) => `- ${g.name}`));
      }
      if (result.components) {
        out.push('', `## Components (${result.components.total})`);
        for (const cm of result.components.components) {
          const axes = cm.axes ? Object.entries(cm.axes as Record<string, string[]>).map(([k, v]) => `${k}: ${v.join('|')}`).join('; ') : '';
          const props = cm.props ? Object.entries(cm.props as Record<string, string>).map(([k, v]) => `${k} ${v}`).join('; ') : '';
          out.push(`- ${cm.name} (${cm.kind}${cm.variants ? `, ${cm.variants} variants` : ''}, ${cm.size}, page "${cm.page}", id ${cm.id})${axes ? ` · ${axes}` : ''}${props ? ` · ${props}` : ''}`);
        }
        if (result.components.total > result.components.components.length) out.push(`… ${result.components.total - result.components.components.length} more (use query)`);
      }
      return textResult(withNotes(out.join('\n'), notes));
    }),
  );

  server.registerTool(
    'export_tokens',
    {
      title: 'Variables → code tokens',
      description:
        'Export Figma variables as code: css (custom properties; non-default modes under [data-<collection>="<mode>"]), tailwind (v4 @theme), scss, dtcg (W3C design tokens JSON) or json. Names follow each variable\'s WEB code syntax (else --kebab-name), matching get_design_context. Optionally write outFile (absolute, inside the user\'s project).',
      inputSchema: {
        format: z.enum(['css', 'tailwind', 'scss', 'dtcg', 'json']),
        collections: z.array(z.string()).optional().describe('Only these collections.'),
        modeSelector: z.enum(['data', 'class']).optional().describe('data (default): [data-theme="dark"]; class: .dark'),
        outFile: z.string().optional(),
        file: fileParam,
      },
      annotations: { readOnlyHint: false },
    },
    wrap(async ({ format, collections, modeSelector, outFile, file }) => {
      const { result, notes } = await call<VariablesDump>(c, 'variables_read', {}, file);
      let dump = result;
      if (collections?.length) {
        const want = new Set(collections.map((x) => x.toLowerCase()));
        const ids = new Set(dump.collections.filter((x) => want.has(x.name.toLowerCase())).map((x) => x.id));
        dump = { collections: dump.collections.filter((x) => ids.has(x.id)), variables: dump.variables.filter((v) => ids.has(v.collectionId)) };
      }
      if (!dump.variables.length) return textResult(withNotes('This file has no local variables to export.', notes));
      const text = exportTokens(dump, format as TokenFormat, { modeSelector });
      let where = '';
      if (outFile) {
        const out = resolveOutput(outFile);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, text);
        where = `Wrote ${out}\n\n`;
      }
      return textResult(withNotes(`${where}\`\`\`${format === 'dtcg' || format === 'json' ? 'json' : format === 'scss' ? 'scss' : 'css'}\n${text}\`\`\``, notes), [], { 'anthropic/maxResultSizeChars': 200_000 });
    }),
  );

  server.registerTool(
    'search',
    {
      title: 'Find layers',
      description: 'Find layers by name and/or text content (current page by default, allPages for the whole file, or within a node), optionally by type (FRAME, TEXT, INSTANCE, COMPONENT, …). Returns ids, types and paths.',
      inputSchema: {
        query: z.string().optional(),
        types: z.array(z.string()).optional(),
        in: z.enum(['name', 'text', 'both']).optional(),
        within: z.string().optional(),
        allPages: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        file: fileParam,
      },
      annotations: { readOnlyHint: true },
    },
    wrap(async ({ query, types, in: where, within, allPages, limit, file }) => {
      const { result, notes } = await call<{ results: Array<Record<string, unknown>>; scanned: number; more: boolean }>(
        c,
        'search',
        { query, types, in: where, within: within && normalizeNodeId(within), allPages, limit },
        file,
        90_000,
      );
      const lines = result.results.map((r) => `- ${r.id} ${String(r.type).toLowerCase()} "${r.name}"${r.path ? ` · ${r.path}` : ''}${r.page && allPages ? ` · page ${r.page}` : ''}${r.text ? ` · "${r.text}"` : ''}`);
      return textResult(withNotes(`${result.results.length} match(es)${result.more ? ' (limit reached)' : ''} in ${result.scanned} layers\n${lines.join('\n')}`, notes));
    }),
  );

  // ───────────── writing ─────────────
  server.registerTool(
    'build',
    {
      title: 'Build from spec',
      description:
        'Create layers from a declarative JSON spec in one call. Frames are auto layout by default (dir row|column|grid, gap, pad, align, justify, wrap), sizing w/h = number | "fill" | "hug", text with font props or a text style, shapes, svg, icons ("lucide:search" — fetched from Iconify and kept as reusable icon components), images (absolute file path or URL), component instances (component + variant + props + overrides), variables as "$name" (colors, numbers) and styles as "@Name", CSS-like shadows/borders/gradients, inline interactions, rtl rows. Everything is validated first (names of variables/styles/components/fonts) and the build is atomic. ' +
        'Read the figma-mcp skill (references/build-spec.md) for the vocabulary. Returns ids per "ref" and, with screenshot: true, an image to check.',
      inputSchema: {
        spec: z.record(z.any()).describe('Root node spec (type, name, children, …).'),
        page: z.string().optional().describe('Page by English name — "App" (or "App – <name>" per app), "Web", "Dashboard", "Banners", "References"… Created on first use (an untouched "Page 1" is renamed instead). Default: current page.'),
        parentId: z.string().optional().describe('Put it inside this frame/section/page (default: current page, placed in free space).'),
        index: z.number().int().optional(),
        replaceId: z.string().optional().describe('Replace this layer (same parent and position) with the new one; the old one moves to the Trash page.'),
        allowDuplicate: z.boolean().optional().describe('A top-level layer with the same name on the page is refused (update it instead). true only when a second copy is really wanted.'),
        x: z.number().optional(),
        y: z.number().optional(),
        icons: z.enum(['component', 'inline']).optional().describe('component (default): icons become reusable components; inline: plain vectors.'),
        focus: z.boolean().optional().describe('Select and zoom to the result (default true).'),
        screenshot: z.boolean().optional().describe('Return a screenshot of the result (default true for top-level builds).'),
        file: fileParam,
      },
      annotations: { destructiveHint: false },
    },
    wrap(async (a) => {
      const assets = await loadAssetsOrThrow([{ spec: a.spec }]);
      const { result, notes } = await call<{ root: { id: string; name: string; type: string; w: number; h: number; x: number; y: number }; page?: string; ids: Record<string, string>; created: number; interactions: number; warnings: string[] }>(
        c,
        'build',
        { spec: a.spec, assets, page: a.page, parentId: a.parentId && normalizeNodeId(a.parentId), index: a.index, replaceId: a.replaceId && normalizeNodeId(a.replaceId), x: a.x, y: a.y, icons: a.icons, focus: a.focus, allowDuplicate: a.allowDuplicate },
        a.file,
        240_000,
      );
      const text = yaml(compact({ built: result.root, page: result.page, layers: result.created, interactions: result.interactions || undefined, ids: result.ids, warnings: result.warnings }));
      const wantShot = a.screenshot ?? !a.parentId;
      const shots = wantShot ? await screenshotOf(c, result.root.id, a.file) : [];
      return textResult(withNotes(text, notes), shots);
    }),
  );

  server.registerTool(
    'edit',
    {
      title: 'Edit layers',
      description:
        'Batch changes to existing layers, in order, sharing refs: set {id|ids, props: any build prop}, text {id, text}, rename, delete {ids} (moves them to the Trash page; permanent: true really deletes), restore {ids, parent?} (back from Trash), move {id, parent?, index?, x?, y?}, duplicate {id, count?, ref?}, insert {parent, index?, spec}, wrap {ids, spec: frame props}, unwrap, swap {id, component, variant?}, detach, reset (overrides), to-component, combine-variants {ids, name}, group, ungroup, flatten, boolean {ids, operation}, select {ids}, page {name, create?}, place-image {id, src} (put a real image into a placeholder). Stops at the first failing op and reports what was applied.',
      inputSchema: {
        ops: z.array(z.record(z.any())).min(1).describe('[{op: "set", id: "12:3", props: {fill: "$color/bg", pad: 16}}, …]'),
        focus: z.boolean().optional(),
        screenshot: z.string().optional().describe('Node id to screenshot after the edits.'),
        file: fileParam,
      },
      annotations: { destructiveHint: true },
    },
    wrap(async ({ ops, focus, screenshot, file }) => {
      const raws = (ops as Array<Record<string, unknown>>).flatMap((o) => {
        const r: Array<{ spec: unknown; partial?: boolean }> = [];
        if (o.spec) r.push({ spec: o.spec, partial: o.op !== 'insert' && o.op !== 'wrap' });
        if (o.props) r.push({ spec: o.props, partial: o.op === 'set' });
        if (o.op === 'place-image' && typeof o.src === 'string') r.push({ spec: { type: 'image', src: o.src } });
        return r;
      });
      const assets = raws.length ? await loadAssetsOrThrow(raws) : undefined;
      const normalized = (ops as Array<Record<string, unknown>>).map((o) => ({
        ...o,
        ...(typeof o.id === 'string' ? { id: normalizeNodeId(o.id) } : {}),
        ...(Array.isArray(o.ids) ? { ids: (o.ids as string[]).map(normalizeNodeId) } : {}),
        ...(typeof o.parent === 'string' ? { parent: normalizeNodeId(o.parent) } : {}),
      }));
      const { result, notes } = await call<Record<string, unknown>>(c, 'edit', { ops: normalized, focus, assets }, file, 180_000);
      const shots = screenshot ? await screenshotOf(c, normalizeNodeId(screenshot), file) : [];
      const res = result as { ok: boolean };
      const out = textResult(withNotes(yaml(compact(result)), notes), shots);
      if (!res.ok) out.isError = true;
      return out;
    }),
  );

  server.registerTool(
    'variables',
    {
      title: 'Create/update variables',
      description:
        'Upsert variable collections, modes and variables by name. collections: [{name, modes?: ["Light","Dark"], hidden?: true (primitives → hidden from pickers), variables: [{name: "color/bg/default", value: "#fff" | values: {Light: "#fff", Dark: "$color/neutral/950"}, type?, scopes?, codeSyntax?, description?}]}]. Types are inferred (hex → color, number → float); "$name" or "$Collection:name" makes an alias; scopes are inferred from names when omitted; WEB code syntax defaults to var(--kebab-name). Also delete / deleteCollections.',
      inputSchema: {
        collections: z.array(z.record(z.any())).optional(),
        delete: z.array(z.string()).optional(),
        deleteCollections: z.array(z.string()).optional(),
        file: fileParam,
      },
      annotations: { destructiveHint: false },
    },
    wrap(async (a) => {
      const { result, notes } = await call<Record<string, unknown>>(c, 'variables', { collections: a.collections, delete: a.delete, deleteCollections: a.deleteCollections }, a.file, 180_000);
      const r = result as { errors?: string[] };
      const out = textResult(withNotes(yaml(compact(result)), notes));
      if (r.errors?.length) out.content[0] = { type: 'text', text: (out.content[0] as { text: string }).text + '\n\n⚠ Some items failed (see errors); the rest were applied.' };
      return out;
    }),
  );

  server.registerTool(
    'styles',
    {
      title: 'Create/update styles',
      description:
        'Upsert local styles by name. text: [{name: "Heading/H1", font: "700 32/40 Inter" | {family, weight, size, lineHeight, letterSpacing, case}, …}] (sizes/line-heights may be "$variables"); paint: [{name, fill: "#hex" | "$var" | gradient}]; effect: [{name, effects: "0 4 12 -2 rgba(0,0,0,.12)"}]; grid: [{name, grids: [{pattern: "columns", count: 12, gutter: 24, offset: 32}]}]; delete: [names].',
      inputSchema: {
        text: z.array(z.record(z.any())).optional(),
        paint: z.array(z.record(z.any())).optional(),
        effect: z.array(z.record(z.any())).optional(),
        grid: z.array(z.record(z.any())).optional(),
        delete: z.array(z.string()).optional(),
        file: fileParam,
      },
      annotations: { destructiveHint: false },
    },
    wrap(async (a) => {
      const { result, notes } = await call<Record<string, unknown>>(c, 'styles', { text: a.text, paint: a.paint, effect: a.effect, grid: a.grid, delete: a.delete }, a.file, 120_000);
      return textResult(withNotes(yaml(compact(result)), notes));
    }),
  );

  server.registerTool(
    'create_component',
    {
      title: 'Create component / variant set',
      description:
        'Create a component, or a component set from variant axes, on the Components page (created on first use). spec: base layout (same vocabulary as build; mark layers with ref). variants: {axes: {Size: ["sm","md"], State: ["Default","Hover","Disabled"]}, patches: [{when: {State: "Hover"}, set: {root: {fill: "$color/primary/hover"}, label: {color: "…"}}}], exclude?: [...]}. ' +
        'props: {Label: {type: "text", default: "Button"}, "Show icon": {type: "boolean", default: false}, Icon: {type: "instance", default: "icon/lucide/plus"}} bound by layers with bind: {text: "Label"} / {visible: "Show icon"} / {swap: "Icon"}. interactions: [{from: {State: "Default"}, trigger: "hover", to: {State: "Hover"}}] wires interactive components. Variants are laid out in a labelled grid.',
      inputSchema: {
        name: z.string(),
        spec: z.record(z.any()),
        variants: z
          .object({
            axes: z.record(z.array(z.string())),
            patches: z.array(z.object({ when: z.record(z.union([z.string(), z.array(z.string())])).optional(), set: z.record(z.any()) })).optional(),
            exclude: z.array(z.record(z.union([z.string(), z.array(z.string())]))).optional(),
          })
          .optional(),
        props: z.record(z.any()).optional(),
        interactions: z.array(z.object({ from: z.record(z.union([z.string(), z.array(z.string())])).optional(), trigger: z.any().optional(), to: z.record(z.string()), transition: z.any().optional() })).optional(),
        description: z.string().optional(),
        page: z.string().optional().describe('Default: the "Components" page (all components live there; created on first use).'),
        allowDuplicate: z.boolean().optional().describe('A component with the same name on that page is refused (update it instead).'),
        parentId: z.string().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        gap: z.number().optional(),
        screenshot: z.boolean().optional().describe('Default true.'),
        file: fileParam,
      },
      annotations: { destructiveHint: false },
    },
    wrap(async (a) => {
      const assets = await loadAssetsOrThrow([{ spec: a.spec, variants: a.variants as never }]);
      const { result, notes } = await call<{ component?: { id: string }; componentSet?: { id: string } } & Record<string, unknown>>(
        c,
        'create_component',
        { ...a, parentId: a.parentId && normalizeNodeId(a.parentId), assets, file: undefined, screenshot: undefined },
        a.file,
        300_000,
      );
      const id = result.componentSet?.id ?? result.component?.id;
      const shots = a.screenshot !== false && id ? await screenshotOf(c, id, a.file) : [];
      return textResult(withNotes(yaml(compact(result)), notes), shots);
    }),
  );

  server.registerTool(
    'prototype',
    {
      title: 'Prototype interactions',
      description:
        'Wire the prototype. links: [{from: "<layer id | ref | \"Screen > Layer\" name path>", trigger: "click"|"hover"|"press"|"drag"|"after 800ms"|"key Escape"|…, action: "navigate"|"overlay"|"swap"|"scroll-to"|"change-to"|"back"|"close"|"url"|"set-mode"|"set-variable", to: "<frame id | top-level frame name | \"Screen > Layer\">", transition: "smart-animate 300ms ease-out" | "slide-in left 250ms gentle" | "instant"}]. flows: [{name, start}], scroll: [{id, overflow: "vertical", fixed: 1}], clear: [ids], replace: true replaces existing reactions on the sources. read: true lists all flows and interactions (use it to review or to build routes in code).',
      inputSchema: {
        links: z.array(z.record(z.any())).optional(),
        replace: z.boolean().optional(),
        flows: z.array(z.object({ name: z.string(), start: z.string() })).optional(),
        replaceFlows: z.boolean().optional(),
        scroll: z.array(z.object({ id: z.string(), overflow: z.string().optional(), fixed: z.number().int().optional() })).optional(),
        clear: z.array(z.string()).optional(),
        read: z.union([z.boolean(), z.object({ root: z.string().optional() })]).optional(),
        file: fileParam,
      },
      annotations: { destructiveHint: false },
    },
    wrap(async (a) => {
      if (a.read) {
        const root = typeof a.read === 'object' ? a.read.root : undefined;
        const { result, notes } = await call<Record<string, unknown>>(c, 'prototype_read', { root: root && normalizeNodeId(root) }, a.file, 90_000);
        return textResult(withNotes(yaml(compact(result)), notes));
      }
      const links = (a.links ?? []).map((l) => ({ ...l, ...(typeof l.from === 'string' ? { from: normalizeNodeId(l.from as string) } : {}), ...(typeof l.to === 'string' && /^\d+[-:]\d+$/.test(l.to as string) ? { to: normalizeNodeId(l.to as string) } : {}) }));
      const { result, notes } = await call<Record<string, unknown>>(
        c,
        'prototype',
        { links, replace: a.replace, flows: a.flows?.map((f) => ({ ...f, start: normalizeNodeId(f.start) })), replaceFlows: a.replaceFlows, scroll: a.scroll?.map((s) => ({ ...s, id: normalizeNodeId(s.id) })), clear: a.clear?.map(normalizeNodeId) },
        a.file,
        120_000,
      );
      return textResult(withNotes(yaml(compact(result)), notes));
    }),
  );

  server.registerTool(
    'lint',
    {
      title: 'Audit against principles',
      description:
        'Audit a node, the selection or the current page: WCAG contrast, collapsed/clipped text, raw colors/spacing/radii not bound to variables, text without styles, hand-positioned frames that should be auto layout, detached instances, touch targets under 24px, generic layer names, off-grid spacing, empty frames, hidden layers — plus stats (font sizes, radii, gaps in use). fix: true (or a list of rules) binds raw values to the single exactly-matching variable.',
      inputSchema: {
        nodeId: nodeIdParam,
        rules: z.array(z.string()).optional(),
        fix: z.union([z.boolean(), z.array(z.string())]).optional(),
        grid: z.number().int().min(1).max(32).optional().describe('Spacing grid (default 4).'),
        limit: z.number().int().min(5).max(500).optional(),
        file: fileParam,
      },
      annotations: { destructiveHint: false },
    },
    wrap(async ({ nodeId, rules, fix, grid, limit, file }) => {
      const { result, notes } = await call<Record<string, unknown>>(c, fix ? 'lint' : 'lint', { nodeId: nodeId && normalizeNodeId(nodeId), rules, fix, grid, limit }, file, 180_000);
      const r = result as { issues: Array<{ rule: string; severity: string; id: string; name: string; message: string; fixed?: boolean }>; summary: Record<string, number>; fixed: number; more: number; stats: Record<string, unknown>; scope: unknown };
      const lines = [
        `Scope: ${yaml(r.scope)}`,
        `Summary: ${Object.entries(r.summary).map(([k, v]) => `${k} ${v}`).join(' · ') || 'clean ✓'}${r.fixed ? ` · fixed ${r.fixed}` : ''}`,
        '',
        ...r.issues.map((i) => `${i.fixed ? '✓' : i.severity === 'error' ? '✕' : i.severity === 'warn' ? '!' : '·'} [${i.rule}] ${i.name} (${i.id}): ${i.message}`),
        r.more ? `… ${r.more} more` : '',
        '',
        `Stats: ${yaml(r.stats)}`,
      ];
      return textResult(withNotes(lines.filter((l) => l !== undefined).join('\n'), notes));
    }),
  );

  server.registerTool(
    'export',
    {
      title: 'Export to files',
      description:
        'Export layers to files in the user\'s project: PNG/JPG (scale, default 2x), SVG, PDF, or the original image bytes of an image fill (original: true). dir must be inside the user\'s project (relative paths resolve against it); writing into the figma-mcp tool folder is refused.',
      inputSchema: {
        items: z.array(z.object({ nodeId: z.string(), format: z.enum(['PNG', 'JPG', 'SVG', 'PDF']).optional(), scale: z.number().min(0.1).max(6).optional(), original: z.boolean().optional(), name: z.string().optional() })).min(1).max(60),
        dir: z.string().describe('Output folder (absolute, or relative to the project).'),
        overwrite: z.boolean().optional(),
        file: fileParam,
      },
      annotations: { destructiveHint: false },
    },
    wrap(async ({ items, dir, overwrite, file }) => {
      const out = resolveOutput(dir);
      const { result, notes } = await call<{ files: Array<{ nodeId: string; name: string; ext?: string; data?: string; error?: string }> }>(
        c,
        'export',
        { items: items.map((i) => ({ ...i, nodeId: normalizeNodeId(i.nodeId) })) },
        file,
        180_000,
      );
      fs.mkdirSync(out, { recursive: true });
      const lines: string[] = [];
      for (const f of result.files) {
        if (!f.data || f.error) {
          lines.push(`✕ ${f.name} (${f.nodeId}): ${f.error ?? 'no data'}`);
          continue;
        }
        const target = uniquePath(out, kebab(f.name) || 'export', f.ext ?? 'png', !!overwrite);
        fs.writeFileSync(target, Buffer.from(f.data, 'base64'));
        lines.push(`✓ ${target} (${Math.round((f.data.length * 3) / 4 / 1024)} KB)`);
      }
      return textResult(withNotes(lines.join('\n'), notes));
    }),
  );

  server.registerTool(
    'execute',
    {
      title: 'Run Plugin API code',
      description:
        'Run JavaScript inside Figma with the full Plugin API (figma.*) for anything the other tools do not cover (boolean geometry, custom vector math, bulk renames, reading exotic properties). Write plain JS with top-level await and return (the return value comes back as JSON; console.log lines too). Helper kit `h`: node(id), build(spec), set(node, props), loadFonts(node), font(family, weight), variable(name), component(name), style(name, type), solid(color), bindFill(node, var), bind(node, field, var), focus(nodes), place(node), inspect(node). The file uses dynamic page loading: use async APIs (getNodeByIdAsync, setCurrentPageAsync, getMainComponentAsync, set*StyleIdAsync). Prefer build/edit for layout work.',
      inputSchema: {
        code: z.string().min(1),
        params: z.any().optional().describe('Passed to the script as `params`.'),
        timeoutMs: z.number().int().min(1000).max(300_000).optional(),
        file: fileParam,
      },
      annotations: { destructiveHint: true },
    },
    wrap(async ({ code, params, timeoutMs, file }) => {
      const { result, notes } = await call<{ result: unknown; logs: string[]; warnings: string[] }>(c, 'execute', { code, params, timeoutMs }, file, (timeoutMs ?? 60_000) + 10_000);
      const parts: string[] = [];
      if (result.logs.length) parts.push(`console:\n${result.logs.map((l) => `· ${l}`).join('\n')}`);
      parts.push(`result:\n${result.result === undefined ? '(nothing returned — return ids/values you need next)' : yaml(result.result)}`);
      if (result.warnings.length) parts.push(`warnings:\n${result.warnings.map((w) => `- ${w}`).join('\n')}`);
      return textResult(withNotes(parts.join('\n\n'), notes));
    }),
  );

  server.registerTool(
    'fonts',
    {
      title: 'Available fonts',
      description: 'Font families installed/available in Figma with their exact style names (e.g. "Semi Bold" vs "SemiBold"), filtered by query.',
      inputSchema: { query: z.string().optional(), limit: z.number().int().min(1).max(200).optional(), file: fileParam },
      annotations: { readOnlyHint: true },
    },
    wrap(async ({ query, limit, file }) => {
      const { result, notes } = await call<{ families: Array<{ family: string; styles: string[] }>; total: number }>(c, 'fonts', { query, limit }, file);
      return textResult(withNotes(`${result.total} famil${result.total === 1 ? 'y' : 'ies'}${query ? ` matching "${query}"` : ''}\n${result.families.map((f) => `- ${f.family}: ${f.styles.join(', ')}`).join('\n')}`, notes));
    }),
  );

  server.registerTool(
    'icons',
    {
      title: 'Search icons',
      description: 'Search Iconify icon names to use as {type: "icon", icon: "set:name"} in build — e.g. set "lucide", "tabler", "ph", "material-symbols", "heroicons", "mdi". Keep one icon set per product.',
      inputSchema: { query: z.string().min(1), set: z.string().optional(), limit: z.number().int().min(1).max(120).optional() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    wrap(async ({ query, set, limit }) => {
      const r = await searchIcons(query, set, limit ?? 30);
      return textResult(r.icons.length ? `${r.icons.length} of ${r.total}: ${r.icons.join(', ')}` : `No icons for "${query}"${set ? ` in "${set}"` : ''}.`);
    }),
  );

  server.registerTool(
    'image_prompts',
    {
      title: 'Image prompts → Markdown',
      description:
        'Writes every image the design is waiting for into a Markdown hand-off file in the user\'s project (default <project>/IMAGE_PROMPTS.md): IMG id, where it is used, exact pixel size and ratio, the file name to save as, and the generation prompt. Layers wait for an image when they were built as {type: "image", prompt} or got {prompt} via edit set; the same prompt shares one id. Run it after adding or changing image placeholders. The user generates the images, then call place_images.',
      inputSchema: {
        outFile: z.string().optional().describe('Markdown path (absolute, or relative to the project). Default IMAGE_PROMPTS.md.'),
        imagesDir: z.string().optional().describe('Folder (relative to the Markdown file) the user saves the images into. Default "images".'),
        scale: z.number().int().min(1).max(4).optional().describe('Pixel density of the requested sizes (default 2; 3 for phone apps that ship @3x).'),
        style: z.string().optional().describe('Shared art direction for all images (palette, lighting, mood, medium), written once at the top. Kept from the existing file when omitted.'),
        within: z.string().optional().describe('Only images inside this node.'),
        file: fileParam,
      },
      annotations: { destructiveHint: false },
    },
    wrap(async (a) => {
      const { result, notes, plugin } = await call<{ placeholders: Usage[] }>(c, 'placeholders', { within: a.within && normalizeNodeId(a.within), allPages: true }, a.file, 120_000);
      const figmaName = plugin?.file.name ?? 'Figma';
      let md = resolveOutput(a.outFile ?? 'IMAGE_PROMPTS.md');
      let prev = fs.existsSync(md) ? parsePromptsFile(fs.readFileSync(md, 'utf8')) : undefined;
      if (!a.outFile && prev?.meta.title && prev.meta.title !== figmaName) {
        // Another Figma file already owns IMAGE_PROMPTS.md here: ids would collide.
        md = resolveOutput(`IMAGE_PROMPTS-${kebab(figmaName) || 'figma'}.md`);
        prev = fs.existsSync(md) ? parsePromptsFile(fs.readFileSync(md, 'utf8')) : undefined;
      }
      const scale = a.scale ?? prev?.meta.scale ?? 2;
      const imagesDir = a.imagesDir ?? prev?.meta.imagesDir ?? 'images';
      const entries = groupUsages(result.placeholders);
      if (!entries.length && !prev) return textResult(withNotes('No image is waiting for generation — nothing written. Images that do not exist yet are built as {type: "image", name, prompt}.', notes));
      fs.mkdirSync(path.dirname(md), { recursive: true });
      fs.writeFileSync(md, renderPromptsFile({ title: figmaName, entries, scale, imagesDir, style: a.style ?? prev?.meta.style, previous: prev?.entries }));
      if (entries.length) fs.mkdirSync(path.join(path.dirname(md), imagesDir), { recursive: true });
      const lines = [`Wrote ${md} — ${entries.length} image(s) to generate (${result.placeholders.length} layer(s)).`];
      for (const e of entries) lines.push(`- ${e.imageId} ${e.title}: ${Math.round(e.w * scale)}×${Math.round(e.h * scale)}px, ratio ${ratio(e.w, e.h)}, used ${e.usages.length}×${e.prompt ? '' : ' — NO PROMPT: set one with edit set {prompt}'}`);
      if (entries.length) lines.push('', `Tell the user: generate them into ${path.join(path.dirname(md), imagesDir)} with names starting with the id (IMG-001.png…), then say so; you run place_images.`);
      return textResult(withNotes(lines.join('\n'), notes));
    }),
  );

  server.registerTool(
    'place_images',
    {
      title: 'Place generated images',
      description:
        'Puts the images the user generated into the layers waiting for them: files in the images folder whose names start with an IMG id (IMG-001.png, img-2-hero.jpg…), or an explicit files map. Every layer with that id gets the image (cover), placeholder captions go away, overlays on existing frames are kept, and IMAGE_PROMPTS.md marks them placed. Reports what is still missing.',
      inputSchema: {
        files: z.record(z.string()).optional().describe('Explicit {"IMG-001": "/path/photo.jpg"} when the user sent files with other names.'),
        dir: z.string().optional().describe('Folder with the images (default: the images folder recorded in the prompts file).'),
        promptsFile: z.string().optional().describe('The prompts Markdown (default IMAGE_PROMPTS.md in the project).'),
        fit: z.enum(['fill', 'fit', 'crop']).optional().describe('How the image fills its box (default fill = cover).'),
        file: fileParam,
      },
      annotations: { destructiveHint: false },
    },
    wrap(async (a) => {
      const { result, notes, plugin } = await call<{ placeholders: Usage[] }>(c, 'placeholders', { allPages: true }, a.file, 120_000);
      let md = resolveOutput(a.promptsFile ?? 'IMAGE_PROMPTS.md');
      if (!a.promptsFile && plugin) {
        const alt = resolveOutput(`IMAGE_PROMPTS-${kebab(plugin.file.name) || 'figma'}.md`);
        if (fs.existsSync(alt)) md = alt;
      }
      const prev = fs.existsSync(md) ? parsePromptsFile(fs.readFileSync(md, 'utf8')) : undefined;
      const dir = a.dir ? resolveOutput(a.dir) : path.join(path.dirname(md), prev?.meta.imagesDir ?? 'images');
      const { byId, unmatched } = matchImageFiles(dir);
      for (const [k, v] of Object.entries(a.files ?? {})) {
        const id = imageIdOf(k) ?? k;
        byId.set(id, v.startsWith('/') || v.startsWith('~') ? v : resolveOutput(v));
      }
      const entries = groupUsages(result.placeholders);
      const placed: Array<{ id: string; file: string; layers: number }> = [];
      const problems: string[] = [];
      for (const e of entries) {
        const f = byId.get(e.imageId);
        if (!f) continue;
        try {
          const img = await loadImage(f);
          if (!img.data) throw new Error('SVG cannot fill an image box — export it as PNG.');
          await call(c, 'place_image', { ids: e.usages.map((u) => u.nodeId), imageData: img.data, fit: a.fit }, a.file, 90_000);
          placed.push({ id: e.imageId, file: path.basename(f), layers: e.usages.length });
        } catch (err) {
          problems.push(`${e.imageId} (${path.basename(f)}): ${err instanceof Error ? err.message : err}`);
        }
      }
      const placedIds = new Set(placed.map((p) => p.id));
      // The prompts file keeps its own list (image_prompts decides what is in it); only statuses change here.
      const listed = prev ? new Set(prev.entries.keys()) : undefined;
      const waiting = entries.filter((e) => !placedIds.has(e.imageId));
      const left = waiting.filter((e) => !listed || listed.has(e.imageId));
      const unlisted = waiting.filter((e) => listed && !listed.has(e.imageId));
      if (prev) {
        const rel = path.relative(path.dirname(md), dir) || '.';
        const history = new Map(prev.entries);
        for (const p of placed) {
          const status = `placed ✓ (${rel}/${p.file})`;
          const old = history.get(p.id);
          history.set(p.id, { status, block: (old?.block ?? `## ${p.id}`).replace(/^- \*\*Status:\*\* .+$/m, `- **Status:** ${status}`) });
        }
        fs.writeFileSync(md, renderPromptsFile({ title: prev.meta.title ?? plugin?.file.name ?? 'Figma', entries: left, scale: prev.meta.scale ?? 2, imagesDir: prev.meta.imagesDir ?? 'images', style: prev.meta.style, previous: history }));
      }
      const lines = [
        placed.length ? `Placed ${placed.length} image(s): ${placed.map((p) => `${p.id} ← ${p.file}${p.layers > 1 ? ` (${p.layers} layers)` : ''}`).join(', ')}.` : `No images placed (looked in ${dir}).`,
        left.length ? `Still waiting: ${left.map((e) => e.imageId).join(', ')}.` : unlisted.length ? 'Everything in the prompts file is placed.' : 'Nothing is waiting for an image any more.',
      ];
      if (unlisted.length) lines.push(`Also waiting but not in ${path.basename(md)} yet: ${unlisted.map((e) => e.imageId).join(', ')} — run image_prompts to add them.`);
      const known = new Set(entries.map((e) => e.imageId));
      const stray = [...byId.keys()].filter((id) => !known.has(id) && !prev?.entries.get(id)?.status.startsWith('placed'));
      if (stray.length) lines.push(`No layer is waiting for: ${stray.join(', ')} (already placed, or the layer was removed).`);
      if (unmatched.length) lines.push(`Ignored (name does not start with IMG-###): ${unmatched.join(', ')}`);
      if (problems.length) lines.push('Problems:', ...problems.map((p) => `- ${p}`));
      if (placed.length) lines.push('Screenshot the affected screens to check the crops.');
      return textResult(withNotes(lines.join('\n'), notes));
    }),
  );

  server.registerTool(
    'brief',
    {
      title: 'Design brief (stored in the file)',
      description:
        'The design brief lives inside the Figma file so every session continues with the same understanding: product, audience, goals, visual direction, conventions, decisions. action get (default) | set (replace) | append (adds a dated line).',
      inputSchema: { action: z.enum(['get', 'set', 'append']).optional(), text: z.string().optional(), file: fileParam },
      annotations: { destructiveHint: false },
    },
    wrap(async ({ action, text, file }) => {
      const { result, notes } = await call<{ brief: string | null }>(c, 'brief', { action, text }, file);
      return textResult(withNotes(result.brief ?? 'No brief stored in this file yet.', notes));
    }),
  );
}
