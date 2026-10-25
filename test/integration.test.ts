// End-to-end over real processes: MCP client ⇄ server (stdio) ⇄ hub ⇄ fake Figma plugin.
// Covers: tool listing, routing, assets loading, design-context export, the write guard,
// a second session joining as agent, and hub failover when the first session exits.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
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
    env: { ...process.env, FIGMA_MCP_PORT: String(PORT), FIGMA_MCP_DATA: dataDir, FIGMA_MCP_HOME: dataDir, CLAUDE_PROJECT_DIR: project } as Record<string, string>,
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
  { nodeId: '20:1', imageId: 'IMG-001', name: 'Hero photo', page: 'App', screen: 'Home', screenId: '10:1', path: 'Home / Hero', w: 393, h: 300, prompt: PROMPT },
  { nodeId: '20:2', imageId: 'IMG-001', name: 'Hero photo', page: 'Web', screen: 'Landing', path: 'Landing', w: 1440, h: 600, prompt: PROMPT },
  { nodeId: '20:3', imageId: 'IMG-002', name: 'Avatar', page: 'App', screen: 'Profile', path: 'Profile / Header', w: 96, h: 96, prompt: 'Portrait of a smiling woman, soft studio light' },
  { nodeId: '20:4', imageId: 'IMG-003', name: 'Logo', page: 'App', screen: 'Home', screenId: '10:1', path: 'Home / Header', w: 120, h: 40, prompt: 'The brand logo, transparent PNG or SVG', supply: true },
];
const ws = path.join(project, 'design-test-file');
const BRIEF = 'Shop app for Cairo.\n\n## Identity\nCalm, warm, trustworthy — never loud.\nIcons: lucide.\n\n## Decisions\n- 2026-10-01 iphone-16';
const placedNodes = new Set<string>();
const placeCalls: string[][] = [];

const handlers = {
  brief: () => ({ brief: BRIEF }),
  design_system: () => ({
    file: 'Test File',
    pages: ['App', 'Components', 'References'],
    styles: { text: [{ name: 'Heading/H1', family: 'Inter', style: 'Bold', size: 32, lineHeight: 40 }], paint: [], effect: [], grid: [] },
    components: { components: [{ name: 'Button', kind: 'set', axes: { Variant: ['Primary', 'Secondary'] }, description: 'Primary actions.' }, { name: 'icon/lucide/star', kind: 'component' }], total: 2 },
  }),
  components: (p: { usage?: boolean }) => ({
    components: [
      { id: '40:1', name: 'Button', kind: 'set', axes: { Variant: ['Primary', 'Secondary'] }, props: { Label: 'text="Button"' }, description: 'Primary actions.', ...(p.usage ? { instances: 0, inDesigns: 0 } : {}) },
      { id: '40:9', name: 'icon/lucide/star', kind: 'component' },
      ...(p.usage ? idleComponents : []),
    ],
    total: 2,
  }),
  create_component: (p: { name: string }) => ({ componentSet: { id: '40:1', name: p.name }, variants: 2 }),
  search: () => ({ results: [{ id: '30:1', name: 'Reference – Checkout (Stripe)', type: 'FRAME', page: 'References' }, { id: '30:2', name: 'Reference note', type: 'FRAME', page: 'References', path: 'Reference – Checkout (Stripe)' }], scanned: 2, more: false }),
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

/** Extra components the fake file reports as unused (one test switches them on). */
let idleComponents: Array<Record<string, unknown>> = [];

test('lists all tools', async () => {
  const { tools } = await A.client.listTools();
  const names = tools.map((t) => t.name).sort();
  for (const n of ['status', 'workspace', 'image_library', 'build', 'edit', 'get_design_context', 'get_metadata', 'screenshot', 'variables', 'styles', 'create_component', 'prototype', 'lint', 'export', 'execute', 'export_tokens', 'icons', 'image_prompts', 'place_images', 'brief']) assert.ok(names.includes(n), `missing ${n}`);
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
  assert.match(text(r), /Opened the design workspace for "Test File"/);
  assert.ok(fs.existsSync(path.join(ws, 'workspace.json')) && fs.existsSync(path.join(ws, 'assets')), 'the first design change opens the workspace');
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

test('image prompts go to the workspace with previews; generated and supplied images come back into their layers', async () => {
  const r1 = await A.client.callTool({ name: 'image_prompts', arguments: { style: 'Warm, natural light' } });
  assert.match(text(r1), /2 image\(s\) to generate, 1 from the user \(4 layer\(s\)\)/);
  const md = path.join(ws, 'IMAGE_PROMPTS.md');
  const first = fs.readFileSync(md, 'utf8');
  assert.match(first, /# Image prompts — Test File/);
  assert.match(first, /## IMG-001 — Hero photo[\s\S]*2880×1200 px[\s\S]*Sunrise over Cairo/);
  assert.match(first, /\*\*Style for all images:\*\* Warm, natural light/);
  assert.match(first, /Where it goes:\*\* !\[IMG-001 in place\]\(previews\/home\.png\)/);
  assert.match(first, /# From you[\s\S]*IMG-003 — Logo \(from you\)[\s\S]*`assets\/IMG-003-logo\.png`/);
  assert.ok(fs.existsSync(path.join(ws, 'previews', 'home.png')), 'one preview per screen');
  assert.ok(fs.existsSync(path.join(ws, 'images')));

  // The user saves one image under its id; the other one arrives later with any name.
  fs.writeFileSync(path.join(ws, 'images', 'img-1-sunrise.png'), Buffer.from(PNG, 'base64'));
  const r2 = await A.client.callTool({ name: 'place_images', arguments: {} });
  assert.match(text(r2), /IMG-001 ← img-1-sunrise\.png \(2 layers\)/);
  assert.match(text(r2), /Still waiting: IMG-002, IMG-003 \(from the user\)/);
  assert.deepEqual(placeCalls[0], ['20:1', '20:2']);
  const second = fs.readFileSync(md, 'utf8');
  assert.match(second, /# Placed[\s\S]*## IMG-001[\s\S]*placed ✓ \(images\/img-1-sunrise\.png\)/);
  assert.match(second, /\| IMG-002 \| Avatar/);
  assert.match(second, /Warm, natural light/);

  assert.match(second, /Where it goes:\*\* !\[IMG-002 in place\]/, 'previews survive placing');

  fs.writeFileSync(path.join(ws, 'assets', 'IMG-003-logo.png'), Buffer.from(PNG, 'base64'));
  const r3 = await A.client.callTool({ name: 'place_images', arguments: { files: { 'IMG-002': path.join(project, 'hero.png') } } });
  assert.match(text(r3), /IMG-002 ← hero\.png/);
  assert.match(text(r3), /IMG-003 ← IMG-003-logo\.png/);
  assert.match(text(r3), /Nothing is waiting/);
  assert.match(fs.readFileSync(md, 'utf8'), /_No images waiting._/);
});

test('components are catalogued in the workspace; hand-drawn copies and unused components are called out', async () => {
  const r1 = await A.client.callTool({ name: 'create_component', arguments: { name: 'Button', spec: { type: 'row', children: [{ type: 'text', text: 'Button' }] }, screenshot: false } });
  assert.match(text(r1), /COMPONENTS\.md in .* lists it now/);
  assert.match(text(r1), /No design uses any component yet\. In screen work, build the section first/);
  const md = fs.readFileSync(path.join(ws, 'COMPONENTS.md'), 'utf8');
  assert.match(md, /\| `Button` \| Variant: Primary \/ Secondary \| Label \| \*\*unused\*\* \| Primary actions\. \|/);
  assert.match(md, /## Not used in any design yet[\s\S]*- `Button`/);
  assert.match(md, /\*\*Button\*\*: `\{"type":"instance","component":"Button","variant":\{"Variant":"Primary"\},"props":\{"Label":"Button"\}\}`/);
  assert.doesNotMatch(md, /\| `icon\/lucide\/star`/);

  const r2 = await A.client.callTool({ name: 'build', arguments: { spec: { type: 'frame', name: 'Sign in', children: [{ type: 'row', name: 'button', children: [{ type: 'text', text: 'Go' }] }] }, screenshot: false } });
  assert.match(text(r2), /spec\.children\[0\] \\"button\\" is drawn by hand but the component \\"Button\\" exists|spec\.children\[0\] "button" is drawn by hand but the component "Button" exists/);
  assert.match(text(r2), /No component instance in this build, but the file has 1 component/);
  const r3 = await A.client.callTool({ name: 'build', arguments: { spec: { type: 'frame', name: 'Sign up', children: [{ type: 'instance', component: 'Button' }] }, screenshot: false } });
  assert.doesNotMatch(text(r3), /drawn by hand|No component instance/);
});

test('making more components while others are still unused gets a stop-and-use-them note', async () => {
  idleComponents = [
    { id: '41:1', name: 'Cards/Stat', kind: 'component', instances: 0, inDesigns: 0 },
    { id: '41:2', name: 'Navigation/Footer', kind: 'component', instances: 0, inDesigns: 0 },
  ];
  try {
    const r = await A.client.callTool({ name: 'create_component', arguments: { name: 'Cards/Testimonial', spec: { type: 'row' }, screenshot: false } });
    assert.match(text(r), /3 other components are not used by any design yet \(Button, Cards\/Stat, Navigation\/Footer\)[\s\S]*Stop making components/);
  } finally {
    idleComponents = [];
    await A.client.callTool({ name: 'create_component', arguments: { name: 'Button', spec: { type: 'row' }, screenshot: false } });
  }
});

test('image library: images are stored once in the workspace and placed on the Library page', async () => {
  const r1 = await A.client.callTool({ name: 'image_library', arguments: { action: 'add', items: [{ src: path.join(project, 'hero.png'), title: 'Hero test', tags: ['test'], license: 'CC0' }] } });
  assert.match(text(r1), /\+ LIB-001 "Hero test" · 1×1 square · test · CC0/);
  assert.match(text(r1), /Placed 1 on the Figma page "Library"/);
  const req = plugin.requests.filter((q) => q.method === 'build').pop()!.params as { page: string; spec: { name: string } };
  assert.equal(req.page, 'Library');
  assert.equal(req.spec.name, 'LIB-001 · Hero test');
  assert.ok(fs.existsSync(path.join(ws, 'library', 'LIB-001-hero-test.png')));
  const r2 = await A.client.callTool({ name: 'image_library', arguments: { action: 'add', items: [{ src: path.join(project, 'hero.png'), title: 'Again' }] } });
  assert.match(text(r2), /= LIB-001 .*already in the library/);
  const r3 = await A.client.callTool({ name: 'image_library', arguments: { query: 'hero' } });
  assert.match(text(r3), /1 of 1 image\(s\)[\s\S]*LIB-001 "Hero test".*Figma 5:1/);
});

test('workspace sync writes the identity, tokens, references and a project skill; notes and foreign skills survive', async () => {
  const foreign = path.join(project, '.agents', 'skills', 'test-file-design');
  fs.mkdirSync(foreign, { recursive: true });
  fs.writeFileSync(path.join(foreign, 'SKILL.md'), 'mine');
  const r1 = await A.client.callTool({ name: 'workspace', arguments: { action: 'sync' } });
  assert.match(text(r1), /Synced the workspace of "Test File"/);
  const design = path.join(ws, 'DESIGN.md');
  const d1 = fs.readFileSync(design, 'utf8');
  assert.match(d1, /## Identity\n\nCalm, warm, trustworthy — never loud\.\nIcons: lucide\./);
  assert.doesNotMatch(d1, /2026-10-01/, 'only the Identity block of the brief');
  assert.match(d1, /color\/surface/);
  assert.match(d1, /\*\*Button\*\* · Variant: Primary\|Secondary · props: Label — Primary actions\./);
  assert.match(d1, /Iconify set: `lucide`/);
  assert.match(d1, /Reference – Checkout \(Stripe\) → `references\/reference-checkout-stripe\.png`/);
  assert.match(fs.readFileSync(path.join(ws, 'tokens', 'tokens.css'), 'utf8'), /--color-surface/);
  assert.ok(fs.existsSync(path.join(ws, 'tokens', 'tokens.json')) && fs.existsSync(path.join(ws, 'references', 'REFERENCES.md')));
  const skill = fs.readFileSync(path.join(project, '.claude', 'skills', 'test-file-design', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: test-file-design\ndescription: "The design identity of 'Test File' — the only design system/);
  assert.match(skill, /design-test-file\/DESIGN\.md/);
  assert.equal(fs.readFileSync(path.join(foreign, 'SKILL.md'), 'utf8'), 'mine', 'a skill figma-mcp did not write is left alone');
  assert.match(text(r1), /skipped \.agents\/skills\/test-file-design\/SKILL\.md/);

  fs.writeFileSync(design, d1.replace('_Your own notes go here; sync keeps them._', 'Keep the hero calm.'));
  await A.client.callTool({ name: 'workspace', arguments: { action: 'sync', references: false } });
  const d2 = fs.readFileSync(design, 'utf8');
  assert.match(d2, /Keep the hero calm\./);
  assert.equal(d2.match(/figma-mcp:start/g)?.length, 1);
  const st = await A.client.callTool({ name: 'status', arguments: {} });
  assert.match(text(st), /Workspace: .*design-test-file · synced/);
  const ws2 = await A.client.callTool({ name: 'workspace', arguments: {} });
  assert.match(text(ws2), /Components: 1 · not used in any design: Button/);
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
