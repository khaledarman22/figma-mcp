// The declarative node spec used by `build`, `edit` (set/insert) and `create_component`.
//
// Agents write loose JSON (CSS-ish names, shorthands, aliases). `normalizeSpec` turns it into a
// canonical shape and reports problems with a JSON path, so a bad call fails fast with every
// mistake listed at once instead of half-building a frame in the user's file.

import { deepMerge, didYouMean, isPlainObject } from './util.ts';

export type NodeType =
  | 'frame'
  | 'component'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'polygon'
  | 'star'
  | 'svg'
  | 'icon'
  | 'image'
  | 'instance'
  | 'group'
  | 'section';

/** A number or a variable reference ("$space/4", "$Tokens:space/4"). */
export type Num = number | string;
export type Size = number | string; // number | "$token" | "fill" | "hug"

export interface FontSpec {
  family?: string;
  style?: string;
  weight?: number;
  italic?: boolean;
  size?: Num;
  lineHeight?: Num; // px number | "150%" | "auto" | token
  letterSpacing?: Num; // px number | "-2%" | token
  case?: 'original' | 'upper' | 'lower' | 'title' | 'small-caps' | 'small-caps-forced';
  decoration?: 'none' | 'underline' | 'strike';
}

export interface GradientStop {
  color: string;
  position: number;
}

export type PaintSpec =
  | { kind: 'solid'; color: string; opacity?: number } // color: hex/rgb()/"$var"
  | { kind: 'gradient'; gradient: 'linear' | 'radial' | 'angular' | 'diamond'; angle: number; stops: GradientStop[]; opacity?: number }
  | { kind: 'image'; src?: string; imageData?: string; fit: 'fill' | 'fit' | 'crop' | 'tile'; opacity?: number }
  | { kind: 'style'; name: string }; // "@Paint style name"

export interface StrokeSpec {
  paints: PaintSpec[];
  weight?: Num | [Num, Num, Num, Num];
  align?: 'inside' | 'center' | 'outside';
  dash?: number[];
  cap?: 'none' | 'round' | 'square';
  join?: 'miter' | 'bevel' | 'round';
}

export type EffectSpec =
  | { kind: 'drop-shadow' | 'inner-shadow'; x: Num; y: Num; blur: Num; spread: Num; color: string }
  | { kind: 'layer-blur' | 'background-blur'; radius: Num }
  | { kind: 'style'; name: string };

export interface SegmentSpec {
  text: string;
  font?: FontSpec;
  color?: PaintSpec[];
  link?: string;
}

export type TriggerKind = 'click' | 'hover' | 'press' | 'drag' | 'mouse-enter' | 'mouse-leave' | 'mouse-down' | 'mouse-up' | 'after' | 'key';

export interface TriggerSpec {
  kind: TriggerKind;
  delayMs?: number;
  keyCodes?: number[];
}

export type EasingSpec =
  | { kind: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'ease-in-back' | 'ease-out-back' | 'ease-in-out-back' | 'gentle' | 'quick' | 'bouncy' | 'slow' }
  | { kind: 'bezier'; points: [number, number, number, number] }
  | { kind: 'spring'; mass: number; stiffness: number; damping: number };

export interface TransitionSpec {
  type: 'dissolve' | 'smart-animate' | 'scroll-animate' | 'move-in' | 'move-out' | 'push' | 'slide-in' | 'slide-out';
  direction?: 'left' | 'right' | 'top' | 'bottom';
  durationMs: number;
  easing: EasingSpec;
  matchLayers?: boolean;
}

export type ActionKind = 'navigate' | 'overlay' | 'swap' | 'scroll-to' | 'change-to' | 'back' | 'close' | 'url' | 'set-mode' | 'set-variable';

export interface ActionSpec {
  kind: ActionKind;
  to?: string; // node id, ref, or (for change-to inside components) variant selector string
  url?: string;
  newTab?: boolean;
  transition?: TransitionSpec | null;
  resetScroll?: boolean;
  collection?: string;
  mode?: string;
  variable?: string;
  value?: unknown;
  offset?: { x: number; y: number };
}

export interface InteractionSpec {
  from?: string;
  trigger: TriggerSpec;
  actions: ActionSpec[];
}

export interface Spec {
  type: NodeType;
  name?: string;
  ref?: string;
  description?: string;
  // auto layout container
  dir?: 'row' | 'column' | 'grid' | 'none';
  gap?: Num; // number | token | "auto" (= space between)
  rowGap?: Num;
  colGap?: Num;
  cols?: number;
  rows?: number;
  pad?: [Num, Num, Num, Num];
  align?: 'start' | 'center' | 'end' | 'baseline' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  wrap?: boolean;
  alignContent?: 'auto' | 'between';
  clip?: boolean;
  // size & position
  w?: Size;
  h?: Size;
  minW?: Num;
  maxW?: Num;
  minH?: Num;
  maxH?: Num;
  x?: number;
  y?: number;
  absolute?: boolean;
  constraints?: { h?: 'left' | 'right' | 'center' | 'stretch' | 'scale'; v?: 'top' | 'bottom' | 'center' | 'stretch' | 'scale' };
  rotation?: number;
  cell?: [number, number];
  span?: [number, number];
  // appearance
  fill?: PaintSpec[] | null;
  stroke?: StrokeSpec | null;
  radius?: Num | [Num, Num, Num, Num];
  opacity?: Num;
  blend?: string;
  effects?: EffectSpec[] | null;
  visible?: boolean;
  locked?: boolean;
  modes?: Record<string, string>;
  // text
  text?: string;
  style?: string;
  font?: FontSpec;
  color?: PaintSpec[];
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  valign?: 'top' | 'center' | 'bottom';
  maxLines?: number;
  truncate?: boolean;
  paragraphSpacing?: number;
  segments?: SegmentSpec[];
  link?: string;
  // instance
  component?: string;
  variant?: Record<string, string>;
  props?: Record<string, string | boolean>;
  overrides?: Record<string, Partial<Spec>>;
  // component definition
  bind?: { text?: string; visible?: string; swap?: string };
  // assets
  svg?: string;
  icon?: string;
  size?: number;
  strokeWidth?: number;
  src?: string;
  imageData?: string;
  fit?: 'fill' | 'fit' | 'crop' | 'tile';
  placeholder?: string;
  /** Generation prompt for an image that does not exist yet (collected into IMAGE_PROMPTS.md). */
  prompt?: string;
  /** An image the user supplies (logo, product photo…): what is needed, listed in IMAGE_PROMPTS.md under "from you". */
  supply?: string;
  /** Device/format preset name the frame was sized from (see DEVICES). */
  device?: string;
  /** iPhone screens: the phone look (radius, bezel, status bar, home indicator). Default on for top-level iPhone screens. */
  mockup?: boolean;
  // prototype
  scroll?: 'none' | 'vertical' | 'horizontal' | 'both';
  fixed?: boolean;
  interactions?: InteractionSpec[];
  // misc
  rtl?: boolean;
  annotations?: string[];
  children?: Spec[];
}

export interface Issues {
  errors: string[];
  warnings: string[];
}

export const newIssues = (): Issues => ({ errors: [], warnings: [] });

const CONTAINER_TYPES = new Set<NodeType>(['frame', 'component', 'group', 'section']);

const TYPE_ALIASES: Record<string, [NodeType, Partial<Spec>?]> = {
  frame: ['frame'], box: ['frame'], div: ['frame'], container: ['frame'], view: ['frame'], stack: ['frame'],
  autolayout: ['frame'], 'auto-layout': ['frame'], card: ['frame'], screen: ['frame'], page: ['frame'],
  row: ['frame', { dir: 'row' }], hstack: ['frame', { dir: 'row' }], 'h-stack': ['frame', { dir: 'row' }], horizontal: ['frame', { dir: 'row' }],
  column: ['frame', { dir: 'column' }], col: ['frame', { dir: 'column' }], vstack: ['frame', { dir: 'column' }], 'v-stack': ['frame', { dir: 'column' }], vertical: ['frame', { dir: 'column' }],
  grid: ['frame', { dir: 'grid' }],
  component: ['component'],
  text: ['text'], label: ['text'], heading: ['text'], paragraph: ['text'], p: ['text'], span: ['text'], title: ['text'],
  rect: ['rect'], rectangle: ['rect'], shape: ['rect'],
  ellipse: ['ellipse'], circle: ['ellipse'], oval: ['ellipse'],
  line: ['line'], polygon: ['polygon'], triangle: ['polygon'], star: ['star'],
  svg: ['svg'], vector: ['svg'],
  icon: ['icon'],
  image: ['image'], img: ['image'], photo: ['image'], picture: ['image'],
  instance: ['instance'], use: ['instance'],
  group: ['group'], section: ['section'],
};

/**
 * Exact frame sizes for screens and formats (Figma's presets where Figma has one). One product keeps
 * one size for all its screens; `device` sets w/h unless they are given (h: "hug" for long pages).
 */
export const DEVICES: Record<string, [number, number]> = {
  // phones
  mobile: [393, 852], 'iphone-16': [393, 852], 'iphone-15': [393, 852], 'iphone-16-plus': [430, 932], 'iphone-16-pro': [402, 874],
  'iphone-16-pro-max': [440, 956], 'iphone-17': [402, 874], 'iphone-17-pro': [402, 874], 'iphone-17-pro-max': [440, 956],
  'iphone-14': [390, 844], 'iphone-13': [390, 844], 'iphone-se': [375, 667],
  android: [412, 917], 'android-compact': [412, 917], 'android-small': [360, 800], 'android-medium': [700, 840], 'android-expanded': [1280, 800],
  // tablets
  tablet: [820, 1180], ipad: [820, 1180], 'ipad-mini': [744, 1133], 'ipad-pro-11': [834, 1194], 'ipad-pro-13': [1032, 1376],
  // web / dashboard
  desktop: [1440, 1024], web: [1440, 1024], dashboard: [1440, 1024], laptop: [1280, 832], 'macbook-air': [1280, 832],
  'macbook-pro-14': [1512, 982], 'macbook-pro-16': [1728, 1117], 'desktop-hd': [1920, 1080],
  // social & banners
  'instagram-post': [1080, 1080], 'instagram-portrait': [1080, 1350], 'instagram-story': [1080, 1920], 'facebook-post': [1200, 630],
  'x-post': [1600, 900], 'x-header': [1500, 500], 'linkedin-post': [1200, 627], 'linkedin-banner': [1584, 396],
  'youtube-thumbnail': [1280, 720], 'youtube-banner': [2560, 1440],
  // display ads (IAB)
  'ad-leaderboard': [728, 90], 'ad-billboard': [970, 250], 'ad-medium-rectangle': [300, 250], 'ad-large-rectangle': [336, 280],
  'ad-half-page': [300, 600], 'ad-skyscraper': [160, 600], 'ad-mobile-banner': [320, 50], 'ad-large-mobile-banner': [320, 100],
};

/** Every key the canonical spec understands (after aliasing). */
const KNOWN_KEYS = new Set<string>([
  'type', 'name', 'ref', 'description', 'dir', 'gap', 'rowGap', 'colGap', 'cols', 'rows', 'pad', 'align', 'justify', 'wrap',
  'alignContent', 'clip', 'w', 'h', 'minW', 'maxW', 'minH', 'maxH', 'x', 'y', 'absolute', 'constraints', 'rotation', 'cell', 'span',
  'fill', 'stroke', 'radius', 'opacity', 'blend', 'effects', 'visible', 'locked', 'modes', 'text', 'style', 'font', 'color',
  'textAlign', 'valign', 'maxLines', 'truncate', 'paragraphSpacing', 'segments', 'link', 'component', 'variant', 'props',
  'overrides', 'bind', 'svg', 'icon', 'size', 'strokeWidth', 'src', 'imageData', 'fit', 'placeholder', 'prompt', 'supply', 'device', 'mockup', 'scroll', 'fixed',
  'interactions', 'rtl', 'annotations', 'children',
]);

const KEY_ALIASES: Record<string, string> = {
  kind: 'type', node: 'type', nodeType: 'type',
  width: 'w', height: 'h', minWidth: 'minW', maxWidth: 'maxW', minHeight: 'minH', maxHeight: 'maxH',
  direction: 'dir', layout: 'dir', layoutMode: 'dir', flow: 'dir', flexDirection: 'dir',
  spacing: 'gap', itemSpacing: 'gap', counterAxisSpacing: 'rowGap', rowSpacing: 'rowGap', columnGap: 'colGap', gridColumnGap: 'colGap', gridRowGap: 'rowGap',
  columns: 'cols', gridColumnCount: 'cols', gridRowCount: 'rows',
  padding: 'pad', p: 'pad',
  alignItems: 'align', counterAxisAlignItems: 'align', crossAlign: 'align',
  justifyContent: 'justify', primaryAxisAlignItems: 'justify', mainAlign: 'justify',
  flexWrap: 'wrap', layoutWrap: 'wrap', counterAxisAlignContent: 'alignContent',
  clipsContent: 'clip', clipContent: 'clip',
  fills: 'fill', background: 'fill', bg: 'fill', backgroundColor: 'fill',
  strokes: 'stroke', border: 'stroke', outline: 'stroke',
  cornerRadius: 'radius', borderRadius: 'radius', rounded: 'radius',
  shadow: 'effects', shadows: 'effects', effect: 'effects', boxShadow: 'effects',
  hidden: 'visible',
  blendMode: 'blend', mixBlendMode: 'blend',
  mode: 'modes', variableModes: 'modes',
  characters: 'text', content: 'text', value: 'text',
  textStyle: 'style', typography: 'style',
  textColor: 'color',
  textAlignHorizontal: 'textAlign', verticalAlign: 'valign', textAlignVertical: 'valign',
  lines: 'maxLines', lineClamp: 'maxLines', ellipsis: 'truncate',
  href: 'link', hyperlink: 'link',
  mainComponent: 'component', componentName: 'component', componentKey: 'component',
  variants: 'variant', variantProps: 'variant',
  properties: 'props', componentProperties: 'props',
  imageUrl: 'src', url: 'src', path: 'src', image: 'src',
  scaleMode: 'fit', objectFit: 'fit',
  imagePrompt: 'prompt', generate: 'prompt', provide: 'supply', userImage: 'supply',
  preset: 'device', frameSize: 'device', format: 'device', deviceFrame: 'mockup', chrome: 'mockup',
  overflow: 'scroll', overflowDirection: 'scroll',
  interaction: 'interactions', reactions: 'interactions', prototype: 'interactions',
  kids: 'children', items: 'children', nodes: 'children',
  annotation: 'annotations', notes: 'annotations',
};

const FONT_KEYS: Record<string, keyof FontSpec> = {
  fontFamily: 'family', family: 'family',
  fontStyle: 'style',
  fontWeight: 'weight', weight: 'weight',
  fontSize: 'size',
  lineHeight: 'lineHeight', leading: 'lineHeight',
  letterSpacing: 'letterSpacing', tracking: 'letterSpacing',
  textCase: 'case', textTransform: 'case', case: 'case',
  textDecoration: 'decoration', decoration: 'decoration',
  italic: 'italic',
};

const isToken = (v: unknown): boolean => typeof v === 'string' && v.startsWith('$') && v.length > 1;

// ───────────────────────── primitives ─────────────────────────

function num(v: unknown, path: string, issues: Issues, opts: { token?: boolean; min?: number } = {}): Num | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (opts.min !== undefined && v < opts.min) issues.warnings.push(`${path}: ${v} is below ${opts.min}; clamped.`);
    return opts.min !== undefined ? Math.max(opts.min, v) : v;
  }
  if (typeof v === 'string') {
    if (isToken(v)) {
      if (opts.token === false) issues.errors.push(`${path}: variables are not supported here.`);
      return v;
    }
    const m = v.trim().match(/^(-?\d*\.?\d+)\s*(px)?$/);
    if (m) return parseFloat(m[1]);
  }
  issues.errors.push(`${path}: expected a number${opts.token === false ? '' : ' or a "$variable"'}, got ${JSON.stringify(v)}.`);
  return undefined;
}

function size(v: unknown, path: string, issues: Issues): Size | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['fill', 'fill-container', 'full', '100%', 'stretch', 'flex', 'flex-1', 'expand'].includes(s)) return 'fill';
    if (['hug', 'hug-contents', 'auto', 'fit', 'fit-content', 'content', 'wrap', 'wrap-content'].includes(s)) return 'hug';
  }
  return num(v, path, issues, { min: 0.01 });
}

function enumOf<T extends string>(v: unknown, map: Record<string, T>, path: string, issues: Issues): T | undefined {
  if (v === undefined || v === null) return undefined;
  const key = String(v).trim().toLowerCase();
  if (key in map) return map[key];
  issues.errors.push(`${path}: unknown value ${JSON.stringify(v)}.${didYouMean(key, Object.keys(map))}`);
  return undefined;
}

function bool(v: unknown, path: string, issues: Issues): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1) return true;
  if (v === 'false' || v === 0) return false;
  issues.errors.push(`${path}: expected true/false, got ${JSON.stringify(v)}.`);
  return undefined;
}

const DIR: Record<string, 'row' | 'column' | 'grid' | 'none'> = {
  row: 'row', horizontal: 'row', h: 'row', x: 'row', 'row-reverse': 'row',
  column: 'column', col: 'column', vertical: 'column', v: 'column', y: 'column', 'column-reverse': 'column',
  grid: 'grid', none: 'none', absolute: 'none', free: 'none', freeform: 'none',
};
const ALIGN: Record<string, 'start' | 'center' | 'end' | 'baseline' | 'stretch'> = {
  start: 'start', 'flex-start': 'start', min: 'start', left: 'start', top: 'start',
  center: 'center', middle: 'center',
  end: 'end', 'flex-end': 'end', max: 'end', right: 'end', bottom: 'end',
  baseline: 'baseline', stretch: 'stretch', fill: 'stretch',
};
const JUSTIFY: Record<string, 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'> = {
  start: 'start', 'flex-start': 'start', min: 'start', left: 'start', top: 'start',
  center: 'center', middle: 'center',
  end: 'end', 'flex-end': 'end', max: 'end', right: 'end', bottom: 'end',
  between: 'between', 'space-between': 'between', spacebetween: 'between', space_between: 'between',
  around: 'around', 'space-around': 'around', evenly: 'evenly', 'space-evenly': 'evenly',
};
const TEXT_ALIGN: Record<string, 'left' | 'center' | 'right' | 'justify'> = {
  left: 'left', start: 'left', center: 'center', middle: 'center', right: 'right', end: 'right', justify: 'justify', justified: 'justify',
};
const VALIGN: Record<string, 'top' | 'center' | 'bottom'> = { top: 'top', start: 'top', center: 'center', middle: 'center', bottom: 'bottom', end: 'bottom' };
const FIT: Record<string, 'fill' | 'fit' | 'crop' | 'tile'> = {
  fill: 'fill', cover: 'fill', fit: 'fit', contain: 'fit', crop: 'crop', tile: 'tile', repeat: 'tile',
};
const CASE: Record<string, FontSpec['case'] & string> = {
  original: 'original', none: 'original', upper: 'upper', uppercase: 'upper', lower: 'lower', lowercase: 'lower',
  title: 'title', capitalize: 'title', 'small-caps': 'small-caps', 'small-caps-forced': 'small-caps-forced',
};
const DECORATION: Record<string, 'none' | 'underline' | 'strike'> = {
  none: 'none', underline: 'underline', strike: 'strike', strikethrough: 'strike', 'line-through': 'strike',
};
const SCROLL: Record<string, 'none' | 'vertical' | 'horizontal' | 'both'> = {
  none: 'none', hidden: 'none', visible: 'none', vertical: 'vertical', y: 'vertical', horizontal: 'horizontal', x: 'horizontal', both: 'both', auto: 'vertical', scroll: 'vertical',
};
const CONSTRAINT_H: Record<string, 'left' | 'right' | 'center' | 'stretch' | 'scale'> = {
  left: 'left', min: 'left', start: 'left', right: 'right', max: 'right', end: 'right', center: 'center', stretch: 'stretch', 'left-right': 'stretch', scale: 'scale',
};
const CONSTRAINT_V: Record<string, 'top' | 'bottom' | 'center' | 'stretch' | 'scale'> = {
  top: 'top', min: 'top', start: 'top', bottom: 'bottom', max: 'bottom', end: 'bottom', center: 'center', stretch: 'stretch', 'top-bottom': 'stretch', scale: 'scale',
};

const WEIGHT_NAMES: Record<string, number> = {
  thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, normal: 400, book: 400,
  medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900,
};

// ───────────────────────── paints & effects ─────────────────────────

function paint(v: unknown, path: string, issues: Issues): PaintSpec | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return undefined;
    if (s.startsWith('@')) return { kind: 'style', name: s.slice(1) };
    if (s.startsWith('url(') || /^(https?:|file:|\/|~\/|\.\.?\/)/.test(s) || /\.(png|jpe?g|gif|webp|svg)$/i.test(s)) {
      return { kind: 'image', src: s.replace(/^url\((['"]?)(.*)\1\)$/, '$2'), fit: 'fill' };
    }
    if (/^(linear|radial|conic|angular|diamond)-gradient\(/i.test(s)) return cssGradient(s, path, issues);
    return { kind: 'solid', color: s };
  }
  if (isPlainObject(v)) {
    const o = v as Record<string, unknown>;
    const opacity = o.opacity === undefined ? undefined : (num(o.opacity, `${path}.opacity`, issues, { token: false }) as number);
    if (o.style !== undefined) return { kind: 'style', name: String(o.style).replace(/^@/, '') };
    if (o.image !== undefined || o.src !== undefined || o.imageData !== undefined) {
      return {
        kind: 'image',
        src: o.image !== undefined ? String(o.image) : o.src !== undefined ? String(o.src) : undefined,
        imageData: o.imageData !== undefined ? String(o.imageData) : undefined,
        fit: enumOf(o.fit ?? o.scaleMode ?? 'fill', FIT, `${path}.fit`, issues) ?? 'fill',
        opacity,
      };
    }
    if (o.gradient !== undefined || o.stops !== undefined) {
      const g = String(o.gradient ?? 'linear').toLowerCase().replace(/-gradient$/, '');
      const kind = (({ linear: 'linear', radial: 'radial', angular: 'angular', conic: 'angular', diamond: 'diamond' }) as Record<string, 'linear' | 'radial' | 'angular' | 'diamond'>)[g];
      if (!kind) issues.errors.push(`${path}.gradient: unknown gradient ${JSON.stringify(o.gradient)} (linear|radial|angular|diamond).`);
      const stops = Array.isArray(o.stops) ? o.stops : [];
      if (stops.length < 2) issues.errors.push(`${path}.stops: a gradient needs at least 2 stops.`);
      return {
        kind: 'gradient',
        gradient: kind ?? 'linear',
        angle: typeof o.angle === 'number' ? o.angle : 180,
        stops: stops.map((st, i) => gradientStop(st, i, stops.length, `${path}.stops[${i}]`, issues)),
        opacity,
      };
    }
    if (o.color !== undefined) return { kind: 'solid', color: String(o.color), opacity };
    issues.errors.push(`${path}: unrecognised paint ${JSON.stringify(v)}. Use "#hex", "$variable", "@Style", {color, opacity}, {gradient, stops} or {image, fit}.`);
    return undefined;
  }
  issues.errors.push(`${path}: unrecognised paint ${JSON.stringify(v)}.`);
  return undefined;
}

function gradientStop(st: unknown, i: number, n: number, path: string, issues: Issues): GradientStop {
  const fallbackPos = n > 1 ? i / (n - 1) : 0;
  if (typeof st === 'string') {
    const m = st.trim().match(/^(.*?)(?:\s+(-?\d*\.?\d+)%)?$/);
    return { color: (m?.[1] ?? st).trim(), position: m?.[2] !== undefined ? parseFloat(m[2]) / 100 : fallbackPos };
  }
  if (Array.isArray(st)) return { color: String(st[0]), position: typeof st[1] === 'number' ? (st[1] > 1 ? st[1] / 100 : st[1]) : fallbackPos };
  if (isPlainObject(st)) {
    const p = (st as Record<string, unknown>).position ?? (st as Record<string, unknown>).pos ?? (st as Record<string, unknown>).at;
    return { color: String((st as Record<string, unknown>).color), position: typeof p === 'number' ? (p > 1 ? p / 100 : p) : fallbackPos };
  }
  issues.errors.push(`${path}: unrecognised gradient stop.`);
  return { color: '#000000', position: fallbackPos };
}

/** linear-gradient(135deg, #fff 0%, #000 100%) — the common CSS subset. */
function cssGradient(s: string, path: string, issues: Issues): PaintSpec | undefined {
  const m = s.match(/^(\w+)-gradient\((.*)\)$/i);
  if (!m) return undefined;
  const kind = m[1].toLowerCase();
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of m[2]) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  let angle = 180;
  if (parts.length && /deg$|^to /.test(parts[0])) {
    const a = parts.shift() as string;
    const dirs: Record<string, number> = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270, 'to top right': 45, 'to bottom right': 135, 'to bottom left': 225, 'to top left': 315 };
    angle = a.endsWith('deg') ? parseFloat(a) : dirs[a] ?? 180;
  } else if (parts.length && /^(circle|ellipse|at )/.test(parts[0])) parts.shift();
  const stops = parts.map((p, i) => gradientStop(p, i, parts.length, `${path}.stops[${i}]`, issues));
  const gradient = kind === 'linear' ? 'linear' : kind === 'radial' ? 'radial' : kind === 'diamond' ? 'diamond' : 'angular';
  return { kind: 'gradient', gradient, angle, stops };
}

function paints(v: unknown, path: string, issues: Issues): PaintSpec[] | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === 'none' || v === false || (Array.isArray(v) && v.length === 0)) return null;
  const list = Array.isArray(v) ? v : [v];
  const out: PaintSpec[] = [];
  list.forEach((p, i) => {
    const r = paint(p, list.length > 1 || Array.isArray(v) ? `${path}[${i}]` : path, issues);
    if (r) out.push(r);
  });
  return out;
}

function stroke(v: unknown, path: string, issues: Issues): StrokeSpec | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === 'none' || v === false) return null;
  if (typeof v === 'string') {
    // CSS-like "1px solid #E5E7EB" / "2 dashed $border/strong" / "#hex"
    const tokens = v.trim().split(/\s+/);
    let weight: Num | undefined;
    let dash: number[] | undefined;
    const rest: string[] = [];
    for (const t of tokens) {
      if (/^-?\d*\.?\d+(px)?$/.test(t)) weight = parseFloat(t);
      else if (t === 'dashed') dash = [4, 4];
      else if (t === 'dotted') dash = [1, 2];
      else if (t === 'solid') continue;
      else rest.push(t);
    }
    const p = paint(rest.join(' ') || '#000000', path, issues);
    return { paints: p ? [p] : [], weight: weight ?? 1, dash };
  }
  if (Array.isArray(v)) return { paints: paints(v, path, issues) ?? [], weight: 1 };
  if (isPlainObject(v)) {
    const o = v as Record<string, unknown>;
    const colorInput = o.color ?? o.paint ?? o.paints ?? o.fill;
    let weight: StrokeSpec['weight'];
    const w = o.weight ?? o.width ?? o.strokeWeight;
    if (Array.isArray(w)) {
      const sides = padLike(w, `${path}.weight`, issues);
      weight = sides;
    } else if (w !== undefined) weight = num(w, `${path}.weight`, issues, { min: 0 });
    const align = o.align ?? o.position ?? o.strokeAlign;
    return {
      paints: colorInput === undefined ? [] : (paints(colorInput, `${path}.color`, issues) ?? []),
      weight: weight ?? 1,
      align: align === undefined ? undefined : enumOf(align, { inside: 'inside', inner: 'inside', center: 'center', middle: 'center', outside: 'outside', outer: 'outside' } as const, `${path}.align`, issues),
      dash: Array.isArray(o.dash) ? (o.dash as number[]) : o.dash === true || o.style === 'dashed' ? [4, 4] : o.style === 'dotted' ? [1, 2] : undefined,
      cap: o.cap === undefined ? undefined : enumOf(o.cap, { none: 'none', round: 'round', square: 'square' } as const, `${path}.cap`, issues),
      join: o.join === undefined ? undefined : enumOf(o.join, { miter: 'miter', bevel: 'bevel', round: 'round' } as const, `${path}.join`, issues),
    };
  }
  issues.errors.push(`${path}: unrecognised stroke ${JSON.stringify(v)}.`);
  return undefined;
}

/** "0 4 12 -2 rgba(0,0,0,.12), inset 0 1 0 #fff" (px units optional) */
function cssShadows(s: string, path: string, issues: Issues): EffectSpec[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.map((p, i) => {
    let inset = false;
    const nums: number[] = [];
    const colorParts: string[] = [];
    const re = /(rgba?\([^)]*\)|hsla?\([^)]*\)|\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(p))) {
      const t = m[1];
      if (t === 'inset') inset = true;
      else if (/^-?\d*\.?\d+(px)?$/.test(t)) nums.push(parseFloat(t));
      else colorParts.push(t);
    }
    if (nums.length < 2) issues.errors.push(`${path}[${i}]: shadow needs at least "x y" offsets: ${JSON.stringify(p)}.`);
    return {
      kind: inset ? 'inner-shadow' : 'drop-shadow',
      x: nums[0] ?? 0,
      y: nums[1] ?? 0,
      blur: nums[2] ?? 0,
      spread: nums[3] ?? 0,
      color: colorParts.join(' ') || 'rgba(0,0,0,0.25)',
    } as EffectSpec;
  });
}

function effects(v: unknown, path: string, issues: Issues): EffectSpec[] | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === 'none' || v === false) return null;
  if (typeof v === 'string') {
    if (v.trim().startsWith('@')) return [{ kind: 'style', name: v.trim().slice(1) }];
    return cssShadows(v, path, issues);
  }
  const list = Array.isArray(v) ? v : [v];
  const out: EffectSpec[] = [];
  list.forEach((e, i) => {
    const p = `${path}[${i}]`;
    if (typeof e === 'string') {
      if (e.trim().startsWith('@')) out.push({ kind: 'style', name: e.trim().slice(1) });
      else out.push(...cssShadows(e, p, issues));
      return;
    }
    if (!isPlainObject(e)) {
      issues.errors.push(`${p}: unrecognised effect.`);
      return;
    }
    const o = e as Record<string, unknown>;
    const t = String(o.type ?? o.kind ?? (o.radius !== undefined && o.x === undefined ? 'layer-blur' : 'drop-shadow')).toLowerCase();
    if (o.style !== undefined) {
      out.push({ kind: 'style', name: String(o.style).replace(/^@/, '') });
      return;
    }
    const kinds: Record<string, 'drop-shadow' | 'inner-shadow' | 'layer-blur' | 'background-blur'> = {
      shadow: 'drop-shadow', 'drop-shadow': 'drop-shadow', drop_shadow: 'drop-shadow', dropshadow: 'drop-shadow',
      'inner-shadow': 'inner-shadow', inner_shadow: 'inner-shadow', innershadow: 'inner-shadow', inset: 'inner-shadow',
      blur: 'layer-blur', 'layer-blur': 'layer-blur', layer_blur: 'layer-blur',
      'background-blur': 'background-blur', background_blur: 'background-blur', 'bg-blur': 'background-blur', backdrop: 'background-blur', 'backdrop-blur': 'background-blur',
    };
    const kind = kinds[t];
    if (!kind) {
      issues.errors.push(`${p}.type: unknown effect ${JSON.stringify(t)}.${didYouMean(t, Object.keys(kinds))}`);
      return;
    }
    if (kind === 'layer-blur' || kind === 'background-blur') {
      out.push({ kind, radius: num(o.radius ?? o.blur ?? 8, `${p}.radius`, issues) ?? 8 });
    } else {
      out.push({
        kind,
        x: num(o.x ?? o.offsetX ?? 0, `${p}.x`, issues) ?? 0,
        y: num(o.y ?? o.offsetY ?? 0, `${p}.y`, issues) ?? 0,
        blur: num(o.blur ?? o.radius ?? 0, `${p}.blur`, issues) ?? 0,
        spread: num(o.spread ?? 0, `${p}.spread`, issues) ?? 0,
        color: String(o.color ?? 'rgba(0,0,0,0.25)'),
      });
    }
  });
  return out;
}

// ───────────────────────── text ─────────────────────────

/** "600 16/24 Inter", "italic 14px Cairo", "Inter" */
function fontShorthand(s: string): FontSpec {
  const out: FontSpec = {};
  const tokens = s.trim().split(/\s+/);
  const family: string[] = [];
  for (const t of tokens) {
    const low = t.toLowerCase().replace(/[-_ ]/g, '');
    if (low === 'italic' || low === 'oblique') out.italic = true;
    else if (/^[1-9]00$/.test(t) && out.size === undefined && out.weight === undefined) out.weight = parseInt(t, 10);
    else if (WEIGHT_NAMES[low] !== undefined && !family.length) out.weight = WEIGHT_NAMES[low];
    else if (/^\d*\.?\d+(px)?(\/\S+)?$/.test(t) && out.size === undefined) {
      const [sz, lh] = t.split('/');
      out.size = parseFloat(sz);
      if (lh) out.lineHeight = /%$/.test(lh) || lh === 'auto' ? lh : parseFloat(lh);
    } else family.push(t);
  }
  if (family.length) out.family = family.join(' ').replace(/^["']|["']$/g, '');
  return out;
}

function fontSpec(v: unknown, path: string, issues: Issues, into: FontSpec = {}): FontSpec {
  if (typeof v === 'string') return { ...into, ...fontShorthand(v) };
  if (!isPlainObject(v)) {
    issues.errors.push(`${path}: expected an object or a shorthand like "600 16/24 Inter".`);
    return into;
  }
  const out: FontSpec = { ...into };
  for (const [k, val] of Object.entries(v)) {
    const key = FONT_KEYS[k] ?? (k as keyof FontSpec);
    applyFontKey(out, key, val, `${path}.${k}`, issues);
  }
  return out;
}

function applyFontKey(out: FontSpec, key: string, val: unknown, path: string, issues: Issues): void {
  switch (key) {
    case 'family':
      out.family = String(val);
      break;
    case 'style':
      out.style = String(val);
      break;
    case 'weight': {
      if (typeof val === 'number') out.weight = val;
      else if (typeof val === 'string' && /^\d+$/.test(val)) out.weight = parseInt(val, 10);
      else if (typeof val === 'string' && WEIGHT_NAMES[val.toLowerCase().replace(/[-_ ]/g, '')] !== undefined)
        out.weight = WEIGHT_NAMES[val.toLowerCase().replace(/[-_ ]/g, '')];
      else issues.errors.push(`${path}: unknown font weight ${JSON.stringify(val)} (100–900 or Regular/Medium/SemiBold/Bold…).`);
      break;
    }
    case 'italic':
      out.italic = !!val;
      break;
    case 'size':
      out.size = num(val, path, issues, { min: 1 });
      break;
    case 'lineHeight':
      if (typeof val === 'string' && (/%$/.test(val.trim()) || val.trim().toLowerCase() === 'auto')) out.lineHeight = val.trim().toLowerCase();
      else if (typeof val === 'number' && val > 0 && val < 4) out.lineHeight = `${Math.round(val * 100)}%`; // 1.5 → 150%
      else out.lineHeight = num(val, path, issues);
      break;
    case 'letterSpacing':
      if (typeof val === 'string' && /%$/.test(val.trim())) out.letterSpacing = val.trim();
      else if (typeof val === 'string' && /em$/.test(val.trim())) out.letterSpacing = `${parseFloat(val) * 100}%`;
      else out.letterSpacing = num(val, path, issues);
      break;
    case 'case':
      out.case = enumOf(val, CASE, path, issues);
      break;
    case 'decoration':
      out.decoration = enumOf(val, DECORATION, path, issues);
      break;
    default:
      issues.warnings.push(`${path}: unknown font property ignored.${didYouMean(key, Object.values(FONT_KEYS))}`);
  }
}

// ───────────────────────── interactions ─────────────────────────

const TRIGGERS: Record<string, TriggerKind> = {
  click: 'click', tap: 'click', 'on-click': 'click', onclick: 'click', 'on click': 'click',
  hover: 'hover', 'while-hovering': 'hover', whilehovering: 'hover', 'on-hover': 'hover',
  press: 'press', 'while-pressing': 'press', whilepressing: 'press', 'on-press': 'press',
  drag: 'drag', 'on-drag': 'drag', swipe: 'drag',
  'mouse-enter': 'mouse-enter', mouseenter: 'mouse-enter', enter: 'mouse-enter',
  'mouse-leave': 'mouse-leave', mouseleave: 'mouse-leave', leave: 'mouse-leave',
  'mouse-down': 'mouse-down', mousedown: 'mouse-down',
  'mouse-up': 'mouse-up', mouseup: 'mouse-up',
  after: 'after', delay: 'after', timeout: 'after', 'after-delay': 'after',
  key: 'key', keydown: 'key', 'key-down': 'key',
};

const KEY_CODES: Record<string, number> = {
  enter: 13, return: 13, escape: 27, esc: 27, space: 32, ' ': 32, tab: 9, backspace: 8, delete: 46,
  arrowleft: 37, left: 37, arrowup: 38, up: 38, arrowright: 39, right: 39, arrowdown: 40, down: 40,
};

export function parseDuration(v: unknown, fallback: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d*\.?\d+)\s*(ms|s)?$/);
    if (m) return m[2] === 's' ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
  }
  return fallback;
}

function keyCode(k: string): number {
  const low = k.toLowerCase();
  if (KEY_CODES[low] !== undefined) return KEY_CODES[low];
  if (/^[a-z]$/.test(low)) return low.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(low)) return low.charCodeAt(0);
  const n = parseInt(k, 10);
  return Number.isFinite(n) ? n : 13;
}

function trigger(v: unknown, path: string, issues: Issues): TriggerSpec {
  if (v === undefined || v === null) return { kind: 'click' };
  if (isPlainObject(v)) {
    const o = v as Record<string, unknown>;
    if (o.after !== undefined || o.delay !== undefined || o.timeout !== undefined)
      return { kind: 'after', delayMs: parseDuration(o.after ?? o.delay ?? o.timeout, 800) };
    if (o.key !== undefined) return { kind: 'key', keyCodes: (Array.isArray(o.key) ? o.key : [o.key]).map((k) => keyCode(String(k))) };
    return trigger(o.type ?? o.kind, path, issues);
  }
  const s = String(v).trim();
  const m = s.match(/^(after|delay|timeout)\s+(.+)$/i);
  if (m) return { kind: 'after', delayMs: parseDuration(m[2], 800) };
  const k = s.match(/^key[:\s]+(.+)$/i);
  if (k) return { kind: 'key', keyCodes: k[1].split(/[+,\s]+/).filter(Boolean).map(keyCode) };
  const kind = TRIGGERS[s.toLowerCase()];
  if (!kind) {
    issues.errors.push(`${path}: unknown trigger ${JSON.stringify(v)}.${didYouMean(s, Object.keys(TRIGGERS))}`);
    return { kind: 'click' };
  }
  return { kind };
}

const EASINGS: Record<string, EasingSpec['kind']> = {
  linear: 'linear', 'ease-in': 'ease-in', easein: 'ease-in', 'ease-out': 'ease-out', easeout: 'ease-out', ease: 'ease-out',
  'ease-in-out': 'ease-in-out', easeinout: 'ease-in-out', 'ease-in-and-out': 'ease-in-out',
  'ease-in-back': 'ease-in-back', 'ease-out-back': 'ease-out-back', 'ease-in-out-back': 'ease-in-out-back', 'ease-in-and-out-back': 'ease-in-out-back',
  gentle: 'gentle', quick: 'quick', bouncy: 'bouncy', slow: 'slow',
};

const TRANSITIONS: Record<string, TransitionSpec['type'] | 'instant'> = {
  instant: 'instant', none: 'instant',
  dissolve: 'dissolve', fade: 'dissolve',
  'smart-animate': 'smart-animate', smartanimate: 'smart-animate', smart: 'smart-animate', 'smart animate': 'smart-animate',
  'scroll-animate': 'scroll-animate',
  'move-in': 'move-in', movein: 'move-in', 'move-out': 'move-out', moveout: 'move-out',
  push: 'push', 'slide-in': 'slide-in', slidein: 'slide-in', slide: 'slide-in', 'slide-out': 'slide-out', slideout: 'slide-out',
};

function easing(v: unknown, path: string, issues: Issues): EasingSpec {
  if (v === undefined || v === null) return { kind: 'ease-out' };
  if (Array.isArray(v) && v.length === 4) return { kind: 'bezier', points: v.map(Number) as [number, number, number, number] };
  if (isPlainObject(v)) {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.bezier) && o.bezier.length === 4) return { kind: 'bezier', points: o.bezier.map(Number) as [number, number, number, number] };
    if (isPlainObject(o.spring)) {
      const sp = o.spring as Record<string, number>;
      return { kind: 'spring', mass: sp.mass ?? 1, stiffness: sp.stiffness ?? 100, damping: sp.damping ?? 15 };
    }
  }
  const s = String(v).trim().toLowerCase();
  const cb = s.match(/^cubic-bezier\(([^)]+)\)$/);
  if (cb) {
    const pts = cb[1].split(',').map((x) => parseFloat(x));
    if (pts.length === 4) return { kind: 'bezier', points: pts as [number, number, number, number] };
  }
  const kind = EASINGS[s];
  if (!kind) {
    issues.errors.push(`${path}: unknown easing ${JSON.stringify(v)}.${didYouMean(s, Object.keys(EASINGS))}`);
    return { kind: 'ease-out' };
  }
  return { kind } as EasingSpec;
}

export function transition(v: unknown, path: string, issues: Issues): TransitionSpec | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === false) return null;
  let type: string | undefined;
  let direction: string | undefined;
  let duration: unknown;
  let ease: unknown;
  let matchLayers: boolean | undefined;
  if (typeof v === 'string') {
    // "smart-animate 300ms ease-out", "slide-in left 250ms gentle"
    for (const t of v.trim().toLowerCase().split(/\s+/)) {
      if (TRANSITIONS[t] && !type) type = t;
      else if (['left', 'right', 'top', 'bottom', 'up', 'down'].includes(t)) direction = t;
      else if (/^\d*\.?\d+(ms|s)?$/.test(t)) duration = t;
      else ease = t;
    }
  } else if (isPlainObject(v)) {
    const o = v as Record<string, unknown>;
    type = o.type !== undefined ? String(o.type).toLowerCase() : 'dissolve';
    direction = o.direction !== undefined ? String(o.direction).toLowerCase() : undefined;
    duration = o.duration ?? o.durationMs;
    ease = o.easing ?? o.ease ?? o.curve;
    matchLayers = o.matchLayers === undefined ? undefined : !!o.matchLayers;
  } else {
    issues.errors.push(`${path}: expected a transition string like "smart-animate 300ms ease-out" or an object.`);
    return undefined;
  }
  const t = TRANSITIONS[type ?? 'dissolve'];
  if (!t) {
    issues.errors.push(`${path}: unknown transition ${JSON.stringify(type)}.${didYouMean(type ?? '', Object.keys(TRANSITIONS))}`);
    return undefined;
  }
  if (t === 'instant') return null;
  const dirMap: Record<string, 'left' | 'right' | 'top' | 'bottom'> = { left: 'left', right: 'right', top: 'top', up: 'top', bottom: 'bottom', down: 'bottom' };
  const directional = ['move-in', 'move-out', 'push', 'slide-in', 'slide-out'].includes(t);
  return {
    type: t,
    direction: directional ? dirMap[direction ?? 'left'] ?? 'left' : undefined,
    durationMs: parseDuration(duration, 300),
    easing: easing(ease, `${path}.easing`, issues),
    matchLayers,
  };
}

const ACTION_KEYS: Record<string, ActionKind> = {
  navigate: 'navigate', navigateTo: 'navigate', goTo: 'navigate', goto: 'navigate',
  overlay: 'overlay', openOverlay: 'overlay',
  swap: 'swap', swapOverlay: 'swap',
  scrollTo: 'scroll-to', 'scroll-to': 'scroll-to',
  changeTo: 'change-to', 'change-to': 'change-to',
  back: 'back', close: 'close', closeOverlay: 'close',
  url: 'url', openUrl: 'url', link: 'url',
  setMode: 'set-mode', 'set-mode': 'set-mode',
  setVariable: 'set-variable', 'set-variable': 'set-variable',
};

function action(o: Record<string, unknown>, path: string, issues: Issues, sharedTransition: unknown): ActionSpec | undefined {
  let kind: ActionKind | undefined;
  let to: string | undefined;
  if (o.action !== undefined || o.type !== undefined || o.kind !== undefined) {
    const a = String(o.action ?? o.type ?? o.kind).replace(/[_\s]/g, '-');
    kind = ACTION_KEYS[a] ?? ACTION_KEYS[a.toLowerCase()] ?? (Object.values(ACTION_KEYS).includes(a.toLowerCase() as ActionKind) ? (a.toLowerCase() as ActionKind) : undefined);
    if (!kind) {
      issues.errors.push(`${path}.action: unknown action ${JSON.stringify(a)}.${didYouMean(a, Object.keys(ACTION_KEYS))}`);
      return undefined;
    }
    to = o.to !== undefined ? String(o.to) : o.destination !== undefined ? String(o.destination) : undefined;
  } else {
    for (const [k, kk] of Object.entries(ACTION_KEYS)) {
      if (o[k] !== undefined) {
        kind = kk;
        if (typeof o[k] === 'string') to = o[k] as string;
        break;
      }
    }
  }
  if (!kind) {
    issues.errors.push(`${path}: no action. Use {action: "navigate", to: "<node id or ref>"} or shorthands like {navigate: "…"}, {overlay: "…"}, {back: true}, {url: "…"}.`);
    return undefined;
  }
  const a: ActionSpec = { kind };
  if (['navigate', 'overlay', 'swap', 'scroll-to', 'change-to'].includes(kind)) {
    if (!to) issues.errors.push(`${path}: "${kind}" needs a destination ("to").`);
    a.to = to;
    const tr = transition(o.transition ?? o.animation ?? sharedTransition, `${path}.transition`, issues);
    a.transition = tr === undefined ? (kind === 'change-to' ? { type: 'smart-animate', durationMs: 200, easing: { kind: 'ease-out' } } : null) : tr;
    if (o.resetScroll !== undefined) a.resetScroll = !!o.resetScroll;
    if (o.preserveScroll !== undefined) a.resetScroll = !o.preserveScroll;
    if (isPlainObject(o.offset)) a.offset = o.offset as { x: number; y: number };
  }
  if (kind === 'url') {
    a.url = String(o.url ?? o.to ?? o.openUrl ?? o.link ?? '');
    if (!a.url) issues.errors.push(`${path}: "url" action needs a url.`);
    a.newTab = o.newTab === undefined ? true : !!o.newTab;
  }
  if (kind === 'set-mode') {
    const src = (isPlainObject(o.setMode) ? o.setMode : o) as Record<string, unknown>;
    a.collection = src.collection !== undefined ? String(src.collection) : undefined;
    a.mode = src.mode !== undefined ? String(src.mode) : undefined;
    if (!a.collection || !a.mode) issues.errors.push(`${path}: "set-mode" needs {collection, mode}.`);
  }
  if (kind === 'set-variable') {
    const src = (isPlainObject(o.setVariable) ? o.setVariable : o) as Record<string, unknown>;
    a.variable = src.variable !== undefined ? String(src.variable).replace(/^\$/, '') : undefined;
    a.value = src.value;
    if (!a.variable) issues.errors.push(`${path}: "set-variable" needs {variable, value}.`);
  }
  return a;
}

/** Accepts one interaction or an array; shorthand string "ref" = click → navigate. */
export function interactions(v: unknown, path: string, issues: Issues): InteractionSpec[] {
  if (v === undefined || v === null) return [];
  const list = Array.isArray(v) ? v : [v];
  const out: InteractionSpec[] = [];
  list.forEach((item, i) => {
    const p = Array.isArray(v) ? `${path}[${i}]` : path;
    if (typeof item === 'string') {
      out.push({ trigger: { kind: 'click' }, actions: [{ kind: 'navigate', to: item, transition: null }] });
      return;
    }
    if (!isPlainObject(item)) {
      issues.errors.push(`${p}: expected an object.`);
      return;
    }
    const o = item as Record<string, unknown>;
    const trig = trigger(o.trigger ?? o.on ?? o.event, `${p}.trigger`, issues);
    const actions: ActionSpec[] = [];
    if (Array.isArray(o.actions)) {
      o.actions.forEach((a, j) => {
        if (isPlainObject(a)) {
          const r = action(a as Record<string, unknown>, `${p}.actions[${j}]`, issues, o.transition);
          if (r) actions.push(r);
        } else issues.errors.push(`${p}.actions[${j}]: expected an object.`);
      });
    } else {
      const r = action(o, p, issues, undefined);
      if (r) actions.push(r);
    }
    out.push({ from: o.from !== undefined ? String(o.from) : undefined, trigger: trig, actions });
  });
  return out;
}

// ───────────────────────── padding ─────────────────────────

function padLike(v: unknown, path: string, issues: Issues): [Num, Num, Num, Num] {
  if (Array.isArray(v)) {
    const a = v.map((x, i) => num(x, `${path}[${i}]`, issues) ?? 0);
    if (a.length === 1) return [a[0], a[0], a[0], a[0]];
    if (a.length === 2) return [a[0], a[1], a[0], a[1]];
    if (a.length === 3) return [a[0], a[1], a[2], a[1]];
    if (a.length === 4) return [a[0], a[1], a[2], a[3]];
    issues.errors.push(`${path}: expected 1–4 values (CSS order: top right bottom left).`);
    return [0, 0, 0, 0];
  }
  if (isPlainObject(v)) {
    const o = v as Record<string, unknown>;
    const x = o.x ?? o.horizontal ?? o.h;
    const y = o.y ?? o.vertical ?? o.v;
    const g = (k: string[], fb: unknown) => {
      for (const kk of k) if (o[kk] !== undefined) return num(o[kk], `${path}.${kk}`, issues) ?? 0;
      return fb === undefined ? 0 : num(fb, path, issues) ?? 0;
    };
    return [g(['top', 't'], y), g(['right', 'r', 'end'], x), g(['bottom', 'b'], y), g(['left', 'l', 'start'], x)];
  }
  if (typeof v === 'string' && !isToken(v) && /\s/.test(v.trim())) return padLike(v.trim().split(/\s+/), path, issues);
  const n = num(v, path, issues) ?? 0;
  return [n, n, n, n];
}

// ───────────────────────── spec ─────────────────────────

export interface NormalizeOptions {
  /** `edit`/`set`: type is optional and nothing is defaulted. */
  partial?: boolean;
}

/** Normalizes a loose spec. Never throws: problems land in `issues`. */
export function normalizeSpec(input: unknown, path: string, issues: Issues, opts: NormalizeOptions = {}): Spec {
  const out = {} as Spec;
  if (!isPlainObject(input)) {
    issues.errors.push(`${path}: expected an object, got ${JSON.stringify(input)?.slice(0, 80)}.`);
    return { type: 'frame' };
  }
  const raw = input as Record<string, unknown>;

  // 1. type (explicit, aliased or inferred)
  let typeInput = raw.type ?? raw.kind ?? raw.node ?? raw.nodeType;
  if (typeInput === undefined && !opts.partial) {
    if (raw.text !== undefined || raw.characters !== undefined || raw.segments !== undefined || raw.content !== undefined) typeInput = 'text';
    else if (raw.component !== undefined || raw.mainComponent !== undefined || raw.componentKey !== undefined) typeInput = 'instance';
    else if (raw.icon !== undefined) typeInput = 'icon';
    else if (raw.svg !== undefined) typeInput = 'svg';
    else if (raw.src !== undefined || raw.image !== undefined || raw.placeholder !== undefined || raw.prompt !== undefined || raw.imagePrompt !== undefined || raw.supply !== undefined || raw.provide !== undefined || raw.userImage !== undefined) typeInput = 'image';
    else typeInput = 'frame';
  }
  if (typeInput !== undefined) {
    const t = String(typeInput).toLowerCase();
    const alias = TYPE_ALIASES[t];
    if (!alias) {
      issues.errors.push(`${path}.type: unknown node type ${JSON.stringify(typeInput)}.${didYouMean(t, Object.keys(TYPE_ALIASES))}`);
      out.type = 'frame';
    } else {
      out.type = alias[0];
      if (alias[1]?.dir && raw.dir === undefined && raw.direction === undefined && raw.layout === undefined) out.dir = alias[1].dir;
    }
  }
  const type = out.type;
  const isText = type === 'text';
  const isIconish = type === 'icon' || type === 'svg';

  // 2. walk keys
  const font: FontSpec = {};
  let fontTouched = false;
  let srcForFill: string | undefined;
  for (const [rawKey, val] of Object.entries(raw)) {
    if (['type', 'kind', 'node', 'nodeType'].includes(rawKey)) continue;
    const p = `${path}.${rawKey}`;
    // Font props at the top level. On containers they are inherited by descendant text.
    if (FONT_KEYS[rawKey] !== undefined) {
      applyFontKey(font, FONT_KEYS[rawKey], val, p, issues);
      fontTouched = true;
      continue;
    }
    if (rawKey === 'url' && isText) {
      out.link = String(val);
      continue;
    }
    if (rawKey === 'size') {
      if (isText) {
        applyFontKey(font, 'size', val, p, issues);
        fontTouched = true;
      } else if (isIconish) out.size = num(val, p, issues, { token: false, min: 1 }) as number;
      else if (Array.isArray(val)) {
        out.w = size(val[0], `${p}[0]`, issues);
        out.h = size(val[1] ?? val[0], `${p}[1]`, issues);
      } else {
        out.w = size(val, p, issues);
        out.h = size(val, p, issues);
      }
      continue;
    }
    if (rawKey === 'uppercase' && val) {
      font.case = 'upper';
      fontTouched = true;
      continue;
    }
    if (rawKey === 'underline' && val) {
      font.decoration = 'underline';
      fontTouched = true;
      continue;
    }
    if (rawKey === 'id') {
      issues.warnings.push(`${p}: "id" is assigned by Figma; using it as "ref".`);
      out.ref = String(val);
      continue;
    }
    if (rawKey === 'onClick' || rawKey === 'onTap' || rawKey === 'onHover' || rawKey === 'onPress') {
      const trig = rawKey === 'onHover' ? 'hover' : rawKey === 'onPress' ? 'press' : 'click';
      const item = typeof val === 'string' ? { trigger: trig, navigate: val } : { trigger: trig, ...(val as Record<string, unknown>) };
      out.interactions = [...(out.interactions ?? []), ...interactions(item, p, issues)];
      continue;
    }
    const key = KNOWN_KEYS.has(rawKey) ? rawKey : KEY_ALIASES[rawKey];
    if (!key) {
      issues.warnings.push(`${p}: unknown key ignored.${didYouMean(rawKey, [...KNOWN_KEYS, ...Object.keys(KEY_ALIASES)])}`);
      continue;
    }
    switch (key) {
      case 'name':
      case 'ref':
      case 'description':
      case 'component':
      case 'svg':
      case 'icon':
      case 'imageData':
      case 'placeholder':
      case 'prompt':
      case 'supply':
      case 'link':
      case 'blend':
        if (val !== undefined && val !== null) (out as unknown as Record<string, unknown>)[key] = String(val);
        break;
      case 'src':
        if (val !== undefined && val !== null) {
          if (type === 'image' || type === undefined) out.src = String(val);
          else srcForFill = String(val);
        }
        break;
      case 'text':
        out.text = val === null || val === undefined ? '' : String(val);
        break;
      case 'style':
        if (typeof val === 'string' && (isText || opts.partial)) out.style = val.replace(/^@/, '');
        else if (typeof val === 'string')
          issues.warnings.push(`${p}: "style" is the text style of a text node; for paints/effects use fill: "@${val.replace(/^@/, '')}" or effects: "@${val.replace(/^@/, '')}".`);
        else if (isPlainObject(val)) {
          // style: {fontSize…} — someone meant font props
          Object.assign(font, fontSpec(val, p, issues));
          fontTouched = true;
        }
        break;
      case 'font':
        Object.assign(font, fontSpec(val, p, issues, font));
        fontTouched = true;
        break;
      case 'dir':
        out.dir = enumOf(val, DIR, p, issues);
        break;
      case 'gap':
        if (val === 'auto' || val === 'between' || val === 'space-between') {
          out.justify = 'between';
        } else out.gap = num(val, p, issues, { min: 0 });
        break;
      case 'rowGap':
      case 'colGap':
      case 'minW':
      case 'maxW':
      case 'minH':
      case 'maxH':
      case 'opacity': {
        if (key === 'opacity' && typeof val === 'string' && /%$/.test(val)) out.opacity = parseFloat(val) / 100;
        else if (key === 'opacity' && typeof val === 'number' && val > 1) out.opacity = val / 100;
        else (out as unknown as Record<string, unknown>)[key] = num(val, p, issues, { min: 0 });
        break;
      }
      case 'cols':
      case 'rows':
      case 'maxLines':
      case 'paragraphSpacing':
      case 'x':
      case 'y':
      case 'rotation':
      case 'strokeWidth': {
        const n = num(val, p, issues, { token: false });
        if (n !== undefined) (out as unknown as Record<string, unknown>)[key] = n;
        break;
      }
      case 'pad':
        out.pad = padLike(val, p, issues);
        break;
      case 'align':
        if (isText) out.textAlign = enumOf(val, TEXT_ALIGN, p, issues);
        else out.align = enumOf(val, ALIGN, p, issues);
        break;
      case 'justify':
        out.justify = enumOf(val, JUSTIFY, p, issues);
        break;
      case 'textAlign':
        out.textAlign = enumOf(val, TEXT_ALIGN, p, issues);
        break;
      case 'valign':
        out.valign = enumOf(val, VALIGN, p, issues);
        break;
      case 'wrap':
        out.wrap = bool(val, p, issues) ?? (val === 'wrap' ? true : undefined);
        break;
      case 'alignContent':
        out.alignContent = enumOf(val, { auto: 'auto', start: 'auto', between: 'between', 'space-between': 'between' } as const, p, issues);
        break;
      case 'clip':
        out.clip = bool(val, p, issues);
        break;
      case 'w':
      case 'h':
        out[key] = size(val, p, issues);
        break;
      case 'absolute':
        out.absolute = val === 'absolute' ? true : bool(val, p, issues);
        break;
      case 'constraints':
        if (isPlainObject(val)) {
          const o = val as Record<string, unknown>;
          out.constraints = {
            h: o.h ?? o.horizontal ? enumOf(o.h ?? o.horizontal, CONSTRAINT_H, `${p}.h`, issues) : undefined,
            v: o.v ?? o.vertical ? enumOf(o.v ?? o.vertical, CONSTRAINT_V, `${p}.v`, issues) : undefined,
          };
        } else issues.errors.push(`${p}: expected {h, v}.`);
        break;
      case 'cell':
      case 'span':
        if (Array.isArray(val) && val.length === 2) out[key] = [Number(val[0]), Number(val[1])];
        else issues.errors.push(`${p}: expected [row, column].`);
        break;
      case 'fill': {
        const ps = paints(val, p, issues);
        if (ps === undefined) break;
        if (isText) out.color = ps ?? [];
        else out.fill = ps;
        break;
      }
      case 'color': {
        // CSS semantics: text color. Containers pass it down to their text (inherited);
        // icons/svg/instances recolor their vector layers; lines use it as stroke;
        // plain shapes (rect, ellipse, polygon, star) use it as fill.
        const ps = paints(val, p, issues);
        if (ps === undefined) break;
        if (!opts.partial && (type === 'rect' || type === 'ellipse' || type === 'polygon' || type === 'star')) out.fill = ps;
        else out.color = ps ?? [];
        break;
      }
      case 'stroke':
        out.stroke = stroke(val, p, issues);
        break;
      case 'radius':
        if (val === 'full' || val === 'pill' || val === 'round') out.radius = 9999;
        else if (Array.isArray(val)) out.radius = padLike(val, p, issues);
        else out.radius = num(val, p, issues, { min: 0 });
        break;
      case 'effects': {
        const e = effects(val, p, issues);
        if (e !== undefined) out.effects = e === null ? null : [...(out.effects ?? []), ...e];
        break;
      }
      case 'visible':
        out.visible = rawKey === 'hidden' ? !bool(val, p, issues) : bool(val, p, issues);
        break;
      case 'locked':
      case 'mockup':
      case 'truncate':
      case 'fixed':
      case 'rtl':
        (out as unknown as Record<string, unknown>)[key] = bool(val, p, issues);
        break;
      case 'modes':
        if (isPlainObject(val)) out.modes = Object.fromEntries(Object.entries(val).map(([k, v]) => [k, String(v)]));
        else issues.errors.push(`${p}: expected {"Collection name": "Mode name"}.`);
        break;
      case 'segments':
        if (!Array.isArray(val)) issues.errors.push(`${p}: expected an array of {text, …style}.`);
        else
          out.segments = val.map((s, i) => {
            const sp = `${p}[${i}]`;
            if (typeof s === 'string') return { text: s };
            if (!isPlainObject(s)) {
              issues.errors.push(`${sp}: expected a string or {text, …}.`);
              return { text: '' };
            }
            const o = s as Record<string, unknown>;
            const seg: SegmentSpec = { text: String(o.text ?? '') };
            const f: FontSpec = {};
            let touched = false;
            for (const [k, v] of Object.entries(o)) {
              if (k === 'text') continue;
              if (k === 'color' || k === 'fill') seg.color = paints(v, `${sp}.${k}`, issues) ?? [];
              else if (k === 'link' || k === 'href' || k === 'url') seg.link = String(v);
              else if (k === 'font') {
                Object.assign(f, fontSpec(v, `${sp}.font`, issues, f));
                touched = true;
              } else if (FONT_KEYS[k] || k === 'size') {
                applyFontKey(f, FONT_KEYS[k] ?? 'size', v, `${sp}.${k}`, issues);
                touched = true;
              } else if (k === 'bold' && v) {
                f.weight = 700;
                touched = true;
              } else if (k === 'underline' && v) {
                f.decoration = 'underline';
                touched = true;
              } else issues.warnings.push(`${sp}.${k}: unknown segment key ignored.`);
            }
            if (touched) seg.font = f;
            return seg;
          });
        break;
      case 'variant':
        if (isPlainObject(val)) out.variant = Object.fromEntries(Object.entries(val).map(([k, v]) => [k, String(v)]));
        else if (typeof val === 'string') {
          // "Type=Primary, Size=md"
          out.variant = Object.fromEntries(
            val.split(',').map((kv) => kv.split('=').map((x) => x.trim())).filter((kv) => kv.length === 2) as Array<[string, string]>,
          );
        } else issues.errors.push(`${p}: expected {"Property": "Value"}.`);
        break;
      case 'props':
        if (isPlainObject(val)) out.props = val as Record<string, string | boolean>;
        else issues.errors.push(`${p}: expected {"Property": value}.`);
        break;
      case 'overrides':
        if (isPlainObject(val)) {
          out.overrides = {};
          for (const [k, v] of Object.entries(val)) {
            if (typeof v === 'string') out.overrides[k] = { text: v };
            else out.overrides[k] = normalizeSpec(v, `${p}.${k}`, issues, { partial: true });
          }
        } else issues.errors.push(`${p}: expected {"Layer name or path": {…props}}.`);
        break;
      case 'bind':
        if (isPlainObject(val)) out.bind = val as Spec['bind'];
        else if (typeof val === 'string') out.bind = isText ? { text: val } : type === 'instance' ? { swap: val } : { visible: val };
        else issues.errors.push(`${p}: expected {text|visible|swap: "Property name"}.`);
        break;
      case 'fit':
        out.fit = enumOf(val, FIT, p, issues);
        break;
      case 'scroll':
        out.scroll = enumOf(val, SCROLL, p, issues);
        break;
      case 'device': {
        const name = String(val).trim().toLowerCase().replace(/[\s_]+/g, '-');
        if (DEVICES[name]) out.device = name;
        else issues.errors.push(`${p}: unknown device ${JSON.stringify(val)}.${didYouMean(name, Object.keys(DEVICES))} Or set w and h.`);
        break;
      }
      case 'interactions':
        out.interactions = [...(out.interactions ?? []), ...interactions(val, p, issues)];
        break;
      case 'annotations':
        out.annotations = (Array.isArray(val) ? val : [val]).map((a) => (isPlainObject(a) ? String((a as Record<string, unknown>).label ?? '') : String(a)));
        break;
      case 'children':
        if (!Array.isArray(val)) issues.errors.push(`${p}: expected an array.`);
        else out.children = val.map((c, i) => normalizeSpec(c, `${p}[${i}]`, issues, { partial: false }));
        break;
    }
  }
  if (fontTouched) out.font = font;
  if (srcForFill) out.fill = [...(out.fill ?? []), { kind: 'image', src: srcForFill, fit: out.fit ?? 'fill' }];
  if (out.device) {
    const [dw, dh] = DEVICES[out.device];
    if (out.w === undefined) out.w = dw;
    if (out.h === undefined) out.h = dh;
  }
  if (out.prompt !== undefined && !out.prompt.trim()) delete out.prompt;
  if (out.supply !== undefined && !out.supply.trim()) delete out.supply;
  if (out.prompt !== undefined && out.supply !== undefined) {
    issues.warnings.push(`${path}: both prompt and supply — an image is either generated (prompt) or supplied by the user (supply); supply ignored.`);
    delete out.supply;
  }

  // 3. structural checks
  if (!opts.partial) {
    if (out.children && type && !CONTAINER_TYPES.has(type)) {
      issues.errors.push(`${path}: a "${type}" cannot have children (only frame, component, group, section). Wrap it in a frame.`);
    }
    if (type === 'instance' && !out.component) issues.errors.push(`${path}: an instance needs "component" (name, key or id).`);
    if (type === 'icon' && !out.icon) issues.errors.push(`${path}: an icon needs "icon", e.g. "lucide:search".`);
    if (type === 'icon' && out.icon && !out.icon.includes(':')) issues.errors.push(`${path}.icon: use "set:name", e.g. "lucide:${out.icon}".`);
    if (type === 'svg' && !out.svg) issues.errors.push(`${path}: an svg node needs "svg" markup.`);
    if (type === 'text' && out.text === undefined && !out.segments) issues.errors.push(`${path}: a text node needs "text".`);
    if (type === 'image' && !out.src && !out.imageData && !out.prompt && !out.supply) {
      issues.warnings.push(`${path}: image without src — add "prompt" (what the image shows: subject, setting, style, light) so it is listed in IMAGE_PROMPTS.md for the user to generate (or "supply" for a real file the user has: logo, product photo).`);
    }
    if (type === 'group' && !(out.children && out.children.length)) issues.errors.push(`${path}: a group needs children.`);
    // Related content belongs in auto layout; hand-placed layouts drift and do not translate to code.
    if (out.dir === 'none' && (type === 'frame' || type === 'component') && (out.children?.filter((c) => !c.absolute).length ?? 0) >= 2) {
      issues.warnings.push(`${path}: ${out.children!.length} children placed by hand (dir: "none") — put related content in auto layout (dir "row" | "column" | "grid"); keep free placement for overlays only (absolute: true on those children).`);
    }
    if (type === 'group' && (out.children?.length ?? 0) > 1) issues.warnings.push(`${path}: a group is not a layout container — use a frame (auto layout by default) so spacing and resizing work.`);
    if (out.dir === 'grid' && !out.cols) issues.errors.push(`${path}: a grid needs "cols".`);
  }
  return out;
}

/** Walks a spec tree depth-first (children and instance overrides). */
export function walkSpec(spec: Spec, visit: (s: Spec, path: string) => void, path = 'spec'): void {
  visit(spec, path);
  spec.children?.forEach((c, i) => walkSpec(c, visit, `${path}.children[${i}]`));
  if (spec.overrides) for (const [k, o] of Object.entries(spec.overrides)) walkSpec(o as Spec, visit, `${path}.overrides.${k}`);
}

// ───────────────────────── variants ─────────────────────────

export interface VariantPatch {
  when: Record<string, string | string[]>;
  set: Record<string, unknown>;
}

export interface VariantsInput {
  axes: Record<string, string[]>;
  patches?: VariantPatch[];
  exclude?: Array<Record<string, string | string[]>>;
}

export interface ExpandedVariant {
  props: Record<string, string>;
  name: string;
  spec: unknown;
}

const matches = (props: Record<string, string>, cond: Record<string, string | string[]>) =>
  Object.entries(cond).every(([k, v]) => (Array.isArray(v) ? v.map(String).includes(props[k]) : String(v) === props[k]));

function patchByRef(node: unknown, ref: string, patch: unknown): boolean {
  if (!isPlainObject(node)) return false;
  let hit = false;
  const n = node as Record<string, unknown>;
  if (n.ref === ref) {
    Object.assign(n, deepMerge({ ...n }, patch));
    hit = true;
  }
  if (Array.isArray(n.children)) for (const c of n.children) hit = patchByRef(c, ref, patch) || hit;
  return hit;
}

/** Cartesian product of the axes with conditional patches applied to the base spec (raw JSON). */
export function expandVariants(base: unknown, input: VariantsInput, issues: Issues): ExpandedVariant[] {
  const axes = Object.entries(input.axes || {});
  if (!axes.length) {
    issues.errors.push('variants.axes: needs at least one axis, e.g. {"State": ["Default", "Hover"]}.');
    return [];
  }
  for (const [k, vals] of axes) {
    if (!Array.isArray(vals) || !vals.length) issues.errors.push(`variants.axes.${k}: expected a non-empty array of values.`);
    if (/[=,]/.test(k)) issues.errors.push(`variants.axes.${k}: property names cannot contain "=" or ",".`);
  }
  let combos: Array<Record<string, string>> = [{}];
  for (const [k, vals] of axes) {
    const next: Array<Record<string, string>> = [];
    for (const c of combos) for (const v of vals) next.push({ ...c, [k]: String(v) });
    combos = next;
  }
  if (input.exclude?.length) combos = combos.filter((c) => !input.exclude!.some((e) => matches(c, e)));
  if (combos.length > 200) issues.errors.push(`variants: ${combos.length} combinations is too many (max 200). Split into several sets or use exclude.`);
  const usedRefs = new Set<string>();
  const out = combos.map((props) => {
    let spec = JSON.parse(JSON.stringify(base));
    for (const patch of input.patches ?? []) {
      if (!patch || !isPlainObject(patch.set)) continue;
      if (!matches(props, patch.when ?? {})) continue;
      for (const [ref, val] of Object.entries(patch.set)) {
        if (ref === 'root') spec = deepMerge(spec, val);
        else if (!patchByRef(spec, ref, val)) issues.errors.push(`variants.patches: no node with ref ${JSON.stringify(ref)} in the base spec.`);
        usedRefs.add(ref);
      }
    }
    const name = Object.entries(props)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    return { props, name, spec };
  });
  return out;
}

// ───────────── assets (icons & images are fetched by the server, injected before building) ─────────────

export interface AssetMap {
  /** "lucide:search" → SVG markup */
  icons?: Record<string, string>;
  /** image src → base64 bytes, or SVG markup for .svg sources */
  images?: Record<string, { data?: string; svg?: string }>;
}

export function collectAssetRefs(spec: Spec, into = { icons: new Set<string>(), images: new Set<string>() }) {
  walkSpec(spec, (s) => {
    if (s.type === 'icon' && s.icon && !s.svg) into.icons.add(s.icon);
    if (s.type === 'image' && s.src && !s.imageData) into.images.add(s.src);
    for (const p of [...(s.fill ?? []), ...(s.color ?? [])]) if (p.kind === 'image' && p.src && !p.imageData) into.images.add(p.src);
  });
  return into;
}

/** Puts fetched icon SVGs and image bytes into the spec; returns problems for missing ones. */
export function applyAssets(spec: Spec, assets: AssetMap | undefined): string[] {
  const problems: string[] = [];
  walkSpec(spec, (s, path) => {
    if (s.type === 'icon' && s.icon && !s.svg) {
      const svg = assets?.icons?.[s.icon];
      if (svg) s.svg = svg;
      else problems.push(`${path}: icon "${s.icon}" was not loaded.`);
    }
    if (s.type === 'image' && s.src && !s.imageData) {
      const img = assets?.images?.[s.src];
      if (img?.svg) {
        s.type = 'svg';
        s.svg = img.svg;
      } else if (img?.data) s.imageData = img.data;
      else problems.push(`${path}: image "${s.src}" was not loaded.`);
    }
    for (const p of [...(s.fill ?? []), ...(s.color ?? [])]) {
      if (p.kind === 'image' && p.src && !p.imageData) {
        const img = assets?.images?.[p.src];
        if (img?.data) p.imageData = img.data;
        else problems.push(`${path}: image fill "${p.src}" was not loaded${img?.svg ? ' (SVG cannot be an image fill; use a {type: "svg"} node)' : ''}.`);
      }
    }
  });
  return problems;
}
