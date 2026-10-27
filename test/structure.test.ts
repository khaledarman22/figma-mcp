import assert from 'node:assert/strict';
import { test } from 'node:test';
import { structureNotes } from '../src/server/structure.ts';

const card = (n: string) => ({ type: 'column', name: 'Card', children: [{ type: 'text', text: n }, { type: 'text', text: 'body' }] });

test('structure review: free positioning, sections as plain frames, repeated frames', () => {
  const page = {
    type: 'frame', name: 'Home', device: 'desktop', children: [
      { type: 'instance', component: 'Section/Nav' },
      { type: 'frame', name: 'Hero', dir: 'none', children: [{ type: 'image', name: 'Bg', absolute: true }, { type: 'text', text: 'a', x: 10, y: 10 }, { type: 'row', name: 'Actions', x: 10, y: 90, children: [{ type: 'text', text: 'b' }] }] },
      { type: 'column', name: 'Services', children: [{ type: 'row', name: 'Grid', children: [card('1'), card('2'), card('3')] }] },
    ],
  };
  const notes = structureNotes(page, ['nav', 'hero', 'services']);
  assert.match(notes.join('\n'), /Not auto layout: Hero/);
  assert.match(notes.join('\n'), /Built as plain frames, not components: Hero, Services/);
  assert.match(notes.join('\n'), /Repeated as plain frames: Card ×3/);

  // A clean page: instances of section components, auto layout, a free frame with only an overlay.
  const clean = { type: 'frame', name: 'Home', device: 'desktop', children: [{ type: 'instance', component: 'Section/Hero' }, { type: 'frame', name: 'Badge holder', dir: 'none', children: [{ type: 'image', name: 'Photo' }, { type: 'text', text: 'x', absolute: true }] }] };
  assert.deepEqual(structureNotes(clean, ['hero']), []);
  // Without a sections list, the direct frame children of a screen count as sections.
  assert.match(structureNotes({ type: 'frame', name: 'Home', device: 'desktop', children: [{ type: 'column', name: 'Pricing', children: [{ type: 'text', text: 'x' }] }] }).join(), /Pricing/);
});
