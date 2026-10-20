// Health check: build, where figma-mcp is installed, hub ports, connected Figma files, recent log.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clients, figmaImports, FIGMA_MANIFEST, LAUNCHER, readRecord, ROOT } from './clients.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(root, ...p);
const PORTS = [7457, 7458, 7459];

const line = (ok, s) => console.log(`${ok === true ? '✓' : ok === false ? '✕' : '·'} ${s}`);

function versionOf(file) {
  try {
    const m = fs.readFileSync(file, 'utf8').match(/\d+\.\d+\.\d+\+[0-9a-f]{7}/);
    return m ? m[0] : '?';
  } catch {
    return null;
  }
}

function health(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/figma-mcp/health', timeout: 1200 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ foreign: true });
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

console.log('figma-mcp doctor\n');
const sv = versionOf(rel('claude-plugin/dist/server.mjs'));
const pv = versionOf(rel('figma-plugin/code.js'));
line(!!sv, `server build ${sv ?? 'missing — run npm run build'}`);
line(!!pv, `figma plugin build ${pv ?? 'missing — run npm run build'}`);
if (sv && pv && sv !== pv) line(false, 'server and plugin builds differ — run npm run build');
line(fs.existsSync(rel('figma-plugin/manifest.json')), `manifest: ${rel('figma-plugin/manifest.json')}`);

const node = spawnSync('node', ['--version'], { encoding: 'utf8' });
line(node.status === 0, `node on PATH: ${node.status === 0 ? node.stdout.trim() : 'not found (Claude Code needs `node` on PATH)'}`);

// Where figma-mcp is installed (npm run setup).
const record = readRecord();
if (!record) line(null, '~/.figma-mcp (launcher + Figma plugin copy) not set up yet — run: npm run setup');
else {
  line(fs.existsSync(LAUNCHER), `launcher for the tools: ${LAUNCHER}`);
  line(record.root === ROOT, record.root === ROOT ? 'install record points to this folder' : `install record points to ${record.root} — run npm run setup here`);
}
for (const c of clients) {
  const d = c.detect();
  if (d.state === 'installed') line(true, `${c.name}: installed`);
  else if (d.state === 'outdated') line(false, `${c.name}: installed with an old path${d.detail ? ` (${d.detail})` : ''} — run npm run setup`);
  else if (d.found) line(null, `${c.name}: found, figma-mcp not installed`);
}
const imports = figmaImports();
const same = (a, b) => {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return false;
  }
};
if (imports) {
  if (imports.some((p) => same(p, FIGMA_MANIFEST))) line(true, `Figma plugin imported from ${FIGMA_MANIFEST}`);
  else line(null, `Figma plugin not imported from ${FIGMA_MANIFEST} yet — npm run setup shows how`);
  for (const p of imports.filter((p) => !same(p, FIGMA_MANIFEST))) line(fs.existsSync(p) ? null : false, `Figma also has it from ${p}${fs.existsSync(p) ? '' : ' (gone — remove it in Plugins → Development → Manage plugins in development)'}`);
}

let hub = false;
for (const port of PORTS) {
  const h = await health(port);
  if (!h) {
    line(null, `port ${port}: free`);
    continue;
  }
  if (h.foreign || h.service !== 'figma-mcp') {
    line(false, `port ${port}: used by another program`);
    continue;
  }
  hub = true;
  line(true, `hub on ${port}: v${h.version} pid ${h.pid}, ${h.agents} other session(s)`);
  if (sv && h.version !== sv) line(null, `  hub was started by build ${h.version} (pid ${h.pid}); it only relays, but that session's own tools stay on the older build until it restarts`);
  if (!h.plugins.length) line(false, '  no Figma file connected — run the "Figma MCP" plugin in Figma Desktop');
  for (const p of h.plugins) line(p.version === sv || p.version === 'dev', `  Figma: "${p.file}" · page "${p.page}" · plugin ${p.version}${p.paused ? ' · PAUSED' : ''}${sv && p.version !== sv ? ' — re-run the plugin to load the new build' : ''}`);
  break;
}
if (!hub) line(null, 'no hub running — it starts with the first Claude Code session that uses figma-mcp');

const logs = [process.env.CLAUDE_PLUGIN_DATA, path.join(os.homedir(), '.figma-mcp')]
  .filter(Boolean)
  .map((d) => path.join(d, 'server.log'))
  .concat(
    (() => {
      const base = path.join(os.homedir(), '.claude', 'plugins', 'data');
      try {
        return fs.readdirSync(base).filter((d) => d.includes('figma-mcp')).map((d) => path.join(base, d, 'server.log'));
      } catch {
        return [];
      }
    })(),
  )
  .filter((f) => fs.existsSync(f));
for (const f of logs) {
  console.log(`\nlast log lines (${f}):`);
  console.log(fs.readFileSync(f, 'utf8').trim().split('\n').slice(-12).join('\n'));
}
