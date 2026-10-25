import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { versionNote } from '../src/server/tools.ts';

test('version drift: a stale server is told to keep working, not to re-run the plugin', () => {
  const installed = fs.readFileSync(path.join(import.meta.dirname, '..', 'figma-plugin', 'code.js'), 'utf8').match(/PLUGIN_VERSION = [^"]*"([^"]+)"/)![1];
  const stale = versionNote('1.0.0+old', installed);
  assert.match(stale, /server process \(1\.0\.0\+old\) is older than the installed build/);
  assert.match(stale, /Keep working/);
  assert.match(stale, /opencode service restart/);
  assert.doesNotMatch(stale, /Close and re-run/);
  assert.match(versionNote(installed, '1.0.0+older-plugin'), /Keep working; if a tool fails with an unknown method/);
});
