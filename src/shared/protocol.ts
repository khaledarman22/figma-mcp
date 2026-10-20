// Wire protocol between the MCP server(s), the hub and the Figma plugin.
//
//   Claude Code ⇄ (stdio MCP) ⇄ server ─┐
//   Claude Code ⇄ (stdio MCP) ⇄ server ─┼─ WebSocket hub on 127.0.0.1 (first server to start owns the port)
//                                       └─ Figma plugin UI iframe ⇄ postMessage ⇄ plugin main thread (Plugin API)
//
// The hub is a dumb relay: it never interprets method names, so a hub started by an
// older server keeps working with newer servers and plugins.

export const SERVICE = 'figma-mcp';
export const PROTOCOL_VERSION = 1;
/** Ports the hub tries in order; the plugin UI scans the same list (see figma-plugin/manifest.json). */
export const HUB_PORTS = [7457, 7458, 7459];
export const HEALTH_PATH = '/figma-mcp/health';

export interface FileInfo {
  name: string;
  key: string | null;
  editorType: string;
}

export interface PageInfo {
  id: string;
  name: string;
}

export interface SelectionItem {
  id: string;
  name: string;
  type: string;
  w?: number;
  h?: number;
}

/** What a connected plugin reports about itself (kept fresh through `state` events). */
export interface PluginState {
  sessionId: string;
  version: string;
  file: FileInfo;
  page: PageInfo;
  user: string | null;
  selection: SelectionItem[];
  paused: boolean;
}

export interface PluginInfo extends PluginState {
  connectedAt: number;
  lastActive: number;
}

export interface ErrorInfo {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export type ErrorCode =
  | 'NO_PLUGIN'
  | 'AMBIGUOUS_TARGET'
  | 'TARGET_NOT_FOUND'
  | 'TIMEOUT'
  | 'PLUGIN_DISCONNECTED'
  | 'PAUSED'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'UNKNOWN_METHOD'
  | 'FIGMA_ERROR'
  | 'HUB_UNAVAILABLE';

export type HelloMsg =
  | { type: 'hello'; role: 'plugin'; protocol: number; state: PluginState }
  | { type: 'hello'; role: 'agent'; protocol: number; version: string; pid: number };

export interface WelcomeMsg {
  type: 'welcome';
  role: 'plugin' | 'agent';
  hub: { version: string; pid: number; port: number };
}

export interface RequestMsg {
  type: 'request';
  id: string;
  method: string;
  params?: unknown;
  /** Agent → hub only: which plugin (session id, file key or part of the file name). */
  target?: string;
  timeoutMs?: number;
}

export type ResponseMsg =
  | { type: 'response'; id: string; ok: true; result: unknown; plugin?: PluginInfo; note?: string }
  | { type: 'response'; id: string; ok: false; error: ErrorInfo; plugin?: PluginInfo };

/** Plugin → hub: its state changed (selection, page, pause…). */
export interface StateMsg {
  type: 'state';
  state: Partial<PluginState>;
}

/** Hub → agents: the set of connected plugins changed. */
export interface PluginsMsg {
  type: 'plugins';
  plugins: PluginInfo[];
}

export type WireMsg = HelloMsg | WelcomeMsg | RequestMsg | ResponseMsg | StateMsg | PluginsMsg;

export class BridgeError extends Error {
  code: ErrorCode;
  details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
