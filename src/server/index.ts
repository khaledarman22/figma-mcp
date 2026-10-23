// figma-mcp MCP server (stdio). One process per Claude Code session; processes share one
// WebSocket hub so a single Figma plugin serves every session.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { HUB_PORTS } from '../shared/protocol.ts';
import { Bridge } from './hub.ts';
import { setClientRoots } from './files.ts';
import { syncHome } from './home.ts';
import { log } from './log.ts';
import { registerTools } from './tools.ts';

declare const __FIGMA_MCP_VERSION__: string | undefined;
const VERSION = typeof __FIGMA_MCP_VERSION__ === 'string' ? __FIGMA_MCP_VERSION__ : 'dev';

const INSTRUCTIONS = [
  'figma-mcp — local bridge to Figma Desktop through the "Figma MCP" development plugin (read + write: layout, auto layout, variables, styles, components & variants, prototype, design→code).',
  'Before the first call load the figma-mcp skill ("figma-mcp:figma" in Claude Code, "figma-mcp" elsewhere) — the single entry point: its router tells you which guide to read for design, design systems/components, prototypes, design→code and images, and it covers the tool workflow and build-spec vocabulary. Pick the guides yourself for every request; the user should not have to name them.',
  'Call status first. Node ids accept "12:34", "12-34" or Figma URLs. Verify visual work with screenshot. Never write into the figma-mcp tool folder; exports go to the user\'s project (absolute paths are safest).',
].join('\n');

async function main() {
  syncHome();
  const envPort = Number(process.env.FIGMA_MCP_PORT);
  const bridge = new Bridge({ version: VERSION, ports: Number.isFinite(envPort) && envPort > 0 ? [envPort] : HUB_PORTS });
  void bridge.start();

  const server = new McpServer({ name: 'figma-mcp', version: VERSION }, { instructions: INSTRUCTIONS });
  registerTools(server, { bridge, version: VERSION });

  let closing = false;
  const shutdown = async (why: string) => {
    if (closing) return;
    closing = true;
    log(`shutting down (${why})`);
    const force = setTimeout(() => process.exit(0), 1500);
    force.unref();
    await bridge.stop().catch(() => {});
    process.exit(0);
  };
  const transport = new StdioServerTransport();
  transport.onclose = () => void shutdown('stdio closed');
  // Claude Code closes stdin when the session ends; never linger holding the hub port.
  process.stdin.on('end', () => void shutdown('stdin end'));
  process.stdin.on('close', () => void shutdown('stdin closed'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGHUP', () => void shutdown('SIGHUP'));
  process.on('uncaughtException', (e) => log('uncaught exception:', e?.stack ?? String(e)));
  process.on('unhandledRejection', (e) => log('unhandled rejection:', e instanceof Error ? e.stack : String(e)));

  // Learn the client's workspace folder(s), so relative output paths land in the user's project.
  const refreshRoots = async () => {
    if (!server.server.getClientCapabilities()?.roots) return;
    try {
      const { roots } = await server.server.listRoots(undefined, { timeout: 5000 });
      setClientRoots(roots.map((r) => r.uri));
    } catch (e) {
      log('roots/list failed:', e instanceof Error ? e.message : String(e));
    }
  };
  server.server.oninitialized = () => void refreshRoots();
  server.server.setNotificationHandler(RootsListChangedNotificationSchema, async () => refreshRoots());

  await server.connect(transport);
  log(`figma-mcp ${VERSION} ready (pid ${process.pid})`);
}

main().catch((e) => {
  log('fatal:', e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
