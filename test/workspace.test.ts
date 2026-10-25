import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ensureWorkspace, findWorkspace, identityBlock, instanceExample, lookalikes, usesInstances, type CatalogItem } from '../src/server/workspace.ts';

const catalog: CatalogItem[] = [
  { id: '1:1', name: 'Forms/Input', kind: 'set', axes: { State: ['Default', 'Error'] }, props: { Label: 'text="Email"', 'Show icon': 'boolean=false', Icon: 'instance_swap="1:9"' } },
  { id: '1:2', name: 'Card', kind: 'component' },
  { id: '1:9', name: 'icon/lucide/mail', kind: 'component' },
];

test('a workspace per Figma file: found again by key after a rename, twins by name get their own folder', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-ws-'));
  const a = ensureWorkspace({ name: 'Shop App', key: 'K1' }, project)!;
  assert.equal(a.created, true);
  assert.equal(path.relative(project, a.dir), path.join('design', 'shop-app'));
  for (const f of ['references', 'images', 'assets', 'previews', 'tokens', 'README.md']) assert.ok(fs.existsSync(path.join(a.dir, f)), f);
  const renamed = findWorkspace({ name: 'Shop App v2', key: 'K1' }, project)!;
  assert.equal(renamed.dir, a.dir);
  assert.equal(renamed.meta.figma.name, 'Shop App v2');
  const other = ensureWorkspace({ name: 'Shop App v2', key: 'K2' }, project)!;
  assert.notEqual(other.dir, a.dir);
});

test('the Identity block is cut from the brief at the next level-2 heading', () => {
  assert.equal(identityBlock('Intro\n\n## Identity\nCalm.\n### Voice\nShort.\n\n## Decisions\n- x'), 'Calm.\n### Voice\nShort.');
  assert.equal(identityBlock('## Identity\nLast block'), 'Last block');
  assert.equal(identityBlock('no identity'), null);
});

test('hand-drawn copies of components are found by name or last path part; instances and icons are fine', () => {
  const spec = { type: 'frame', name: 'Sign in', children: [{ type: 'row', name: 'input' }, { name: 'Card', children: [{ type: 'instance', component: 'Card', name: 'Card' }] }, { type: 'icon', icon: 'lucide:mail', name: 'mail' }] };
  const w = lookalikes(spec, catalog);
  assert.equal(w.length, 2);
  assert.match(w[0], /spec\.children\[0\] "input" .* "Forms\/Input" exists .*"variant":\{"State":"Default"\}.*"props":\{"Label":"Email","Show icon":false\}/);
  assert.match(w[1], /spec\.children\[1\] "Card"/);
  assert.equal(usesInstances(spec), true);
  assert.equal(usesInstances({ type: 'frame', children: [{ type: 'text', text: 'x' }] }), false);
  assert.equal(instanceExample(catalog[1]), '{"type":"instance","component":"Card"}');
});
