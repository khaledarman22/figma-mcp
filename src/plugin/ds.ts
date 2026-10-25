// One-call overview of the file's design system: variables, styles, components, libraries.

import { round } from '../shared/util.ts';
import { readStyles } from './styles.ts';
import { readVariables } from './variables.ts';

/** Instances of a component (all variants of a set): total, and those in design pages (not Components/References/Trash). */
async function usageOf(n: ComponentNode | ComponentSetNode): Promise<{ instances: number; inDesigns: number }> {
  const parts = n.type === 'COMPONENT_SET' ? (n.children.filter((c) => c.type === 'COMPONENT') as ComponentNode[]) : [n];
  let instances = 0;
  let inDesigns = 0;
  for (const c of parts) {
    for (const inst of await c.getInstancesAsync()) {
      let page: BaseNode | null = inst.parent;
      while (page && page.type !== 'PAGE') page = page.parent;
      const role = page ? (page as PageNode).getPluginData('role') : '';
      if (role === 'trash') continue;
      instances++;
      if (!role) inDesigns++;
    }
  }
  return { instances, inDesigns };
}

export async function listComponents(p: { query?: string; limit?: number; usage?: boolean } = {}) {
  await figma.loadAllPagesAsync();
  const q = p.query?.toLowerCase();
  const limit = p.limit ?? 400;
  const out: Array<Record<string, unknown>> = [];
  let total = 0;
  for (const page of figma.root.children) {
    if (page.getPluginData('role') === 'trash') continue;
    for (const n of page.findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] })) {
      if (n.type === 'COMPONENT' && n.parent?.type === 'COMPONENT_SET') continue;
      if (q && !n.name.toLowerCase().includes(q)) continue;
      total++;
      if (out.length >= limit) continue;
      const defs = n.componentPropertyDefinitions;
      const axes: Record<string, string[]> = {};
      const props: Record<string, string> = {};
      for (const [k, d] of Object.entries(defs)) {
        if (d.type === 'VARIANT') axes[k] = d.variantOptions ?? [];
        else props[k.split('#')[0]] = `${d.type.toLowerCase()}=${JSON.stringify(d.defaultValue)}`;
      }
      const sample = n.type === 'COMPONENT_SET' ? n.defaultVariant ?? (n.children[0] as ComponentNode) : n;
      out.push({
        id: n.id,
        key: n.key,
        name: n.name,
        kind: n.type === 'COMPONENT_SET' ? 'set' : 'component',
        page: page.name,
        ...(n.description ? { description: n.description } : {}),
        ...(Object.keys(axes).length ? { axes } : {}),
        ...(Object.keys(props).length ? { props } : {}),
        ...(n.type === 'COMPONENT_SET' ? { variants: n.children.length } : {}),
        size: sample ? `${round(sample.width)}×${round(sample.height)}` : undefined,
        // Icons are used through other components and screens all the time; counting them is noise.
        ...(p.usage && !/^icon\//i.test(n.name) ? await usageOf(n) : {}),
      });
    }
  }
  return { components: out, total };
}

export async function designSystem(p: { include?: string[]; query?: string }) {
  const include = new Set(p.include?.length ? p.include : ['variables', 'styles', 'components']);
  const res: Record<string, unknown> = {
    file: figma.root.name,
    pages: figma.root.children.map((pg) => pg.name),
  };
  if (include.has('variables')) res.variables = await readVariables({ includeLibraries: true });
  if (include.has('styles')) res.styles = await readStyles();
  if (include.has('components')) res.components = await listComponents({ query: p.query });
  return res;
}
