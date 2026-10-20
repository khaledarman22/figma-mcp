// Builds the three runtime pieces:
//   claude-plugin/dist/server.mjs  — MCP server (all deps bundled; no node_modules needed at runtime)
//   claude-plugin/dist/guard.mjs   — PreToolUse hook that keeps this folder clean
//   figma-plugin/code.js + ui.html — the Figma development plugin
// The version string (package version + content hash) is baked into server and plugin so a
// stale plugin is detected and reported.

import { build } from 'esbuild';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(root, ...p);
const pkg = JSON.parse(fs.readFileSync(rel('package.json'), 'utf8'));

function hashDir(dir, h) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) hashDir(p, h);
    else {
      h.update(entry.name);
      h.update(fs.readFileSync(p));
    }
  }
}
const h = crypto.createHash('sha256');
hashDir(rel('src'), h);
const version = `${pkg.version}+${h.digest('hex').slice(0, 7)}`;
const define = { __FIGMA_MCP_VERSION__: JSON.stringify(version) };

const t0 = Date.now();
await Promise.all([
  build({
    entryPoints: [rel('src/server/index.ts')],
    outfile: rel('claude-plugin/dist/server.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    define,
    legalComments: 'none',
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: 'warning',
  }),
  build({
    entryPoints: [rel('src/guard/guard.ts')],
    outfile: rel('claude-plugin/dist/guard.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    logLevel: 'warning',
  }),
  build({
    entryPoints: [rel('src/plugin/main.ts')],
    outfile: rel('figma-plugin/code.js'),
    bundle: true,
    platform: 'neutral',
    format: 'iife',
    // Figma's sandbox: ES2017 is the safe floor (async/await stays native; ?. ?? spread get lowered).
    target: 'es2017',
    define,
    logLevel: 'warning',
  }),
]);

const ui = await build({
  entryPoints: [rel('src/ui/ui.ts')],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  target: 'es2019',
  define,
  minify: true,
  logLevel: 'warning',
});
const html = fs.readFileSync(rel('src/ui/ui.html'), 'utf8').replace('/*__UI_SCRIPT__*/', () => ui.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
fs.writeFileSync(rel('figma-plugin/ui.html'), html);

// Where the source lives, so a copy of the plugin (e.g. in Claude's plugin cache) still finds the
// real folder: the guard protects it, the server pushes its Figma bundle, the launcher prefers its build.
fs.writeFileSync(rel('claude-plugin/dist/source.json'), JSON.stringify({ repo: root, version }, null, 2) + '\n');
fs.writeFileSync(
  rel('claude-plugin/dist/launch.mjs'),
  `// Starts the server next to this file; from a copy outside the source folder (e.g. a plugin cache),
// the source folder's newer build recorded in source.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
let target = path.join(here, 'server.mjs');
if (!fs.existsSync(path.join(here, '..', '..', 'figma-plugin', 'manifest.json'))) {
  try {
    const { repo } = JSON.parse(fs.readFileSync(path.join(here, 'source.json'), 'utf8'));
    const candidate = path.join(repo, 'claude-plugin', 'dist', 'server.mjs');
    if (fs.existsSync(candidate)) target = candidate;
  } catch {}
}
await import(pathToFileURL(target).href);
`,
);

// Portable copies of the skills for other agents (Codex, OpenCode, Antigravity, …): plain Agent Skills
// folders with unique names ("figma-mcp", "figma-mcp-design", …) instead of Claude's "figma-mcp:<skill>".
const skillSrc = rel('claude-plugin/skills');
const skillOut = rel('agent-skills');
fs.rmSync(skillOut, { recursive: true, force: true });
const portableName = (dir) => (dir === 'figma' ? 'figma-mcp' : `figma-mcp-${dir}`);
const rewrite = (text) =>
  text
    .replace(/figma-mcp:figma\b/g, 'figma-mcp')
    .replace(/figma-mcp:(design-system|design|prototype|to-code)\b/g, 'figma-mcp-$1');
for (const dir of fs.readdirSync(skillSrc)) {
  const from = path.join(skillSrc, dir);
  if (!fs.statSync(from).isDirectory()) continue;
  const to = path.join(skillOut, portableName(dir));
  fs.cpSync(from, to, { recursive: true });
  for (const file of fs.readdirSync(to, { recursive: true })) {
    const f = path.join(to, String(file));
    if (!f.endsWith('.md')) continue;
    let text = rewrite(fs.readFileSync(f, 'utf8'));
    if (path.basename(f) === 'SKILL.md') {
      text = text
        .replace(/^name: .*$/m, `name: ${portableName(dir)}`)
        .replace(/^---\n([\s\S]*?)\n---\n/, (m) => `${m}\n<!-- Generated by npm run build from claude-plugin/skills/${dir} — edit the source, not this copy. -->\n`);
    }
    fs.writeFileSync(f, text);
  }
}
// (No README in agent-skills/: some agents treat every top-level .md there as a skill.)

// Keep plugin.json's version in step with package.json.
const pj = rel('claude-plugin/.claude-plugin/plugin.json');
const pluginJson = JSON.parse(fs.readFileSync(pj, 'utf8'));
if (pluginJson.version !== pkg.version) {
  pluginJson.version = pkg.version;
  fs.writeFileSync(pj, JSON.stringify(pluginJson, null, 2) + '\n');
}

// Installed with `npm run setup`? Keep its fixed copies in ~/.figma-mcp current while developing.
const homeDir = process.env.FIGMA_MCP_HOME || path.join(os.homedir(), '.figma-mcp');
try {
  const { root: installed } = JSON.parse(fs.readFileSync(path.join(homeDir, 'install.json'), 'utf8'));
  if (installed && fs.realpathSync(installed) === fs.realpathSync(root)) {
    const sync = (from, to) => {
      const next = fs.readFileSync(from);
      if (fs.existsSync(to) && fs.readFileSync(to).equals(next)) return;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, next);
    };
    sync(rel('scripts/home-launch.mjs'), path.join(homeDir, 'launch.mjs'));
    for (const f of ['manifest.json', 'code.js', 'ui.html']) sync(rel(`figma-plugin/${f}`), path.join(homeDir, 'figma-plugin', f));
  }
} catch {
  /* not installed through setup */
}

const size = (f) => `${Math.round(fs.statSync(rel(f)).size / 1024)} KB`;
console.log(`figma-mcp ${version} built in ${Date.now() - t0} ms`);
console.log(`  claude-plugin/dist/server.mjs  ${size('claude-plugin/dist/server.mjs')}`);
console.log(`  claude-plugin/dist/guard.mjs   ${size('claude-plugin/dist/guard.mjs')}`);
console.log(`  figma-plugin/code.js           ${size('figma-plugin/code.js')}`);
console.log(`  figma-plugin/ui.html           ${size('figma-plugin/ui.html')}`);
console.log(`  agent-skills/                  ${fs.readdirSync(skillOut).filter((d) => d !== 'README.md').join(', ')}`);
