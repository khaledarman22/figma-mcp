// File organization: pages by purpose (English names, created only when first used), a Components
// page that holds every component, a Trash page instead of destructive deletes, and image
// placeholders that carry generation prompts until the real images arrive.

import { getNodeSafe } from './ctx.ts';
import { badRequest, notFound } from './errors.ts';
import { pageOf } from './inspect.ts';

export type PageRole = 'components' | 'trash' | 'references';

const ROLE_NAMES: Record<PageRole, string> = { components: 'Components', trash: 'Trash', references: 'References' };

/** Pages this tool created (removed again when they end up empty). */
const CREATED_BY = 'figma-mcp';

/** "🧩 Components" ≈ "components" ≈ "Component" */
const normName = (s: string) =>
  s
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
    .replace(/s$/, '');

const isBlankDefault = (p: PageNode) => /^page \d+$/i.test(p.name.trim()) && p.children.length === 0;

/** Content pages first, then the system pages; Trash is always last. */
const PAGE_ORDER: Array<[RegExp, number]> = [
  [/^(cover|thumbnail)/, 0],
  [/^(app|mobile|ios|android)/, 10],
  [/^(web|website|landing|site)/, 20],
  [/^(dashboard|admin|panel|backoffice)/, 30],
  [/^(banner|marketing|social|ads?)\b/, 40],
  [/^(component|design system|icon|asset)/, 80],
  [/^(reference|moodboard|inspiration)/, 90],
  [/^(archive)/, 95],
  [/^(trash)/, 100],
];

function pageRank(name: string): number {
  const n = normName(name);
  for (const [re, rank] of PAGE_ORDER) if (re.test(n)) return rank;
  return 50; // other content pages: before the system pages
}

/**
 * The page with this name (or role), created on demand. A file that only has an untouched
 * "Page 1" gets that page renamed instead of keeping an empty page around.
 */
/** A neutral gray canvas on the pages this tool makes, so white screens and components stand out. */
const CANVAS: Paint[] = [{ type: 'SOLID', color: { r: 0.831, g: 0.831, b: 0.831 } }];

export async function ensurePage(name: string, role?: PageRole): Promise<{ page: PageNode; created: boolean }> {
  const clean = name.trim();
  if (!clean) throw badRequest('page name is empty.');
  if (role) {
    const byRole = figma.root.children.find((p) => p.getPluginData('role') === role);
    if (byRole) {
      await byRole.loadAsync();
      return { page: byRole, created: false };
    }
  }
  const byName = figma.root.children.find((p) => normName(p.name) === normName(clean));
  if (byName) {
    await byName.loadAsync();
    if (role) byName.setPluginData('role', role);
    return { page: byName, created: false };
  }
  for (const p of figma.root.children) await p.loadAsync();
  const blank = figma.root.children.length === 1 ? figma.root.children.find(isBlankDefault) : undefined;
  if (blank) {
    blank.name = clean;
    if (role) blank.setPluginData('role', role);
    blank.setPluginData('createdBy', CREATED_BY);
    if (role !== 'trash') blank.backgrounds = CANVAS;
    return { page: blank, created: false };
  }
  const page = figma.createPage();
  page.name = clean;
  if (role) page.setPluginData('role', role);
  page.setPluginData('createdBy', CREATED_BY);
  if (role !== 'trash') page.backgrounds = CANVAS;
  const rank = pageRank(clean);
  const pages = figma.root.children.filter((p) => p !== page);
  const at = pages.findIndex((p) => pageRank(p.name) > rank);
  if (at >= 0) figma.root.insertChild(at, page);
  return { page, created: true };
}

export const rolePage = (role: PageRole) => ensurePage(ROLE_NAMES[role], role);

export const isTrashPage = (p: PageNode | null | undefined) => !!p && p.getPluginData('role') === 'trash';

/** Removes a page this tool created once nothing is left on it (never a page the user made). */
async function dropIfEmpty(page: PageNode | null): Promise<boolean> {
  if (!page || page.removed || page.children.length || page.getPluginData('createdBy') !== CREATED_BY) return false;
  if (figma.root.children.length < 2) return false;
  if (figma.currentPage === page) {
    const other = figma.root.children.find((p) => p !== page && !isTrashPage(p)) ?? figma.root.children.find((p) => p !== page);
    if (!other) return false;
    await figma.setCurrentPageAsync(other);
  }
  page.remove();
  return true;
}

/** Free canvas space: right of what is already there (inside a section: clear of its title). */
export function freeSpot(container: BaseNode & ChildrenMixin, exclude?: SceneNode): { x: number; y: number } {
  let right = -Infinity;
  let top = Infinity;
  for (const c of container.children) {
    if (c === exclude) continue;
    right = Math.max(right, c.x + c.width);
    top = Math.min(top, c.y);
  }
  if (Number.isFinite(right)) return { x: Math.round(right + 120), y: Math.round(top) };
  return container.type === 'SECTION' ? { x: SECTION_MARGIN, y: SECTION_MARGIN + 40 } : { x: 0, y: 0 };
}

const SECTION_MARGIN = 80;

/** Sections do not grow by themselves: make room for everything inside them. */
export function fitSections(within: BaseNode & ChildrenMixin) {
  for (const c of within.children) {
    if (c.type !== 'SECTION') continue;
    fitSections(c);
    let right = 0;
    let bottom = 0;
    for (const k of c.children) {
      right = Math.max(right, k.x + k.width);
      bottom = Math.max(bottom, k.y + k.height);
    }
    const w = Math.max(c.width, right + SECTION_MARGIN);
    const h = Math.max(c.height, bottom + SECTION_MARGIN);
    if (c.children.length && (w > c.width || h > c.height)) c.resizeWithoutConstraints(w, h);
  }
}

// ───────────── Trash ─────────────

interface TrashOrigin {
  pageId: string;
  pageName: string;
  parentId: string;
  parentName: string;
  index: number;
  x: number;
  y: number;
  at: string;
}

/** Moves layers to the Trash page (restorable) instead of deleting them. */
export async function trashNodes(nodes: SceneNode[]): Promise<{ trashed: string[]; page: string; removedPages: string[] }> {
  if (!nodes.length) return { trashed: [], page: 'Trash', removedPages: [] };
  const { page } = await rolePage('trash');
  const out: string[] = [];
  const sources = new Set<PageNode>();
  for (const n of nodes) {
    if (n.removed) continue;
    const parent = n.parent;
    const from = pageOf(n);
    if (from === page) {
      out.push(n.id);
      continue; // already in the trash
    }
    if (!parent || parent.type === 'INSTANCE') throw badRequest(`"${n.name}" (${n.id}) is part of an instance and cannot be moved; change its main component or hide it.`);
    const origin: TrashOrigin = {
      pageId: from?.id ?? '',
      pageName: from?.name ?? '',
      parentId: parent.id,
      parentName: parent.name,
      index: 'children' in parent ? (parent as ChildrenMixin).children.indexOf(n) : 0,
      x: Math.round(n.x),
      y: Math.round(n.y),
      at: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    const spot = freeSpot(page);
    page.appendChild(n);
    n.x = spot.x;
    n.y = spot.y;
    n.setPluginData('trash', JSON.stringify(origin));
    if (from) sources.add(from);
    out.push(n.id);
  }
  const removedPages: string[] = [];
  for (const p of sources) {
    const name = p.name;
    if (await dropIfEmpty(p)) removedPages.push(name);
  }
  return { trashed: out, page: page.name, removedPages };
}

/** Puts trashed layers back where they came from (or into another parent). */
export async function restoreNodes(nodes: SceneNode[], parentOverride?: BaseNode & ChildrenMixin): Promise<Array<{ id: string; to: string }>> {
  const out: Array<{ id: string; to: string }> = [];
  let trash: PageNode | null = null;
  for (const n of nodes) {
    const raw = n.getPluginData('trash');
    if (!raw && !parentOverride) throw badRequest(`"${n.name}" (${n.id}) is not in the Trash.`);
    const origin: Partial<TrashOrigin> = raw ? JSON.parse(raw) : {};
    if (isTrashPage(pageOf(n))) trash = pageOf(n);
    let parent: (BaseNode & ChildrenMixin) | null = parentOverride ?? null;
    if (!parent && origin.parentId) {
      const p = await getNodeSafe(origin.parentId);
      if (p && 'appendChild' in p && !p.removed && !isTrashPage(pageOf(p))) parent = p as BaseNode & ChildrenMixin;
    }
    if (!parent && origin.pageId) {
      const p = await getNodeSafe(origin.pageId);
      if (p && p.type === 'PAGE' && !p.removed) {
        await (p as PageNode).loadAsync();
        parent = p as PageNode;
      }
    }
    if (!parent && origin.pageName) parent = (await ensurePage(origin.pageName)).page; // its page was removed when it emptied
    if (!parent) throw notFound(`The original place of "${n.name}" no longer exists; pass a parent to restore it into.`);
    const idx = Math.min(origin.index ?? parent.children.length, parent.children.length);
    parent.insertChild(idx, n);
    const auto = 'layoutMode' in parent && (parent as FrameNode).layoutMode !== 'NONE';
    if (!auto) {
      n.x = origin.x ?? n.x;
      n.y = origin.y ?? n.y;
    }
    n.setPluginData('trash', '');
    out.push({ id: n.id, to: `${parent.name} (${parent.id})` });
  }
  await dropIfEmpty(trash);
  return out;
}

// ───────────── image placeholders & prompts ─────────────

export interface PlaceholderInfo {
  nodeId: string;
  imageId: string;
  name: string;
  page: string;
  screen?: string;
  path: string;
  w: number;
  h: number;
  prompt: string;
}

const PLACEHOLDER_ROLE = 'image-placeholder';
const CAPTION_ROLE = 'placeholder-caption';

function nextImageId(): string {
  const n = Number(figma.root.getPluginData('imageCounter') || '0') + 1;
  figma.root.setPluginData('imageCounter', String(n));
  return `IMG-${String(n).padStart(3, '0')}`;
}

function promptKey(prompt: string): string {
  const s = prompt.trim().toLowerCase().replace(/\s+/g, ' ');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Same prompt → same IMG id, so one generated image fills every place that uses it. */
export function imageIdFor(prompt: string): string {
  const key = promptKey(prompt);
  let reg: Record<string, string> = {};
  try {
    reg = JSON.parse(figma.root.getPluginData('imageIds') || '{}');
  } catch {
    /* reset a damaged registry */
  }
  if (reg[key]) return reg[key];
  const id = nextImageId();
  reg[key] = id;
  figma.root.setPluginData('imageIds', JSON.stringify(reg));
  return id;
}

export const isPlaceholderBox = (n: BaseNode) => n.type === 'FRAME' && (n.getPluginData('role') === PLACEHOLDER_ROLE || n.name === 'Image placeholder');

/** The prompt of a layer that still needs its image ('' when it does not). */
export function neededPrompt(n: BaseNode): string | null {
  if (n.type !== 'FRAME' && n.type !== 'RECTANGLE') return null;
  const prompt = n.getPluginData('prompt') || n.getPluginData('placeholder');
  if (prompt) return prompt;
  return isPlaceholderBox(n) ? '' : null;
}

/** Marks a frame/rectangle as needing a generated image (new placeholder or an image to replace). */
export async function setImagePrompt(n: SceneNode, prompt: string, loadFont: (f: FontName) => Promise<void>): Promise<string> {
  if (n.type !== 'FRAME' && n.type !== 'RECTANGLE') throw badRequest(`prompt: only frames and rectangles hold images ("${n.name}" is a ${n.type.toLowerCase()}).`);
  const id = imageIdFor(prompt);
  n.setPluginData('prompt', prompt.trim());
  n.setPluginData('imageId', id);
  if (n.type === 'FRAME') {
    const caption = n.children.find((c) => c.type === 'TEXT' && c.getPluginData('role') === CAPTION_ROLE) as TextNode | undefined;
    if (caption) {
      await loadFont(caption.fontName as FontName);
      caption.characters = captionText(n.getPluginData('placeholder') || n.name, id);
    }
  }
  return id;
}

export const captionText = (label: string, imageId: string) => {
  const l = label && !/^image( placeholder)?$/i.test(label) ? label : 'Image';
  return imageId ? `${l}\n${imageId}` : l;
};

export async function addCaption(f: FrameNode, text: string, font: FontName, loadFont: (f: FontName) => Promise<void>): Promise<TextNode> {
  await loadFont(font);
  const t = figma.createText();
  f.appendChild(t);
  t.fontName = font;
  t.characters = text;
  t.fontSize = 12;
  t.fills = [{ type: 'SOLID', color: { r: 0.29, g: 0.29, b: 0.29 } }]; // ≈6:1 on the gray box (WCAG AA)
  t.textAlignHorizontal = 'CENTER';
  t.textAutoResize = 'HEIGHT';
  t.layoutSizingHorizontal = 'FILL';
  t.name = 'Caption';
  t.setPluginData('role', CAPTION_ROLE);
  return t;
}

/** Every layer still waiting for its image (with its prompt) in the file or a subtree; each gets a stable IMG id. */
export async function listPlaceholders(p: { within?: string; allPages?: boolean }) {
  const roots: Array<BaseNode & ChildrenMixin> = [];
  if (p.within) {
    const n = await getNodeSafe(p.within);
    if (!n || !('children' in n)) throw notFound(`within ${p.within}: not found or has no children.`);
    roots.push(n as BaseNode & ChildrenMixin);
  } else if (p.allPages !== false) {
    await figma.loadAllPagesAsync();
    roots.push(...figma.root.children.filter((pg) => !isTrashPage(pg)));
  } else roots.push(figma.currentPage);
  const out: PlaceholderInfo[] = [];
  for (const root of roots) {
    const nodes = (root as ChildrenMixin).findAllWithCriteria({ types: ['FRAME', 'RECTANGLE'] });
    for (const n of nodes) {
      if (n.id.includes(';')) continue; // inside an instance: the main component's own layer is listed
      const prompt = neededPrompt(n);
      if (prompt === null) continue;
      let imageId = n.getPluginData('imageId');
      if (!imageId) {
        imageId = prompt ? imageIdFor(prompt) : nextImageId();
        n.setPluginData('imageId', imageId);
      }
      const path: string[] = [];
      let par = n.parent;
      let screen: string | undefined;
      while (par && par.type !== 'PAGE') {
        path.unshift(par.name);
        if (par.parent?.type === 'PAGE' || par.parent?.type === 'SECTION') screen = par.name;
        par = par.parent;
      }
      out.push({ nodeId: n.id, imageId, name: n.name, page: pageOf(n)?.name ?? '', screen, path: path.join(' / '), w: Math.round(n.width), h: Math.round(n.height), prompt });
    }
  }
  return { placeholders: out };
}

const SCALE = { fill: 'FILL', fit: 'FIT', crop: 'CROP', tile: 'TILE' } as const;

/**
 * Puts the real image into every layer that waited for it. A gray placeholder becomes a plain image
 * layer (caption removed); an existing frame keeps its overlays (gradients, translucent fills) on top.
 */
export async function placeImage(p: { ids: string[]; imageData: string; fit?: keyof typeof SCALE }) {
  const image = figma.createImage(figma.base64Decode(p.imageData));
  const paint: ImagePaint = { type: 'IMAGE', imageHash: image.hash, scaleMode: SCALE[p.fit ?? 'fill'] };
  const placed: Array<{ id: string; name: string }> = [];
  for (const id of p.ids) {
    const n = await getNodeSafe(id);
    if (!n || (n.type !== 'FRAME' && n.type !== 'RECTANGLE')) throw notFound(`image target ${id} not found (frame or rectangle).`);
    const box = isPlaceholderBox(n);
    const keep = box
      ? []
      : (Array.isArray(n.fills) ? (n.fills as Paint[]) : []).filter((f) => f.visible !== false && f.type !== 'IMAGE' && !(f.type === 'SOLID' && (f.opacity ?? 1) >= 1));
    n.fills = [paint, ...keep];
    if (n.type === 'FRAME' && n.layoutMode !== 'NONE') {
      // Keep the box's size once the caption is gone.
      if (n.layoutSizingHorizontal === 'HUG') n.layoutSizingHorizontal = 'FIXED';
      if (n.layoutSizingVertical === 'HUG') n.layoutSizingVertical = 'FIXED';
    }
    if (n.type === 'FRAME') {
      for (const c of [...n.children]) {
        if (c.type === 'TEXT' && (c.getPluginData('role') === CAPTION_ROLE || (box && n.children.length === 1))) c.remove();
      }
    }
    const prompt = n.getPluginData('prompt') || n.getPluginData('placeholder');
    n.setPluginData('imagePrompt', prompt);
    n.setPluginData('prompt', '');
    n.setPluginData('placeholder', '');
    if (n.getPluginData('role') === PLACEHOLDER_ROLE) n.setPluginData('role', '');
    if (/^image placeholder$/i.test(n.name)) n.name = 'Image';
    placed.push({ id: n.id, name: n.name });
  }
  return { placed };
}

/* ---------- the Components page: one auto layout stack ---------- */

const STACK_ROLE = 'components-stack';
export const isComponentsStack = (n: BaseNode | null | undefined) => !!n && 'getPluginData' in n && n.getPluginData('role') === STACK_ROLE;

/** Where an item sits in the stack: the icons board first, then components, then the page sections ("Section/…"). */
const stackRank = (n: SceneNode) => (n.getPluginData('role') === 'icons' ? 0 : /^sections?\//i.test(n.name) ? 2 : 1);
const isStackItem = (n: SceneNode) => n.type === 'COMPONENT' || n.type === 'COMPONENT_SET' || n.getPluginData('role') === 'icons';

/**
 * The main auto layout frame of the Components page — every component goes in it, one under the other. Made on
 * first use; components already on the page move into it (top to bottom as they were), anything else on the page
 * moves out of its way.
 */
export async function componentsStack(): Promise<FrameNode> {
  const { page } = await rolePage('components');
  const found = page.children.find(isComponentsStack) as FrameNode | undefined;
  if (found) return found;
  const items = page.children.filter(isStackItem).sort((a, b) => a.y - b.y || a.x - b.x);
  const others = page.children.filter((n) => !isStackItem(n));
  const f = figma.createFrame();
  f.name = 'Components';
  f.setPluginData('role', STACK_ROLE);
  f.layoutMode = 'VERTICAL';
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'AUTO';
  f.counterAxisAlignItems = 'MIN';
  f.itemSpacing = 96;
  f.paddingTop = f.paddingBottom = f.paddingLeft = f.paddingRight = 80;
  f.fills = [];
  f.clipsContent = false;
  page.appendChild(f);
  f.x = items.length ? Math.min(...items.map((n) => n.x)) : 0;
  f.y = items.length ? Math.min(...items.map((n) => n.y)) : 0;
  for (const n of [...items].sort((a, b) => stackRank(a) - stackRank(b))) f.appendChild(n);
  // Boards that are not components (Identity, Foundations…) keep their layout, to the right of the stack.
  const left = others.length ? Math.min(...others.map((n) => n.x)) : 0;
  const shift = f.x + f.width + 200 - left;
  if (others.length && shift > 0 && others.some((n) => n.x < f.x + f.width && n.y < f.y + f.height && n.y + n.height > f.y)) for (const n of others) n.x += shift;
  return f;
}

/** Puts a component (set) or the icons board into the stack, in its place: after the last item of its kind. */
export async function fileInStack(n: SceneNode): Promise<void> {
  const stack = await componentsStack();
  const rank = stackRank(n);
  const kids = stack.children.filter((k) => k !== n);
  let at = kids.length;
  for (let i = 0; i < kids.length; i++) if (stackRank(kids[i]) > rank) {
    at = i;
    break;
  }
  stack.insertChild(at, n);
  if ('layoutPositioning' in n) n.layoutPositioning = 'AUTO';
}
