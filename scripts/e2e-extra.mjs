// Second real-Figma scenario: less common build features and every edit op.
//   node scripts/e2e-extra.mjs <output-dir>

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] ?? 'e2e-extra-out');
fs.mkdirSync(out, { recursive: true });

// A real 64×40 PNG gradient, written into the "project" folder.
function png(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
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
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3;
      raw[i] = Math.round((x / w) * 255);
      raw[i + 1] = 120;
      raw[i + 2] = Math.round((y / h) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const imgPath = path.join(out, 'photo.png');
fs.writeFileSync(imgPath, png(64, 40));

const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'claude-plugin/dist/server.mjs')], env: { ...process.env, CLAUDE_PROJECT_DIR: out }, stderr: 'inherit' });
const client = new Client({ name: 'e2e-extra', version: '0' });
await client.connect(transport);
let n = 0;
const fails = [];
async function step(name, tool, args) {
  n++;
  const res = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 600_000 }).catch((e) => ({ isError: true, content: [{ type: 'text', text: e.message }] }));
  let text = '';
  let k = 0;
  for (const c of res.content ?? []) {
    if (c.type === 'text') text += c.text + '\n';
    if (c.type === 'image') fs.writeFileSync(path.join(out, `${String(n).padStart(2, '0')}-${name}-${++k}.png`), Buffer.from(c.data, 'base64'));
  }
  fs.writeFileSync(path.join(out, `${String(n).padStart(2, '0')}-${name}.txt`), text);
  console.log(`${res.isError ? '✕' : '✓'} ${String(n).padStart(2, '0')}-${name}${res.isError ? `\n    ${text.split('\n').slice(0, 5).join('\n    ')}` : ''}`);
  if (res.isError) fails.push(name);
  return text;
}
const id = (text, key) => (text.match(new RegExp(`${key}: "?([0-9I;:]+:[0-9]+)`)) || [])[1];

// A fresh test page each run (this script's own page only); its components stay on it.
await step('fresh-page', 'execute', { code: `const old = figma.root.children.find((p) => p.name === 'figma-mcp extra'); if (!old) return 'none'; if (figma.currentPage === old) await figma.setCurrentPageAsync(figma.root.children.find((p) => p !== old)); old.remove(); return 'removed';` });
await step('page', 'edit', { ops: [{ op: 'page', name: 'figma-mcp extra', create: true }] });

const t1 = await step('showcase', 'build', {
  spec: {
    type: 'section', name: 'Showcase', children: [
      {
        type: 'frame', name: 'Card gallery', ref: 'gallery', x: 40, y: 60, w: 720, pad: 24, gap: 16, fill: 'linear-gradient(135deg, #EEF2FF 0%, #FDF2F8 100%)', radius: 20,
        children: [
          { type: 'text', text: 'Gradient, image, borders, grid spans', font: '700 22/28 Inter' },
          { type: 'grid', name: 'Grid', cols: 3, gap: 12, w: 'fill', children: [
            { type: 'image', name: 'Photo', ref: 'photo', src: imgPath, w: 'fill', h: 120, radius: 12, span: [1, 2] },
            { type: 'frame', name: 'Bordered', w: 'fill', h: 120, fill: '#FFFFFF', stroke: { color: '#6366F1', weight: [0, 0, 3, 0] }, pad: 12,
              children: [{ type: 'text', text: 'Bottom border only', size: 13 }] },
            { type: 'frame', name: 'Shadowed', w: 'fill', h: 80, fill: '#FFFFFF', radius: 12, shadow: '0 8 24 -6 rgba(15,23,42,0.25)', align: 'center', justify: 'center',
              children: [{ type: 'icon', icon: 'lucide:sparkles', size: 28, color: '#6366F1', strokeWidth: 1.5 }] },
            { type: 'ellipse', name: 'Dot', w: 40, h: 40, color: '#F43F5E' },
            { type: 'star', name: 'Star', w: 40, h: 40, fill: '#F59E0B' },
          ] },
          { type: 'row', name: 'Tags', gap: 8, wrap: true, rowGap: 8, w: 'fill', children: ['Design', 'Systems', 'Auto layout', 'Variables', 'Prototype', 'Code', 'Accessibility', 'RTL'].map((t) => ({
            type: 'row', name: 'Tag', pad: [6, 12], radius: 'full', fill: '#FFFFFF', stroke: '1px solid #E0E7FF', children: [{ type: 'text', text: t, size: 13, weight: 500 }],
          })) },
          { type: 'svg', name: 'Logo', svg: '<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="18" fill="#111827"/><path d="M12 21l5 5 11-12" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>' },
        ],
      },
    ],
  },
});
const gallery = id(t1, 'gallery');
const photo = id(t1, 'photo');

await step('component-with-swap', 'create_component', {
  page: 'figma-mcp extra',
  name: 'List item',
  spec: { type: 'row', ref: 'root', w: 320, pad: [12, 16], gap: 12, align: 'center', fill: '#FFFFFF', radius: 12, children: [
    { type: 'icon', ref: 'lead', icon: 'lucide:star', size: 20, color: '#334155', bind: { swap: 'Icon' } },
    { type: 'text', text: 'Title', w: 'fill', size: 15, bind: { text: 'Title' } },
    { type: 'icon', icon: 'lucide:chevron-right', size: 16, color: '#94A3B8', bind: { visible: 'Chevron' } },
  ] },
  props: { Icon: { type: 'instance', default: 'icon/lucide/star' }, Title: { type: 'text', default: 'Title' }, Chevron: { type: 'boolean', default: true } },
});
await step('icon-for-swap', 'build', { spec: { type: 'icon', icon: 'lucide:heart', name: 'tmp heart' }, screenshot: false });
const t3 = await step('instances', 'build', {
  spec: { type: 'column', name: 'List', gap: 8, pad: 16, fill: '#F1F5F9', radius: 16, children: [
    { type: 'instance', ref: 'li', component: 'List item', props: { Title: 'Favourites', Icon: 'icon/lucide/heart', Chevron: false } },
    { type: 'instance', component: 'List item', props: { Title: 'Starred' }, overrides: { Title: { color: '#4F46E5' } } },
  ] },
  x: 40, y: 700,
});
const li = id(t3, 'li');

await step('replace', 'build', { spec: { type: 'text', text: 'Replaced title ✓', font: '700 22/28 Inter', color: '#16A34A' }, replaceId: gallery ? undefined : undefined, parentId: gallery, index: 0, screenshot: false });

const t5 = await step('edit-ops', 'edit', {
  ops: [
    { op: 'insert', parent: gallery, spec: { type: 'rect', name: 'A', w: 60, h: 60, fill: '#22C55E' }, ref: 'a' },
    { op: 'insert', parent: gallery, spec: { type: 'rect', name: 'B', w: 60, h: 60, fill: '#3B82F6' }, ref: 'b' },
    { op: 'wrap', ids: ['a', 'b'], spec: { dir: 'row', gap: 8, name: 'Wrapped' }, ref: 'wrapped' },
    { op: 'duplicate', id: 'wrapped', ref: 'dup' },
    { op: 'unwrap', id: 'dup' },
    { op: 'set', id: 'wrapped', props: { pad: 8, fill: '#E2E8F0', radius: 8 } },
    { op: 'swap', id: li, component: 'List item' },
    { op: 'select', ids: ['wrapped'] },
  ],
});
await step('to-component', 'edit', { ops: [{ op: 'insert', parent: gallery, spec: { type: 'row', name: 'Chip', pad: [4, 10], radius: 'full', fill: '#FEF3C7', children: [{ type: 'text', text: 'Chip', size: 12 }] }, ref: 'chip' }, { op: 'to-component', id: 'chip', name: 'Chip', keepInPlace: true }] });
await step('booleans', 'edit', { ops: [
  { op: 'insert', parent: gallery, spec: { type: 'frame', dir: 'none', name: 'Shapes', w: 120, h: 80, children: [ { type: 'ellipse', ref: 'e1', w: 60, h: 60, x: 0, y: 0, fill: '#0EA5E9' }, { type: 'ellipse', ref: 'e2', w: 60, h: 60, x: 30, y: 0, fill: '#0EA5E9' } ] } },
  { op: 'boolean', ids: ['e1', 'e2'], operation: 'union', name: 'Union' },
] });
await step('detach', 'edit', { ops: [{ op: 'detach', ids: [li] }] });
await step('proto-set-mode', 'prototype', { links: [{ from: gallery, trigger: 'after 1500ms', action: 'set-mode', collection: 'Theme', mode: 'Light' }] });
await step('get-node-photo', 'get_node', { ids: [photo, gallery].filter(Boolean) });
await step('context-gallery', 'get_design_context', { nodeId: gallery, assetsDir: path.join(out, 'proj', 'public', 'img') });
await step('lint-gallery', 'lint', { nodeId: gallery });
await step('shot', 'screenshot', { nodeId: gallery });
console.log(fails.length ? `✕ ${fails.length} failed: ${fails.join(', ')}` : '✓ all passed');
await client.close();
process.exit(0);
