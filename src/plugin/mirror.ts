// Mirror a layout between right-to-left and left-to-right (Arabic ↔ English): rows reverse their flow, alignment,
// padding and free positions flip, text alignment swaps, directional icons swap to their counterpart, and
// instances switch their Dir variant. Text content is not translated.

import { dirOf } from './build.ts';
import type { Ctx } from './ctx.ts';

const FLIP = { MIN: 'MAX', MAX: 'MIN' } as const;
const DIR_PROP = /^(dir|direction)$/i;
/** icon/lucide/arrow-left ↔ icon/lucide/arrow-right, chevron-left, arrow-up-left, … */
const otherSide = (name: string) => (/left|right/.test(name) ? name.replace(/left|right/g, (m) => (m === 'left' ? 'right' : 'left')) : null);

async function iconComponents(): Promise<Map<string, ComponentNode>> {
  const map = new Map<string, ComponentNode>();
  for (const page of figma.root.children) {
    if (page.getPluginData('role') !== 'components' && page.name !== 'Components') continue;
    await page.loadAsync();
    for (const c of page.findAllWithCriteria({ types: ['COMPONENT'] })) if (c.name.startsWith('icon/')) map.set(c.name, c);
  }
  return map;
}

export async function mirrorNodes(nodes: SceneNode[], ctx: Ctx, dir?: 'rtl' | 'ltr') {
  let icons: Map<string, ComponentNode> | undefined;
  const missingIcons = new Set<string>();
  const counts = { rows: 0, columns: 0, free: 0, texts: 0, icons: 0, instances: 0 };

  // Children of a group are positioned in the group's parent space; of a frame, in the frame's.
  const flipX = (k: SceneNode, width: number, origin = 0) => {
    k.x = 2 * origin + width - k.x - k.width;
    if ('constraints' in k) {
      const h = k.constraints.horizontal;
      if (h === 'MIN' || h === 'MAX') k.constraints = { ...k.constraints, horizontal: FLIP[h] };
    }
  };

  async function visit(n: SceneNode): Promise<void> {
    if (n.type === 'TEXT') {
      const a = n.textAlignHorizontal;
      if (a === 'LEFT' || a === 'RIGHT') {
        await ctx.loadFontsIn(n);
        n.textAlignHorizontal = a === 'LEFT' ? 'RIGHT' : 'LEFT';
        counts.texts++;
      }
      return;
    }
    if (n.type === 'INSTANCE') {
      const main = await n.getMainComponentAsync();
      const other = main && otherSide(main.name);
      if (main?.name.startsWith('icon/')) {
        if (!other) return; // not directional: stays as it is
        icons ??= await iconComponents();
        const swap = icons.get(other);
        if (swap) {
          n.swapComponent(swap);
          counts.icons++;
        } else missingIcons.add(other);
        return;
      }
      if (!main) return;
      // An instance cannot be rearranged here: switch its Dir variant, or say its component needs one.
      const key = Object.keys(n.componentProperties).find((k) => DIR_PROP.test(k.replace(/#.*$/, '')) && n.componentProperties[k].type === 'VARIANT');
      const set = main?.parent?.type === 'COMPONENT_SET' ? main.parent : null;
      if (key && set) {
        const options = set.variantGroupProperties[key.replace(/#.*$/, '')]?.values ?? [];
        const now = String(n.componentProperties[key].value);
        const next = options.find((v) => v !== now && /^(rtl|ltr|ar|en|arabic|english)$/i.test(v)) ?? options.find((v) => v !== now);
        if (next) {
          n.setProperties({ [key]: next });
          counts.instances++;
          return;
        }
      }
      ctx.warn(`"${n.name}" (${n.id}) is an instance of "${set?.name ?? main?.name ?? '?'}" — it can't be rearranged here. Mirror its component and add a Dir variant (RTL/LTR), then mirror this again.`);
      return;
    }
    if (!('children' in n)) return;
    if (n.type === 'GROUP' || n.type === 'BOOLEAN_OPERATION') {
      if (n.type === 'GROUP') for (const k of n.children) flipX(k, n.width, n.x);
      for (const k of n.children) await visit(k);
      return;
    }
    const f = n as FrameNode;
    const mode = 'layoutMode' in f ? f.layoutMode : 'NONE';
    if (mode === 'HORIZONTAL') {
      // Reverse the flow, keep the stacking order of absolutely positioned layers.
      const kids = [...f.children];
      const slots = kids.map((k, i) => ('layoutPositioning' in k && k.layoutPositioning === 'ABSOLUTE' ? -1 : i)).filter((i) => i >= 0);
      const flow = slots.map((i) => kids[i]).reverse();
      const order = [...kids];
      slots.forEach((slot, j) => (order[slot] = flow[j]));
      order.forEach((k, i) => f.insertChild(i, k));
      if (f.primaryAxisAlignItems === 'MIN' || f.primaryAxisAlignItems === 'MAX') f.primaryAxisAlignItems = FLIP[f.primaryAxisAlignItems];
      counts.rows++;
    } else if (mode === 'VERTICAL') {
      if (f.counterAxisAlignItems === 'MIN' || f.counterAxisAlignItems === 'MAX') f.counterAxisAlignItems = FLIP[f.counterAxisAlignItems];
      counts.columns++;
    } else if (mode === 'GRID') {
      // Cells mirror across the columns: by layer order (auto flow) or by their column (manual placement).
      const cols = f.gridColumnCount;
      const flow = f.children.filter((k) => !('layoutPositioning' in k && k.layoutPositioning === 'ABSOLUTE'));
      if (f.gridItemsPositioning === 'ROW_AUTO_FLOW') {
        const order: SceneNode[] = [];
        for (let r = 0; r < flow.length; r += cols) order.push(...flow.slice(r, r + cols).reverse());
        order.forEach((k, i) => f.insertChild(i, k));
      } else {
        for (const k of flow) {
          const g = k as SceneNode & GridChildrenMixin;
          try {
            g.setGridChildPosition(g.gridRowAnchorIndex, Math.max(0, cols - g.gridColumnAnchorIndex - (g.gridColumnSpan || 1)));
          } catch {
            ctx.warn(`"${k.name}" (${k.id}) in grid "${f.name}" could not be moved to its mirrored cell.`);
          }
        }
      }
      counts.rows++;
    }
    if (mode === 'NONE') {
      for (const k of f.children) flipX(k, f.width);
      if (f.children.length) counts.free++;
    } else {
      for (const k of f.children) if ('layoutPositioning' in k && k.layoutPositioning === 'ABSOLUTE') flipX(k, f.width);
      const l = f.paddingLeft;
      f.paddingLeft = f.paddingRight;
      f.paddingRight = l;
    }
    for (const k of f.children) await visit(k);
  }

  for (const n of nodes) {
    const before = dirOf(n);
    await visit(n);
    const next = dir ?? (before === undefined ? undefined : before ? 'ltr' : 'rtl');
    if (next) n.setPluginData('dir', next);
  }
  if (missingIcons.size) ctx.warn(`No icon component for ${[...missingIcons].join(', ')} — add it (build an icon with that name) and mirror again, or swap those icons by hand.`);
  return counts;
}

/**
 * A Dir variant for components: each component (or every variant of a set) gets a mirrored twin, "Dir=LTR" beside
 * "Dir=RTL" (or the reverse) — instances then switch direction with the property, and mirror flips them.
 */
export async function addDirVariants(nodes: SceneNode[], ctx: Ctx, dir?: 'rtl' | 'ltr') {
  const out: Array<{ set: string; added: string[] }> = [];
  for (const n of nodes) {
    const main = n.type === 'INSTANCE' ? await n.getMainComponentAsync() : n;
    const target = main?.type === 'COMPONENT' && main.parent?.type === 'COMPONENT_SET' ? main.parent : main;
    if (!target || (target.type !== 'COMPONENT' && target.type !== 'COMPONENT_SET')) {
      ctx.warn(`"${n.name}" (${n.id}) is not a component — make it one first (create_component, or edit to-component).`);
      continue;
    }
    const set = target.type === 'COMPONENT_SET' ? target : null;
    if (set && Object.keys(set.variantGroupProperties).some((k) => DIR_PROP.test(k))) {
      ctx.warn(`"${set.name}" already has a Dir variant.`);
      continue;
    }
    const singleName = target.name;
    const originals = set ? (set.children.filter((c) => c.type === 'COMPONENT') as ComponentNode[]) : [target as ComponentNode];
    const from = dirOf(originals[0]) ?? (dir === 'rtl' ? false : true); // unknown → the original is RTL
    const fromName = from ? 'RTL' : 'LTR';
    const toName = from ? 'LTR' : 'RTL';
    const twins: ComponentNode[] = [];
    for (const c of originals) {
      const twin = c.clone();
      (set ?? c.parent!).appendChild(twin as SceneNode);
      await mirrorNodes([twin], ctx, from ? 'ltr' : 'rtl');
      const base = set ? c.name : '';
      twin.name = base ? `${base}, Dir=${toName}` : `Dir=${toName}`;
      c.name = base ? `${base}, Dir=${fromName}` : `Dir=${fromName}`;
      c.setPluginData('dir', from ? 'rtl' : 'ltr');
      twins.push(twin);
    }
    let result: ComponentSetNode;
    if (set) result = set;
    else {
      const single = originals[0];
      const { x, y } = single;
      result = figma.combineAsVariants([single, ...twins], single.parent as BaseNode & ChildrenMixin);
      result.name = singleName;
      if (single.description) result.description = single.description;
      result.x = x;
      result.y = y;
    }
    // Lay the twins out beside their originals: one column per direction.
    if (result.layoutMode === 'NONE') {
      const right = Math.max(...originals.map((c) => c.x + c.width));
      twins.forEach((t, i) => {
        t.x = right + 48 + (originals[i].x - Math.min(...originals.map((c) => c.x)));
        t.y = originals[i].y;
      });
      const pad = 24;
      const w = Math.max(...result.children.map((c) => c.x + c.width)) + pad;
      const h = Math.max(...result.children.map((c) => c.y + c.height)) + pad;
      result.resizeWithoutConstraints(w, h);
    }
    out.push({ set: `${result.name} (${result.id})`, added: twins.map((t) => t.name) });
  }
  return out;
}
