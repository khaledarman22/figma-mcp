// The user's marks on the references board: shapes drawn over a reference image say "take this part".
// Each mark becomes a crop of the original image at its full resolution, handed to the designer as
// pixels — the design is built from what the user pointed at, not from a description of it.

import { getNodeSafe } from './ctx.ts';
import { badRequest } from './errors.ts';

/** The image area of a board frame, built by the references tool as a free (non-auto-layout) frame. */
const CANVAS = /^Reference ([A-Z]{1,2})(\d*)$/;
const DEFAULT_NAME = /^(Rectangle|Ellipse|Polygon|Star|Vector|Frame|Line|Arrow|Group|Section)( \d+)?$/i;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const boxOf = (n: SceneNode): Box | null => {
  const b = n.absoluteBoundingBox;
  return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
};

function intersect(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w >= 4 && h >= 4 ? { x, y, w, h } : null;
}

const inside = (p: { x: number; y: number }, b: Box) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** "hero: the headline" → section + what to take; a plain name is what to take. */
export function parseLabel(raw: string): { label: string; section?: string; take?: string } {
  const label = raw.trim();
  const m = label.match(/^([^:：]{1,40})[:：]\s*(.+)$/);
  return m ? { label, section: m[1].trim(), take: m[2].trim() } : { label, take: label || undefined };
}

async function referencesPage(): Promise<PageNode | null> {
  const page = figma.root.children.find((p) => p.getPluginData('role') === 'references') ?? figma.root.children.find((p) => p.name.trim().toLowerCase() === 'references');
  if (page) await page.loadAsync();
  return page ?? null;
}

function walk(n: BaseNode, fn: (n: SceneNode) => void) {
  if ('children' in n) for (const c of (n as ChildrenMixin).children) {
    fn(c);
    walk(c, fn);
  }
}

/** Pixel width of the image behind a node's image fill (0 when unknown). */
async function naturalWidth(n: SceneNode): Promise<number> {
  const fills = 'fills' in n && Array.isArray(n.fills) ? (n.fills as Paint[]) : [];
  const img = fills.find((f): f is ImagePaint => f.type === 'IMAGE' && !!f.imageHash);
  if (!img?.imageHash) return 0;
  try {
    return (await figma.getImageByHash(img.imageHash)?.getSizeAsync())?.width ?? 0;
  } catch {
    return 0;
  }
}

/** A part the agent chose to take: which reference image, and where, as fractions of the image. */
export interface Region {
  ref: string;
  section?: string;
  take?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const MARK_COLOR = { r: 1, g: 0.42, b: 0.1 };

/** Draws the agent's choices as marks on the board (replacing its earlier ones), so the user sees and can move them. */
function drawRegions(canvases: Array<{ node: FrameNode; key: string }>, regions: Region[]): string[] {
  const problems: string[] = [];
  const touched = new Set<string>();
  for (const r of regions) {
    const c = canvases.find((k) => k.key === r.ref.trim().toUpperCase()) ?? canvases.find((k) => k.key.replace(/\d+$/, '') === r.ref.trim().toUpperCase());
    if (!c) {
      problems.push(`no reference "${r.ref}" on this board`);
      continue;
    }
    if (!touched.has(c.node.id)) {
      for (const old of c.node.children.filter((k) => k.getPluginData('autoMark') === '1')) old.remove();
      touched.add(c.node.id);
    }
    const clamp = (v: number) => Math.min(1, Math.max(0, Number(v) || 0));
    const x = clamp(r.x), y = clamp(r.y);
    const w = Math.min(clamp(r.w), 1 - x), h = Math.min(clamp(r.h), 1 - y);
    if (w * c.node.width < 4 || h * c.node.height < 4) {
      problems.push(`region on ${r.ref} is too small`);
      continue;
    }
    const mark = figma.createRectangle();
    c.node.appendChild(mark);
    mark.name = [r.section, r.take].filter(Boolean).join(': ') || 'part';
    mark.setPluginData('autoMark', '1');
    mark.x = x * c.node.width;
    mark.y = y * c.node.height;
    mark.resize(w * c.node.width, h * c.node.height);
    mark.fills = [{ type: 'SOLID', color: MARK_COLOR, opacity: 0.08 }];
    mark.strokes = [{ type: 'SOLID', color: MARK_COLOR }];
    mark.strokeWeight = 3;
    mark.dashPattern = [12, 8];
  }
  return problems;
}

/** The image tiles of a canvas: one image, or a tall full-page screenshot split into stacked tiles. */
const TILE = /^Image( \d+)?$/;

export async function referenceMarks(p: { within?: string; letters?: string[]; maxPx?: number; regions?: Region[]; list?: boolean }) {
  let root: BaseNode & ChildrenMixin;
  if (p.within) {
    const n = await getNodeSafe(p.within);
    if (!n || !('children' in n)) throw badRequest(`"${p.within}" is not a section or frame on the References page.`);
    root = n as BaseNode & ChildrenMixin;
  } else {
    const page = await referencesPage();
    if (!page) throw badRequest('There is no References page yet — put references on the board first (references tool).');
    root = page;
  }
  const page = (() => {
    let n: BaseNode | null = root;
    while (n && n.type !== 'PAGE') n = n.parent;
    return n as PageNode | null;
  })();

  const canvases: Array<{ node: FrameNode; letter: string; key: string; ref: string; board: string; box: Box; tiles: SceneNode[] }> = [];
  walk(root, (n) => {
    const m = n.name.match(CANVAS);
    if (!m || n.type !== 'FRAME' || !n.children.length) return;
    if (p.letters?.length && !p.letters.map((l) => l.toUpperCase()).includes(m[1])) return;
    const box = boxOf(n);
    const frame = n.parent && n.parent.parent && 'name' in n.parent.parent ? n.parent.parent : null;
    let board = '';
    for (let q: BaseNode | null = n.parent; q; q = q.parent) if (q.type === 'SECTION') {
      board = q.name;
      break;
    }
    const tiles = n.children.filter((k) => TILE.test(k.name) && k.getPluginData('autoMark') !== '1');
    if (box) canvases.push({ node: n, letter: m[1], key: `${m[1]}${m[2]}`, ref: frame?.name ?? n.name, board, box, tiles: tiles.length ? tiles : [n.children[0]] });
  });
  if (!canvases.length) throw badRequest('No reference images found to mark. The board is made by the references tool (frames "A – …" with a "Reference A" image area).');
  const problems = p.regions?.length ? drawRegions(canvases, p.regions) : [];

  // Marks: shapes inside an image area (other than the image), or drawn over one on the page/section.
  const marks: SceneNode[] = [];
  const labels: TextNode[] = [];
  const canvasSet = new Set(canvases.map((c) => c.node.id));
  const images = new Set(canvases.flatMap((c) => c.tiles.map((t) => t.id)));
  const scope = page ?? root;
  walk(scope, (n) => {
    if (images.has(n.id) || canvasSet.has(n.id) || !n.visible) return;
    if (n.type === 'TEXT') return void labels.push(n);
    if (n.type === 'SECTION') return;
    const box = boxOf(n);
    if (!box || box.w < 4 || box.h < 4) return;
    // Board frames themselves and their own parts (letter, caption, image rows) are not marks.
    if (n.type === 'FRAME' && (/^[A-Z]{1,2} [–-] /.test(n.name) || n.name === 'Images')) return;
    if (canvases.some((c) => intersect(box, c.box) && !(box.w >= c.box.w - 1 && box.h >= c.box.h - 1))) marks.push(n);
  });
  // A shape nested in another mark (e.g. a group) counts once, as the outer one.
  const ids = new Set(marks.map((m) => m.id));
  const top = marks.filter((m) => {
    for (let q = m.parent; q; q = q.parent) if (ids.has(q.id)) return false;
    return true;
  });

  const labelOf = (m: SceneNode) => {
    const mb = boxOf(m)!;
    const text = labels.find((t) => {
      const tb = boxOf(t);
      return tb && inside({ x: tb.x + tb.w / 2, y: tb.y + tb.h / 2 }, mb);
    });
    return !DEFAULT_NAME.test(m.name.trim()) ? m.name : text?.characters ?? '';
  };
  if (p.list) {
    // Only what is marked where — for checking that every section has a reference, without rendering crops.
    const marked = top.flatMap((m) => canvases.filter((c) => intersect(boxOf(m)!, c.box)).map((c) => ({ letter: c.letter, board: c.board, ...parseLabel(labelOf(m)), auto: m.getPluginData('autoMark') === '1' || undefined })));
    return { marks: marked, problems, references: canvases.map((c) => ({ letter: c.letter, board: c.board, reference: c.ref })) };
  }

  const maxPx = p.maxPx ?? 2000;
  const crops: Array<Record<string, unknown>> = [];
  const unmarked = canvases.filter((c) => !top.some((m) => intersect(boxOf(m)!, c.box))).map((c) => c.letter);
  for (const m of top) {
    const mb = boxOf(m)!;
    for (const c of canvases) {
      const area = intersect(mb, c.box);
      if (!area) continue;
      const raw = labelOf(m);
      // Crop = a clipping frame over a copy of the image; the mark itself is not in it.
      const tmp = figma.createFrame();
      try {
        tmp.name = 'figma-mcp crop (temporary)';
        tmp.fills = [];
        tmp.clipsContent = true;
        tmp.resize(area.w, area.h);
        tmp.x = area.x;
        tmp.y = area.y;
        for (const tile of c.tiles) {
          const tb = boxOf(tile);
          if (!tb || !intersect(tb, area)) continue;
          const copy = tile.clone();
          tmp.appendChild(copy);
          copy.x = tb.x - area.x;
          copy.y = tb.y - area.y;
        }
        // Export at the source image's resolution (the board shows it scaled down), within maxPx.
        const natural = await naturalWidth(c.tiles[0]);
        const sourceScale = natural ? natural / c.box.w : 2;
        const scale = Math.max(0.1, Math.min(sourceScale, 4, maxPx / Math.max(area.w, area.h)));
        const bytes = await tmp.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
        crops.push({
          letter: c.letter,
          reference: c.ref,
          board: c.board,
          markId: m.id,
          ...parseLabel(raw),
          auto: m.getPluginData('autoMark') === '1' || undefined,
          // Where it sits in the reference, as fractions of its width/height.
          region: { x: +((area.x - c.box.x) / c.box.w).toFixed(3), y: +((area.y - c.box.y) / c.box.h).toFixed(3), w: +(area.w / c.box.w).toFixed(3), h: +(area.h / c.box.h).toFixed(3) },
          px: { w: Math.round(area.w * scale), h: Math.round(area.h * scale) },
          data: figma.base64Encode(bytes),
        });
      } finally {
        tmp.remove();
      }
    }
  }
  return { crops, unmarked, problems, references: canvases.map((c) => ({ letter: c.letter, reference: c.ref, id: c.node.id })) };
}
