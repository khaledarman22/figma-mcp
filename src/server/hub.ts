// Bridge between MCP tool calls and the Figma plugin(s).
//
// Every MCP server process (one per Claude Code session) creates a Bridge. The first one to bind
// 127.0.0.1:<port> becomes the hub: plugins and the other servers ("agents") connect to it over
// WebSocket. When the hub exits, agents race to take the port over and the plugin reconnects.

import http from 'node:http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import {
  BridgeError,
  HEALTH_PATH,
  HUB_PORTS,
  PROTOCOL_VERSION,
  SERVICE,
  type ErrorInfo,
  type PluginInfo,
  type PluginState,
  type RequestMsg,
  type ResponseMsg,
  type WireMsg,
} from '../shared/protocol.ts';
import { log } from './log.ts';

export interface RequestOptions {
  target?: string;
  timeoutMs?: number;
}

export interface BridgeResult<T = unknown> {
  result: T;
  plugin?: PluginInfo;
  note?: string;
}

interface Pending {
  resolve: (r: BridgeResult) => void;
  reject: (e: BridgeError) => void;
  timer: NodeJS.Timeout;
  /** hub mode: who asked (null = this process) and their request id */
  origin: WebSocket | null;
  originId: string;
  plugin?: string;
  method: string;
}

const LOOPBACK_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const PLUGIN_ORIGINS = /^(null|https:\/\/([a-z0-9-]+\.)*figma\.com)$/i;

export const NO_PLUGIN_HELP =
  'No Figma file is connected. In Figma Desktop open the design file, then run Plugins → Development → "Figma MCP" and keep its panel open. ' +
  'First time only: Plugins → Development → Import plugin from manifest… → ~/.figma-mcp/figma-plugin/manifest.json (created by `npm run setup` in the figma-mcp folder).';

export class Bridge {
  mode: 'starting' | 'hub' | 'agent' | 'down' = 'starting';
  port: number | null = null;
  readonly version: string;
  private ports: number[];
  private servers: http.Server[] = [];
  private wss: WebSocketServer | null = null;
  private plugins = new Map<string, { ws: WebSocket; info: PluginInfo }>();
  private agents = new Set<WebSocket>();
  private upstream: WebSocket | null = null;
  private remotePlugins: PluginInfo[] = [];
  private pending = new Map<string, Pending>();
  private seq = 0;
  private stopped = false;
  private heartbeat: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private waiters = new Set<() => void>();
  /** Sticky target: once this session used a file, keep using it until told otherwise. */
  private sticky: string | null = null;

  constructor(opts: { version: string; ports?: number[] }) {
    this.version = opts.version;
    this.ports = opts.ports ?? HUB_PORTS;
  }

  // ───────────── lifecycle ─────────────

  async start(): Promise<void> {
    this.stopped = false;
    for (const port of this.ports) {
      const r = await this.tryListen(port);
      if (r === 'listening') {
        this.mode = 'hub';
        this.port = port;
        log(`hub listening on localhost:${port}`);
        this.startHeartbeat();
        return;
      }
      if (r === 'ours') {
        if (await this.connectUpstream(port)) {
          this.mode = 'agent';
          this.port = port;
          log(`agent connected to hub on localhost:${port}`);
          return;
        }
      }
      // 'foreign' (some other program) or failed join → next port
    }
    this.mode = 'down';
    log('no hub port available; retrying in 3s');
    this.scheduleRetry(3000);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
    try {
      this.upstream?.close();
    } catch {
      /* ignore */
    }
    for (const { ws } of this.plugins.values()) ws.terminate();
    for (const a of this.agents) a.terminate();
    this.wss?.close();
    await Promise.all(this.servers.map((s) => new Promise<void>((r) => s.close(() => r()))));
    this.servers = [];
  }

  private scheduleRetry(ms: number) {
    if (this.stopped) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) void this.start();
    }, ms);
  }

  private listenOn(server: http.Server, port: number, host: string): Promise<NodeJS.ErrnoException | null> {
    return new Promise((resolve) => {
      const onError = (e: NodeJS.ErrnoException) => {
        server.off('listening', onListening);
        resolve(e);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve(null);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen({ port, host, exclusive: true });
    });
  }

  /** listening | ours (our hub already runs there) | foreign */
  private async tryListen(port: number): Promise<'listening' | 'ours' | 'foreign'> {
    const wss = new WebSocketServer({ noServer: true, maxPayload: 200 * 1024 * 1024 });
    const main = http.createServer((req, res) => this.onHttp(req, res));
    const err = await this.listenOn(main, port, '127.0.0.1');
    if (err) {
      wss.close();
      if (err.code === 'EADDRINUSE') return (await this.probe(port)) ? 'ours' : 'foreign';
      log(`listen 127.0.0.1:${port} failed: ${err.message}`);
      return 'foreign';
    }
    this.servers = [main];
    // localhost may resolve to ::1 in the plugin iframe; listen there too when IPv6 exists.
    const v6 = http.createServer((req, res) => this.onHttp(req, res));
    if (!(await this.listenOn(v6, port, '::1'))) this.servers.push(v6);
    this.wss = wss;
    for (const s of this.servers) s.on('upgrade', (req, socket, head) => this.onUpgrade(req, socket, head));
    wss.on('connection', (ws, req) => this.onConnection(ws, req));
    return 'listening';
  }

  private probe(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: HEALTH_PATH, timeout: 1500 }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body).service === SERVICE);
          } catch {
            resolve(false);
          }
        });
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private onHttp(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!LOOPBACK_HOSTS.test(req.headers.host ?? '')) {
      res.writeHead(403).end();
      return;
    }
    if (req.url === HEALTH_PATH) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          service: SERVICE,
          version: this.version,
          protocol: PROTOCOL_VERSION,
          pid: process.pid,
          port: this.port,
          plugins: [...this.plugins.values()].map((p) => ({ file: p.info.file.name, page: p.info.page.name, version: p.info.version, paused: p.info.paused })),
          agents: this.agents.size,
        }),
      );
      return;
    }
    res.writeHead(404).end();
  }

  private onUpgrade(req: http.IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) {
    const host = req.headers.host ?? '';
    const origin = req.headers.origin;
    // Browsers always send Origin; Node clients (other MCP servers) do not. Only the Figma
    // plugin iframe (Origin "null" or figma.com) may connect from a browser context.
    if (!LOOPBACK_HOSTS.test(host) || (origin !== undefined && !PLUGIN_ORIGINS.test(origin))) {
      log(`rejected websocket from origin=${origin} host=${host}`);
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss!.handleUpgrade(req, socket, head, (ws) => this.wss!.emit('connection', ws, req));
  }

  private onConnection(ws: WebSocket, req: http.IncomingMessage) {
    const fromBrowser = req.headers.origin !== undefined;
    let role: 'plugin' | 'agent' | null = null;
    let sessionId: string | null = null;
    (ws as WebSocket & { alive?: boolean }).alive = true;
    ws.on('pong', () => ((ws as WebSocket & { alive?: boolean }).alive = true));
    const helloTimer = setTimeout(() => {
      if (!role) ws.terminate();
    }, 5000);

    ws.on('message', (data: RawData) => {
      let msg: WireMsg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!role) {
        if (msg.type !== 'hello') return;
        if (msg.role === 'plugin' && fromBrowser) {
          role = 'plugin';
          sessionId = msg.state.sessionId;
          const now = Date.now();
          const prev = this.plugins.get(sessionId);
          if (prev && prev.ws !== ws) prev.ws.terminate();
          this.plugins.set(sessionId, { ws, info: { ...msg.state, connectedAt: now, lastActive: now } });
          log(`plugin connected: "${msg.state.file.name}" (${sessionId}, v${msg.state.version})`);
        } else if (msg.role === 'agent' && !fromBrowser) {
          role = 'agent';
          this.agents.add(ws);
        } else {
          ws.terminate();
          return;
        }
        clearTimeout(helloTimer);
        ws.send(JSON.stringify({ type: 'welcome', role, hub: { version: this.version, pid: process.pid, port: this.port } }));
        if (role === 'agent') ws.send(JSON.stringify({ type: 'plugins', plugins: this.pluginList() }));
        else this.broadcastPlugins();
        this.notifyWaiters();
        return;
      }
      if (role === 'plugin' && sessionId) this.onPluginMessage(sessionId, msg);
      else if (role === 'agent') this.onAgentMessage(ws, msg);
    });

    ws.on('close', () => {
      clearTimeout(helloTimer);
      if (role === 'plugin' && sessionId) {
        const entry = this.plugins.get(sessionId);
        if (entry?.ws === ws) {
          this.plugins.delete(sessionId);
          log(`plugin disconnected: "${entry.info.file.name}"`);
          for (const [id, p] of this.pending) {
            if (p.plugin === sessionId) {
              clearTimeout(p.timer);
              this.pending.delete(id);
              this.fail(p, { code: 'PLUGIN_DISCONNECTED', message: `The Figma plugin disconnected during "${p.method}" (plugin closed, file closed, or another plugin was opened). The change may be partially applied — check the canvas, then re-run the plugin.` });
            }
          }
          this.broadcastPlugins();
        }
      } else if (role === 'agent') {
        this.agents.delete(ws);
        for (const [id, p] of this.pending) if (p.origin === ws) {
          clearTimeout(p.timer);
          this.pending.delete(id);
        }
      }
    });
    ws.on('error', () => {
      /* close follows */
    });
  }

  private startHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      const all = [...[...this.plugins.values()].map((p) => p.ws), ...this.agents];
      for (const ws of all) {
        const w = ws as WebSocket & { alive?: boolean };
        if (w.alive === false) {
          // Two silent intervals: dead socket that never fired close.
          w.terminate();
          continue;
        }
        w.alive = false;
        try {
          ws.ping();
        } catch {
          /* ignore */
        }
      }
    }, 20_000);
    this.heartbeat.unref();
  }

  private pluginList(): PluginInfo[] {
    return [...this.plugins.values()].map((p) => p.info);
  }

  private broadcastPlugins() {
    const msg = JSON.stringify({ type: 'plugins', plugins: this.pluginList() });
    for (const a of this.agents) if (a.readyState === WebSocket.OPEN) a.send(msg);
  }

  private onPluginMessage(sessionId: string, msg: WireMsg) {
    const entry = this.plugins.get(sessionId);
    if (!entry) return;
    if (msg.type === 'state') {
      const before = JSON.stringify(entry.info.selection);
      entry.info = { ...entry.info, ...(msg.state as Partial<PluginState>) };
      if (JSON.stringify(entry.info.selection) !== before) entry.info.lastActive = Date.now();
      this.broadcastPlugins();
      return;
    }
    if (msg.type === 'response') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      entry.info.lastActive = Date.now();
      if (p.origin) {
        const out: ResponseMsg = msg.ok
          ? { type: 'response', id: p.originId, ok: true, result: msg.result, plugin: entry.info }
          : { type: 'response', id: p.originId, ok: false, error: msg.error, plugin: entry.info };
        if (p.origin.readyState === WebSocket.OPEN) p.origin.send(JSON.stringify(out));
      } else if (msg.ok) p.resolve({ result: msg.result, plugin: entry.info });
      else p.reject(new BridgeError(msg.error.code, msg.error.message, msg.error.details));
    }
  }

  private onAgentMessage(ws: WebSocket, msg: WireMsg) {
    if (msg.type !== 'request') return;
    try {
      const target = this.pick(msg.target);
      this.dispatch(target, msg.method, msg.params, msg.timeoutMs ?? 60_000, ws, msg.id);
    } catch (e) {
      const err = e instanceof BridgeError ? e : new BridgeError('BAD_REQUEST', String(e));
      ws.send(JSON.stringify({ type: 'response', id: msg.id, ok: false, error: { code: err.code, message: err.message, details: err.details } }));
    }
  }

  private fail(p: Pending, error: ErrorInfo) {
    if (p.origin) {
      if (p.origin.readyState === WebSocket.OPEN) p.origin.send(JSON.stringify({ type: 'response', id: p.originId, ok: false, error }));
    } else p.reject(new BridgeError(error.code, error.message, error.details));
  }

  /** hub: send a request to a plugin and route the answer back to whoever asked */
  private dispatch(target: PluginInfo, method: string, params: unknown, timeoutMs: number, origin: WebSocket | null, originId: string, resolve?: Pending['resolve'], reject?: Pending['reject']) {
    const entry = this.plugins.get(target.sessionId);
    if (!entry) throw new BridgeError('NO_PLUGIN', NO_PLUGIN_HELP);
    const id = `h${++this.seq}`;
    const timer = setTimeout(() => {
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      this.fail(p, {
        code: 'TIMEOUT',
        message: `Figma did not answer "${method}" within ${Math.round(timeoutMs / 1000)}s. It may still be working (large operation) or the plugin may be frozen. Check the canvas before retrying; if Figma is stuck, close and re-run the plugin.`,
      });
    }, timeoutMs);
    this.pending.set(id, { resolve: resolve ?? (() => {}), reject: reject ?? (() => {}), timer, origin, originId, plugin: target.sessionId, method });
    const out: RequestMsg = { type: 'request', id, method, params };
    entry.ws.send(JSON.stringify(out));
  }

  // ───────────── agent mode ─────────────

  private connectUpstream(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/figma-mcp`, { maxPayload: 200 * 1024 * 1024 });
      let welcomed = false;
      const timer = setTimeout(() => {
        if (!welcomed) {
          ws.terminate();
          resolve(false);
        }
      }, 4000);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', role: 'agent', protocol: PROTOCOL_VERSION, version: this.version, pid: process.pid })));
      ws.on('message', (data: RawData) => {
        let msg: WireMsg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (msg.type === 'welcome') {
          welcomed = true;
          clearTimeout(timer);
          this.upstream = ws;
          resolve(true);
        } else if (msg.type === 'plugins') {
          this.remotePlugins = msg.plugins;
          this.notifyWaiters();
        } else if (msg.type === 'response') {
          const p = this.pending.get(msg.id);
          if (!p) return;
          clearTimeout(p.timer);
          this.pending.delete(msg.id);
          if (msg.ok) p.resolve({ result: msg.result, plugin: msg.plugin });
          else p.reject(new BridgeError(msg.error.code, msg.error.message, msg.error.details));
        }
      });
      ws.on('close', () => {
        clearTimeout(timer);
        if (!welcomed) {
          resolve(false);
          return;
        }
        if (this.upstream === ws) {
          this.upstream = null;
          this.remotePlugins = [];
          for (const [id, p] of this.pending) {
            clearTimeout(p.timer);
            this.pending.delete(id);
            p.reject(new BridgeError('HUB_UNAVAILABLE', `The connection to the Figma hub closed during "${p.method}" (the Claude session that hosted it ended). Retry in a moment; this session takes over the hub automatically.`));
          }
          if (!this.stopped) {
            this.mode = 'starting';
            // Jitter so several agents don't stampede the port.
            this.scheduleRetry(150 + Math.floor(Math.random() * 400));
          }
        }
      });
      ws.on('error', () => {
        /* close follows */
      });
    });
  }

  // ───────────── public API ─────────────

  plugins_(): PluginInfo[] {
    return this.mode === 'hub' ? this.pluginList() : this.remotePlugins;
  }

  get stickyTarget(): string | null {
    return this.sticky;
  }

  private notifyWaiters() {
    for (const w of this.waiters) w();
  }

  /** Waits until at least one plugin is connected (or the timeout passes). */
  waitForPlugin(timeoutMs: number): Promise<boolean> {
    if (this.plugins_().length) return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = () => {
        if (!this.plugins_().length) return;
        clearTimeout(t);
        this.waiters.delete(done);
        resolve(true);
      };
      const t = setTimeout(() => {
        this.waiters.delete(done);
        resolve(this.plugins_().length > 0);
      }, timeoutMs);
      this.waiters.add(done);
    });
  }

  /** Chooses the plugin for a request: explicit target → sticky choice → the only/most active one. */
  pick(target?: string): PluginInfo {
    const list = this.plugins_();
    if (!list.length) throw new BridgeError('NO_PLUGIN', NO_PLUGIN_HELP);
    if (target) {
      const t = target.toLowerCase();
      const exact = list.filter((p) => p.sessionId === target || (p.file.key && p.file.key === target) || p.file.name.toLowerCase() === t);
      const hits = exact.length ? exact : list.filter((p) => p.file.name.toLowerCase().includes(t));
      if (!hits.length) throw new BridgeError('TARGET_NOT_FOUND', `No connected Figma file matches "${target}". Connected: ${list.map((p) => `"${p.file.name}"`).join(', ')}.`);
      if (hits.length > 1) throw new BridgeError('AMBIGUOUS_TARGET', `Several connected files match "${target}": ${hits.map((p) => `"${p.file.name}" (${p.sessionId})`).join(', ')}. Pass the session id.`);
      return hits[0];
    }
    if (list.length === 1) return list[0];
    return [...list].sort((a, b) => b.lastActive - a.lastActive)[0];
  }

  async request<T = unknown>(method: string, params: unknown, opts: RequestOptions = {}): Promise<BridgeResult<T>> {
    if (this.mode === 'starting' || this.mode === 'down') {
      for (let i = 0; i < 20 && (this.mode === 'starting' || this.mode === 'down'); i++) await new Promise((r) => setTimeout(r, 150));
    }
    // A plugin in reconnect backoff can take a while to find a new hub: when Figma's window is hidden
    // behind other windows, Chromium throttles its timers to as little as one wake-up per minute.
    if (!this.plugins_().length) {
      log('no Figma plugin connected yet — waiting up to 60s for it to reconnect');
      await this.waitForPlugin(60_000);
    }
    // Resolve target: explicit > sticky (if still connected) > automatic.
    let note: string | undefined;
    let explicit = opts.target;
    if (!explicit && this.sticky) {
      if (this.plugins_().some((p) => p.sessionId === this.sticky)) explicit = this.sticky;
      else {
        note = 'The previously used Figma file is no longer connected; switched to another connected file.';
        this.sticky = null;
      }
    }
    const chosen = this.pick(explicit);
    const multiple = this.plugins_().length > 1;
    if (multiple && !opts.target && !this.sticky) {
      note = `${this.plugins_().length} Figma files are connected; using "${chosen.file.name}". Pass file: "<name>" to choose another.`;
    }
    this.sticky = chosen.sessionId;
    const timeoutMs = opts.timeoutMs ?? 60_000;

    if (this.mode === 'hub') {
      return new Promise<BridgeResult<T>>((resolve, reject) => {
        try {
          this.dispatch(chosen, method, params, timeoutMs, null, '', (r) => resolve({ ...(r as BridgeResult<T>), note }), reject);
        } catch (e) {
          reject(e);
        }
      });
    }
    if (this.mode === 'agent' && this.upstream && this.upstream.readyState === WebSocket.OPEN) {
      const id = `a${process.pid}-${++this.seq}`;
      return new Promise<BridgeResult<T>>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new BridgeError('TIMEOUT', `Figma did not answer "${method}" within ${Math.round(timeoutMs / 1000)}s (via hub). Check the canvas before retrying.`));
        }, timeoutMs + 2000);
        this.pending.set(id, { resolve: (r) => resolve({ ...(r as BridgeResult<T>), note }), reject, timer, origin: null, originId: id, method });
        const msg: RequestMsg = { type: 'request', id, method, params, target: chosen.sessionId, timeoutMs };
        this.upstream!.send(JSON.stringify(msg));
      });
    }
    throw new BridgeError('HUB_UNAVAILABLE', 'The local Figma hub is not running yet (port busy or restarting). Retry in a few seconds; run `npm run doctor` in the figma-mcp folder if it persists.');
  }

  forgetTarget() {
    this.sticky = null;
  }
}
