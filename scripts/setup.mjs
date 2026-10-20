// One command to install figma-mcp into your AI tools. Run it from wherever this folder is now:
//   npm run setup                          pick the tools in a list, then it installs them
//   npm run setup -- codex cursor          just these, no questions  (--all: every tool found)
//   npm run setup -- --dry-run | --print | --help
// or double-click setup.command in Finder. Moved the folder? Run it again — every path is worked out
// each time, and tools started through ~/.figma-mcp find the folder on their own.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { clients, figmaImports, FIGMA_MANIFEST, HOME_DIR, LAUNCHER, makeIO, NAME, nodePath, readRecord, ROOT, SERVER, writeHome } from './clients.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('-')));
const named = args.filter((a) => !a.startsWith('-'));
const dry = flags.has('--dry-run');
const tty = !!(process.stdout.isTTY && process.stdin.isTTY);
const paint = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const [dim, bold, green, yellow] = [paint('2'), paint('1'), paint('32'), paint('33')];
const say = (s = '') => console.log(s);

if (flags.has('--help') || flags.has('-h')) {
  say(`figma-mcp setup — install figma-mcp into your AI tools

  npm run setup                     choose in a list (↑↓ move · space select · enter install)
  npm run setup -- <tool> [<tool>…]  install into these: ${clients.map((c) => c.id).join(', ')}
  npm run setup -- --all            every tool found on this Mac
  npm run setup -- --yes            the preselected ones (already installed + Claude Code), no list
  npm run setup -- --dry-run        show what would change
  npm run setup -- --print          print the settings to paste into any other MCP tool`);
  process.exit(0);
}

const unknown = named.filter((n) => !clients.some((c) => c.id === n));
if (unknown.length) {
  say(`Unknown tool: ${unknown.join(', ')}. Choose from: ${clients.map((c) => c.id).join(', ')}`);
  process.exit(1);
}

// ───────────── build ─────────────
if (!fs.existsSync(SERVER)) {
  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
    say('figma-mcp is not built yet: run `npm install`, then this again.');
    process.exit(1);
  }
  spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs')], { stdio: 'inherit' });
}

const node = nodePath();
const nodeVersion = spawnSync(node, ['--version'], { encoding: 'utf8' }).stdout?.trim();
const previous = readRecord();
say(`${bold('figma-mcp setup')}${dry ? dim(' (dry run)') : ''}`);
say(`  folder  ${ROOT}`);
if (previous?.root && previous.root !== ROOT) say(`  ${yellow('moved')}   from ${previous.root} — everything will point here now`);
say(`  node    ${node}${nodeVersion ? dim(` (${nodeVersion})`) : ''}`);

if (flags.has('--print')) {
  writeHome(makeIO({ dry }), { node });
  say(`\nAny MCP tool: run ${node} with ${LAUNCHER} (a fixed launcher that finds this folder).`);
  say('\nJSON tools (mcpServers):');
  say(JSON.stringify({ mcpServers: { [NAME]: { command: node, args: [LAUNCHER] } } }, null, 2));
  say('\nCodex (~/.codex/config.toml):');
  say(`[mcp_servers.${NAME}]\ncommand = ${JSON.stringify(node)}\nargs = [${JSON.stringify(LAUNCHER)}]\nstartup_timeout_sec = 30\ntool_timeout_sec = 300`);
  say('\nOpenCode (~/.config/opencode/opencode.json):');
  say(JSON.stringify({ mcp: { servers: { [NAME]: { type: 'local', command: [node, LAUNCHER], codemode: false } } } }, null, 2));
  say(`\nSkills: copy the folders in ${path.join(ROOT, 'agent-skills')} into the tool's skills folder (~/.agents/skills for most).`);
  process.exit(0);
}

// ───────────── choose ─────────────
const rows = clients.map((c) => ({ c, ...c.detect(), on: false }));
for (const r of rows) {
  if (named.length) r.on = named.includes(r.c.id);
  else if (flags.has('--all')) r.on = r.found || r.state !== 'absent';
  else r.on = r.state !== 'absent' || (r.c.id === 'claude' && r.found);
}

const statusText = (r) =>
  r.state === 'installed' ? green('installed ✓') : r.state === 'outdated' ? yellow('installed · will update') : r.found ? 'found' : dim('not found');

function table() {
  for (const r of rows) say(`   ${r.c.name.padEnd(15)} ${dim(r.c.what.padEnd(40))} ${statusText(r)}`);
}

/** Checkbox list: ↑/↓ (or j/k) move, space toggles, a toggles all, 1–9 jump+toggle, enter confirms, q/esc cancels. */
function menu() {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    let at = 0;
    const wide = (stdout.columns ?? 100) >= 92;
    const render = (again) => {
      if (again) stdout.write(`\x1b[${rows.length + 1}A`);
      rows.forEach((r, i) => {
        const here = i === at;
        const name = r.c.name.padEnd(15);
        stdout.write(`\x1b[2K ${here ? bold('›') : ' '} ${r.on ? green('[x]') : '[ ]'} ${here ? bold(name) : name} ${wide ? dim(r.c.what.padEnd(40)) + ' ' : ''}${statusText(r)}\n`);
      });
      stdout.write(`\x1b[2K${dim('   ↑↓ move · space select · a all · enter install · q cancel')}\n`);
    };
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write('\x1b[?25l');
    process.on('exit', () => stdout.write('\x1b[?25h'));
    render(false);
    const done = (value) => {
      stdin.off('keypress', onKey);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\x1b[?25h');
      resolve(value);
    };
    function onKey(str, key = {}) {
      if ((key.ctrl && key.name === 'c') || key.name === 'q' || key.name === 'escape') return done(null);
      if (key.name === 'return' || key.name === 'enter') return done(rows.filter((r) => r.on));
      if (key.name === 'up' || key.name === 'k') at = (at + rows.length - 1) % rows.length;
      else if (key.name === 'down' || key.name === 'j') at = (at + 1) % rows.length;
      else if (key.name === 'space') rows[at].on = !rows[at].on;
      else if (key.name === 'a') {
        const all = rows.every((r) => r.on);
        for (const r of rows) r.on = !all;
      } else if (/^[1-9]$/.test(str ?? '') && rows[Number(str) - 1]) {
        at = Number(str) - 1;
        rows[at].on = !rows[at].on;
      } else return;
      render(true);
    }
    stdin.on('keypress', onKey);
  });
}

let chosen;
if (named.length || flags.has('--all') || flags.has('--yes')) chosen = rows.filter((r) => r.on);
else if (tty) {
  say(`\n${bold('Where should figma-mcp be installed?')}`);
  chosen = await menu();
  if (!chosen) {
    say('Cancelled — nothing changed.');
    process.exit(0);
  }
} else {
  say('\nTools on this Mac:');
  table();
  say(`\nRun it in a terminal to choose from a list, or name the tools: npm run setup -- ${rows.filter((r) => r.on).map((r) => r.c.id).join(' ') || 'claude codex'} (or --all).`);
  process.exit(0);
}
if (!chosen.length) {
  say('Nothing selected — nothing changed.');
  process.exit(0);
}

// ───────────── install ─────────────
const io = makeIO({ dry, say });
writeHome(io, { node }); // the launcher must exist before any tool starts it
say(`\n${bold('~/.figma-mcp')} ${dim(`(${HOME_DIR})`)}`);
io.ok('launcher, Figma plugin copy and install record (they find this folder even after it moves)');

const installed = [];
for (const r of chosen) {
  say(`\n${bold(r.c.name)}`);
  try {
    if (r.c.install(io, { node })) installed.push(r.c);
  } catch (e) {
    io.warn(e instanceof Error ? e.message : String(e));
  }
}
writeHome(io, { node, installed: installed.map((c) => c.id) });

// ───────────── Figma ─────────────
say(`\n${bold('Figma')}`);
const real = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};
const imports = figmaImports();
const fixed = (imports ?? []).filter((p) => real(p) === real(FIGMA_MANIFEST));
const others = (imports ?? []).filter((p) => real(p) !== real(FIGMA_MANIFEST));
if (fixed.length) io.ok(`"Figma MCP" is imported from ${FIGMA_MANIFEST} — it keeps working wherever this folder goes.`);
else {
  let copied = false;
  if (process.platform === 'darwin' && !dry && tty) copied = spawnSync('pbcopy', { input: FIGMA_MANIFEST }).status === 0;
  say('  Once: Figma Desktop → Plugins → Development → Import plugin from manifest…');
  say('        in the file window press ⌘⇧G, paste (⌘V), Enter, then Open:');
  say(`        ${FIGMA_MANIFEST}${copied ? dim('   (copied — just paste)') : ''}`);
}
for (const p of others) {
  const gone = !fs.existsSync(p);
  say(`  ${yellow('!')} Figma also has "Figma MCP" from ${p}${gone ? ' (that place no longer exists)' : ''}.`);
  say(`    ${fixed.length ? 'Remove it' : 'After importing the one above, remove that one'}: Plugins → Development → Manage plugins in development.`);
}
say('  Every time: open your design file → Plugins → Development → Figma MCP, and keep its panel open.');

// ───────────── done ─────────────
say(`\n${bold(dry ? 'Dry run — nothing was changed.' : installed.length ? 'Done.' : 'Nothing was installed.')}`);
for (const c of installed) say(`  ${c.name.padEnd(15)} ${c.next}`);
const failed = chosen.filter((r) => !installed.includes(r.c));
for (const r of failed) say(`  ${r.c.name.padEnd(15)} ${yellow('needs the manual step shown above')}`);
say(dim(`\nMoved this folder later? Run this again (npm run setup, or double-click setup.command).`));
process.exit(failed.length ? 1 : 0);
