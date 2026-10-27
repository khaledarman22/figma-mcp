import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { figmaTiles } from '../src/server/assets.ts';
import { imageSize } from '../src/server/references.ts';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('a full-page screenshot taller than Figma allows becomes stacked tiles', { skip: process.platform !== 'darwin' && 'needs sips (macOS)' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-tiles-'));
  const one = path.join(dir, 'one.png');
  const tall = path.join(dir, 'page.png');
  fs.writeFileSync(one, Buffer.from(PNG, 'base64'));
  execFileSync('sips', ['-z', '9000', '2000', one, '--out', tall], { stdio: 'ignore' });
  const tiles = figmaTiles(tall, { w: 2000, h: 9000 }, 1440, 4000);
  assert.deepEqual(tiles.map((t) => [t.w, t.h]), [[1440, 4000], [1440, 2480]]);
  for (const t of tiles) assert.deepEqual(imageSize(fs.readFileSync(t.file)), { w: t.w, h: t.h });
  assert.deepEqual(figmaTiles(one, { w: 1, h: 1 }), [{ file: one, w: 1, h: 1 }]);
});
