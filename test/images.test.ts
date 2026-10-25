import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { briefGaps, groupUsages, imageIdOf, matchImageFiles, parsePromptsFile, ratio, renderPromptsFile, type Usage } from '../src/server/images.ts';

const use = (o: Partial<Usage>): Usage => ({ nodeId: '1:1', imageId: 'IMG-001', name: 'Hero photo', page: 'App', screen: 'Home', path: 'Home', w: 393, h: 300, prompt: 'Sunrise over Cairo rooftops', ...o });

test('ratio names common shapes', () => {
  assert.equal(ratio(1080, 1080), '1:1');
  assert.equal(ratio(1920, 1080), '16:9');
  assert.equal(ratio(390, 300), '≈ 4:3');
  assert.equal(ratio(1000, 370), '2.70:1 (nearest 3:1)');
  assert.equal(ratio(393, 852), '1:2.17 (nearest 1:2)');
  assert.equal(ratio(353, 220), '16:10');
  assert.equal(ratio(353, 225), '≈ 16:10');
  assert.equal(ratio(0, 10), '—');
});

test('one entry per image id, sized for its largest use', () => {
  const entries = groupUsages([use({}), use({ nodeId: '2:2', page: 'Web', screen: 'Landing', w: 1440, h: 600 }), use({ nodeId: '3:3', imageId: 'IMG-002', name: 'Avatar', w: 96, h: 96, prompt: 'Portrait' })]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].imageId, 'IMG-001');
  assert.equal(entries[0].usages.length, 2);
  assert.deepEqual([entries[0].w, entries[0].h], [1440, 600]);
  assert.equal(entries[1].title, 'Avatar');
});

test('prompts file keeps its settings and placed history; gone placeholders drop out', () => {
  const entries = groupUsages([use({}), use({ nodeId: '3:3', imageId: 'IMG-002', name: 'Avatar', w: 96, h: 96, prompt: 'Portrait' })]);
  const md = renderPromptsFile({ title: 'Shop', entries, scale: 3, imagesDir: 'art', style: 'Warm film look' });
  assert.match(md, /## IMG-001 — Hero photo/);
  assert.match(md, /1179×900 px/);
  assert.match(md, /`art\/IMG-001-hero-photo\.png`/);
  const parsed = parsePromptsFile(md);
  assert.deepEqual(parsed.meta, { title: 'Shop', style: 'Warm film look', scale: 3, imagesDir: 'art', assetsDir: 'art' });
  assert.equal(parsed.entries.get('IMG-002')?.status, 'needed');
  // IMG-001 placed, IMG-002 removed from the design: history keeps only the placed one.
  const history = new Map(parsed.entries);
  history.set('IMG-001', { status: 'placed ✓ (art/IMG-001.png)', block: history.get('IMG-001')!.block.replace('- **Status:** needed', '- **Status:** placed ✓ (art/IMG-001.png)') });
  const next = renderPromptsFile({ title: 'Shop', entries: [], scale: 3, imagesDir: 'art', previous: history });
  assert.match(next, /# Placed[\s\S]*## IMG-001[\s\S]*placed ✓/);
  assert.doesNotMatch(next, /IMG-002/);
  assert.match(next, /_No images waiting._/);
});

test('images the user supplies are listed apart, saved into assets, with previews', () => {
  const entries = groupUsages([use({ preview: undefined } as Partial<Usage>), use({ nodeId: '4:4', imageId: 'IMG-003', name: 'Logo', w: 120, h: 40, prompt: 'The brand logo, transparent PNG or SVG', supply: true })]);
  entries[0].preview = 'previews/home.png';
  const md = renderPromptsFile({ title: 'Shop', entries, scale: 2, imagesDir: 'images', assetsDir: 'assets' });
  assert.match(md, /## IMG-001 — Hero photo[\s\S]*Where it goes:\*\* !\[IMG-001 in place\]\(previews\/home\.png\)[\s\S]*\*\*Prompt:\*\*/);
  assert.match(md, /# From you — real files[\s\S]*## IMG-003 — Logo \(from you\)[\s\S]*`assets\/IMG-003-logo\.png`[\s\S]*\*\*Needed from you:\*\*\n\nThe brand logo/);
  const parsed = parsePromptsFile(md);
  assert.equal(parsed.meta.assetsDir, 'assets');
  // Each block stops at the next top-level section.
  assert.doesNotMatch(parsed.entries.get('IMG-001')!.block, /From you/);
});

test('generated files are matched by the id at the start of their name', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-img-'));
  for (const f of ['IMG-001-hero.png', 'img_2.JPG', 'img-12 final.webp', 'cover.png', 'notes.txt', '.DS_Store']) fs.writeFileSync(path.join(dir, f), 'x');
  const { byId, unmatched } = matchImageFiles(dir);
  assert.deepEqual([...byId.keys()].sort(), ['IMG-001', 'IMG-002', 'IMG-012']);
  assert.deepEqual(unmatched, ['cover.png']);
  assert.equal(imageIdOf('/x/IMG-0071.png'), 'IMG-0071');
  assert.equal(imageIdOf('image-1.png'), undefined);
});

test('a short prompt is an incomplete brief; a full one with a reference image and elements is not', () => {
  assert.ok(briefGaps('Sunrise over Cairo rooftops').includes('Reference'));
  const full = [
    'Purpose: hero of the home screen',
    'Reference: references/IMG-001-ref-rooftops.jpg (https://unsplash.com/photos/x) — take: light; leave: people',
    'Subject: Cairo rooftops at sunrise',
    'Elements:',
    '  - foreground: water tanks and satellite dishes',
    '  - mid-ground: minarets',
    '  - background: hazy sky, pale orange',
    'Setting: Downtown Cairo, early morning',
    'Composition: wide, horizon in the lower third',
    'Safe areas: top 40% plain for the headline',
    'Camera / medium: editorial photo, 35mm',
    'Light: low sun from the right',
    'Color: sand #F4E9DC, teal #0F766E',
    'Mood: calm',
    'Consistency: warm editorial photography',
    'Exclusions: no text, no logos',
    'Deliverable: --ar 16:9, JPG',
  ].join('\n');
  assert.deepEqual(briefGaps(full), []);
  assert.ok(briefGaps(full.replace(/Reference: .*/, 'Reference: a nice photo')).some((g) => g.startsWith('Reference (')));
  assert.ok(briefGaps(full.replace(/Elements:[\s\S]*?(?=Setting)/, 'Elements: rooftops\n')).some((g) => g.startsWith('Elements (')));
  const md = renderPromptsFile({ title: 'Shop', entries: groupUsages([use({ prompt: full }), use({ nodeId: '2:2', imageId: 'IMG-002', prompt: 'Portrait' })]), scale: 2, imagesDir: 'images' });
  assert.match(md, /## IMG-001[\s\S]*\*\*Reference:\*\* !\[IMG-001 reference\]\(references\/IMG-001-ref-rooftops\.jpg\)/);
  assert.doesNotMatch(md.split('## IMG-002')[0], /Brief incomplete/);
  assert.match(md.split('## IMG-002')[1], /Brief incomplete — missing:.*Reference/);
});
