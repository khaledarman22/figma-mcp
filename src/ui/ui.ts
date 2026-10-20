// Plugin UI iframe: owns the WebSocket to the local hub (the plugin main thread has no network),
// relays requests/responses, shows connection state, an activity log and the Pause switch.

import { HUB_PORTS, PROTOCOL_VERSION, type PluginState } from '../shared/protocol.ts';

type Msg = { type: string; [k: string]: unknown };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const dot = $('dot');
const statusText = $('status');
const detail = $('detail');
const logEl = $('log');
const pauseBtn = $<HTMLButtonElement>('pause');
const minBtn = $<HTMLButtonElement>('min');
const clearBtn = $<HTMLButtonElement>('clear');

let ws: WebSocket | null = null;
let connectedPort: number | null = null;
let state: PluginState | null = null;
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let minimized = false;
const pending = new Map<string, { method: string; label: string; started: number; row: HTMLElement }>();

function toMain(msg: Msg) {
  parent.postMessage({ pluginMessage: msg }, '*');
}

function setStatus(kind: 'ok' | 'wait' | 'off' | 'paused', text: string, sub = '') {
  dot.className = `dot ${kind}`;
  statusText.textContent = text;
  detail.textContent = sub;
}

function refreshStatus() {
  if (state?.paused) {
    setStatus('paused', 'Paused', 'Claude can read this file but cannot change it.');
  } else if (ws && ws.readyState === WebSocket.OPEN && connectedPort) {
    setStatus('ok', 'Connected to Claude Code', `localhost:${connectedPort} · ${state?.file.name ?? ''}`);
  } else {
    setStatus(attempt > 2 ? 'off' : 'wait', 'Waiting for Claude Code…', 'Starts automatically when a Claude session uses figma-mcp.');
  }
  pauseBtn.textContent = state?.paused ? 'Resume' : 'Pause';
  pauseBtn.classList.toggle('active', !!state?.paused);
}

function labelFor(method: string, params: any): string {
  try {
    if (method === 'build') return params?.spec?.name ? `build “${params.spec.name}”` : 'build';
    if (method === 'edit') return `edit · ${params?.ops?.length ?? 0} ops`;
    if (method === 'execute') {
      const first = String(params?.code ?? '').split('\n').find((l: string) => l.trim()) ?? '';
      return `execute ${first.trim().startsWith('//') ? first.trim().slice(2).trim().slice(0, 40) : ''}`.trim();
    }
    if (method === 'create_component') return `component “${params?.name ?? ''}”`;
    if (method === 'variables') return `variables · ${(params?.collections ?? []).map((c: any) => c.name).join(', ')}`;
  } catch {
    /* label is cosmetic */
  }
  return method.replace(/_/g, ' ');
}

const QUIET = new Set(['ping', 'status']);

function logStart(id: string, method: string, params: unknown) {
  if (QUIET.has(method)) return;
  const row = document.createElement('div');
  row.className = 'row run';
  const label = labelFor(method, params);
  row.innerHTML = `<span class="t"></span><span class="m"></span><span class="d">…</span>`;
  (row.querySelector('.t') as HTMLElement).textContent = new Date().toTimeString().slice(0, 8);
  (row.querySelector('.m') as HTMLElement).textContent = label;
  logEl.prepend(row);
  while (logEl.children.length > 60) logEl.lastChild?.remove();
  pending.set(id, { method, label, started: Date.now(), row });
}

function logEnd(id: string, ok: boolean, error?: string) {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  p.row.className = `row ${ok ? 'ok' : 'err'}`;
  const d = p.row.querySelector('.d') as HTMLElement;
  d.textContent = `${((Date.now() - p.started) / 1000).toFixed(1)}s`;
  if (!ok && error) p.row.title = error;
}

function connect() {
  if (retryTimer !== undefined) clearTimeout(retryTimer);
  const ports = [...HUB_PORTS];
  let i = 0;
  const tryNext = () => {
    if (i >= ports.length) {
      attempt++;
      refreshStatus();
      retryTimer = setTimeout(connect, Math.min(800 + attempt * 400, 3000));
      return;
    }
    const port = ports[i++];
    let opened = false;
    let sock: WebSocket;
    try {
      sock = new WebSocket(`ws://localhost:${port}/figma-mcp`);
    } catch {
      tryNext();
      return;
    }
    const giveUp = setTimeout(() => {
      if (!opened) {
        try {
          sock.close();
        } catch {
          /* ignore */
        }
      }
    }, 1500);
    sock.onopen = () => {
      opened = true;
      clearTimeout(giveUp);
      if (state) sock.send(JSON.stringify({ type: 'hello', role: 'plugin', protocol: PROTOCOL_VERSION, state }));
    };
    sock.onmessage = (ev) => {
      let msg: Msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === 'welcome') {
        ws = sock;
        connectedPort = port;
        attempt = 0;
        refreshStatus();
      } else if (msg.type === 'request') {
        logStart(String(msg.id), String(msg.method), msg.params);
        toMain({ type: 'request', id: msg.id, method: msg.method, params: msg.params });
      }
    };
    sock.onerror = () => {
      /* onclose follows */
    };
    sock.onclose = () => {
      clearTimeout(giveUp);
      if (ws === sock) {
        ws = null;
        connectedPort = null;
        for (const [id] of pending) logEnd(id, false, 'connection closed');
        refreshStatus();
        connect(); // straight away: Figma throttles timers in background windows
      } else if (!opened) tryNext();
    };
  };
  tryNext();
}

window.onmessage = (ev: MessageEvent) => {
  const msg = ev.data?.pluginMessage as Msg | undefined;
  if (!msg) return;
  if (msg.type === 'init' || msg.type === 'state') {
    const first = !state;
    state = msg.state as PluginState;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'state', state }));
    refreshStatus();
    if (first) connect();
  } else if (msg.type === 'response') {
    logEnd(String(msg.id), !!msg.ok, (msg.error as { message?: string } | undefined)?.message);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const { ms: _ms, ...out } = msg;
      ws.send(JSON.stringify(out));
    }
  }
};

pauseBtn.onclick = () => toMain({ type: 'pause', value: !state?.paused });
clearBtn.onclick = () => {
  logEl.innerHTML = '';
};
minBtn.onclick = () => {
  minimized = !minimized;
  document.body.classList.toggle('min', minimized);
  minBtn.textContent = minimized ? '▢' : '–';
  toMain({ type: 'resize', width: 300, height: minimized ? 64 : 380 });
};

refreshStatus();
toMain({ type: 'ui-ready' });
