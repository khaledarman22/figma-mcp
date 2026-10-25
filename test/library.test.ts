import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { addToLibrary, imageSize, readLibrary, searchLibrary, writeLibrary } from '../src/server/library.ts';
import { ensureWorkspace } from '../src/server/workspace.ts';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0xc8, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

test('image sizes come from the file header', () => {
  assert.deepEqual(imageSize(PNG), { width: 1, height: 1 });
  assert.deepEqual(imageSize(JPEG), { width: 200, height: 100 });
  assert.equal(imageSize(Buffer.from('not an image at all')), null);
});

test('the library keeps each image once, with size, orientation and license; search filters by words and shape', () => {
  const ws = ensureWorkspace({ name: 'Shop', key: 'K' }, fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-lib-')))!;
  const items = readLibrary(ws);
  const a = addToLibrary(ws, items, JPEG, { title: 'Cairo rooftop sunrise', tags: ['City', 'warm'], source: 'https://unsplash.com/photos/x', license: 'Unsplash License' });
  assert.equal(a.added, true);
  assert.equal(a.item.id, 'LIB-001');
  assert.equal(a.item.orientation, 'landscape');
  assert.ok(fs.existsSync(path.join(ws.dir, 'library', 'LIB-001-cairo-rooftop-sunrise.jpg')));
  assert.equal(addToLibrary(ws, items, JPEG, { title: 'Same file again' }).added, false, 'same bytes → same entry');
  addToLibrary(ws, items, PNG, { title: 'Avatar placeholder', tags: ['person'] });
  writeLibrary(ws, items);
  const back = readLibrary(ws);
  assert.equal(back.length, 2);
  assert.deepEqual(searchLibrary(back, { query: 'warm city' }).map((x) => x.id), ['LIB-001']);
  assert.deepEqual(searchLibrary(back, { orientation: 'square' }).map((x) => x.id), ['LIB-002']);
  assert.deepEqual(searchLibrary(back, { minWidth: 100 }).map((x) => x.id), ['LIB-001']);
  const md = fs.readFileSync(path.join(ws.dir, 'LIBRARY.md'), 'utf8');
  assert.match(md, /\| LIB-001 \| \*\*Cairo rooftop sunrise\*\*<br>`library\/LIB-001-cairo-rooftop-sunrise\.jpg` \| 200×100 landscape \| city, warm \| \[source\]\(https:\/\/unsplash\.com\/photos\/x\) · Unsplash License \|/);
  assert.match(md, /LIB-002[\s\S]*license unknown — reference only until licensed/);
});
