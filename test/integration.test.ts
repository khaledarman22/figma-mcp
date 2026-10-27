// End-to-end over real processes: MCP client ⇄ server (stdio) ⇄ hub ⇄ fake Figma plugin.
// Covers: tool listing, routing, assets loading, design-context export, the write guard,
// a second session joining as agent, and hub failover when the first session exits.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { fakePlugin, type FakePlugin } from './fake-plugin.ts';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = path.join(repo, 'claude-plugin/dist/server.mjs');
const PORT = 17000 + Math.floor(Math.random() * 900);
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-project-'));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-data-'));
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
fs.writeFileSync(path.join(project, 'hero.png'), Buffer.from(PNG, 'base64'));

async function connect(name: string) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [server],
    env: { ...process.env, FIGMA_MCP_PORT: String(PORT), FIGMA_MCP_DATA: dataDir, FIGMA_MCP_HOME: dataDir, CLAUDE_PROJECT_DIR: project, UNSPLASH_ACCESS_KEY: '', PEXELS_API_KEY: '' } as Record<string, string>,
    stderr: 'pipe',
  });
  const client = new Client({ name, version: '0.0.0' });
  await client.connect(transport);
  return { client, transport };
}

const text = (r: unknown) => ((r as { content: Array<{ type: string; text?: string }> }).content.find((c) => c.type === 'text')?.text ?? '');

const extractFixture = {
  root: {
    id: '1:1', name: 'Card', type: 'frame', x: 0, y: 0, w: 320, h: 200,
    layout: { dir: 'column', gap: 12, pad: [16, 16, 16, 16], justify: 'start', align: 'start' },
    sizing: { w: 'fixed', h: 'hug' },
    fills: [{ t: 'solid', c: '#FFFFFF', v: 'color/surface' }],
    children: [
      { id: '1:2', name: 'icon', type: 'instance', x: 16, y: 16, w: 24, h: 24, sizing: { w: 'fixed', h: 'fixed' }, asset: { kind: 'svg', id: 'icon-lucide-star' }, comp: { kind: 'instance', name: 'icon/lucide/star' } },
      { id: '1:3', name: 'Title', type: 'text', x: 16, y: 52, w: 288, h: 24, sizing: { w: 'fill', h: 'hug' }, fills: [{ t: 'solid', c: '#111111' }], text: { chars: 'Hello', font: { family: 'Inter', style: 'Bold', weight: 700, size: 18, lh: 24, ls: 0 }, align: 'left', valign: 'top', autoResize: 'height' }, reactions: [{ trigger: 'on_click', action: 'navigate', to: '9:9', toName: 'Details', transition: 'smart-animate 300ms ease-out' }] },
    ],
  },
  context: { page: 'Page 1', topLevel: false, parentLayout: false, file: 'Test File' },
  vars: { 'color/surface': { name: 'color/surface', collection: 'Theme', type: 'COLOR', css: '--color-surface', value: '#FFFFFF', modes: { Light: '#FFFFFF', Dark: '#111111' } } },
  styles: {},
  components: { 'icon/lucide/star': { name: 'icon/lucide/star', key: 'k1' } },
  assets: [{ id: 'icon-lucide-star', nodeId: '1:2', name: 'icon-lucide-star', kind: 'svg', w: 24, h: 24 }],
  fonts: ['Inter Bold'],
  stats: { nodes: 3, truncated: false },
};

const PROMPT = 'Sunrise over Cairo rooftops, warm light, 35mm photo';
const waiting = [
  { nodeId: '20:1', imageId: 'IMG-001', name: 'Hero photo', page: 'App', screen: 'Home', path: 'Home / Hero', w: 393, h: 300, prompt: PROMPT },
  { nodeId: '20:2', imageId: 'IMG-001', name: 'Hero photo', page: 'Web', screen: 'Landing', path: 'Landing', w: 1440, h: 600, prompt: PROMPT },
  { nodeId: '20:3', imageId: 'IMG-002', name: 'Avatar', page: 'App', screen: 'Profile', path: 'Profile / Header', w: 96, h: 96, prompt: 'Portrait of a smiling woman, soft studio light' },
];
const placedNodes = new Set<string>();
const placeCalls: string[][] = [];

const handlers = {
  status: () => ({ file: { name: 'Test File' }, pages: [{ id: '0:1', name: 'Page 1' }], selection: [], brief: null, user: 'Tester' }),
  metadata: (p: { nodeId?: string }) => ({ xml: `<frame id="${p.nodeId ?? '0:1'}" name="Card"/>`, nodes: 1, truncated: false, page: { id: '0:1', name: 'Page 1' } }),
  build: (p: { spec: { name?: string }; assets?: { images?: Record<string, { data?: string }> } }) => ({
    root: { id: '5:1', name: p.spec.name ?? 'x', type: 'FRAME', x: 0, y: 0, w: 10, h: 10 },
    ids: {},
    created: 1,
    interactions: 0,
    warnings: [],
    echoImages: Object.keys(p.assets?.images ?? {}),
  }),
  screenshot: () => ({ images: [{ nodeId: '5:1', name: 'x', type: 'FRAME', w: 1, h: 1, scale: 1, format: 'PNG', data: PNG }] }),
  extract: () => extractFixture,
  export: (p: { items: unknown[] }) => ({ files: p.items.map(() => ({ nodeId: '1:2', name: 'icon', ext: 'svg', data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64') })) }),
  placeholders: () => ({ placeholders: waiting.filter((w) => !placedNodes.has(w.nodeId)) }),
  place_image: (p: { ids: string[]; imageData: string }) => {
    for (const id of p.ids) placedNodes.add(id);
    placeCalls.push(p.ids);
    return { placed: p.ids.map((id) => ({ id, name: 'Image' })) };
  },
  execute: () => ({ result: null, logs: [], warnings: [] }),
  variables_read: () => ({
    collections: [{ id: 'c', name: 'Theme', modes: [{ id: 'l', name: 'Light' }, { id: 'd', name: 'Dark' }], defaultModeId: 'l' }],
    variables: [{ id: 'v', name: 'color/surface', collectionId: 'c', type: 'COLOR', scopes: ['FRAME_FILL'], codeSyntax: {}, values: { l: { r: 1, g: 1, b: 1, a: 1 }, d: { r: 0, g: 0, b: 0, a: 1 } } }],
  }),
};

let A: Awaited<ReturnType<typeof connect>>;
let B: Awaited<ReturnType<typeof connect>> | null = null;
let plugin: FakePlugin;

before(async () => {
  A = await connect('session-a');
  plugin = fakePlugin('Test File', handlers, [PORT]);
  await plugin.ready;
});

after(async () => {
  plugin?.close();
  await A?.client.close().catch(() => {});
  await B?.client.close().catch(() => {});
});

test('lists all tools', async () => {
  const { tools } = await A.client.listTools();
  const names = tools.map((t) => t.name).sort();
  for (const n of ['status', 'build', 'edit', 'get_design_context', 'get_metadata', 'screenshot', 'variables', 'styles', 'create_component', 'prototype', 'lint', 'export', 'execute', 'export_tokens', 'icons', 'image_prompts', 'place_images', 'references', 'stock_photos', 'brief']) assert.ok(names.includes(n), `missing ${n}`);
  for (const t of tools) assert.ok((t.description ?? '').length < 4000, `${t.name} description too long`);
});

test('status shows the connected file', async () => {
  const r = await A.client.callTool({ name: 'status', arguments: {} });
  assert.match(text(r), /"Test File"/);
  assert.match(text(r), /hub on localhost/);
});

test('node ids from URLs are normalized', async () => {
  const r = await A.client.callTool({ name: 'get_metadata', arguments: { nodeId: 'https://www.figma.com/design/abc/x?node-id=12-34' } });
  assert.match(text(r), /id="12:34"/);
});

test('build loads local images and returns a screenshot', async () => {
  const img = path.join(project, 'hero.png');
  const r = (await A.client.callTool({ name: 'build', arguments: { spec: { type: 'frame', name: 'Hero', children: [{ type: 'image', src: img, w: 100, h: 50 }] } } })) as { content: Array<{ type: string }> };
  assert.match(text(r), /Hero/);
  assert.ok(r.content.some((c) => c.type === 'image'), 'screenshot attached');
  const req = plugin.requests.find((q) => q.method === 'build')!;
  assert.ok((req.params as { assets: { images: Record<string, { data: string }> } }).assets.images[img].data);
});

test('build reports unloadable assets before touching Figma', async () => {
  const before = plugin.requests.filter((q) => q.method === 'build').length;
  const r = (await A.client.callTool({ name: 'build', arguments: { spec: { type: 'image', src: path.join(project, 'missing.png') } } })) as { isError?: boolean };
  assert.equal(r.isError, true);
  assert.match(text(r), /not found/);
  assert.equal(plugin.requests.filter((q) => q.method === 'build').length, before);
});

test('get_design_context writes assets into the project and returns code', async () => {
  const dir = path.join(project, 'public', 'figma');
  const r = (await A.client.callTool({ name: 'get_design_context', arguments: { nodeId: '1:1', assetsDir: dir } })) as { content: Array<{ type: string }> };
  const t = text(r);
  assert.match(t, /export default function Card\(\)/);
  assert.match(t, /const iconLucideStar = "\/figma\/icon-lucide-star\.svg";/);
  assert.match(t, /--color-surface = #FFFFFF · Light #FFFFFF \/ Dark #111111/);
  assert.match(t, /click → navigate "Details"/);
  assert.ok(fs.existsSync(path.join(dir, 'icon-lucide-star.svg')));
});

test('exports into the tool folder are refused', async () => {
  const r = (await A.client.callTool({ name: 'export', arguments: { items: [{ nodeId: '1:2', format: 'SVG' }], dir: path.join(repo, 'figma-plugin') } })) as { isError?: boolean };
  assert.equal(r.isError, true);
  assert.match(text(r), /Refusing to write into the figma-mcp tool folder/);
});

test('export_tokens writes css into the project', async () => {
  const out = path.join(project, 'src', 'tokens.css');
  const r = await A.client.callTool({ name: 'export_tokens', arguments: { format: 'css', outFile: 'src/tokens.css' } });
  assert.match(text(r), /--color-surface: #ffffff;/);
  assert.match(fs.readFileSync(out, 'utf8'), /\[data-theme="dark"\]/);
});

test('image prompts go to a Markdown file in the project; generated images come back into their layers', async () => {
  const r1 = await A.client.callTool({ name: 'image_prompts', arguments: { style: 'Warm, natural light' } });
  assert.match(text(r1), /2 image\(s\) to generate \(3 layer\(s\)\)/);
  const md = path.join(project, 'IMAGE_PROMPTS.md');
  const first = fs.readFileSync(md, 'utf8');
  assert.match(first, /# Image prompts — Test File/);
  assert.match(first, /## IMG-001 — Hero photo[\s\S]*2880×1200 px[\s\S]*Sunrise over Cairo/);
  assert.match(first, /\*\*Style for all images:\*\* Warm, natural light/);
  assert.ok(fs.existsSync(path.join(project, 'images')));

  // The user saves one image under its id; the other one arrives later with any name.
  fs.writeFileSync(path.join(project, 'images', 'img-1-sunrise.png'), Buffer.from(PNG, 'base64'));
  const r2 = await A.client.callTool({ name: 'place_images', arguments: {} });
  assert.match(text(r2), /IMG-001 ← img-1-sunrise\.png \(2 layers\)/);
  assert.match(text(r2), /Still waiting: IMG-002/);
  assert.deepEqual(placeCalls[0], ['20:1', '20:2']);
  const second = fs.readFileSync(md, 'utf8');
  assert.match(second, /# Placed[\s\S]*## IMG-001[\s\S]*placed ✓ \(images\/img-1-sunrise\.png\)/);
  assert.match(second, /\| IMG-002 \| Avatar/);
  assert.match(second, /Warm, natural light/);

  const r3 = await A.client.callTool({ name: 'place_images', arguments: { files: { 'IMG-002': path.join(project, 'hero.png') } } });
  assert.match(text(r3), /IMG-002 ← hero\.png/);
  assert.match(text(r3), /Nothing is waiting/);
  assert.match(fs.readFileSync(md, 'utf8'), /_No images waiting._/);
});

test('references: pages and screenshots become a lettered board; robots.txt and blocks are reported', async () => {
  const site = http.createServer((req, res) => {
    if (req.url === '/robots.txt') return res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nDisallow: /private');
    if (req.url === '/shot.png') return res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.from(PNG, 'base64'));
    if (req.url === '/page' || req.url === '/private') return res.writeHead(200, { 'content-type': 'text/html' }).end('<html><head><title>Clinic landing</title><meta property="og:image" content="/shot.png"></head><body></body></html>');
    if (req.url === '/wall') return res.writeHead(403, { 'content-type': 'text/html' }).end('denied');
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
  try {
    const before = plugin.requests.length;
    const r = (await A.client.callTool({ name: 'references', arguments: { for: 'Home – Hero', sources: [`${base}/page`, { src: path.join(project, 'hero.png'), note: 'from the user' }, `${base}/private`, `${base}/wall`] } })) as { content: Array<{ type: string }> };
    const t = text(r);
    assert.match(t, /letter: A[\s\S]*letter: B/);
    assert.match(t, /private: robots\.txt/);
    assert.match(t, /wall: 127\.0\.0\.1: HTTP 403/);
    assert.ok(r.content.some((c) => c.type === 'image'), 'board screenshot attached');
    const builds = plugin.requests.slice(before).filter((q) => q.method === 'build').map((q) => q.params as { spec: { type: string; name: string }; page?: string; parentId?: string });
    assert.deepEqual([builds[0].spec.type, builds[0].spec.name, builds[0].page], ['section', 'References – Home – Hero', 'References']);
    assert.match(builds[1].spec.name, /^A – Clinic landing \(127\.0\.0\.1\)$/);
    assert.match(builds[2].spec.name, /^B – hero$/);
    assert.equal(builds[1].parentId, '5:1');
    assert.ok(fs.readdirSync(path.join(project, 'references')).some((f) => f.startsWith('home-hero-1')));
  } finally {
    site.close();
  }
});

test('gallery images are refused as product images', async () => {
  const before = plugin.requests.filter((q) => q.method === 'build').length;
  const r = (await A.client.callTool({ name: 'build', arguments: { page: 'App', spec: { type: 'image', src: 'https://cdn.dribbble.com/userupload/1/shot.png', w: 100, h: 100 } } })) as { isError?: boolean };
  assert.equal(r.isError, true);
  assert.match(text(r), /design gallery/);
  assert.equal(plugin.requests.filter((q) => q.method === 'build').length, before);
});

test('stock_photos without a key explains the web-search route', async () => {
  const r = await A.client.callTool({ name: 'stock_photos', arguments: { query: 'cairo cafe' } });
  assert.match(text(r), /No stock-photo API key/);
});

test('plugin errors come back as tool errors', async () => {
  const r = (await A.client.callTool({ name: 'lint', arguments: {} })) as { isError?: boolean };
  assert.equal(r.isError, true);
  assert.match(text(r), /Unknown method "lint"/);
});

test('a second session joins as agent and survives the first one exiting', async () => {
  B = await connect('session-b');
  const r1 = await B.client.callTool({ name: 'status', arguments: {} });
  assert.match(text(r1), /connected to hub/);
  assert.match(text(r1), /"Test File"/);
  const r2 = await B.client.callTool({ name: 'get_metadata', arguments: { nodeId: '7:7' } });
  assert.match(text(r2), /id="7:7"/);

  // Session A ends → B takes over the port, the plugin reconnects.
  await A.client.close();
  let ok = false;
  for (let i = 0; i < 40 && !ok; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const r = await B.client.callTool({ name: 'get_metadata', arguments: { nodeId: '8:8' } });
    ok = /id="8:8"/.test(text(r));
  }
  assert.ok(ok, 'B serves requests after A exits');
  const r3 = await B.client.callTool({ name: 'status', arguments: {} });
  assert.match(text(r3), /hosted by this session/);
});

test('clients without CLAUDE_PROJECT_DIR: relative outputs land in the client\'s root (roots/list)', async () => {
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-codex-project-'));
  const { CLAUDE_PROJECT_DIR: _drop, ...env } = process.env;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [server],
    env: { ...env, FIGMA_MCP_PORT: String(PORT), FIGMA_MCP_DATA: dataDir, FIGMA_MCP_HOME: dataDir } as Record<string, string>,
    cwd: os.tmpdir(),
    stderr: 'pipe',
  });
  const client = new Client({ name: 'codex-like', version: '0.0.0' }, { capabilities: { roots: { listChanged: true } } });
  client.setRequestHandler(ListRootsRequestSchema, async () => ({ roots: [{ uri: `file://${other}`, name: 'project' }] }));
  await client.connect(transport);
  try {
    let r: unknown;
    for (let i = 0; i < 20; i++) {
      r = await client.callTool({ name: 'export_tokens', arguments: { format: 'json', outFile: 'tokens/figma.json' } });
      if (!(r as { isError?: boolean }).isError) break;
      await new Promise((res) => setTimeout(res, 250));
    }
    assert.ok(!(r as { isError?: boolean }).isError, text(r));
    assert.ok(fs.existsSync(path.join(other, 'tokens', 'figma.json')), 'written into the root the client announced');
  } finally {
    await client.close();
  }
});
