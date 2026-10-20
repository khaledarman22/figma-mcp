// Reference code from an extracted design tree.
//
// One CSS model per node (declarations that mirror Figma's layout engine: auto layout → flex/grid,
// fill/hug/fixed → flex rules, constraints → absolute offsets, variables → var(--token, fallback)),
// then two renderers: React + Tailwind (classes, arbitrary values where needed) and HTML + CSS.

import { kebab, pascal, camel } from '../shared/util.ts';

// Mirrors plugin/extract.ts (kept structural to avoid importing plugin code on the server).
export interface XPaintS { t: 'solid'; c: string; v?: string }
export interface XPaintG { t: 'gradient'; kind: 'linear' | 'radial' | 'angular' | 'diamond'; angle?: number; stops: Array<{ c: string; p: number; v?: string }> }
export interface XPaintI { t: 'image'; ref: string; fit: string }
export type XPaint = XPaintS | XPaintG | XPaintI;
export type XEffect = { t: 'shadow' | 'inner'; x: number; y: number; blur: number; spread: number; c: string; v?: string } | { t: 'blur' | 'bg-blur'; r: number };
export interface XFont { family: string; style: string; weight: number; italic?: boolean; size: number; lh: number | string; ls: number | string; case?: string; deco?: string }
export interface XNode {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: true;
  layout?: { dir: 'row' | 'column' | 'grid'; gap?: number; between?: true; rowGap?: number; colGap?: number; cols?: number; rows?: number; pad?: [number, number, number, number]; justify?: string; align?: string; wrap?: true };
  sizing?: { w: 'fixed' | 'hug' | 'fill'; h: 'fixed' | 'hug' | 'fill' };
  abs?: true;
  constraints?: { h: string; v: string };
  min?: { w?: number; h?: number };
  max?: { w?: number; h?: number };
  cell?: { row: number; col: number; rowSpan: number; colSpan: number };
  fills?: XPaint[];
  strokes?: XPaint[];
  strokeW?: number | [number, number, number, number];
  strokeAlign?: string;
  dash?: number[];
  radius?: number | [number, number, number, number];
  effects?: XEffect[];
  opacity?: number;
  blend?: string;
  clip?: true;
  rotation?: number;
  vars?: Record<string, string>;
  styles?: { fill?: string; stroke?: string; text?: string; effect?: string };
  text?: { chars: string; font: XFont; align: string; valign: string; autoResize: string; maxLines?: number; segs?: Array<{ chars: string; font?: Partial<XFont>; fills?: XPaint[]; link?: string }>; link?: string };
  comp?: { kind: 'instance' | 'component' | 'set'; name: string; variant?: Record<string, string>; props?: Record<string, string | boolean>; key?: string };
  asset?: { kind: 'svg' | 'image'; id: string };
  reactions?: Array<{ trigger: string; action: string; to?: string; toName?: string; transition?: string; url?: string }>;
  children?: XNode[];
  more?: number;
}
export interface XVar { name: string; collection: string; type: string; css: string; value: string | number | boolean; modes?: Record<string, string | number | boolean> }

export interface ComponentMapping {
  import?: string;
  name: string;
  /** figma prop/variant name → code prop ("children" for text content), or {prop, values} */
  props?: Record<string, string | { prop: string; values?: Record<string, string> }>;
}

export interface GenOptions {
  framework: 'react-tailwind' | 'html-css';
  /** asset id → path/url used in code */
  assetPaths: Record<string, string>;
  vars: Record<string, XVar>;
  nodeIds?: boolean;
  componentMap?: Record<string, ComponentMapping>;
  /** extraction context */
  topLevel: boolean;
}

type Decl = [string, string];

interface El {
  x: XNode;
  tag: string;
  css: Decl[];
  attrs: Array<[string, string, boolean?]>; // [name, value, isExpression]
  children: El[];
  text?: Array<{ chars: string; css: Decl[]; link?: string }>;
  comment?: string;
  selfClose?: boolean;
  use?: { name: string; props: Array<[string, string | boolean]>; children?: string; layoutCss: Decl[] };
  className?: string;
}

/** Properties that place an element inside its parent (kept when a component is used by reference). */
const OUTER_LAYOUT = new Set(['flex', 'flex-shrink', 'align-self', 'justify-self', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'position', 'left', 'right', 'top', 'bottom', 'transform', 'grid-column', 'grid-row']);

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const isZero = (n: number | undefined) => !n || Math.abs(n) < 0.005;

function hex(c: string): string {
  const s = c.toLowerCase();
  if (s.length === 9) {
    const a = parseInt(s.slice(7, 9), 16) / 255;
    if (a >= 0.995) return s.slice(0, 7);
    const r = parseInt(s.slice(1, 3), 16);
    const g = parseInt(s.slice(3, 5), 16);
    const b = parseInt(s.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${Math.round(a * 1000) / 1000})`;
  }
  return s;
}

class Gen {
  o: GenOptions;
  usedVars = new Set<string>();
  usedAssets = new Set<string>();
  imports = new Map<string, Set<string>>();
  notes: string[] = [];
  private classNames = new Set<string>();

  constructor(o: GenOptions) {
    this.o = o;
  }

  v(name: string | undefined, fallback: string): string {
    if (!name) return fallback;
    this.usedVars.add(name);
    const css = this.o.vars[name]?.css ?? `--${kebab(name)}`;
    return `var(${css}, ${fallback})`;
  }

  color(p: XPaintS): string {
    return this.v(p.v, hex(p.c));
  }

  gradient(g: XPaintG): string {
    const stops = g.stops.map((s) => `${this.v(s.v, hex(s.c))} ${Math.round(s.p * 1000) / 10}%`).join(', ');
    if (g.kind === 'linear') return `linear-gradient(${g.angle ?? 180}deg, ${stops})`;
    if (g.kind === 'radial' || g.kind === 'diamond') return `radial-gradient(50% 50% at 50% 50%, ${stops})`;
    return `conic-gradient(from 90deg at 50% 50%, ${stops})`;
  }

  asset(id: string): string {
    this.usedAssets.add(id);
    return id;
  }

  // ───────────── layout & box ─────────────

  box(x: XNode, parent: XNode | null, isRoot: boolean, hasAbsChildren: boolean): Decl[] {
    const d: Decl[] = [];
    const vars = x.vars ?? {};
    const L = x.layout;
    if (L && !x.asset) {
      if (L.dir === 'grid') {
        d.push(['display', 'grid']);
        d.push(['grid-template-columns', `repeat(${L.cols ?? 1}, minmax(0, 1fr))`]);
        const cg = this.v(vars.gridColumnGap, px(L.colGap ?? 0));
        const rg = this.v(vars.gridRowGap, px(L.rowGap ?? 0));
        if (cg === rg) {
          if (cg !== '0px') d.push(['gap', cg]);
        } else {
          if (cg !== '0px') d.push(['column-gap', cg]);
          if (rg !== '0px') d.push(['row-gap', rg]);
        }
      } else {
        d.push(['display', 'flex']);
        if (L.dir === 'column') d.push(['flex-direction', 'column']);
        if (L.wrap) d.push(['flex-wrap', 'wrap']);
        const j = L.justify ?? 'start';
        if (L.between || j === 'between') d.push(['justify-content', 'space-between']);
        else if (j === 'center') d.push(['justify-content', 'center']);
        else if (j === 'end') d.push(['justify-content', 'flex-end']);
        else if (j === 'around') d.push(['justify-content', 'space-around']);
        else if (j === 'evenly') d.push(['justify-content', 'space-evenly']);
        const a = L.align ?? 'start';
        d.push(['align-items', a === 'center' ? 'center' : a === 'end' ? 'flex-end' : a === 'baseline' ? 'baseline' : 'flex-start']);
        if (!L.between && j !== 'between' && (!isZero(L.gap) || vars.itemSpacing)) {
          const g = this.v(vars.itemSpacing, px(L.gap ?? 0));
          if (L.wrap) {
            d.push(['column-gap', g]);
            d.push(['row-gap', this.v(vars.counterAxisSpacing, px(L.rowGap ?? L.gap ?? 0))]);
          } else d.push(['gap', g]);
        }
      }
      const p = L.pad ?? [0, 0, 0, 0];
      const side = (i: number, f: string) => this.v(vars[f], px(p[i]));
      const keys = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
      if (p.some((n, i) => !isZero(n) || vars[keys[i]])) {
        const vals = p.map((_, i) => side(i, keys[i]));
        if (vals.every((v) => v === vals[0])) d.push(['padding', vals[0]]);
        else if (vals[0] === vals[2] && vals[1] === vals[3]) d.push(['padding', `${vals[0]} ${vals[1]}`]);
        else d.push(['padding', vals.join(' ')]);
      }
    }
    if ((hasAbsChildren || (!L && x.children?.length)) && !x.asset) d.push(['position', 'relative']);

    const parentFlex = parent?.layout && parent.layout.dir !== 'grid';
    const parentGrid = parent?.layout?.dir === 'grid';
    const absolute = !isRoot && (!!x.abs || (!!parent && !parent.layout));
    const sizing = x.sizing ?? { w: 'fixed', h: 'fixed' };
    const W = this.v(vars.width, px(x.w));
    const H = this.v(vars.height, px(x.h));

    if (isRoot) {
      if (this.o.topLevel) {
        d.push(['width', '100%']);
        if (x.h >= 480) d.push(['min-height', '100vh']);
        else if (sizing.h === 'fixed') d.push(['height', H]);
      } else {
        if (sizing.w === 'fixed') d.push(['width', W]);
        if (sizing.h === 'fixed') d.push(['height', H]);
      }
    } else if (absolute && parent) {
      d.push(['position', 'absolute']);
      const c = x.constraints ?? { h: 'min', v: 'min' };
      const right = parent.w - x.x - x.w;
      const bottom = parent.h - x.y - x.h;
      const transforms: string[] = [];
      switch (c.h) {
        case 'max':
          d.push(['right', px(right)], ['width', W]);
          break;
        case 'center': {
          const off = x.x + x.w / 2 - parent.w / 2;
          d.push(['left', isZero(off) ? '50%' : `calc(50% + ${px(off)})`], ['width', W]);
          transforms.push('translateX(-50%)');
          break;
        }
        case 'stretch':
          d.push(['left', px(x.x)], ['right', px(right)]);
          break;
        case 'scale':
          d.push(['left', `${Math.round((x.x / parent.w) * 10000) / 100}%`], ['width', `${Math.round((x.w / parent.w) * 10000) / 100}%`]);
          break;
        default:
          d.push(['left', px(x.x)], ['width', W]);
      }
      switch (c.v) {
        case 'max':
          d.push(['bottom', px(bottom)], ['height', H]);
          break;
        case 'center': {
          const off = x.y + x.h / 2 - parent.h / 2;
          d.push(['top', isZero(off) ? '50%' : `calc(50% + ${px(off)})`], ['height', H]);
          transforms.push('translateY(-50%)');
          break;
        }
        case 'stretch':
          d.push(['top', px(x.y)], ['bottom', px(bottom)]);
          break;
        case 'scale':
          d.push(['top', `${Math.round((x.y / parent.h) * 10000) / 100}%`], ['height', `${Math.round((x.h / parent.h) * 10000) / 100}%`]);
          break;
        default:
          d.push(['top', px(x.y)], ['height', H]);
      }
      if (x.type === 'text' && sizing.h !== 'fixed' && x.text?.autoResize !== 'none') {
        // Text grows with content: drop the fixed height.
        const i = d.findIndex(([k]) => k === 'height');
        if (i >= 0) d.splice(i, 1);
        if (x.text?.autoResize === 'width-and-height') {
          const wi = d.findIndex(([k]) => k === 'width');
          if (wi >= 0) d.splice(wi, 1);
        }
      }
      if (transforms.length) d.push(['transform', transforms.join(' ')]);
    } else if (parentFlex && parent?.layout) {
      const row = parent.layout.dir === 'row';
      const main = row ? sizing.w : sizing.h;
      const cross = row ? sizing.h : sizing.w;
      if (main === 'fill') d.push(['flex', '1 1 0'], [row ? 'min-width' : 'min-height', '0']);
      else if (main === 'fixed') d.push([row ? 'width' : 'height', row ? W : H], ['flex-shrink', '0']);
      else d.push(['flex-shrink', '0']);
      if (cross === 'fill') d.push(['align-self', 'stretch']);
      else if (cross === 'fixed') d.push([row ? 'height' : 'width', row ? H : W]);
    } else if (parentGrid) {
      if (sizing.w === 'fixed') d.push(['width', W]);
      else if (sizing.w === 'hug') d.push(['justify-self', 'start']);
      if (sizing.h === 'fixed') d.push(['height', H]);
      else if (sizing.h === 'hug') d.push(['align-self', 'start']);
      if (x.cell) {
        if (x.cell.colSpan > 1) d.push(['grid-column', `span ${x.cell.colSpan} / span ${x.cell.colSpan}`]);
        if (x.cell.rowSpan > 1) d.push(['grid-row', `span ${x.cell.rowSpan} / span ${x.cell.rowSpan}`]);
      }
    }
    if (x.min?.w !== undefined) d.push(['min-width', this.v(vars.minWidth, px(x.min.w))]);
    if (x.max?.w !== undefined) d.push(['max-width', this.v(vars.maxWidth, px(x.max.w))]);
    if (x.min?.h !== undefined) d.push(['min-height', this.v(vars.minHeight, px(x.min.h))]);
    if (x.max?.h !== undefined) d.push(['max-height', this.v(vars.maxHeight, px(x.max.h))]);
    return d;
  }

  // ───────────── appearance ─────────────

  look(x: XNode, isImgEl: boolean): Decl[] {
    const d: Decl[] = [];
    const vars = x.vars ?? {};
    if (x.type !== 'text' && !x.asset?.kind?.startsWith('svg') && x.fills?.length && !isImgEl) {
      const fills = x.fills;
      if (fills.length === 1 && fills[0].t === 'solid') d.push(['background-color', this.color(fills[0])]);
      else {
        const layers = [...fills].reverse().map((f) => {
          if (f.t === 'solid') {
            const c = this.color(f);
            return `linear-gradient(${c}, ${c})`;
          }
          if (f.t === 'gradient') return this.gradient(f);
          const fit = f.fit === 'fit' ? 'contain' : f.fit === 'tile' ? 'auto' : 'cover';
          return `url("${this.asset(x.asset?.id ?? 'image')}") center / ${fit} ${f.fit === 'tile' ? 'repeat' : 'no-repeat'}`;
        });
        d.push(['background', layers.join(', ')]);
      }
    }
    if (x.strokes?.length && x.type !== 'text' && !x.asset) {
      const s = x.strokes[0];
      const color = s.t === 'solid' ? this.color(s) : s.t === 'gradient' ? hex(s.stops[0]?.c ?? '#000') : '#000';
      const style = x.dash?.length ? 'dashed' : 'solid';
      const w = x.strokeW ?? 1;
      if (x.strokeAlign === 'outside' && !Array.isArray(w)) {
        d.push(['outline', `${this.v(vars.strokeWeight, px(w))} ${style} ${color}`]);
      } else if (Array.isArray(w)) {
        const sides = ['top', 'right', 'bottom', 'left'];
        w.forEach((n, i) => {
          if (!isZero(n)) d.push([`border-${sides[i]}`, `${px(n)} ${style} ${color}`]);
        });
      } else d.push(['border', `${this.v(vars.strokeWeight, px(w))} ${style} ${color}`]);
    }
    if (x.type === 'ellipse' && !x.asset) d.push(['border-radius', '9999px']);
    else if (x.radius !== undefined && !x.asset?.kind?.startsWith('svg')) {
      if (Array.isArray(x.radius)) {
        const [a, b, c, e] = x.radius;
        if (a === b && b === c && c === e) d.push(['border-radius', a >= 999 ? '9999px' : this.v(vars.topLeftRadius, px(a))]);
        else d.push(['border-radius', `${px(a)} ${px(b)} ${px(c)} ${px(e)}`]);
      } else if (x.radius >= Math.min(x.w, x.h) / 2 - 0.5 && x.radius >= 999) d.push(['border-radius', '9999px']);
      else d.push(['border-radius', this.v(vars.topLeftRadius ?? vars.cornerRadius, px(x.radius))]);
    }
    const shadows: string[] = [];
    for (const e of x.effects ?? []) {
      if ('r' in e) d.push([e.t === 'blur' ? 'filter' : 'backdrop-filter', `blur(${px(e.r / 2)})`]);
      else shadows.push(`${e.t === 'inner' ? 'inset ' : ''}${px(e.x)} ${px(e.y)} ${px(e.blur)} ${px(e.spread)} ${this.v(e.v, hex(e.c))}`);
    }
    if (shadows.length) d.push(['box-shadow', shadows.join(', ')]);
    if (x.opacity !== undefined && x.opacity < 1) d.push(['opacity', vars.opacity ? this.v(vars.opacity, String(x.opacity)) : String(x.opacity)]);
    if (x.blend) d.push(['mix-blend-mode', x.blend]);
    if (x.clip) d.push(['overflow', 'hidden']);
    if (x.rotation) d.push(['rotate', `${Math.round(-x.rotation * 100) / 100}deg`]);
    return d;
  }

  font(f: Partial<XFont>, vars: Record<string, string>, base?: XFont): Decl[] {
    const d: Decl[] = [];
    if (f.family && f.family !== base?.family) d.push(['font-family', this.v(vars.fontFamily, /\s/.test(f.family) ? `"${f.family}"` : f.family)]);
    if (f.weight !== undefined && f.weight !== base?.weight) d.push(['font-weight', this.v(vars.fontWeight, String(f.weight))]);
    if (f.italic && !base?.italic) d.push(['font-style', 'italic']);
    if (f.size !== undefined && f.size !== base?.size) d.push(['font-size', this.v(vars.fontSize, px(f.size))]);
    if (f.lh !== undefined && f.lh !== base?.lh) {
      const lh = typeof f.lh === 'number' ? px(f.lh) : f.lh === 'auto' ? 'normal' : String(Math.round(parseFloat(f.lh) * 10) / 1000);
      d.push(['line-height', this.v(vars.lineHeight, lh)]);
    }
    if (f.ls !== undefined && f.ls !== base?.ls && !(f.ls === 0 || f.ls === '0%')) {
      const ls = typeof f.ls === 'number' ? px(f.ls) : `${Math.round(parseFloat(f.ls) * 100) / 10000}em`;
      d.push(['letter-spacing', this.v(vars.letterSpacing, ls)]);
    }
    if (f.case && f.case !== base?.case) d.push(['text-transform', f.case === 'upper' ? 'uppercase' : f.case === 'lower' ? 'lowercase' : f.case === 'title' ? 'capitalize' : 'none']);
    if (f.deco && f.deco !== base?.deco) d.push(['text-decoration', f.deco === 'strikethrough' ? 'line-through' : 'underline']);
    return d;
  }

  textCss(x: XNode): Decl[] {
    const t = x.text!;
    const d = this.font(t.font, x.vars ?? {});
    const fill = x.fills?.[0];
    if (fill?.t === 'solid') d.push(['color', this.color(fill)]);
    else if (fill?.t === 'gradient') d.push(['background', this.gradient(fill)], ['-webkit-background-clip', 'text'], ['background-clip', 'text'], ['color', 'transparent']);
    if (t.align && t.align !== 'left') d.push(['text-align', t.align === 'justified' ? 'justify' : t.align]);
    if (t.maxLines === 1) d.push(['@truncate', '1']);
    else if (t.maxLines && t.maxLines > 1) d.push(['@line-clamp', String(t.maxLines)]);
    else if (t.autoResize === 'width_and_height' || t.autoResize === 'width-and-height') d.push(['white-space', t.chars.includes('\n') ? 'pre' : 'nowrap']);
    else if (t.chars.includes('\n')) d.push(['white-space', 'pre-wrap']);
    return d;
  }

  // ───────────── elements ─────────────

  tagFor(x: XNode, parentTag: string): string {
    const n = x.name.toLowerCase();
    if (x.type === 'text') {
      if (x.text?.link) return 'a';
      if (['button', 'a', 'label'].includes(parentTag)) return 'span';
      const style = (x.styles?.text ?? '').toLowerCase();
      const h = style.match(/(?:^|[\s/_-])h([1-6])(?:$|[\s/_-])/) ?? n.match(/^h([1-6])$/);
      if (h) return `h${h[1]}`;
      return 'p';
    }
    if (x.type === 'frame' || x.type === 'instance' || x.type === 'component' || x.type === 'group') {
      // Nested buttons/inputs/links (frames or instances, not their text labels) make this a container.
      const hasInteractive = (y: XNode): boolean => !!y.children?.some((c) => (c.type !== 'text' && /button|btn|input|link/.test(c.name.toLowerCase())) || hasInteractive(c));
      if (/(^|\b|[\s/_-])(button|btn|cta)(\b|$|[\s/_-])/.test(n) && !hasInteractive(x)) return 'button';
      if (/(^|[\s/_-])(nav|navbar|navigation|tab ?bar|bottom ?nav|sidebar)($|[\s/_-])/.test(n)) return 'nav';
      if (/(^|[\s/_-])header($|[\s/_-])/.test(n)) return 'header';
      if (/(^|[\s/_-])footer($|[\s/_-])/.test(n)) return 'footer';
      if (/(^|[\s/_-])section($|[\s/_-])/.test(n)) return 'section';
      if (x.reactions?.some((r) => r.action === 'url')) return 'a';
    }
    return 'div';
  }

  el(x: XNode, parent: XNode | null, parentTag: string, isRoot = false): El {
    const hasAbsChildren = !!x.children?.some((c) => c.abs) || (!x.layout && !!x.children?.length);
    const tag0 = this.tagFor(x, parentTag);
    // Assets: vector art and childless image boxes render as <img>.
    const imgFill = !x.children?.length && x.asset?.kind === 'image';
    if (x.asset?.kind === 'svg' || imgFill) {
      const css = this.box(x, parent, isRoot, false);
      if (imgFill) {
        const f = x.fills?.find((p) => p.t === 'image') as XPaintI | undefined;
        css.push(['object-fit', f?.fit === 'fit' ? 'contain' : 'cover']);
        css.push(...this.look(x, true));
      } else {
        css.push(['display', 'block'], ['max-width', 'none']);
        if (x.opacity !== undefined && x.opacity < 1) css.push(['opacity', String(x.opacity)]);
      }
      // <img> is a replaced element: it never stretches on its own, so spell out fill and fixed sizes.
      const sz = x.sizing ?? { w: 'fixed', h: 'fixed' };
      const has = (k: string) => css.some(([p]) => p === k);
      if (!x.abs && !isRoot) {
        if (!has('width') && !has('flex') && !(has('align-self') && parent?.layout?.dir === 'column')) css.push(['width', sz.w === 'fill' ? '100%' : px(x.w)]);
        if (!has('height') && !(has('flex') && parent?.layout?.dir === 'column') && !(has('align-self') && parent?.layout?.dir === 'row')) css.push(['height', sz.h === 'fill' ? '100%' : px(x.h)]);
      }
      return { x, tag: 'img', css, attrs: [['src', this.asset(x.asset!.id), true], ['alt', '']], children: [], selfClose: true };
    }

    // Mapped components replace the whole subtree.
    if (x.comp?.kind === 'instance') {
      const map = this.o.componentMap?.[x.comp.name];
      if (map) {
        const props: Array<[string, string | boolean]> = [];
        let children: string | undefined;
        const all = { ...(x.comp.variant ?? {}), ...(x.comp.props ?? {}) };
        for (const [figmaProp, value] of Object.entries(all)) {
          const rule = map.props?.[figmaProp];
          if (!rule) continue;
          const prop = typeof rule === 'string' ? rule : rule.prop;
          const val = typeof rule === 'string' ? value : rule.values?.[String(value)] ?? value;
          if (prop === 'children') children = String(val);
          else if (val !== false) props.push([prop, val]);
        }
        const [mod, name] = map.import ? [map.import, map.name.split('.')[0]] : [null, map.name];
        if (mod) {
          const set = this.imports.get(mod) ?? new Set<string>();
          set.add(name);
          this.imports.set(mod, set);
        }
        const layoutCss = this.box(x, parent, isRoot, false).filter(([k]) => OUTER_LAYOUT.has(k));
        return { x, tag: map.name, css: [], attrs: [], children: [], use: { name: map.name, props, children, layoutCss } };
      }
    }

    // Instances whose internals were not extracted (instances: "reference"): emit a placeholder usage.
    if (x.comp?.kind === 'instance' && !x.children?.length && !x.text && x.more === undefined && (x.type === 'instance')) {
      const name = pascal(x.comp.name.split('/').pop() ?? x.comp.name);
      const props: Array<[string, string | boolean]> = [];
      for (const [k, v] of Object.entries({ ...(x.comp.variant ?? {}), ...(x.comp.props ?? {}) })) if (v !== false) props.push([camel(k), v]);
      const layoutCss = this.box(x, parent, isRoot, false).filter(([k]) => OUTER_LAYOUT.has(k));
      this.notes.push(`<${name}> stands for the Figma component "${x.comp.name}" — use the project's equivalent.`);
      return { x, tag: name, css: [], attrs: [], children: [], use: { name, props, layoutCss } };
    }

    const css = [...this.box(x, parent, isRoot, hasAbsChildren), ...this.look(x, false)];
    const e: El = { x, tag: tag0, css, attrs: [], children: [] };
    if (x.comp?.kind === 'instance') {
      const v = x.comp.variant ? Object.entries(x.comp.variant).map(([k, val]) => `${k}=${val}`).join(', ') : '';
      const pr = x.comp.props ? Object.entries(x.comp.props).map(([k, val]) => `${k}=${JSON.stringify(val)}`).join(', ') : '';
      e.comment = `${x.comp.name}${v ? ` (${v})` : ''}${pr ? ` · ${pr}` : ''}`;
    }
    if (x.type === 'text' && x.text) {
      e.css.push(...this.textCss(x));
      const base = x.text.font;
      if (x.text.segs?.length) {
        e.text = x.text.segs.map((s) => {
          const d = this.font(s.font ?? {}, {}, base);
          const f = s.fills?.[0];
          if (f?.t === 'solid') d.push(['color', this.color(f)]);
          return { chars: s.chars, css: d, link: s.link };
        });
      } else e.text = [{ chars: x.text.chars, css: [] }];
      if (x.text.link) e.attrs.push(['href', x.text.link]);
    }
    if (tag0 === 'button') e.attrs.push(['type', 'button']);
    const url = x.reactions?.find((r) => r.action === 'url')?.url;
    if (tag0 === 'a' && url) e.attrs.push(['href', url]);
    for (const c of x.children ?? []) {
      if (c.hidden) continue;
      e.children.push(this.el(c, x, tag0));
    }
    if (x.more) this.notes.push(`"${x.name}" (${x.id}) has ${x.more} more children not included — call get_design_context on it.`);
    return e;
  }

  // ───────────── React + Tailwind ─────────────

  tw(prop: string, value: string): string[] {
    const v = value.trim();
    const arb = (s: string) => s.replace(/,\s+/g, ',').replace(/\s+/g, '_');
    const isVar = v.startsWith('var(');
    switch (prop) {
      case 'display':
        return [v === 'flex' ? 'flex' : v === 'grid' ? 'grid' : v === 'block' ? 'block' : `[display:${v}]`];
      case 'flex-direction':
        return v === 'column' ? ['flex-col'] : [];
      case 'flex-wrap':
        return ['flex-wrap'];
      case 'justify-content':
        return [{ center: 'justify-center', 'flex-end': 'justify-end', 'space-between': 'justify-between', 'space-around': 'justify-around', 'space-evenly': 'justify-evenly' }[v] ?? ''];
      case 'align-items':
        return [{ 'flex-start': 'items-start', center: 'items-center', 'flex-end': 'items-end', baseline: 'items-baseline', stretch: 'items-stretch' }[v] ?? ''];
      case 'align-self':
        return [{ stretch: 'self-stretch', start: 'self-start', 'flex-start': 'self-start' }[v] ?? `self-[${v}]`];
      case 'justify-self':
        return [v === 'start' ? 'justify-self-start' : `justify-self-[${v}]`];
      case 'gap':
        return [`gap-[${arb(v)}]`];
      case 'column-gap':
        return [`gap-x-[${arb(v)}]`];
      case 'row-gap':
        return [`gap-y-[${arb(v)}]`];
      case 'padding': {
        const parts = v.match(/var\([^)]*\)|\S+/g) ?? [v];
        if (parts.length === 1) return [`p-[${arb(parts[0])}]`];
        if (parts.length === 2) return [parts[0] === '0px' ? '' : `py-[${arb(parts[0])}]`, parts[1] === '0px' ? '' : `px-[${arb(parts[1])}]`];
        const [t, r, b, l] = parts;
        const out: string[] = [];
        if (t === b && r === l) return [`py-[${arb(t)}]`, `px-[${arb(r)}]`];
        if (t !== '0px') out.push(`pt-[${arb(t)}]`);
        if (r === l) {
          if (r !== '0px') out.push(`px-[${arb(r)}]`);
        } else {
          if (r !== '0px') out.push(`pr-[${arb(r)}]`);
          if (l !== '0px') out.push(`pl-[${arb(l)}]`);
        }
        if (b !== '0px') out.push(`pb-[${arb(b)}]`);
        return out;
      }
      case 'width':
        return [v === '100%' ? 'w-full' : `w-[${arb(v)}]`];
      case 'height':
        return [v === '100%' ? 'h-full' : `h-[${arb(v)}]`];
      case 'min-width':
        return [v === '0' ? 'min-w-0' : `min-w-[${arb(v)}]`];
      case 'min-height':
        return [v === '0' ? 'min-h-0' : v === '100vh' ? 'min-h-screen' : `min-h-[${arb(v)}]`];
      case 'max-width':
        return [v === 'none' ? 'max-w-none' : `max-w-[${arb(v)}]`];
      case 'max-height':
        return [`max-h-[${arb(v)}]`];
      case 'flex':
        return [v === '1 1 0' ? 'flex-1' : `flex-[${arb(v)}]`];
      case 'flex-shrink':
        return [v === '0' ? 'shrink-0' : `shrink-[${v}]`];
      case 'position':
        return [v];
      case 'left':
      case 'right':
      case 'top':
      case 'bottom':
        return [v === '50%' ? `${prop}-1/2` : `${prop}-[${arb(v)}]`];
      case 'transform':
        return v
          .split(/\s+(?=translate)/)
          .map((t) => (t === 'translateX(-50%)' ? '-translate-x-1/2' : t === 'translateY(-50%)' ? '-translate-y-1/2' : `[transform:${arb(t)}]`));
      case 'grid-template-columns': {
        const m = v.match(/^repeat\((\d+), minmax\(0, 1fr\)\)$/);
        return [m && Number(m[1]) <= 12 ? `grid-cols-${m[1]}` : `grid-cols-[${arb(v)}]`];
      }
      case 'grid-column': {
        const m = v.match(/^span (\d+)/);
        return [m ? `col-span-${m[1]}` : `[grid-column:${arb(v)}]`];
      }
      case 'grid-row': {
        const m = v.match(/^span (\d+)/);
        return [m ? `row-span-${m[1]}` : `[grid-row:${arb(v)}]`];
      }
      case 'background-color':
        return [`bg-[${arb(v)}]`];
      case 'background':
        return [`bg-[${arb(v)}]`];
      case 'color':
        return [isVar ? `text-[color:${arb(v)}]` : v === 'transparent' ? 'text-transparent' : `text-[${arb(v)}]`];
      case 'border': {
        const m = v.match(/^(var\([^)]*\)|\S+) (solid|dashed) (.+)$/);
        if (!m) return [`[border:${arb(v)}]`];
        const out = [m[1] === '1px' ? 'border' : `border-[length:${arb(m[1])}]`, m[2] === 'dashed' ? 'border-dashed' : 'border-solid', `border-[color:${arb(m[3])}]`];
        return out;
      }
      case 'border-top':
      case 'border-right':
      case 'border-bottom':
      case 'border-left': {
        const s = { 'border-top': 't', 'border-right': 'r', 'border-bottom': 'b', 'border-left': 'l' }[prop];
        const m = v.match(/^(\S+) (solid|dashed) (.+)$/);
        if (!m) return [`[${prop}:${arb(v)}]`];
        return [m[1] === '1px' ? `border-${s}` : `border-${s}-[length:${arb(m[1])}]`, m[2] === 'dashed' ? 'border-dashed' : 'border-solid', `border-${s}-[color:${arb(m[3])}]`];
      }
      case 'outline': {
        const m = v.match(/^(var\([^)]*\)|\S+) (solid|dashed) (.+)$/);
        if (!m) return [`[outline:${arb(v)}]`];
        return [`outline-[length:${arb(m[1])}]`, m[2] === 'dashed' ? 'outline-dashed' : 'outline-solid', `outline-[color:${arb(m[3])}]`];
      }
      case 'border-radius':
        if (v === '9999px') return ['rounded-full'];
        if (/^\S+ \S+ \S+ \S+$/.test(v) && !isVar) {
          const [a, b, c, d] = v.split(' ');
          return [`rounded-tl-[${a}]`, `rounded-tr-[${b}]`, `rounded-br-[${c}]`, `rounded-bl-[${d}]`].filter((cls) => !cls.includes('[0px]'));
        }
        return [`rounded-[${arb(v)}]`];
      case 'box-shadow':
        return [`shadow-[${arb(v)}]`];
      case 'filter': {
        const m = v.match(/^blur\((.+)\)$/);
        return [m ? `blur-[${arb(m[1])}]` : `[filter:${arb(v)}]`];
      }
      case 'backdrop-filter': {
        const m = v.match(/^blur\((.+)\)$/);
        return [m ? `backdrop-blur-[${arb(m[1])}]` : `[backdrop-filter:${arb(v)}]`];
      }
      case 'opacity':
        return [`opacity-[${arb(v)}]`];
      case 'mix-blend-mode':
        return [`mix-blend-${v}`];
      case 'overflow':
        return [v === 'hidden' ? 'overflow-hidden' : `overflow-${v}`];
      case 'rotate':
        return [`rotate-[${v}]`];
      case 'font-family':
        return [isVar ? `font-[family-name:${arb(v)}]` : `font-['${v.replace(/"/g, '').replace(/\s+/g, '_')}']`];
      case 'font-weight': {
        const map: Record<string, string> = { '100': 'font-thin', '200': 'font-extralight', '300': 'font-light', '400': 'font-normal', '500': 'font-medium', '600': 'font-semibold', '700': 'font-bold', '800': 'font-extrabold', '900': 'font-black' };
        return [map[v] ?? `font-[${arb(v)}]`];
      }
      case 'font-style':
        return ['italic'];
      case 'font-size':
        return [isVar ? `text-[length:${arb(v)}]` : `text-[${v}]`];
      case 'line-height':
        return [v === 'normal' ? 'leading-normal' : `leading-[${arb(v)}]`];
      case 'letter-spacing':
        return [`tracking-[${arb(v)}]`];
      case 'text-transform':
        return [{ uppercase: 'uppercase', lowercase: 'lowercase', capitalize: 'capitalize', none: 'normal-case' }[v] ?? ''];
      case 'text-decoration':
        return [v === 'line-through' ? 'line-through' : 'underline'];
      case 'text-align':
        return [`text-${v}`];
      case 'white-space':
        return [{ nowrap: 'whitespace-nowrap', pre: 'whitespace-pre', 'pre-wrap': 'whitespace-pre-wrap' }[v] ?? `whitespace-[${v}]`];
      case 'object-fit':
        return [`object-${v}`];
      case '@truncate':
        return ['truncate'];
      case '@line-clamp':
        return [`line-clamp-${v}`];
      case '-webkit-background-clip':
        return [];
      case 'background-clip':
        return ['bg-clip-text'];
      default:
        return [`[${prop}:${arb(v)}]`];
    }
  }

  classes(css: Decl[]): string {
    const out: string[] = [];
    for (const [p, v] of css) for (const c of this.tw(p, v)) if (c && !out.includes(c)) out.push(c);
    return out.join(' ');
  }

  jsxText(s: string): string {
    if (/[{}<>\n]|^\s|\s$/.test(s)) return `{${JSON.stringify(s)}}`;
    return s.replace(/&/g, '&amp;');
  }

  attrsJsx(e: El): string {
    const parts: string[] = [];
    const cls = this.classes(e.css);
    if (cls) parts.push(`className="${cls}"`);
    for (const [k, v, expr] of e.attrs) parts.push(expr ? `${k}={${camel(v)}}` : `${k}="${v.replace(/"/g, '&quot;')}"`);
    if (this.o.nodeIds !== false) {
      parts.push(`data-node-id="${e.x.id}"`);
      if (!/^(Frame|Rectangle|Group|Vector|Ellipse|Text)( \d+)?$/.test(e.x.name) && e.x.type !== 'text') parts.push(`data-name="${e.x.name.replace(/"/g, '&quot;')}"`);
    }
    return parts.length ? ' ' + parts.join(' ') : '';
  }

  jsx(e: El, ind: string): string[] {
    const lines: string[] = [];
    if (e.comment) lines.push(`${ind}{/* ${e.comment.replace(/\*\//g, '* /')} */}`);
    if (e.use) {
      const props = e.use.props.map(([k, v]) => (v === true ? k : `${k}=${typeof v === 'string' ? JSON.stringify(v) : `{${v}}`}`));
      const cls = this.classes(e.use.layoutCss);
      if (cls) props.push(`className="${cls}"`);
      const open = `<${e.use.name}${props.length ? ' ' + props.join(' ') : ''}`;
      lines.push(e.use.children !== undefined ? `${ind}${open}>${this.jsxText(e.use.children)}</${e.use.name}>` : `${ind}${open} />`);
      return lines;
    }
    const a = this.attrsJsx(e);
    if (e.selfClose) {
      lines.push(`${ind}<${e.tag}${a} />`);
      return lines;
    }
    if (e.text) {
      const inner = e.text
        .map((s) => {
          if (!s.css.length && !s.link) return this.jsxText(s.chars);
          const cls = this.classes(s.css);
          const tag = s.link ? 'a' : 'span';
          const href = s.link ? ` href="${s.link}"` : '';
          return `<${tag}${cls ? ` className="${cls}"` : ''}${href}>${this.jsxText(s.chars)}</${tag}>`;
        })
        .join('');
      lines.push(`${ind}<${e.tag}${a}>${inner}</${e.tag}>`);
      return lines;
    }
    if (!e.children.length) {
      lines.push(`${ind}<${e.tag}${a} />`);
      return lines;
    }
    lines.push(`${ind}<${e.tag}${a}>`);
    for (const c of e.children) lines.push(...this.jsx(c, ind + '  '));
    lines.push(`${ind}</${e.tag}>`);
    return lines;
  }

  // ───────────── HTML + CSS ─────────────

  className(e: El): string {
    if (e.className) return e.className;
    let base = kebab(e.x.type === 'text' ? e.x.name.split(/\s+/).slice(0, 4).join(' ') : e.x.name).slice(0, 28) || e.tag;
    if (/^\d/.test(base)) base = `n-${base}`;
    let name = base;
    let i = 2;
    while (this.classNames.has(name)) name = `${base}-${i++}`;
    this.classNames.add(name);
    e.className = name;
    return name;
  }

  expandCss(css: Decl[]): Decl[] {
    const out: Decl[] = [];
    for (const [p, v] of css) {
      if (p === '@truncate') out.push(['overflow', 'hidden'], ['text-overflow', 'ellipsis'], ['white-space', 'nowrap']);
      else if (p === '@line-clamp') out.push(['display', '-webkit-box'], ['-webkit-line-clamp', v], ['-webkit-box-orient', 'vertical'], ['overflow', 'hidden']);
      else if (p === 'rotate') out.push(['transform', `rotate(${v})`]);
      else out.push([p, v]);
    }
    return out;
  }

  html(e: El, ind: string, rules: string[]): string[] {
    const lines: string[] = [];
    if (e.comment) lines.push(`${ind}<!-- ${e.comment.replace(/--/g, '—')} -->`);
    if (e.use) {
      const cls = this.className(e);
      if (e.use.layoutCss.length) rules.push(`.${cls} { ${this.expandCss(e.use.layoutCss).map(([p, v]) => `${p}: ${v};`).join(' ')} }`);
      lines.push(`${ind}<${kebab(e.use.name)} class="${cls}"${e.use.props.map(([k, v]) => ` ${kebab(k)}="${v}"`).join('')}>${e.use.children ?? ''}</${kebab(e.use.name)}>`);
      return lines;
    }
    const cls = this.className(e);
    const decls = this.expandCss(e.css);
    if (decls.length) rules.push(`.${cls} {\n${decls.map(([p, v]) => `  ${p}: ${v};`).join('\n')}\n}`);
    const attrs = [`class="${cls}"`];
    for (const [k, v, expr] of e.attrs) attrs.push(`${k}="${expr ? this.o.assetPaths[v] ?? `./assets/${v}` : v.replace(/"/g, '&quot;')}"`);
    if (this.o.nodeIds !== false) attrs.push(`data-node-id="${e.x.id}"`);
    const a = ' ' + attrs.join(' ');
    const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (e.selfClose) {
      lines.push(`${ind}<${e.tag}${a}>`);
      return lines;
    }
    if (e.text) {
      const inner = e.text
        .map((s) => {
          if (!s.css.length && !s.link) return escHtml(s.chars);
          const style = this.expandCss(s.css).map(([p, v]) => `${p}: ${v}`).join('; ');
          const tag = s.link ? 'a' : 'span';
          return `<${tag}${s.link ? ` href="${s.link}"` : ''}${style ? ` style="${style.replace(/"/g, "'")}"` : ''}>${escHtml(s.chars)}</${tag}>`;
        })
        .join('');
      lines.push(`${ind}<${e.tag}${a}>${inner}</${e.tag}>`);
      return lines;
    }
    if (!e.children.length) {
      lines.push(`${ind}<${e.tag}${a}></${e.tag}>`);
      return lines;
    }
    lines.push(`${ind}<${e.tag}${a}>`);
    for (const c of e.children) lines.push(...this.html(c, ind + '  ', rules));
    lines.push(`${ind}</${e.tag}>`);
    return lines;
  }

  rootVars(): string {
    if (!this.usedVars.size) return '';
    const lines = [':root {'];
    const modeBlocks = new Map<string, string[]>();
    for (const name of [...this.usedVars].sort()) {
      const v = this.o.vars[name];
      if (!v) continue;
      const fmt = (val: string | number | boolean) => (typeof val === 'number' ? (v.type === 'FLOAT' ? `${val}px` : String(val)) : typeof val === 'string' && val.startsWith('$') ? `var(--${kebab(val.slice(1))})` : String(val));
      lines.push(`  ${v.css}: ${fmt(v.value)};`);
      if (v.modes) {
        const entries = Object.entries(v.modes);
        for (const [mode, val] of entries.slice(1)) {
          const sel = `[data-${kebab(v.collection)}="${kebab(mode)}"]`;
          const block = modeBlocks.get(sel) ?? [];
          block.push(`  ${v.css}: ${fmt(val)};`);
          modeBlocks.set(sel, block);
        }
      }
    }
    if (lines.length === 1) return '';
    lines.push('}');
    for (const [sel, block] of modeBlocks) lines.push(`${sel} {`, ...block, '}');
    return lines.join('\n');
  }
}

export interface GenResult {
  code: string;
  css?: string;
  componentName: string;
  usedVars: string[];
  usedAssets: string[];
  notes: string[];
}

export function generate(root: XNode, o: GenOptions): GenResult {
  const g = new Gen(o);
  const tree = g.el(root, null, 'div', true);
  const name = pascal(root.name);
  if (o.framework === 'html-css') {
    const rules: string[] = [];
    const html = g.html(tree, '', rules).join('\n');
    const vars = g.rootVars();
    return { code: html, css: [vars, ...rules].filter(Boolean).join('\n\n'), componentName: name, usedVars: [...g.usedVars], usedAssets: [...g.usedAssets], notes: g.notes };
  }
  const body = g.jsx(tree, '    ').join('\n');
  const head: string[] = [];
  for (const [mod, names] of g.imports) head.push(`import { ${[...names].join(', ')} } from "${mod}";`);
  if (head.length) head.push('');
  for (const id of g.usedAssets) head.push(`const ${camel(id)} = ${JSON.stringify(o.assetPaths[id] ?? `./assets/${id}`)};`);
  if (g.usedAssets.size) head.push('');
  const code = [...head, `export default function ${name}() {`, '  return (', body, '  );', '}'].join('\n');
  return { code, componentName: name, usedVars: [...g.usedVars], usedAssets: [...g.usedAssets], notes: g.notes };
}
