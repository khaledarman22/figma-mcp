import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyAssets, collectAssetRefs, expandVariants, interactions, newIssues, normalizeSpec, transition } from '../src/shared/spec.ts';
import { contrastRatio, parseColor, toHex } from '../src/shared/color.ts';
import { isSectionNumber, kebab, normalizeNodeId, pascal, suggest } from '../src/shared/util.ts';

test('normalizes CSS-ish aliases and shorthands', () => {
  const issues = newIssues();
  const s = normalizeSpec(
    {
      type: 'column',
      name: 'Card',
      width: 320,
      padding: [16, 24],
      spacing: 12,
      alignItems: 'center',
      background: '#FFFFFF',
      borderRadius: 'full',
      border: '1px solid #E5E7EB',
      boxShadow: '0 4 12 -2 rgba(0,0,0,0.12)',
      children: [
        { text: 'Hello', fontSize: 18, fontWeight: 'SemiBold', color: '$color/text', w: 'fill' },
        { type: 'instance', component: 'Button', variant: 'Type=Primary, Size=md', props: { Label: 'Go' } },
      ],
    },
    'spec',
    issues,
  );
  assert.deepEqual(issues.errors, []);
  assert.equal(s.type, 'frame');
  assert.equal(s.dir, 'column');
  assert.equal(s.w, 320);
  assert.deepEqual(s.pad, [16, 24, 16, 24]);
  assert.equal(s.gap, 12);
  assert.equal(s.align, 'center');
  assert.deepEqual(s.fill, [{ kind: 'solid', color: '#FFFFFF' }]);
  assert.equal(s.radius, 9999);
  assert.equal(s.stroke?.weight, 1);
  assert.equal(s.effects?.[0].kind, 'drop-shadow');
  const t = s.children![0];
  assert.equal(t.type, 'text');
  assert.equal(t.font?.size, 18);
  assert.equal(t.font?.weight, 600);
  assert.deepEqual(t.color, [{ kind: 'solid', color: '$color/text' }]);
  assert.equal(t.w, 'fill');
  const inst = s.children![1];
  assert.deepEqual(inst.variant, { Type: 'Primary', Size: 'md' });
});

test('reports every problem with a path and suggestions', () => {
  const issues = newIssues();
  normalizeSpec({ type: 'frmae', children: [{ type: 'text' }, { type: 'rect', children: [] }, { type: 'icon', icon: 'search' }] }, 'spec', issues);
  assert.ok(issues.errors.some((e) => e.includes('spec.type') && e.includes('"frame"')));
  assert.ok(issues.errors.some((e) => e.includes('spec.children[0]') && e.includes('needs "text"')));
  assert.ok(issues.errors.some((e) => e.includes('spec.children[1]') && e.includes('cannot have children')));
  assert.ok(issues.errors.some((e) => e.includes('lucide:search')));
});

test('unknown keys warn with suggestions instead of failing', () => {
  const issues = newIssues();
  normalizeSpec({ type: 'frame', paddin: 4 }, 'spec', issues);
  assert.equal(issues.errors.length, 0);
  assert.ok(issues.warnings[0].includes('"pad"') || issues.warnings[0].includes('"padding"'));
});

test('font shorthand and inheritance-friendly props', () => {
  const issues = newIssues();
  const s = normalizeSpec({ type: 'text', text: 'x', font: '600 16/24 Plus Jakarta Sans' }, 's', issues);
  assert.deepEqual(s.font, { weight: 600, size: 16, lineHeight: 24, family: 'Plus Jakarta Sans' });
  const f = normalizeSpec({ type: 'frame', fontFamily: 'Cairo', color: '#111', rtl: true }, 'f', issues);
  assert.equal(f.font?.family, 'Cairo');
  assert.deepEqual(f.color, [{ kind: 'solid', color: '#111' }]);
  assert.equal(f.rtl, true);
  const lh = normalizeSpec({ type: 'text', text: 'y', lineHeight: 1.5 }, 'l', issues);
  assert.equal(lh.font?.lineHeight, '150%');
});

test('shapes take color as fill; icons keep it as color', () => {
  const issues = newIssues();
  assert.ok(normalizeSpec({ type: 'rect', color: '#f00' }, 'r', issues).fill);
  assert.ok(normalizeSpec({ type: 'icon', icon: 'lucide:x', color: '#f00' }, 'i', issues).color);
});

test('gradients, images, styles', () => {
  const issues = newIssues();
  const s = normalizeSpec({ type: 'frame', fill: 'linear-gradient(90deg, #fff 0%, $color/brand 100%)', src: '/tmp/x.png' }, 's', issues);
  assert.equal(issues.errors.length, 0);
  assert.equal(s.fill?.[0].kind, 'gradient');
  const g = s.fill?.[0] as { angle: number; stops: Array<{ color: string; position: number }> };
  assert.equal(g.angle, 90);
  assert.deepEqual(g.stops[1], { color: '$color/brand', position: 1 });
  assert.equal(s.fill?.[1].kind, 'image');
  const st = normalizeSpec({ type: 'rect', fill: '@Brand/Primary', effects: '@Shadow/md' }, 's2', issues);
  assert.deepEqual(st.fill, [{ kind: 'style', name: 'Brand/Primary' }]);
  assert.deepEqual(st.effects, [{ kind: 'style', name: 'Shadow/md' }]);
});

test('interactions and transitions', () => {
  const issues = newIssues();
  const list = interactions(
    [
      { from: 'btn', trigger: 'click', navigate: 'Home', transition: 'smart-animate 300ms ease-out' },
      { from: 'x', trigger: 'after 1.5s', action: 'overlay', to: '1:2', transition: { type: 'slide-in', direction: 'up', duration: 250, easing: 'gentle' } },
      { from: 'k', trigger: 'key Escape', back: true },
      'Settings',
    ],
    'links',
    issues,
  );
  assert.deepEqual(issues.errors, []);
  assert.equal(list[0].actions[0].kind, 'navigate');
  assert.equal(list[0].actions[0].transition?.durationMs, 300);
  assert.equal(list[1].trigger.delayMs, 1500);
  assert.equal(list[1].actions[0].transition?.direction, 'top');
  assert.deepEqual(list[2].trigger.keyCodes, [27]);
  assert.equal(list[3].actions[0].to, 'Settings');
  assert.equal(transition('instant', 't', issues), null);
});

test('variant expansion applies patches by ref', () => {
  const issues = newIssues();
  const base = { type: 'frame', ref: 'root', fill: '#000', children: [{ type: 'text', ref: 'label', text: 'Go', color: '#fff' }] };
  const out = expandVariants(base, { axes: { Type: ['Primary', 'Ghost'], Size: ['sm', 'md'] }, patches: [{ when: { Type: 'Ghost' }, set: { root: { fill: null }, label: { color: '#000' } } }], exclude: [{ Type: 'Ghost', Size: 'sm' }] }, issues);
  assert.deepEqual(issues.errors, []);
  assert.equal(out.length, 3);
  assert.equal(out[0].name, 'Type=Primary, Size=sm');
  const ghost = out.find((o) => o.props.Type === 'Ghost')!.spec as { fill: unknown; children: Array<{ color: string }> };
  assert.equal(ghost.fill, null);
  assert.equal(ghost.children[0].color, '#000');
  assert.equal((base.children[0] as { color: string }).color, '#fff', 'base untouched');
});

test('asset refs are collected and injected', () => {
  const issues = newIssues();
  const s = normalizeSpec({ type: 'frame', children: [{ type: 'icon', icon: 'lucide:search' }, { type: 'image', src: '/a.png' }, { type: 'image', src: '/b.svg' }] }, 's', issues);
  const refs = collectAssetRefs(s);
  assert.deepEqual([...refs.icons], ['lucide:search']);
  assert.deepEqual([...refs.images].sort(), ['/a.png', '/b.svg']);
  const problems = applyAssets(s, { icons: { 'lucide:search': '<svg/>' }, images: { '/a.png': { data: 'AAA' }, '/b.svg': { svg: '<svg/>' } } });
  assert.deepEqual(problems, []);
  assert.equal(s.children![0].svg, '<svg/>');
  assert.equal(s.children![1].imageData, 'AAA');
  assert.equal(s.children![2].type, 'svg');
});

test('colors', () => {
  assert.deepEqual(parseColor('#fff'), { r: 1, g: 1, b: 1, a: 1 });
  assert.equal(toHex(parseColor('rgba(255, 0, 0, 0.5)')!), '#FF000080');
  assert.equal(toHex(parseColor('hsl(210, 100%, 50%)')!), '#0080FF');
  assert.ok(Math.abs(contrastRatio(parseColor('#000')!, parseColor('#fff')!) - 21) < 0.01);
});

test('utils', () => {
  assert.equal(normalizeNodeId('https://www.figma.com/design/abc/File?node-id=12-34&t=x'), '12:34');
  assert.equal(normalizeNodeId('12-34'), '12:34');
  assert.equal(kebab('Color/BG Default'), 'color-bg-default');
  assert.equal(pascal('login screen / v2'), 'LoginScreenV2');
  assert.deepEqual(suggest('colr/bg', ['color/bg', 'color/fg', 'space/4']).slice(0, 1), ['color/bg']);
});

test('device presets size frames exactly; explicit sizes win', () => {
  const issues = newIssues();
  const s = normalizeSpec({ type: 'screen', name: 'Home', device: 'iPhone 16', h: 'hug' }, 'spec', issues);
  assert.deepEqual(issues.errors, []);
  assert.equal(s.device, 'iphone-16');
  assert.equal(s.w, 393);
  assert.equal(s.h, 'hug');
  const banner = normalizeSpec({ name: 'Story', preset: 'instagram_story' }, 'spec', issues);
  assert.deepEqual([banner.w, banner.h], [1080, 1920]);
  const bad = newIssues();
  normalizeSpec({ name: 'X', device: 'iphone-16-pro-maxx' }, 'spec', bad);
  assert.match(bad.errors[0], /unknown device.*iphone-16-pro-max/);
});

test('image prompts: prompt makes an image node; images without src or prompt get a nudge', () => {
  const issues = newIssues();
  const s = normalizeSpec({ name: 'Hero photo', imagePrompt: 'Sunrise over Cairo rooftops, warm light', w: 'fill', h: 240 }, 'spec', issues);
  assert.equal(s.type, 'image');
  assert.equal(s.prompt, 'Sunrise over Cairo rooftops, warm light');
  assert.deepEqual(issues.warnings, []);
  const bare = newIssues();
  normalizeSpec({ type: 'image', name: 'Photo' }, 'spec', bare);
  assert.match(bare.warnings[0], /add "prompt"/);
  const partial = normalizeSpec({ prompt: 'Product shot' }, 'props', newIssues(), { partial: true });
  assert.equal(partial.prompt, 'Product shot');
  assert.equal(partial.type, undefined);
});

test('supply: an image the user provides is an image node; prompt wins when both are given', () => {
  const issues = newIssues();
  const s = normalizeSpec({ name: 'Logo', provide: 'The brand logo, transparent PNG or SVG', w: 120, h: 40 }, 'spec', issues);
  assert.equal(s.type, 'image');
  assert.equal(s.supply, 'The brand logo, transparent PNG or SVG');
  assert.deepEqual(issues.warnings, []);
  const both = newIssues();
  const b = normalizeSpec({ type: 'image', prompt: 'A photo', supply: 'Your photo' }, 'spec', both);
  assert.equal(b.prompt, 'A photo');
  assert.equal(b.supply, undefined);
  assert.match(both.warnings[0], /both prompt and supply/);
});

test('mockup is a boolean screen option; hand-placed related content gets an auto layout nudge', () => {
  const issues = newIssues();
  const s = normalizeSpec({ name: 'Home', device: 'iphone-16', deviceFrame: false }, 'spec', issues);
  assert.equal(s.mockup, false);
  const free = newIssues();
  normalizeSpec({ type: 'frame', name: 'Card', dir: 'none', children: [{ type: 'text', text: 'A', x: 0, y: 0 }, { type: 'text', text: 'B', x: 0, y: 20 }] }, 'spec', free);
  assert.match(free.warnings.join('\n'), /2 children placed by hand \(dir: "none"\) — put related content in auto layout/);
  const overlay = newIssues();
  normalizeSpec({ type: 'frame', name: 'Hero', dir: 'none', children: [{ type: 'image', src: '/x.png' }, { type: 'text', text: 'Badge', absolute: true }] }, 'spec', overlay);
  assert.doesNotMatch(overlay.warnings.join('\n'), /placed by hand/);
});

test('decorative section numbers are recognized; times, dates, phones and prices are not', () => {
  for (const t of ['01 لماذا قنّاص', '01', '/02 Services', '(03) Process', 'Services — 04', 'خدماتنا 02', '٠١ من نحن', '01. Why us']) assert.ok(isSectionNumber(t), t);
  for (const t of ['01:30', '01/12/2026', '01012345678', '0.5 mm', '2026', 'Step 1', '10 مشاريع', 'Call 0100 123 4567', '']) assert.ok(!isSectionNumber(t), t);
});
