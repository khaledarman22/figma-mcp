// Screenshots (for the agent's eyes) and asset exports (bytes go to the MCP server, which writes files).

import { Ctx } from './ctx.ts';
import { badRequest } from './errors.ts';

export interface ScreenshotParams {
  nodeId?: string;
  nodeIds?: string[];
  scale?: number;
  maxPx?: number;
  format?: 'PNG' | 'JPG';
}

export async function screenshot(p: ScreenshotParams) {
  const ctx = new Ctx();
  let nodes: SceneNode[] = [];
  const ids = p.nodeIds?.length ? p.nodeIds : p.nodeId ? [p.nodeId] : [];
  if (ids.length) for (const id of ids.slice(0, 6)) nodes.push(await ctx.sceneNode(id));
  else if (figma.currentPage.selection.length) nodes = figma.currentPage.selection.slice(0, 6);
  else throw badRequest('Pass nodeId (or select a layer in Figma). Use get_metadata to find ids.');
  const maxPx = p.maxPx ?? 1280;
  const out = [];
  for (const n of nodes) {
    const longest = Math.max(n.width, n.height, 1);
    const scale = Math.max(0.05, Math.min(p.scale ?? 2, maxPx / longest));
    try {
      const bytes = await deadline(n.exportAsync({ format: p.format ?? 'PNG', constraint: { type: 'SCALE', value: scale } }), 30_000, `rendering "${n.name}"`);
      out.push({ nodeId: n.id, name: n.name, type: n.type, w: Math.round(n.width), h: Math.round(n.height), scale: Math.round(scale * 1000) / 1000, format: p.format ?? 'PNG', data: figma.base64Encode(bytes) });
    } catch (e) {
      out.push({ nodeId: n.id, name: n.name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { images: out };
}

export interface ExportItem {
  nodeId: string;
  format?: 'PNG' | 'JPG' | 'SVG' | 'PDF';
  scale?: number;
  original?: boolean;
  outlineText?: boolean;
  name?: string;
}

/** Figma's export/bytes promises occasionally never settle; give each item its own deadline. */
function deadline<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${Math.round(ms / 1000)}s — skipped`)), ms);
  });
  const done = () => timer !== undefined && clearTimeout(timer);
  return Promise.race([work, late]).then(
    (v) => {
      done();
      return v;
    },
    (e) => {
      done();
      throw e;
    },
  );
}

function sniff(bytes: Uint8Array): 'png' | 'jpg' | 'gif' | 'webp' | 'bin' {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'gif';
  if (bytes[8] === 0x57 && bytes[9] === 0x45) return 'webp';
  return 'bin';
}

export async function exportNodes(p: { items: ExportItem[] }) {
  const ctx = new Ctx();
  if (!p.items?.length) throw badRequest('items is empty.');
  const out = [];
  for (const item of p.items.slice(0, 60)) {
    const n = await ctx.sceneNode(item.nodeId);
    const name = item.name ?? n.name;
    try {
      if (item.original) {
        const fills = 'fills' in n && Array.isArray((n as MinimalFillsMixin).fills) ? ((n as MinimalFillsMixin).fills as Paint[]) : [];
        const img = fills.find((f) => f.type === 'IMAGE' && f.imageHash) as ImagePaint | undefined;
        if (img?.imageHash) {
          const image = figma.getImageByHash(img.imageHash);
          const bytes = image ? await deadline(image.getBytesAsync(), 20_000, `reading the image of "${n.name}"`).catch(() => null) : null;
          if (bytes) {
            out.push({ nodeId: n.id, name, ext: sniff(bytes), data: figma.base64Encode(bytes) });
            continue;
          }
        }
      }
      const format = item.format ?? 'PNG';
      let bytes: Uint8Array;
      const what = `exporting "${n.name}" as ${format}`;
      if (format === 'SVG') bytes = await deadline(n.exportAsync({ format: 'SVG', svgOutlineText: item.outlineText ?? true, svgIdAttribute: false, svgSimplifyStroke: true }), 30_000, what);
      else if (format === 'PDF') bytes = await deadline(n.exportAsync({ format: 'PDF' }), 30_000, what);
      else bytes = await deadline(n.exportAsync({ format, constraint: { type: 'SCALE', value: item.scale ?? 2 } }), 30_000, what);
      out.push({ nodeId: n.id, name, ext: format.toLowerCase(), data: figma.base64Encode(bytes) });
    } catch (e) {
      out.push({ nodeId: n.id, name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { files: out };
}
