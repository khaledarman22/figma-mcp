// Structure review of a build spec on a design page: auto layout everywhere, sections as component instances,
// repeated parts as components. Notes only — the build itself is never refused for these.

import { newIssues, normalizeSpec, type Spec } from '../shared/spec.ts';

const CONTAINER = new Set(['frame', 'component']);
const sectionKey = (name: string) => name.toLowerCase().replace(/^.*[–—-]\s*/, '').replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();

/** A shape signature: type, direction and children, without content — siblings with the same one repeat a part. */
function shapeOf(s: Spec, depth = 0): string {
  if (depth > 3) return s.type;
  return `${s.type}${s.dir ? `:${s.dir}` : ''}(${(s.children ?? []).map((k) => shapeOf(k, depth + 1)).join(',')})`;
}

export function structureNotes(raw: unknown, sections: string[] = []): string[] {
  let spec: Spec;
  try {
    spec = normalizeSpec(raw, 'spec', newIssues());
  } catch {
    return [];
  }
  const free: string[] = [];
  const repeated: string[] = [];
  const walk = (s: Spec, path: string) => {
    const kids = s.children ?? [];
    // No auto layout and two or more laid-out parts positioned by x/y (overlays marked absolute are fine).
    if (CONTAINER.has(s.type) && s.dir === 'none' && kids.filter((k) => !k.absolute && k.type !== 'image' && k.type !== 'rect' && k.type !== 'ellipse').length >= 2) free.push(s.name ?? path);
    const seen = new Map<string, string[]>();
    for (const k of kids) {
      if (!CONTAINER.has(k.type) || !(k.children ?? []).length) continue;
      const key = shapeOf(k);
      seen.set(key, [...(seen.get(key) ?? []), k.name ?? '?']);
    }
    for (const names of seen.values()) if (names.length >= 2) repeated.push(`${names[0]} ×${names.length}`);
    kids.forEach((k, i) => walk(k, `${path}.children[${i}]`));
  };
  walk(spec, 'spec');

  // Sections: the root itself or its direct children, when they are planned sections (or children of a screen).
  const planned = new Set(sections.map(sectionKey));
  const isSection = (s: Spec, top: boolean) => CONTAINER.has(s.type) && s.type !== 'component' && (planned.has(sectionKey(s.name ?? '')) || (top && !!spec.device && !planned.size));
  const plain = [spec, ...(spec.children ?? [])].filter((s, i) => isSection(s, i > 0) && (s.children ?? []).length).map((s) => s.name ?? '?');

  const notes: string[] = [];
  if (free.length) notes.push(`Not auto layout: ${free.join(', ')} — parts placed by x/y. Use row/column (with gap, padding, alignment); only overlays (a background, a badge on a photo) are absolute.`);
  if (plain.length) notes.push(`Built as plain frames, not components: ${plain.join(', ')}. Make each section a component first (create_component "Section/<Name>", with Dir/Device variants when it needs them) and put an instance on the page — see design-system.md, Component first.`);
  if (repeated.length) notes.push(`Repeated as plain frames: ${repeated.join(', ')} — make it a component and use instances.`);
  return notes;
}
