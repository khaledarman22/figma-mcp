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
    return { page: blank, created: false };
  }
  const page = figma.createPage();
  page.name = clean;
  if (role) page.setPluginData('role', role);
  page.setPluginData('createdBy', CREATED_BY);
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
  /** The user supplies this image (logo, product photo) instead of generating it. */
  supply?: boolean;
  /** The top-level frame (screen) the layer sits in, for previews. */
  screenId?: string;
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
export function imageIdFor(prompt: string, supply = false): string {
  const key = (supply ? 's:' : '') + promptKey(prompt);
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
export async function setImagePrompt(n: SceneNode, prompt: string, loadFont: (f: FontName) => Promise<void>, supply = false): Promise<string> {
  if (n.type !== 'FRAME' && n.type !== 'RECTANGLE') throw badRequest(`${supply ? 'supply' : 'prompt'}: only frames and rectangles hold images ("${n.name}" is a ${n.type.toLowerCase()}).`);
  const id = imageIdFor(prompt, supply);
  n.setPluginData('prompt', prompt.trim());
  n.setPluginData('supply', supply ? '1' : '');
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
      const supply = n.getPluginData('supply') === '1';
      let imageId = n.getPluginData('imageId');
      if (!imageId) {
        imageId = prompt ? imageIdFor(prompt, supply) : nextImageId();
        n.setPluginData('imageId', imageId);
      }
      const path: string[] = [];
      let par = n.parent;
      let screen: string | undefined;
      let screenId: string | undefined;
      while (par && par.type !== 'PAGE') {
        path.unshift(par.name);
        if ((par.parent?.type === 'PAGE' || par.parent?.type === 'SECTION') && par.type !== 'SECTION') {
          screen = par.name;
          screenId = par.id;
        }
        par = par.parent;
      }
      out.push({ nodeId: n.id, imageId, name: n.name, page: pageOf(n)?.name ?? '', screen, path: path.join(' / '), w: Math.round(n.width), h: Math.round(n.height), prompt, ...(supply ? { supply } : {}), ...(screenId ? { screenId } : {}) });
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
    n.setPluginData('supply', '');
    n.setPluginData('placeholder', '');
    if (n.getPluginData('role') === PLACEHOLDER_ROLE) n.setPluginData('role', '');
    if (/^image placeholder$/i.test(n.name)) n.name = 'Image';
    placed.push({ id: n.id, name: n.name });
  }
  return { placed };
}

// ───────────── the component board ─────────────

const BOARD_ROLE = 'component-board';
export const ICONS_ROLE = 'icons';

const isAuto = (n: SceneNode): n is FrameNode => n.type === 'FRAME' && n.layoutMode !== 'NONE';
const holdsComponents = (f: FrameNode) =>
  f.children.some((c) => c.type === 'COMPONENT' || c.type === 'COMPONENT_SET' || (c.type === 'FRAME' && c.children.some((g) => g.type === 'COMPONENT' || g.type === 'COMPONENT_SET')));

/**
 * The one auto-layout board on the Components page that holds every component, in category
 * frames. Adopts the board the file already has (an auto-layout frame holding components);
 * created on first use otherwise.
 */
export async function componentBoard(): Promise<FrameNode> {
  const { page } = await rolePage('components');
  const marked = page.children.find((c) => c.getPluginData('role') === BOARD_ROLE);
  if (marked && isAuto(marked)) return marked;
  const adopt = page.children.find((c): c is FrameNode => isAuto(c) && c.getPluginData('role') !== ICONS_ROLE && holdsComponents(c));
  if (adopt) {
    adopt.setPluginData('role', BOARD_ROLE);
    return adopt;
  }
  const spot = freeSpot(page);
  const f = figma.createFrame();
  f.name = 'Components';
  f.setPluginData('role', BOARD_ROLE);
  f.layoutMode = 'VERTICAL';
  f.itemSpacing = 64;
  f.paddingTop = f.paddingBottom = f.paddingLeft = f.paddingRight = 64;
  f.fills = [];
  page.appendChild(f);
  f.layoutSizingHorizontal = 'HUG';
  f.layoutSizingVertical = 'HUG';
  f.x = spot.x;
  f.y = spot.y;
  return f;
}

/** A named auto-layout category inside the board ("Forms", "Icons"…), created on first use. */
export async function componentCategory(name: string): Promise<FrameNode> {
  const board = await componentBoard();
  const want = normName(name);
  const found = board.children.find((c): c is FrameNode => isAuto(c) && normName(c.name) === want);
  if (found) return found;
  const f = figma.createFrame();
  f.name = name.trim();
  f.layoutMode = 'HORIZONTAL';
  f.itemSpacing = 32;
  f.counterAxisAlignItems = 'MIN';
  f.fills = [];
  board.appendChild(f);
  f.layoutSizingHorizontal = 'HUG';
  f.layoutSizingVertical = 'HUG';
  return f;
}

/** Where a new main component goes: its category ("Forms/Input" → Forms), else the board itself. */
export async function componentHome(name: string): Promise<FrameNode> {
  const group = name.includes('/') ? name.split('/')[0].trim() : '';
  if (group && !/^icon$/i.test(group)) return componentCategory(group);
  if (/^icon\//i.test(name)) return iconBoard();
  return componentBoard();
}

/**
 * The Icons category of the board: a wrapping auto-layout frame of icon components. An Icons
 * frame left loose on the Components page by an older version moves into the board.
 */
export async function iconBoard(): Promise<FrameNode> {
  const board = await componentBoard();
  const isIcons = (c: SceneNode): c is FrameNode => c.type === 'FRAME' && c.getPluginData('role') === ICONS_ROLE;
  let icons = board.children.find(isIcons) ?? board.children.find((c): c is FrameNode => isAuto(c) && normName(c.name) === 'icon');
  if (!icons) {
    await figma.loadAllPagesAsync();
    for (const pg of figma.root.children) {
      if (isTrashPage(pg)) continue;
      icons = pg.children.find(isIcons);
      if (icons) break;
    }
  }
  if (!icons) {
    icons = figma.createFrame();
    icons.name = 'Icons';
    icons.layoutMode = 'HORIZONTAL';
    icons.layoutWrap = 'WRAP';
    icons.itemSpacing = 16;
    icons.counterAxisSpacing = 16;
    icons.fills = [];
    icons.resize(360, 100);
  }
  icons.setPluginData('role', ICONS_ROLE);
  if (icons.parent !== board) {
    board.appendChild(icons);
    icons.layoutPositioning = 'AUTO';
  }
  if (icons.layoutMode === 'NONE') icons.layoutMode = 'HORIZONTAL';
  if (icons.layoutWrap === 'WRAP') icons.layoutSizingHorizontal = 'FIXED';
  else icons.layoutSizingHorizontal = 'HUG';
  icons.layoutSizingVertical = 'HUG';
  return icons;
}

