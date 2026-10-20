// figma-mcp launcher — the fixed entry point AI tools start (Codex, OpenCode, Antigravity, Cursor,
// Gemini CLI, Claude Desktop). `npm run setup` copies it to ~/.figma-mcp/launch.mjs; the server keeps
// that copy current. It finds the figma-mcp folder wherever it is now and runs its server, so moving
// the folder never breaks a tool.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const recordFile = path.join(here, 'install.json');
const serverOf = (root) => path.join(root, 'claude-plugin', 'dist', 'server.mjs');

function isTool(root) {
  try {
    return (
      fs.existsSync(serverOf(root)) &&
      fs.existsSync(path.join(root, 'figma-plugin', 'manifest.json')) &&
      JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name === 'figma-mcp'
    );
  } catch {
    return false;
  }
}

function readRecord() {
  try {
    return JSON.parse(fs.readFileSync(recordFile, 'utf8'));
  } catch {
    return {};
  }
}

/** Where the folder went: Spotlight first (macOS), then a bounded walk of the usual places. Newest build wins. */
function locate() {
  const found = new Set();
  const add = (root) => {
    if (!root.split(path.sep).includes('.Trash') && isTool(root)) found.add(fs.realpathSync(root));
  };
  const only = process.env.FIGMA_MCP_SEARCH; // tests and unusual layouts: folders separated by ":"
  if (!only && process.platform === 'darwin') {
    const r = spawnSync('/usr/bin/mdfind', ['-onlyin', os.homedir(), 'kMDItemFSName == "server.mjs"'], { encoding: 'utf8', timeout: 8000 });
    const tail = path.join('claude-plugin', 'dist', 'server.mjs');
    for (const line of (r.stdout || '').split('\n')) if (line.endsWith(path.sep + tail)) add(line.slice(0, -tail.length - 1));
  }
  if (!found.size) {
    const home = os.homedir();
    const roots = only ? only.split(path.delimiter) : ['Desktop', 'Documents', 'Developer', 'Projects', 'projects', 'code', 'Code', 'dev', 'src', 'work', 'repos', 'GitHub', 'Downloads'].map((d) => path.join(home, d));
    const skip = new Set(['node_modules', 'Library', 'Applications', 'Music', 'Movies', 'Pictures']);
    let budget = 40_000;
    const walk = (dir, depth) => {
      if (depth < 0 || budget-- <= 0) return;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      if (entries.some((e) => e.name === 'claude-plugin' && e.isDirectory()) && isTool(dir)) {
        add(dir);
        return;
      }
      for (const e of entries) if (e.isDirectory() && !e.name.startsWith('.') && !skip.has(e.name)) walk(path.join(dir, e.name), depth - 1);
    };
    for (const r of roots) walk(r, 6);
  }
  return [...found].sort((a, b) => fs.statSync(serverOf(b)).mtimeMs - fs.statSync(serverOf(a)).mtimeMs)[0] ?? null;
}

const record = readRecord();
let root = record.root && isTool(record.root) ? record.root : null;
if (!root) {
  root = locate();
  if (root) {
    process.stderr.write(`[figma-mcp] the folder moved: ${record.root ?? '(not recorded)'} → ${root}\n`);
    try {
      fs.writeFileSync(recordFile, JSON.stringify({ ...record, root, movedAt: new Date().toISOString() }, null, 2) + '\n');
    } catch {
      /* read-only home: still start */
    }
  }
}
if (!root) {
  process.stderr.write(`[figma-mcp] can't find the figma-mcp folder${record.root ? ` (it was at ${record.root})` : ''}. Open it in a terminal and run: npm run setup\n`);
  process.exit(1);
}
await import(pathToFileURL(serverOf(root)).href);
