// End-to-end run of the file-organization rules against a REAL Figma file (plugin running in it):
// pages by purpose created on first use, Components page, duplicate refusal, Trash + restore, empty
// page cleanup, References, sections that grow, device sizes, image prompts → IMAGE_PROMPTS.md → place_images.
// Usage: node scripts/e2e-org.mjs <output-dir>
// Starts by removing the pages a previous run created (only pages figma-mcp itself made).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] ?? path.join(process.cwd(), 'e2e-org-out'));
fs.mkdirSync(out, { recursive: true });

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'claude-plugin/dist/server.mjs')],
  env: { ...process.env, CLAUDE_PROJECT_DIR: out },
  stderr: 'inherit',
});
const client = new Client({ name: 'e2e-org', version: '0' });
await client.connect(transport);

let n = 0;
const failures = [];
async function step(name, tool, args, { expectError = false } = {}) {
  n++;
  const t0 = Date.now();
  let res;
  try {
    res = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 600_000 });
  } catch (e) {
    res = { isError: true, content: [{ type: 'text', text: `CLIENT ERROR: ${e.message}` }] };
  }
  const tag = `${String(n).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-')}`;
  let text = '';
  let k = 0;
  for (const c of res.content ?? []) {
    if (c.type === 'text') text += c.text + '\n';
    if (c.type === 'image') fs.writeFileSync(path.join(out, `${tag}-${++k}.png`), Buffer.from(c.data, 'base64'));
  }
  fs.writeFileSync(path.join(out, `${tag}.txt`), text);
  const ok = !!res.isError === expectError;
  if (!ok) failures.push(`${tag}: ${text.split('\n')[0]}`);
  console.log(`${ok ? '✓' : '✕'} ${tag} (${Date.now() - t0} ms)${k ? ` · ${k} image(s)` : ''}${ok ? '' : `\n    ${text.split('\n').slice(0, 6).join('\n    ')}`}`);
  return text;
}
function expect(cond, what) {
  console.log(`  ${cond ? '✓' : '✕'} ${what}`);
  if (!cond) failures.push(what);
}
const idOf = (text, key) => text.match(new RegExp(`${key}: ["']?([0-9]+:[0-9]+)`))?.[1] ?? null;
const run = async (name, code) => {
  const t = await step(name, 'execute', { code });
  const m = t.match(/result:\s*([\s\S]*?)(?:\nwarnings:|$)/);
  return m ? m[1].trim() : t;
};

// Minimal PNG writer (solid color with a diagonal band) for reference/generated images.
function png(w, h, [r, g, b]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const band = Math.abs(x / w - y / h) < 0.08;
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = band ? 255 : r;
      raw[o + 1] = band ? 255 : g;
      raw[o + 2] = band ? 255 : b;
    }
  }
  const table = Array.from({ length: 256 }, (_, i) => {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const x of buf) c = table[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const HERO = 'Warm editorial photograph of a young Egyptian woman ordering coffee at a small modern café counter, medium shot, subject on the right third, empty space on the left for a headline, morning daylight, no text, no logos';
const CARD = 'Top-down photograph of a flat white coffee on a sand-colored table, soft daylight, minimal, no text';

await step('status', 'status', {});
const before = await run('clean-previous-run', `
  const ours = ['App', 'Components', 'Trash', 'References', 'Banners', 'Web', 'Dashboard'];
  const removed = [];
  for (const p of [...figma.root.children]) {
    if (!ours.includes(p.name) || p.getPluginData('createdBy') !== 'figma-mcp') continue;
    if (figma.currentPage === p) await figma.setCurrentPageAsync(figma.root.children.find((x) => x !== p && !ours.includes(x.name)) ?? figma.root.children.find((x) => x !== p));
    removed.push(p.name);
    p.remove();
  }
  return { removed, pages: figma.root.children.map((p) => p.name) };
`);
console.log('   ', before.replace(/\s+/g, ' ').slice(0, 200));

// 1. A screen on App (page created on first use), exact device size, images with prompts.
const screen = (name, extra = {}) => ({
  type: 'frame', name, device: 'iphone-16', h: 'hug', minH: 852, fill: '#FFFFFF', pad: [56, 20, 32, 20], gap: 16, align: 'stretch',
  font: { family: 'Inter' }, color: '#111827',
  children: [
    { type: 'row', name: 'Header', align: 'center', justify: 'between', children: [
      { type: 'text', text: 'Good morning', size: 22, weight: 700 },
      { type: 'icon', icon: 'lucide:bell', size: 22 },
    ] },
    { type: 'image', name: 'Hero photo', w: 'fill', h: 220, radius: 16, prompt: HERO },
    { type: 'row', name: 'Picks', gap: 12, children: [
      { type: 'column', name: 'Pick card', w: 'fill', gap: 8, children: [{ type: 'image', name: 'Drink photo', w: 'fill', h: 120, radius: 12, prompt: CARD }, { type: 'text', text: 'Flat white', size: 14, weight: 600 }] },
      { type: 'column', name: 'Pick card', w: 'fill', gap: 8, children: [{ type: 'image', name: 'Drink photo', w: 'fill', h: 120, radius: 12, prompt: CARD }, { type: 'text', text: 'Flat white to go', size: 14, weight: 600 }] },
    ] },
    ...(extra.children ?? []),
  ],
});
let t = await step('build-app-screen', 'build', { page: 'App', spec: screen('Org Home') });
let home = idOf(t, 'id');
expect(/page: App/.test(t), 'screen built on the App page');
expect(/w: 393/.test(t), 'iphone-16 width 393');

t = await step('duplicate-refused', 'build', { page: 'App', spec: screen('Org Home') }, { expectError: true });
expect(/already exists/.test(t), 'second "Org Home" refused');

t = await step('replace-screen', 'build', { replaceId: home, spec: screen('Org Home', { children: [{ type: 'text', text: 'v2', size: 12 }] }) });
const home2 = idOf(t, 'id');
expect(home2 && home2 !== home, 'screen replaced');
t = await run('old-version-in-trash', `const n = await figma.getNodeByIdAsync(${JSON.stringify(home)}); let p = n; while (p && p.type !== 'PAGE') p = p.parent; return p ? p.name : 'gone';`);
expect(/Trash/.test(t), 'old version moved to Trash');
home = home2;

// 2. Components go to the Components page, without switching the user's page.
t = await step('component-default-page', 'create_component', {
  name: 'Org Chip', screenshot: false,
  spec: { type: 'row', pad: [4, 10], radius: 999, fill: '#FEF3C7', children: [{ type: 'text', text: 'Chip', size: 12, bind: { text: 'Label' } }] },
  props: { Label: { type: 'text', default: 'Chip' } },
});
expect(/page: Components/.test(t), 'component created on Components');
t = await step('component-duplicate-refused', 'create_component', { name: 'Org Chip', screenshot: false, spec: { type: 'row', children: [{ type: 'text', text: 'x' }] } }, { expectError: true });
expect(/already exists/.test(t), 'second "Org Chip" refused');

// 3. to-component: main → Components, instance stays in the screen.
t = await step('promo-card', 'edit', { ops: [{ op: 'insert', parent: home, spec: { type: 'row', name: 'Promo card', pad: 16, radius: 12, fill: '#ECFDF5', w: 'fill', children: [{ type: 'text', text: '20% off today', size: 14, weight: 600 }] }, ref: 'promo' }, { op: 'to-component', id: 'promo', name: 'Org Promo card' }] });
const promoInstance = t.match(/instance: ["']?([0-9]+:[0-9]+)/)?.[1];
expect(/page: Components/.test(t) && !!promoInstance, 'to-component moved main to Components and left an instance');
t = await run('instance-fills-width', `const i = await figma.getNodeByIdAsync(${JSON.stringify(promoInstance)}); return i ? i.type + ' ' + i.layoutSizingHorizontal + ' ' + i.parent.name : 'missing';`);
expect(/INSTANCE FILL Org Home/.test(t), 'instance keeps FILL inside the screen');

// 4. Delete → Trash → restore.
t = await step('delete-to-trash', 'edit', { ops: [{ op: 'delete', ids: [promoInstance] }] });
expect(/trashed/.test(t) && /Trash/.test(t), 'deleted layer moved to Trash');
t = await step('restore', 'edit', { ops: [{ op: 'restore', ids: [promoInstance] }] });
expect(/Org Home/.test(t), 'restored into its screen');

// 5. A page that empties disappears (only pages the tool made).
t = await step('banner', 'build', { page: 'Banners', spec: { type: 'frame', name: 'Story banner', device: 'instagram-story', fill: '#0F766E', children: [{ type: 'image', name: 'Banner art', w: 'fill', h: 900, prompt: CARD }] } });
const banner = idOf(t, 'id');
expect(/w: 1080/.test(t) && /h: 1920/.test(t), 'instagram-story is 1080×1920');
t = await step('delete-banner', 'edit', { ops: [{ op: 'delete', ids: [banner] }] });
expect(/removedEmptyPages/.test(t) && /Banners/.test(t), 'empty Banners page removed');

// 6. References page.
const refPng = path.join(out, 'reference.png');
fs.writeFileSync(refPng, png(360, 240, [99, 102, 241]));
t = await step('reference', 'build', { page: 'References', spec: { type: 'frame', name: 'Reference – Café app home (local file)', gap: 8, children: [{ type: 'image', src: refPng }, { type: 'text', text: 'Take: big hero, two-card row, calm spacing', size: 12 }] } });
expect(/page: References/.test(t), 'reference on the References page');

// 7. A flow section grows with its screens.
t = await step('section', 'build', { page: 'App', spec: { type: 'section', name: 'Onboarding' } });
const section = idOf(t, 'id');
await step('welcome', 'build', { parentId: section, spec: { type: 'frame', name: 'Welcome', device: 'iphone-16', fill: '#F8FAFC', children: [{ type: 'text', text: 'Welcome', size: 28, weight: 700 }] } });
await step('signup', 'build', { parentId: section, spec: { type: 'frame', name: 'Sign up', device: 'iphone-16', fill: '#F8FAFC', children: [{ type: 'text', text: 'Create account', size: 28, weight: 700 }] } });
t = await run('section-fits', `const s = await figma.getNodeByIdAsync(${JSON.stringify(section)}); const r = Math.max(...s.children.map((c) => c.x + c.width)); const b = Math.max(...s.children.map((c) => c.y + c.height)); return [s.children.length, Math.round(s.width) >= r, Math.round(s.height) >= b].join(' ');`);
expect(/2 true true/.test(t), 'section contains both screens');

// 8. Images: code points at the future files, lint reminds, prompts file, generated images come back.
t = await step('design-context-pending', 'get_design_context', { nodeId: home, framework: 'html-css' });
expect(/NOT GENERATED YET \(IMG-\d+\)/.test(t), 'design context marks images not generated yet');
expect((t.match(/NOT GENERATED YET/g) ?? []).length === 2, 'one asset per image (shared prompt → one file)');
t = await step('lint-reminders', 'lint', { nodeId: home });
expect(/waits for its image IMG-\d+/.test(t), 'lint lists waiting images');
// Scoped to this screen: the test file may hold placeholders from other test pages.
t = await step('image-prompts', 'image_prompts', { within: home, style: 'Warm natural light, sand and deep teal palette' });
const md = path.join(out, 'IMAGE_PROMPTS.md');
const mdText = fs.existsSync(md) ? fs.readFileSync(md, 'utf8') : '';
const ids = [...new Set([...mdText.matchAll(/^## (IMG-\d+)/gm)].map((m) => m[1]))];
expect(ids.length === 2, `two images to generate (got ${ids.join(', ')})`);
expect(/used 2×/.test(t), 'same prompt shares one id (used 2×)');
fs.mkdirSync(path.join(out, 'images'), { recursive: true });
ids.forEach((id, i) => fs.writeFileSync(path.join(out, 'images', `${id}-generated.png`), png(400, 300, i ? [217, 119, 6] : [15, 118, 110])));
t = await step('place-images', 'place_images', {});
expect(/Placed 2 image\(s\)/.test(t), 'both images placed');
expect(!ids.some((id) => new RegExp(`Still waiting:[^\n]*${id}\\b`).test(t)), 'our images are no longer waiting');
expect(/# Placed/.test(fs.readFileSync(md, 'utf8')), 'prompts file keeps placed history');
await step('final-screenshot', 'screenshot', { nodeId: home });
t = await step('design-context-placed', 'get_design_context', { nodeId: home, framework: 'html-css' });
expect(!/NOT GENERATED YET/.test(t) && /img-001-hero-photo/i.test(t) && /img-002-drink-photo/i.test(t), 'placed images keep their file names in code');

// 9. Page order: content first, system pages last.
t = await run('page-order', `return figma.root.children.map((p) => p.name).join(' | ');`);
console.log('   ', t.replace(/\s+/g, ' '));
const order = t.replace(/\s+/g, ' ');
const at = (name) => order.indexOf(name);
expect(at('App') >= 0 && at('App') < at('Components') && at('Components') < at('References') && at('References') < at('Trash'), 'pages ordered App … Components, References, Trash');
expect(at('Banners') < 0, 'no empty Banners page left');
await step('show-app', 'edit', { ops: [{ op: 'page', name: 'App' }, { op: 'select', ids: [home] }], focus: true });

await client.close();
console.log(failures.length ? `\n${failures.length} problem(s):\n- ${failures.join('\n- ')}` : '\nAll organization checks passed.');
process.exit(failures.length ? 1 : 0);
