// MCP tool definitions. Each tool validates input, calls the plugin through the bridge and
// formats a compact answer (text, and images where seeing the result matters).

import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeError, type PluginInfo } from '../shared/protocol.ts';
import { clip, kebab, normalizeNodeId } from '../shared/util.ts';
import { loadAssetsFor, loadImage, searchIcons } from './assets.ts';
import { BRIEF_FIELDS, briefGaps, groupUsages, imageIdOf, matchImageFiles, parsePromptsFile, ratio, renderPromptsFile, type Usage } from './images.ts';
import { generate, type ComponentMapping, type XNode, type XVar } from './codegen.ts';
import { figmaPluginBundle, PathError, projectDir, resolveOutput, uniquePath } from './files.ts';
import { compact, truncateText, yaml } from './format.ts';
import { NO_PLUGIN_HELP, type Bridge } from './hub.ts';
import { log } from './log.ts';
import { exportTokens, summarizeVariables, type TokenFormat, type VariablesDump } from './tokens.ts';
import { addToLibrary, describeItem, readLibrary, searchLibrary, writeLibrary, type LibraryItem } from './library.ts';
import { ensureWorkspace, findWorkspace, lookalikes, markSynced, readCatalog, usesInstances, writeCatalog, writeDesignMd, writeSkill, type CatalogItem, type Workspace } from './workspace.ts';

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

/** Design work on a file opens its workspace folder in the project (once); returns a note the first time. */
function openWorkspace(plugin: PluginInfo | undefined, notes: string[]): Workspace | null {
  if (!plugin) return null;
  try {
    const ws = ensureWorkspace(plugin.file);
    if (ws?.created) notes.push(`Opened the design workspace for "${plugin.file.name}": ${ws.dir} — references, image prompts, images and the identity live there (workspace sync writes DESIGN.md, tokens and the project skill).`);
    return ws;
  } catch (e) {
    log('workspace:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** The workspace of the file a call will go to, before calling (null when unknown). */
async function workspaceOf(c: Ctx, file?: string): Promise<Workspace | null> {
  try {
    if (!c.bridge.plugins_().length) await c.bridge.waitForPlugin(10_000);
    return findWorkspace(c.bridge.pick(file ?? c.bridge.stickyTarget ?? undefined).file);
  } catch {
    return null;
  }
}

/** Rewrites COMPONENTS.md / components.json from the file (with usage), so every later request knows what exists. */
async function refreshCatalog(c: Ctx, ws: Workspace | null, file?: string): Promise<CatalogItem[] | null> {
  if (!ws) return null;
  try {
    const { result } = await call<{ components: CatalogItem[] }>(c, 'components', { usage: true, limit: 400 }, file, 120_000);
    writeCatalog(ws, result.components);
    return result.components;
  } catch (e) {
    log('component catalog:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** Build/insert warnings about hand-drawn copies of existing components. */
function componentWarnings(specs: unknown[], catalog: CatalogItem[] | null, topLevel: boolean): string[] {
  if (!catalog?.length) return [];
  const out = specs.flatMap((s) => lookalikes(s, catalog));
  const real = catalog.filter((x) => !/^icon\//i.test(x.name));
  if (topLevel && real.length && !specs.some(usesInstances)) out.push(`No component instance in this build, but the file has ${real.length} component(s) (${real.slice(0, 8).map((x) => x.name).join(', ')}${real.length > 8 ? ', …' : ''}) — COMPONENTS.md in the workspace says how to place each one.`);
  return out;
}

const COMPONENT_OPS = new Set(['to-component', 'combine-variants', 'swap', 'detach', 'delete', 'restore']);

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
      const ws = plugin ? findWorkspace(plugin.file) : null;
      for (const p of plugins) {
        const sel = p.selection.length ? p.selection.slice(0, 5).map((s) => `${s.name} (${s.id}) ${s.type.toLowerCase()} ${s.w}×${s.h}`).join(', ') + (p.selection.length > 5 ? ` +${p.selection.length - 5}` : '') : 'nothing selected';
        lines.push(`- ${p.sessionId === plugin?.sessionId ? '▶' : ' '} "${p.file.name}" · page "${p.page.name}" · ${sel}${p.paused ? ' · PAUSED by the user' : ''} · session ${p.sessionId}`);
      }
      const r = result as { pages?: Array<{ name: string }>; brief?: string | null; user?: string | null };
      lines.push('', `Pages: ${(r.pages ?? []).map((p) => p.name).join(' · ')}`);
      if (r.user) lines.push(`User: ${r.user}`);
      lines.push(r.brief ? `Brief: ${r.brief} (brief tool → full text)` : 'Brief: none yet — after understanding the product, save one with the brief tool.');
      lines.push(ws ? `Workspace: ${ws.dir}${ws.meta.synced ? ` · synced ${ws.meta.synced.slice(0, 16).replace('T', ' ')}` : ' · not synced yet (workspace sync)'}` : projectDir() ? 'Workspace: none yet — opened in <project>/design/<file>/ on the first design change.' : 'Workspace: project folder unknown.');
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
        'The code mirrors Figma\'s layout engine (auto layout → flex/grid, fill/hug/fixed, constraints) and uses var(--token, fallback) for bound values. It is a precise SPEC: adapt it to the project\'s framework, existing components, tokens and conventions (the to-code guide of the figma-mcp skill). Big screens: start from get_metadata and pull sections.',
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
        'Create layers from a declarative JSON spec in one call. Frames are auto layout by default (dir row|column|grid, gap, pad, align, justify, wrap), sizing w/h = number | "fill" | "hug", text with font props or a text style, shapes, svg, icons ("lucide:search" — fetched from Iconify and kept as reusable icon components), images (absolute file path or URL), component instances (component + variant + props + overrides), variables as "$name" (colors, numbers) and styles as "@Name", CSS-like shadows/borders/gradients, inline interactions, rtl rows. Top-level iPhone screens (device iphone-*/mobile) get the phone look — radius, bezel, status bar, home indicator (mockup: false to skip); the first design on a page sets its canvas to a neutral gray. Everything is validated first (names of variables/styles/components/fonts) and the build is atomic. ' +
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
      const pre = await workspaceOf(c, a.file);
      const catalog = pre ? readCatalog(pre) ?? (await refreshCatalog(c, pre, a.file)) : null;
      const { result, notes, plugin } = await call<{ root: { id: string; name: string; type: string; w: number; h: number; x: number; y: number }; page?: string; ids: Record<string, string>; created: number; interactions: number; warnings: string[] }>(
        c,
        'build',
        { spec: a.spec, assets, page: a.page, parentId: a.parentId && normalizeNodeId(a.parentId), index: a.index, replaceId: a.replaceId && normalizeNodeId(a.replaceId), x: a.x, y: a.y, icons: a.icons, focus: a.focus, allowDuplicate: a.allowDuplicate },
        a.file,
        240_000,
      );
      const ws = openWorkspace(plugin, notes);
      if (ws && !pre) await refreshCatalog(c, ws, a.file);
      const warnings = [...(result.warnings ?? []), ...componentWarnings([a.spec], catalog, !a.parentId)];
      const text = yaml(compact({ built: result.root, page: result.page, layers: result.created, interactions: result.interactions || undefined, ids: result.ids, warnings }));
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
        'Batch changes to existing layers, in order, sharing refs: set {id|ids, props: any build prop}, text {id, text}, rename, delete {ids} (moves them to the Trash page; permanent: true really deletes), restore {ids, parent?} (back from Trash), move {id, parent?, index?, x?, y?}, duplicate {id, count?, ref?}, insert {parent, index?, spec}, wrap {ids, spec: frame props}, unwrap, swap {id, component, variant?}, detach, reset (overrides), to-component, combine-variants {ids, name}, group, ungroup, flatten, boolean {ids, operation}, select {ids}, page {name, create?, background? (canvas color)}, place-image {id, src} (put a real image into a placeholder). Stops at the first failing op and reports what was applied.',
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
      const ws = await workspaceOf(c, file);
      const insertSpecs = (ops as Array<Record<string, unknown>>).filter((o) => o.op === 'insert' && o.spec).map((o) => o.spec);
      const catalog = ws && insertSpecs.length ? readCatalog(ws) : null;
      const { result, notes } = await call<Record<string, unknown>>(c, 'edit', { ops: normalized, focus, assets }, file, 180_000);
      const shots = screenshot ? await screenshotOf(c, normalizeNodeId(screenshot), file) : [];
      const res = result as { ok: boolean; warnings?: string[] };
      const extra = componentWarnings(insertSpecs, catalog, false);
      if (extra.length) res.warnings = [...(res.warnings ?? []), ...extra];
      if (ws && (ops as Array<Record<string, unknown>>).some((o) => COMPONENT_OPS.has(String(o.op)))) await refreshCatalog(c, ws, file);
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
      const { result, notes, plugin } = await call<Record<string, unknown>>(c, 'variables', { collections: a.collections, delete: a.delete, deleteCollections: a.deleteCollections }, a.file, 180_000);
      openWorkspace(plugin, notes);
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
      const { result, notes, plugin } = await call<Record<string, unknown>>(c, 'styles', { text: a.text, paint: a.paint, effect: a.effect, grid: a.grid, delete: a.delete }, a.file, 120_000);
      openWorkspace(plugin, notes);
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
      const { result, notes, plugin } = await call<{ component?: { id: string }; componentSet?: { id: string } } & Record<string, unknown>>(
        c,
        'create_component',
        { ...a, parentId: a.parentId && normalizeNodeId(a.parentId), assets, file: undefined, screenshot: undefined },
        a.file,
        300_000,
      );
      const ws = openWorkspace(plugin, notes);
      const catalog = await refreshCatalog(c, ws, a.file);
      if (catalog) {
        notes.push(`COMPONENTS.md in ${ws!.dir} lists it now — build screens with instances of it, and swap any hand-drawn copies (search by name → edit swap).`);
        const idle = catalog.filter((x) => x.inDesigns === 0 && !/^icon\//i.test(x.name) && x.name.toLowerCase() !== a.name.trim().toLowerCase());
        if (idle.length >= 2) notes.push(`${idle.length} other components are not used by any design yet (${idle.slice(0, 8).map((x) => x.name).join(', ')}${idle.length > 8 ? ', …' : ''}). Stop making components: build the section that uses them now. Make a component only for the section you are building next (unless the user asked for a UI kit).`);
      }
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
        'Writes every image the design is waiting for into a Markdown hand-off file — by default IMAGE_PROMPTS.md in the file\'s design workspace (<project>/design/<file>/): IMG id, where it is used, exact pixel size and ratio, the file name to save as, a preview screenshot of the screen it goes into, and the generation prompt. Images the user supplies (built with {supply}: logo, product photos) are listed apart under "from you", to be saved into assets/. Layers wait for an image when they were built as {type: "image", prompt|supply} or got {prompt|supply} via edit set; the same prompt shares one id. Run it after adding or changing image placeholders. The user generates the images, then call place_images.',
      inputSchema: {
        outFile: z.string().optional().describe('Markdown path (absolute, or relative to the project). Default: IMAGE_PROMPTS.md in the design workspace.'),
        imagesDir: z.string().optional().describe('Folder (relative to the Markdown file) the user saves generated images into. Default "images".'),
        assetsDir: z.string().optional().describe('Folder (relative to the Markdown file) for images the user supplies. Default "assets" in the workspace.'),
        scale: z.number().int().min(1).max(4).optional().describe('Pixel density of the requested sizes (default 2; 3 for phone apps that ship @3x).'),
        style: z.string().optional().describe('Shared art direction for all images (palette, lighting, mood, medium), written once at the top. Kept from the existing file when omitted.'),
        previews: z.boolean().optional().describe('Save a screenshot of the screen each image goes into under previews/ and link it (default true in the workspace).'),
        within: z.string().optional().describe('Only images inside this node.'),
        file: fileParam,
      },
      annotations: { destructiveHint: false },
    },
    wrap(async (a) => {
      const { result, notes, plugin } = await call<{ placeholders: Usage[] }>(c, 'placeholders', { within: a.within && normalizeNodeId(a.within), allPages: true }, a.file, 120_000);
      const figmaName = plugin?.file.name ?? 'Figma';
      const ws = a.outFile ? null : openWorkspace(plugin, notes);
      let md = a.outFile ? resolveOutput(a.outFile) : ws ? path.join(ws.dir, 'IMAGE_PROMPTS.md') : resolveOutput('IMAGE_PROMPTS.md');
      let prev = fs.existsSync(md) ? parsePromptsFile(fs.readFileSync(md, 'utf8')) : undefined;
      if (!a.outFile && !ws && prev?.meta.title && prev.meta.title !== figmaName) {
        // Another Figma file already owns IMAGE_PROMPTS.md here: ids would collide.
        md = resolveOutput(`IMAGE_PROMPTS-${kebab(figmaName) || 'figma'}.md`);
        prev = fs.existsSync(md) ? parsePromptsFile(fs.readFileSync(md, 'utf8')) : undefined;
      }
      const scale = a.scale ?? prev?.meta.scale ?? 2;
      const imagesDir = a.imagesDir ?? prev?.meta.imagesDir ?? 'images';
      const assetsDir = a.assetsDir ?? prev?.meta.assetsDir ?? (ws ? 'assets' : imagesDir);
      const entries = groupUsages(result.placeholders);
      if (!entries.length && !prev) return textResult(withNotes('No image is waiting — nothing written. Images that do not exist yet are built as {type: "image", name, prompt} (or supply for the user\'s own files).', notes));
      const base = path.dirname(md);
      fs.mkdirSync(base, { recursive: true });
      if (a.previews ?? !!ws) {
        // One screenshot per screen; the gray boxes in it carry their IMG ids.
        const shots = new Map<string, string>();
        const pdir = path.join(base, 'previews');
        for (const e of entries) {
          const u = e.usages[0];
          const target = u.screenId ?? u.nodeId;
          if (!shots.has(target)) {
            try {
              const { result: shot } = await call<{ images: Array<{ data?: string }> }>(c, 'screenshot', { nodeId: target, maxPx: 1200 }, a.file, 60_000);
              const data = shot.images[0]?.data;
              if (!data) continue;
              fs.mkdirSync(pdir, { recursive: true });
              const f = path.join(pdir, `${kebab(u.screen ?? '') || kebab(target)}.png`);
              fs.writeFileSync(f, Buffer.from(data, 'base64'));
              shots.set(target, path.relative(base, f).split(path.sep).join('/'));
            } catch (err) {
              log('preview failed', err instanceof Error ? err.message : err);
              continue;
            }
          }
          e.preview = shots.get(target);
        }
      }
      fs.writeFileSync(md, renderPromptsFile({ title: figmaName, entries, scale, imagesDir, assetsDir, style: a.style ?? prev?.meta.style, previous: prev?.entries }));
      const supplied = entries.filter((e) => e.supply);
      const generated = entries.filter((e) => !e.supply);
      if (generated.length) fs.mkdirSync(path.join(base, imagesDir), { recursive: true });
      if (supplied.length) fs.mkdirSync(path.join(base, assetsDir), { recursive: true });
      const lines = [`Wrote ${md} — ${generated.length} image(s) to generate, ${supplied.length} from the user (${result.placeholders.length} layer(s)).`];
      const incomplete: string[] = [];
      for (const e of entries) {
        const gaps = e.supply || !e.prompt ? [] : briefGaps(e.prompt);
        if (gaps.length) incomplete.push(e.imageId);
        lines.push(`- ${e.imageId} ${e.title}${e.supply ? ' (from the user)' : ''}: ${Math.round(e.w * scale)}×${Math.round(e.h * scale)}px, ratio ${ratio(e.w, e.h)}, used ${e.usages.length}×${e.prompt ? '' : ` — NO ${e.supply ? 'DESCRIPTION: set supply' : 'PROMPT: set one'} with edit set`}${gaps.length ? ` — BRIEF INCOMPLETE, missing: ${gaps.join(', ')}` : ''}${e.preview ? ` · preview ${e.preview}` : ''}`);
      }
      if (incomplete.length) lines.push('', `Not ready for the user: ${incomplete.join(', ')} lack parts of the brief. Find a reference image for each, write every field (${BRIEF_FIELDS.join(', ')}), set the full prompt with edit set {prompt}, then run image_prompts again.`);
      if (generated.length && !incomplete.length) lines.push('', `Tell the user: generate them into ${path.join(base, imagesDir)} with names starting with the id (IMG-001.png…), then say so; you run place_images.`);
      if (supplied.length) lines.push(`${generated.length ? 'And' : 'Tell the user'}: put their own files (${supplied.map((e) => e.title).join(', ')}) into ${path.join(base, assetsDir)} with the names listed in the file.`);
      return textResult(withNotes(lines.join('\n'), notes));
    }),
  );

  server.registerTool(
    'place_images',
    {
      title: 'Place generated images',
      description:
        'Puts the images the user generated or supplied into the layers waiting for them: files whose names start with an IMG id (IMG-001.png, img-2-hero.jpg…) in the images and assets folders of the prompts file (the design workspace by default), or an explicit files map. Every layer with that id gets the image (cover), placeholder captions go away, overlays on existing frames are kept, and IMAGE_PROMPTS.md marks them placed. Reports what is still missing.',
      inputSchema: {
        files: z.record(z.string()).optional().describe('Explicit {"IMG-001": "/path/photo.jpg"} when the user sent files with other names.'),
        dir: z.string().optional().describe('Folder with the images (default: the images and assets folders recorded in the prompts file).'),
        promptsFile: z.string().optional().describe('The prompts Markdown (default IMAGE_PROMPTS.md in the design workspace).'),
        fit: z.enum(['fill', 'fit', 'crop']).optional().describe('How the image fills its box (default fill = cover).'),
        file: fileParam,
      },
      annotations: { destructiveHint: false },
    },
    wrap(async (a) => {
      const { result, notes, plugin } = await call<{ placeholders: Usage[] }>(c, 'placeholders', { allPages: true }, a.file, 120_000);
      const ws = plugin ? findWorkspace(plugin.file) : null;
      let md = a.promptsFile ? resolveOutput(a.promptsFile) : ws && fs.existsSync(path.join(ws.dir, 'IMAGE_PROMPTS.md')) ? path.join(ws.dir, 'IMAGE_PROMPTS.md') : resolveOutput('IMAGE_PROMPTS.md');
      if (!a.promptsFile && plugin && !md.startsWith(ws?.dir ?? '\0')) {
        const alt = resolveOutput(`IMAGE_PROMPTS-${kebab(plugin.file.name) || 'figma'}.md`);
        if (fs.existsSync(alt)) md = alt;
      }
      const prev = fs.existsSync(md) ? parsePromptsFile(fs.readFileSync(md, 'utf8')) : undefined;
      const dirs = a.dir ? [resolveOutput(a.dir)] : [...new Set([prev?.meta.imagesDir ?? 'images', prev?.meta.assetsDir ?? 'assets'])].map((d) => path.join(path.dirname(md), d));
      const byId = new Map<string, string>();
      const unmatched: string[] = [];
      for (const d of dirs) {
        const m = matchImageFiles(d);
        for (const [k, v] of m.byId) if (!byId.has(k)) byId.set(k, v);
        unmatched.push(...m.unmatched);
      }
      for (const [k, v] of Object.entries(a.files ?? {})) {
        const id = imageIdOf(k) ?? k;
        byId.set(id, v.startsWith('/') || v.startsWith('~') ? v : resolveOutput(v));
      }
      const entries = groupUsages(result.placeholders);
      const placed: Array<{ id: string; file: string; path: string; layers: number }> = [];
      const problems: string[] = [];
      for (const e of entries) {
        const f = byId.get(e.imageId);
        if (!f) continue;
        try {
          const img = await loadImage(f);
          if (!img.data) throw new Error('SVG cannot fill an image box — export it as PNG.');
          await call(c, 'place_image', { ids: e.usages.map((u) => u.nodeId), imageData: img.data, fit: a.fit }, a.file, 90_000);
          placed.push({ id: e.imageId, file: path.basename(f), path: f, layers: e.usages.length });
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
        const history = new Map(prev.entries);
        for (const p of placed) {
          const status = `placed ✓ (${path.relative(path.dirname(md), p.path).split(path.sep).join('/')})`;
          const old = history.get(p.id);
          history.set(p.id, { status, block: (old?.block ?? `## ${p.id}`).replace(/^- \*\*Status:\*\* .+$/m, `- **Status:** ${status}`) });
        }
        const previews = new Map([...prev.entries].map(([id, v]) => [id, v.block.match(/^- \*\*Where it goes:\*\* !\[[^\]]*\]\(([^)]+)\)/m)?.[1]]));
        for (const e of left) e.preview = previews.get(e.imageId);
        fs.writeFileSync(md, renderPromptsFile({ title: prev.meta.title ?? plugin?.file.name ?? 'Figma', entries: left, scale: prev.meta.scale ?? 2, imagesDir: prev.meta.imagesDir ?? 'images', assetsDir: prev.meta.assetsDir, style: prev.meta.style, previous: history }));
      }
      const lines = [
        placed.length ? `Placed ${placed.length} image(s): ${placed.map((p) => `${p.id} ← ${p.file}${p.layers > 1 ? ` (${p.layers} layers)` : ''}`).join(', ')}.` : `No images placed (looked in ${dirs.join(', ')}).`,
        left.length ? `Still waiting: ${left.map((e) => `${e.imageId}${e.supply ? ' (from the user)' : ''}`).join(', ')}.` : unlisted.length ? 'Everything in the prompts file is placed.' : 'Nothing is waiting for an image any more.',
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
    'workspace',
    {
      title: 'Design workspace folder',
      description:
        'The folder in the user\'s project that belongs to this Figma file (<project>/design/<file>/): DESIGN.md (the identity), tokens/, references/, IMAGE_PROMPTS.md with previews/, images/ (generated) and assets/ (the user\'s own files). It opens by itself on the first design change. action status (default): where it is and what is in it. open: create it now. sync: refresh it from Figma — DESIGN.md (the brief\'s ## Identity block, tokens, styles, components, icon sets, references; the generated part between markers is replaced, the user\'s notes kept), tokens (css, tailwind, dtcg), reference images, and a small project skill (.claude/skills and .agents/skills, <file>-design) that sends every agent to DESIGN.md. Run sync after the identity changes (tokens, styles, components, the Identity block, references).',
      inputSchema: {
        action: z.enum(['status', 'open', 'sync']).optional(),
        skill: z.boolean().optional().describe('sync: write the project skill (default true). Skill folders figma-mcp did not write are never replaced.'),
        references: z.boolean().optional().describe('sync: export the frames on the References page into references/ (default true).'),
        file: fileParam,
      },
      annotations: { destructiveHint: false },
    },
    wrap(async (a) => {
      const action = a.action ?? 'status';
      const { result: br, notes, plugin } = await call<{ brief: string | null }>(c, 'brief', { action: 'get' }, a.file);
      if (!plugin) throw new BridgeError('BAD_REQUEST', 'No Figma file answered.');
      const project = projectDir();
      if (!project) throw new PathError('The project folder is unknown, so there is no place for the workspace. Start the session in the user\'s project (or set FIGMA_MCP_PROJECT_DIR).');
      if (action === 'status') {
        const ws = findWorkspace(plugin.file);
        if (!ws) return textResult(withNotes(`No workspace yet for "${plugin.file.name}" — it opens at ${path.join(project, 'design', '<file>')} on the first design change (or workspace open).`, notes));
        const count = (d: string) => (fs.existsSync(path.join(ws.dir, d)) ? fs.readdirSync(path.join(ws.dir, d)).filter((f) => !f.startsWith('.')).length : 0);
        const has = (f: string) => (fs.existsSync(path.join(ws.dir, f)) ? '✓' : '—');
        const cat = (readCatalog(ws) ?? []).filter((x) => !/^icon\//i.test(x.name));
        const idle = cat.filter((x) => x.inDesigns === 0);
        return textResult(withNotes([
          `Workspace of "${plugin.file.name}": ${ws.dir}`,
          `Synced: ${ws.meta.synced ?? 'never (workspace sync)'}`,
          `Components: ${cat.length}${idle.length ? ` · not used in any design: ${idle.map((x) => x.name).join(', ')}` : ''} (COMPONENTS.md)`,
          `DESIGN.md ${has('DESIGN.md')} · IMAGE_PROMPTS.md ${has('IMAGE_PROMPTS.md')} · tokens ${count('tokens')} · references ${count('references')} · previews ${count('previews')} · images ${count('images')} · assets ${count('assets')}`,
        ].join('\n'), notes));
      }
      const ws = ensureWorkspace(plugin.file, project);
      if (!ws) throw new PathError('Could not open the workspace.');
      if (action === 'open') return textResult(withNotes(`${ws.created ? 'Opened' : 'Already open'}: ${ws.dir}`, notes));

      const lines: string[] = [`Synced the workspace of "${plugin.file.name}": ${ws.dir}`];
      const { result: ds } = await call<{
        pages: string[];
        styles?: { text: Array<Record<string, unknown>>; paint: Array<Record<string, unknown>>; effect: Array<Record<string, unknown>>; grid: Array<Record<string, unknown>> };
      }>(c, 'design_system', { include: ['styles'] }, a.file, 120_000);
      const catalog = (await refreshCatalog(c, ws, a.file)) ?? [];
      const unused = catalog.filter((x) => x.inDesigns === 0);
      lines.push(`- COMPONENTS.md: ${catalog.filter((x) => !/^icon\//i.test(x.name)).length} component(s)${unused.length ? ` — not used in any design: ${unused.map((x) => x.name).join(', ')}` : ''}`);
      const { result: vars } = await call<VariablesDump>(c, 'variables_read', {}, a.file);
      const tokenFiles: string[] = [];
      if (vars.variables.length) {
        for (const [fmt, name] of [['css', 'tokens.css'], ['tailwind', 'tailwind.css'], ['dtcg', 'tokens.json']] as const) {
          fs.writeFileSync(path.join(ws.dir, 'tokens', name), exportTokens(vars, fmt));
          tokenFiles.push(`tokens/${name}`);
        }
        lines.push(`- tokens: ${tokenFiles.join(', ')} (${vars.variables.length} variables)`);
      } else lines.push('- tokens: the file has no variables yet');

      const references: Array<{ name: string; file?: string }> = [];
      if (a.references !== false) {
        const { result: found } = await call<{ results: Array<{ id: string; name: string; page?: string; path?: string }> }>(c, 'search', { query: 'reference', types: ['FRAME', 'SECTION'], in: 'name', allPages: true, limit: 200 }, a.file, 90_000);
        const top = found.results.filter((r) => r.page === 'References' && !r.path).slice(0, 40);
        if (top.length) {
          const { result: ex } = await call<{ files: Array<{ nodeId: string; ext?: string; data?: string; error?: string }> }>(c, 'export', { items: top.map((r) => ({ nodeId: r.id, format: 'PNG', scale: 1 })) }, a.file, 180_000);
          top.forEach((r, i) => {
            const f = ex.files[i];
            if (!f?.data) return void references.push({ name: r.name });
            const out = uniquePath(path.join(ws.dir, 'references'), kebab(r.name) || r.id, 'png', true);
            fs.writeFileSync(out, Buffer.from(f.data, 'base64'));
            references.push({ name: r.name, file: `references/${path.basename(out)}` });
          });
          fs.writeFileSync(path.join(ws.dir, 'references', 'REFERENCES.md'), [`# References — ${plugin.file.name}`, '', 'Frames on the Figma page "References" (what each one is for is written next to it in Figma).', '', ...references.map((r) => `- ${r.name}${r.file ? ` → ![${r.name}](${path.basename(r.file)})` : ''}`), ''].join('\n'));
        }
        lines.push(`- references: ${references.length}`);
      }

      writeDesignMd(path.join(ws.dir, 'DESIGN.md'), {
        fileName: plugin.file.name,
        brief: br.brief,
        pages: ds.pages,
        variables: vars,
        styles: ds.styles,
        components: catalog as unknown as Array<Record<string, unknown>>,
        references,
        tokenFiles,
      });
      lines.push('- DESIGN.md (generated part replaced, notes kept)');
      if (!/^## Identity/m.test(br.brief ?? '')) lines.push('  ⚠ The brief has no "## Identity" block yet — write it (identity guide) so DESIGN.md carries personality, patterns, imagery and rules.');
      if (a.skill !== false) lines.push(`- project skill: ${writeSkill(ws, project).join(', ')}`);
      markSynced(ws);
      return textResult(withNotes(lines.join('\n'), notes));
    }),
  );

  server.registerTool(
    'image_library',
    {
      title: 'Image library (workspace)',
      description:
        'The images collected for this design — found on the web or given by the user — kept once in the workspace (design/<file>/library/, library.json, LIBRARY.md) and shown on the Figma page "Library", so later requests reuse them instead of searching again. ' +
        'action list (default): what is there, filtered by query (words in title/description/tags), orientation, minWidth/minHeight — check it before searching the web. add: items [{src: image URL or file path, title, description?, tags?, source? (page URL), author?, license?}] → downloads each into library/ (duplicates are recognized), records size/orientation, and places it on the Library page (upload: false to skip). remove: ids (file deleted, Figma frame to Trash). ' +
        'Use an entry as it is (build {type:"image", src: <its path>} or place_images files {"IMG-002": <its path>}), or as the base image of an edit prompt.',
      inputSchema: {
        action: z.enum(['list', 'add', 'remove']).optional(),
        items: z.array(z.object({ src: z.string(), title: z.string(), description: z.string().optional(), tags: z.array(z.string()).optional(), source: z.string().optional(), author: z.string().optional(), license: z.string().optional() })).max(30).optional(),
        upload: z.boolean().optional().describe('add: also place the images on the Figma page "Library" (default true).'),
        ids: z.array(z.string()).optional().describe('remove: LIB ids.'),
        query: z.string().optional(),
        orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
        minWidth: z.number().int().optional(),
        minHeight: z.number().int().optional(),
        file: fileParam,
      },
      annotations: { destructiveHint: false, openWorldHint: true },
    },
    wrap(async (a) => {
      const action = a.action ?? 'list';
      if (!c.bridge.plugins_().length) await c.bridge.waitForPlugin(20_000);
      const target = c.bridge.plugins_().length ? c.bridge.pick(a.file ?? c.bridge.stickyTarget ?? undefined) : undefined;
      const notes: string[] = [];
      const ws = target ? (action === 'add' ? openWorkspace(target, notes) : findWorkspace(target.file)) : null;
      if (!ws) {
        if (!target) throw new BridgeError('PLUGIN_DISCONNECTED', NO_PLUGIN_HELP);
        return textResult(withNotes(projectDir() ? `No workspace yet for "${target.file.name}", so no library — add images with action "add".` : 'The project folder is unknown, so there is no workspace for a library.', notes));
      }
      let items = readLibrary(ws);
      if (action === 'list') {
        const found = searchLibrary(items, a);
        const head = `${found.length} of ${items.length} image(s) in ${path.join(ws.dir, 'LIBRARY.md')}${a.query || a.orientation || a.minWidth || a.minHeight ? ' matching' : ''}`;
        return textResult(withNotes([head, ...found.map((x) => `- ${describeItem(x, ws)}`), found.length ? '' : 'Nothing fits: search the web (free-license sources first), then add what you choose.'].join('\n'), notes));
      }
      if (action === 'remove') {
        const want = new Set((a.ids ?? []).map((x) => x.toUpperCase()));
        const gone = items.filter((x) => want.has(x.id));
        for (const x of gone) fs.rmSync(path.join(ws.dir, x.file), { force: true });
        const figmaIds = gone.map((x) => x.figmaId).filter((x): x is string => !!x);
        if (figmaIds.length) await call(c, 'edit', { ops: [{ op: 'delete', ids: figmaIds }] }, a.file, 60_000).catch((e) => log('library remove:', e instanceof Error ? e.message : e));
        items = items.filter((x) => !want.has(x.id));
        writeLibrary(ws, items);
        return textResult(withNotes(`Removed ${gone.map((x) => x.id).join(', ') || 'nothing'}; ${items.length} image(s) left.`, notes));
      }
      if (!a.items?.length) throw new BridgeError('BAD_REQUEST', 'add needs items: [{src, title, tags?, source?, license?}].');
      const lines: string[] = [];
      const fresh: LibraryItem[] = [];
      for (const it of a.items) {
        try {
          const img = await loadImage(it.src);
          if (!img.data) throw new Error('SVG is not a photo — use it as an icon or an svg node.');
          const { item, added } = addToLibrary(ws, items, Buffer.from(img.data, 'base64'), { ...it, source: it.source ?? (/^https?:/i.test(it.src) ? it.src : undefined) });
          if (added) fresh.push(item);
          lines.push(`${added ? '+' : '='} ${describeItem(item, ws)}${added ? '' : ' (already in the library)'}`);
        } catch (e) {
          lines.push(`✕ "${it.title}": ${e instanceof Error ? e.message : e}`);
        }
      }
      writeLibrary(ws, items);
      if (a.upload !== false && fresh.length) {
        for (const x of fresh) {
          const w = 360;
          const h = Math.max(40, Math.round((w * x.height) / x.width));
          const spec = {
            type: 'frame', name: `${x.id} · ${x.title}`, dir: 'column', gap: 8, pad: 12, w: w + 24, fill: '#FFFFFF', radius: 12,
            children: [
              { type: 'image', name: x.id, src: path.join(ws.dir, x.file), w, h, radius: 6 },
              { type: 'text', text: `${x.id} · ${x.title}`, size: 13, weight: 600, w: 'fill', color: '#18181B' },
              { type: 'text', text: [`${x.width}×${x.height} ${x.orientation}`, x.tags.join(', '), x.license ?? 'license unknown'].filter(Boolean).join(' · '), size: 11, w: 'fill', color: '#52525B' },
            ],
          };
          try {
            const assets = await loadAssetsOrThrow([{ spec }]);
            const { result } = await call<{ root: { id: string } }>(c, 'build', { spec, assets, page: 'Library', focus: false }, a.file, 120_000);
            x.figmaId = result.root.id;
          } catch (e) {
            lines.push(`⚠ ${x.id} not placed in Figma: ${e instanceof Error ? e.message : e}`);
          }
        }
        writeLibrary(ws, items);
        lines.push(`Placed ${fresh.filter((x) => x.figmaId).length} on the Figma page "Library".`);
      }
      lines.push(`Library: ${items.length} image(s) — ${path.join(ws.dir, 'LIBRARY.md')}`);
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
