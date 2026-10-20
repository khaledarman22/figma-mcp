// End-to-end run against a REAL Figma file (the "Figma MCP" plugin must be running in it).
// Creates a page "figma-mcp E2E" and exercises every tool. Usage:
//   node scripts/e2e.mjs <output-dir> [step-filter]
// Writes each tool result to <output-dir>/NN-step.txt and screenshots as PNGs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] ?? path.join(process.cwd(), 'e2e-out'));
const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
fs.mkdirSync(out, { recursive: true });

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'claude-plugin/dist/server.mjs')],
  env: { ...process.env, CLAUDE_PROJECT_DIR: out },
  stderr: 'inherit',
});
const client = new Client({ name: 'e2e', version: '0' });
await client.connect(transport);

let n = 0;
const ids = {};
const failures = [];
async function step(name, tool, args) {
  n++;
  if (only && !only.test(name)) return null;
  const t0 = Date.now();
  let res;
  try {
    res = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 600_000 });
  } catch (e) {
    res = { isError: true, content: [{ type: 'text', text: `CLIENT ERROR: ${e.message}` }] };
  }
  const ms = Date.now() - t0;
  const tag = `${String(n).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-')}`;
  let text = '';
  let k = 0;
  for (const c of res.content ?? []) {
    if (c.type === 'text') text += c.text + '\n';
    if (c.type === 'image') fs.writeFileSync(path.join(out, `${tag}-${++k}.png`), Buffer.from(c.data, 'base64'));
  }
  fs.writeFileSync(path.join(out, `${tag}.txt`), text);
  const status = res.isError ? '✕' : '✓';
  if (res.isError) failures.push(`${tag}: ${text.split('\n')[0]}`);
  console.log(`${status} ${tag} (${ms} ms)${k ? ` · ${k} image(s)` : ''}${res.isError ? `\n    ${text.split('\n').slice(0, 6).join('\n    ')}` : ''}`);
  return { text, res };
}
const grab = (text, key) => {
  const m = text.match(new RegExp(`${key}: ["']?([0-9]+:[0-9]+)`));
  return m ? m[1] : null;
};

await step('status', 'status', {});
// A fresh test page each run (this script's own page only); its components stay on it.
await step('fresh-page', 'execute', { code: `const old = figma.root.children.find((p) => p.name === 'figma-mcp E2E'); if (!old) return 'none'; if (figma.currentPage === old) await figma.setCurrentPageAsync(figma.root.children.find((p) => p !== old)); old.remove(); return 'removed';` });
await step('page', 'edit', { ops: [{ op: 'page', name: 'figma-mcp E2E', create: true }] });

await step('variables', 'variables', {
  collections: [
    {
      name: 'Primitives', hidden: true,
      variables: [
        { name: 'neutral/0', value: '#FFFFFF' }, { name: 'neutral/50', value: '#F7F7F8' }, { name: 'neutral/100', value: '#EEEEF0' },
        { name: 'neutral/200', value: '#E2E2E6' }, { name: 'neutral/500', value: '#6E6E78' }, { name: 'neutral/700', value: '#3A3A42' },
        { name: 'neutral/900', value: '#16161A' }, { name: 'neutral/950', value: '#0B0B0D' },
        { name: 'blue/400', value: '#5B8DEF' }, { name: 'blue/600', value: '#1F5FE0' }, { name: 'blue/700', value: '#174BB3' },
        { name: 'red/600', value: '#D62F2F' },
      ],
    },
    {
      name: 'Dimensions',
      variables: [
        { name: 'space/1', value: 4 }, { name: 'space/2', value: 8 }, { name: 'space/3', value: 12 }, { name: 'space/4', value: 16 },
        { name: 'space/6', value: 24 }, { name: 'space/8', value: 32 }, { name: 'radius/sm', value: 6 }, { name: 'radius/md', value: 10 }, { name: 'radius/lg', value: 16 },
      ],
    },
    {
      name: 'Theme', modes: ['Light', 'Dark'],
      variables: [
        { name: 'color/bg/default', values: { Light: '$neutral/0', Dark: '$neutral/950' } },
        { name: 'color/bg/surface', values: { Light: '$neutral/50', Dark: '$neutral/900' } },
        { name: 'color/text/primary', values: { Light: '$neutral/900', Dark: '$neutral/50' } },
        { name: 'color/text/muted', values: { Light: '$neutral/500', Dark: '$neutral/200' } },
        { name: 'color/text/on-action', values: { Light: '$neutral/0', Dark: '$neutral/0' } },
        { name: 'color/border/subtle', values: { Light: '$neutral/100', Dark: '$neutral/700' } },
        { name: 'color/border/default', values: { Light: '$neutral/200', Dark: '$neutral/700' } },
        { name: 'color/action/primary', values: { Light: '$blue/600', Dark: '$blue/400' } },
        { name: 'color/action/primary-hover', values: { Light: '$blue/700', Dark: '$blue/600' } },
        { name: 'color/icon/default', values: { Light: '$neutral/700', Dark: '$neutral/200' } },
        { name: 'color/feedback/danger', values: { Light: '$red/600', Dark: '$red/600' } },
      ],
    },
  ],
});

await step('styles', 'styles', {
  text: [
    { name: 'Heading/H1', font: '700 26/32 Inter', letterSpacing: '-1%' },
    { name: 'Heading/H3', font: '600 18/24 Inter' },
    { name: 'Body/MD', font: '400 16/24 Inter' },
    { name: 'Body/SM', font: '400 14/20 Inter' },
    { name: 'Label/MD', font: '600 15/20 Inter' },
    { name: 'Label/SM', font: '600 13/16 Inter' },
  ],
  effect: [{ name: 'Elevation/1', effects: '0 1 2 0 rgba(0,0,0,0.06), 0 2 8 -2 rgba(0,0,0,0.10)' }],
});

await step('fonts', 'fonts', { query: 'Inter', limit: 3 });
await step('icons', 'icons', { query: 'arrow', set: 'lucide', limit: 10 });

await step('component-button', 'create_component', {
  page: 'figma-mcp E2E',
  name: 'Button',
  description: 'Primary and secondary actions. One primary button per view.',
  spec: {
    type: 'row', ref: 'root', pad: [12, 20], gap: 8, align: 'center', justify: 'center', radius: '$radius/md',
    fill: '$color/action/primary', color: '$color/text/on-action',
    children: [
      { type: 'icon', ref: 'icon', icon: 'lucide:arrow-right', size: 18, bind: { visible: 'Show icon' } },
      { type: 'text', ref: 'label', text: 'Button', style: 'Label/MD', bind: { text: 'Label' } },
    ],
  },
  variants: {
    axes: { Variant: ['Primary', 'Secondary'], State: ['Default', 'Hover', 'Disabled'] },
    patches: [
      { when: { Variant: 'Secondary' }, set: { root: { fill: '$color/bg/default', stroke: '1px solid $color/border/default', color: '$color/text/primary' } } },
      { when: { Variant: 'Primary', State: 'Hover' }, set: { root: { fill: '$color/action/primary-hover' } } },
      { when: { Variant: 'Secondary', State: 'Hover' }, set: { root: { fill: '$color/bg/surface' } } },
      { when: { State: 'Disabled' }, set: { root: { opacity: 0.4 } } },
    ],
  },
  props: { Label: { type: 'text', default: 'Button' }, 'Show icon': { type: 'boolean', default: false } },
  interactions: [{ from: { State: 'Default' }, trigger: 'hover', to: { State: 'Hover' } }],
});

await step('component-input', 'create_component', {
  page: 'figma-mcp E2E',
  name: 'Input',
  description: 'Text field with label.',
  spec: {
    type: 'column', gap: 6, w: 320,
    children: [
      { type: 'text', text: 'Label', style: 'Label/SM', color: '$color/text/primary', bind: { text: 'Label' } },
      {
        type: 'row', name: 'Field', w: 'fill', h: 44, pad: [0, 12], gap: 8, align: 'center', radius: '$radius/sm',
        fill: '$color/bg/default', stroke: '1px solid $color/border/default',
        children: [{ type: 'text', name: 'Placeholder', text: 'Placeholder', style: 'Body/MD', color: '$color/text/muted', w: 'fill', bind: { text: 'Placeholder' } }],
      },
    ],
  },
  props: { Label: { type: 'text', default: 'Label' }, Placeholder: { type: 'text', default: 'Placeholder' } },
});

const signIn = await step('build-signin', 'build', {
  spec: {
    type: 'frame', name: 'Sign in', w: 390, h: 844, fill: '$color/bg/default', pad: [72, 24, 32, 24], gap: 24, align: 'stretch',
    color: '$color/text/primary', scroll: 'vertical',
    children: [
      { type: 'column', name: 'Intro', gap: 8, children: [
        { type: 'text', ref: 'title', text: 'Welcome back', style: 'Heading/H1', w: 'fill' },
        { type: 'text', text: 'Sign in to keep your orders, addresses and saved items in one place.', style: 'Body/MD', color: '$color/text/muted', w: 'fill' },
      ] },
      { type: 'column', name: 'Form', gap: '$space/4', children: [
        { type: 'instance', component: 'Input', props: { Label: 'Email', Placeholder: 'you@example.com' }, w: 'fill' },
        { type: 'instance', component: 'Input', props: { Label: 'Password', Placeholder: '••••••••' }, w: 'fill' },
        { type: 'text', text: 'Forgot password?', style: 'Label/SM', color: '$color/action/primary', textAlign: 'right', w: 'fill' },
      ] },
      { type: 'instance', ref: 'cta', name: 'Sign in button', component: 'Button', variant: { Variant: 'Primary', State: 'Default' }, props: { Label: 'Sign in', 'Show icon': true }, w: 'fill' },
      { type: 'row', name: 'Divider', gap: 12, align: 'center', children: [
        { type: 'rect', name: 'Line', w: 'fill', h: 1, fill: '$color/border/subtle' },
        { type: 'text', text: 'or', style: 'Body/SM', color: '$color/text/muted' },
        { type: 'rect', name: 'Line', w: 'fill', h: 1, fill: '$color/border/subtle' },
      ] },
      { type: 'row', name: 'Social', gap: 12, children: [
        { type: 'instance', component: 'Button', variant: { Variant: 'Secondary' }, props: { Label: 'Google' }, w: 'fill' },
        { type: 'instance', component: 'Button', variant: { Variant: 'Secondary' }, props: { Label: 'Apple' }, w: 'fill' },
      ] },
      { type: 'text', name: 'Footer', textAlign: 'center', w: 'fill', style: 'Body/SM', segments: [
        { text: 'New here? ', color: '$color/text/muted' },
        { text: 'Create an account', weight: 600, color: '$color/action/primary', link: 'https://example.com/signup' },
      ] },
      { type: 'frame', name: 'Badge', absolute: true, x: 318, y: 24, pad: [4, 8], radius: 'full', fill: '$color/feedback/danger', constraints: { h: 'right', v: 'top' },
        children: [{ type: 'text', text: 'Beta', style: 'Label/SM', color: '#FFFFFF' }] },
    ],
  },
});
ids.signIn = signIn && grab(signIn.text, 'id');
ids.cta = signIn && (signIn.text.match(/cta: "?([0-9]+:[0-9]+)/) || [])[1];

const home = await step('build-home', 'build', {
  spec: {
    type: 'frame', name: 'Home', w: 390, h: 844, fill: '$color/bg/surface', pad: [56, 16, 24, 16], gap: 16, align: 'stretch', color: '$color/text/primary',
    children: [
      { type: 'row', name: 'Header', justify: 'between', align: 'center', children: [
        { type: 'icon', ref: 'back', name: 'Back', icon: 'lucide:chevron-left', size: 24 },
        { type: 'text', text: 'Shop', style: 'Heading/H3' },
        { type: 'icon', icon: 'lucide:shopping-bag', size: 22 },
      ] },
      { type: 'image', name: 'Hero', placeholder: 'Hero photo: folded linen shirts on a wooden table, soft daylight', w: 'fill', h: 180, radius: '$radius/lg' },
      { type: 'grid', name: 'Products', cols: 2, gap: 12, children: [1, 2, 3, 4].map((i) => ({
        type: 'column', name: 'Product card', fill: '$color/bg/default', radius: '$radius/md', pad: 12, gap: 6, w: 'fill', effects: '@Elevation/1',
        children: [
          { type: 'image', placeholder: `Product ${i}`, w: 'fill', h: 96, radius: '$radius/sm' },
          { type: 'text', text: ['Linen shirt', 'Cotton chinos', 'Wool overshirt with a longer name', 'Canvas tote'][i - 1], style: 'Body/SM', w: 'fill', maxLines: 1 },
          { type: 'text', text: ['EGP 950', 'EGP 1,200', 'EGP 2,450', 'EGP 380'][i - 1], style: 'Label/MD' },
        ],
      })) },
      { type: 'row', name: 'RTL row', rtl: true, gap: 8, align: 'center', children: [
        { type: 'icon', icon: 'lucide:truck', size: 18 },
        { type: 'text', text: 'توصيل مجاني للطلبات فوق ٥٠٠ جنيه', style: 'Body/SM' },
      ] },
    ],
  },
});
ids.home = home && grab(home.text, 'id');
ids.back = home && (home.text.match(/back: "?([0-9]+:[0-9]+)/) || [])[1];

await step('metadata', 'get_metadata', { nodeId: ids.signIn ?? undefined, depth: 3 });
await step('get_node', 'get_node', { ids: [ids.cta ?? ids.signIn].filter(Boolean) });
await step('search', 'search', { query: 'Product', types: ['FRAME'] });

const edited = await step('edit', 'edit', {
  ops: [
    { op: 'duplicate', id: ids.signIn, ref: 'copy' },
    { op: 'rename', id: 'copy', name: 'Sign in / Error' },
    {
      op: 'insert', parent: 'copy', index: 1, ref: 'banner',
      spec: {
        type: 'row', name: 'Error banner', w: 'fill', pad: [10, 12], gap: 8, align: 'center', radius: '$radius/sm', fill: '#FDECEC',
        children: [
          { type: 'icon', icon: 'lucide:circle-alert', size: 18, color: '$color/feedback/danger' },
          { type: 'text', text: 'Wrong email or password. Try again or reset it.', style: 'Body/SM', color: '$color/feedback/danger', w: 'fill' },
        ],
      },
    },
  ],
});
ids.error = edited && (edited.text.match(/copy: "?([0-9]+:[0-9]+)/) || [])[1];
if (ids.error) await step('screenshot-error', 'screenshot', { nodeId: ids.error });

await step('prototype', 'prototype', {
  links: [
    { from: ids.cta ?? 'Sign in > Sign in button', trigger: 'click', action: 'navigate', to: 'Home', transition: 'smart-animate 300ms ease-out' },
    { from: ids.back ?? 'Home > Back', trigger: 'click', action: 'back' },
  ],
  flows: [{ name: 'Sign in', start: ids.signIn ?? 'Sign in' }],
});
await step('prototype-read', 'prototype', { read: true });

await step('lint', 'lint', { nodeId: ids.signIn ?? undefined });
await step('lint-home-fix', 'lint', { nodeId: ids.home ?? undefined, fix: true });

await step('design-context-react', 'get_design_context', { nodeId: ids.signIn ?? undefined, assetsDir: path.join(out, 'project', 'public', 'figma') });
await step('design-context-html', 'get_design_context', { nodeId: ids.home ?? undefined, framework: 'html-css', screenshot: false });
await step('design-context-ref', 'get_design_context', { nodeId: ids.signIn ?? undefined, instances: 'reference', screenshot: false, componentMap: { Button: { import: '@/components/ui/button', name: 'Button', props: { Variant: { prop: 'variant', values: { Primary: 'default', Secondary: 'outline' } }, Label: 'children' } } } });
await step('tokens-css', 'export_tokens', { format: 'css', outFile: path.join(out, 'project', 'tokens.css') });
await step('tokens-tailwind', 'export_tokens', { format: 'tailwind' });
await step('design-system', 'get_design_system', {});
await step('export', 'export', { items: [{ nodeId: ids.signIn, format: 'PNG', scale: 1 }, { nodeId: ids.home, format: 'SVG' }], dir: path.join(out, 'project', 'exports') });
await step('execute', 'execute', { code: '// count layers\nconst page = figma.currentPage;\nconst all = page.findAll(() => true);\nconsole.log("page", page.name);\nreturn { layers: all.length, frames: page.children.map(c => c.name) };' });
await step('brief', 'brief', { action: 'set', text: 'E2E test file for figma-mcp. Clothing store app, mobile first, Inter.' });
await step('screenshot', 'screenshot', { nodeIds: [ids.signIn, ids.home].filter(Boolean) });

console.log(`\n${failures.length ? `✕ ${failures.length} failing step(s):\n  ${failures.join('\n  ')}` : '✓ all steps passed'}\nOutput: ${out}`);
await client.close();
process.exit(0);
