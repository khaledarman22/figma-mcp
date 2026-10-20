import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { groupUsages, imageIdOf, matchImageFiles, parsePromptsFile, ratio, renderPromptsFile, type Usage } from '../src/server/images.ts';

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
  assert.deepEqual(parsed.meta, { title: 'Shop', style: 'Warm film look', scale: 3, imagesDir: 'art' });
  assert.equal(parsed.entries.get('IMG-002')?.status, 'needed');
  // IMG-001 placed, IMG-002 removed from the design: history keeps only the placed one.
  const history = new Map(parsed.entries);
  history.set('IMG-001', { status: 'placed ✓ (art/IMG-001.png)', block: history.get('IMG-001')!.block.replace('- **Status:** needed', '- **Status:** placed ✓ (art/IMG-001.png)') });
  const next = renderPromptsFile({ title: 'Shop', entries: [], scale: 3, imagesDir: 'art', previous: history });
  assert.match(next, /# Placed[\s\S]*## IMG-001[\s\S]*placed ✓/);
  assert.doesNotMatch(next, /IMG-002/);
  assert.match(next, /_No images waiting._/);
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
