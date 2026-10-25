// iPhone screens look like the phone: the display's corner radius, a dark bezel drawn as an outside
// stroke (the frame keeps its exact device size, so prototypes and code are unaffected), and the status
// bar (with the Dynamic Island) and home indicator as instances of "Device/iPhone/…" components.
// Also the page canvas color, set once so screens stand out from the page.

import { getNodeSafe } from './ctx.ts';
import { freeSpot, rolePage } from './pages.ts';

export const CHROME_ROLE = 'device-chrome';
const MOCKUP_KEY = 'mockup';
const BEZEL = { r: 0.043, g: 0.043, b: 0.047 };
/** Around a dark screen the bezel is a shade lighter, so the phone's edge stays visible. */
const BEZEL_ON_DARK = { r: 0.2, g: 0.2, b: 0.216 };
const BEZEL_WIDTH = 12;
const STATUS_H = 54;
const HOME = { w: 139, h: 5, bottom: 8 };

/** Display corner radius per iPhone preset (points). Devices without one get no mockup. */
const RADIUS: Record<string, number> = {
  mobile: 55, 'iphone-16': 55, 'iphone-15': 55, 'iphone-14': 47, 'iphone-13': 47, 'iphone-16-plus': 55,
  'iphone-16-pro': 62, 'iphone-16-pro-max': 62, 'iphone-17': 62, 'iphone-17-pro': 62, 'iphone-17-pro-max': 62,
};
/** iPhones without the Dynamic Island (notch): the status bar draws no island. */
const NOTCH = new Set(['iphone-14', 'iphone-13']);

export const isMockupDevice = (device?: string) => !!device && device in RADIUS;
export const isChrome = (n: BaseNode) => 'getPluginData' in n && n.getPluginData('role') === CHROME_ROLE;
export const hasMockup = (n: BaseNode) => 'getPluginData' in n && !!n.getPluginData(MOCKUP_KEY);

// ───────────── chrome components ─────────────

const SIGNAL = '<svg width="18" height="12" viewBox="0 0 18 12" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>';
const WIFI = '<svg width="16" height="12" viewBox="0 0 16 12" xmlns="http://www.w3.org/2000/svg"><path d="M8 2.3c2.3 0 4.3.9 5.8 2.3l1.1-1.1A9.6 9.6 0 0 0 8 .7 9.6 9.6 0 0 0 1.1 3.5l1.1 1.1A8 8 0 0 1 8 2.3Zm0 3.3c1.4 0 2.6.5 3.5 1.4l1.1-1.2A6.5 6.5 0 0 0 8 4a6.5 6.5 0 0 0-4.6 1.8l1.1 1.2c.9-.9 2.1-1.4 3.5-1.4Zm0 3.2c-.5 0-1 .2-1.3.5L8 10.6l1.3-1.3c-.3-.3-.8-.5-1.3-.5Z"/></svg>';
const BATTERY = '<svg width="27" height="13" viewBox="0 0 27 13" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="23" height="12" rx="3.8" fill="none" stroke="#000" stroke-opacity="0.35"/><rect x="2" y="2" width="20" height="9" rx="2.5"/><path d="M25 4.4v4.2c.8-.3 1.4-1.2 1.4-2.1S25.8 4.7 25 4.4Z" fill-opacity="0.4"/></svg>';

function tint(node: SceneNode, color: RGB) {
  const recolor = (paints: readonly Paint[]) => paints.map((p) => (p.type === 'SOLID' ? { ...p, color } : p));
  if ('fills' in node && Array.isArray(node.fills)) node.fills = recolor(node.fills as Paint[]);
  if ('strokes' in node && node.strokes.length) node.strokes = recolor(node.strokes);
  if ('children' in node) for (const c of node.children) tint(c, color);
}

// Inter ships with Figma; locally installed SF Pro can render with zero-width glyphs in plugins.
async function timeFont(): Promise<FontName> {
  try {
    await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
    return { family: 'Inter', style: 'Semi Bold' };
  } catch {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    return { family: 'Inter', style: 'Regular' };
  }
}

async function statusBarVariant(style: 'Dark' | 'Light', island: boolean): Promise<ComponentNode> {
  const color = style === 'Dark' ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 };
  const c = figma.createComponent();
  c.name = `Style=${style}`;
  c.layoutMode = 'HORIZONTAL';
  c.primaryAxisAlignItems = 'SPACE_BETWEEN';
  c.counterAxisAlignItems = 'CENTER';
  c.paddingLeft = 40;
  c.paddingRight = 30;
  c.paddingTop = 6;
  c.fills = [];
  c.resize(393, STATUS_H);
  c.layoutSizingVertical = 'FIXED';
  const time = figma.createText();
  time.fontName = await timeFont();
  time.characters = '9:41';
  time.fontSize = 17;
  time.fills = [{ type: 'SOLID', color }];
  time.name = 'Time';
  c.appendChild(time);
  time.textAutoResize = 'WIDTH_AND_HEIGHT';
  const right = figma.createFrame();
  right.name = 'Levels';
  right.layoutMode = 'HORIZONTAL';
  right.itemSpacing = 6;
  right.counterAxisAlignItems = 'CENTER';
  right.fills = [];
  right.layoutSizingHorizontal = 'HUG';
  right.layoutSizingVertical = 'HUG';
  for (const [name, svg] of [['Signal', SIGNAL], ['Wi-Fi', WIFI], ['Battery', BATTERY]] as const) {
    const v = figma.createNodeFromSvg(svg);
    v.name = name;
    v.fills = [];
    tint(v, color);
    right.appendChild(v);
  }
  c.appendChild(right);
  if (island) {
    const pill = figma.createRectangle();
    pill.name = 'Dynamic Island';
    pill.resize(125, 37);
    pill.cornerRadius = 18.5;
    pill.fills = [{ type: 'SOLID', color: BEZEL }];
    c.appendChild(pill);
    pill.layoutPositioning = 'ABSOLUTE';
    pill.x = (393 - 125) / 2;
    pill.y = 11;
    pill.constraints = { horizontal: 'CENTER', vertical: 'MIN' };
  }
  return c;
}

async function homeVariant(style: 'Dark' | 'Light'): Promise<ComponentNode> {
  const c = figma.createComponent();
  c.name = `Style=${style}`;
  c.resize(HOME.w, HOME.h);
  c.cornerRadius = 100;
  c.fills = [{ type: 'SOLID', color: style === 'Dark' ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 } }];
  return c;
}

/** The chrome component sets, created on the Components page the first time a screen needs them. */
async function chromeSet(kind: 'status' | 'status-notch' | 'home'): Promise<ComponentSetNode> {
  let reg: Record<string, string> = {};
  try {
    reg = JSON.parse(figma.root.getPluginData('deviceChrome') || '{}');
  } catch {
    /* rebuild a damaged registry */
  }
  const known = reg[kind] ? await getNodeSafe(reg[kind]) : null;
  if (known && known.type === 'COMPONENT_SET' && !known.removed) return known;
  const { page } = await rolePage('components');
  const variants = kind === 'home' ? [await homeVariant('Dark'), await homeVariant('Light')] : [await statusBarVariant('Dark', kind === 'status'), await statusBarVariant('Light', kind === 'status')];
  for (const v of variants) page.appendChild(v);
  const set = figma.combineAsVariants(variants, page);
  set.name = kind === 'home' ? 'Device/iPhone/Home indicator' : kind === 'status' ? 'Device/iPhone/Status bar' : 'Device/iPhone/Status bar (notch)';
  set.description = 'Device chrome added by figma-mcp to iPhone screens (mockup). Not part of the product UI: code ignores it.';
  set.layoutMode = 'HORIZONTAL';
  set.itemSpacing = 24;
  set.paddingTop = set.paddingBottom = set.paddingLeft = set.paddingRight = 24;
  set.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.62 } }];
  set.layoutSizingHorizontal = 'HUG';
  set.layoutSizingVertical = 'HUG';
  const spot = freeSpot(page, set);
  set.x = spot.x;
  set.y = spot.y;
  reg[kind] = set.id;
  figma.root.setPluginData('deviceChrome', JSON.stringify(reg));
  return set;
}

// ───────────── applying the mockup ─────────────

function luminance(n: SceneNode): number {
  const fill = 'fills' in n && Array.isArray(n.fills) ? (n.fills as Paint[]).find((p) => p.visible !== false && p.type === 'SOLID') as SolidPaint | undefined : undefined;
  if (!fill) return 1;
  const { r, g, b } = fill.color;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function addAbsolute(screen: FrameNode, inst: InstanceNode) {
  screen.appendChild(inst);
  if (screen.layoutMode !== 'NONE') inst.layoutPositioning = 'ABSOLUTE';
}

/** Turns an iPhone-sized screen into the phone look (on) or back into a plain frame (off). */
export async function applyMockup(screen: FrameNode, device: string, on = true): Promise<string[]> {
  const warnings: string[] = [];
  for (const c of [...screen.children]) if (isChrome(c)) c.remove();
  if (!on || !isMockupDevice(device)) {
    if (hasMockup(screen)) {
      screen.strokes = [];
      screen.cornerRadius = 0;
      screen.setPluginData(MOCKUP_KEY, '');
    }
    return warnings;
  }
  screen.cornerRadius = RADIUS[device];
  screen.clipsContent = true;
  const style = luminance(screen) < 0.5 ? 'Light' : 'Dark';
  screen.strokes = [{ type: 'SOLID', color: style === 'Light' ? BEZEL_ON_DARK : BEZEL }];
  screen.strokeWeight = BEZEL_WIDTH;
  screen.strokeAlign = 'OUTSIDE';
  screen.setPluginData(MOCKUP_KEY, device);
  const status = await chromeSet(NOTCH.has(device) ? 'status-notch' : 'status');
  const bar = (status.children.find((v) => v.name === `Style=${style}`) as ComponentNode).createInstance();
  bar.name = 'Status bar';
  bar.setPluginData('role', CHROME_ROLE);
  addAbsolute(screen, bar);
  bar.resize(screen.width, STATUS_H);
  bar.x = 0;
  bar.y = 0;
  bar.constraints = { horizontal: 'STRETCH', vertical: 'MIN' };
  const home = await chromeSet('home');
  const ind = (home.children.find((v) => v.name === `Style=${style}`) as ComponentNode).createInstance();
  ind.name = 'Home indicator';
  ind.setPluginData('role', CHROME_ROLE);
  addAbsolute(screen, ind);
  ind.x = Math.round((screen.width - HOME.w) / 2);
  ind.y = screen.height - HOME.bottom - HOME.h;
  ind.constraints = { horizontal: 'CENTER', vertical: 'MAX' };
  if (screen.layoutMode !== 'NONE' && screen.paddingTop < STATUS_H) warnings.push(`"${screen.name}": content starts under the status bar (top padding ${screen.paddingTop} < ${STATUS_H}) — pad the top or start with a header that leaves room for it.`);
  return warnings;
}

/** The iPhone screen (with mockup) a layer sits in. */
export function mockupScreenOf(n: BaseNode | null): FrameNode | null {
  for (let p = n; p && p.type !== 'PAGE'; p = p.parent) if (p.type === 'FRAME' && hasMockup(p)) return p;
  return null;
}

/** Chrome stays on top after layers are added to a mocked-up screen. */
export function keepChromeOnTop(screen: FrameNode | null) {
  if (!screen) return;
  for (const c of screen.children.filter(isChrome)) screen.appendChild(c);
  const ind = screen.children.find((c) => isChrome(c) && c.name === 'Home indicator');
  if (ind) ind.y = screen.height - HOME.bottom - HOME.h;
}

// ───────────── page canvas ─────────────

const FIGMA_DEFAULT_CANVAS = [{ r: 0.96, g: 0.96, b: 0.96 }, { r: 0.898, g: 0.898, b: 0.898 }, { r: 0.118, g: 0.118, b: 0.118 }];

/**
 * The first design on a page sets its canvas to a neutral that makes the screens stand out
 * (darker gray behind light screens, light gray behind dark ones). A canvas the user picked is kept.
 */
export function ensureCanvas(page: PageNode | null, sample?: SceneNode) {
  if (!page || page.getPluginData('canvas')) return;
  const bg = page.backgrounds.find((p) => p.type === 'SOLID') as SolidPaint | undefined;
  const isDefault = !bg || FIGMA_DEFAULT_CANVAS.some((d) => Math.abs(d.r - bg.color.r) < 0.02 && Math.abs(d.g - bg.color.g) < 0.02 && Math.abs(d.b - bg.color.b) < 0.02);
  if (!isDefault) {
    page.setPluginData('canvas', 'user');
    return;
  }
  const light = sample ? luminance(sample) >= 0.5 : true;
  const color = light ? { r: 0.8, g: 0.8, b: 0.827 } : { r: 0.91, g: 0.91, b: 0.925 };
  page.backgrounds = [{ type: 'SOLID', color }];
  page.setPluginData('canvas', 'auto');
}

/** A canvas color chosen explicitly (edit {op: "page", background}). */
export function setCanvas(page: PageNode, color: RGB) {
  page.backgrounds = [{ type: 'SOLID', color }];
  page.setPluginData('canvas', 'user');
}
