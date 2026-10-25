// Where figma-mcp can be installed: for each AI tool, where it keeps MCP servers and skills, whether
// figma-mcp is already there, and how to put it there. Used by setup.mjs and doctor.mjs.
// Every path is worked out at run time, so this folder can live anywhere and move. Tools start the
// fixed launcher ~/.figma-mcp/launch.mjs, which finds this folder by itself.

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
export const NAME = 'figma-mcp';
export const SERVER = path.join(ROOT, 'claude-plugin', 'dist', 'server.mjs');
const SKILLS = path.join(ROOT, 'agent-skills');
const MARKET = 'figma-mcp-local';
const HOME = os.homedir();
/** The fixed place tools and Figma point to; it stays put when this folder moves. */
export const HOME_DIR = process.env.FIGMA_MCP_HOME || path.join(HOME, '.figma-mcp');
export const LAUNCHER = path.join(HOME_DIR, 'launch.mjs');
export const FIGMA_MANIFEST = path.join(HOME_DIR, 'figma-plugin', 'manifest.json');
const RECORD = path.join(HOME_DIR, 'install.json');
/** The cross-agent skills folder: read by Codex, OpenCode, Cursor and Gemini CLI. */
const AGENTS_SKILLS = path.join(HOME, '.agents', 'skills');

const exists = (p) => fs.existsSync(p);
const real = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

/** A program on PATH (or in the usual install places GUI apps don't see). */
export function which(bin) {
  const dirs = [...(process.env.PATH ?? '').split(path.delimiter), '/opt/homebrew/bin', '/usr/local/bin', path.join(HOME, '.local', 'bin'), path.join(HOME, '.npm-global', 'bin'), path.join(HOME, '.bun', 'bin'), path.join(HOME, `.${bin}`, 'bin')];
  for (const d of dirs) {
    const p = d && path.join(d, bin);
    if (p && exists(p)) return p;
  }
  return null;
}

/** The node tools should start: a stable path (Homebrew's link survives upgrades), absolute for GUI apps. */
export function nodePath() {
  const onPath = which('node');
  for (const p of [onPath, '/opt/homebrew/bin/node', '/usr/local/bin/node']) if (p && exists(p)) return p;
  return process.execPath;
}

export function readRecord() {
  try {
    return JSON.parse(fs.readFileSync(RECORD, 'utf8'));
  } catch {
    return null;
  }
}

/** JSON or JSONC (comments, trailing commas) → { data, comments } — null data when unreadable. */
function readJson(file) {
  if (!exists(file)) return { data: {}, comments: false, missing: true };
  const text = fs.readFileSync(file, 'utf8');
  try {
    return { data: JSON.parse(text), comments: false };
  } catch {
    /* maybe JSONC */
  }
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') while (i < text.length && text[i] !== '\n') i++;
    else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i < 0) break;
      i++;
    } else out += c;
  }
  try {
    return { data: JSON.parse(out.replace(/,(\s*[}\]])/g, '$1')), comments: true };
  } catch {
    return { data: null, comments: true };
  }
}

/** Does this MCP entry already start our launcher? */
const startsLauncher = (entry) => !!entry && JSON.stringify(entry).includes(JSON.stringify(LAUNCHER).slice(1, -1));
const stateOf = (entry) => (!entry ? 'absent' : startsLauncher(entry) ? 'installed' : 'outdated');

// ───────────── writing (dry-run aware, one backup per file) ─────────────

export function makeIO({ dry = false, say = console.log } = {}) {
  const ok = (s) => say(`  ✓ ${s}`);
  const warn = (s) => say(`  ! ${s}`);
  const write = (file, text) => {
    if (dry) {
      say(`  (dry run) would write ${file}`);
      return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const backup = `${file}.bak-figma-mcp`;
    if (exists(file) && !exists(backup)) fs.copyFileSync(file, backup);
    fs.writeFileSync(file, text);
  };
  return { dry, say, ok, warn, write };
}

/** {mcpServers: {"figma-mcp": entry}} in a JSON config, everything else kept. */
function mergeJsonServer(io, file, entry, key = 'mcpServers') {
  const { data, comments } = readJson(file);
  if (!data || comments) {
    io.warn(`${file} has comments or is not plain JSON — add this under "${key}" yourself:\n${JSON.stringify({ [NAME]: entry }, null, 2)}`);
    return false;
  }
  data[key] = { ...(data[key] ?? {}), [NAME]: entry };
  io.write(file, JSON.stringify(data, null, 2) + '\n');
  io.ok(`MCP server "${NAME}" → ${file}`);
  return true;
}

/** Content hash of a skill folder — the server compares it to refresh installed copies (src/server/home.ts). */
function skillHash(dir) {
  const h = crypto.createHash('sha1');
  const files = fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => f !== '.figma-mcp' && fs.statSync(path.join(dir, f)).isFile()).sort();
  for (const f of files) h.update(`${f.split(path.sep).join('/')}\0`).update(fs.readFileSync(path.join(dir, f))).update('\0');
  return h.digest('hex').slice(0, 16);
}

/** Copies the portable skills into a skills folder (only folders figma-mcp installed get replaced). */
function copySkills(io, dir) {
  if (!exists(SKILLS)) {
    io.warn('agent-skills/ is missing — run `npm run build` first.');
    return;
  }
  const names = fs.readdirSync(SKILLS).filter((d) => fs.statSync(path.join(SKILLS, d)).isDirectory());
  for (const n of names) {
    const to = path.join(dir, n);
    if (exists(to) && !exists(path.join(to, '.figma-mcp'))) {
      io.warn(`${to} exists and was not installed by figma-mcp — left untouched.`);
      continue;
    }
    if (io.dry) continue;
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(path.join(SKILLS, n), to, { recursive: true });
    fs.writeFileSync(path.join(to, '.figma-mcp'), `installed by figma-mcp (npm run setup); kept current by its server\nhash: ${skillHash(path.join(SKILLS, n))}\n`);
  }
  // Skills figma-mcp no longer ships (e.g. the old figma-mcp-design, now a guide inside figma-mcp).
  for (const d of exists(dir) ? fs.readdirSync(dir) : []) {
    const p = path.join(dir, d);
    if (d.startsWith(NAME) && !names.includes(d) && exists(path.join(p, '.figma-mcp')) && !io.dry) fs.rmSync(p, { recursive: true, force: true });
  }
  io.ok(`skill ${names.join(', ')} → ${dir}`);
}

function removeOurSkills(io, dir) {
  if (!exists(dir)) return;
  for (const d of fs.readdirSync(dir)) {
    const p = path.join(dir, d);
    if (d.startsWith(NAME) && exists(path.join(p, '.figma-mcp')) && !io.dry) fs.rmSync(p, { recursive: true, force: true });
  }
}

// ───────────── TOML (Codex) ─────────────

const tomlValue = (v) => (Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(', ')}]` : typeof v === 'string' ? JSON.stringify(v) : String(v));

/** Sets keys in the [mcp_servers.<name>] table (multi-line values included), keeping the user's other keys. */
export function upsertTomlServer(text, name, set, defaults = {}) {
  const header = `[mcp_servers.${name}]`;
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === header);
  if (start < 0) {
    const body = [header, ...Object.entries({ ...set, ...defaults }).map(([k, v]) => `${k} = ${tomlValue(v)}`)];
    return (text.trimEnd() ? `${text.trimEnd()}\n\n` : '') + body.join('\n') + '\n';
  }
  let end = lines.findIndex((l, i) => i > start && /^\s*\[/.test(l));
  if (end < 0) end = lines.length;
  const kept = [];
  const present = new Set();
  for (let i = start + 1; i < end; i++) {
    const key = lines[i].match(/^\s*([A-Za-z0-9_-]+)\s*=/)?.[1];
    if (key) present.add(key);
    if (key && key in set) {
      // drop the old value, including the rest of a multi-line array
      let depth = (lines[i].match(/\[/g) ?? []).length - (lines[i].match(/\]/g) ?? []).length;
      while (depth > 0 && i + 1 < end) {
        i++;
        depth += (lines[i].match(/\[/g) ?? []).length - (lines[i].match(/\]/g) ?? []).length;
      }
      continue;
    }
    kept.push(lines[i]);
  }
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  const add = Object.entries(defaults).filter(([k]) => !present.has(k));
  const block = [header, ...Object.entries(set).map(([k, v]) => `${k} = ${tomlValue(v)}`), ...kept, ...add.map(([k, v]) => `${k} = ${tomlValue(v)}`)];
  const after = lines.slice(end);
  return [...lines.slice(0, start), ...block, ...(after.length ? [''] : []), ...after].join('\n').replace(/\n*$/, '\n');
}

function tomlBlock(text, name) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === `[mcp_servers.${name}]`);
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^\s*\[/.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start, end).join('\n');
}

// ───────────── the tools ─────────────

function codexHome() {
  return process.env.CODEX_HOME || path.join(HOME, '.codex');
}

function codexBin() {
  return (
    which('codex') ??
    ['/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex', '/Applications/Codex.app/Contents/Resources/codex'].find(exists) ??
    null
  );
}

function opencodeConfig() {
  const dir = path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'), 'opencode');
  return ['opencode.json', 'opencode.jsonc'].map((f) => path.join(dir, f)).find(exists) ?? path.join(dir, 'opencode.json');
}

const gemini = path.join(HOME, '.gemini');
const antigravityConfigs = () => [path.join(gemini, 'config', 'mcp_config.json'), ...['antigravity', 'antigravity-cli'].map((d) => path.join(gemini, d, 'mcp_config.json')).filter(exists)];
const claudeDesktopConfig = path.join(HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');

function run(bin, args, extra = {}) {
  const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 120_000, ...extra });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

export const clients = [
  {
    id: 'claude',
    name: 'Claude Code',
    what: 'plugin: MCP + skills + folder guard',
    next: 'start a new session (or /reload-plugins)',
    detect() {
      const found = !!which('claude');
      const plugins = path.join(HOME, '.claude', 'plugins');
      const market = readJson(path.join(plugins, 'known_marketplaces.json')).data?.[MARKET];
      const installed = !!readJson(path.join(plugins, 'installed_plugins.json')).data?.plugins?.[`${NAME}@${MARKET}`];
      const at = market?.source?.path ?? market?.installLocation;
      const state = !market && !installed ? 'absent' : installed && at && real(at) === ROOT ? 'installed' : 'outdated';
      return { found, state, detail: at && real(at) !== ROOT ? `points to ${at}` : undefined };
    },
    install(io) {
      const bin = which('claude');
      if (!bin) {
        io.warn('the `claude` command was not found. Inside Claude Code run:');
        io.say(`      /plugin marketplace add ${ROOT}\n      /plugin install ${NAME}@${MARKET}`);
        return false;
      }
      if (io.dry) {
        io.say(`  (dry run) would register ${ROOT} as marketplace "${MARKET}" and install ${NAME}@${MARKET} (user scope)`);
        return true;
      }
      const { detail } = this.detect();
      if (detail) {
        run(bin, ['plugin', 'marketplace', 'remove', MARKET]); // the folder moved: register it again where it is now
        io.ok(`old registration removed (${detail.replace('points to ', '')})`);
      }
      const add = run(bin, ['plugin', 'marketplace', 'add', ROOT]);
      if (add.status !== 0 && !/already/i.test(add.out)) {
        io.warn(`marketplace add: ${add.out}`);
        return false;
      }
      run(bin, ['plugin', 'marketplace', 'update', MARKET]);
      const inst = run(bin, ['plugin', 'install', `${NAME}@${MARKET}`, '--scope', 'user']);
      if (inst.status !== 0 && !/already/i.test(inst.out)) {
        io.warn(`plugin install: ${inst.out}`);
        return false;
      }
      run(bin, ['plugin', 'enable', `${NAME}@${MARKET}`]);
      io.ok(`plugin ${NAME}@${MARKET} → read from ${path.join(ROOT, 'claude-plugin')}`);
      return true;
    },
  },
  {
    id: 'codex',
    name: 'Codex',
    what: 'MCP + skills (Codex desktop + CLI)',
    next: 'quit and reopen the ChatGPT app (or start a new Codex thread) · check: codex mcp list',
    detect() {
      const cfg = path.join(codexHome(), 'config.toml');
      const block = exists(cfg) ? tomlBlock(fs.readFileSync(cfg, 'utf8'), NAME) : null;
      return { found: !!codexBin() || exists(codexHome()), state: block === null ? 'absent' : block.includes(LAUNCHER) ? 'installed' : 'outdated' };
    },
    install(io, { node }) {
      const cfg = path.join(codexHome(), 'config.toml');
      const text = exists(cfg) ? fs.readFileSync(cfg, 'utf8') : '';
      // Long operations (big builds, exports) need more than Codex's default tool timeout.
      io.write(cfg, upsertTomlServer(text, NAME, { command: node, args: [LAUNCHER] }, { startup_timeout_sec: 30, tool_timeout_sec: 300 }));
      io.ok(`MCP server "${NAME}" → ${cfg}`);
      copySkills(io, AGENTS_SKILLS);
      removeOurSkills(io, path.join(codexHome(), 'skills')); // old location — avoid duplicates
      return true;
    },
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    what: 'MCP + skills',
    next: 'run `opencode service restart` (the background service keeps MCP servers running across chats) · skills: /skills',
    detect() {
      const { data } = readJson(opencodeConfig());
      return { found: !!which('opencode') || exists(path.dirname(opencodeConfig())), state: stateOf(data?.mcp?.servers?.[NAME] ?? data?.mcp?.[NAME]) };
    },
    install(io, { node }) {
      const cfg = opencodeConfig();
      const { data, comments } = readJson(cfg);
      const entry = { type: 'local', command: [node, LAUNCHER], codemode: false };
      if (!data || comments) {
        io.warn(`${cfg} has comments — add this by hand:\n${JSON.stringify({ mcp: { servers: { [NAME]: entry } } }, null, 2)}`);
        copySkills(io, AGENTS_SKILLS);
        return false;
      }
      data.mcp ??= {};
      data.mcp.servers ??= {};
      // codemode: false → the model sees every tool directly (Code Mode hides them behind one tool).
      data.mcp.servers[NAME] = entry;
      // Skills come from ~/.agents/skills (OpenCode reads it); drop old links into a figma-mcp folder.
      const ours = (p) => typeof p === 'string' && /agent-skills\/?$/.test(p) && p.includes(NAME);
      if (Array.isArray(data.skills)) data.skills = data.skills.filter((p) => !ours(p));
      else if (data.skills?.paths) data.skills.paths = data.skills.paths.filter((p) => !ours(p));
      if (Array.isArray(data.skills) && !data.skills.length) delete data.skills;
      io.write(cfg, JSON.stringify(data, null, 2) + '\n');
      io.ok(`MCP server "${NAME}" (codemode off) → ${cfg}`);
      copySkills(io, AGENTS_SKILLS);
      if (data.mcp.servers.figma) io.say('  · "figma" in that config is Figma\'s official remote server; both work side by side.');
      return true;
    },
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    what: 'MCP + skills (App, IDE and agy)',
    next: 'Antigravity: Manage MCP Servers → Refresh · agy: /mcp',
    detect() {
      const found = exists('/Applications/Antigravity.app') || !!which('agy') || exists(path.join(gemini, 'config')) || exists(path.join(gemini, 'antigravity'));
      return { found, state: stateOf(readJson(antigravityConfigs()[0]).data?.mcpServers?.[NAME]) };
    },
    install(io, { node }) {
      let ok = true;
      for (const cfg of antigravityConfigs()) ok = mergeJsonServer(io, cfg, { command: node, args: [LAUNCHER] }) && ok;
      copySkills(io, path.join(gemini, 'config', 'skills'));
      for (const d of ['antigravity', 'antigravity-cli']) if (exists(path.join(gemini, d))) copySkills(io, path.join(gemini, d, 'skills'));
      return ok;
    },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    what: 'MCP + skills',
    next: 'Cursor Settings → MCP: make sure "figma-mcp" is on',
    detect() {
      return { found: exists('/Applications/Cursor.app') || exists(path.join(HOME, '.cursor')), state: stateOf(readJson(path.join(HOME, '.cursor', 'mcp.json')).data?.mcpServers?.[NAME]) };
    },
    install(io, { node }) {
      const ok = mergeJsonServer(io, path.join(HOME, '.cursor', 'mcp.json'), { type: 'stdio', command: node, args: [LAUNCHER] });
      copySkills(io, AGENTS_SKILLS);
      return ok;
    },
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    what: 'MCP + skills',
    next: 'restart Gemini CLI · /mcp, /skills',
    detect() {
      const cfg = path.join(gemini, 'settings.json');
      return { found: !!which('gemini') || exists(cfg), state: stateOf(readJson(cfg).data?.mcpServers?.[NAME]) };
    },
    install(io, { node }) {
      const ok = mergeJsonServer(io, path.join(gemini, 'settings.json'), { command: node, args: [LAUNCHER], timeout: 600000 });
      copySkills(io, AGENTS_SKILLS);
      return ok;
    },
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    what: 'MCP + skill ZIP to upload',
    next: 'quit and reopen Claude Desktop · upload the ZIP: Customize → Skills',
    detect() {
      return { found: exists('/Applications/Claude.app') || exists(path.dirname(claudeDesktopConfig)), state: stateOf(readJson(claudeDesktopConfig).data?.mcpServers?.[NAME]) };
    },
    install(io, { node }) {
      const ok = mergeJsonServer(io, claudeDesktopConfig, { command: node, args: [LAUNCHER] });
      // Claude Desktop/claude.ai skills live in the account: one ZIP per skill to upload.
      const outDir = path.join(HOME, 'Downloads', 'figma-mcp-skills');
      if (!io.dry) {
        fs.mkdirSync(outDir, { recursive: true });
        for (const z of fs.readdirSync(outDir)) if (z.startsWith(NAME) && z.endsWith('.zip')) fs.rmSync(path.join(outDir, z));
        for (const n of fs.readdirSync(SKILLS).filter((d) => fs.statSync(path.join(SKILLS, d)).isDirectory())) {
          const zip = path.join(outDir, `${n}.zip`);
          fs.rmSync(zip, { force: true });
          if (run('/usr/bin/zip', ['-qr', zip, n, '-x', '*/.figma-mcp'], { cwd: SKILLS }).status !== 0) io.warn(`zip failed for ${n}`);
        }
      }
      io.ok(`skill ZIP → ${outDir}`);
      return ok;
    },
  },
];

// ───────────── ~/.figma-mcp ─────────────

function copyIfChanged(from, to, dry) {
  const next = fs.readFileSync(from);
  if (exists(to) && fs.readFileSync(to).equals(next)) return false;
  if (dry) return true;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(`${to}.tmp`, next);
  fs.renameSync(`${to}.tmp`, to);
  return true;
}

/** Writes the fixed launcher, the Figma plugin copy and the install record. */
export function writeHome(io, { node, installed = [] }) {
  const before = readRecord();
  copyIfChanged(path.join(ROOT, 'scripts', 'home-launch.mjs'), LAUNCHER, io.dry);
  for (const f of ['manifest.json', 'code.js', 'ui.html']) copyIfChanged(path.join(ROOT, 'figma-plugin', f), path.join(HOME_DIR, 'figma-plugin', f), io.dry);
  let version = null;
  try {
    version = JSON.parse(fs.readFileSync(path.join(ROOT, 'claude-plugin', 'dist', 'source.json'), 'utf8')).version;
  } catch {
    /* unbuilt */
  }
  const record = {
    root: ROOT,
    node,
    version,
    clients: [...new Set([...(before?.clients ?? []), ...installed])],
    updated: new Date().toISOString(),
  };
  if (!io.dry) {
    fs.mkdirSync(HOME_DIR, { recursive: true });
    fs.writeFileSync(RECORD, JSON.stringify(record, null, 2) + '\n');
  }
  return { before, record };
}

/** Manifest paths Figma Desktop has imported for this plugin (read-only), or null when unknown. */
export function figmaImports() {
  const file = path.join(HOME, 'Library', 'Application Support', 'Figma', 'settings.json');
  try {
    const { id, name } = JSON.parse(fs.readFileSync(path.join(ROOT, 'figma-plugin', 'manifest.json'), 'utf8'));
    const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (settings.localFileExtensions ?? [])
      .filter((e) => typeof e?.manifestPath === 'string' && e.manifestPath.endsWith('manifest.json') && (e.lastKnownPluginId === id || e.lastKnownName === name))
      .map((e) => e.manifestPath);
  } catch {
    return null;
  }
}
