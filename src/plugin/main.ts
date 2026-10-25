// Plugin main thread: receives requests from the UI iframe (which holds the WebSocket),
// runs them one at a time, and reports state (file, page, selection, pause) back.

import type { PluginState } from '../shared/protocol.ts';
import { applyAssets, newIssues, normalizeSpec, type AssetMap } from '../shared/spec.ts';
import { build } from './build.ts';
import { createComponent } from './components.ts';
import { designSystem, listComponents } from './ds.ts';
import { edit } from './edit.ts';
import { PluginError, explainFigmaError } from './errors.ts';
import { execute } from './execute.ts';
import { exportNodes, screenshot } from './export.ts';
import { extract } from './extract.ts';
import { brief, fonts, getNodes, metadata, navigate, PLUGIN_VERSION, search, selectionSummary, status } from './inspect.ts';
import { lint } from './lint.ts';
import { listPlaceholders, placeImage } from './pages.ts';
import { prototype, readPrototype } from './prototype.ts';
import { readStyles, upsertStyles } from './styles.ts';
import { readVariables, upsertVariables } from './variables.ts';

type Handler = (params: any) => unknown | Promise<unknown>;

const methods: Record<string, { fn: Handler; write?: boolean | ((params: any) => boolean) }> = {
  ping: { fn: () => ({ pong: true, at: Date.now() }) },
  status: { fn: () => status() },
  metadata: { fn: metadata },
  get_nodes: { fn: getNodes },
  search: { fn: search },
  fonts: { fn: fonts },
  screenshot: { fn: screenshot },
  export: { fn: exportNodes },
  extract: { fn: extract },
  design_system: { fn: designSystem },
  components: { fn: listComponents },
  variables_read: { fn: readVariables },
  styles_read: { fn: readStyles },
  prototype_read: { fn: readPrototype },
  placeholders: { fn: listPlaceholders },
  place_image: { fn: placeImage, write: true },
  navigate: { fn: navigate },
  brief: { fn: (p) => brief(p), write: (p) => (p?.action ?? 'get') !== 'get' },
  lint: { fn: lint, write: (p) => !!p?.fix },
  build: {
    write: true,
    fn: async (p: { spec: unknown; assets?: AssetMap; parentId?: string; index?: number; x?: number; y?: number; replaceId?: string; focus?: boolean; icons?: 'component' | 'inline' }) => {
      const issues = newIssues();
      const spec = normalizeSpec(p.spec, 'spec', issues);
      issues.errors.push(...applyAssets(spec, p.assets));
      if (issues.errors.length) throw new PluginError('BAD_REQUEST', `Nothing was created — fix these first:\n- ${issues.errors.join('\n- ')}`);
      const res = await build(spec, p);
      return { ...res, warnings: [...issues.warnings, ...res.warnings] };
    },
  },
  edit: { fn: edit, write: true },
  variables: { fn: upsertVariables, write: true },
  styles: { fn: upsertStyles, write: true },
  create_component: { fn: createComponent, write: true },
  prototype: { fn: prototype, write: true },
  execute: { fn: execute, write: true },
};

type MethodTable = typeof methods;
const g = globalThis as unknown as { __FIGMA_MCP_HOT__?: (table: MethodTable, version: string) => void };

if (typeof g.__FIGMA_MCP_HOT__ === 'function') {
  // Evaluated by "__reload" inside a running plugin: hand the new methods to the live runtime.
  g.__FIGMA_MCP_HOT__(methods, PLUGIN_VERSION);
} else {
  start();
}

interface Incoming {
  type: string;
  id?: string;
  method?: string;
  params?: unknown;
  value?: boolean;
  width?: number;
  height?: number;
}

function start() {
  const rt = { table: methods, version: PLUGIN_VERSION };
  const sessionId = Math.random().toString(36).slice(2, 10);
  let paused = false;

  const state = (): PluginState => ({
    sessionId,
    version: rt.version,
    file: { name: figma.root.name, key: figma.fileKey ?? null, editorType: figma.editorType },
    page: { id: figma.currentPage.id, name: figma.currentPage.name },
    user: figma.currentUser?.name ?? null,
    selection: selectionSummary(),
    paused,
  });

  figma.showUI(__html__, { width: 300, height: 380, themeColors: true, title: 'Figma MCP' });
  figma.ui.postMessage({ type: 'init', state: state() });

  let stateTimer: ReturnType<typeof setTimeout> | undefined;
  const pushState = () => {
    if (stateTimer !== undefined) clearTimeout(stateTimer);
    stateTimer = setTimeout(() => figma.ui.postMessage({ type: 'state', state: state() }), 120);
  };
  figma.on('selectionchange', pushState);
  figma.on('currentpagechange', pushState);

  // A rebuilt server pushes the new bundle through "__reload"; methods are swapped in place,
  // so the user does not have to restart the plugin after updates.
  g.__FIGMA_MCP_HOT__ = (table, version) => {
    rt.table = table;
    rt.version = version;
    pushState();
  };

  const isWrite = (m: { write?: boolean | ((p: any) => boolean) } | undefined, params: unknown) => !!m && (typeof m.write === 'function' ? m.write(params ?? {}) : !!m.write);

  // A Figma promise that never settles must not block the queue forever: answer with an error and move on.
  // (Slightly below the server's own timeouts, so the agent gets this message instead of a generic timeout.)
  const DEADLINES: Record<string, number> = { build: 230_000, create_component: 290_000, edit: 170_000, variables: 170_000, lint: 170_000, export: 170_000, extract: 110_000, design_system: 110_000, screenshot: 80_000, placeholders: 110_000, components: 110_000 };
  const deadlineFor = (method: string, params: unknown) =>
    method === 'execute' ? Math.min(Number((params as { timeoutMs?: number })?.timeoutMs ?? 60_000), 300_000) + 5_000 : DEADLINES[method] ?? 55_000;
  const withDeadline = <T>(work: Promise<T>, ms: number, method: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new PluginError('TIMEOUT', `Figma did not finish "${method}" within ${Math.round(ms / 1000)}s (a Figma call never returned). The plugin moved on; check the canvas — part of the change may be applied. If it keeps happening, close and re-run the plugin.`)), ms);
    });
    const done = () => timer !== undefined && clearTimeout(timer);
    return Promise.race([work, late]).then(
      (v) => {
        done();
        return v;
      },
      (e) => {
        done();
        throw e;
      },
    );
  };

  // One request at a time: Figma state (current page, selection) is global.
  let queue: Promise<unknown> = Promise.resolve();

  figma.ui.onmessage = (msg: Incoming) => {
    if (msg.type === 'pause') {
      paused = !!msg.value;
      pushState();
      figma.notify(paused ? 'Figma MCP paused — Claude cannot change this file' : 'Figma MCP resumed', { timeout: 1600 });
      return;
    }
    if (msg.type === 'resize' && msg.width && msg.height) {
      figma.ui.resize(msg.width, msg.height);
      return;
    }
    if (msg.type === 'ui-ready') {
      figma.ui.postMessage({ type: 'init', state: state() });
      return;
    }
    if (msg.type !== 'request' || !msg.id || !msg.method) return;
    const { id, method, params } = msg;
    queue = queue.then(async () => {
      const started = Date.now();
      const m = rt.table[method];
      try {
        let result: unknown;
        if (method === '__reload') {
          const before = rt.version;
          (0, eval)(String((params as { code?: string })?.code ?? ''));
          result = { from: before, to: rt.version, reloaded: rt.version !== before };
        } else {
          if (!m) throw new PluginError('UNKNOWN_METHOD', `Unknown method "${method}". Re-run the Figma plugin to load the current build.`);
          if (paused && isWrite(m, params)) throw new PluginError('PAUSED', 'The user paused Figma MCP in the plugin panel. Ask them to press Resume; do not work around it.');
          result = await withDeadline(Promise.resolve(m.fn(params ?? {})), deadlineFor(method, params), method);
        }
        figma.ui.postMessage({ type: 'response', id, ok: true, result, ms: Date.now() - started });
      } catch (e) {
        const code = e instanceof PluginError ? e.code : 'FIGMA_ERROR';
        const details = (e as { details?: unknown })?.details;
        figma.ui.postMessage({ type: 'response', id, ok: false, error: { code, message: explainFigmaError(e), details }, ms: Date.now() - started });
      }
      if (isWrite(m, params)) pushState();
    });
  };
}
