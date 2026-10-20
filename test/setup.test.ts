// `npm run setup` against a fake home: every tool's config is written (or merged) with the fixed
// launcher, re-runs don't duplicate, the launcher finds a moved folder, the server records moves.

import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-setup-')));
const read = (f: string) => fs.readFileSync(f, 'utf8');

function setup(home: string, ...args: string[]) {
  const env: Record<string, string | undefined> = { ...process.env, HOME: home };
  for (const k of ['FIGMA_MCP_HOME', 'CODEX_HOME', 'XDG_CONFIG_HOME']) delete env[k];
  const r = spawnSync(process.execPath, [path.join(repo, 'scripts', 'setup.mjs'), ...args], { env: env as NodeJS.ProcessEnv, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

test('setup installs into the chosen tools through the fixed launcher, keeping existing settings', () => {
  const home = tmp();
  const launcher = path.join(home, '.figma-mcp', 'launch.mjs');
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.codex', 'config.toml'),
    ['model = "gpt-5"', '', '[mcp_servers.figma-mcp]', 'command = "node"', 'args = [', '  "/old/place/figma-mcp/claude-plugin/dist/server.mjs",', ']', 'tool_timeout_sec = 120', '', '[mcp_servers.other]', 'command = "other"', ''].join('\n'),
  );
  fs.mkdirSync(path.join(home, '.config', 'opencode'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'opencode', 'opencode.json'), JSON.stringify({ mcp: { servers: { figma: { type: 'remote', url: 'https://mcp.figma.com/mcp' } } }, skills: ['/old/place/figma-mcp/agent-skills', '/my/skills'] }));

  const r = setup(home, 'codex', 'opencode', 'antigravity', 'cursor', 'gemini', 'claude-desktop');
  assert.equal(r.code, 0, r.out);

  const record = JSON.parse(read(path.join(home, '.figma-mcp', 'install.json')));
  assert.equal(record.root, repo);
  assert.deepEqual(record.clients.sort(), ['antigravity', 'claude-desktop', 'codex', 'cursor', 'gemini', 'opencode']);
  assert.equal(read(launcher), read(path.join(repo, 'scripts', 'home-launch.mjs')));
  assert.ok(fs.existsSync(path.join(home, '.figma-mcp', 'figma-plugin', 'manifest.json')));

  const toml = read(path.join(home, '.codex', 'config.toml'));
  assert.equal(toml.match(/\[mcp_servers\.figma-mcp\]/g)?.length, 1);
  assert.ok(toml.includes(`args = [${JSON.stringify(launcher)}]`), toml);
  assert.ok(!toml.includes('/old/place'), 'multi-line old args fully replaced');
  assert.match(toml, /tool_timeout_sec = 120/, 'user value kept');
  assert.match(toml, /startup_timeout_sec = 30/);
  assert.match(toml, /model = "gpt-5"[\s\S]*\[mcp_servers\.other\]\ncommand = "other"/);

  const oc = JSON.parse(read(path.join(home, '.config', 'opencode', 'opencode.json')));
  assert.deepEqual(oc.mcp.servers['figma-mcp'].command.slice(1), [launcher]);
  assert.equal(oc.mcp.servers['figma-mcp'].codemode, false);
  assert.ok(oc.mcp.servers.figma, 'official server kept');
  assert.deepEqual(oc.skills, ['/my/skills'], 'old link into the tool folder dropped');

  for (const f of [path.join('.gemini', 'config', 'mcp_config.json'), path.join('.cursor', 'mcp.json'), path.join('.gemini', 'settings.json'), path.join('Library', 'Application Support', 'Claude', 'claude_desktop_config.json')]) {
    assert.deepEqual(JSON.parse(read(path.join(home, f))).mcpServers['figma-mcp'].args, [launcher], f);
  }
  for (const d of [path.join('.agents', 'skills', 'figma-mcp'), path.join('.agents', 'skills', 'figma-mcp-design'), path.join('.gemini', 'config', 'skills', 'figma-mcp')]) {
    assert.ok(fs.existsSync(path.join(home, d, 'SKILL.md')), d);
    assert.match(read(path.join(home, d, '.figma-mcp')), /hash: [0-9a-f]{16}/, d);
  }
  assert.ok(fs.existsSync(path.join(home, 'Downloads', 'figma-mcp-skills', 'figma-mcp-design.zip')));

  // Re-running changes nothing that matters and adds nothing twice.
  assert.equal(setup(home, 'codex', 'opencode').code, 0);
  assert.equal(read(path.join(home, '.codex', 'config.toml')), toml);
});

test('setup leaves configs with comments alone and says what to add', () => {
  const home = tmp();
  const file = path.join(home, '.cursor', 'mcp.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const original = '{\n  // mine\n  "mcpServers": {}\n}\n';
  fs.writeFileSync(file, original);
  const r = setup(home, 'cursor');
  assert.equal(r.code, 1);
  assert.match(r.out, /has comments[\s\S]*"figma-mcp"/);
  assert.equal(read(file), original);
});

test('without a terminal and without names, setup only lists the tools', () => {
  const home = tmp();
  const r = setup(home);
  assert.equal(r.code, 0);
  assert.match(r.out, /Tools on this Mac:[\s\S]*Claude Code[\s\S]*npm run setup -- /);
  assert.ok(!fs.existsSync(path.join(home, '.figma-mcp')));
});

test('the launcher finds a moved folder by itself and remembers it', () => {
  const home = tmp();
  const dir = path.join(home, '.figma-mcp');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(repo, 'scripts', 'home-launch.mjs'), path.join(dir, 'launch.mjs'));
  fs.writeFileSync(path.join(dir, 'install.json'), JSON.stringify({ root: path.join(home, 'gone', 'figma-mcp') }));
  const moved = path.join(home, 'somewhere', 'new place', 'figma-mcp');
  fs.mkdirSync(path.join(moved, 'claude-plugin', 'dist'), { recursive: true });
  fs.mkdirSync(path.join(moved, 'figma-plugin'), { recursive: true });
  fs.writeFileSync(path.join(moved, 'package.json'), JSON.stringify({ name: 'figma-mcp' }));
  fs.writeFileSync(path.join(moved, 'figma-plugin', 'manifest.json'), '{}');
  fs.writeFileSync(path.join(moved, 'claude-plugin', 'dist', 'server.mjs'), "process.stdout.write('FAKE SERVER ' + import.meta.url);\n");

  const env = { ...process.env, HOME: home, FIGMA_MCP_SEARCH: path.join(home, 'somewhere') };
  const r = spawnSync(process.execPath, [path.join(dir, 'launch.mjs')], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /FAKE SERVER .*new%20place\/figma-mcp\/claude-plugin\/dist\/server\.mjs/);
  assert.match(r.stderr, /moved/);
  assert.equal(JSON.parse(read(path.join(dir, 'install.json'))).root, moved);

  fs.rmSync(path.join(home, 'somewhere'), { recursive: true });
  const lost = spawnSync(process.execPath, [path.join(dir, 'launch.mjs')], { env, encoding: 'utf8' });
  assert.equal(lost.status, 1);
  assert.match(lost.stderr, /can't find the figma-mcp folder[\s\S]*npm run setup/);
});

test('the server records where the folder is now and refreshes the fixed copies and installed skills', async () => {
  const user = tmp();
  const home = path.join(user, '.figma-mcp');
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(home, 'install.json'), JSON.stringify({ root: '/old/place/figma-mcp', clients: ['codex'] }));
  const stale = path.join(user, '.agents', 'skills', 'figma-mcp');
  fs.mkdirSync(stale, { recursive: true });
  fs.writeFileSync(path.join(stale, 'SKILL.md'), 'old');
  fs.writeFileSync(path.join(stale, '.figma-mcp'), 'installed by figma-mcp\nhash: 0000\n');
  const mine = path.join(user, '.agents', 'skills', 'figma-mcp-design');
  fs.mkdirSync(mine, { recursive: true });
  fs.writeFileSync(path.join(mine, 'SKILL.md'), 'not ours (no marker)');
  const child = spawn(process.execPath, [path.join(repo, 'claude-plugin', 'dist', 'server.mjs')], {
    env: { ...process.env, HOME: user, FIGMA_MCP_HOME: home, FIGMA_MCP_DATA: tmp(), FIGMA_MCP_PORT: String(17950 + Math.floor(Math.random() * 40)) },
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  await new Promise((r) => setTimeout(r, 600));
  child.stdin.end();
  await new Promise((r) => child.on('exit', r));
  const record = JSON.parse(read(path.join(home, 'install.json')));
  assert.equal(record.root, repo);
  assert.deepEqual(record.clients, ['codex']);
  assert.equal(read(path.join(home, 'launch.mjs')), read(path.join(repo, 'scripts', 'home-launch.mjs')));
  assert.equal(read(path.join(home, 'figma-plugin', 'ui.html')), read(path.join(repo, 'figma-plugin', 'ui.html')));
  assert.equal(read(path.join(stale, 'SKILL.md')), read(path.join(repo, 'agent-skills', 'figma-mcp', 'SKILL.md')), 'installed skill refreshed');
  assert.match(read(path.join(stale, '.figma-mcp')), /hash: [0-9a-f]{16}/);
  assert.equal(read(path.join(mine, 'SKILL.md')), 'not ours (no marker)', 'folders without the marker are never touched');
});
