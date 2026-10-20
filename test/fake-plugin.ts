// A stand-in for the Figma plugin UI: connects to the hub like the real iframe (Origin "null")
// and answers requests with canned results. Used by the integration tests.

import WebSocket from 'ws';
import { HUB_PORTS, PROTOCOL_VERSION, type PluginState } from '../src/shared/protocol.ts';

export interface FakePlugin {
  state: PluginState;
  requests: Array<{ method: string; params: unknown }>;
  close(): void;
  ready: Promise<void>;
}

export function fakePlugin(fileName: string, handlers: Record<string, (params: any) => unknown>, ports = HUB_PORTS): FakePlugin {
  const state: PluginState = {
    sessionId: Math.random().toString(36).slice(2, 10),
    version: 'dev',
    file: { name: fileName, key: null, editorType: 'figma' },
    page: { id: '0:1', name: 'Page 1' },
    user: 'Tester',
    selection: [],
    paused: false,
  };
  const requests: Array<{ method: string; params: unknown }> = [];
  let ws: WebSocket | null = null;
  let closed = false;
  let resolveReady: () => void;
  const ready = new Promise<void>((r) => (resolveReady = r));
  const connect = (i = 0) => {
    if (closed) return;
    const port = ports[i % ports.length];
    const sock = new WebSocket(`ws://localhost:${port}/figma-mcp`, { headers: { Origin: 'null' } });
    sock.on('open', () => sock.send(JSON.stringify({ type: 'hello', role: 'plugin', protocol: PROTOCOL_VERSION, state })));
    sock.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'welcome') {
        ws = sock;
        resolveReady();
      }
      if (msg.type === 'request') {
        requests.push({ method: msg.method, params: msg.params });
        const h = handlers[msg.method];
        try {
          if (!h) throw Object.assign(new Error(`Unknown method "${msg.method}"`), { code: 'UNKNOWN_METHOD' });
          const result = await h(msg.params);
          sock.send(JSON.stringify({ type: 'response', id: msg.id, ok: true, result }));
        } catch (e) {
          sock.send(JSON.stringify({ type: 'response', id: msg.id, ok: false, error: { code: (e as { code?: string }).code ?? 'FIGMA_ERROR', message: (e as Error).message } }));
        }
      }
    });
    sock.on('close', () => {
      if (ws === sock) ws = null;
      if (!closed) setTimeout(() => connect(i + (ws ? 0 : 1)), 150);
    });
    sock.on('error', () => {});
  };
  connect();
  return {
    state,
    requests,
    ready,
    close() {
      closed = true;
      ws?.close();
    },
  };
}
