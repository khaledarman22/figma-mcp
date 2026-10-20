import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generate, type XNode, type XVar } from '../src/server/codegen.ts';
import { exportTokens, type VariablesDump } from '../src/server/tokens.ts';

const font = { family: 'Inter', style: 'Semi Bold', weight: 600, size: 24, lh: 32, ls: '-1%' };

const screen: XNode = {
  id: '1:1',
  name: 'Login',
  type: 'frame',
  x: 0,
  y: 0,
  w: 390,
  h: 844,
  layout: { dir: 'column', gap: 24, pad: [64, 24, 32, 24], justify: 'start', align: 'start' },
  sizing: { w: 'fixed', h: 'fixed' },
  fills: [{ t: 'solid', c: '#FFFFFF', v: 'color/bg/default' }],
  vars: { itemSpacing: 'space/6' },
  children: [
    {
      id: '1:2',
      name: 'Title',
      type: 'text',
      x: 24,
      y: 64,
      w: 342,
      h: 32,
      sizing: { w: 'fill', h: 'hug' },
      styles: { text: 'Heading/H1' },
      fills: [{ t: 'solid', c: '#111111' }],
      text: { chars: 'Welcome back', font, align: 'left', valign: 'top', autoResize: 'height' },
    },
    {
      id: '1:3',
      name: 'Row',
      type: 'frame',
      x: 24,
      y: 120,
      w: 342,
      h: 48,
      layout: { dir: 'row', gap: 12, pad: [0, 0, 0, 0], justify: 'between', between: true, align: 'center' },
      sizing: { w: 'fill', h: 'hug' },
      children: [
        { id: '1:4', name: 'icon/lucide/search', type: 'instance', x: 0, y: 12, w: 24, h: 24, sizing: { w: 'fixed', h: 'fixed' }, asset: { kind: 'svg', id: 'icon-lucide-search' }, comp: { kind: 'instance', name: 'icon/lucide/search' } },
        {
          id: '1:5',
          name: 'Button',
          type: 'instance',
          x: 200,
          y: 0,
          w: 142,
          h: 48,
          sizing: { w: 'hug', h: 'fixed' },
          comp: { kind: 'instance', name: 'Button', variant: { Type: 'Primary' }, props: { Label: 'Sign in' } },
          layout: { dir: 'row', gap: 8, pad: [12, 20, 12, 20], justify: 'center', align: 'center' },
          fills: [{ t: 'solid', c: '#2563EB' }],
          radius: 12,
          children: [{ id: '1:6', name: 'Label', type: 'text', x: 20, y: 12, w: 60, h: 24, sizing: { w: 'hug', h: 'hug' }, fills: [{ t: 'solid', c: '#FFFFFF' }], text: { chars: 'Sign in', font: { ...font, size: 16, lh: 24, ls: 0 }, align: 'left', valign: 'top', autoResize: 'width-and-height' } }],
        },
      ],
    },
    { id: '1:7', name: 'Badge', type: 'frame', x: 300, y: 20, w: 60, h: 20, abs: true, constraints: { h: 'max', v: 'min' }, sizing: { w: 'fixed', h: 'fixed' }, fills: [{ t: 'solid', c: '#FF000080' }], radius: 999 },
  ],
};

const vars: Record<string, XVar> = {
  'color/bg/default': { name: 'color/bg/default', collection: 'Semantic', type: 'COLOR', css: '--color-bg-default', value: '#FFFFFF', modes: { Light: '#FFFFFF', Dark: '#0B0B0C' } },
  'space/6': { name: 'space/6', collection: 'Spacing', type: 'FLOAT', css: '--space-6', value: 24 },
};

test('react + tailwind mirrors auto layout and tokens', () => {
  const r = generate(screen, { framework: 'react-tailwind', assetPaths: { 'icon-lucide-search': '/figma/icon-lucide-search.svg' }, vars, topLevel: true });
  const code = r.code;
  assert.match(code, /export default function Login\(\)/);
  assert.match(code, /const iconLucideSearch = "\/figma\/icon-lucide-search\.svg";/);
  assert.match(code, /flex flex-col items-start gap-\[var\(--space-6,24px\)\]/);
  assert.match(code, /pt-\[64px\] pr-\[24px\] pb-\[32px\] pl-\[24px\]|pt-\[64px\]/);
  assert.match(code, /bg-\[var\(--color-bg-default,#ffffff\)\]/);
  assert.match(code, /w-full min-h-screen/, 'top-level screens are fluid');
  assert.match(code, /<h1 [^>]*self-stretch/, 'text style Heading/H1 → h1, fill width in a column → self-stretch');
  assert.match(code, /tracking-\[-0\.01em\]/);
  assert.match(code, /justify-between/);
  assert.match(code, /<img [^>]*src=\{iconLucideSearch\}/);
  assert.match(code, /<button [^>]*type="button"/, 'layers named Button become <button>');
  assert.match(code, /whitespace-nowrap/, 'hug-width text never wraps');
  assert.match(code, /absolute right-\[30px\] w-\[60px\] top-\[20px\]/);
  assert.match(code, /rounded-full/);
  assert.match(code, /bg-\[rgba\(255,0,0,0\.502\)\]/);
  assert.match(code, /data-node-id="1:5"/);
  assert.match(code, /Button \(Type=Primary\) · Label="Sign in"/, 'instances are annotated');
  assert.deepEqual(r.usedVars.sort(), ['color/bg/default', 'space/6']);
});

test('component map turns instances into project components', () => {
  const r = generate(screen, {
    framework: 'react-tailwind',
    assetPaths: {},
    vars,
    topLevel: true,
    componentMap: { Button: { import: '@/components/ui/button', name: 'Button', props: { Type: { prop: 'variant', values: { Primary: 'default' } }, Label: 'children' } } },
  });
  assert.match(r.code, /import \{ Button \} from "@\/components\/ui\/button";/);
  assert.match(r.code, /<Button variant="default" className="shrink-0 h-\[48px\]">Sign in<\/Button>/);
});

test('html + css output with :root tokens and mode overrides', () => {
  const r = generate(screen, { framework: 'html-css', assetPaths: { 'icon-lucide-search': 'assets/search.svg' }, vars, topLevel: true });
  assert.match(r.code, /<div class="login" data-node-id="1:1">/);
  assert.match(r.code, /<img class="icon-lucide-search" src="assets\/search.svg" alt=""/);
  assert.ok(r.css);
  assert.match(r.css!, /:root \{\n {2}--color-bg-default: #FFFFFF;/);
  assert.match(r.css!, /\[data-semantic="dark"\] \{\n {2}--color-bg-default: #0B0B0C;/);
  assert.match(r.css!, /\.login \{[^}]*display: flex;[^}]*flex-direction: column;/);
});

test('reference mode emits component placeholders', () => {
  const inst: XNode = { id: '2:1', name: 'Card', type: 'frame', x: 0, y: 0, w: 300, h: 100, layout: { dir: 'column', gap: 0, pad: [0, 0, 0, 0] }, sizing: { w: 'fixed', h: 'hug' }, children: [{ id: '2:2', name: 'Avatar', type: 'instance', x: 0, y: 0, w: 40, h: 40, sizing: { w: 'fixed', h: 'fixed' }, comp: { kind: 'instance', name: 'Avatar', variant: { Size: 'md' }, props: { 'Show badge': true } } }] };
  const r = generate(inst, { framework: 'react-tailwind', assetPaths: {}, vars: {}, topLevel: false });
  assert.match(r.code, /<Avatar size="md" showBadge className="w-\[40px\] shrink-0 h-\[40px\]|<Avatar size="md" showBadge className=/);
});

const dump: VariablesDump = {
  collections: [
    { id: 'c1', name: 'Primitives', modes: [{ id: 'm1', name: 'Value' }], defaultModeId: 'm1' },
    { id: 'c2', name: 'Theme', modes: [{ id: 'l', name: 'Light' }, { id: 'd', name: 'Dark' }], defaultModeId: 'l' },
  ],
  variables: [
    { id: 'v1', name: 'blue/500', collectionId: 'c1', type: 'COLOR', scopes: [], codeSyntax: {}, values: { m1: { r: 0.145, g: 0.388, b: 0.922, a: 1 } } },
    { id: 'v2', name: 'space/4', collectionId: 'c1', type: 'FLOAT', scopes: ['GAP'], codeSyntax: { WEB: 'var(--space-4)' }, values: { m1: 16 } },
    { id: 'v3', name: 'color/primary', collectionId: 'c2', type: 'COLOR', scopes: ['ALL_FILLS'], codeSyntax: {}, values: { l: { alias: 'v1', name: 'blue/500' }, d: { r: 1, g: 1, b: 1, a: 1 } } },
    { id: 'v4', name: 'radius/md', collectionId: 'c1', type: 'FLOAT', scopes: ['CORNER_RADIUS'], codeSyntax: {}, values: { m1: 8 } },
  ],
};

test('tokens: css with aliases and modes', () => {
  const css = exportTokens(dump, 'css');
  assert.match(css, /--blue-500: #2563eb;/);
  assert.match(css, /--space-4: 16px;/);
  assert.match(css, /--color-primary: var\(--blue-500\);/);
  assert.match(css, /\[data-theme="dark"\] \{\n {2}--color-primary: #ffffff;/);
});

test('tokens: tailwind v4 namespaces', () => {
  const tw = exportTokens(dump, 'tailwind');
  assert.match(tw, /@theme \{/);
  assert.match(tw, /--color-blue-500: #2563eb;/);
  assert.match(tw, /--color-primary: var\(--color-blue-500\);/);
  assert.match(tw, /--spacing-4: 16px;|--space-4: 16px;/);
  assert.match(tw, /--radius-md: 8px;/);
});

test('tokens: dtcg json', () => {
  const j = JSON.parse(exportTokens(dump, 'dtcg'));
  assert.equal(j.Theme.color.primary.$value, '{Primitives.blue.500}');
  assert.equal(j.Primitives.space['4'].$value, '16px');
  assert.equal(j.Theme.color.primary.$extensions['figma.modes'].Dark, '#ffffff');
});
