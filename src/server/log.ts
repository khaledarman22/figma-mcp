// Logging goes to stderr (stdout carries the MCP protocol) and to a small rotating file outside
// the tool folder, so `npm run doctor` can show what happened.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Where runtime data lives: Claude's per-plugin data dir, else ~/.figma-mcp. Never the tool folder. */
export function dataDir(): string {
  const base = process.env.CLAUDE_PLUGIN_DATA || process.env.FIGMA_MCP_DATA || path.join(os.homedir(), '.figma-mcp');
  try {
    fs.mkdirSync(base, { recursive: true });
  } catch {
    /* read-only home: logging to file is skipped */
  }
  return base;
}

let logFile: string | null = null;

export function log(...parts: unknown[]) {
  const line = `[figma-mcp ${new Date().toISOString().slice(11, 19)}] ${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}`;
  process.stderr.write(line + '\n');
  try {
    if (!logFile) logFile = path.join(dataDir(), 'server.log');
    const st = fs.existsSync(logFile) ? fs.statSync(logFile) : null;
    if (st && st.size > 1_000_000) fs.renameSync(logFile, logFile + '.1');
    fs.appendFileSync(logFile, `${new Date().toISOString()} pid=${process.pid} ${line}\n`);
  } catch {
    /* ignore */
  }
}
