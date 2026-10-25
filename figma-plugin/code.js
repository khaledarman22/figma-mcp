"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __objRest = (source, exclude) => {
    var target = {};
    for (var prop in source)
      if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
        target[prop] = source[prop];
    if (source != null && __getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(source)) {
        if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
          target[prop] = source[prop];
      }
    return target;
  };
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/shared/util.ts
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = new Array(b.length + 1);
      cur[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[b.length];
  }
  var norm = (s) => s.toLowerCase().replace(/[\s_\-./:]+/g, "");
  function suggest(input, candidates, max = 3) {
    const target = norm(input);
    const scored = [];
    const seen = /* @__PURE__ */ new Set();
    for (const c of candidates) {
      if (seen.has(c)) continue;
      seen.add(c);
      const n = norm(c);
      let score = levenshtein(target, n);
      if (n.includes(target) || target.includes(n)) score = Math.min(score, Math.abs(n.length - target.length) * 0.5);
      const lastSeg = norm(c.split("/").pop() || c);
      if (lastSeg === target) score = Math.min(score, 0.5);
      scored.push([score, c]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length);
    const limit = Math.max(2, target.length * 0.6);
    return scored.filter(([s]) => s <= limit).slice(0, max).map(([, c]) => c);
  }
  function didYouMean(input, candidates) {
    const s = suggest(input, candidates);
    return s.length ? ` Did you mean ${s.map((x) => JSON.stringify(x)).join(" or ")}?` : "";
  }
  function kebab(s) {
    return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^a-zA-Z0-9؀-ۿ]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  }
  function round(n, digits = 2) {
    const f = Math.pow(10, digits);
    return Math.round(n * f) / f;
  }
  function clip(s, n) {
    return s.length > n ? s.slice(0, Math.max(0, n - 1)) + "\u2026" : s;
  }
  function isPlainObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }
  function deepMerge(base, patch) {
    if (!isPlainObject(base) || !isPlainObject(patch)) return patch === void 0 ? base : patch;
    const out = __spreadValues({}, base);
    for (const [k, v] of Object.entries(patch)) {
      out[k] = isPlainObject(out[k]) && isPlainObject(v) ? deepMerge(out[k], v) : v;
    }
    return out;
  }
  function normalizeNodeId(input) {
    const s = String(input).trim();
    const m = s.match(/[?&]node-id=([^&#]+)/);
    if (m) return decodeURIComponent(m[1]).replace(/-/g, ":");
    if (/^I?\d+-\d+(;\d+-\d+)*$/.test(s)) return s.replace(/-/g, ":");
    return s;
  }
  function isSectionNumber(text) {
    const t = text.trim();
    if (!t || t.length > 60 || t.includes("\n")) return false;
    const num2 = "[0\u0660][1-9\u0661-\u0669]";
    const notData = "(?![\\d\u0660-\u0669]|\\s*[:/.,]\\s*[\\d\u0660-\u0669])";
    return new RegExp(`^[([/#\u2116]?\\s*${num2}${notData}`).test(t) || new RegExp(`(?:^|[\\s/\u2014\u2013-])${num2}[)\\]]?$`).test(t);
  }

  // src/shared/spec.ts
  var newIssues = () => ({ errors: [], warnings: [] });
  var CONTAINER_TYPES = /* @__PURE__ */ new Set(["frame", "component", "group", "section"]);
  var TYPE_ALIASES = {
    frame: ["frame"],
    box: ["frame"],
    div: ["frame"],
    container: ["frame"],
    view: ["frame"],
    stack: ["frame"],
    autolayout: ["frame"],
    "auto-layout": ["frame"],
    card: ["frame"],
    screen: ["frame"],
    page: ["frame"],
    row: ["frame", { dir: "row" }],
    hstack: ["frame", { dir: "row" }],
    "h-stack": ["frame", { dir: "row" }],
    horizontal: ["frame", { dir: "row" }],
    column: ["frame", { dir: "column" }],
    col: ["frame", { dir: "column" }],
    vstack: ["frame", { dir: "column" }],
    "v-stack": ["frame", { dir: "column" }],
    vertical: ["frame", { dir: "column" }],
    grid: ["frame", { dir: "grid" }],
    component: ["component"],
    text: ["text"],
    label: ["text"],
    heading: ["text"],
    paragraph: ["text"],
    p: ["text"],
    span: ["text"],
    title: ["text"],
    rect: ["rect"],
    rectangle: ["rect"],
    shape: ["rect"],
    ellipse: ["ellipse"],
    circle: ["ellipse"],
    oval: ["ellipse"],
    line: ["line"],
    polygon: ["polygon"],
    triangle: ["polygon"],
    star: ["star"],
    svg: ["svg"],
    vector: ["svg"],
    icon: ["icon"],
    image: ["image"],
    img: ["image"],
    photo: ["image"],
    picture: ["image"],
    instance: ["instance"],
    use: ["instance"],
    group: ["group"],
    section: ["section"]
  };
  var DEVICES = {
    // phones
    mobile: [393, 852],
    "iphone-16": [393, 852],
    "iphone-15": [393, 852],
    "iphone-16-plus": [430, 932],
    "iphone-16-pro": [402, 874],
    "iphone-16-pro-max": [440, 956],
    "iphone-17": [402, 874],
    "iphone-17-pro": [402, 874],
    "iphone-17-pro-max": [440, 956],
    "iphone-14": [390, 844],
    "iphone-13": [390, 844],
    "iphone-se": [375, 667],
    android: [412, 917],
    "android-compact": [412, 917],
    "android-small": [360, 800],
    "android-medium": [700, 840],
    "android-expanded": [1280, 800],
    // tablets
    tablet: [820, 1180],
    ipad: [820, 1180],
    "ipad-mini": [744, 1133],
    "ipad-pro-11": [834, 1194],
    "ipad-pro-13": [1032, 1376],
    // web / dashboard
    desktop: [1440, 1024],
    web: [1440, 1024],
    dashboard: [1440, 1024],
    laptop: [1280, 832],
    "macbook-air": [1280, 832],
    "macbook-pro-14": [1512, 982],
    "macbook-pro-16": [1728, 1117],
    "desktop-hd": [1920, 1080],
    // social & banners
    "instagram-post": [1080, 1080],
    "instagram-portrait": [1080, 1350],
    "instagram-story": [1080, 1920],
    "facebook-post": [1200, 630],
    "x-post": [1600, 900],
    "x-header": [1500, 500],
    "linkedin-post": [1200, 627],
    "linkedin-banner": [1584, 396],
    "youtube-thumbnail": [1280, 720],
    "youtube-banner": [2560, 1440],
    // display ads (IAB)
    "ad-leaderboard": [728, 90],
    "ad-billboard": [970, 250],
    "ad-medium-rectangle": [300, 250],
    "ad-large-rectangle": [336, 280],
    "ad-half-page": [300, 600],
    "ad-skyscraper": [160, 600],
    "ad-mobile-banner": [320, 50],
    "ad-large-mobile-banner": [320, 100]
  };
  var KNOWN_KEYS = /* @__PURE__ */ new Set([
    "type",
    "name",
    "ref",
    "description",
    "dir",
    "gap",
    "rowGap",
    "colGap",
    "cols",
    "rows",
    "pad",
    "align",
    "justify",
    "wrap",
    "alignContent",
    "clip",
    "w",
    "h",
    "minW",
    "maxW",
    "minH",
    "maxH",
    "x",
    "y",
    "absolute",
    "constraints",
    "rotation",
    "cell",
    "span",
    "fill",
    "stroke",
    "radius",
    "opacity",
    "blend",
    "effects",
    "visible",
    "locked",
    "modes",
    "text",
    "style",
    "font",
    "color",
    "textAlign",
    "valign",
    "maxLines",
    "truncate",
    "paragraphSpacing",
    "segments",
    "link",
    "component",
    "variant",
    "props",
    "overrides",
    "bind",
    "svg",
    "icon",
    "size",
    "strokeWidth",
    "src",
    "imageData",
    "fit",
    "placeholder",
    "prompt",
    "supply",
    "device",
    "mockup",
    "scroll",
    "fixed",
    "interactions",
    "rtl",
    "annotations",
    "children"
  ]);
  var KEY_ALIASES = {
    kind: "type",
    node: "type",
    nodeType: "type",
    width: "w",
    height: "h",
    minWidth: "minW",
    maxWidth: "maxW",
    minHeight: "minH",
    maxHeight: "maxH",
    direction: "dir",
    layout: "dir",
    layoutMode: "dir",
    flow: "dir",
    flexDirection: "dir",
    spacing: "gap",
    itemSpacing: "gap",
    counterAxisSpacing: "rowGap",
    rowSpacing: "rowGap",
    columnGap: "colGap",
    gridColumnGap: "colGap",
    gridRowGap: "rowGap",
    columns: "cols",
    gridColumnCount: "cols",
    gridRowCount: "rows",
    padding: "pad",
    p: "pad",
    alignItems: "align",
    counterAxisAlignItems: "align",
    crossAlign: "align",
    justifyContent: "justify",
    primaryAxisAlignItems: "justify",
    mainAlign: "justify",
    flexWrap: "wrap",
    layoutWrap: "wrap",
    counterAxisAlignContent: "alignContent",
    clipsContent: "clip",
    clipContent: "clip",
    fills: "fill",
    background: "fill",
    bg: "fill",
    backgroundColor: "fill",
    strokes: "stroke",
    border: "stroke",
    outline: "stroke",
    cornerRadius: "radius",
    borderRadius: "radius",
    rounded: "radius",
    shadow: "effects",
    shadows: "effects",
    effect: "effects",
    boxShadow: "effects",
    hidden: "visible",
    blendMode: "blend",
    mixBlendMode: "blend",
    mode: "modes",
    variableModes: "modes",
    characters: "text",
    content: "text",
    value: "text",
    textStyle: "style",
    typography: "style",
    textColor: "color",
    textAlignHorizontal: "textAlign",
    verticalAlign: "valign",
    textAlignVertical: "valign",
    lines: "maxLines",
    lineClamp: "maxLines",
    ellipsis: "truncate",
    href: "link",
    hyperlink: "link",
    mainComponent: "component",
    componentName: "component",
    componentKey: "component",
    variants: "variant",
    variantProps: "variant",
    properties: "props",
    componentProperties: "props",
    imageUrl: "src",
    url: "src",
    path: "src",
    image: "src",
    scaleMode: "fit",
    objectFit: "fit",
    imagePrompt: "prompt",
    generate: "prompt",
    provide: "supply",
    userImage: "supply",
    preset: "device",
    frameSize: "device",
    format: "device",
    deviceFrame: "mockup",
    chrome: "mockup",
    overflow: "scroll",
    overflowDirection: "scroll",
    interaction: "interactions",
    reactions: "interactions",
    prototype: "interactions",
    kids: "children",
    items: "children",
    nodes: "children",
    annotation: "annotations",
    notes: "annotations"
  };
  var FONT_KEYS = {
    fontFamily: "family",
    family: "family",
    fontStyle: "style",
    fontWeight: "weight",
    weight: "weight",
    fontSize: "size",
    lineHeight: "lineHeight",
    leading: "lineHeight",
    letterSpacing: "letterSpacing",
    tracking: "letterSpacing",
    textCase: "case",
    textTransform: "case",
    case: "case",
    textDecoration: "decoration",
    decoration: "decoration",
    italic: "italic"
  };
  var isToken = (v) => typeof v === "string" && v.startsWith("$") && v.length > 1;
  function num(v, path, issues, opts = {}) {
    if (v === void 0 || v === null) return void 0;
    if (typeof v === "number" && Number.isFinite(v)) {
      if (opts.min !== void 0 && v < opts.min) issues.warnings.push(`${path}: ${v} is below ${opts.min}; clamped.`);
      return opts.min !== void 0 ? Math.max(opts.min, v) : v;
    }
    if (typeof v === "string") {
      if (isToken(v)) {
        if (opts.token === false) issues.errors.push(`${path}: variables are not supported here.`);
        return v;
      }
      const m = v.trim().match(/^(-?\d*\.?\d+)\s*(px)?$/);
      if (m) return parseFloat(m[1]);
    }
    issues.errors.push(`${path}: expected a number${opts.token === false ? "" : ' or a "$variable"'}, got ${JSON.stringify(v)}.`);
    return void 0;
  }
  function size(v, path, issues) {
    if (v === void 0 || v === null) return void 0;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (["fill", "fill-container", "full", "100%", "stretch", "flex", "flex-1", "expand"].includes(s)) return "fill";
      if (["hug", "hug-contents", "auto", "fit", "fit-content", "content", "wrap", "wrap-content"].includes(s)) return "hug";
    }
    return num(v, path, issues, { min: 0.01 });
  }
  function enumOf(v, map, path, issues) {
    if (v === void 0 || v === null) return void 0;
    const key = String(v).trim().toLowerCase();
    if (key in map) return map[key];
    issues.errors.push(`${path}: unknown value ${JSON.stringify(v)}.${didYouMean(key, Object.keys(map))}`);
    return void 0;
  }
  function bool(v, path, issues) {
    if (v === void 0 || v === null) return void 0;
    if (typeof v === "boolean") return v;
    if (v === "true" || v === 1) return true;
    if (v === "false" || v === 0) return false;
    issues.errors.push(`${path}: expected true/false, got ${JSON.stringify(v)}.`);
    return void 0;
  }
  var DIR = {
    row: "row",
    horizontal: "row",
    h: "row",
    x: "row",
    "row-reverse": "row",
    column: "column",
    col: "column",
    vertical: "column",
    v: "column",
    y: "column",
    "column-reverse": "column",
    grid: "grid",
    none: "none",
    absolute: "none",
    free: "none",
    freeform: "none"
  };
  var ALIGN = {
    start: "start",
    "flex-start": "start",
    min: "start",
    left: "start",
    top: "start",
    center: "center",
    middle: "center",
    end: "end",
    "flex-end": "end",
    max: "end",
    right: "end",
    bottom: "end",
    baseline: "baseline",
    stretch: "stretch",
    fill: "stretch"
  };
  var JUSTIFY = {
    start: "start",
    "flex-start": "start",
    min: "start",
    left: "start",
    top: "start",
    center: "center",
    middle: "center",
    end: "end",
    "flex-end": "end",
    max: "end",
    right: "end",
    bottom: "end",
    between: "between",
    "space-between": "between",
    spacebetween: "between",
    space_between: "between",
    around: "around",
    "space-around": "around",
    evenly: "evenly",
    "space-evenly": "evenly"
  };
  var TEXT_ALIGN = {
    left: "left",
    start: "left",
    center: "center",
    middle: "center",
    right: "right",
    end: "right",
    justify: "justify",
    justified: "justify"
  };
  var VALIGN = { top: "top", start: "top", center: "center", middle: "center", bottom: "bottom", end: "bottom" };
  var FIT = {
    fill: "fill",
    cover: "fill",
    fit: "fit",
    contain: "fit",
    crop: "crop",
    tile: "tile",
    repeat: "tile"
  };
  var CASE = {
    original: "original",
    none: "original",
    upper: "upper",
    uppercase: "upper",
    lower: "lower",
    lowercase: "lower",
    title: "title",
    capitalize: "title",
    "small-caps": "small-caps",
    "small-caps-forced": "small-caps-forced"
  };
  var DECORATION = {
    none: "none",
    underline: "underline",
    strike: "strike",
    strikethrough: "strike",
    "line-through": "strike"
  };
  var SCROLL = {
    none: "none",
    hidden: "none",
    visible: "none",
    vertical: "vertical",
    y: "vertical",
    horizontal: "horizontal",
    x: "horizontal",
    both: "both",
    auto: "vertical",
    scroll: "vertical"
  };
  var CONSTRAINT_H = {
    left: "left",
    min: "left",
    start: "left",
    right: "right",
    max: "right",
    end: "right",
    center: "center",
    stretch: "stretch",
    "left-right": "stretch",
    scale: "scale"
  };
  var CONSTRAINT_V = {
    top: "top",
    min: "top",
    start: "top",
    bottom: "bottom",
    max: "bottom",
    end: "bottom",
    center: "center",
    stretch: "stretch",
    "top-bottom": "stretch",
    scale: "scale"
  };
  var WEIGHT_NAMES = {
    thin: 100,
    hairline: 100,
    extralight: 200,
    ultralight: 200,
    light: 300,
    regular: 400,
    normal: 400,
    book: 400,
    medium: 500,
    semibold: 600,
    demibold: 600,
    bold: 700,
    extrabold: 800,
    ultrabold: 800,
    black: 900,
    heavy: 900
  };
  function paint(v, path, issues) {
    var _a, _b, _c, _d;
    if (v === void 0 || v === null) return void 0;
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return void 0;
      if (s.startsWith("@")) return { kind: "style", name: s.slice(1) };
      if (s.startsWith("url(") || /^(https?:|file:|\/|~\/|\.\.?\/)/.test(s) || /\.(png|jpe?g|gif|webp|svg)$/i.test(s)) {
        return { kind: "image", src: s.replace(/^url\((['"]?)(.*)\1\)$/, "$2"), fit: "fill" };
      }
      if (/^(linear|radial|conic|angular|diamond)-gradient\(/i.test(s)) return cssGradient(s, path, issues);
      return { kind: "solid", color: s };
    }
    if (isPlainObject(v)) {
      const o = v;
      const opacity = o.opacity === void 0 ? void 0 : num(o.opacity, `${path}.opacity`, issues, { token: false });
      if (o.style !== void 0) return { kind: "style", name: String(o.style).replace(/^@/, "") };
      if (o.image !== void 0 || o.src !== void 0 || o.imageData !== void 0) {
        return {
          kind: "image",
          src: o.image !== void 0 ? String(o.image) : o.src !== void 0 ? String(o.src) : void 0,
          imageData: o.imageData !== void 0 ? String(o.imageData) : void 0,
          fit: (_c = enumOf((_b = (_a = o.fit) != null ? _a : o.scaleMode) != null ? _b : "fill", FIT, `${path}.fit`, issues)) != null ? _c : "fill",
          opacity
        };
      }
      if (o.gradient !== void 0 || o.stops !== void 0) {
        const g2 = String((_d = o.gradient) != null ? _d : "linear").toLowerCase().replace(/-gradient$/, "");
        const kind = { linear: "linear", radial: "radial", angular: "angular", conic: "angular", diamond: "diamond" }[g2];
        if (!kind) issues.errors.push(`${path}.gradient: unknown gradient ${JSON.stringify(o.gradient)} (linear|radial|angular|diamond).`);
        const stops = Array.isArray(o.stops) ? o.stops : [];
        if (stops.length < 2) issues.errors.push(`${path}.stops: a gradient needs at least 2 stops.`);
        return {
          kind: "gradient",
          gradient: kind != null ? kind : "linear",
          angle: typeof o.angle === "number" ? o.angle : 180,
          stops: stops.map((st, i) => gradientStop(st, i, stops.length, `${path}.stops[${i}]`, issues)),
          opacity
        };
      }
      if (o.color !== void 0) return { kind: "solid", color: String(o.color), opacity };
      issues.errors.push(`${path}: unrecognised paint ${JSON.stringify(v)}. Use "#hex", "$variable", "@Style", {color, opacity}, {gradient, stops} or {image, fit}.`);
      return void 0;
    }
    issues.errors.push(`${path}: unrecognised paint ${JSON.stringify(v)}.`);
    return void 0;
  }
  function gradientStop(st, i, n, path, issues) {
    var _a, _b, _c;
    const fallbackPos = n > 1 ? i / (n - 1) : 0;
    if (typeof st === "string") {
      const m = st.trim().match(/^(.*?)(?:\s+(-?\d*\.?\d+)%)?$/);
      return { color: ((_a = m == null ? void 0 : m[1]) != null ? _a : st).trim(), position: (m == null ? void 0 : m[2]) !== void 0 ? parseFloat(m[2]) / 100 : fallbackPos };
    }
    if (Array.isArray(st)) return { color: String(st[0]), position: typeof st[1] === "number" ? st[1] > 1 ? st[1] / 100 : st[1] : fallbackPos };
    if (isPlainObject(st)) {
      const p = (_c = (_b = st.position) != null ? _b : st.pos) != null ? _c : st.at;
      return { color: String(st.color), position: typeof p === "number" ? p > 1 ? p / 100 : p : fallbackPos };
    }
    issues.errors.push(`${path}: unrecognised gradient stop.`);
    return { color: "#000000", position: fallbackPos };
  }
  function cssGradient(s, path, issues) {
    var _a;
    const m = s.match(/^(\w+)-gradient\((.*)\)$/i);
    if (!m) return void 0;
    const kind = m[1].toLowerCase();
    const parts = [];
    let depth = 0;
    let cur = "";
    for (const ch of m[2]) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        parts.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    let angle = 180;
    if (parts.length && /deg$|^to /.test(parts[0])) {
      const a = parts.shift();
      const dirs = { "to top": 0, "to right": 90, "to bottom": 180, "to left": 270, "to top right": 45, "to bottom right": 135, "to bottom left": 225, "to top left": 315 };
      angle = a.endsWith("deg") ? parseFloat(a) : (_a = dirs[a]) != null ? _a : 180;
    } else if (parts.length && /^(circle|ellipse|at )/.test(parts[0])) parts.shift();
    const stops = parts.map((p, i) => gradientStop(p, i, parts.length, `${path}.stops[${i}]`, issues));
    const gradient = kind === "linear" ? "linear" : kind === "radial" ? "radial" : kind === "diamond" ? "diamond" : "angular";
    return { kind: "gradient", gradient, angle, stops };
  }
  function paints(v, path, issues) {
    if (v === void 0) return void 0;
    if (v === null || v === "none" || v === false || Array.isArray(v) && v.length === 0) return null;
    const list = Array.isArray(v) ? v : [v];
    const out = [];
    list.forEach((p, i) => {
      const r = paint(p, list.length > 1 || Array.isArray(v) ? `${path}[${i}]` : path, issues);
      if (r) out.push(r);
    });
    return out;
  }
  function stroke(v, path, issues) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    if (v === void 0) return void 0;
    if (v === null || v === "none" || v === false) return null;
    if (typeof v === "string") {
      const tokens = v.trim().split(/\s+/);
      let weight;
      let dash;
      const rest = [];
      for (const t of tokens) {
        if (/^-?\d*\.?\d+(px)?$/.test(t)) weight = parseFloat(t);
        else if (t === "dashed") dash = [4, 4];
        else if (t === "dotted") dash = [1, 2];
        else if (t === "solid") continue;
        else rest.push(t);
      }
      const p = paint(rest.join(" ") || "#000000", path, issues);
      return { paints: p ? [p] : [], weight: weight != null ? weight : 1, dash };
    }
    if (Array.isArray(v)) return { paints: (_a = paints(v, path, issues)) != null ? _a : [], weight: 1 };
    if (isPlainObject(v)) {
      const o = v;
      const colorInput = (_d = (_c = (_b = o.color) != null ? _b : o.paint) != null ? _c : o.paints) != null ? _d : o.fill;
      let weight;
      const w = (_f = (_e = o.weight) != null ? _e : o.width) != null ? _f : o.strokeWeight;
      if (Array.isArray(w)) {
        const sides = padLike(w, `${path}.weight`, issues);
        weight = sides;
      } else if (w !== void 0) weight = num(w, `${path}.weight`, issues, { min: 0 });
      const align = (_h = (_g = o.align) != null ? _g : o.position) != null ? _h : o.strokeAlign;
      return {
        paints: colorInput === void 0 ? [] : (_i = paints(colorInput, `${path}.color`, issues)) != null ? _i : [],
        weight: weight != null ? weight : 1,
        align: align === void 0 ? void 0 : enumOf(align, { inside: "inside", inner: "inside", center: "center", middle: "center", outside: "outside", outer: "outside" }, `${path}.align`, issues),
        dash: Array.isArray(o.dash) ? o.dash : o.dash === true || o.style === "dashed" ? [4, 4] : o.style === "dotted" ? [1, 2] : void 0,
        cap: o.cap === void 0 ? void 0 : enumOf(o.cap, { none: "none", round: "round", square: "square" }, `${path}.cap`, issues),
        join: o.join === void 0 ? void 0 : enumOf(o.join, { miter: "miter", bevel: "bevel", round: "round" }, `${path}.join`, issues)
      };
    }
    issues.errors.push(`${path}: unrecognised stroke ${JSON.stringify(v)}.`);
    return void 0;
  }
  function cssShadows(s, path, issues) {
    const parts = [];
    let depth = 0;
    let cur = "";
    for (const ch of s) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        parts.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts.map((p, i) => {
      var _a, _b, _c, _d;
      let inset = false;
      const nums = [];
      const colorParts = [];
      const re = /(rgba?\([^)]*\)|hsla?\([^)]*\)|\S+)/g;
      let m;
      while (m = re.exec(p)) {
        const t = m[1];
        if (t === "inset") inset = true;
        else if (/^-?\d*\.?\d+(px)?$/.test(t)) nums.push(parseFloat(t));
        else colorParts.push(t);
      }
      if (nums.length < 2) issues.errors.push(`${path}[${i}]: shadow needs at least "x y" offsets: ${JSON.stringify(p)}.`);
      return {
        kind: inset ? "inner-shadow" : "drop-shadow",
        x: (_a = nums[0]) != null ? _a : 0,
        y: (_b = nums[1]) != null ? _b : 0,
        blur: (_c = nums[2]) != null ? _c : 0,
        spread: (_d = nums[3]) != null ? _d : 0,
        color: colorParts.join(" ") || "rgba(0,0,0,0.25)"
      };
    });
  }
  function effects(v, path, issues) {
    if (v === void 0) return void 0;
    if (v === null || v === "none" || v === false) return null;
    if (typeof v === "string") {
      if (v.trim().startsWith("@")) return [{ kind: "style", name: v.trim().slice(1) }];
      return cssShadows(v, path, issues);
    }
    const list = Array.isArray(v) ? v : [v];
    const out = [];
    list.forEach((e, i) => {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q;
      const p = `${path}[${i}]`;
      if (typeof e === "string") {
        if (e.trim().startsWith("@")) out.push({ kind: "style", name: e.trim().slice(1) });
        else out.push(...cssShadows(e, p, issues));
        return;
      }
      if (!isPlainObject(e)) {
        issues.errors.push(`${p}: unrecognised effect.`);
        return;
      }
      const o = e;
      const t = String((_b = (_a = o.type) != null ? _a : o.kind) != null ? _b : o.radius !== void 0 && o.x === void 0 ? "layer-blur" : "drop-shadow").toLowerCase();
      if (o.style !== void 0) {
        out.push({ kind: "style", name: String(o.style).replace(/^@/, "") });
        return;
      }
      const kinds = {
        shadow: "drop-shadow",
        "drop-shadow": "drop-shadow",
        drop_shadow: "drop-shadow",
        dropshadow: "drop-shadow",
        "inner-shadow": "inner-shadow",
        inner_shadow: "inner-shadow",
        innershadow: "inner-shadow",
        inset: "inner-shadow",
        blur: "layer-blur",
        "layer-blur": "layer-blur",
        layer_blur: "layer-blur",
        "background-blur": "background-blur",
        background_blur: "background-blur",
        "bg-blur": "background-blur",
        backdrop: "background-blur",
        "backdrop-blur": "background-blur"
      };
      const kind = kinds[t];
      if (!kind) {
        issues.errors.push(`${p}.type: unknown effect ${JSON.stringify(t)}.${didYouMean(t, Object.keys(kinds))}`);
        return;
      }
      if (kind === "layer-blur" || kind === "background-blur") {
        out.push({ kind, radius: (_e = num((_d = (_c = o.radius) != null ? _c : o.blur) != null ? _d : 8, `${p}.radius`, issues)) != null ? _e : 8 });
      } else {
        out.push({
          kind,
          x: (_h = num((_g = (_f = o.x) != null ? _f : o.offsetX) != null ? _g : 0, `${p}.x`, issues)) != null ? _h : 0,
          y: (_k = num((_j = (_i = o.y) != null ? _i : o.offsetY) != null ? _j : 0, `${p}.y`, issues)) != null ? _k : 0,
          blur: (_n = num((_m = (_l = o.blur) != null ? _l : o.radius) != null ? _m : 0, `${p}.blur`, issues)) != null ? _n : 0,
          spread: (_p = num((_o = o.spread) != null ? _o : 0, `${p}.spread`, issues)) != null ? _p : 0,
          color: String((_q = o.color) != null ? _q : "rgba(0,0,0,0.25)")
        });
      }
    });
    return out;
  }
  function fontShorthand(s) {
    const out = {};
    const tokens = s.trim().split(/\s+/);
    const family = [];
    for (const t of tokens) {
      const low = t.toLowerCase().replace(/[-_ ]/g, "");
      if (low === "italic" || low === "oblique") out.italic = true;
      else if (/^[1-9]00$/.test(t) && out.size === void 0 && out.weight === void 0) out.weight = parseInt(t, 10);
      else if (WEIGHT_NAMES[low] !== void 0 && !family.length) out.weight = WEIGHT_NAMES[low];
      else if (/^\d*\.?\d+(px)?(\/\S+)?$/.test(t) && out.size === void 0) {
        const [sz, lh] = t.split("/");
        out.size = parseFloat(sz);
        if (lh) out.lineHeight = /%$/.test(lh) || lh === "auto" ? lh : parseFloat(lh);
      } else family.push(t);
    }
    if (family.length) out.family = family.join(" ").replace(/^["']|["']$/g, "");
    return out;
  }
  function fontSpec(v, path, issues, into = {}) {
    var _a;
    if (typeof v === "string") return __spreadValues(__spreadValues({}, into), fontShorthand(v));
    if (!isPlainObject(v)) {
      issues.errors.push(`${path}: expected an object or a shorthand like "600 16/24 Inter".`);
      return into;
    }
    const out = __spreadValues({}, into);
    for (const [k, val] of Object.entries(v)) {
      const key = (_a = FONT_KEYS[k]) != null ? _a : k;
      applyFontKey(out, key, val, `${path}.${k}`, issues);
    }
    return out;
  }
  function applyFontKey(out, key, val, path, issues) {
    switch (key) {
      case "family":
        out.family = String(val);
        break;
      case "style":
        out.style = String(val);
        break;
      case "weight": {
        if (typeof val === "number") out.weight = val;
        else if (typeof val === "string" && /^\d+$/.test(val)) out.weight = parseInt(val, 10);
        else if (typeof val === "string" && WEIGHT_NAMES[val.toLowerCase().replace(/[-_ ]/g, "")] !== void 0)
          out.weight = WEIGHT_NAMES[val.toLowerCase().replace(/[-_ ]/g, "")];
        else issues.errors.push(`${path}: unknown font weight ${JSON.stringify(val)} (100\u2013900 or Regular/Medium/SemiBold/Bold\u2026).`);
        break;
      }
      case "italic":
        out.italic = !!val;
        break;
      case "size":
        out.size = num(val, path, issues, { min: 1 });
        break;
      case "lineHeight":
        if (typeof val === "string" && (/%$/.test(val.trim()) || val.trim().toLowerCase() === "auto")) out.lineHeight = val.trim().toLowerCase();
        else if (typeof val === "number" && val > 0 && val < 4) out.lineHeight = `${Math.round(val * 100)}%`;
        else out.lineHeight = num(val, path, issues);
        break;
      case "letterSpacing":
        if (typeof val === "string" && /%$/.test(val.trim())) out.letterSpacing = val.trim();
        else if (typeof val === "string" && /em$/.test(val.trim())) out.letterSpacing = `${parseFloat(val) * 100}%`;
        else out.letterSpacing = num(val, path, issues);
        break;
      case "case":
        out.case = enumOf(val, CASE, path, issues);
        break;
      case "decoration":
        out.decoration = enumOf(val, DECORATION, path, issues);
        break;
      default:
        issues.warnings.push(`${path}: unknown font property ignored.${didYouMean(key, Object.values(FONT_KEYS))}`);
    }
  }
  var TRIGGERS = {
    click: "click",
    tap: "click",
    "on-click": "click",
    onclick: "click",
    "on click": "click",
    hover: "hover",
    "while-hovering": "hover",
    whilehovering: "hover",
    "on-hover": "hover",
    press: "press",
    "while-pressing": "press",
    whilepressing: "press",
    "on-press": "press",
    drag: "drag",
    "on-drag": "drag",
    swipe: "drag",
    "mouse-enter": "mouse-enter",
    mouseenter: "mouse-enter",
    enter: "mouse-enter",
    "mouse-leave": "mouse-leave",
    mouseleave: "mouse-leave",
    leave: "mouse-leave",
    "mouse-down": "mouse-down",
    mousedown: "mouse-down",
    "mouse-up": "mouse-up",
    mouseup: "mouse-up",
    after: "after",
    delay: "after",
    timeout: "after",
    "after-delay": "after",
    key: "key",
    keydown: "key",
    "key-down": "key"
  };
  var KEY_CODES = {
    enter: 13,
    return: 13,
    escape: 27,
    esc: 27,
    space: 32,
    " ": 32,
    tab: 9,
    backspace: 8,
    delete: 46,
    arrowleft: 37,
    left: 37,
    arrowup: 38,
    up: 38,
    arrowright: 39,
    right: 39,
    arrowdown: 40,
    down: 40
  };
  function parseDuration(v, fallback) {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const m = v.trim().match(/^(\d*\.?\d+)\s*(ms|s)?$/);
      if (m) return m[2] === "s" ? parseFloat(m[1]) * 1e3 : parseFloat(m[1]);
    }
    return fallback;
  }
  function keyCode(k) {
    const low = k.toLowerCase();
    if (KEY_CODES[low] !== void 0) return KEY_CODES[low];
    if (/^[a-z]$/.test(low)) return low.toUpperCase().charCodeAt(0);
    if (/^[0-9]$/.test(low)) return low.charCodeAt(0);
    const n = parseInt(k, 10);
    return Number.isFinite(n) ? n : 13;
  }
  function trigger(v, path, issues) {
    var _a, _b, _c;
    if (v === void 0 || v === null) return { kind: "click" };
    if (isPlainObject(v)) {
      const o = v;
      if (o.after !== void 0 || o.delay !== void 0 || o.timeout !== void 0)
        return { kind: "after", delayMs: parseDuration((_b = (_a = o.after) != null ? _a : o.delay) != null ? _b : o.timeout, 800) };
      if (o.key !== void 0) return { kind: "key", keyCodes: (Array.isArray(o.key) ? o.key : [o.key]).map((k2) => keyCode(String(k2))) };
      return trigger((_c = o.type) != null ? _c : o.kind, path, issues);
    }
    const s = String(v).trim();
    const m = s.match(/^(after|delay|timeout)\s+(.+)$/i);
    if (m) return { kind: "after", delayMs: parseDuration(m[2], 800) };
    const k = s.match(/^key[:\s]+(.+)$/i);
    if (k) return { kind: "key", keyCodes: k[1].split(/[+,\s]+/).filter(Boolean).map(keyCode) };
    const kind = TRIGGERS[s.toLowerCase()];
    if (!kind) {
      issues.errors.push(`${path}: unknown trigger ${JSON.stringify(v)}.${didYouMean(s, Object.keys(TRIGGERS))}`);
      return { kind: "click" };
    }
    return { kind };
  }
  var EASINGS = {
    linear: "linear",
    "ease-in": "ease-in",
    easein: "ease-in",
    "ease-out": "ease-out",
    easeout: "ease-out",
    ease: "ease-out",
    "ease-in-out": "ease-in-out",
    easeinout: "ease-in-out",
    "ease-in-and-out": "ease-in-out",
    "ease-in-back": "ease-in-back",
    "ease-out-back": "ease-out-back",
    "ease-in-out-back": "ease-in-out-back",
    "ease-in-and-out-back": "ease-in-out-back",
    gentle: "gentle",
    quick: "quick",
    bouncy: "bouncy",
    slow: "slow"
  };
  var TRANSITIONS = {
    instant: "instant",
    none: "instant",
    dissolve: "dissolve",
    fade: "dissolve",
    "smart-animate": "smart-animate",
    smartanimate: "smart-animate",
    smart: "smart-animate",
    "smart animate": "smart-animate",
    "scroll-animate": "scroll-animate",
    "move-in": "move-in",
    movein: "move-in",
    "move-out": "move-out",
    moveout: "move-out",
    push: "push",
    "slide-in": "slide-in",
    slidein: "slide-in",
    slide: "slide-in",
    "slide-out": "slide-out",
    slideout: "slide-out"
  };
  function easing(v, path, issues) {
    var _a, _b, _c;
    if (v === void 0 || v === null) return { kind: "ease-out" };
    if (Array.isArray(v) && v.length === 4) return { kind: "bezier", points: v.map(Number) };
    if (isPlainObject(v)) {
      const o = v;
      if (Array.isArray(o.bezier) && o.bezier.length === 4) return { kind: "bezier", points: o.bezier.map(Number) };
      if (isPlainObject(o.spring)) {
        const sp = o.spring;
        return { kind: "spring", mass: (_a = sp.mass) != null ? _a : 1, stiffness: (_b = sp.stiffness) != null ? _b : 100, damping: (_c = sp.damping) != null ? _c : 15 };
      }
    }
    const s = String(v).trim().toLowerCase();
    const cb = s.match(/^cubic-bezier\(([^)]+)\)$/);
    if (cb) {
      const pts = cb[1].split(",").map((x) => parseFloat(x));
      if (pts.length === 4) return { kind: "bezier", points: pts };
    }
    const kind = EASINGS[s];
    if (!kind) {
      issues.errors.push(`${path}: unknown easing ${JSON.stringify(v)}.${didYouMean(s, Object.keys(EASINGS))}`);
      return { kind: "ease-out" };
    }
    return { kind };
  }
  function transition(v, path, issues) {
    var _a, _b, _c, _d;
    if (v === void 0) return void 0;
    if (v === null || v === false) return null;
    let type;
    let direction;
    let duration;
    let ease;
    let matchLayers;
    if (typeof v === "string") {
      for (const t2 of v.trim().toLowerCase().split(/\s+/)) {
        if (TRANSITIONS[t2] && !type) type = t2;
        else if (["left", "right", "top", "bottom", "up", "down"].includes(t2)) direction = t2;
        else if (/^\d*\.?\d+(ms|s)?$/.test(t2)) duration = t2;
        else ease = t2;
      }
    } else if (isPlainObject(v)) {
      const o = v;
      type = o.type !== void 0 ? String(o.type).toLowerCase() : "dissolve";
      direction = o.direction !== void 0 ? String(o.direction).toLowerCase() : void 0;
      duration = (_a = o.duration) != null ? _a : o.durationMs;
      ease = (_c = (_b = o.easing) != null ? _b : o.ease) != null ? _c : o.curve;
      matchLayers = o.matchLayers === void 0 ? void 0 : !!o.matchLayers;
    } else {
      issues.errors.push(`${path}: expected a transition string like "smart-animate 300ms ease-out" or an object.`);
      return void 0;
    }
    const t = TRANSITIONS[type != null ? type : "dissolve"];
    if (!t) {
      issues.errors.push(`${path}: unknown transition ${JSON.stringify(type)}.${didYouMean(type != null ? type : "", Object.keys(TRANSITIONS))}`);
      return void 0;
    }
    if (t === "instant") return null;
    const dirMap = { left: "left", right: "right", top: "top", up: "top", bottom: "bottom", down: "bottom" };
    const directional = ["move-in", "move-out", "push", "slide-in", "slide-out"].includes(t);
    return {
      type: t,
      direction: directional ? (_d = dirMap[direction != null ? direction : "left"]) != null ? _d : "left" : void 0,
      durationMs: parseDuration(duration, 300),
      easing: easing(ease, `${path}.easing`, issues),
      matchLayers
    };
  }
  var ACTION_KEYS = {
    navigate: "navigate",
    navigateTo: "navigate",
    goTo: "navigate",
    goto: "navigate",
    overlay: "overlay",
    openOverlay: "overlay",
    swap: "swap",
    swapOverlay: "swap",
    scrollTo: "scroll-to",
    "scroll-to": "scroll-to",
    changeTo: "change-to",
    "change-to": "change-to",
    back: "back",
    close: "close",
    closeOverlay: "close",
    url: "url",
    openUrl: "url",
    link: "url",
    setMode: "set-mode",
    "set-mode": "set-mode",
    setVariable: "set-variable",
    "set-variable": "set-variable"
  };
  function action(o, path, issues, sharedTransition) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    let kind;
    let to;
    if (o.action !== void 0 || o.type !== void 0 || o.kind !== void 0) {
      const a2 = String((_b = (_a = o.action) != null ? _a : o.type) != null ? _b : o.kind).replace(/[_\s]/g, "-");
      kind = (_d = (_c = ACTION_KEYS[a2]) != null ? _c : ACTION_KEYS[a2.toLowerCase()]) != null ? _d : Object.values(ACTION_KEYS).includes(a2.toLowerCase()) ? a2.toLowerCase() : void 0;
      if (!kind) {
        issues.errors.push(`${path}.action: unknown action ${JSON.stringify(a2)}.${didYouMean(a2, Object.keys(ACTION_KEYS))}`);
        return void 0;
      }
      to = o.to !== void 0 ? String(o.to) : o.destination !== void 0 ? String(o.destination) : void 0;
    } else {
      for (const [k, kk] of Object.entries(ACTION_KEYS)) {
        if (o[k] !== void 0) {
          kind = kk;
          if (typeof o[k] === "string") to = o[k];
          break;
        }
      }
    }
    if (!kind) {
      issues.errors.push(`${path}: no action. Use {action: "navigate", to: "<node id or ref>"} or shorthands like {navigate: "\u2026"}, {overlay: "\u2026"}, {back: true}, {url: "\u2026"}.`);
      return void 0;
    }
    const a = { kind };
    if (["navigate", "overlay", "swap", "scroll-to", "change-to"].includes(kind)) {
      if (!to) issues.errors.push(`${path}: "${kind}" needs a destination ("to").`);
      a.to = to;
      const tr = transition((_f = (_e = o.transition) != null ? _e : o.animation) != null ? _f : sharedTransition, `${path}.transition`, issues);
      a.transition = tr === void 0 ? kind === "change-to" ? { type: "smart-animate", durationMs: 200, easing: { kind: "ease-out" } } : null : tr;
      if (o.resetScroll !== void 0) a.resetScroll = !!o.resetScroll;
      if (o.preserveScroll !== void 0) a.resetScroll = !o.preserveScroll;
      if (isPlainObject(o.offset)) a.offset = o.offset;
    }
    if (kind === "url") {
      a.url = String((_j = (_i = (_h = (_g = o.url) != null ? _g : o.to) != null ? _h : o.openUrl) != null ? _i : o.link) != null ? _j : "");
      if (!a.url) issues.errors.push(`${path}: "url" action needs a url.`);
      a.newTab = o.newTab === void 0 ? true : !!o.newTab;
    }
    if (kind === "set-mode") {
      const src = isPlainObject(o.setMode) ? o.setMode : o;
      a.collection = src.collection !== void 0 ? String(src.collection) : void 0;
      a.mode = src.mode !== void 0 ? String(src.mode) : void 0;
      if (!a.collection || !a.mode) issues.errors.push(`${path}: "set-mode" needs {collection, mode}.`);
    }
    if (kind === "set-variable") {
      const src = isPlainObject(o.setVariable) ? o.setVariable : o;
      a.variable = src.variable !== void 0 ? String(src.variable).replace(/^\$/, "") : void 0;
      a.value = src.value;
      if (!a.variable) issues.errors.push(`${path}: "set-variable" needs {variable, value}.`);
    }
    return a;
  }
  function interactions(v, path, issues) {
    if (v === void 0 || v === null) return [];
    const list = Array.isArray(v) ? v : [v];
    const out = [];
    list.forEach((item, i) => {
      var _a, _b;
      const p = Array.isArray(v) ? `${path}[${i}]` : path;
      if (typeof item === "string") {
        out.push({ trigger: { kind: "click" }, actions: [{ kind: "navigate", to: item, transition: null }] });
        return;
      }
      if (!isPlainObject(item)) {
        issues.errors.push(`${p}: expected an object.`);
        return;
      }
      const o = item;
      const trig = trigger((_b = (_a = o.trigger) != null ? _a : o.on) != null ? _b : o.event, `${p}.trigger`, issues);
      const actions = [];
      if (Array.isArray(o.actions)) {
        o.actions.forEach((a, j) => {
          if (isPlainObject(a)) {
            const r = action(a, `${p}.actions[${j}]`, issues, o.transition);
            if (r) actions.push(r);
          } else issues.errors.push(`${p}.actions[${j}]: expected an object.`);
        });
      } else {
        const r = action(o, p, issues, void 0);
        if (r) actions.push(r);
      }
      out.push({ from: o.from !== void 0 ? String(o.from) : void 0, trigger: trig, actions });
    });
    return out;
  }
  function padLike(v, path, issues) {
    var _a, _b, _c, _d, _e;
    if (Array.isArray(v)) {
      const a = v.map((x, i) => {
        var _a2;
        return (_a2 = num(x, `${path}[${i}]`, issues)) != null ? _a2 : 0;
      });
      if (a.length === 1) return [a[0], a[0], a[0], a[0]];
      if (a.length === 2) return [a[0], a[1], a[0], a[1]];
      if (a.length === 3) return [a[0], a[1], a[2], a[1]];
      if (a.length === 4) return [a[0], a[1], a[2], a[3]];
      issues.errors.push(`${path}: expected 1\u20134 values (CSS order: top right bottom left).`);
      return [0, 0, 0, 0];
    }
    if (isPlainObject(v)) {
      const o = v;
      const x = (_b = (_a = o.x) != null ? _a : o.horizontal) != null ? _b : o.h;
      const y = (_d = (_c = o.y) != null ? _c : o.vertical) != null ? _d : o.v;
      const g2 = (k, fb) => {
        var _a2, _b2;
        for (const kk of k) if (o[kk] !== void 0) return (_a2 = num(o[kk], `${path}.${kk}`, issues)) != null ? _a2 : 0;
        return fb === void 0 ? 0 : (_b2 = num(fb, path, issues)) != null ? _b2 : 0;
      };
      return [g2(["top", "t"], y), g2(["right", "r", "end"], x), g2(["bottom", "b"], y), g2(["left", "l", "start"], x)];
    }
    if (typeof v === "string" && !isToken(v) && /\s/.test(v.trim())) return padLike(v.trim().split(/\s+/), path, issues);
    const n = (_e = num(v, path, issues)) != null ? _e : 0;
    return [n, n, n, n];
  }
  function normalizeSpec(input, path, issues, opts = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t;
    const out = {};
    if (!isPlainObject(input)) {
      issues.errors.push(`${path}: expected an object, got ${(_a = JSON.stringify(input)) == null ? void 0 : _a.slice(0, 80)}.`);
      return { type: "frame" };
    }
    const raw = input;
    let typeInput = (_d = (_c = (_b = raw.type) != null ? _b : raw.kind) != null ? _c : raw.node) != null ? _d : raw.nodeType;
    if (typeInput === void 0 && !opts.partial) {
      if (raw.text !== void 0 || raw.characters !== void 0 || raw.segments !== void 0 || raw.content !== void 0) typeInput = "text";
      else if (raw.component !== void 0 || raw.mainComponent !== void 0 || raw.componentKey !== void 0) typeInput = "instance";
      else if (raw.icon !== void 0) typeInput = "icon";
      else if (raw.svg !== void 0) typeInput = "svg";
      else if (raw.src !== void 0 || raw.image !== void 0 || raw.placeholder !== void 0 || raw.prompt !== void 0 || raw.imagePrompt !== void 0 || raw.supply !== void 0 || raw.provide !== void 0 || raw.userImage !== void 0) typeInput = "image";
      else typeInput = "frame";
    }
    if (typeInput !== void 0) {
      const t = String(typeInput).toLowerCase();
      const alias = TYPE_ALIASES[t];
      if (!alias) {
        issues.errors.push(`${path}.type: unknown node type ${JSON.stringify(typeInput)}.${didYouMean(t, Object.keys(TYPE_ALIASES))}`);
        out.type = "frame";
      } else {
        out.type = alias[0];
        if (((_e = alias[1]) == null ? void 0 : _e.dir) && raw.dir === void 0 && raw.direction === void 0 && raw.layout === void 0) out.dir = alias[1].dir;
      }
    }
    const type = out.type;
    const isText = type === "text";
    const isIconish = type === "icon" || type === "svg";
    const font = {};
    let fontTouched = false;
    let srcForFill;
    for (const [rawKey, val] of Object.entries(raw)) {
      if (["type", "kind", "node", "nodeType"].includes(rawKey)) continue;
      const p = `${path}.${rawKey}`;
      if (FONT_KEYS[rawKey] !== void 0) {
        applyFontKey(font, FONT_KEYS[rawKey], val, p, issues);
        fontTouched = true;
        continue;
      }
      if (rawKey === "url" && isText) {
        out.link = String(val);
        continue;
      }
      if (rawKey === "size") {
        if (isText) {
          applyFontKey(font, "size", val, p, issues);
          fontTouched = true;
        } else if (isIconish) out.size = num(val, p, issues, { token: false, min: 1 });
        else if (Array.isArray(val)) {
          out.w = size(val[0], `${p}[0]`, issues);
          out.h = size((_f = val[1]) != null ? _f : val[0], `${p}[1]`, issues);
        } else {
          out.w = size(val, p, issues);
          out.h = size(val, p, issues);
        }
        continue;
      }
      if (rawKey === "uppercase" && val) {
        font.case = "upper";
        fontTouched = true;
        continue;
      }
      if (rawKey === "underline" && val) {
        font.decoration = "underline";
        fontTouched = true;
        continue;
      }
      if (rawKey === "id") {
        issues.warnings.push(`${p}: "id" is assigned by Figma; using it as "ref".`);
        out.ref = String(val);
        continue;
      }
      if (rawKey === "onClick" || rawKey === "onTap" || rawKey === "onHover" || rawKey === "onPress") {
        const trig = rawKey === "onHover" ? "hover" : rawKey === "onPress" ? "press" : "click";
        const item = typeof val === "string" ? { trigger: trig, navigate: val } : __spreadValues({ trigger: trig }, val);
        out.interactions = [...(_g = out.interactions) != null ? _g : [], ...interactions(item, p, issues)];
        continue;
      }
      const key = KNOWN_KEYS.has(rawKey) ? rawKey : KEY_ALIASES[rawKey];
      if (!key) {
        issues.warnings.push(`${p}: unknown key ignored.${didYouMean(rawKey, [...KNOWN_KEYS, ...Object.keys(KEY_ALIASES)])}`);
        continue;
      }
      switch (key) {
        case "name":
        case "ref":
        case "description":
        case "component":
        case "svg":
        case "icon":
        case "imageData":
        case "placeholder":
        case "prompt":
        case "supply":
        case "link":
        case "blend":
          if (val !== void 0 && val !== null) out[key] = String(val);
          break;
        case "src":
          if (val !== void 0 && val !== null) {
            if (type === "image" || type === void 0) out.src = String(val);
            else srcForFill = String(val);
          }
          break;
        case "text":
          out.text = val === null || val === void 0 ? "" : String(val);
          break;
        case "style":
          if (typeof val === "string" && (isText || opts.partial)) out.style = val.replace(/^@/, "");
          else if (typeof val === "string")
            issues.warnings.push(`${p}: "style" is the text style of a text node; for paints/effects use fill: "@${val.replace(/^@/, "")}" or effects: "@${val.replace(/^@/, "")}".`);
          else if (isPlainObject(val)) {
            Object.assign(font, fontSpec(val, p, issues));
            fontTouched = true;
          }
          break;
        case "font":
          Object.assign(font, fontSpec(val, p, issues, font));
          fontTouched = true;
          break;
        case "dir":
          out.dir = enumOf(val, DIR, p, issues);
          break;
        case "gap":
          if (val === "auto" || val === "between" || val === "space-between") {
            out.justify = "between";
          } else out.gap = num(val, p, issues, { min: 0 });
          break;
        case "rowGap":
        case "colGap":
        case "minW":
        case "maxW":
        case "minH":
        case "maxH":
        case "opacity": {
          if (key === "opacity" && typeof val === "string" && /%$/.test(val)) out.opacity = parseFloat(val) / 100;
          else if (key === "opacity" && typeof val === "number" && val > 1) out.opacity = val / 100;
          else out[key] = num(val, p, issues, { min: 0 });
          break;
        }
        case "cols":
        case "rows":
        case "maxLines":
        case "paragraphSpacing":
        case "x":
        case "y":
        case "rotation":
        case "strokeWidth": {
          const n = num(val, p, issues, { token: false });
          if (n !== void 0) out[key] = n;
          break;
        }
        case "pad":
          out.pad = padLike(val, p, issues);
          break;
        case "align":
          if (isText) out.textAlign = enumOf(val, TEXT_ALIGN, p, issues);
          else out.align = enumOf(val, ALIGN, p, issues);
          break;
        case "justify":
          out.justify = enumOf(val, JUSTIFY, p, issues);
          break;
        case "textAlign":
          out.textAlign = enumOf(val, TEXT_ALIGN, p, issues);
          break;
        case "valign":
          out.valign = enumOf(val, VALIGN, p, issues);
          break;
        case "wrap":
          out.wrap = (_h = bool(val, p, issues)) != null ? _h : val === "wrap" ? true : void 0;
          break;
        case "alignContent":
          out.alignContent = enumOf(val, { auto: "auto", start: "auto", between: "between", "space-between": "between" }, p, issues);
          break;
        case "clip":
          out.clip = bool(val, p, issues);
          break;
        case "w":
        case "h":
          out[key] = size(val, p, issues);
          break;
        case "absolute":
          out.absolute = val === "absolute" ? true : bool(val, p, issues);
          break;
        case "constraints":
          if (isPlainObject(val)) {
            const o = val;
            out.constraints = {
              h: ((_i = o.h) != null ? _i : o.horizontal) ? enumOf((_j = o.h) != null ? _j : o.horizontal, CONSTRAINT_H, `${p}.h`, issues) : void 0,
              v: ((_k = o.v) != null ? _k : o.vertical) ? enumOf((_l = o.v) != null ? _l : o.vertical, CONSTRAINT_V, `${p}.v`, issues) : void 0
            };
          } else issues.errors.push(`${p}: expected {h, v}.`);
          break;
        case "cell":
        case "span":
          if (Array.isArray(val) && val.length === 2) out[key] = [Number(val[0]), Number(val[1])];
          else issues.errors.push(`${p}: expected [row, column].`);
          break;
        case "fill": {
          const ps = paints(val, p, issues);
          if (ps === void 0) break;
          if (isText) out.color = ps != null ? ps : [];
          else out.fill = ps;
          break;
        }
        case "color": {
          const ps = paints(val, p, issues);
          if (ps === void 0) break;
          if (!opts.partial && (type === "rect" || type === "ellipse" || type === "polygon" || type === "star")) out.fill = ps;
          else out.color = ps != null ? ps : [];
          break;
        }
        case "stroke":
          out.stroke = stroke(val, p, issues);
          break;
        case "radius":
          if (val === "full" || val === "pill" || val === "round") out.radius = 9999;
          else if (Array.isArray(val)) out.radius = padLike(val, p, issues);
          else out.radius = num(val, p, issues, { min: 0 });
          break;
        case "effects": {
          const e = effects(val, p, issues);
          if (e !== void 0) out.effects = e === null ? null : [...(_m = out.effects) != null ? _m : [], ...e];
          break;
        }
        case "visible":
          out.visible = rawKey === "hidden" ? !bool(val, p, issues) : bool(val, p, issues);
          break;
        case "locked":
        case "mockup":
        case "truncate":
        case "fixed":
        case "rtl":
          out[key] = bool(val, p, issues);
          break;
        case "modes":
          if (isPlainObject(val)) out.modes = Object.fromEntries(Object.entries(val).map(([k, v]) => [k, String(v)]));
          else issues.errors.push(`${p}: expected {"Collection name": "Mode name"}.`);
          break;
        case "segments":
          if (!Array.isArray(val)) issues.errors.push(`${p}: expected an array of {text, \u2026style}.`);
          else
            out.segments = val.map((s, i) => {
              var _a2, _b2, _c2;
              const sp = `${p}[${i}]`;
              if (typeof s === "string") return { text: s };
              if (!isPlainObject(s)) {
                issues.errors.push(`${sp}: expected a string or {text, \u2026}.`);
                return { text: "" };
              }
              const o = s;
              const seg = { text: String((_a2 = o.text) != null ? _a2 : "") };
              const f = {};
              let touched = false;
              for (const [k, v] of Object.entries(o)) {
                if (k === "text") continue;
                if (k === "color" || k === "fill") seg.color = (_b2 = paints(v, `${sp}.${k}`, issues)) != null ? _b2 : [];
                else if (k === "link" || k === "href" || k === "url") seg.link = String(v);
                else if (k === "font") {
                  Object.assign(f, fontSpec(v, `${sp}.font`, issues, f));
                  touched = true;
                } else if (FONT_KEYS[k] || k === "size") {
                  applyFontKey(f, (_c2 = FONT_KEYS[k]) != null ? _c2 : "size", v, `${sp}.${k}`, issues);
                  touched = true;
                } else if (k === "bold" && v) {
                  f.weight = 700;
                  touched = true;
                } else if (k === "underline" && v) {
                  f.decoration = "underline";
                  touched = true;
                } else issues.warnings.push(`${sp}.${k}: unknown segment key ignored.`);
              }
              if (touched) seg.font = f;
              return seg;
            });
          break;
        case "variant":
          if (isPlainObject(val)) out.variant = Object.fromEntries(Object.entries(val).map(([k, v]) => [k, String(v)]));
          else if (typeof val === "string") {
            out.variant = Object.fromEntries(
              val.split(",").map((kv) => kv.split("=").map((x) => x.trim())).filter((kv) => kv.length === 2)
            );
          } else issues.errors.push(`${p}: expected {"Property": "Value"}.`);
          break;
        case "props":
          if (isPlainObject(val)) out.props = val;
          else issues.errors.push(`${p}: expected {"Property": value}.`);
          break;
        case "overrides":
          if (isPlainObject(val)) {
            out.overrides = {};
            for (const [k, v] of Object.entries(val)) {
              if (typeof v === "string") out.overrides[k] = { text: v };
              else out.overrides[k] = normalizeSpec(v, `${p}.${k}`, issues, { partial: true });
            }
          } else issues.errors.push(`${p}: expected {"Layer name or path": {\u2026props}}.`);
          break;
        case "bind":
          if (isPlainObject(val)) out.bind = val;
          else if (typeof val === "string") out.bind = isText ? { text: val } : type === "instance" ? { swap: val } : { visible: val };
          else issues.errors.push(`${p}: expected {text|visible|swap: "Property name"}.`);
          break;
        case "fit":
          out.fit = enumOf(val, FIT, p, issues);
          break;
        case "scroll":
          out.scroll = enumOf(val, SCROLL, p, issues);
          break;
        case "device": {
          const name = String(val).trim().toLowerCase().replace(/[\s_]+/g, "-");
          if (DEVICES[name]) out.device = name;
          else issues.errors.push(`${p}: unknown device ${JSON.stringify(val)}.${didYouMean(name, Object.keys(DEVICES))} Or set w and h.`);
          break;
        }
        case "interactions":
          out.interactions = [...(_n = out.interactions) != null ? _n : [], ...interactions(val, p, issues)];
          break;
        case "annotations":
          out.annotations = (Array.isArray(val) ? val : [val]).map((a) => {
            var _a2;
            return isPlainObject(a) ? String((_a2 = a.label) != null ? _a2 : "") : String(a);
          });
          break;
        case "children":
          if (!Array.isArray(val)) issues.errors.push(`${p}: expected an array.`);
          else out.children = val.map((c, i) => normalizeSpec(c, `${p}[${i}]`, issues, { partial: false }));
          break;
      }
    }
    if (fontTouched) out.font = font;
    if (srcForFill) out.fill = [...(_o = out.fill) != null ? _o : [], { kind: "image", src: srcForFill, fit: (_p = out.fit) != null ? _p : "fill" }];
    if (out.device) {
      const [dw, dh] = DEVICES[out.device];
      if (out.w === void 0) out.w = dw;
      if (out.h === void 0) out.h = dh;
    }
    if (out.prompt !== void 0 && !out.prompt.trim()) delete out.prompt;
    if (out.supply !== void 0 && !out.supply.trim()) delete out.supply;
    if (out.prompt !== void 0 && out.supply !== void 0) {
      issues.warnings.push(`${path}: both prompt and supply \u2014 an image is either generated (prompt) or supplied by the user (supply); supply ignored.`);
      delete out.supply;
    }
    if (!opts.partial) {
      if (out.children && type && !CONTAINER_TYPES.has(type)) {
        issues.errors.push(`${path}: a "${type}" cannot have children (only frame, component, group, section). Wrap it in a frame.`);
      }
      if (type === "instance" && !out.component) issues.errors.push(`${path}: an instance needs "component" (name, key or id).`);
      if (type === "icon" && !out.icon) issues.errors.push(`${path}: an icon needs "icon", e.g. "lucide:search".`);
      if (type === "icon" && out.icon && !out.icon.includes(":")) issues.errors.push(`${path}.icon: use "set:name", e.g. "lucide:${out.icon}".`);
      if (type === "svg" && !out.svg) issues.errors.push(`${path}: an svg node needs "svg" markup.`);
      if (type === "text" && out.text === void 0 && !out.segments) issues.errors.push(`${path}: a text node needs "text".`);
      if (type === "image" && !out.src && !out.imageData && !out.prompt && !out.supply) {
        issues.warnings.push(`${path}: image without src \u2014 add "prompt" (what the image shows: subject, setting, style, light) so it is listed in IMAGE_PROMPTS.md for the user to generate (or "supply" for a real file the user has: logo, product photo).`);
      }
      if (type === "group" && !(out.children && out.children.length)) issues.errors.push(`${path}: a group needs children.`);
      if (out.dir === "none" && (type === "frame" || type === "component") && ((_r = (_q = out.children) == null ? void 0 : _q.filter((c) => !c.absolute).length) != null ? _r : 0) >= 2) {
        issues.warnings.push(`${path}: ${out.children.length} children placed by hand (dir: "none") \u2014 put related content in auto layout (dir "row" | "column" | "grid"); keep free placement for overlays only (absolute: true on those children).`);
      }
      if (type === "group" && ((_t = (_s = out.children) == null ? void 0 : _s.length) != null ? _t : 0) > 1) issues.warnings.push(`${path}: a group is not a layout container \u2014 use a frame (auto layout by default) so spacing and resizing work.`);
      if (out.dir === "grid" && !out.cols) issues.errors.push(`${path}: a grid needs "cols".`);
    }
    return out;
  }
  function walkSpec(spec, visit, path = "spec") {
    var _a;
    visit(spec, path);
    (_a = spec.children) == null ? void 0 : _a.forEach((c, i) => walkSpec(c, visit, `${path}.children[${i}]`));
    if (spec.overrides) for (const [k, o] of Object.entries(spec.overrides)) walkSpec(o, visit, `${path}.overrides.${k}`);
  }
  var matches = (props, cond) => Object.entries(cond).every(([k, v]) => Array.isArray(v) ? v.map(String).includes(props[k]) : String(v) === props[k]);
  function patchByRef(node, ref, patch) {
    if (!isPlainObject(node)) return false;
    let hit = false;
    const n = node;
    if (n.ref === ref) {
      Object.assign(n, deepMerge(__spreadValues({}, n), patch));
      hit = true;
    }
    if (Array.isArray(n.children)) for (const c of n.children) hit = patchByRef(c, ref, patch) || hit;
    return hit;
  }
  function expandVariants(base, input, issues) {
    var _a;
    const axes = Object.entries(input.axes || {});
    if (!axes.length) {
      issues.errors.push('variants.axes: needs at least one axis, e.g. {"State": ["Default", "Hover"]}.');
      return [];
    }
    for (const [k, vals] of axes) {
      if (!Array.isArray(vals) || !vals.length) issues.errors.push(`variants.axes.${k}: expected a non-empty array of values.`);
      if (/[=,]/.test(k)) issues.errors.push(`variants.axes.${k}: property names cannot contain "=" or ",".`);
    }
    let combos = [{}];
    for (const [k, vals] of axes) {
      const next = [];
      for (const c of combos) for (const v of vals) next.push(__spreadProps(__spreadValues({}, c), { [k]: String(v) }));
      combos = next;
    }
    if ((_a = input.exclude) == null ? void 0 : _a.length) combos = combos.filter((c) => !input.exclude.some((e) => matches(c, e)));
    if (combos.length > 200) issues.errors.push(`variants: ${combos.length} combinations is too many (max 200). Split into several sets or use exclude.`);
    const usedRefs = /* @__PURE__ */ new Set();
    const out = combos.map((props) => {
      var _a2, _b;
      let spec = JSON.parse(JSON.stringify(base));
      for (const patch of (_a2 = input.patches) != null ? _a2 : []) {
        if (!patch || !isPlainObject(patch.set)) continue;
        if (!matches(props, (_b = patch.when) != null ? _b : {})) continue;
        for (const [ref, val] of Object.entries(patch.set)) {
          if (ref === "root") spec = deepMerge(spec, val);
          else if (!patchByRef(spec, ref, val)) issues.errors.push(`variants.patches: no node with ref ${JSON.stringify(ref)} in the base spec.`);
          usedRefs.add(ref);
        }
      }
      const name = Object.entries(props).map(([k, v]) => `${k}=${v}`).join(", ");
      return { props, name, spec };
    });
    return out;
  }
  function applyAssets(spec, assets) {
    const problems = [];
    walkSpec(spec, (s, path) => {
      var _a, _b, _c, _d, _e;
      if (s.type === "icon" && s.icon && !s.svg) {
        const svg = (_a = assets == null ? void 0 : assets.icons) == null ? void 0 : _a[s.icon];
        if (svg) s.svg = svg;
        else problems.push(`${path}: icon "${s.icon}" was not loaded.`);
      }
      if (s.type === "image" && s.src && !s.imageData) {
        const img = (_b = assets == null ? void 0 : assets.images) == null ? void 0 : _b[s.src];
        if (img == null ? void 0 : img.svg) {
          s.type = "svg";
          s.svg = img.svg;
        } else if (img == null ? void 0 : img.data) s.imageData = img.data;
        else problems.push(`${path}: image "${s.src}" was not loaded.`);
      }
      for (const p of [...(_c = s.fill) != null ? _c : [], ...(_d = s.color) != null ? _d : []]) {
        if (p.kind === "image" && p.src && !p.imageData) {
          const img = (_e = assets == null ? void 0 : assets.images) == null ? void 0 : _e[p.src];
          if (img == null ? void 0 : img.data) p.imageData = img.data;
          else problems.push(`${path}: image fill "${p.src}" was not loaded${(img == null ? void 0 : img.svg) ? ' (SVG cannot be an image fill; use a {type: "svg"} node)' : ""}.`);
        }
      }
    });
    return problems;
  }

  // src/plugin/errors.ts
  var PluginError = class extends Error {
    constructor(code, message, details) {
      super(message);
      __publicField(this, "code");
      __publicField(this, "details");
      this.code = code;
      this.details = details;
    }
  };
  var badRequest = (message, details) => new PluginError("BAD_REQUEST", message, details);
  var notFound = (message, details) => new PluginError("NOT_FOUND", message, details);
  function explainFigmaError(e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hints = [
      [/unloaded font/i, "Fonts are loaded automatically by build/edit; in execute call `await h.loadFonts(node)` before editing text."],
      [/FILL can only be set on children of auto-layout/i, 'Use w/h "fill" only inside a parent with dir row/column/grid.'],
      [/HUG can only be set/i, '"hug" works on auto-layout frames and text only; give shapes a number.'],
      [/Setting figma\.currentPage is not supported/i, "Use `await figma.setCurrentPageAsync(page)`."],
      [/object is not extensible/i, "That property does not exist on this node type."],
      [/no setter for property/i, "width/height are read-only: use resize() (or w/h in build/edit)."],
      [/Can only get\/set component property definitions/i, "Component properties live on the component set (or a non-variant component)."],
      [/documentAccess: dynamic-page/i, "Use the async API variant (\u2026Async)."],
      [/Unable to establish connection to Figma/i, "Figma Desktop lost its connection to Figma's servers (internet or Figma outage) \u2014 nothing is wrong with the request. Wait until Figma reconnects (its toolbar shows offline status), then retry."]
    ];
    for (const [re, hint] of hints) if (re.test(msg)) return `${msg} \u2014 ${hint}`;
    return msg;
  }

  // src/plugin/ctx.ts
  var libraryVarCache = null;
  var fontCache = null;
  var WEIGHT_WORDS = [
    ["extralight", 200],
    ["ultralight", 200],
    ["semibold", 600],
    ["demibold", 600],
    ["extrabold", 800],
    ["ultrabold", 800],
    ["hairline", 100],
    ["thin", 100],
    ["light", 300],
    ["regular", 400],
    ["normal", 400],
    ["book", 400],
    ["roman", 400],
    ["medium", 500],
    ["bold", 700],
    ["black", 900],
    ["heavy", 900]
  ];
  function weightOfStyle(style) {
    const s = style.toLowerCase().replace(/italic|oblique/g, "").replace(/[\s_-]+/g, "");
    const n = s.match(/([1-9]00)/);
    if (n) return parseInt(n[1], 10);
    for (const [w, v] of WEIGHT_WORDS) if (s.includes(w)) return v;
    return 400;
  }
  var isItalic = (style) => /italic|oblique/i.test(style);
  var normStyle = (s) => s.toLowerCase().replace(/[\s_-]+/g, "");
  async function getNodeSafe(id, timeoutMs = 4e3) {
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    try {
      return await Promise.race([figma.getNodeByIdAsync(id), timeout]);
    } finally {
      if (timer !== void 0) clearTimeout(timer);
    }
  }
  var Ctx = class {
    constructor() {
      __publicField(this, "warnings", []);
      __publicField(this, "refs", /* @__PURE__ */ new Map());
      __publicField(this, "created", []);
      __publicField(this, "binds", []);
      __publicField(this, "pendingInteractions", []);
      __publicField(this, "loadedFonts", /* @__PURE__ */ new Set());
      __publicField(this, "varIndex");
      __publicField(this, "styleIndex");
      __publicField(this, "componentIndex");
      __publicField(this, "componentIndexScope", "none");
    }
    warn(msg) {
      if (!this.warnings.includes(msg)) this.warnings.push(msg);
    }
    // ───────────── nodes ─────────────
    async node(idOrRef, label = "node") {
      const ref = this.refs.get(idOrRef);
      if (ref) return ref;
      const id = normalizeNodeId(idOrRef);
      const n = await getNodeSafe(id);
      if (!n) {
        const refs = [...this.refs.keys()];
        throw notFound(`${label} ${JSON.stringify(idOrRef)} not found (ids look like "12:34"; refs: ${refs.length ? refs.join(", ") : "none defined"}).`);
      }
      return n;
    }
    async sceneNode(idOrRef, label = "node") {
      const n = await this.node(idOrRef, label);
      if (n.type === "DOCUMENT" || n.type === "PAGE") throw badRequest(`${label} ${JSON.stringify(idOrRef)} is a ${n.type.toLowerCase()}, not a layer.`);
      return n;
    }
    // ───────────── variables ─────────────
    buildVarIndex() {
      if (!this.varIndex) {
        this.varIndex = (async () => {
          var _a;
          const [collections, vars] = await Promise.all([
            figma.variables.getLocalVariableCollectionsAsync(),
            figma.variables.getLocalVariablesAsync()
          ]);
          const idx = { byName: /* @__PURE__ */ new Map(), byQualified: /* @__PURE__ */ new Map(), collections: /* @__PURE__ */ new Map(), collectionsByName: /* @__PURE__ */ new Map(), all: vars };
          for (const c of collections) {
            idx.collections.set(c.id, c);
            idx.collectionsByName.set(c.name.toLowerCase(), c);
          }
          for (const v of vars) {
            const key = v.name.toLowerCase();
            const list = (_a = idx.byName.get(key)) != null ? _a : [];
            list.push(v);
            idx.byName.set(key, list);
            const c = idx.collections.get(v.variableCollectionId);
            if (c) idx.byQualified.set(`${c.name.toLowerCase()}:${key}`, v);
          }
          return idx;
        })();
      }
      return this.varIndex;
    }
    invalidateVariables() {
      this.varIndex = void 0;
    }
    async collections() {
      return [...(await this.buildVarIndex()).collections.values()];
    }
    async collectionByName(name) {
      var _a;
      const idx = await this.buildVarIndex();
      const c = (_a = idx.collectionsByName.get(name.toLowerCase())) != null ? _a : idx.collections.get(name);
      if (!c) throw notFound(`Variable collection ${JSON.stringify(name)} not found.${didYouMean(name, [...idx.collections.values()].map((x) => x.name))}`);
      return c;
    }
    /** "$color/bg", "color/bg", "$Semantic:color/bg" → Variable (local first, then enabled libraries). */
    async variable(ref, expected) {
      var _a, _b;
      const raw = ref.replace(/^\$/, "").trim();
      const idx = await this.buildVarIndex();
      let v;
      const colon = raw.indexOf(":");
      if (colon > 0 && !raw.startsWith("VariableID")) {
        v = idx.byQualified.get(raw.toLowerCase());
      }
      if (!v && raw.startsWith("VariableID:")) {
        v = (_a = await figma.variables.getVariableByIdAsync(raw)) != null ? _a : void 0;
      }
      if (!v) {
        let list = (_b = idx.byName.get(raw.toLowerCase())) != null ? _b : [];
        if (expected && list.length > 1) list = list.filter((x) => x.resolvedType === expected);
        if (list.length > 1) {
          const visible = list.filter((x) => x.scopes.length > 0);
          if (visible.length === 1) list = visible;
        }
        if (list.length > 1) {
          const names = list.map((x) => {
            var _a2;
            return `$${(_a2 = idx.collections.get(x.variableCollectionId)) == null ? void 0 : _a2.name}:${x.name}`;
          });
          throw badRequest(`Variable "${raw}" exists in several collections; qualify it: ${names.join(" or ")}.`);
        }
        v = list[0];
      }
      if (!v) v = await this.libraryVariable(raw);
      if (!v) {
        const names = idx.all.map((x) => x.name);
        throw notFound(`Variable "$${raw}" not found.${didYouMean(raw, names)}${names.length ? "" : " This file has no local variables yet \u2014 create them with the variables tool."}`);
      }
      if (expected && v.resolvedType !== expected) {
        throw badRequest(`Variable "$${raw}" is ${v.resolvedType}, but ${expected} is needed here.`);
      }
      return v;
    }
    async libraryVariable(name) {
      var _a;
      try {
        if (!libraryVarCache) {
          libraryVarCache = /* @__PURE__ */ new Map();
          const cols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
          const lists = await Promise.all(cols.map((c) => figma.teamLibrary.getVariablesInLibraryCollectionAsync(c.key).catch(() => [])));
          cols.forEach((c, i) => {
            var _a2;
            for (const lv of lists[i]) {
              const key = lv.name.toLowerCase();
              const arr = (_a2 = libraryVarCache.get(key)) != null ? _a2 : [];
              arr.push({ key: lv.key, name: lv.name, collection: c.name, library: c.libraryName });
              libraryVarCache.set(key, arr);
            }
          });
        }
        const colon = name.indexOf(":");
        const [collection, varName2] = colon > 0 ? [name.slice(0, colon).toLowerCase(), name.slice(colon + 1)] : [null, name];
        const hits = ((_a = libraryVarCache.get(varName2.toLowerCase())) != null ? _a : []).filter((h) => !collection || h.collection.toLowerCase() === collection);
        if (!hits.length) return void 0;
        if (hits.length > 1) this.warn(`Variable "${name}" exists in several libraries; using ${hits[0].library} / ${hits[0].collection}.`);
        return await figma.variables.importVariableByKeyAsync(hits[0].key);
      } catch (e) {
        return void 0;
      }
    }
    /** Resolves a variable's value (following aliases) for a mode of its own collection. */
    async resolveVariableValue(v, modeId, depth = 0) {
      var _a;
      const coll = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
      const mid = modeId && modeId in v.valuesByMode ? modeId : (_a = coll == null ? void 0 : coll.defaultModeId) != null ? _a : Object.keys(v.valuesByMode)[0];
      const val = v.valuesByMode[mid];
      if (val && typeof val === "object" && "type" in val && val.type === "VARIABLE_ALIAS" && depth < 10) {
        const target = await figma.variables.getVariableByIdAsync(val.id);
        if (target) return this.resolveVariableValue(target, void 0, depth + 1);
      }
      return val;
    }
    // ───────────── styles ─────────────
    buildStyleIndex() {
      if (!this.styleIndex) {
        this.styleIndex = (async () => {
          var _a;
          const [p, t, e, g2] = await Promise.all([
            figma.getLocalPaintStylesAsync(),
            figma.getLocalTextStylesAsync(),
            figma.getLocalEffectStylesAsync(),
            figma.getLocalGridStylesAsync()
          ]);
          const m = /* @__PURE__ */ new Map();
          for (const s of [...p, ...t, ...e, ...g2]) {
            const k = s.name.toLowerCase();
            m.set(k, [...(_a = m.get(k)) != null ? _a : [], s]);
          }
          return m;
        })();
      }
      return this.styleIndex;
    }
    invalidateStyles() {
      this.styleIndex = void 0;
    }
    async style(name, type) {
      var _a;
      const clean = name.replace(/^@/, "").trim();
      if (/^S:[0-9a-f]+/.test(clean)) {
        const s = await figma.getStyleByIdAsync(clean);
        if (s && s.type === type) return s;
      }
      const idx = await this.buildStyleIndex();
      const hit = ((_a = idx.get(clean.toLowerCase())) != null ? _a : []).find((s) => s.type === type);
      if (!hit) {
        const names = [...idx.values()].flat().filter((s) => s.type === type).map((s) => s.name);
        throw notFound(`${type.toLowerCase()} style "${clean}" not found.${didYouMean(clean, names)}${names.length ? "" : ` This file has no local ${type.toLowerCase()} styles.`}`);
      }
      return hit;
    }
    // ───────────── fonts ─────────────
    async families() {
      var _a;
      if (fontCache && Date.now() - fontCache.at < 5 * 6e4) return fontCache.families;
      const fonts2 = await figma.listAvailableFontsAsync();
      const fams = /* @__PURE__ */ new Map();
      for (const f of fonts2) {
        const k = f.fontName.family.toLowerCase();
        const fam = (_a = fams.get(k)) != null ? _a : { family: f.fontName.family, styles: [] };
        fam.styles.push(f.fontName.style);
        fams.set(k, fam);
      }
      fontCache = { at: Date.now(), families: fams };
      return fams;
    }
    async listFonts(query) {
      const fams = [...(await this.families()).values()];
      if (!query) return fams;
      const q = query.toLowerCase();
      return fams.filter((f) => f.family.toLowerCase().includes(q));
    }
    /** Picks a real style name for family + weight/italic, or validates an explicit style. */
    async resolveFont(family, weight, italic, style) {
      const fams = await this.families();
      const fam = fams.get(family.toLowerCase());
      if (!fam) {
        throw notFound(`Font family "${family}" is not available in Figma.${didYouMean(family, [...fams.values()].map((f) => f.family))} Install it on this computer, or choose another family (fonts tool lists them).`);
      }
      if (style) {
        const hit = fam.styles.find((s) => normStyle(s) === normStyle(style));
        if (hit) return { family: fam.family, style: hit };
        throw notFound(`"${fam.family}" has no style "${style}". Available: ${fam.styles.join(", ")}.`);
      }
      const want = weight != null ? weight : 400;
      let pool = fam.styles.filter((s) => isItalic(s) === !!italic);
      if (!pool.length) {
        if (italic) this.warn(`"${fam.family}" has no italic styles; using upright.`);
        pool = fam.styles;
      }
      let best = pool[0];
      let bestScore = Infinity;
      for (const s of pool) {
        const w = weightOfStyle(s);
        const score = Math.abs(w - want) * 10 + s.split(/\s+/).length;
        if (score < bestScore) {
          best = s;
          bestScore = score;
        }
      }
      const got = weightOfStyle(best);
      if (Math.abs(got - want) >= 100) this.warn(`"${fam.family}" has no weight ${want}; using "${best}".`);
      return { family: fam.family, style: best };
    }
    async loadFont(font) {
      const key = `${font.family}::${font.style}`;
      if (this.loadedFonts.has(key)) return;
      await figma.loadFontAsync(font);
      this.loadedFonts.add(key);
    }
    /** Loads every font used in a subtree (needed before editing existing text). */
    async loadFontsIn(node) {
      const texts = [];
      if (node.type === "TEXT") texts.push(node);
      if ("findAllWithCriteria" in node) texts.push(...node.findAllWithCriteria({ types: ["TEXT"] }));
      const fonts2 = /* @__PURE__ */ new Map();
      for (const t of texts) {
        if (t.hasMissingFont) continue;
        if (t.fontName !== figma.mixed) fonts2.set(`${t.fontName.family}::${t.fontName.style}`, t.fontName);
        else for (const seg of t.getStyledTextSegments(["fontName"])) fonts2.set(`${seg.fontName.family}::${seg.fontName.style}`, seg.fontName);
      }
      await Promise.all([...fonts2.values()].map((f) => this.loadFont(f)));
    }
    // ───────────── components ─────────────
    indexComponents(nodes, into) {
      var _a, _b;
      for (const n of nodes) {
        if (n.type === "COMPONENT_SET" || n.type === "COMPONENT" && ((_a = n.parent) == null ? void 0 : _a.type) !== "COMPONENT_SET") {
          const k = n.name.toLowerCase();
          into.set(k, [...(_b = into.get(k)) != null ? _b : [], n]);
        }
      }
    }
    async ensureComponentIndex(scope) {
      if (this.componentIndex && (this.componentIndexScope === "all" || scope === "page")) return this.componentIndex;
      const m = /* @__PURE__ */ new Map();
      if (scope === "page") {
        this.indexComponents(figma.currentPage.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] }), m);
      } else {
        await figma.loadAllPagesAsync();
        for (const page of figma.root.children) {
          if (page.getPluginData("role") === "trash") continue;
          this.indexComponents(page.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] }), m);
        }
      }
      this.componentIndex = m;
      this.componentIndexScope = scope;
      return m;
    }
    registerComponent(c) {
      var _a;
      if (!this.componentIndex) return;
      const k = c.name.toLowerCase();
      this.componentIndex.set(k, [...(_a = this.componentIndex.get(k)) != null ? _a : [], c]);
    }
    /** A local component or set with exactly this name (any case), outside the Trash. */
    async localComponentNamed(name) {
      var _a;
      return (_a = (await this.ensureComponentIndex("all")).get(name.trim().toLowerCase())) == null ? void 0 : _a[0];
    }
    async allComponentNames() {
      return [...(await this.ensureComponentIndex("all")).values()].flat().map((c) => c.name);
    }
    /** Component (set) by id, key, or name (current page → all pages → library components used in the file). */
    async component(ref, opts = {}) {
      var _a, _b;
      const r = ref.trim();
      if (/^I?\d+[:\-]\d+/.test(r)) {
        const n = await getNodeSafe(normalizeNodeId(r));
        if (n && (n.type === "COMPONENT" || n.type === "COMPONENT_SET")) return n;
        if (n && n.type === "INSTANCE") {
          const main = await n.getMainComponentAsync();
          if (main) return ((_a = main.parent) == null ? void 0 : _a.type) === "COMPONENT_SET" ? main.parent : main;
        }
        if (n) throw badRequest(`Node ${r} is a ${n.type}, not a component.`);
      }
      if (/^[0-9a-f]{40}$/i.test(r)) {
        try {
          return await figma.importComponentSetByKeyAsync(r);
        } catch (e) {
          try {
            return await figma.importComponentByKeyAsync(r);
          } catch (e2) {
            throw notFound(`No published component or set with key ${r} is available to this file.`);
          }
        }
      }
      const key = r.toLowerCase();
      for (const scope of ["page", "all"]) {
        const idx = await this.ensureComponentIndex(scope);
        const hits = idx.get(key);
        if (hits == null ? void 0 : hits.length) {
          if (hits.length > 1) this.warn(`${hits.length} components are named "${r}"; using ${hits[0].id}. Pass an id to choose.`);
          return hits[0];
        }
      }
      for (const inst of opts.libraryScan === false ? [] : figma.currentPage.findAllWithCriteria({ types: ["INSTANCE"] }).slice(0, 400)) {
        const main = await inst.getMainComponentAsync();
        if (!main) continue;
        const owner = ((_b = main.parent) == null ? void 0 : _b.type) === "COMPONENT_SET" ? main.parent : main;
        if (owner.name.toLowerCase() === key) return owner;
      }
      const names = await this.allComponentNames();
      throw notFound(`Component "${r}" not found.${didYouMean(r, names)}${names.length ? "" : " This file has no local components; create one with create_component or pass a library component key."}`);
    }
  };

  // src/shared/color.ts
  var NAMED = {
    transparent: "#00000000",
    white: "#ffffff",
    black: "#000000"
  };
  var clamp01 = (n) => Math.min(1, Math.max(0, n));
  function parseHex(hex) {
    let h = hex.replace(/^#/, "");
    if (!/^[0-9a-fA-F]+$/.test(h)) return null;
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
  }
  function parseChannel(v, max) {
    const t = v.trim();
    if (t.endsWith("%")) return clamp01(parseFloat(t) / 100);
    return clamp01(parseFloat(t) / max);
  }
  function parseAlpha(v) {
    if (v === void 0) return 1;
    const t = v.trim();
    return clamp01(t.endsWith("%") ? parseFloat(t) / 100 : parseFloat(t));
  }
  function hslToRgb(h, s, l) {
    h = (h % 360 + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(h / 60 % 2 - 1));
    const m = l - c / 2;
    const [r, g2, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [r + m, g2 + m, b + m];
  }
  function parseColor(input) {
    if (typeof input !== "string") return null;
    const s = input.trim().toLowerCase();
    if (NAMED[s]) return parseHex(NAMED[s]);
    if (s.startsWith("#")) return parseHex(s);
    if (/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(s)) return parseHex(s);
    let m = s.match(/^rgba?\(\s*([^,\s]+)[,\s]+([^,\s]+)[,\s]+([^,\s/)]+)(?:\s*[,/]\s*([^)\s]+))?\s*\)$/);
    if (m) return { r: parseChannel(m[1], 255), g: parseChannel(m[2], 255), b: parseChannel(m[3], 255), a: parseAlpha(m[4]) };
    m = s.match(/^hsla?\(\s*([^,\s]+?)(?:deg)?[,\s]+([^,\s]+)[,\s]+([^,\s/)]+)(?:\s*[,/]\s*([^)\s]+))?\s*\)$/);
    if (m) {
      const [r, g2, b] = hslToRgb(parseFloat(m[1]), parseChannel(m[2], 100), parseChannel(m[3], 100));
      return { r, g: g2, b, a: parseAlpha(m[4]) };
    }
    return null;
  }
  var to255 = (n) => Math.round(clamp01(n) * 255);
  var hex2 = (n) => to255(n).toString(16).padStart(2, "0");
  function toHex(c, alpha) {
    var _a;
    const a = (_a = alpha != null ? alpha : c.a) != null ? _a : 1;
    const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`.toUpperCase();
    return a < 0.999 ? base + hex2(a).toUpperCase() : base;
  }
  function toCssColor(c, alpha) {
    var _a;
    const a = (_a = alpha != null ? alpha : c.a) != null ? _a : 1;
    if (a >= 0.999) return toHex(c).toLowerCase();
    return `rgba(${to255(c.r)},${to255(c.g)},${to255(c.b)},${Math.round(a * 1e3) / 1e3})`;
  }
  function channelLum(c) {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function luminance(c) {
    return 0.2126 * channelLum(c.r) + 0.7152 * channelLum(c.g) + 0.0722 * channelLum(c.b);
  }
  function contrastRatio(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function composite(fg, bg) {
    const a = fg.a;
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
  }

  // src/plugin/prototype.ts
  function toTrigger(t) {
    var _a, _b, _c;
    const delay = ((_a = t.delayMs) != null ? _a : 0) / 1e3;
    switch (t.kind) {
      case "click":
        return { type: "ON_CLICK" };
      case "hover":
        return { type: "ON_HOVER" };
      case "press":
        return { type: "ON_PRESS" };
      case "drag":
        return { type: "ON_DRAG" };
      case "mouse-enter":
        return { type: "MOUSE_ENTER", delay, deprecatedVersion: false };
      case "mouse-leave":
        return { type: "MOUSE_LEAVE", delay, deprecatedVersion: false };
      case "mouse-down":
        return { type: "MOUSE_DOWN", delay };
      case "mouse-up":
        return { type: "MOUSE_UP", delay };
      case "after":
        return { type: "AFTER_TIMEOUT", timeout: ((_b = t.delayMs) != null ? _b : 800) / 1e3 };
      case "key":
        return { type: "ON_KEY_DOWN", device: "KEYBOARD", keyCodes: ((_c = t.keyCodes) == null ? void 0 : _c.length) ? t.keyCodes : [13] };
    }
  }
  function toEasing(e) {
    switch (e.kind) {
      case "bezier":
        return { type: "CUSTOM_CUBIC_BEZIER", easingFunctionCubicBezier: { x1: e.points[0], y1: e.points[1], x2: e.points[2], y2: e.points[3] } };
      case "spring":
        return { type: "CUSTOM_SPRING", easingFunctionSpring: { mass: e.mass, stiffness: e.stiffness, damping: e.damping, initialVelocity: 0 } };
      default: {
        const map = {
          linear: "LINEAR",
          "ease-in": "EASE_IN",
          "ease-out": "EASE_OUT",
          "ease-in-out": "EASE_IN_AND_OUT",
          "ease-in-back": "EASE_IN_BACK",
          "ease-out-back": "EASE_OUT_BACK",
          "ease-in-out-back": "EASE_IN_AND_OUT_BACK",
          gentle: "GENTLE",
          quick: "QUICK",
          bouncy: "BOUNCY",
          slow: "SLOW"
        };
        return { type: map[e.kind] };
      }
    }
  }
  function toTransition(t) {
    var _a, _b;
    if (!t) return null;
    const easing2 = toEasing(t.easing);
    const duration = Math.max(1e-3, t.durationMs / 1e3);
    if (t.type === "move-in" || t.type === "move-out" || t.type === "push" || t.type === "slide-in" || t.type === "slide-out") {
      const type2 = { "move-in": "MOVE_IN", "move-out": "MOVE_OUT", push: "PUSH", "slide-in": "SLIDE_IN", "slide-out": "SLIDE_OUT" }[t.type];
      const direction = { left: "LEFT", right: "RIGHT", top: "TOP", bottom: "BOTTOM" }[(_a = t.direction) != null ? _a : "left"];
      return { type: type2, direction, matchLayers: (_b = t.matchLayers) != null ? _b : false, easing: easing2, duration };
    }
    const type = { dissolve: "DISSOLVE", "smart-animate": "SMART_ANIMATE", "scroll-animate": "SCROLL_ANIMATE" }[t.type];
    return { type, easing: easing2, duration };
  }
  function screenOf(node) {
    let n = node;
    while (n && n.parent && n.parent.type !== "PAGE" && n.parent.type !== "SECTION") n = n.parent;
    return n && n.type !== "PAGE" && n.type !== "DOCUMENT" ? n : null;
  }
  function owningVariant(node) {
    var _a;
    let n = node;
    while (n) {
      if (n.type === "COMPONENT" && ((_a = n.parent) == null ? void 0 : _a.type) === "COMPONENT_SET") return n;
      n = n.parent;
    }
    return null;
  }
  async function resolveDestination(to, a, source, ctx, path) {
    var _a;
    if (a.kind === "change-to" && /=/.test(to) && !/^\d+:\d+$/.test(to)) {
      const variant = owningVariant(source);
      if (!variant || !variant.parent || variant.parent.type !== "COMPONENT_SET") {
        throw badRequest(`${path}: "change-to ${to}" only works on layers inside a variant of a component set.`);
      }
      const want = __spreadValues({}, (_a = variant.variantProperties) != null ? _a : {});
      for (const kv of to.split(",")) {
        const [k, v] = kv.split("=").map((x) => x.trim());
        if (k && v !== void 0) want[k] = v;
      }
      const set = variant.parent;
      const hit = set.children.find((c) => {
        var _a2;
        const vp = (_a2 = c.variantProperties) != null ? _a2 : {};
        return Object.entries(want).every(([k, v]) => {
          var _a3;
          return ((_a3 = vp[k]) != null ? _a3 : "").toLowerCase() === v.toLowerCase();
        });
      });
      if (!hit) throw notFound(`${path}: no variant ${Object.entries(want).map(([k, v]) => `${k}=${v}`).join(", ")} in "${set.name}".`);
      return hit;
    }
    const ref = ctx.refs.get(to);
    if (ref) return ref;
    if (/^I?\d+[:\-]\d+/.test(to) || /node-id=/.test(to)) {
      const n = await getNodeSafe(normalizeNodeId(to));
      if (!n) throw notFound(`${path}: destination ${to} not found.`);
      return n;
    }
    if (/\s>\s/.test(to)) return resolveSource(to, ctx, path);
    const screens = figma.currentPage.children.flatMap((c) => c.type === "SECTION" ? [...c.children] : [c]);
    const hits = screens.filter((s) => s.name.toLowerCase() === to.toLowerCase());
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) throw badRequest(`${path}: ${hits.length} frames are named "${to}"; use an id (${hits.map((h) => h.id).join(", ")}).`);
    throw notFound(`${path}: destination "${to}" is not a ref, node id or top-level frame name.${didYouMean(to, screens.map((s) => s.name))}`);
  }
  async function toAction(a, source, ctx, path) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    switch (a.kind) {
      case "back":
        return { type: "BACK" };
      case "close":
        return { type: "CLOSE" };
      case "url":
        return { type: "URL", url: (_a = a.url) != null ? _a : "", openInNewTab: (_b = a.newTab) != null ? _b : true };
      case "set-mode": {
        const coll = await ctx.collectionByName((_c = a.collection) != null ? _c : "");
        const mode = coll.modes.find((m) => {
          var _a2;
          return m.name.toLowerCase() === ((_a2 = a.mode) != null ? _a2 : "").toLowerCase();
        });
        if (!mode) throw notFound(`${path}: collection "${coll.name}" has no mode "${a.mode}". Modes: ${coll.modes.map((m) => m.name).join(", ")}.`);
        return { type: "SET_VARIABLE_MODE", variableCollectionId: coll.id, variableModeId: mode.modeId };
      }
      case "set-variable": {
        const v = await ctx.variable((_d = a.variable) != null ? _d : "");
        let value;
        if (v.resolvedType === "COLOR") {
          const c = parseColor(String(a.value));
          if (!c) throw badRequest(`${path}: "${a.value}" is not a color.`);
          value = c;
        } else if (v.resolvedType === "FLOAT") value = Number(a.value);
        else if (v.resolvedType === "BOOLEAN") value = a.value === true || a.value === "true";
        else value = String(a.value);
        return { type: "SET_VARIABLE", variableId: v.id, variableValue: { type: v.resolvedType, resolvedType: v.resolvedType, value } };
      }
      default: {
        const dest = await resolveDestination((_e = a.to) != null ? _e : "", a, source, ctx, path);
        const navigation = { navigate: "NAVIGATE", overlay: "OVERLAY", swap: "SWAP", "scroll-to": "SCROLL_TO", "change-to": "CHANGE_TO" }[a.kind];
        if ((navigation === "NAVIGATE" || navigation === "OVERLAY" || navigation === "SWAP") && ((_f = dest.parent) == null ? void 0 : _f.type) !== "PAGE" && ((_g = dest.parent) == null ? void 0 : _g.type) !== "SECTION") {
          throw badRequest(`${path}: "${a.kind}" needs a top-level frame (a screen) as destination; "${dest.name}" is nested inside "${(_h = dest.parent) == null ? void 0 : _h.name}".`);
        }
        if (navigation === "SCROLL_TO" && screenOf(dest) !== screenOf(source)) {
          throw badRequest(`${path}: "scroll-to" destination must be inside the same screen as the trigger.`);
        }
        const action2 = __spreadValues(__spreadValues({
          type: "NODE",
          destinationId: dest.id,
          navigation,
          transition: toTransition(a.transition)
        }, a.resetScroll !== void 0 ? { resetScrollPosition: a.resetScroll } : {}), a.offset ? { overlayRelativePosition: a.offset } : {});
        return action2;
      }
    }
  }
  async function resolveSource(from, ctx, path) {
    const ref = ctx.refs.get(from);
    if (ref) return ref;
    if (/^I?\d+[:\-]\d+/.test(from) || /node-id=/.test(from)) return ctx.sceneNode(from, path);
    const parts = from.split(/\s+>\s+/).map((p) => p.trim()).filter(Boolean);
    const screens = figma.currentPage.children.flatMap((c) => c.type === "SECTION" ? [...c.children] : [c]);
    const hits = screens.filter((sc) => sc.name.toLowerCase() === parts[0].toLowerCase());
    if (hits.length !== 1) {
      if (hits.length > 1) throw badRequest(`${path}: ${hits.length} top-level frames are named "${parts[0]}"; use an id.`);
      throw notFound(`${path}: "${parts[0]}" is not a ref, id or top-level frame on this page.${didYouMean(parts[0], screens.map((x) => x.name))}`);
    }
    let node = hits[0];
    for (const part of parts.slice(1)) {
      const queue = "children" in node ? [...node.children] : [];
      let found = null;
      while (queue.length && !found) {
        const n = queue.shift();
        if (n.name.toLowerCase() === part.toLowerCase()) found = n;
        else if ("children" in n) queue.push(...n.children);
      }
      if (!found) throw notFound(`${path}: no layer "${part}" inside "${node.name}".`);
      node = found;
    }
    return node;
  }
  async function toReaction(item, source, ctx, path) {
    const actions = [];
    for (let i = 0; i < item.actions.length; i++) actions.push(await toAction(item.actions[i], source, ctx, `${path}.actions[${i}]`));
    return { trigger: toTrigger(item.trigger), actions };
  }
  async function applyPendingInteractions(ctx) {
    var _a;
    let count = 0;
    for (const { node, items, path } of ctx.pendingInteractions) {
      if (!("setReactionsAsync" in node)) {
        ctx.warn(`${path}: ${node.type.toLowerCase()} cannot have prototype interactions.`);
        continue;
      }
      const reactions = [...(_a = node.reactions) != null ? _a : []];
      for (let i = 0; i < items.length; i++) reactions.push(await toReaction(items[i], node, ctx, `${path}.interactions[${i}]`));
      await node.setReactionsAsync(reactions);
      count += items.length;
    }
    ctx.pendingInteractions = [];
    return count;
  }
  async function prototype(p) {
    var _a, _b, _c, _d, _e, _f, _g;
    const ctx = new Ctx();
    const issues = newIssues();
    const links = interactions((_a = p.links) != null ? _a : [], "links", issues);
    links.forEach((l, i) => {
      if (!l.from) issues.errors.push(`links[${i}]: "from" (the layer that triggers it) is required.`);
    });
    if (issues.errors.length) throw badRequest(issues.errors.join("\n"));
    const cleared = [];
    for (const id of (_b = p.clear) != null ? _b : []) {
      const n = await ctx.sceneNode(id);
      if ("setReactionsAsync" in n) {
        await n.setReactionsAsync([]);
        cleared.push(n.id);
      }
    }
    const bySource = /* @__PURE__ */ new Map();
    for (let i = 0; i < links.length; i++) {
      const l = links[i];
      const node = await resolveSource(l.from, ctx, `links[${i}].from`);
      if (!("setReactionsAsync" in node)) throw badRequest(`links[${i}].from: ${node.type.toLowerCase()} cannot have interactions.`);
      let entry = bySource.get(node.id);
      if (!entry) {
        entry = { node, reactions: p.replace ? [] : [...(_c = node.reactions) != null ? _c : []] };
        bySource.set(node.id, entry);
      }
      entry.reactions.push(await toReaction(l, node, ctx, `links[${i}]`));
    }
    for (const { node, reactions } of bySource.values()) await node.setReactionsAsync(reactions);
    const flows = [];
    if ((_d = p.flows) == null ? void 0 : _d.length) {
      const page = figma.currentPage;
      const existing = p.replaceFlows ? [] : [...page.flowStartingPoints];
      for (const f of p.flows) {
        const n = await ctx.sceneNode(f.start, `flow "${f.name}"`);
        if (((_e = n.parent) == null ? void 0 : _e.type) !== "PAGE" && ((_f = n.parent) == null ? void 0 : _f.type) !== "SECTION") throw badRequest(`flow "${f.name}": the starting point must be a top-level frame.`);
        const i = existing.findIndex((e) => e.nodeId === n.id || e.name === f.name);
        if (i >= 0) existing.splice(i, 1);
        existing.push({ nodeId: n.id, name: f.name });
        flows.push({ name: f.name, nodeId: n.id });
      }
      page.flowStartingPoints = existing;
    }
    const scrolled = [];
    for (const s of (_g = p.scroll) != null ? _g : []) {
      const n = await ctx.sceneNode(s.id);
      if (!("overflowDirection" in n)) throw badRequest(`scroll ${s.id}: only frames can scroll.`);
      const f = n;
      if (s.overflow) {
        const map = { none: "NONE", vertical: "VERTICAL", horizontal: "HORIZONTAL", both: "BOTH" };
        const v = map[s.overflow.toLowerCase()];
        if (!v) throw badRequest(`scroll ${s.id}: overflow must be none|vertical|horizontal|both.`);
        f.overflowDirection = v;
      }
      if (s.fixed !== void 0) f.numberOfFixedChildren = Math.max(0, Math.min(s.fixed, f.children.length));
      scrolled.push(f.id);
    }
    return {
      linked: links.length,
      sources: [...bySource.values()].map((e) => ({ id: e.node.id, name: e.node.name, reactions: e.reactions.length })),
      flows,
      scrolled,
      cleared,
      warnings: ctx.warnings
    };
  }
  var TRIGGER_NAMES = {
    ON_CLICK: "click",
    ON_HOVER: "hover",
    ON_PRESS: "press",
    ON_DRAG: "drag",
    MOUSE_ENTER: "mouse-enter",
    MOUSE_LEAVE: "mouse-leave",
    MOUSE_DOWN: "mouse-down",
    MOUSE_UP: "mouse-up",
    AFTER_TIMEOUT: "after",
    ON_KEY_DOWN: "key",
    ON_MEDIA_HIT: "media-hit",
    ON_MEDIA_END: "media-end"
  };
  function describeTransition(t) {
    if (!t) return void 0;
    const parts = [t.type.toLowerCase().replace(/_/g, "-")];
    if ("direction" in t) parts.push(t.direction.toLowerCase());
    parts.push(`${Math.round(t.duration * 1e3)}ms`);
    parts.push(t.easing.type.toLowerCase().replace(/_/g, "-"));
    return parts.join(" ");
  }
  async function describeAction(a, names) {
    var _a, _b;
    if (a.type === "NODE") {
      let destName = a.destinationId ? names.get(a.destinationId) : void 0;
      if (a.destinationId && destName === void 0) {
        const n = await getNodeSafe(a.destinationId, 1500);
        destName = (_a = n == null ? void 0 : n.name) != null ? _a : "?";
        names.set(a.destinationId, destName);
      }
      return { action: a.navigation.toLowerCase().replace("_", "-"), to: a.destinationId, toName: destName, transition: describeTransition(a.transition) };
    }
    if (a.type === "URL") return { action: "url", url: a.url };
    if (a.type === "BACK" || a.type === "CLOSE") return { action: a.type.toLowerCase() };
    if (a.type === "SET_VARIABLE_MODE") return { action: "set-mode", collection: a.variableCollectionId, mode: a.variableModeId };
    if (a.type === "SET_VARIABLE") return { action: "set-variable", variable: a.variableId, value: (_b = a.variableValue) == null ? void 0 : _b.value };
    return { action: a.type.toLowerCase() };
  }
  async function describeReactions(node, names) {
    var _a, _b, _c;
    const out = [];
    for (const r of (_a = node.reactions) != null ? _a : []) {
      const t = r.trigger;
      const trig = { trigger: t ? (_b = TRIGGER_NAMES[t.type]) != null ? _b : t.type : "none" };
      if (t && t.type === "AFTER_TIMEOUT") trig.delayMs = Math.round(t.timeout * 1e3);
      if (t && (t.type === "MOUSE_ENTER" || t.type === "MOUSE_LEAVE" || t.type === "MOUSE_UP" || t.type === "MOUSE_DOWN") && t.delay) trig.delayMs = Math.round(t.delay * 1e3);
      if (t && t.type === "ON_KEY_DOWN") trig.keyCodes = t.keyCodes;
      const actions = (_c = r.actions) != null ? _c : r.action ? [r.action] : [];
      out.push(__spreadProps(__spreadValues({}, trig), { actions: await Promise.all(actions.map((a) => describeAction(a, names))) }));
    }
    return out;
  }
  async function readPrototype(p) {
    const ctx = new Ctx();
    const root = p.root ? await ctx.node(p.root) : figma.currentPage;
    const names = /* @__PURE__ */ new Map();
    const nodes = [];
    const visit = (n) => {
      var _a, _b;
      if ("reactions" in n && ((_b = (_a = n.reactions) == null ? void 0 : _a.length) != null ? _b : 0) > 0) nodes.push(n);
      if ("children" in n) for (const c of n.children) visit(c);
    };
    visit(root);
    const links = [];
    for (const n of nodes) {
      names.set(n.id, n.name);
      const screen = screenOf(n);
      links.push({ from: n.id, fromName: n.name, screen: screen == null ? void 0 : screen.name, reactions: await describeReactions(n, names) });
    }
    const scrolling = [];
    const page = figma.currentPage;
    for (const c of page.children) {
      if ("overflowDirection" in c && c.overflowDirection !== "NONE") {
        scrolling.push({ id: c.id, name: c.name, overflow: c.overflowDirection.toLowerCase(), fixedChildren: c.numberOfFixedChildren });
      }
    }
    return { flows: page.flowStartingPoints.map((f) => __spreadValues({}, f)), links, scrolling };
  }

  // src/plugin/paint.ts
  var isVar = (v) => typeof v === "string" && v.startsWith("$");
  async function colorOf(input, ctx, path) {
    var _a, _b, _c, _d;
    if (isVar(input)) {
      const v = await ctx.variable(input, "COLOR");
      const val = await ctx.resolveVariableValue(v);
      const c2 = val;
      return { rgba: { r: (_a = c2.r) != null ? _a : 0, g: (_b = c2.g) != null ? _b : 0, b: (_c = c2.b) != null ? _c : 0, a: (_d = c2.a) != null ? _d : 1 }, variable: v };
    }
    const c = parseColor(input);
    if (!c) throw badRequest(`${path}: cannot read color ${JSON.stringify(input)} (use #RRGGBB, #RRGGBBAA, rgb(), hsl() or "$variable").`);
    return { rgba: c };
  }
  function gradientTransform(angleDeg) {
    const rad = angleDeg * Math.PI / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    return [
      [dx, dy, 0.5 - 0.5 * dx - 0.5 * dy],
      [-dy, dx, 0.5 + 0.5 * dy - 0.5 * dx]
    ];
  }
  function angleOf(t) {
    const dx = t[0][0];
    const dy = t[0][1];
    const deg = Math.atan2(dx, -dy) * 180 / Math.PI;
    return Math.round((deg % 360 + 360) % 360);
  }
  var SCALE_MODE = { fill: "FILL", fit: "FIT", crop: "CROP", tile: "TILE" };
  async function toPaints(specs, ctx, path) {
    var _a, _b, _c, _d, _e;
    if (!specs || !specs.length) return { paints: [] };
    const style = specs.find((s) => s.kind === "style");
    if (style && style.kind === "style") {
      if (specs.length > 1) ctx.warn(`${path}: a paint style replaces the whole fill list; other paints ignored.`);
      const s = await ctx.style(style.name, "PAINT");
      return { paints: [...s.paints], styleId: s.id };
    }
    const out = [];
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      const p = specs.length > 1 ? `${path}[${i}]` : path;
      if (s.kind === "solid") {
        const { rgba, variable } = await colorOf(s.color, ctx, p);
        const base = { type: "SOLID", color: { r: rgba.r, g: rgba.g, b: rgba.b }, opacity: variable ? (_a = s.opacity) != null ? _a : 1 : rgba.a * ((_b = s.opacity) != null ? _b : 1) };
        out.push(variable ? figma.variables.setBoundVariableForPaint(base, "color", variable) : base);
      } else if (s.kind === "gradient") {
        const stops = [];
        for (const st of s.stops) {
          const { rgba, variable } = await colorOf(st.color, ctx, `${p}.stops`);
          const stop = variable ? { position: st.position, color: rgba, boundVariables: { color: figma.variables.createVariableAlias(variable) } } : { position: st.position, color: rgba };
          stops.push(stop);
        }
        const type = { linear: "GRADIENT_LINEAR", radial: "GRADIENT_RADIAL", angular: "GRADIENT_ANGULAR", diamond: "GRADIENT_DIAMOND" }[s.gradient];
        const transform = s.gradient === "linear" ? gradientTransform(s.angle) : [[1, 0, 0], [0, 1, 0]];
        out.push({ type, gradientTransform: transform, gradientStops: stops, opacity: (_c = s.opacity) != null ? _c : 1 });
      } else if (s.kind === "image") {
        if (!s.imageData) {
          throw badRequest(`${p}: image "${(_d = s.src) != null ? _d : ""}" was not loaded. Image sources are read by the MCP server (absolute file path or http(s) URL); inside execute use figma.createImage(bytes).`);
        }
        const image = figma.createImage(figma.base64Decode(s.imageData));
        out.push({ type: "IMAGE", imageHash: image.hash, scaleMode: SCALE_MODE[s.fit], opacity: (_e = s.opacity) != null ? _e : 1 });
      }
    }
    return { paints: out };
  }
  async function applyFills(node, specs, ctx, path) {
    if (!("fills" in node)) {
      ctx.warn(`${path}: ${node.type.toLowerCase()} has no fills.`);
      return;
    }
    const r = await toPaints(specs, ctx, path);
    if (r.styleId) await node.setFillStyleIdAsync(r.styleId);
    else node.fills = r.paints;
  }
  async function bindNumber(node, field, value, ctx, path) {
    if (isVar(value)) {
      const v = await ctx.variable(value, "FLOAT");
      node.setBoundVariable(field, v);
      const resolved = await ctx.resolveVariableValue(v);
      return typeof resolved === "number" ? resolved : void 0;
    }
    if (typeof value !== "number") throw badRequest(`${path}: expected a number or "$variable".`);
    return value;
  }
  async function numberOf(value, ctx) {
    if (isVar(value)) {
      const v = await ctx.variable(value, "FLOAT");
      const resolved = await ctx.resolveVariableValue(v);
      return { n: typeof resolved === "number" ? resolved : 0, variable: v };
    }
    return { n: Number(value) };
  }
  async function applyStroke(node, s, ctx, path) {
    if (!("strokes" in node)) {
      ctx.warn(`${path}: ${node.type.toLowerCase()} has no strokes.`);
      return;
    }
    const n = node;
    if (s === null) {
      n.strokes = [];
      return;
    }
    if (s.paints.length) {
      const r = await toPaints(s.paints, ctx, `${path}.color`);
      if (r.styleId) await n.setStrokeStyleIdAsync(r.styleId);
      else n.strokes = r.paints;
    }
    if (s.weight !== void 0) {
      if (Array.isArray(s.weight)) {
        if (!("strokeTopWeight" in node)) throw badRequest(`${path}.weight: per-side stroke weights need a frame or rectangle.`);
        const fields = ["strokeTopWeight", "strokeRightWeight", "strokeBottomWeight", "strokeLeftWeight"];
        for (let i = 0; i < 4; i++) {
          const val = await bindNumber(node, fields[i], s.weight[i], ctx, `${path}.weight[${i}]`);
          if (val !== void 0 && typeof s.weight[i] === "number") node[fields[i]] = val;
        }
      } else {
        const val = await bindNumber(node, "strokeWeight", s.weight, ctx, `${path}.weight`);
        if (val !== void 0 && typeof s.weight === "number") n.strokeWeight = val;
      }
    }
    if (s.align) n.strokeAlign = { inside: "INSIDE", center: "CENTER", outside: "OUTSIDE" }[s.align];
    if (s.dash) n.dashPattern = s.dash;
    if (s.cap && "strokeCap" in node) node.strokeCap = { none: "NONE", round: "ROUND", square: "SQUARE" }[s.cap];
    if (s.join) n.strokeJoin = { miter: "MITER", bevel: "BEVEL", round: "ROUND" }[s.join];
  }
  async function toEffects(specs, ctx, path) {
    if (!specs || !specs.length) return { effects: [] };
    const style = specs.find((s) => s.kind === "style");
    if (style && style.kind === "style") {
      if (specs.length > 1) ctx.warn(`${path}: an effect style replaces the whole effect list; other effects ignored.`);
      const s = await ctx.style(style.name, "EFFECT");
      return { effects: [...s.effects], styleId: s.id };
    }
    const out = [];
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      const p = `${path}[${i}]`;
      if (s.kind === "drop-shadow" || s.kind === "inner-shadow") {
        const { rgba, variable } = await colorOf(s.color, ctx, `${p}.color`);
        const [x, y, blur, spread] = await Promise.all([numberOf(s.x, ctx), numberOf(s.y, ctx), numberOf(s.blur, ctx), numberOf(s.spread, ctx)]);
        let e = s.kind === "drop-shadow" ? { type: "DROP_SHADOW", color: rgba, offset: { x: x.n, y: y.n }, radius: blur.n, spread: spread.n, visible: true, blendMode: "NORMAL", showShadowBehindNode: false } : { type: "INNER_SHADOW", color: rgba, offset: { x: x.n, y: y.n }, radius: blur.n, spread: spread.n, visible: true, blendMode: "NORMAL" };
        if (variable) e = figma.variables.setBoundVariableForEffect(e, "color", variable);
        if (x.variable) e = figma.variables.setBoundVariableForEffect(e, "offsetX", x.variable);
        if (y.variable) e = figma.variables.setBoundVariableForEffect(e, "offsetY", y.variable);
        if (blur.variable) e = figma.variables.setBoundVariableForEffect(e, "radius", blur.variable);
        if (spread.variable) e = figma.variables.setBoundVariableForEffect(e, "spread", spread.variable);
        out.push(e);
      } else if (s.kind === "layer-blur" || s.kind === "background-blur") {
        const r = await numberOf(s.radius, ctx);
        let e = { type: s.kind === "layer-blur" ? "LAYER_BLUR" : "BACKGROUND_BLUR", blurType: "NORMAL", radius: r.n, visible: true };
        if (r.variable) e = figma.variables.setBoundVariableForEffect(e, "radius", r.variable);
        out.push(e);
      }
    }
    return { effects: out };
  }
  async function applyEffects(node, specs, ctx, path) {
    if (!("effects" in node)) {
      ctx.warn(`${path}: ${node.type.toLowerCase()} has no effects.`);
      return;
    }
    const r = await toEffects(specs, ctx, path);
    if (r.styleId) await node.setEffectStyleIdAsync(r.styleId);
    else node.effects = r.effects;
  }
  async function recolorVectors(root, specs, ctx, path) {
    const r = await toPaints(specs, ctx, path);
    if (!r.paints.length && !r.styleId) return 0;
    const targets = [];
    const visit = (n) => {
      if (["VECTOR", "BOOLEAN_OPERATION", "STAR", "POLYGON", "ELLIPSE", "RECTANGLE", "LINE"].includes(n.type)) targets.push(n);
      if ("children" in n && n.type !== "BOOLEAN_OPERATION") for (const c of n.children) visit(c);
    };
    visit(root);
    let count = 0;
    for (const t of targets) {
      const g2 = t;
      const hasStroke = Array.isArray(g2.strokes) && g2.strokes.some((s) => s.visible !== false);
      const hasFill = Array.isArray(g2.fills) && g2.fills.some((f) => f.visible !== false);
      if (hasStroke) {
        if (r.styleId) await g2.setStrokeStyleIdAsync(r.styleId);
        else g2.strokes = r.paints;
        count++;
      }
      if (hasFill) {
        if (r.styleId) await g2.setFillStyleIdAsync(r.styleId);
        else g2.fills = r.paints;
        count++;
      }
    }
    return count;
  }

  // src/plugin/text.ts
  var DEFAULT_FAMILY = "Inter";
  var isVar2 = (v) => typeof v === "string" && v.startsWith("$");
  function lineHeightOf(v) {
    if (typeof v === "number") return { unit: "PIXELS", value: v };
    const s = String(v).trim().toLowerCase();
    if (s === "auto") return { unit: "AUTO" };
    if (s.endsWith("%")) return { unit: "PERCENT", value: parseFloat(s) };
    return null;
  }
  function letterSpacingOf(v) {
    if (typeof v === "number") return { unit: "PIXELS", value: v };
    const s = String(v).trim();
    if (s.endsWith("%")) return { unit: "PERCENT", value: parseFloat(s) };
    return null;
  }
  var CASE2 = {
    original: "ORIGINAL",
    upper: "UPPER",
    lower: "LOWER",
    title: "TITLE",
    "small-caps": "SMALL_CAPS",
    "small-caps-forced": "SMALL_CAPS_FORCED"
  };
  var DECORATION2 = { none: "NONE", underline: "UNDERLINE", strike: "STRIKETHROUGH" };
  function hasFontIdentity(f) {
    return !!f && (f.family !== void 0 || f.weight !== void 0 || f.italic !== void 0 || f.style !== void 0);
  }
  async function fontFor(own, inherited, ctx, fallback) {
    var _a, _b, _c, _d, _e, _f;
    const family = (_c = (_b = (_a = own == null ? void 0 : own.family) != null ? _a : inherited.family) != null ? _b : fallback == null ? void 0 : fallback.family) != null ? _c : DEFAULT_FAMILY;
    const style = (_d = own == null ? void 0 : own.style) != null ? _d : (own == null ? void 0 : own.family) === void 0 && (own == null ? void 0 : own.weight) === void 0 && (own == null ? void 0 : own.italic) === void 0 ? inherited.style : void 0;
    const weight = (_e = own == null ? void 0 : own.weight) != null ? _e : inherited.weight;
    const italic = (_f = own == null ? void 0 : own.italic) != null ? _f : inherited.italic;
    if (!style && weight === void 0 && italic === void 0 && fallback && family === fallback.family) return fallback;
    return ctx.resolveFont(family, weight, italic, style);
  }
  async function applyTypography(node, f, ctx, path, start2, end) {
    const range = start2 !== void 0 && end !== void 0 && end > start2;
    if (f.size !== void 0) {
      if (isVar2(f.size)) {
        const v = await ctx.variable(f.size, "FLOAT");
        if (range) node.setRangeBoundVariable(start2, end, "fontSize", v);
        else node.setBoundVariable("fontSize", v);
      } else if (range) node.setRangeFontSize(start2, end, Number(f.size));
      else node.fontSize = Number(f.size);
    }
    if (f.lineHeight !== void 0) {
      if (isVar2(f.lineHeight)) {
        const v = await ctx.variable(f.lineHeight, "FLOAT");
        if (range) node.setRangeBoundVariable(start2, end, "lineHeight", v);
        else node.setBoundVariable("lineHeight", v);
      } else {
        const lh = lineHeightOf(f.lineHeight);
        if (!lh) throw badRequest(`${path}.lineHeight: use a px number, "150%", "auto" or "$variable".`);
        if (range) node.setRangeLineHeight(start2, end, lh);
        else node.lineHeight = lh;
      }
    }
    if (f.letterSpacing !== void 0) {
      if (isVar2(f.letterSpacing)) {
        const v = await ctx.variable(f.letterSpacing, "FLOAT");
        if (range) node.setRangeBoundVariable(start2, end, "letterSpacing", v);
        else node.setBoundVariable("letterSpacing", v);
      } else {
        const ls = letterSpacingOf(f.letterSpacing);
        if (!ls) throw badRequest(`${path}.letterSpacing: use a px number, "-2%" or "$variable".`);
        if (range) node.setRangeLetterSpacing(start2, end, ls);
        else node.letterSpacing = ls;
      }
    }
    if (f.case) {
      if (range) node.setRangeTextCase(start2, end, CASE2[f.case]);
      else node.textCase = CASE2[f.case];
    }
    if (f.decoration) {
      if (range) node.setRangeTextDecoration(start2, end, DECORATION2[f.decoration]);
      else node.textDecoration = DECORATION2[f.decoration];
    }
  }
  async function applySegmentOverrides(node, segments, baseFont, inherited, ctx, path) {
    var _a;
    let i = 0;
    for (let k = 0; k < segments.length; k++) {
      const seg = segments[k];
      const start2 = i;
      const end = i + seg.text.length;
      i = end;
      if (end <= start2) continue;
      const p = `${path}.segments[${k}]`;
      if (hasFontIdentity(seg.font)) {
        const fn = await fontFor(seg.font, __spreadProps(__spreadValues({}, inherited), { family: (_a = inherited.family) != null ? _a : baseFont.family }), ctx, baseFont);
        await ctx.loadFont(fn);
        node.setRangeFontName(start2, end, fn);
      }
      if (seg.font) await applyTypography(node, seg.font, ctx, p, start2, end);
      if (seg.color) {
        const r = await toPaints(seg.color, ctx, `${p}.color`);
        if (r.styleId) await node.setRangeFillStyleIdAsync(start2, end, r.styleId);
        else node.setRangeFills(start2, end, r.paints);
      }
      if (seg.link) node.setRangeHyperlink(start2, end, { type: "URL", value: seg.link });
    }
  }
  async function applyText(node, spec, inh, ctx, path, isNew) {
    var _a, _b, _c, _d, _e, _f;
    if (!isNew) await ctx.loadFontsIn(node);
    let styleFont;
    if (spec.style) {
      const style = await ctx.style(spec.style, "TEXT");
      await ctx.loadFont(style.fontName);
      styleFont = style.fontName;
      await node.setTextStyleIdAsync(style.id);
    }
    let base;
    if (hasFontIdentity(spec.font) || isNew && !styleFont) {
      base = await fontFor(spec.font, inh.font, ctx, styleFont);
      await ctx.loadFont(base);
      if (styleFont && (base.family !== styleFont.family || base.style !== styleFont.style)) {
        ctx.warn(`${path}: font overrides text style "${spec.style}" (${base.family} ${base.style}).`);
      }
      if (!styleFont || base.family !== styleFont.family || base.style !== styleFont.style) node.fontName = base;
    } else {
      base = styleFont != null ? styleFont : node.fontName !== figma.mixed ? node.fontName : void 0;
    }
    if ((_a = spec.segments) == null ? void 0 : _a.length) node.characters = spec.segments.map((x) => x.text).join("");
    else if (spec.text !== void 0) node.characters = spec.text;
    const typo = isNew && !styleFont ? __spreadValues({ size: inh.font.size, lineHeight: inh.font.lineHeight, letterSpacing: inh.font.letterSpacing, case: inh.font.case, decoration: inh.font.decoration }, stripUndefined((_b = spec.font) != null ? _b : {})) : (_c = spec.font) != null ? _c : {};
    await applyTypography(node, typo, ctx, path);
    const color = (_d = spec.color) != null ? _d : isNew ? inh.color : void 0;
    if (color) {
      const r = await toPaints(color, ctx, `${path}.color`);
      if (r.styleId) await node.setFillStyleIdAsync(r.styleId);
      else node.fills = r.paints;
    }
    const align = (_e = spec.textAlign) != null ? _e : isNew && inh.rtl ? "right" : void 0;
    if (align) node.textAlignHorizontal = { left: "LEFT", center: "CENTER", right: "RIGHT", justify: "JUSTIFIED" }[align];
    if (spec.valign) node.textAlignVertical = { top: "TOP", center: "CENTER", bottom: "BOTTOM" }[spec.valign];
    if (spec.paragraphSpacing !== void 0) node.paragraphSpacing = spec.paragraphSpacing;
    if (spec.link) node.setRangeHyperlink(0, node.characters.length, { type: "URL", value: spec.link });
    if ((_f = spec.segments) == null ? void 0 : _f.length) await applySegmentOverrides(node, spec.segments, base != null ? base : { family: DEFAULT_FAMILY, style: "Regular" }, inh.font, ctx, path);
  }
  function applyTruncation(node, spec) {
    var _a;
    if (spec.maxLines === void 0 && spec.truncate === void 0) return;
    const lines = (_a = spec.maxLines) != null ? _a : spec.truncate ? 1 : null;
    if (lines === null || spec.truncate === false) {
      node.textTruncation = "DISABLED";
    } else {
      node.textTruncation = "ENDING";
      node.maxLines = lines;
    }
  }
  function stripUndefined(o) {
    const out = {};
    for (const [k, v] of Object.entries(o)) if (v !== void 0) out[k] = v;
    return out;
  }
  function inheritFrom(inh, spec) {
    var _a, _b;
    return {
      font: __spreadValues(__spreadValues({}, inh.font), stripUndefined((_a = spec.font) != null ? _a : {})),
      color: spec.color && (spec.type === "frame" || spec.type === "component" || spec.type === "section" || spec.type === "group") ? spec.color : inh.color,
      rtl: (_b = spec.rtl) != null ? _b : inh.rtl
    };
  }

  // src/plugin/styles.ts
  var CASE3 = { original: "ORIGINAL", upper: "UPPER", lower: "LOWER", title: "TITLE", "small-caps": "SMALL_CAPS", "small-caps-forced": "SMALL_CAPS_FORCED" };
  var DECO = { none: "NONE", underline: "UNDERLINE", strike: "STRIKETHROUGH" };
  async function findStyle(list, name) {
    return list.find((s) => s.name.toLowerCase() === name.toLowerCase());
  }
  async function upsertStyles(p) {
    var _a, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
    const ctx = new Ctx();
    const out = { text: [], paint: [], effect: [], grid: [], deleted: [], errors: [], warnings: [] };
    const [texts, paints2, effects2, grids] = await Promise.all([
      figma.getLocalTextStylesAsync(),
      figma.getLocalPaintStylesAsync(),
      figma.getLocalEffectStylesAsync(),
      figma.getLocalGridStylesAsync()
    ]);
    for (const def of (_a = p.text) != null ? _a : []) {
      try {
        if (!def.name) throw badRequest("text style needs a name.");
        const issues = newIssues();
        const _b = def, { name: _n, description } = _b, rest = __objRest(_b, ["name", "description"]);
        const spec = normalizeSpec(__spreadValues({ type: "text", text: "" }, rest), `text["${def.name}"]`, issues);
        if (issues.errors.length) throw badRequest(issues.errors.join("; "));
        const f = (_c = spec.font) != null ? _c : {};
        let style = await findStyle(texts, def.name);
        const isNew = !style;
        if (!style) {
          style = figma.createTextStyle();
          style.name = def.name;
        }
        const fn = await fontFor(f, {}, ctx, isNew ? void 0 : style.fontName);
        await ctx.loadFont(fn);
        style.fontName = fn;
        const bind = async (field, v) => {
          const variable = await ctx.variable(String(v), "FLOAT");
          style.setBoundVariable(field, variable);
        };
        if (f.size !== void 0) {
          if (typeof f.size === "string" && f.size.startsWith("$")) await bind("fontSize", f.size);
          else style.fontSize = Number(f.size);
        }
        if (f.lineHeight !== void 0) {
          if (typeof f.lineHeight === "string" && f.lineHeight.startsWith("$")) await bind("lineHeight", f.lineHeight);
          else {
            const lh = lineHeightOf(f.lineHeight);
            if (lh) style.lineHeight = lh;
          }
        }
        if (f.letterSpacing !== void 0) {
          if (typeof f.letterSpacing === "string" && f.letterSpacing.startsWith("$")) await bind("letterSpacing", f.letterSpacing);
          else {
            const ls = letterSpacingOf(f.letterSpacing);
            if (ls) style.letterSpacing = ls;
          }
        }
        if (f.case) style.textCase = CASE3[f.case];
        if (f.decoration) style.textDecoration = DECO[f.decoration];
        if (spec.paragraphSpacing !== void 0) style.paragraphSpacing = spec.paragraphSpacing;
        if (description !== void 0) style.description = String(description);
        out.text.push(`${isNew ? "+" : "~"} ${style.name} (${fn.family} ${fn.style} ${String(style.fontSize)})`);
        out.warnings.push(...issues.warnings, ...ctx.warnings.splice(0));
      } catch (e) {
        out.errors.push(`text "${def.name}": ${e instanceof Error ? e.message : e}`);
      }
    }
    for (const def of (_d = p.paint) != null ? _d : []) {
      try {
        if (!def.name) throw badRequest("paint style needs a name.");
        const issues = newIssues();
        const spec = normalizeSpec({ type: "rect", fill: (_e = def.fill) != null ? _e : def.color }, `paint["${def.name}"]`, issues);
        if (issues.errors.length) throw badRequest(issues.errors.join("; "));
        if (!((_f = spec.fill) == null ? void 0 : _f.length)) throw badRequest('give "fill" (color, "$variable", gradient or image).');
        if (spec.fill.some((x) => x.kind === "style")) throw badRequest("a paint style cannot reference another style.");
        const r = await toPaints(spec.fill, ctx, `paint["${def.name}"]`);
        let style = await findStyle(paints2, def.name);
        const isNew = !style;
        if (!style) {
          style = figma.createPaintStyle();
          style.name = def.name;
        }
        style.paints = r.paints;
        if (def.description !== void 0) style.description = def.description;
        out.paint.push(`${isNew ? "+" : "~"} ${style.name}`);
      } catch (e) {
        out.errors.push(`paint "${def.name}": ${e instanceof Error ? e.message : e}`);
      }
    }
    for (const def of (_g = p.effect) != null ? _g : []) {
      try {
        if (!def.name) throw badRequest("effect style needs a name.");
        const issues = newIssues();
        const spec = normalizeSpec({ type: "rect", effects: (_h = def.effects) != null ? _h : def.shadow }, `effect["${def.name}"]`, issues);
        if (issues.errors.length) throw badRequest(issues.errors.join("; "));
        if (!((_i = spec.effects) == null ? void 0 : _i.length)) throw badRequest('give "effects" (e.g. "0 4 12 -2 rgba(0,0,0,0.12)").');
        const r = await toEffects(spec.effects, ctx, `effect["${def.name}"]`);
        let style = await findStyle(effects2, def.name);
        const isNew = !style;
        if (!style) {
          style = figma.createEffectStyle();
          style.name = def.name;
        }
        style.effects = r.effects;
        if (def.description !== void 0) style.description = def.description;
        out.effect.push(`${isNew ? "+" : "~"} ${style.name}`);
      } catch (e) {
        out.errors.push(`effect "${def.name}": ${e instanceof Error ? e.message : e}`);
      }
    }
    for (const def of (_j = p.grid) != null ? _j : []) {
      try {
        const layoutGrids = ((_k = def.grids) != null ? _k : []).map((g2) => {
          var _a2, _b2, _c2, _d2, _e2, _f2, _g2, _h2, _i2;
          const color = { r: 1, g: 0, b: 0, a: 0.1 };
          if (((_a2 = g2.pattern) != null ? _a2 : "columns") === "grid") return { pattern: "GRID", sectionSize: (_b2 = g2.size) != null ? _b2 : 8, visible: true, color };
          const alignment = { stretch: "STRETCH", center: "CENTER", start: "MIN", end: "MAX" }[(_c2 = g2.align) != null ? _c2 : "stretch"];
          const base = { pattern: g2.pattern === "rows" ? "ROWS" : "COLUMNS", count: (_d2 = g2.count) != null ? _d2 : 12, gutterSize: (_e2 = g2.gutter) != null ? _e2 : 16, visible: true, color };
          return alignment === "STRETCH" ? __spreadProps(__spreadValues({}, base), { alignment, offset: (_f2 = g2.offset) != null ? _f2 : 0 }) : alignment === "CENTER" ? __spreadProps(__spreadValues({}, base), { alignment, sectionSize: (_g2 = g2.size) != null ? _g2 : 64 }) : __spreadProps(__spreadValues({}, base), { alignment, offset: (_h2 = g2.offset) != null ? _h2 : 0, sectionSize: (_i2 = g2.size) != null ? _i2 : 64 });
        });
        let style = await findStyle(grids, def.name);
        const isNew = !style;
        if (!style) {
          style = figma.createGridStyle();
          style.name = def.name;
        }
        style.layoutGrids = layoutGrids;
        if (def.description !== void 0) style.description = def.description;
        out.grid.push(`${isNew ? "+" : "~"} ${style.name}`);
      } catch (e) {
        out.errors.push(`grid "${def.name}": ${e instanceof Error ? e.message : e}`);
      }
    }
    for (const name of (_l = p.delete) != null ? _l : []) {
      const s = [...texts, ...paints2, ...effects2, ...grids].find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (s) {
        s.remove();
        out.deleted.push(name);
      } else out.errors.push(`delete: no style "${name}".`);
    }
    return out;
  }
  function describePaint(p) {
    var _a;
    if (p.type === "SOLID") return toCssColor(p.color, (_a = p.opacity) != null ? _a : 1);
    if (p.type.startsWith("GRADIENT")) {
      const g2 = p;
      return `${p.type.toLowerCase().replace("gradient_", "")}-gradient(${g2.gradientStops.map((s) => `${toCssColor(s.color, s.color.a)} ${Math.round(s.position * 100)}%`).join(", ")})`;
    }
    return p.type.toLowerCase();
  }
  function describeEffect(e) {
    var _a;
    if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
      return `${e.type === "INNER_SHADOW" ? "inset " : ""}${e.offset.x} ${e.offset.y} ${e.radius} ${(_a = e.spread) != null ? _a : 0} ${toCssColor(e.color, e.color.a)}`;
    }
    if (e.type === "LAYER_BLUR" || e.type === "BACKGROUND_BLUR") return `${e.type === "LAYER_BLUR" ? "blur" : "backdrop-blur"}(${e.radius})`;
    return e.type.toLowerCase();
  }
  async function varName(alias) {
    if (!alias) return void 0;
    const v = await figma.variables.getVariableByIdAsync(alias.id);
    return v ? `$${v.name}` : void 0;
  }
  async function readStyles() {
    var _a;
    const [texts, paints2, effects2, grids] = await Promise.all([
      figma.getLocalTextStylesAsync(),
      figma.getLocalPaintStylesAsync(),
      figma.getLocalEffectStylesAsync(),
      figma.getLocalGridStylesAsync()
    ]);
    const text = [];
    for (const s of texts) {
      const bv = (_a = s.boundVariables) != null ? _a : {};
      text.push({
        id: s.id,
        key: s.key,
        name: s.name,
        family: s.fontName.family,
        style: s.fontName.style,
        size: s.fontSize,
        lineHeight: s.lineHeight.unit === "AUTO" ? "auto" : s.lineHeight.unit === "PERCENT" ? `${Math.round(s.lineHeight.value)}%` : s.lineHeight.value,
        letterSpacing: s.letterSpacing.unit === "PERCENT" ? `${s.letterSpacing.value}%` : s.letterSpacing.value,
        case: s.textCase !== "ORIGINAL" ? s.textCase.toLowerCase() : void 0,
        decoration: s.textDecoration !== "NONE" ? s.textDecoration.toLowerCase() : void 0,
        vars: {
          fontSize: await varName(bv.fontSize),
          lineHeight: await varName(bv.lineHeight),
          fontFamily: await varName(bv.fontFamily),
          fontWeight: await varName(bv.fontWeight)
        },
        description: s.description || void 0
      });
    }
    const paint2 = [];
    for (const s of paints2) {
      const vars = await Promise.all(s.paints.map((p) => {
        var _a2;
        return p.type === "SOLID" ? varName((_a2 = p.boundVariables) == null ? void 0 : _a2.color) : Promise.resolve(void 0);
      }));
      paint2.push({ id: s.id, key: s.key, name: s.name, value: s.paints.map(describePaint).join(", "), vars: vars.filter(Boolean), description: s.description || void 0 });
    }
    return {
      text,
      paint: paint2,
      effect: effects2.map((s) => ({ id: s.id, key: s.key, name: s.name, value: s.effects.map(describeEffect).join(", "), description: s.description || void 0 })),
      grid: grids.map((s) => ({ id: s.id, name: s.name, grids: s.layoutGrids.map((g2) => __spreadValues(__spreadValues({ pattern: g2.pattern.toLowerCase() }, "count" in g2 ? { count: g2.count, gutter: g2.gutterSize } : {}), "sectionSize" in g2 && g2.sectionSize ? { size: g2.sectionSize } : {})) }))
    };
  }

  // src/plugin/inspect.ts
  var PLUGIN_VERSION = true ? "1.0.0+1300ce9" : "dev";
  function selectionSummary() {
    return figma.currentPage.selection.slice(0, 50).map((n) => ({ id: n.id, name: n.name, type: n.type, w: Math.round(n.width), h: Math.round(n.height) }));
  }
  function status() {
    var _a, _b, _c;
    const brief2 = figma.root.getPluginData("brief");
    return {
      file: { name: figma.root.name, key: (_a = figma.fileKey) != null ? _a : null, editorType: figma.editorType },
      user: (_c = (_b = figma.currentUser) == null ? void 0 : _b.name) != null ? _c : null,
      page: { id: figma.currentPage.id, name: figma.currentPage.name },
      pages: figma.root.children.map((p) => ({ id: p.id, name: p.name })),
      selection: selectionSummary(),
      brief: brief2 ? clip(brief2.split("\n")[0], 120) : null,
      pluginVersion: PLUGIN_VERSION
    };
  }
  var esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function layoutAttr(n) {
    if (!("layoutMode" in n)) return "";
    const f = n;
    if (f.layoutMode === "NONE") return "";
    const dir = f.layoutMode === "HORIZONTAL" ? "row" : f.layoutMode === "VERTICAL" ? "column" : "grid";
    return ` layout="${dir}"`;
  }
  async function metadata(p) {
    var _a, _b;
    const ctx = new Ctx();
    const depth = (_a = p.depth) != null ? _a : 4;
    const max = (_b = p.maxNodes) != null ? _b : 600;
    const lines = [];
    let count = 0;
    let truncated = false;
    const roots = [];
    if (p.nodeId) roots.push(await ctx.node(p.nodeId));
    else if (figma.currentPage.selection.length) roots.push(...figma.currentPage.selection);
    else roots.push(figma.currentPage);
    const walk = async (n, d, indent) => {
      var _a2, _b2;
      if (count >= max) {
        truncated = true;
        return;
      }
      count++;
      if (n.type === "PAGE") {
        lines.push(`${indent}<page id="${n.id}" name="${esc(n.name)}" children="${n.children.length}">`);
        for (const c of n.children) await walk(c, d + 1, indent + "  ");
        lines.push(`${indent}</page>`);
        return;
      }
      const s = n;
      if (!s.visible && !p.includeHidden) {
        lines.push(`${indent}<${s.type.toLowerCase()} id="${s.id}" name="${esc(s.name)}" hidden="true"/>`);
        return;
      }
      let attrs = `id="${s.id}" name="${esc(s.name)}" x="${round(s.x, 1)}" y="${round(s.y, 1)}" w="${round(s.width, 1)}" h="${round(s.height, 1)}"${layoutAttr(s)}`;
      if (s.type === "INSTANCE") {
        const main = await s.getMainComponentAsync();
        const owner = ((_a2 = main == null ? void 0 : main.parent) == null ? void 0 : _a2.type) === "COMPONENT_SET" ? main.parent.name : main == null ? void 0 : main.name;
        if (owner) attrs += ` component="${esc(owner)}"`;
        if (((_b2 = main == null ? void 0 : main.parent) == null ? void 0 : _b2.type) === "COMPONENT_SET" && main.variantProperties) attrs += ` variant="${esc(Object.entries(main.variantProperties).map(([k, v]) => `${k}=${v}`).join(", "))}"`;
      }
      if (s.type === "TEXT") {
        lines.push(`${indent}<text ${attrs}>${esc(clip(s.characters.replace(/\s+/g, " "), 80))}</text>`);
        return;
      }
      const kids = "children" in s ? s.children : [];
      const tag = s.type.toLowerCase();
      if (!kids.length || s.type === "INSTANCE" && d >= depth) {
        lines.push(`${indent}<${tag} ${attrs}${kids.length ? ` children="${kids.length}"` : ""}/>`);
        return;
      }
      if (d >= depth) {
        lines.push(`${indent}<${tag} ${attrs} children="${kids.length}"/>`);
        return;
      }
      lines.push(`${indent}<${tag} ${attrs}>`);
      for (const c of kids) await walk(c, d + 1, indent + "  ");
      lines.push(`${indent}</${tag}>`);
    };
    for (const r of roots) await walk(r, 0, "");
    return { xml: lines.join("\n"), nodes: count, truncated, page: { id: figma.currentPage.id, name: figma.currentPage.name } };
  }
  async function varLabel(alias, cache) {
    if (!alias) return void 0;
    const a = Array.isArray(alias) ? alias[0] : alias;
    if (!a) return void 0;
    if (cache.has(a.id)) return cache.get(a.id);
    const v = await figma.variables.getVariableByIdAsync(a.id);
    const label = v ? `$${v.name}` : `$${a.id}`;
    cache.set(a.id, label);
    return label;
  }
  async function paintsOut(paints2, cache) {
    var _a, _b, _c;
    if (paints2 === figma.mixed) return "mixed";
    const out = [];
    for (const p of paints2) {
      if (p.visible === false) continue;
      if (p.type === "SOLID") {
        const v = await varLabel((_a = p.boundVariables) == null ? void 0 : _a.color, cache);
        out.push(v ? `${v} (${toHex(p.color, (_b = p.opacity) != null ? _b : 1)})` : toHex(p.color, (_c = p.opacity) != null ? _c : 1));
      } else if (p.type === "IMAGE") out.push({ image: p.imageHash, fit: p.scaleMode.toLowerCase() });
      else if (p.type.startsWith("GRADIENT")) {
        const g2 = p;
        out.push({ gradient: p.type.replace("GRADIENT_", "").toLowerCase(), stops: g2.gradientStops.map((s) => `${toHex(s.color, s.color.a)} ${round(s.position * 100, 0)}%`) });
      } else out.push(p.type.toLowerCase());
    }
    return out;
  }
  async function styleName(id) {
    if (!id || id === figma.mixed) return id === figma.mixed ? "mixed" : void 0;
    const s = await figma.getStyleByIdAsync(id);
    return s ? `@${s.name}` : void 0;
  }
  async function nodeDetails(n, cache = /* @__PURE__ */ new Map()) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    const o = {
      id: n.id,
      name: n.name,
      type: n.type,
      x: round(n.x, 1),
      y: round(n.y, 1),
      w: round(n.width, 1),
      h: round(n.height, 1)
    };
    if (!n.visible) o.visible = false;
    if (n.locked) o.locked = true;
    if (n.parent) o.parent = { id: n.parent.id, name: n.parent.name, type: n.parent.type };
    if ("rotation" in n && n.rotation) o.rotation = round(n.rotation, 1);
    if ("opacity" in n && n.opacity !== 1) o.opacity = round(n.opacity, 3);
    const bv = (_a = n.boundVariables) != null ? _a : {};
    const vars = {};
    for (const [field, alias] of Object.entries(bv)) {
      if (field === "fills" || field === "strokes" || field === "effects" || field === "componentProperties" || field === "textRangeFills") continue;
      const l = await varLabel(alias, cache);
      if (l) vars[field] = l;
    }
    if (Object.keys(vars).length) o.variables = vars;
    if ("layoutMode" in n) {
      const f = n;
      if (f.layoutMode !== "NONE") {
        o.layout = {
          dir: f.layoutMode === "HORIZONTAL" ? "row" : f.layoutMode === "VERTICAL" ? "column" : "grid",
          gap: f.layoutMode === "GRID" ? { row: f.gridRowGap, col: f.gridColumnGap } : f.primaryAxisAlignItems === "SPACE_BETWEEN" ? "auto" : f.itemSpacing,
          pad: [f.paddingTop, f.paddingRight, f.paddingBottom, f.paddingLeft],
          justify: f.layoutMode === "GRID" ? void 0 : f.primaryAxisAlignItems.toLowerCase().replace("min", "start").replace("max", "end").replace("space_between", "between"),
          align: f.layoutMode === "GRID" ? void 0 : f.counterAxisAlignItems.toLowerCase().replace("min", "start").replace("max", "end"),
          wrap: f.layoutWrap === "WRAP" || void 0,
          rowGap: f.layoutWrap === "WRAP" ? f.counterAxisSpacing : void 0,
          cols: f.layoutMode === "GRID" ? f.gridColumnCount : void 0,
          rows: f.layoutMode === "GRID" ? f.gridRowCount : void 0
        };
      }
      if (f.clipsContent) o.clip = true;
      if (f.overflowDirection && f.overflowDirection !== "NONE") o.scroll = f.overflowDirection.toLowerCase();
    }
    if (n.parent && "layoutMode" in n.parent && n.parent.layoutMode !== "NONE") {
      const c = n;
      o.sizing = { w: c.layoutSizingHorizontal.toLowerCase(), h: c.layoutSizingVertical.toLowerCase() };
      if (c.layoutPositioning === "ABSOLUTE") o.absolute = true;
    } else if ("layoutMode" in n && n.layoutMode !== "NONE") {
      const c = n;
      o.sizing = { w: c.layoutSizingHorizontal.toLowerCase(), h: c.layoutSizingVertical.toLowerCase() };
    }
    if ("constraints" in n && !(n.parent && "layoutMode" in n.parent && n.parent.layoutMode !== "NONE")) {
      const c = n.constraints;
      o.constraints = { h: c.horizontal.toLowerCase(), v: c.vertical.toLowerCase() };
    }
    if ("minWidth" in n) {
      const m = n;
      const mm = {};
      if (m.minWidth != null) mm.minW = m.minWidth;
      if (m.maxWidth != null) mm.maxW = m.maxWidth;
      if (m.minHeight != null) mm.minH = m.minHeight;
      if (m.maxHeight != null) mm.maxH = m.maxHeight;
      if (Object.keys(mm).length) o.minMax = mm;
    }
    if ("fills" in n && n.type !== "TEXT") {
      const fs = await styleName(n.fillStyleId);
      const fills = await paintsOut(n.fills, cache);
      if (fs) o.fill = fs;
      else if (Array.isArray(fills) ? fills.length : fills) o.fill = fills;
    }
    if ("strokes" in n && n.strokes.length) {
      const s = n;
      const weight = "strokeTopWeight" in n && n.strokeTopWeight !== void 0 && s.strokeWeight === figma.mixed ? [n.strokeTopWeight, n.strokeRightWeight, n.strokeBottomWeight, n.strokeLeftWeight] : s.strokeWeight;
      o.stroke = { color: (_b = await styleName(s.strokeStyleId)) != null ? _b : await paintsOut(s.strokes, cache), weight, align: s.strokeAlign.toLowerCase(), dash: s.dashPattern.length ? s.dashPattern : void 0 };
    }
    if ("cornerRadius" in n) {
      const r = n.cornerRadius;
      if (r === figma.mixed && "topLeftRadius" in n) {
        const c = n;
        o.radius = [c.topLeftRadius, c.topRightRadius, c.bottomRightRadius, c.bottomLeftRadius];
      } else if (r) o.radius = r;
    }
    if ("effects" in n && n.effects.length) {
      const es = await styleName(n.effectStyleId);
      o.effects = es != null ? es : n.effects.filter((e) => e.visible).map(describeEffect);
    }
    if (n.type === "TEXT") {
      o.text = clip(n.characters, 2e3);
      o.textStyle = await styleName(n.textStyleId);
      o.font = n.fontName === figma.mixed ? "mixed" : `${n.fontName.family} ${n.fontName.style}`;
      o.fontSize = n.fontSize === figma.mixed ? "mixed" : n.fontSize;
      const lh = n.lineHeight;
      o.lineHeight = lh === figma.mixed ? "mixed" : lh.unit === "AUTO" ? "auto" : lh.unit === "PERCENT" ? `${round(lh.value, 1)}%` : lh.value;
      const ls = n.letterSpacing;
      o.letterSpacing = ls === figma.mixed ? "mixed" : ls.unit === "PERCENT" ? `${round(ls.value, 2)}%` : ls.value;
      o.color = (_c = await styleName(n.fillStyleId)) != null ? _c : await paintsOut(n.fills, cache);
      o.textAlign = n.textAlignHorizontal.toLowerCase();
      o.autoResize = n.textAutoResize.toLowerCase();
      if (n.textTruncation === "ENDING") o.maxLines = n.maxLines;
    }
    if (n.type === "INSTANCE") {
      const main = await n.getMainComponentAsync();
      const owner = ((_d = main == null ? void 0 : main.parent) == null ? void 0 : _d.type) === "COMPONENT_SET" ? main.parent : main;
      o.component = owner ? { id: owner.id, key: owner.key, name: owner.name, remote: owner.remote || void 0, variant: (_e = main == null ? void 0 : main.variantProperties) != null ? _e : void 0 } : null;
      const props = {};
      for (const [k, v] of Object.entries(n.componentProperties)) if (v.type !== "VARIANT") props[k.split("#")[0]] = v.value;
      if (Object.keys(props).length) o.props = props;
      if (n.overrides.length) o.overrides = n.overrides.length;
    }
    if (n.type === "COMPONENT" || n.type === "COMPONENT_SET") {
      o.key = n.key;
      if (n.description) o.description = n.description;
      if (n.type === "COMPONENT_SET" || ((_f = n.parent) == null ? void 0 : _f.type) !== "COMPONENT_SET") {
        const defs = n.componentPropertyDefinitions;
        o.properties = Object.fromEntries(
          Object.entries(defs).map(([k, d]) => [k.split("#")[0], d.type === "VARIANT" ? { type: "variant", options: d.variantOptions, default: d.defaultValue } : { type: d.type.toLowerCase(), default: d.defaultValue }])
        );
      } else if (n.variantProperties) o.variant = n.variantProperties;
    }
    if ("componentPropertyReferences" in n && n.componentPropertyReferences && Object.keys(n.componentPropertyReferences).length) {
      o.boundProps = Object.fromEntries(Object.entries(n.componentPropertyReferences).map(([k, v]) => [k, String(v).split("#")[0]]));
    }
    if ("explicitVariableModes" in n && Object.keys(n.explicitVariableModes).length) {
      const modes = {};
      for (const [collId, modeId] of Object.entries(n.explicitVariableModes)) {
        const c = await figma.variables.getVariableCollectionByIdAsync(collId);
        modes[(_g = c == null ? void 0 : c.name) != null ? _g : collId] = (_i = (_h = c == null ? void 0 : c.modes.find((m) => m.modeId === modeId)) == null ? void 0 : _h.name) != null ? _i : modeId;
      }
      o.modes = modes;
    }
    if ("reactions" in n && n.reactions.length) o.interactions = await describeReactions(n, /* @__PURE__ */ new Map());
    if ("annotations" in n && ((_j = n.annotations) == null ? void 0 : _j.length)) o.annotations = n.annotations.map((a) => {
      var _a2;
      return (_a2 = a.label) != null ? _a2 : a.labelMarkdown;
    });
    if ("children" in n) {
      const kids = n.children;
      o.children = kids.slice(0, 60).map((c) => `${c.id} ${c.type.toLowerCase()} "${clip(c.name, 40)}"`);
      if (kids.length > 60) o.moreChildren = kids.length - 60;
    }
    return o;
  }
  async function getNodes(p) {
    var _a;
    const ctx = new Ctx();
    const ids = ((_a = p.ids) == null ? void 0 : _a.length) ? p.ids : figma.currentPage.selection.map((n) => n.id);
    if (!ids.length) throw badRequest("Pass ids (or select layers in Figma).");
    const cache = /* @__PURE__ */ new Map();
    const out = [];
    for (const id of ids.slice(0, 30)) out.push(await nodeDetails(await ctx.sceneNode(id), cache));
    return { nodes: out };
  }
  async function search(p) {
    var _a, _b, _c, _d;
    const ctx = new Ctx();
    const limit = (_a = p.limit) != null ? _a : 50;
    const q = ((_b = p.query) != null ? _b : "").toLowerCase();
    const types = ((_c = p.types) != null ? _c : []).map((t) => t.toUpperCase().replace("RECT", "RECTANGLE").replace("RECTANGLEANGLE", "RECTANGLE"));
    const where = (_d = p.in) != null ? _d : "both";
    let roots = [figma.currentPage];
    if (p.within) roots = [await ctx.node(p.within)];
    else if (p.allPages) {
      await figma.loadAllPagesAsync();
      roots = [...figma.root.children];
    }
    const results = [];
    let scanned = 0;
    for (const root of roots) {
      if (!("findAllWithCriteria" in root)) continue;
      const candidates = types.length ? root.findAllWithCriteria({ types }) : root.findAll(() => true);
      for (const n of candidates) {
        scanned++;
        const nameHit = where !== "text" && (!q || n.name.toLowerCase().includes(q));
        const textHit = where !== "name" && n.type === "TEXT" && q && n.characters.toLowerCase().includes(q);
        if (!nameHit && !textHit) continue;
        const path = [];
        let par = n.parent;
        while (par && par.type !== "PAGE" && path.length < 6) {
          path.unshift(par.name);
          par = par.parent;
        }
        results.push({
          id: n.id,
          name: n.name,
          type: n.type,
          page: (par == null ? void 0 : par.type) === "PAGE" ? par.name : void 0,
          path: path.join(" / ") || void 0,
          text: n.type === "TEXT" ? clip(n.characters, 60) : void 0
        });
        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }
    return { results, scanned, more: results.length >= limit };
  }
  async function fonts(p) {
    var _a;
    const ctx = new Ctx();
    const list = await ctx.listFonts(p.query);
    return { families: list.slice(0, (_a = p.limit) != null ? _a : 40).map((f) => ({ family: f.family, styles: f.styles })), total: list.length };
  }
  async function brief(p) {
    var _a;
    const current = figma.root.getPluginData("brief");
    const action2 = (_a = p.action) != null ? _a : "get";
    if (action2 === "get") return { brief: current || null };
    if (!p.text) throw badRequest("text is required.");
    const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const next = action2 === "set" ? p.text : `${current ? `${current}
` : ""}- ${stamp}: ${p.text}`;
    if (next.length > 9e4) throw badRequest('The brief is too long (90k chars max); summarise it with action "set".');
    figma.root.setPluginData("brief", next);
    return { brief: next, length: next.length };
  }
  async function navigate(p) {
    var _a;
    const ctx = new Ctx();
    if (p.page) {
      const target = figma.root.children.find((pg) => pg.id === p.page || pg.name.toLowerCase() === p.page.toLowerCase());
      if (!target) throw badRequest(`No page "${p.page}". Pages: ${figma.root.children.map((x) => x.name).join(", ")}.`);
      await figma.setCurrentPageAsync(target);
    }
    if ((_a = p.select) == null ? void 0 : _a.length) {
      const nodes = [];
      for (const id of p.select) {
        const n = await getNodeSafe(id);
        if (n && n.type !== "PAGE" && n.type !== "DOCUMENT") nodes.push(n);
      }
      if (nodes.length) {
        const page = nodes[0].parent ? pageOf(nodes[0]) : null;
        if (page && page !== figma.currentPage) await figma.setCurrentPageAsync(page);
        figma.currentPage.selection = nodes;
        if (p.zoom !== false) figma.viewport.scrollAndZoomIntoView(nodes);
      }
    }
    void ctx;
    return { page: figma.currentPage.name, selection: selectionSummary() };
  }
  function pageOf(n) {
    let p = n;
    while (p && p.type !== "PAGE") p = p.parent;
    return p;
  }

  // src/plugin/pages.ts
  var ROLE_NAMES = { components: "Components", trash: "Trash", references: "References" };
  var CREATED_BY = "figma-mcp";
  var normName = (s) => s.replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase().replace(/s$/, "");
  var isBlankDefault = (p) => /^page \d+$/i.test(p.name.trim()) && p.children.length === 0;
  var PAGE_ORDER = [
    [/^(cover|thumbnail)/, 0],
    [/^(app|mobile|ios|android)/, 10],
    [/^(web|website|landing|site)/, 20],
    [/^(dashboard|admin|panel|backoffice)/, 30],
    [/^(banner|marketing|social|ads?)\b/, 40],
    [/^(component|design system|icon|asset)/, 80],
    [/^(reference|moodboard|inspiration)/, 90],
    [/^(archive)/, 95],
    [/^(trash)/, 100]
  ];
  function pageRank(name) {
    const n = normName(name);
    for (const [re, rank] of PAGE_ORDER) if (re.test(n)) return rank;
    return 50;
  }
  async function ensurePage(name, role) {
    const clean = name.trim();
    if (!clean) throw badRequest("page name is empty.");
    if (role) {
      const byRole = figma.root.children.find((p) => p.getPluginData("role") === role);
      if (byRole) {
        await byRole.loadAsync();
        return { page: byRole, created: false };
      }
    }
    const byName = figma.root.children.find((p) => normName(p.name) === normName(clean));
    if (byName) {
      await byName.loadAsync();
      if (role) byName.setPluginData("role", role);
      return { page: byName, created: false };
    }
    for (const p of figma.root.children) await p.loadAsync();
    const blank = figma.root.children.length === 1 ? figma.root.children.find(isBlankDefault) : void 0;
    if (blank) {
      blank.name = clean;
      if (role) blank.setPluginData("role", role);
      blank.setPluginData("createdBy", CREATED_BY);
      return { page: blank, created: false };
    }
    const page = figma.createPage();
    page.name = clean;
    if (role) page.setPluginData("role", role);
    page.setPluginData("createdBy", CREATED_BY);
    const rank = pageRank(clean);
    const pages = figma.root.children.filter((p) => p !== page);
    const at = pages.findIndex((p) => pageRank(p.name) > rank);
    if (at >= 0) figma.root.insertChild(at, page);
    return { page, created: true };
  }
  var rolePage = (role) => ensurePage(ROLE_NAMES[role], role);
  var isTrashPage = (p) => !!p && p.getPluginData("role") === "trash";
  async function dropIfEmpty(page) {
    var _a;
    if (!page || page.removed || page.children.length || page.getPluginData("createdBy") !== CREATED_BY) return false;
    if (figma.root.children.length < 2) return false;
    if (figma.currentPage === page) {
      const other = (_a = figma.root.children.find((p) => p !== page && !isTrashPage(p))) != null ? _a : figma.root.children.find((p) => p !== page);
      if (!other) return false;
      await figma.setCurrentPageAsync(other);
    }
    page.remove();
    return true;
  }
  function freeSpot(container2, exclude) {
    let right = -Infinity;
    let top = Infinity;
    for (const c of container2.children) {
      if (c === exclude) continue;
      right = Math.max(right, c.x + c.width);
      top = Math.min(top, c.y);
    }
    if (Number.isFinite(right)) return { x: Math.round(right + 120), y: Math.round(top) };
    return container2.type === "SECTION" ? { x: SECTION_MARGIN, y: SECTION_MARGIN + 40 } : { x: 0, y: 0 };
  }
  var SECTION_MARGIN = 80;
  function fitSections(within) {
    for (const c of within.children) {
      if (c.type !== "SECTION") continue;
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
  async function trashNodes(nodes) {
    var _a, _b;
    if (!nodes.length) return { trashed: [], page: "Trash", removedPages: [] };
    const { page } = await rolePage("trash");
    const out = [];
    const sources = /* @__PURE__ */ new Set();
    for (const n of nodes) {
      if (n.removed) continue;
      const parent = n.parent;
      const from = pageOf(n);
      if (from === page) {
        out.push(n.id);
        continue;
      }
      if (!parent || parent.type === "INSTANCE") throw badRequest(`"${n.name}" (${n.id}) is part of an instance and cannot be moved; change its main component or hide it.`);
      const origin = {
        pageId: (_a = from == null ? void 0 : from.id) != null ? _a : "",
        pageName: (_b = from == null ? void 0 : from.name) != null ? _b : "",
        parentId: parent.id,
        parentName: parent.name,
        index: "children" in parent ? parent.children.indexOf(n) : 0,
        x: Math.round(n.x),
        y: Math.round(n.y),
        at: (/* @__PURE__ */ new Date()).toISOString().slice(0, 16).replace("T", " ")
      };
      const spot = freeSpot(page);
      page.appendChild(n);
      n.x = spot.x;
      n.y = spot.y;
      n.setPluginData("trash", JSON.stringify(origin));
      if (from) sources.add(from);
      out.push(n.id);
    }
    const removedPages = [];
    for (const p of sources) {
      const name = p.name;
      if (await dropIfEmpty(p)) removedPages.push(name);
    }
    return { trashed: out, page: page.name, removedPages };
  }
  async function restoreNodes(nodes, parentOverride) {
    var _a, _b, _c;
    const out = [];
    let trash = null;
    for (const n of nodes) {
      const raw = n.getPluginData("trash");
      if (!raw && !parentOverride) throw badRequest(`"${n.name}" (${n.id}) is not in the Trash.`);
      const origin = raw ? JSON.parse(raw) : {};
      if (isTrashPage(pageOf(n))) trash = pageOf(n);
      let parent = parentOverride != null ? parentOverride : null;
      if (!parent && origin.parentId) {
        const p = await getNodeSafe(origin.parentId);
        if (p && "appendChild" in p && !p.removed && !isTrashPage(pageOf(p))) parent = p;
      }
      if (!parent && origin.pageId) {
        const p = await getNodeSafe(origin.pageId);
        if (p && p.type === "PAGE" && !p.removed) {
          await p.loadAsync();
          parent = p;
        }
      }
      if (!parent && origin.pageName) parent = (await ensurePage(origin.pageName)).page;
      if (!parent) throw notFound(`The original place of "${n.name}" no longer exists; pass a parent to restore it into.`);
      const idx = Math.min((_a = origin.index) != null ? _a : parent.children.length, parent.children.length);
      parent.insertChild(idx, n);
      const auto = "layoutMode" in parent && parent.layoutMode !== "NONE";
      if (!auto) {
        n.x = (_b = origin.x) != null ? _b : n.x;
        n.y = (_c = origin.y) != null ? _c : n.y;
      }
      n.setPluginData("trash", "");
      out.push({ id: n.id, to: `${parent.name} (${parent.id})` });
    }
    await dropIfEmpty(trash);
    return out;
  }
  var PLACEHOLDER_ROLE = "image-placeholder";
  var CAPTION_ROLE = "placeholder-caption";
  function nextImageId() {
    const n = Number(figma.root.getPluginData("imageCounter") || "0") + 1;
    figma.root.setPluginData("imageCounter", String(n));
    return `IMG-${String(n).padStart(3, "0")}`;
  }
  function promptKey(prompt) {
    const s = prompt.trim().toLowerCase().replace(/\s+/g, " ");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }
  function imageIdFor(prompt, supply = false) {
    const key = (supply ? "s:" : "") + promptKey(prompt);
    let reg = {};
    try {
      reg = JSON.parse(figma.root.getPluginData("imageIds") || "{}");
    } catch (e) {
    }
    if (reg[key]) return reg[key];
    const id = nextImageId();
    reg[key] = id;
    figma.root.setPluginData("imageIds", JSON.stringify(reg));
    return id;
  }
  var isPlaceholderBox = (n) => n.type === "FRAME" && (n.getPluginData("role") === PLACEHOLDER_ROLE || n.name === "Image placeholder");
  function neededPrompt(n) {
    if (n.type !== "FRAME" && n.type !== "RECTANGLE") return null;
    const prompt = n.getPluginData("prompt") || n.getPluginData("placeholder");
    if (prompt) return prompt;
    return isPlaceholderBox(n) ? "" : null;
  }
  async function setImagePrompt(n, prompt, loadFont, supply = false) {
    if (n.type !== "FRAME" && n.type !== "RECTANGLE") throw badRequest(`${supply ? "supply" : "prompt"}: only frames and rectangles hold images ("${n.name}" is a ${n.type.toLowerCase()}).`);
    const id = imageIdFor(prompt, supply);
    n.setPluginData("prompt", prompt.trim());
    n.setPluginData("supply", supply ? "1" : "");
    n.setPluginData("imageId", id);
    if (n.type === "FRAME") {
      const caption = n.children.find((c) => c.type === "TEXT" && c.getPluginData("role") === CAPTION_ROLE);
      if (caption) {
        await loadFont(caption.fontName);
        caption.characters = captionText(n.getPluginData("placeholder") || n.name, id);
      }
    }
    return id;
  }
  var captionText = (label, imageId) => {
    const l = label && !/^image( placeholder)?$/i.test(label) ? label : "Image";
    return imageId ? `${l}
${imageId}` : l;
  };
  async function addCaption(f, text, font, loadFont) {
    await loadFont(font);
    const t = figma.createText();
    f.appendChild(t);
    t.fontName = font;
    t.characters = text;
    t.fontSize = 12;
    t.fills = [{ type: "SOLID", color: { r: 0.29, g: 0.29, b: 0.29 } }];
    t.textAlignHorizontal = "CENTER";
    t.textAutoResize = "HEIGHT";
    t.layoutSizingHorizontal = "FILL";
    t.name = "Caption";
    t.setPluginData("role", CAPTION_ROLE);
    return t;
  }
  async function listPlaceholders(p) {
    var _a, _b, _c, _d;
    const roots = [];
    if (p.within) {
      const n = await getNodeSafe(p.within);
      if (!n || !("children" in n)) throw notFound(`within ${p.within}: not found or has no children.`);
      roots.push(n);
    } else if (p.allPages !== false) {
      await figma.loadAllPagesAsync();
      roots.push(...figma.root.children.filter((pg) => !isTrashPage(pg)));
    } else roots.push(figma.currentPage);
    const out = [];
    for (const root of roots) {
      const nodes = root.findAllWithCriteria({ types: ["FRAME", "RECTANGLE"] });
      for (const n of nodes) {
        if (n.id.includes(";")) continue;
        const prompt = neededPrompt(n);
        if (prompt === null) continue;
        const supply = n.getPluginData("supply") === "1";
        let imageId = n.getPluginData("imageId");
        if (!imageId) {
          imageId = prompt ? imageIdFor(prompt, supply) : nextImageId();
          n.setPluginData("imageId", imageId);
        }
        const path = [];
        let par = n.parent;
        let screen;
        let screenId;
        while (par && par.type !== "PAGE") {
          path.unshift(par.name);
          if ((((_a = par.parent) == null ? void 0 : _a.type) === "PAGE" || ((_b = par.parent) == null ? void 0 : _b.type) === "SECTION") && par.type !== "SECTION") {
            screen = par.name;
            screenId = par.id;
          }
          par = par.parent;
        }
        out.push(__spreadValues(__spreadValues({ nodeId: n.id, imageId, name: n.name, page: (_d = (_c = pageOf(n)) == null ? void 0 : _c.name) != null ? _d : "", screen, path: path.join(" / "), w: Math.round(n.width), h: Math.round(n.height), prompt }, supply ? { supply } : {}), screenId ? { screenId } : {}));
      }
    }
    return { placeholders: out };
  }
  var SCALE = { fill: "FILL", fit: "FIT", crop: "CROP", tile: "TILE" };
  async function placeImage(p) {
    var _a;
    const image = figma.createImage(figma.base64Decode(p.imageData));
    const paint2 = { type: "IMAGE", imageHash: image.hash, scaleMode: SCALE[(_a = p.fit) != null ? _a : "fill"] };
    const placed = [];
    for (const id of p.ids) {
      const n = await getNodeSafe(id);
      if (!n || n.type !== "FRAME" && n.type !== "RECTANGLE") throw notFound(`image target ${id} not found (frame or rectangle).`);
      const box = isPlaceholderBox(n);
      const keep = box ? [] : (Array.isArray(n.fills) ? n.fills : []).filter((f) => {
        var _a2;
        return f.visible !== false && f.type !== "IMAGE" && !(f.type === "SOLID" && ((_a2 = f.opacity) != null ? _a2 : 1) >= 1);
      });
      n.fills = [paint2, ...keep];
      if (n.type === "FRAME" && n.layoutMode !== "NONE") {
        if (n.layoutSizingHorizontal === "HUG") n.layoutSizingHorizontal = "FIXED";
        if (n.layoutSizingVertical === "HUG") n.layoutSizingVertical = "FIXED";
      }
      if (n.type === "FRAME") {
        for (const c of [...n.children]) {
          if (c.type === "TEXT" && (c.getPluginData("role") === CAPTION_ROLE || box && n.children.length === 1)) c.remove();
        }
      }
      const prompt = n.getPluginData("prompt") || n.getPluginData("placeholder");
      n.setPluginData("imagePrompt", prompt);
      n.setPluginData("prompt", "");
      n.setPluginData("supply", "");
      n.setPluginData("placeholder", "");
      if (n.getPluginData("role") === PLACEHOLDER_ROLE) n.setPluginData("role", "");
      if (/^image placeholder$/i.test(n.name)) n.name = "Image";
      placed.push({ id: n.id, name: n.name });
    }
    return { placed };
  }
  var BOARD_ROLE = "component-board";
  var ICONS_ROLE = "icons";
  var isAuto = (n) => n.type === "FRAME" && n.layoutMode !== "NONE";
  var holdsComponents = (f) => f.children.some((c) => c.type === "COMPONENT" || c.type === "COMPONENT_SET" || c.type === "FRAME" && c.children.some((g2) => g2.type === "COMPONENT" || g2.type === "COMPONENT_SET"));
  async function componentBoard() {
    const { page } = await rolePage("components");
    const marked = page.children.find((c) => c.getPluginData("role") === BOARD_ROLE);
    if (marked && isAuto(marked)) return marked;
    const adopt = page.children.find((c) => isAuto(c) && c.getPluginData("role") !== ICONS_ROLE && holdsComponents(c));
    if (adopt) {
      adopt.setPluginData("role", BOARD_ROLE);
      return adopt;
    }
    const spot = freeSpot(page);
    const f = figma.createFrame();
    f.name = "Components";
    f.setPluginData("role", BOARD_ROLE);
    f.layoutMode = "VERTICAL";
    f.itemSpacing = 64;
    f.paddingTop = f.paddingBottom = f.paddingLeft = f.paddingRight = 64;
    f.fills = [];
    page.appendChild(f);
    f.layoutSizingHorizontal = "HUG";
    f.layoutSizingVertical = "HUG";
    f.x = spot.x;
    f.y = spot.y;
    return f;
  }
  async function componentCategory(name) {
    const board = await componentBoard();
    const want = normName(name);
    const found = board.children.find((c) => isAuto(c) && normName(c.name) === want);
    if (found) return found;
    const f = figma.createFrame();
    f.name = name.trim();
    f.layoutMode = "HORIZONTAL";
    f.itemSpacing = 32;
    f.counterAxisAlignItems = "MIN";
    f.fills = [];
    board.appendChild(f);
    f.layoutSizingHorizontal = "HUG";
    f.layoutSizingVertical = "HUG";
    return f;
  }
  async function componentHome(name) {
    const group = name.includes("/") ? name.split("/")[0].trim() : "";
    if (group && !/^icon$/i.test(group)) return componentCategory(group);
    if (/^icon\//i.test(name)) return iconBoard();
    return componentBoard();
  }
  async function iconBoard() {
    var _a;
    const board = await componentBoard();
    const isIcons = (c) => c.type === "FRAME" && c.getPluginData("role") === ICONS_ROLE;
    let icons = (_a = board.children.find(isIcons)) != null ? _a : board.children.find((c) => isAuto(c) && normName(c.name) === "icon");
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
      icons.name = "Icons";
      icons.layoutMode = "HORIZONTAL";
      icons.layoutWrap = "WRAP";
      icons.itemSpacing = 16;
      icons.counterAxisSpacing = 16;
      icons.fills = [];
      icons.resize(360, 100);
    }
    icons.setPluginData("role", ICONS_ROLE);
    if (icons.parent !== board) {
      board.appendChild(icons);
      icons.layoutPositioning = "AUTO";
    }
    if (icons.layoutMode === "NONE") icons.layoutMode = "HORIZONTAL";
    if (icons.layoutWrap === "WRAP") icons.layoutSizingHorizontal = "FIXED";
    else icons.layoutSizingHorizontal = "HUG";
    icons.layoutSizingVertical = "HUG";
    return icons;
  }

  // src/plugin/device.ts
  var CHROME_ROLE = "device-chrome";
  var MOCKUP_KEY = "mockup";
  var BEZEL = { r: 0.043, g: 0.043, b: 0.047 };
  var BEZEL_ON_DARK = { r: 0.2, g: 0.2, b: 0.216 };
  var BEZEL_WIDTH = 12;
  var STATUS_H = 54;
  var HOME = { w: 139, h: 5, bottom: 8 };
  var RADIUS = {
    mobile: 55,
    "iphone-16": 55,
    "iphone-15": 55,
    "iphone-14": 47,
    "iphone-13": 47,
    "iphone-16-plus": 55,
    "iphone-16-pro": 62,
    "iphone-16-pro-max": 62,
    "iphone-17": 62,
    "iphone-17-pro": 62,
    "iphone-17-pro-max": 62
  };
  var NOTCH = /* @__PURE__ */ new Set(["iphone-14", "iphone-13"]);
  var isMockupDevice = (device) => !!device && device in RADIUS;
  var isChrome = (n) => "getPluginData" in n && n.getPluginData("role") === CHROME_ROLE;
  var hasMockup = (n) => "getPluginData" in n && !!n.getPluginData(MOCKUP_KEY);
  var SIGNAL = '<svg width="18" height="12" viewBox="0 0 18 12" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>';
  var WIFI = '<svg width="16" height="12" viewBox="0 0 16 12" xmlns="http://www.w3.org/2000/svg"><path d="M8 2.3c2.3 0 4.3.9 5.8 2.3l1.1-1.1A9.6 9.6 0 0 0 8 .7 9.6 9.6 0 0 0 1.1 3.5l1.1 1.1A8 8 0 0 1 8 2.3Zm0 3.3c1.4 0 2.6.5 3.5 1.4l1.1-1.2A6.5 6.5 0 0 0 8 4a6.5 6.5 0 0 0-4.6 1.8l1.1 1.2c.9-.9 2.1-1.4 3.5-1.4Zm0 3.2c-.5 0-1 .2-1.3.5L8 10.6l1.3-1.3c-.3-.3-.8-.5-1.3-.5Z"/></svg>';
  var BATTERY = '<svg width="27" height="13" viewBox="0 0 27 13" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="23" height="12" rx="3.8" fill="none" stroke="#000" stroke-opacity="0.35"/><rect x="2" y="2" width="20" height="9" rx="2.5"/><path d="M25 4.4v4.2c.8-.3 1.4-1.2 1.4-2.1S25.8 4.7 25 4.4Z" fill-opacity="0.4"/></svg>';
  function tint(node, color) {
    const recolor = (paints2) => paints2.map((p) => p.type === "SOLID" ? __spreadProps(__spreadValues({}, p), { color }) : p);
    if ("fills" in node && Array.isArray(node.fills)) node.fills = recolor(node.fills);
    if ("strokes" in node && node.strokes.length) node.strokes = recolor(node.strokes);
    if ("children" in node) for (const c of node.children) tint(c, color);
  }
  async function timeFont() {
    try {
      await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
      return { family: "Inter", style: "Semi Bold" };
    } catch (e) {
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      return { family: "Inter", style: "Regular" };
    }
  }
  async function statusBarVariant(style, island) {
    const color = style === "Dark" ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 };
    const c = figma.createComponent();
    c.name = `Style=${style}`;
    c.layoutMode = "HORIZONTAL";
    c.primaryAxisAlignItems = "SPACE_BETWEEN";
    c.counterAxisAlignItems = "CENTER";
    c.paddingLeft = 40;
    c.paddingRight = 30;
    c.paddingTop = 6;
    c.fills = [];
    c.resize(393, STATUS_H);
    c.layoutSizingVertical = "FIXED";
    const time = figma.createText();
    time.fontName = await timeFont();
    time.characters = "9:41";
    time.fontSize = 17;
    time.fills = [{ type: "SOLID", color }];
    time.name = "Time";
    c.appendChild(time);
    time.textAutoResize = "WIDTH_AND_HEIGHT";
    const right = figma.createFrame();
    right.name = "Levels";
    right.layoutMode = "HORIZONTAL";
    right.itemSpacing = 6;
    right.counterAxisAlignItems = "CENTER";
    right.fills = [];
    right.layoutSizingHorizontal = "HUG";
    right.layoutSizingVertical = "HUG";
    for (const [name, svg] of [["Signal", SIGNAL], ["Wi-Fi", WIFI], ["Battery", BATTERY]]) {
      const v = figma.createNodeFromSvg(svg);
      v.name = name;
      v.fills = [];
      tint(v, color);
      right.appendChild(v);
    }
    c.appendChild(right);
    if (island) {
      const pill = figma.createRectangle();
      pill.name = "Dynamic Island";
      pill.resize(125, 37);
      pill.cornerRadius = 18.5;
      pill.fills = [{ type: "SOLID", color: BEZEL }];
      c.appendChild(pill);
      pill.layoutPositioning = "ABSOLUTE";
      pill.x = (393 - 125) / 2;
      pill.y = 11;
      pill.constraints = { horizontal: "CENTER", vertical: "MIN" };
    }
    return c;
  }
  async function homeVariant(style) {
    const c = figma.createComponent();
    c.name = `Style=${style}`;
    c.resize(HOME.w, HOME.h);
    c.cornerRadius = 100;
    c.fills = [{ type: "SOLID", color: style === "Dark" ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 } }];
    return c;
  }
  async function chromeSet(kind) {
    let reg = {};
    try {
      reg = JSON.parse(figma.root.getPluginData("deviceChrome") || "{}");
    } catch (e) {
    }
    const known = reg[kind] ? await getNodeSafe(reg[kind]) : null;
    if (known && known.type === "COMPONENT_SET" && !known.removed) return known;
    const { page } = await rolePage("components");
    const variants = kind === "home" ? [await homeVariant("Dark"), await homeVariant("Light")] : [await statusBarVariant("Dark", kind === "status"), await statusBarVariant("Light", kind === "status")];
    for (const v of variants) page.appendChild(v);
    const set = figma.combineAsVariants(variants, page);
    set.name = kind === "home" ? "Device/iPhone/Home indicator" : kind === "status" ? "Device/iPhone/Status bar" : "Device/iPhone/Status bar (notch)";
    set.description = "Device chrome added by figma-mcp to iPhone screens (mockup). Not part of the product UI: code ignores it.";
    set.layoutMode = "HORIZONTAL";
    set.itemSpacing = 24;
    set.paddingTop = set.paddingBottom = set.paddingLeft = set.paddingRight = 24;
    set.fills = [{ type: "SOLID", color: { r: 0.6, g: 0.6, b: 0.62 } }];
    set.layoutSizingHorizontal = "HUG";
    set.layoutSizingVertical = "HUG";
    const spot = freeSpot(page, set);
    set.x = spot.x;
    set.y = spot.y;
    reg[kind] = set.id;
    figma.root.setPluginData("deviceChrome", JSON.stringify(reg));
    return set;
  }
  function luminance2(n) {
    const fill = "fills" in n && Array.isArray(n.fills) ? n.fills.find((p) => p.visible !== false && p.type === "SOLID") : void 0;
    if (!fill) return 1;
    const { r, g: g2, b } = fill.color;
    return 0.2126 * r + 0.7152 * g2 + 0.0722 * b;
  }
  function addAbsolute(screen, inst) {
    screen.appendChild(inst);
    if (screen.layoutMode !== "NONE") inst.layoutPositioning = "ABSOLUTE";
  }
  async function applyMockup(screen, device, on = true) {
    const warnings = [];
    for (const c of [...screen.children]) if (isChrome(c)) c.remove();
    if (!on || !isMockupDevice(device)) {
      if (hasMockup(screen)) {
        screen.strokes = [];
        screen.cornerRadius = 0;
        screen.setPluginData(MOCKUP_KEY, "");
      }
      return warnings;
    }
    screen.cornerRadius = RADIUS[device];
    screen.clipsContent = true;
    const style = luminance2(screen) < 0.5 ? "Light" : "Dark";
    screen.strokes = [{ type: "SOLID", color: style === "Light" ? BEZEL_ON_DARK : BEZEL }];
    screen.strokeWeight = BEZEL_WIDTH;
    screen.strokeAlign = "OUTSIDE";
    screen.setPluginData(MOCKUP_KEY, device);
    const status2 = await chromeSet(NOTCH.has(device) ? "status-notch" : "status");
    const bar = status2.children.find((v) => v.name === `Style=${style}`).createInstance();
    bar.name = "Status bar";
    bar.setPluginData("role", CHROME_ROLE);
    addAbsolute(screen, bar);
    bar.resize(screen.width, STATUS_H);
    bar.x = 0;
    bar.y = 0;
    bar.constraints = { horizontal: "STRETCH", vertical: "MIN" };
    const home = await chromeSet("home");
    const ind = home.children.find((v) => v.name === `Style=${style}`).createInstance();
    ind.name = "Home indicator";
    ind.setPluginData("role", CHROME_ROLE);
    addAbsolute(screen, ind);
    ind.x = Math.round((screen.width - HOME.w) / 2);
    ind.y = screen.height - HOME.bottom - HOME.h;
    ind.constraints = { horizontal: "CENTER", vertical: "MAX" };
    if (screen.layoutMode !== "NONE" && screen.paddingTop < STATUS_H) warnings.push(`"${screen.name}": content starts under the status bar (top padding ${screen.paddingTop} < ${STATUS_H}) \u2014 pad the top or start with a header that leaves room for it.`);
    return warnings;
  }
  function mockupScreenOf(n) {
    for (let p = n; p && p.type !== "PAGE"; p = p.parent) if (p.type === "FRAME" && hasMockup(p)) return p;
    return null;
  }
  function keepChromeOnTop(screen) {
    if (!screen) return;
    for (const c of screen.children.filter(isChrome)) screen.appendChild(c);
    const ind = screen.children.find((c) => isChrome(c) && c.name === "Home indicator");
    if (ind) ind.y = screen.height - HOME.bottom - HOME.h;
  }
  var FIGMA_DEFAULT_CANVAS = [{ r: 0.96, g: 0.96, b: 0.96 }, { r: 0.898, g: 0.898, b: 0.898 }, { r: 0.118, g: 0.118, b: 0.118 }];
  function ensureCanvas(page, sample) {
    if (!page || page.getPluginData("canvas")) return;
    const bg = page.backgrounds.find((p) => p.type === "SOLID");
    const isDefault = !bg || FIGMA_DEFAULT_CANVAS.some((d) => Math.abs(d.r - bg.color.r) < 0.02 && Math.abs(d.g - bg.color.g) < 0.02 && Math.abs(d.b - bg.color.b) < 0.02);
    if (!isDefault) {
      page.setPluginData("canvas", "user");
      return;
    }
    const light = sample ? luminance2(sample) >= 0.5 : true;
    const color = light ? { r: 0.8, g: 0.8, b: 0.827 } : { r: 0.91, g: 0.91, b: 0.925 };
    page.backgrounds = [{ type: "SOLID", color }];
    page.setPluginData("canvas", "auto");
  }
  function setCanvas(page, color) {
    page.backgrounds = [{ type: "SOLID", color }];
    page.setPluginData("canvas", "user");
  }

  // src/plugin/props.ts
  var isVar3 = (v) => typeof v === "string" && v.startsWith("$");
  function isAutoLayout(n) {
    return !!n && "layoutMode" in n && n.layoutMode !== "NONE";
  }
  function parentLayoutDir(node) {
    const p = node.parent;
    if (!p || !("layoutMode" in p)) return "none";
    const m = p.layoutMode;
    return m === "HORIZONTAL" ? "row" : m === "VERTICAL" ? "column" : m === "GRID" ? "grid" : "none";
  }
  var ALIGN2 = { start: "MIN", center: "CENTER", end: "MAX", baseline: "BASELINE", stretch: "MIN" };
  var JUSTIFY2 = { start: "MIN", center: "CENTER", end: "MAX", between: "SPACE_BETWEEN", around: "SPACE_AROUND", evenly: "SPACE_EVENLY" };
  var flip = { MIN: "MAX", MAX: "MIN", CENTER: "CENTER", BASELINE: "BASELINE", SPACE_BETWEEN: "SPACE_BETWEEN", SPACE_AROUND: "SPACE_AROUND", SPACE_EVENLY: "SPACE_EVENLY" };
  async function setNum(node, field, v, ctx, path) {
    const n = await bindNumber(node, field, v, ctx, path);
    if (!isVar3(v) && n !== void 0) node[field] = n;
  }
  async function applyLayout(node, s, ctx, path, rtl) {
    var _a, _b;
    const hasLayoutProps = s.dir !== void 0 || s.gap !== void 0 || s.pad !== void 0 || s.align !== void 0 || s.justify !== void 0 || s.wrap !== void 0 || s.rowGap !== void 0 || s.colGap !== void 0 || s.cols !== void 0 || s.rows !== void 0 || s.alignContent !== void 0;
    if (!hasLayoutProps) return;
    if (!("layoutMode" in node)) {
      ctx.warn(`${path}: ${node.type.toLowerCase()} cannot have auto layout (only frames/components); layout props ignored.`);
      return;
    }
    const f = node;
    if (s.dir !== void 0) {
      if (s.dir === "grid") {
        try {
          f.layoutMode = "GRID";
        } catch (e) {
          ctx.warn(`${path}: grid auto layout is not available in this Figma version; using a wrapping row instead.`);
          f.layoutMode = "HORIZONTAL";
          f.layoutWrap = "WRAP";
        }
      } else f.layoutMode = s.dir === "row" ? "HORIZONTAL" : s.dir === "column" ? "VERTICAL" : "NONE";
    }
    const mode = f.layoutMode;
    if (mode === "NONE") {
      if (s.gap !== void 0 || s.align !== void 0 || s.justify !== void 0) ctx.warn(`${path}: gap/align/justify need dir row|column|grid.`);
    }
    if (mode === "GRID") {
      if (s.cols !== void 0) f.gridColumnCount = Math.max(1, Math.round(s.cols));
      try {
        if (s.rows === void 0) {
          f.gridAutoTracks = "ROWS";
          f.gridItemsPositioning = "ROW_AUTO_FLOW";
        } else {
          f.gridAutoTracks = "NONE";
          f.gridRowCount = Math.max(1, Math.round(s.rows));
        }
      } catch (e) {
        if (s.rows !== void 0) f.gridRowCount = Math.max(1, Math.round(s.rows));
      }
      const colGap = (_a = s.colGap) != null ? _a : s.gap !== void 0 && s.gap !== "auto" ? s.gap : void 0;
      const rowGap = (_b = s.rowGap) != null ? _b : s.gap !== void 0 && s.gap !== "auto" ? s.gap : void 0;
      if (colGap !== void 0) await setNum(f, "gridColumnGap", colGap, ctx, `${path}.gap`);
      if (rowGap !== void 0) await setNum(f, "gridRowGap", rowGap, ctx, `${path}.rowGap`);
    } else {
      if (s.wrap !== void 0) {
        if (s.wrap && mode !== "HORIZONTAL") ctx.warn(`${path}: wrap only works with dir "row".`);
        else f.layoutWrap = s.wrap ? "WRAP" : "NO_WRAP";
      }
      if (s.gap !== void 0) await setNum(f, "itemSpacing", s.gap, ctx, `${path}.gap`);
      if (s.rowGap !== void 0) await setNum(f, "counterAxisSpacing", s.rowGap, ctx, `${path}.rowGap`);
      if (s.alignContent !== void 0) f.counterAxisAlignContent = s.alignContent === "between" ? "SPACE_BETWEEN" : "AUTO";
    }
    if (s.pad) {
      const fields = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"];
      for (let i = 0; i < 4; i++) await setNum(f, fields[i], s.pad[i], ctx, `${path}.pad[${i}]`);
    }
    if (mode === "HORIZONTAL" || mode === "VERTICAL") {
      if (s.justify !== void 0) {
        let v = JUSTIFY2[s.justify];
        if (rtl && mode === "HORIZONTAL") v = flip[v];
        try {
          f.primaryAxisAlignItems = v;
        } catch (e) {
          ctx.warn(`${path}.justify: "${s.justify}" is not supported by this Figma version; using "between".`);
          f.primaryAxisAlignItems = "SPACE_BETWEEN";
        }
      }
      if (s.align !== void 0) {
        let v = ALIGN2[s.align];
        if (v === "BASELINE" && mode !== "HORIZONTAL") {
          ctx.warn(`${path}: baseline alignment needs dir "row"; using start.`);
          v = "MIN";
        }
        if (rtl && mode === "VERTICAL") v = flip[v];
        f.counterAxisAlignItems = v;
      } else if (rtl && mode === "VERTICAL" && s.dir !== void 0) {
        f.counterAxisAlignItems = "MAX";
      }
      if (rtl && mode === "HORIZONTAL" && s.justify === void 0 && s.dir !== void 0) f.primaryAxisAlignItems = "MAX";
    }
  }
  function canHug(node) {
    return isAutoLayout(node) || node.type === "TEXT" && isAutoLayout(node.parent);
  }
  async function applySizing(node, s, ctx, path, o) {
    const inAL = isAutoLayout(node.parent) && node.layoutPositioning !== "ABSOLUTE";
    const parentDir = parentLayoutDir(node);
    let w = s.w;
    let h = s.h;
    if (o.isNew && o.crossFill && inAL) {
      if (parentDir === "column" && w === void 0) w = "fill";
      if (parentDir === "row" && h === void 0) h = "fill";
    }
    if (o.isNew && isAutoLayout(node) && node.getPluginData("role") !== "image-placeholder") {
      if (w === void 0) w = "hug";
      if (h === void 0) h = "hug";
    }
    const fixedW = w !== void 0 && w !== "fill" && w !== "hug" ? await numberOf(w, ctx) : void 0;
    const fixedH = h !== void 0 && h !== "fill" && h !== "hug" ? await numberOf(h, ctx) : void 0;
    if (fixedW || fixedH) {
      const nw = fixedW ? fixedW.n : node.width;
      let nh = fixedH ? fixedH.n : node.height;
      if (node.type === "LINE") nh = 0;
      if (node.type === "SECTION" || node.type === "COMPONENT_SET") node.resizeWithoutConstraints(Math.max(nw, 0.01), Math.max(nh, 0.01));
      else if ("resize" in node) node.resize(Math.max(nw, 0.01), node.type === "LINE" ? 0 : Math.max(nh, 0.01));
      if (fixedW == null ? void 0 : fixedW.variable) node.setBoundVariable("width", fixedW.variable);
      if (fixedH == null ? void 0 : fixedH.variable) node.setBoundVariable("height", fixedH.variable);
    }
    const setAxis = (axis, value) => {
      if (value === void 0) return;
      const prop = axis === "h" ? "layoutSizingHorizontal" : "layoutSizingVertical";
      const label = axis === "h" ? "w" : "h";
      if (value === "fill") {
        if (!inAL) {
          ctx.warn(`${path}.${label}: "fill" needs an auto-layout parent (dir row/column/grid); kept current size.`);
          return;
        }
        node[prop] = "FILL";
      } else if (value === "hug") {
        if (!canHug(node)) {
          if (node.type !== "TEXT") ctx.warn(`${path}.${label}: "hug" works on auto-layout frames and text; give a number instead.`);
          return;
        }
        node[prop] = "HUG";
      } else if (inAL || isAutoLayout(node)) {
        node[prop] = "FIXED";
      }
    };
    if (node.type !== "TEXT") {
      setAxis("h", w);
      setAxis("v", h);
    } else {
      const t = node;
      if ((w === "fill" || fixedW) && t.width < 1) t.resize(100, Math.max(1, t.height));
      if (w === "fill") {
        t.textAutoResize = fixedH ? "NONE" : "HEIGHT";
        if (inAL) t.layoutSizingHorizontal = "FILL";
        else if (node.parent && "width" in node.parent) {
          const pw = node.parent.width;
          t.resize(Math.max(1, pw - t.x), t.height);
          ctx.warn(`${path}.w: "fill" needs an auto-layout parent; sized to the parent width instead.`);
        }
      } else if (fixedW) {
        if (!fixedH) t.textAutoResize = "HEIGHT";
        if (inAL) t.layoutSizingHorizontal = "FIXED";
      } else if (w === "hug") {
        if (!fixedH && h !== "fill") t.textAutoResize = "WIDTH_AND_HEIGHT";
        if (inAL) t.layoutSizingHorizontal = "HUG";
      }
      if (h === "fill") {
        if (inAL) {
          t.textAutoResize = "NONE";
          t.layoutSizingVertical = "FILL";
        } else ctx.warn(`${path}.h: "fill" needs an auto-layout parent.`);
      } else if (fixedH) {
        t.textAutoResize = "NONE";
        if (inAL) t.layoutSizingVertical = "FIXED";
      }
      if (t.width < 1 && t.characters.length > 0) ctx.warn(`${path}: text collapsed to ~0 width \u2014 its parent probably hugs; give the parent a width.`);
    }
    const mm = [
      ["minW", "minWidth"],
      ["maxW", "maxWidth"],
      ["minH", "minHeight"],
      ["maxH", "maxHeight"]
    ];
    for (const [k, field] of mm) {
      const v = s[k];
      if (v === void 0) continue;
      if (!(inAL || isAutoLayout(node))) {
        ctx.warn(`${path}.${k}: min/max size only works on auto-layout frames or their children.`);
        continue;
      }
      await setNum(node, field, v, ctx, `${path}.${k}`);
    }
  }
  var CH = { left: "MIN", right: "MAX", center: "CENTER", stretch: "STRETCH", scale: "SCALE" };
  var CV = { top: "MIN", bottom: "MAX", center: "CENTER", stretch: "STRETCH", scale: "SCALE" };
  function applyPosition(node, s, ctx, path) {
    const parentAL = isAutoLayout(node.parent);
    if (s.absolute !== void 0) {
      if (parentAL) node.layoutPositioning = s.absolute ? "ABSOLUTE" : "AUTO";
      else if (s.absolute) {
      }
    }
    const free = !parentAL || node.layoutPositioning === "ABSOLUTE";
    if (s.x !== void 0 || s.y !== void 0) {
      if (!free) ctx.warn(`${path}: x/y are ignored inside auto layout unless "absolute": true.`);
      else {
        if (s.x !== void 0) node.x = s.x;
        if (s.y !== void 0) node.y = s.y;
      }
    }
    if (s.constraints && "constraints" in node) {
      const cur = node.constraints;
      node.constraints = {
        horizontal: s.constraints.h ? CH[s.constraints.h] : cur.horizontal,
        vertical: s.constraints.v ? CV[s.constraints.v] : cur.vertical
      };
    }
    if ((s.cell || s.span) && node.parent && node.parent.layoutMode === "GRID") {
      const g2 = node;
      try {
        if (s.span) {
          g2.gridRowSpan = s.span[0];
          g2.gridColumnSpan = s.span[1];
        }
        if (s.cell) g2.setGridChildPosition(s.cell[0], s.cell[1]);
      } catch (e) {
        ctx.warn(`${path}: grid cell/span not applied (${e instanceof Error ? e.message : e}). With automatic flow, order children instead.`);
      }
    }
  }
  function findByPath(root, path) {
    var _a;
    const parts = path.split("/").map((p) => p.trim()).filter(Boolean);
    let current = [root];
    for (const part of parts) {
      let found = null;
      const queue = [];
      for (const c of current) if ("children" in c) queue.push(...c.children);
      while (queue.length && !found) {
        const n = queue.shift();
        if (n.name === part || n.name.toLowerCase() === part.toLowerCase()) found = n;
        else if ("children" in n) queue.push(...n.children);
      }
      if (!found) return null;
      current = [found];
    }
    return (_a = current[0]) != null ? _a : null;
  }
  function propKey(defs, name) {
    if (name in defs) return name;
    const lower = name.toLowerCase();
    return Object.keys(defs).find((k) => k.split("#")[0].toLowerCase() === lower);
  }
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function instanceProps(inst, wanted) {
    var _a;
    let defs = inst.componentProperties;
    const missing = () => wanted.filter((w) => !propKey(defs, w));
    if (!missing().length) return defs;
    const main = await inst.getMainComponentAsync();
    const owner = ((_a = main == null ? void 0 : main.parent) == null ? void 0 : _a.type) === "COMPONENT_SET" ? main.parent : main;
    let ownerNames = [];
    try {
      ownerNames = owner ? Object.keys(owner.componentPropertyDefinitions).map((k) => k.split("#")[0].toLowerCase()) : [];
    } catch (e) {
      ownerNames = [];
    }
    if (!missing().some((m) => ownerNames.includes(m.toLowerCase()))) return defs;
    for (let i = 0; i < 8 && missing().length; i++) {
      await sleep(80);
      if (i === 3 && main) inst.swapComponent(main);
      defs = inst.componentProperties;
    }
    return defs;
  }
  async function applyInstanceProps(inst, s, ctx, path) {
    var _a, _b, _c;
    const defs = await instanceProps(inst, [...Object.keys((_a = s.variant) != null ? _a : {}), ...Object.keys((_b = s.props) != null ? _b : {})]);
    const updates = {};
    if (s.variant) {
      for (const [k, v] of Object.entries(s.variant)) {
        const key = propKey(defs, k);
        if (!key || defs[key].type !== "VARIANT") {
          const names = Object.entries(defs).filter(([, d]) => d.type === "VARIANT").map(([n]) => n);
          throw badRequest(`${path}.variant: "${k}" is not a variant property of this component.${didYouMean(k, names)} Variant properties: ${names.join(", ") || "none"}.`);
        }
        updates[key] = v;
      }
    }
    if (s.props) {
      for (const [k, v] of Object.entries(s.props)) {
        const key = propKey(defs, k);
        if (!key) {
          const names = Object.keys(defs).map((n) => n.split("#")[0]);
          throw badRequest(`${path}.props: no property "${k}" on this instance.${didYouMean(k, names)} Properties: ${names.join(", ") || "none"}.`);
        }
        const type = defs[key].type;
        if (type === "BOOLEAN") updates[key] = v === true || v === "true";
        else if (type === "INSTANCE_SWAP") {
          const c = await ctx.component(String(v));
          updates[key] = c.type === "COMPONENT_SET" ? ((_c = c.defaultVariant) != null ? _c : c.children[0]).id : c.id;
        } else updates[key] = String(v);
      }
    }
    if (Object.keys(updates).length) {
      await ctx.loadFontsIn(inst);
      try {
        inst.setProperties(updates);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw badRequest(`${path}: could not set instance properties ${JSON.stringify(updates)}: ${msg}`);
      }
    }
  }
  function isVectorOnly(node) {
    if (node.type === "TEXT") return false;
    if (!("children" in node)) return ["VECTOR", "BOOLEAN_OPERATION", "STAR", "POLYGON", "ELLIPSE", "RECTANGLE", "LINE"].includes(node.type);
    if (!node.children.length) return false;
    return node.children.every((c) => isVectorOnly(c));
  }
  var BLEND = {
    normal: "NORMAL",
    multiply: "MULTIPLY",
    screen: "SCREEN",
    overlay: "OVERLAY",
    darken: "DARKEN",
    lighten: "LIGHTEN",
    "color-dodge": "COLOR_DODGE",
    "color-burn": "COLOR_BURN",
    "hard-light": "HARD_LIGHT",
    "soft-light": "SOFT_LIGHT",
    difference: "DIFFERENCE",
    exclusion: "EXCLUSION",
    hue: "HUE",
    saturation: "SATURATION",
    color: "COLOR",
    luminosity: "LUMINOSITY",
    "pass-through": "PASS_THROUGH"
  };
  async function applyProps(node, s, inh, ctx, path, o) {
    var _a, _b, _c, _d, _e, _f;
    const rtl = !!((_a = s.rtl) != null ? _a : inh.rtl);
    if (s.name !== void 0) node.name = s.name;
    if (s.visible !== void 0) node.visible = s.visible;
    if (s.locked !== void 0) node.locked = s.locked;
    if (s.description !== void 0) {
      if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") node.description = s.description;
      else ctx.warn(`${path}.description: only components and component sets have descriptions.`);
    }
    if (s.opacity !== void 0 && "opacity" in node) await setNum(node, "opacity", s.opacity, ctx, `${path}.opacity`);
    if (s.blend !== void 0 && "blendMode" in node) {
      const b = BLEND[s.blend.toLowerCase()];
      if (!b) throw badRequest(`${path}.blend: unknown blend mode "${s.blend}".${didYouMean(s.blend, Object.keys(BLEND))}`);
      node.blendMode = b;
    }
    await applyLayout(node, s, ctx, path, rtl);
    if (s.clip !== void 0) {
      if ("clipsContent" in node) node.clipsContent = s.clip;
      else ctx.warn(`${path}.clip: only frames can clip content.`);
    }
    if (node.type === "TEXT") {
      await ctx.loadFontsIn(node);
      const textSpec = __spreadValues({}, s);
      if (s.align !== void 0 && s.textAlign === void 0)
        textSpec.textAlign = { start: "left", center: "center", end: "right", baseline: "left", stretch: "justify" }[s.align];
      if (s.fill !== void 0 && s.color === void 0) textSpec.color = (_b = s.fill) != null ? _b : [];
      await applyText(node, textSpec, inh, ctx, path, o.isNew);
    }
    applyPosition(node, s, ctx, path);
    await applySizing(node, s, ctx, path, o);
    if (node.type === "TEXT") applyTruncation(node, s);
    if (s.device !== void 0) node.setPluginData("device", s.device);
    if (s.mockup !== void 0 && !o.isNew && node.type === "FRAME") {
      const device = (_c = s.device) != null ? _c : node.getPluginData("device");
      if (s.mockup && !isMockupDevice(device)) ctx.warn(`${path}.mockup: only iPhone screens get a mockup (set device: "iphone-16" \u2026); "${node.name}" has ${device ? `device "${device}"` : "no device"}.`);
      else for (const w of await applyMockup(node, device, s.mockup)) ctx.warn(w);
    }
    const need = (_d = s.prompt) != null ? _d : s.supply;
    if (need !== void 0 && !(o.isNew && node.getPluginData("role") === "image-placeholder")) await setImagePrompt(node, need, (f) => ctx.loadFont(f), s.prompt === void 0);
    if (s.fill !== void 0 && node.type !== "TEXT") await applyFills(node, s.fill, ctx, `${path}.fill`);
    if (s.stroke !== void 0) await applyStroke(node, s.stroke, ctx, `${path}.stroke`);
    if (s.radius !== void 0) {
      if (!("cornerRadius" in node)) ctx.warn(`${path}.radius: ${node.type.toLowerCase()} has no corner radius.`);
      else if (Array.isArray(s.radius)) {
        if (!("topLeftRadius" in node)) throw badRequest(`${path}.radius: per-corner radius needs a frame or rectangle.`);
        const fields = ["topLeftRadius", "topRightRadius", "bottomRightRadius", "bottomLeftRadius"];
        for (let i = 0; i < 4; i++) await setNum(node, fields[i], s.radius[i], ctx, `${path}.radius[${i}]`);
      } else if (isVar3(s.radius)) {
        const v = await ctx.variable(s.radius, "FLOAT");
        if ("topLeftRadius" in node) for (const f of ["topLeftRadius", "topRightRadius", "bottomRightRadius", "bottomLeftRadius"]) node.setBoundVariable(f, v);
        else node.setBoundVariable("cornerRadius", v);
      } else node.cornerRadius = Number(s.radius);
    }
    if (s.effects !== void 0) await applyEffects(node, s.effects, ctx, `${path}.effects`);
    if (s.color !== void 0 && node.type !== "TEXT") {
      if (node.type === "LINE") {
        const r = await toPaints(s.color, ctx, `${path}.color`);
        if (r.styleId) await node.setStrokeStyleIdAsync(r.styleId);
        else node.strokes = r.paints;
      } else if (["RECTANGLE", "ELLIPSE", "POLYGON", "STAR"].includes(node.type)) {
        await applyFills(node, s.color, ctx, `${path}.color`);
      } else if (node.type === "INSTANCE" || node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION" || (node.type === "FRAME" || node.type === "GROUP") && (s.type === "svg" || s.type === "icon" || isVectorOnly(node))) {
        const n = await recolorVectors(node, s.color, ctx, `${path}.color`);
        if (!n) ctx.warn(`${path}.color: no vector layers to recolor.`);
      } else if (!o.isNew) {
        ctx.warn(`${path}.color: on a ${node.type.toLowerCase()} "color" only sets the default text color for text created inside it; use "fill" for its background.`);
      }
    }
    if (s.strokeWidth !== void 0 && node.type !== "TEXT") {
      let n = 0;
      const visit = (x) => {
        if ("strokes" in x && Array.isArray(x.strokes) && x.strokes.length && x.type !== "FRAME" && x.type !== "INSTANCE" && x.type !== "COMPONENT") {
          x.strokeWeight = s.strokeWidth;
          n++;
        }
        if ("children" in x) for (const c of x.children) visit(c);
      };
      visit(node);
      if (!n) ctx.warn(`${path}.strokeWidth: no stroked vectors inside.`);
    }
    if (s.modes) {
      for (const [collName, modeName] of Object.entries(s.modes)) {
        const coll = await ctx.collectionByName(collName);
        const mode = coll.modes.find((m) => m.name.toLowerCase() === modeName.toLowerCase());
        if (!mode) throw notFound(`${path}.modes: collection "${coll.name}" has no mode "${modeName}". Modes: ${coll.modes.map((m) => m.name).join(", ")}.`);
        await ctx.loadFontsIn(node);
        node.setExplicitVariableModeForCollection(coll, mode.modeId);
      }
    }
    if (node.type === "INSTANCE" && (s.variant || s.props)) await applyInstanceProps(node, s, ctx, path);
    if (node.type === "INSTANCE" && s.overrides) {
      for (const [p, sub] of Object.entries(s.overrides)) {
        const target = findByPath(node, p);
        if (!target) {
          const names = [];
          node.findAll((n) => {
            names.push(n.name);
            return false;
          });
          throw notFound(`${path}.overrides: no layer "${p}" inside this instance.${didYouMean(p, names)}`);
        }
        await applyProps(target, sub, inh, ctx, `${path}.overrides.${p}`, { isNew: false });
      }
    }
    if (s.bind) ctx.binds.push({ node, bind: s.bind, path });
    if (s.scroll !== void 0) {
      if ("overflowDirection" in node) node.overflowDirection = { none: "NONE", vertical: "VERTICAL", horizontal: "HORIZONTAL", both: "BOTH" }[s.scroll];
      else ctx.warn(`${path}.scroll: only frames can scroll.`);
    }
    if ((_e = s.annotations) == null ? void 0 : _e.length) {
      try {
        node.annotations = s.annotations.map((label) => ({ label }));
      } catch (e) {
        ctx.warn(`${path}.annotations: not applied (${e instanceof Error ? e.message : e}).`);
      }
    }
    if ((_f = s.interactions) == null ? void 0 : _f.length) ctx.pendingInteractions.push({ node, items: s.interactions, path });
    if (s.rotation !== void 0) {
      if ("rotation" in node) node.rotation = s.rotation;
      else ctx.warn(`${path}.rotation: ${node.type.toLowerCase()} cannot rotate.`);
    }
  }

  // src/plugin/build.ts
  async function preflight(spec, ctx, inherited) {
    const problems = [];
    const tasks = [];
    const check = (p) => tasks.push(p.catch((e) => problems.push(e instanceof Error ? e.message : String(e))));
    const fonts2 = /* @__PURE__ */ new Map();
    const visit = (s, path, inh) => {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
      const paintRefs = [...(_a = s.fill) != null ? _a : [], ...(_b = s.color) != null ? _b : [], ...(_d = (_c = s.stroke) == null ? void 0 : _c.paints) != null ? _d : []];
      for (const p of paintRefs) {
        if (p.kind === "solid" && p.color.startsWith("$")) check(ctx.variable(p.color, "COLOR").catch((e) => Promise.reject(new Error(`${path}: ${e.message}`))));
        if (p.kind === "style") check(ctx.style(p.name, "PAINT").catch((e) => Promise.reject(new Error(`${path}: ${e.message}`))));
      }
      const nums = [s.gap, s.rowGap, s.colGap, s.opacity, s.minW, s.maxW, s.minH, s.maxH, s.w, s.h, ...Array.isArray(s.radius) ? s.radius : [s.radius], ...(_e = s.pad) != null ? _e : []];
      for (const n of nums) if (typeof n === "string" && n.startsWith("$")) check(ctx.variable(n, "FLOAT").catch((e) => Promise.reject(new Error(`${path}: ${e.message}`))));
      for (const e of (_f = s.effects) != null ? _f : []) if (e.kind === "style") check(ctx.style(e.name, "EFFECT").catch((err) => Promise.reject(new Error(`${path}: ${err.message}`))));
      if (s.style && s.type === "text") check(ctx.style(s.style, "TEXT").catch((e) => Promise.reject(new Error(`${path}: ${e.message}`))));
      if (s.type === "instance" && s.component) check(ctx.component(s.component).catch((e) => Promise.reject(new Error(`${path}: ${e.message}`))));
      if (s.modes) for (const c of Object.keys(s.modes)) check(ctx.collectionByName(c).catch((e) => Promise.reject(new Error(`${path}.modes: ${e.message}`))));
      const childInh = inheritFrom(inh, s);
      if (s.type === "text") {
        const f = __spreadValues(__spreadValues({}, inh.font), (_g = s.font) != null ? _g : {});
        if (!s.style || ((_h = s.font) == null ? void 0 : _h.family) || ((_i = s.font) == null ? void 0 : _i.weight) || ((_j = s.font) == null ? void 0 : _j.style)) {
          const family = (_k = f.family) != null ? _k : DEFAULT_FAMILY;
          fonts2.set(`${family}|${f.weight}|${f.italic}|${f.style}`, { family, weight: f.weight, italic: f.italic, style: (_m = (_l = s.font) == null ? void 0 : _l.style) != null ? _m : f.style });
        }
      }
      (_n = s.children) == null ? void 0 : _n.forEach((c, i) => visit(c, `${path}.children[${i}]`, childInh));
    };
    visit(spec, "spec", inherited);
    for (const f of fonts2.values()) check(ctx.resolveFont(f.family, f.weight, f.italic, f.style).then((fn) => ctx.loadFont(fn)));
    await Promise.all(tasks);
    if (problems.length) throw badRequest(`Nothing was created \u2014 fix these first:
- ${[...new Set(problems)].join("\n- ")}`);
  }
  async function iconComponent(name, svg, ctx) {
    const compName = `icon/${name.replace(":", "/")}`;
    try {
      const c = await ctx.component(compName, { libraryScan: false });
      if (c.type === "COMPONENT") return c;
    } catch (e) {
    }
    const frame = figma.createNodeFromSvg(svg);
    const comp = figma.createComponentFromNode(frame);
    comp.name = compName;
    comp.fills = [];
    comp.description = `Icon ${name} (Iconify). Recolor through the instance's vector layers or a color variable.`;
    const holder = await iconBoard();
    holder.appendChild(comp);
    ctx.registerComponent(comp);
    return comp;
  }
  function findVariant(set, want, path) {
    var _a, _b;
    const variants = set.children.filter((c) => c.type === "COMPONENT");
    const base = (_a = set.defaultVariant) != null ? _a : variants[0];
    if (!want || !Object.keys(want).length) return base;
    const defaults = (_b = base.variantProperties) != null ? _b : {};
    const target = __spreadValues(__spreadValues({}, defaults), want);
    const norm2 = (s) => s.toLowerCase().trim();
    const axes = Object.keys(defaults);
    for (const k of Object.keys(want)) {
      if (!axes.some((a) => norm2(a) === norm2(k))) {
        throw badRequest(`${path}.variant: "${set.name}" has no variant property "${k}". Properties: ${axes.join(", ")}.`);
      }
    }
    const hit = variants.find((v) => {
      var _a2;
      const vp = (_a2 = v.variantProperties) != null ? _a2 : {};
      return Object.entries(target).every(([k, val]) => {
        const key = Object.keys(vp).find((x) => norm2(x) === norm2(k));
        return key !== void 0 && norm2(vp[key]) === norm2(val);
      });
    });
    if (hit) return hit;
    const options = axes.map((a) => `${a}: ${[...new Set(variants.map((v) => {
      var _a2;
      return (_a2 = v.variantProperties) == null ? void 0 : _a2[a];
    }))].join("|")}`).join("; ");
    throw badRequest(`${path}.variant: no variant of "${set.name}" matches ${JSON.stringify(want)}. Options \u2014 ${options}.`);
  }
  async function createNode(s, ctx, path, opts) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    switch (s.type) {
      case "frame":
        return { node: figma.createFrame() };
      case "component":
        return { node: figma.createComponent() };
      case "text":
        return { node: figma.createText() };
      case "rect":
        return { node: figma.createRectangle() };
      case "ellipse":
        return { node: figma.createEllipse() };
      case "line":
        return { node: figma.createLine() };
      case "polygon":
        return { node: figma.createPolygon() };
      case "star":
        return { node: figma.createStar() };
      case "section":
        return { node: figma.createSection() };
      case "svg": {
        try {
          const n = figma.createNodeFromSvg((_a = s.svg) != null ? _a : "");
          if (!s.name) n.name = "svg";
          return { node: n };
        } catch (e) {
          throw badRequest(`${path}.svg: Figma could not parse this SVG (${e instanceof Error ? e.message : e}). It needs a root <svg> with width, height and viewBox.`);
        }
      }
      case "icon": {
        if (!s.svg) throw badRequest(`${path}: icon "${s.icon}" has no SVG (icons are fetched by the MCP server; inside execute use type "svg").`);
        if (((_b = opts.icons) != null ? _b : "component") === "inline") {
          const n = figma.createNodeFromSvg(s.svg);
          n.name = (_c = s.icon) != null ? _c : "icon";
          return { node: n };
        }
        const comp = await iconComponent((_d = s.icon) != null ? _d : "icon", s.svg, ctx);
        return { node: comp.createInstance() };
      }
      case "image": {
        if (s.imageData) {
          const rect = figma.createRectangle();
          rect.name = "Image";
          const img = figma.createImage(figma.base64Decode(s.imageData));
          rect.fills = [{ type: "IMAGE", imageHash: img.hash, scaleMode: { fill: "FILL", fit: "FIT", crop: "CROP", tile: "TILE" }[(_e = s.fit) != null ? _e : "fill"] }];
          let natural;
          try {
            const size2 = await img.getSizeAsync();
            natural = { w: size2.width, h: size2.height };
          } catch (e) {
          }
          return { node: rect, natural };
        }
        const f = figma.createFrame();
        f.name = "Image placeholder";
        f.fills = [{ type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85 } }];
        f.layoutMode = "VERTICAL";
        f.primaryAxisAlignItems = "CENTER";
        f.counterAxisAlignItems = "CENTER";
        f.paddingTop = f.paddingBottom = f.paddingLeft = f.paddingRight = 12;
        f.resize(240, 160);
        f.setPluginData("role", "image-placeholder");
        f.setPluginData("placeholder", (_f = s.placeholder) != null ? _f : "");
        const load = (fn) => ctx.loadFont(fn);
        const need = (_g = s.prompt) != null ? _g : s.supply;
        const imageId = need ? await setImagePrompt(f, need, load, s.prompt === void 0) : "";
        const tiny = typeof s.w === "number" && s.w < 72 || typeof s.h === "number" && s.h < 48;
        if (!tiny && (s.placeholder || imageId)) await addCaption(f, captionText((_i = (_h = s.placeholder) != null ? _h : s.name) != null ? _i : "", imageId), { family: DEFAULT_FAMILY, style: "Regular" }, load);
        return { node: f };
      }
      case "instance": {
        const c = await ctx.component((_j = s.component) != null ? _j : "");
        const comp = c.type === "COMPONENT_SET" ? findVariant(c, s.variant, path) : c;
        if (c.type === "COMPONENT" && s.variant && Object.keys(s.variant).length) ctx.warn(`${path}.variant: "${c.name}" has no variants; ignored.`);
        return { node: comp.createInstance() };
      }
      case "group":
        throw badRequest("internal: groups are built by buildGroup");
    }
  }
  async function buildNode(spec, parent, inh, ctx, path, o) {
    var _a, _b, _c, _d, _e;
    if (spec.type === "group") return buildGroup(spec, parent, inh, ctx, path, o);
    if (spec.type === "section" && parent.type !== "PAGE" && parent.type !== "SECTION") {
      throw badRequest(`${path}: sections can only live on a page or inside another section.`);
    }
    if (parent.type === "INSTANCE") throw badRequest(`${path}: cannot add layers inside an instance; edit its main component or use overrides.`);
    const { node, natural } = await createNode(spec, ctx, path, o.opts);
    if (o.index !== void 0 && o.index >= 0 && o.index <= parent.children.length) parent.insertChild(o.index, node);
    else parent.appendChild(node);
    ctx.created.push(node);
    if (spec.ref) ctx.refs.set(spec.ref, node);
    const topLevel = parent.type === "PAGE" || parent.type === "SECTION";
    const s = __spreadValues({}, spec);
    if ((s.type === "frame" || s.type === "component") && s.dir === void 0) s.dir = "column";
    if (s.type === "frame" || s.type === "component") {
      if (s.fill === void 0 && !(topLevel && s.type === "frame")) node.fills = [];
      if (s.clip === void 0) node.clipsContent = topLevel && s.type === "frame";
    }
    if ((s.type === "icon" || s.type === "svg") && s.color === void 0 && inh.color) s.color = inh.color;
    if (s.type === "icon" || s.type === "svg") {
      const size2 = (_a = s.size) != null ? _a : s.type === "icon" ? 24 : void 0;
      if (size2 !== void 0 && s.w === void 0 && s.h === void 0) {
        s.w = size2;
        s.h = size2;
      }
    }
    if (s.type === "image" && natural && s.imageData) {
      const ratio = natural.h / natural.w;
      if (s.w === void 0 && s.h === void 0) {
        const scale = Math.min(1, 1200 / Math.max(natural.w, natural.h));
        s.w = Math.round(natural.w * scale);
        s.h = Math.round(natural.h * scale);
      } else if (typeof s.w === "number" && s.h === void 0) s.h = Math.round(s.w * ratio);
      else if (typeof s.h === "number" && s.w === void 0) s.w = Math.round(s.h / ratio);
    }
    const kids = (_b = s.children) != null ? _b : [];
    const dir = (_c = s.dir) != null ? _c : "none";
    if (kids.length && (s.type === "frame" || s.type === "component")) {
      const effW = (_d = s.w) != null ? _d : o.crossFill && parent.type !== "PAGE" && parent.layoutMode === "VERTICAL" ? "fill" : "hug";
      const effH = (_e = s.h) != null ? _e : o.crossFill && parent.type !== "PAGE" && parent.layoutMode === "HORIZONTAL" ? "fill" : "hug";
      kids.forEach((k, i) => {
        if (k.absolute) return;
        if (k.w === "fill" && effW === "hug")
          ctx.warn(`${path}.children[${i}]: w "fill" inside a parent that hugs its width \u2014 it will shrink to its minimum. Give ${path} a width (number or "fill").`);
        if (k.h === "fill" && effH === "hug") ctx.warn(`${path}.children[${i}]: h "fill" inside a parent that hugs its height. Give ${path} a height.`);
      });
    }
    await applyProps(node, s, inh, ctx, path, { isNew: true, crossFill: o.crossFill });
    if (kids.length) {
      if (!("appendChild" in node)) throw badRequest(`${path}: a ${s.type} cannot contain children.`);
      const childInh = inheritFrom(inh, s);
      const order = kids.map((k, i) => ({ k, i }));
      if (childInh.rtl && dir === "row") order.reverse();
      const created = [];
      for (const { k, i } of order) {
        const child = await buildNode(k, node, childInh, ctx, `${path}.children[${i}]`, { crossFill: s.align === "stretch", opts: o.opts });
        created.push({ spec: k, node: child });
      }
      const fixed = created.filter((c) => c.spec.fixed);
      if (fixed.length) {
        const f = node;
        for (const c of fixed) f.appendChild(c.node);
        f.numberOfFixedChildren = fixed.length;
        if (f.overflowDirection === "NONE") ctx.warn(`${path}: has fixed children but does not scroll; set scroll: "vertical".`);
      }
    }
    if ((s.x !== void 0 || s.y !== void 0) && (s.absolute || !isAutoLayout(parent))) {
      if (s.x !== void 0) node.x = s.x;
      if (s.y !== void 0) node.y = s.y;
    }
    if (s.type === "component" && s.props && Object.keys(s.props).length) {
      await defineComponentProps(node, s.props, ctx, path);
    }
    return node;
  }
  async function buildGroup(spec, parent, inh, ctx, path, o) {
    var _a, _c2;
    const childInh = inheritFrom(inh, spec);
    const kids = [];
    for (let i = 0; i < ((_a = spec.children) != null ? _a : []).length; i++) {
      kids.push(await buildNode(spec.children[i], parent, childInh, ctx, `${path}.children[${i}]`, { opts: o.opts }));
    }
    const g2 = figma.group(kids, parent, o.index);
    ctx.created.push(g2);
    if (spec.ref) ctx.refs.set(spec.ref, g2);
    const _b = spec, { children: _c } = _b, rest = __objRest(_b, ["children"]);
    await applyProps(g2, __spreadProps(__spreadValues({}, rest), { name: (_c2 = spec.name) != null ? _c2 : "Group" }), inh, ctx, path, { isNew: true });
    return g2;
  }
  var PROP_TYPES = {
    text: "TEXT",
    string: "TEXT",
    boolean: "BOOLEAN",
    bool: "BOOLEAN",
    toggle: "BOOLEAN",
    instance: "INSTANCE_SWAP",
    swap: "INSTANCE_SWAP",
    "instance-swap": "INSTANCE_SWAP",
    slot: "INSTANCE_SWAP"
  };
  function isInside(node, owner) {
    let n = node;
    while (n) {
      if (n === owner) return true;
      n = n.parent;
    }
    return false;
  }
  async function defineComponentProps(owner, defs, ctx, path) {
    var _a, _b, _c, _d, _e;
    const keys = {};
    const binds = ctx.binds.filter((b) => isInside(b.node, owner));
    for (const [name, raw] of Object.entries(defs)) {
      const def = typeof raw === "object" && raw !== null ? raw : { type: typeof raw === "boolean" ? "boolean" : "text", default: raw };
      const t = PROP_TYPES[String((_a = def.type) != null ? _a : "text").toLowerCase()];
      if (!t) throw badRequest(`${path}.props.${name}: type must be text, boolean or instance.`);
      let defaultValue;
      let options;
      if (t === "BOOLEAN") defaultValue = def.default === void 0 ? true : def.default === true || def.default === "true";
      else if (t === "TEXT") {
        const bound = binds.find((b) => {
          var _a2;
          return ((_a2 = b.bind.text) == null ? void 0 : _a2.toLowerCase()) === name.toLowerCase() && b.node.type === "TEXT";
        });
        defaultValue = def.default !== void 0 ? String(def.default) : bound ? bound.node.characters : name;
      } else {
        let dflt = def.default !== void 0 ? String(def.default) : void 0;
        if (!dflt) {
          const bound = binds.find((b) => {
            var _a2;
            return ((_a2 = b.bind.swap) == null ? void 0 : _a2.toLowerCase()) === name.toLowerCase() && b.node.type === "INSTANCE";
          });
          if (bound) dflt = (_b = await bound.node.getMainComponentAsync()) == null ? void 0 : _b.id;
        }
        if (!dflt) throw badRequest(`${path}.props.${name}: an instance-swap property needs a default component.`);
        const c = await ctx.component(dflt);
        defaultValue = c.type === "COMPONENT_SET" ? ((_c = c.defaultVariant) != null ? _c : c.children[0]).id : c.id;
        if ((_d = def.preferred) == null ? void 0 : _d.length) {
          const preferredValues = [];
          for (const pv of def.preferred) {
            const pc = await ctx.component(pv);
            preferredValues.push({ type: pc.type === "COMPONENT_SET" ? "COMPONENT_SET" : "COMPONENT", key: pc.key });
          }
          options = { preferredValues };
        }
      }
      keys[name.toLowerCase()] = owner.addComponentProperty(name, t, defaultValue, options);
    }
    for (const b of binds) {
      const refs = __spreadValues({}, (_e = b.node.componentPropertyReferences) != null ? _e : {});
      const want = [
        ["characters", b.bind.text, "TEXT"],
        ["visible", b.bind.visible, "BOOLEAN"],
        ["mainComponent", b.bind.swap, "INSTANCE_SWAP"]
      ];
      for (const [field, propName, type] of want) {
        if (!propName) continue;
        const key = keys[propName.toLowerCase()];
        if (!key) {
          throw badRequest(`${b.path}.bind: no ${type.toLowerCase()} property "${propName}" is defined. Defined: ${Object.keys(defs).join(", ") || "none"}.`);
        }
        if (field === "characters" && b.node.type !== "TEXT") throw badRequest(`${b.path}.bind.text: only text layers can bind a text property.`);
        if (field === "mainComponent" && b.node.type !== "INSTANCE") throw badRequest(`${b.path}.bind.swap: only instances can bind an instance-swap property.`);
        refs[field] = key;
      }
      if (b.node.type === "TEXT") await ctx.loadFontsIn(b.node);
      b.node.componentPropertyReferences = refs;
    }
    ctx.binds = ctx.binds.filter((b) => !binds.includes(b));
    return keys;
  }
  function summarize(node) {
    return { id: node.id, name: node.name, type: node.type, x: Math.round(node.x), y: Math.round(node.y), w: Math.round(node.width), h: Math.round(node.height) };
  }
  async function build(spec, opts = {}, existingCtx) {
    var _a, _b, _c, _d;
    const ctx = existingCtx != null ? existingCtx : new Ctx();
    let parent = figma.currentPage;
    let createdPage;
    let index = opts.index;
    let replace;
    if (opts.replaceId) {
      replace = await ctx.sceneNode(opts.replaceId, "replaceId");
      if (!replace.parent) throw badRequest("replaceId: node has no parent.");
      parent = replace.parent;
      index = parent.children.indexOf(replace);
    } else if (opts.parentId) {
      const p = await ctx.node(opts.parentId, "parentId");
      if (!("appendChild" in p)) throw badRequest(`parentId ${opts.parentId}: a ${p.type.toLowerCase()} cannot contain layers.`);
      if (p.type === "PAGE") {
        await p.loadAsync();
        if (p !== figma.currentPage && opts.switchPage !== false) await figma.setCurrentPageAsync(p);
      }
      parent = p;
    } else if (opts.page || spec.type === "component") {
      const r = opts.page ? await ensurePage(opts.page) : await rolePage("components");
      if (r.created) createdPage = r.page;
      if (r.page !== figma.currentPage && ((_a = opts.switchPage) != null ? _a : spec.type !== "component")) await figma.setCurrentPageAsync(r.page);
      parent = spec.type === "component" && r.page.getPluginData("role") === "components" ? await componentHome((_b = spec.name) != null ? _b : "") : r.page;
    }
    if (!replace && spec.type === "component" && spec.name && !opts.allowDuplicate) {
      const twin = await ctx.localComponentNamed(spec.name);
      if (twin) throw badRequest(`Component "${twin.name}" already exists (${twin.id}). Update that component (edit it or its variants) and place instances of it instead of making a second one.`);
    }
    const targetPage = parent.type === "PAGE" ? parent : pageOf(parent);
    if (isTrashPage(targetPage)) throw badRequest('That is the Trash page. Build on a content page (page: "App", "Web", "Dashboard", \u2026) or restore layers with edit {op: "restore"}.');
    if (!replace && (parent.type === "PAGE" || parent.type === "SECTION") && spec.name && !opts.allowDuplicate) {
      const want = spec.name.trim().toLowerCase();
      const twin = parent.children.find((c) => c.name.trim().toLowerCase() === want);
      if (twin) {
        throw badRequest(
          `"${twin.name}" already exists on ${parent.type === "PAGE" ? "page" : "section"} "${parent.name}" (${twin.id}). Update it instead of making a second copy: edit it, or build with replaceId: "${twin.id}" (the old version goes to the Trash page). Use another name for a different state (e.g. "${spec.name} \u2013 Empty"), or allowDuplicate: true if a copy is really wanted.`
        );
      }
    }
    if (parent.type === "PAGE" && (targetPage == null ? void 0 : targetPage.getPluginData("role")) === "components" && spec.type !== "component" && spec.type !== "section") {
      ctx.warn("Built on the Components page: keep only components (and their documentation) there; screens go on their own page (App, Web, Dashboard\u2026).");
    }
    const inh = { font: {}, color: void 0, rtl: void 0 };
    try {
      await ctx.loadFont({ family: DEFAULT_FAMILY, style: "Regular" });
    } catch (e) {
    }
    await preflight(spec, ctx, inh);
    const placeOnCanvas = (parent.type === "PAGE" || parent.type === "SECTION") && !replace;
    const spot = placeOnCanvas && opts.x === void 0 && opts.y === void 0 && spec.x === void 0 && spec.y === void 0 ? freeSpot(parent) : void 0;
    let root;
    try {
      root = await buildNode(spec, parent, inh, ctx, "spec", { index, crossFill: false, opts });
      if (replace) {
        if (!isAutoLayout(parent)) {
          root.x = replace.x;
          root.y = replace.y;
        }
        await trashNodes([replace]);
      } else if (spot) {
        root.x = spot.x;
        root.y = spot.y;
      } else if (placeOnCanvas && (opts.x !== void 0 || opts.y !== void 0)) {
        if (opts.x !== void 0) root.x = opts.x;
        if (opts.y !== void 0) root.y = opts.y;
      }
      const topLevel = parent.type === "PAGE" || parent.type === "SECTION";
      if (topLevel && root.type === "FRAME" && spec.mockup !== false && isMockupDevice(spec.device) && (targetPage == null ? void 0 : targetPage.getPluginData("role")) !== "components") {
        for (const w of await applyMockup(root, spec.device)) ctx.warn(w);
      } else if (!topLevel) keepChromeOnTop(mockupScreenOf(parent));
      if (topLevel && (targetPage == null ? void 0 : targetPage.getPluginData("role")) !== "trash") ensureCanvas(targetPage, root);
      if (targetPage) fitSections(targetPage);
      const linked = await applyPendingInteractions(ctx);
      if (ctx.binds.length) {
        for (const b of ctx.binds) ctx.warn(`${b.path}.bind: ignored \u2014 binds only work inside a component that defines "props".`);
        ctx.binds = [];
      }
      if (opts.focus !== false && root.parent && pageOf(root) === figma.currentPage) {
        figma.currentPage.selection = [root];
        figma.viewport.scrollAndZoomIntoView([root]);
      }
      const ids = {};
      for (const [ref, n] of ctx.refs) ids[ref] = n.id;
      return { root: summarize(root), page: (_c = pageOf(root)) == null ? void 0 : _c.name, ids, created: ctx.created.length, interactions: linked, warnings: ctx.warnings };
    } catch (e) {
      const first = root != null ? root : ctx.created[0];
      try {
        if (first && !first.removed) first.remove();
        for (const n of ctx.created) if (!n.removed && ((_d = n.parent) == null ? void 0 : _d.type) === "PAGE" && n !== first && n.getPluginData("role") !== ICONS_ROLE) n.remove();
        if (createdPage && !createdPage.removed && !createdPage.children.length && figma.root.children.length > 1) {
          if (figma.currentPage === createdPage) await figma.setCurrentPageAsync(figma.root.children.find((p) => p !== createdPage));
          createdPage.remove();
        }
      } catch (e2) {
      }
      throw e;
    }
  }

  // src/plugin/components.ts
  async function componentParent(p) {
    if (p.parentId) return p.parentId;
    if (p.page) {
      const { page } = await ensurePage(p.page);
      if (page.getPluginData("role") !== "components") return page.id;
    }
    return (await componentHome(p.name)).id;
  }
  var matches2 = (props, cond = {}) => Object.entries(cond).every(([k, v]) => Array.isArray(v) ? v.map(String).includes(props[k]) : String(v) === props[k]);
  function layoutVariantGrid(set, axes, gap) {
    var _a, _b, _c, _d;
    const variants = set.children;
    const last = axes[axes.length - 1];
    const rowKey = (v) => axes.slice(0, -1).map((a) => {
      var _a2, _b2;
      return (_b2 = (_a2 = v.variantProperties) == null ? void 0 : _a2[a]) != null ? _b2 : "";
    }).join("|");
    const rows = [];
    const cols = [];
    for (const v of variants) {
      const r = rowKey(v);
      const c = (_b = (_a = v.variantProperties) == null ? void 0 : _a[last]) != null ? _b : "";
      if (!rows.includes(r)) rows.push(r);
      if (!cols.includes(c)) cols.push(c);
    }
    const colW = cols.map((c) => Math.max(...variants.filter((v) => {
      var _a2, _b2;
      return ((_b2 = (_a2 = v.variantProperties) == null ? void 0 : _a2[last]) != null ? _b2 : "") === c;
    }).map((v) => v.width)));
    const rowH = rows.map((r) => Math.max(...variants.filter((v) => rowKey(v) === r).map((v) => v.height)));
    const pad = gap;
    for (const v of variants) {
      const ci = cols.indexOf((_d = (_c = v.variantProperties) == null ? void 0 : _c[last]) != null ? _d : "");
      const ri = rows.indexOf(rowKey(v));
      v.x = pad + colW.slice(0, ci).reduce((a, b) => a + b + gap, 0);
      v.y = pad + rowH.slice(0, ri).reduce((a, b) => a + b + gap, 0);
    }
    let maxX = 0;
    let maxY = 0;
    for (const v of variants) {
      maxX = Math.max(maxX, v.x + v.width);
      maxY = Math.max(maxY, v.y + v.height);
    }
    set.resizeWithoutConstraints(maxX + pad, maxY + pad);
  }
  async function createComponent(p) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    if (!p.name) throw badRequest("name is required.");
    if (/[=,]/.test(p.name)) throw badRequest('Component names cannot contain "=" or ",".');
    const issues = newIssues();
    if (!p.variants) {
      const spec = normalizeSpec((_a = p.spec) != null ? _a : {}, "spec", issues);
      issues.errors.push(...applyAssets(spec, p.assets));
      if (issues.errors.length) throw badRequest(issues.errors.join("\n"));
      spec.type = "component";
      spec.name = p.name;
      if (p.description) spec.description = p.description;
      if (p.props) spec.props = p.props;
      const res = await build(spec, { parentId: await componentParent(p), x: p.x, y: p.y, focus: p.focus, switchPage: false, allowDuplicate: p.allowDuplicate });
      const node = await figma.getNodeByIdAsync(res.root.id);
      return {
        component: __spreadProps(__spreadValues({}, res.root), { key: node.key, page: res.page }),
        properties: Object.keys(node.componentPropertyDefinitions),
        ids: res.ids,
        warnings: [...issues.warnings, ...res.warnings]
      };
    }
    const expanded = expandVariants(p.spec, p.variants, issues);
    const specs = expanded.map((v, i) => {
      const s = normalizeSpec(v.spec, `variants[${i}] (${v.name})`, issues);
      issues.errors.push(...applyAssets(s, p.assets));
      s.type = "component";
      s.name = v.name;
      delete s.props;
      return s;
    });
    if (issues.errors.length) throw badRequest(`Nothing was created \u2014 fix these first:
- ${[...new Set(issues.errors)].join("\n- ")}`);
    const ctx = new Ctx();
    const inh = { font: {} };
    const n = await ctx.node(await componentParent(p), "parentId");
    if (!("appendChild" in n)) throw badRequest(`parentId: a ${n.type.toLowerCase()} cannot contain layers.`);
    if (n.type === "PAGE") await n.loadAsync();
    const parent = n;
    const twin = (_b = parent.children.find((c) => c.name.trim().toLowerCase() === p.name.trim().toLowerCase())) != null ? _b : await ctx.localComponentNamed(p.name);
    if (twin && !p.allowDuplicate) {
      throw badRequest(`"${twin.name}" already exists (${twin.id}). Update that component (edit its variants, or edit {op: "delete"} it first \u2014 it goes to the Trash page) instead of making a second one.`);
    }
    await preflight(specs[0], ctx, inh);
    const spot = p.x === void 0 && p.y === void 0 && (parent.type === "PAGE" || parent.type === "SECTION") ? freeSpot(parent) : { x: (_c = p.x) != null ? _c : 0, y: (_d = p.y) != null ? _d : 0 };
    const comps = [];
    let set;
    try {
      for (let i = 0; i < specs.length; i++) {
        const node = await buildNode(specs[i], parent, inh, ctx, `variants[${i}] (${specs[i].name})`, { opts: { focus: false } });
        comps.push(node);
      }
      set = figma.combineAsVariants(comps, parent);
      set.name = p.name;
      if (p.description) set.description = p.description;
      layoutVariantGrid(set, Object.keys(p.variants.axes), (_e = p.gap) != null ? _e : 24);
      set.x = spot.x;
      set.y = spot.y;
      ctx.registerComponent(set);
      const keys = p.props ? await defineComponentProps(set, p.props, ctx, "props") : {};
      if (ctx.binds.length) {
        for (const b of ctx.binds) ctx.warn(`${b.path}.bind: "${JSON.stringify(b.bind)}" has no matching entry in props; ignored.`);
        ctx.binds = [];
      }
      await applyPendingInteractions(ctx);
      let wired = 0;
      for (const [ri, rule] of ((_f = p.interactions) != null ? _f : []).entries()) {
        const ruleIssues = newIssues();
        const [base] = interactions({ trigger: (_g = rule.trigger) != null ? _g : "hover", changeTo: "x", transition: rule.transition }, `interactions[${ri}]`, ruleIssues);
        if (ruleIssues.errors.length) throw badRequest(ruleIssues.errors.join("\n"));
        for (const v of set.children) {
          const props = (_h = v.variantProperties) != null ? _h : {};
          if (!matches2(props, rule.from)) continue;
          const want = __spreadValues(__spreadValues({}, props), rule.to);
          const target = set.children.find((c) => Object.entries(want).every(([k, val]) => {
            var _a2;
            return ((_a2 = c.variantProperties) == null ? void 0 : _a2[k]) === val;
          }));
          if (!target || target === v) continue;
          const reaction = await toReaction(__spreadProps(__spreadValues({}, base), { actions: [__spreadProps(__spreadValues({}, base.actions[0]), { kind: "change-to", to: target.id })] }), v, ctx, `interactions[${ri}]`);
          await v.setReactionsAsync([...v.reactions, reaction]);
          wired++;
        }
      }
      const home = pageOf(set);
      if (home) fitSections(home);
      if (p.focus !== false && home === figma.currentPage) {
        figma.currentPage.selection = [set];
        figma.viewport.scrollAndZoomIntoView([set]);
      }
      const ids = {};
      for (const [ref, n2] of ctx.refs) ids[ref] = n2.id;
      return {
        componentSet: __spreadProps(__spreadValues({}, summarize(set)), { key: set.key, page: (_i = pageOf(set)) == null ? void 0 : _i.name }),
        variants: comps.map((c) => ({ id: c.id, name: c.name })),
        properties: Object.keys(set.componentPropertyDefinitions),
        propertyKeys: keys,
        interactiveLinks: wired,
        warnings: [...issues.warnings, ...ctx.warnings]
      };
    } catch (e) {
      try {
        if (set && !set.removed) set.remove();
        else for (const c of comps) if (!c.removed) c.remove();
        for (const n2 of ctx.created) if (!n2.removed && ((_j = n2.parent) == null ? void 0 : _j.type) === "PAGE" && n2.getPluginData("role") !== "icons") n2.remove();
      } catch (e2) {
      }
      throw e;
    }
  }

  // src/plugin/variables.ts
  var TYPES = {
    color: "COLOR",
    number: "FLOAT",
    float: "FLOAT",
    dimension: "FLOAT",
    spacing: "FLOAT",
    string: "STRING",
    text: "STRING",
    boolean: "BOOLEAN",
    bool: "BOOLEAN"
  };
  var ALL_SCOPES = [
    "ALL_SCOPES",
    "TEXT_CONTENT",
    "CORNER_RADIUS",
    "WIDTH_HEIGHT",
    "GAP",
    "ALL_FILLS",
    "FRAME_FILL",
    "SHAPE_FILL",
    "TEXT_FILL",
    "STROKE_COLOR",
    "STROKE_FLOAT",
    "EFFECT_FLOAT",
    "EFFECT_COLOR",
    "OPACITY",
    "COLOR_OPACITY",
    "FONT_FAMILY",
    "FONT_STYLE",
    "FONT_WEIGHT",
    "FONT_SIZE",
    "LINE_HEIGHT",
    "LETTER_SPACING",
    "PARAGRAPH_SPACING",
    "PARAGRAPH_INDENT"
  ];
  function inferScopes(name, type) {
    const n = name.toLowerCase();
    if (type === "COLOR") {
      if (/(shadow|elevation)/.test(n)) return ["EFFECT_COLOR"];
      if (/(border|stroke|outline|divider|separator|ring)/.test(n)) return ["STROKE_COLOR"];
      if (/(^|[/\-_])(text|fg|foreground|on-|label|heading|body|link|content)/.test(n)) return ["TEXT_FILL"];
      if (/icon/.test(n)) return ["SHAPE_FILL", "STROKE_COLOR"];
      if (/(bg|background|surface|fill|canvas|container|overlay|backdrop|layer|card|page)/.test(n)) return ["FRAME_FILL", "SHAPE_FILL"];
      return ["ALL_FILLS", "STROKE_COLOR", "EFFECT_COLOR"];
    }
    if (type === "FLOAT") {
      if (/(font-?size|text-?size|type-?size)/.test(n)) return ["FONT_SIZE"];
      if (/(line-?height|leading)/.test(n)) return ["LINE_HEIGHT"];
      if (/(letter-?spacing|tracking)/.test(n)) return ["LETTER_SPACING"];
      if (/(font-?weight)/.test(n)) return ["FONT_WEIGHT"];
      if (/paragraph/.test(n)) return ["PARAGRAPH_SPACING"];
      if (/(radius|radii|corner|rounded)/.test(n)) return ["CORNER_RADIUS"];
      if (/(border-?width|stroke-?width|stroke)/.test(n)) return ["STROKE_FLOAT"];
      if (/(opacity|alpha)/.test(n)) return ["OPACITY"];
      if (/(blur|shadow|elevation)/.test(n)) return ["EFFECT_FLOAT"];
      if (/(space|spacing|gap|padding|margin|inset|gutter|stack)/.test(n)) return ["GAP"];
      if (/(size|width|height|dimension|breakpoint)/.test(n)) return ["WIDTH_HEIGHT"];
      return null;
    }
    if (type === "STRING") {
      if (/(family|typeface|font-?name)/.test(n)) return ["FONT_FAMILY"];
      if (/(font-?style|weight)/.test(n)) return ["FONT_STYLE"];
      return ["TEXT_CONTENT"];
    }
    return null;
  }
  async function inferType(def, aliasTypes, ctx) {
    if (def.type) {
      const t = TYPES[def.type.toLowerCase()];
      if (!t) throw badRequest(`variable "${def.name}": unknown type "${def.type}" (color, number, string, boolean).`);
      return t;
    }
    const samples = def.values ? Object.values(def.values) : [def.value];
    for (const v of samples) {
      if (typeof v === "number") return "FLOAT";
      if (typeof v === "boolean") return "BOOLEAN";
      if (typeof v === "string") {
        if (v.startsWith("$")) {
          const t = aliasTypes.get(v.slice(1).toLowerCase());
          if (t) return t;
          try {
            return (await ctx.variable(v)).resolvedType;
          } catch (e) {
            continue;
          }
        }
        if (parseColor(v)) return "COLOR";
        if (/^-?\d*\.?\d+(px)?$/.test(v.trim())) return "FLOAT";
        return "STRING";
      }
      if (v && typeof v === "object" && "r" in v) return "COLOR";
    }
    return void 0;
  }
  async function toValue(raw, type, ctx, where) {
    var _a;
    if (typeof raw === "string" && raw.startsWith("$")) {
      const target = await ctx.variable(raw);
      if (target.resolvedType !== type) throw badRequest(`${where}: alias ${raw} is ${target.resolvedType}, expected ${type}.`);
      return figma.variables.createVariableAlias(target);
    }
    if (raw && typeof raw === "object" && "alias" in raw) return toValue(`$${String(raw.alias).replace(/^\$/, "")}`, type, ctx, where);
    switch (type) {
      case "COLOR": {
        if (raw && typeof raw === "object" && "r" in raw) {
          const c2 = raw;
          return { r: c2.r, g: c2.g, b: c2.b, a: (_a = c2.a) != null ? _a : 1 };
        }
        const c = parseColor(String(raw));
        if (!c) throw badRequest(`${where}: cannot read color ${JSON.stringify(raw)}.`);
        return c;
      }
      case "FLOAT": {
        const n = typeof raw === "number" ? raw : parseFloat(String(raw));
        if (!Number.isFinite(n)) throw badRequest(`${where}: expected a number, got ${JSON.stringify(raw)}.`);
        return n;
      }
      case "BOOLEAN":
        return raw === true || raw === "true";
      default:
        return String(raw);
    }
  }
  async function upsertVariables(p) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const ctx = new Ctx();
    const report = [];
    const errors = [];
    const plan = [];
    for (const def of (_a = p.collections) != null ? _a : []) {
      if (!def.name) throw badRequest("every collection needs a name.");
      const existing = (await ctx.collections()).find((c) => c.name.toLowerCase() === def.name.toLowerCase());
      const coll = existing != null ? existing : figma.variables.createVariableCollection(def.name);
      const modesAdded = [];
      if (def.renameModes) {
        for (const [from, to] of Object.entries(def.renameModes)) {
          const m = coll.modes.find((x) => x.name.toLowerCase() === from.toLowerCase());
          if (m) coll.renameMode(m.modeId, to);
          else errors.push(`collection "${def.name}": no mode "${from}" to rename.`);
        }
      }
      if ((_b = def.modes) == null ? void 0 : _b.length) {
        if (!existing) coll.renameMode(coll.modes[0].modeId, def.modes[0]);
        else if (coll.modes.length === 1 && /^mode 1$/i.test(coll.modes[0].name)) coll.renameMode(coll.modes[0].modeId, def.modes[0]);
        for (const m of def.modes) {
          if (coll.modes.some((x) => x.name.toLowerCase() === m.toLowerCase())) continue;
          try {
            coll.addMode(m);
            modesAdded.push(m);
          } catch (e) {
            errors.push(`collection "${def.name}": could not add mode "${m}" (${e instanceof Error ? e.message : e}). Your Figma plan may limit modes per collection.`);
          }
        }
      } else if (!existing && /^mode 1$/i.test(coll.modes[0].name)) {
        coll.renameMode(coll.modes[0].modeId, "Default");
      }
      plan.push({ coll, def });
      report.push({ collection: coll.name, id: coll.id, created: !existing, modes: coll.modes.map((m) => m.name), modesAdded });
    }
    ctx.invalidateVariables();
    const aliasTypes = /* @__PURE__ */ new Map();
    for (const { def } of plan) for (const v of (_c = def.variables) != null ? _c : []) if (v.type && TYPES[v.type.toLowerCase()]) aliasTypes.set(v.name.toLowerCase(), TYPES[v.type.toLowerCase()]);
    const created = [];
    const pending = [];
    for (const { coll, def } of plan) for (const v of (_d = def.variables) != null ? _d : []) pending.push({ def: v, coll, collDef: def });
    const localByKey = /* @__PURE__ */ new Map();
    for (const x of await figma.variables.getLocalVariablesAsync()) localByKey.set(`${x.variableCollectionId}::${x.name}`, x);
    for (let round2 = 0; round2 < 3 && pending.length; round2++) {
      for (let i = 0; i < pending.length; ) {
        const { def, coll } = pending[i];
        const existing = localByKey.get(`${coll.id}::${def.name}`);
        let type = existing == null ? void 0 : existing.resolvedType;
        if (!type) {
          try {
            type = await inferType(def, aliasTypes, ctx);
          } catch (e) {
            errors.push(e instanceof Error ? e.message : String(e));
            pending.splice(i, 1);
            continue;
          }
        }
        if (!type) {
          i++;
          continue;
        }
        aliasTypes.set(def.name.toLowerCase(), type);
        aliasTypes.set(`${coll.name.toLowerCase()}:${def.name.toLowerCase()}`, type);
        const v = existing != null ? existing : figma.variables.createVariable(def.name, coll, type);
        localByKey.set(`${coll.id}::${def.name}`, v);
        created.push({ v, def, coll, isNew: !existing });
        pending.splice(i, 1);
      }
    }
    for (const { def } of pending) errors.push(`variable "${def.name}": cannot infer its type; add "type".`);
    ctx.invalidateVariables();
    let updated = 0;
    for (const { v, def, coll, isNew } of created) {
      const collDef = (_e = plan.find((x) => x.coll === coll)) == null ? void 0 : _e.def;
      try {
        if (def.values) {
          for (const [modeName, raw] of Object.entries(def.values)) {
            const mode = coll.modes.find((m) => m.name.toLowerCase() === modeName.toLowerCase());
            if (!mode) {
              errors.push(`variable "${def.name}": collection "${coll.name}" has no mode "${modeName}".${didYouMean(modeName, coll.modes.map((m) => m.name))}`);
              continue;
            }
            v.setValueForMode(mode.modeId, await toValue(raw, v.resolvedType, ctx, `variable "${def.name}" [${modeName}]`));
          }
        } else if (def.value !== void 0) {
          const val = await toValue(def.value, v.resolvedType, ctx, `variable "${def.name}"`);
          for (const m of coll.modes) v.setValueForMode(m.modeId, val);
        } else if (isNew) {
          errors.push(`variable "${def.name}": created without a value \u2014 give "value" or "values".`);
        }
        const hidden = (_f = def.hidden) != null ? _f : collDef == null ? void 0 : collDef.hidden;
        if (Array.isArray(def.scopes)) {
          const bad = def.scopes.filter((s) => !ALL_SCOPES.includes(s));
          if (bad.length) errors.push(`variable "${def.name}": unknown scopes ${bad.join(", ")}.${didYouMean(bad[0], ALL_SCOPES)}`);
          else v.scopes = def.scopes;
        } else if (hidden) {
          v.scopes = [];
        } else if (isNew || def.scopes === "auto") {
          const s = inferScopes(def.name, v.resolvedType);
          if (s) v.scopes = s;
        }
        if (def.codeSyntax !== false) {
          const cs = typeof def.codeSyntax === "string" ? { web: def.codeSyntax } : def.codeSyntax;
          if (cs == null ? void 0 : cs.web) v.setVariableCodeSyntax("WEB", cs.web);
          else if (isNew) v.setVariableCodeSyntax("WEB", `var(--${kebab(def.name)})`);
          if (cs == null ? void 0 : cs.ios) v.setVariableCodeSyntax("iOS", cs.ios);
          if (cs == null ? void 0 : cs.android) v.setVariableCodeSyntax("ANDROID", cs.android);
        }
        if (def.description !== void 0) v.description = def.description;
        updated++;
      } catch (e) {
        errors.push(`variable "${def.name}": ${e instanceof Error ? e.message : e}`);
      }
    }
    const deleted = [];
    for (const name of (_g = p.delete) != null ? _g : []) {
      try {
        const v = await ctx.variable(name);
        v.remove();
        deleted.push(name);
      } catch (e) {
        errors.push(`delete "${name}": ${e instanceof Error ? e.message : e}`);
      }
    }
    for (const name of (_h = p.deleteCollections) != null ? _h : []) {
      try {
        const c = await ctx.collectionByName(name);
        c.remove();
        deleted.push(`collection ${name}`);
      } catch (e) {
        errors.push(`delete collection "${name}": ${e instanceof Error ? e.message : e}`);
      }
    }
    return {
      collections: report,
      variables: { created: created.filter((c) => c.isNew).length, updated: updated - created.filter((c) => c.isNew).length },
      deleted,
      errors,
      sample: created.slice(0, 8).map(({ v }) => ({ name: v.name, type: v.resolvedType, scopes: v.scopes, web: v.codeSyntax.WEB }))
    };
  }
  async function readVariables(p = {}) {
    var _a;
    const [collections, vars] = await Promise.all([figma.variables.getLocalVariableCollectionsAsync(), figma.variables.getLocalVariablesAsync()]);
    const byId = new Map(vars.map((v) => [v.id, v]));
    const collName = new Map(collections.map((c) => [c.id, c.name]));
    const external = /* @__PURE__ */ new Map();
    const wantColl = (_a = p.collection) == null ? void 0 : _a.toLowerCase();
    const colls = collections.filter((c) => !wantColl || c.name.toLowerCase() === wantColl);
    const outVars = [];
    for (const v of vars) {
      if (!colls.some((c) => c.id === v.variableCollectionId)) continue;
      const values = {};
      for (const [modeId, val] of Object.entries(v.valuesByMode)) {
        if (val && typeof val === "object" && "type" in val && val.type === "VARIABLE_ALIAS") {
          const id = val.id;
          let target = byId.get(id) ? { name: byId.get(id).name, collection: collName.get(byId.get(id).variableCollectionId) } : external.get(id);
          if (!target) {
            const t = await figma.variables.getVariableByIdAsync(id);
            if (t) {
              const tc = await figma.variables.getVariableCollectionByIdAsync(t.variableCollectionId);
              target = { name: t.name, collection: tc == null ? void 0 : tc.name };
            } else target = { name: "?" };
            external.set(id, target);
          }
          values[modeId] = { alias: id, name: target.name, collection: target.collection };
        } else values[modeId] = val;
      }
      outVars.push({
        id: v.id,
        key: v.key,
        name: v.name,
        collectionId: v.variableCollectionId,
        type: v.resolvedType,
        scopes: v.scopes,
        codeSyntax: v.codeSyntax,
        description: v.description || void 0,
        hidden: v.hiddenFromPublishing || void 0,
        values
      });
    }
    let libraries;
    if (p.includeLibraries) {
      try {
        const libs = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
        libraries = libs.map((l) => ({ name: l.name, library: l.libraryName, key: l.key }));
      } catch (e) {
        libraries = [];
      }
    }
    return {
      collections: colls.map((c) => ({
        id: c.id,
        name: c.name,
        modes: c.modes.map((m) => ({ id: m.modeId, name: m.name })),
        defaultModeId: c.defaultModeId,
        hidden: c.hiddenFromPublishing || void 0,
        count: c.variableIds.length
      })),
      variables: outVars,
      libraries
    };
  }

  // src/plugin/ds.ts
  async function usageOf(n) {
    const parts = n.type === "COMPONENT_SET" ? n.children.filter((c) => c.type === "COMPONENT") : [n];
    let instances = 0;
    let inDesigns = 0;
    for (const c of parts) {
      for (const inst of await c.getInstancesAsync()) {
        let page = inst.parent;
        while (page && page.type !== "PAGE") page = page.parent;
        const role = page ? page.getPluginData("role") : "";
        if (role === "trash") continue;
        instances++;
        if (!role) inDesigns++;
      }
    }
    return { instances, inDesigns };
  }
  async function listComponents(p = {}) {
    var _a, _b, _c, _d, _e;
    await figma.loadAllPagesAsync();
    const q = (_a = p.query) == null ? void 0 : _a.toLowerCase();
    const limit = (_b = p.limit) != null ? _b : 400;
    const out = [];
    let total = 0;
    for (const page of figma.root.children) {
      if (page.getPluginData("role") === "trash") continue;
      for (const n of page.findAllWithCriteria({ types: ["COMPONENT_SET", "COMPONENT"] })) {
        if (n.type === "COMPONENT" && ((_c = n.parent) == null ? void 0 : _c.type) === "COMPONENT_SET") continue;
        if (q && !n.name.toLowerCase().includes(q)) continue;
        total++;
        if (out.length >= limit) continue;
        const defs = n.componentPropertyDefinitions;
        const axes = {};
        const props = {};
        for (const [k, d] of Object.entries(defs)) {
          if (d.type === "VARIANT") axes[k] = (_d = d.variantOptions) != null ? _d : [];
          else props[k.split("#")[0]] = `${d.type.toLowerCase()}=${JSON.stringify(d.defaultValue)}`;
        }
        const sample = n.type === "COMPONENT_SET" ? (_e = n.defaultVariant) != null ? _e : n.children[0] : n;
        out.push(__spreadValues(__spreadProps(__spreadValues(__spreadValues(__spreadValues(__spreadValues({
          id: n.id,
          key: n.key,
          name: n.name,
          kind: n.type === "COMPONENT_SET" ? "set" : "component",
          page: page.name
        }, n.description ? { description: n.description } : {}), Object.keys(axes).length ? { axes } : {}), Object.keys(props).length ? { props } : {}), n.type === "COMPONENT_SET" ? { variants: n.children.length } : {}), {
          size: sample ? `${round(sample.width)}\xD7${round(sample.height)}` : void 0
        }), p.usage && !/^icon\//i.test(n.name) ? await usageOf(n) : {}));
      }
    }
    return { components: out, total };
  }
  async function designSystem(p) {
    var _a;
    const include = new Set(((_a = p.include) == null ? void 0 : _a.length) ? p.include : ["variables", "styles", "components"]);
    const res = {
      file: figma.root.name,
      pages: figma.root.children.map((pg) => pg.name)
    };
    if (include.has("variables")) res.variables = await readVariables({ includeLibraries: true });
    if (include.has("styles")) res.styles = await readStyles();
    if (include.has("components")) res.components = await listComponents({ query: p.query });
    return res;
  }

  // src/plugin/edit.ts
  var OPS = ["set", "text", "delete", "restore", "move", "duplicate", "rename", "insert", "wrap", "unwrap", "swap", "detach", "reset", "to-component", "combine-variants", "select", "page", "group", "ungroup", "flatten", "boolean", "place-image"];
  async function idsOf(op, ctx, i) {
    var _a;
    const ids = (_a = op.ids) != null ? _a : op.id ? [op.id] : [];
    if (!ids.length) throw badRequest(`ops[${i}] (${op.op}): needs "id" or "ids".`);
    const nodes = [];
    for (const id of ids) nodes.push(await ctx.sceneNode(id, `ops[${i}]`));
    return nodes;
  }
  function container(n, label) {
    if (!("appendChild" in n)) throw badRequest(`${label}: a ${n.type.toLowerCase()} cannot contain layers.`);
    if (n.type === "INSTANCE") throw badRequest(`${label}: cannot add layers inside an instance.`);
    return n;
  }
  async function edit(p) {
    if (!Array.isArray(p.ops) || !p.ops.length) throw badRequest("ops is empty.");
    const ctx = new Ctx();
    const results = [];
    const touched = [];
    for (let i = 0; i < p.ops.length; i++) {
      const op = p.ops[i];
      const label = `ops[${i}] (${op.op})`;
      try {
        if (!OPS.includes(op.op)) throw badRequest(`${label}: unknown op. Ops: ${OPS.join(", ")}.`);
        const r = await runOp(op, ctx, label, i, touched, p.assets);
        results.push(__spreadValues({ op: op.op, ok: true }, r));
      } catch (e) {
        const msg = explainFigmaError(e);
        return {
          ok: false,
          failedAt: i,
          error: `${label}: ${msg}`,
          applied: results,
          note: i > 0 ? `ops 0\u2013${i - 1} were applied; fix op ${i} and send the remaining ops only.` : "nothing was applied.",
          warnings: ctx.warnings
        };
      }
    }
    await applyPendingInteractions(ctx);
    fitSections(figma.currentPage);
    for (const n of touched) {
      const pg = !n.removed ? pageOf(n) : null;
      if (pg && pg !== figma.currentPage) fitSections(pg);
    }
    if (p.focus && touched.length) {
      const alive = touched.filter((n) => !n.removed);
      if (alive.length) {
        figma.currentPage.selection = alive;
        figma.viewport.scrollAndZoomIntoView(alive);
      }
    }
    const ids = {};
    for (const [ref, n] of ctx.refs) ids[ref] = n.id;
    return { ok: true, results, ids, warnings: ctx.warnings };
  }
  async function runOp(op, ctx, label, i, touched, assets) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v;
    switch (op.op) {
      case "set": {
        const issues = newIssues();
        const props = normalizeSpec((_a = op.props) != null ? _a : {}, `${label}.props`, issues, { partial: true });
        issues.errors.push(...applyAssets(props, assets));
        if (issues.errors.length) throw badRequest(issues.errors.join("; "));
        if (props.children) throw badRequest(`${label}: "set" cannot add children; use "insert".`);
        ctx.warnings.push(...issues.warnings);
        const nodes = await idsOf(op, ctx, i);
        for (const n of nodes) {
          await applyProps(n, props, { font: {} }, ctx, `${label}[${n.id}]`, { isNew: false });
          touched.push(n);
        }
        return { ids: nodes.map((n) => n.id) };
      }
      case "text": {
        const [n] = await idsOf(op, ctx, i);
        if (n.type !== "TEXT") throw badRequest(`${label}: ${n.id} is a ${n.type.toLowerCase()}, not text.`);
        await ctx.loadFontsIn(n);
        n.characters = (_b = op.text) != null ? _b : "";
        touched.push(n);
        return { id: n.id };
      }
      case "rename": {
        const [n] = await idsOf(op, ctx, i);
        n.name = (_c = op.name) != null ? _c : n.name;
        return { id: n.id, name: n.name };
      }
      case "delete": {
        const nodes = await idsOf(op, ctx, i);
        const ids = nodes.map((n) => n.id);
        if (op.permanent) {
          for (const n of nodes) if (!n.removed) n.remove();
          return { deleted: ids, permanent: true };
        }
        const r = await trashNodes(nodes);
        return __spreadProps(__spreadValues({ trashed: r.trashed, page: r.page }, r.removedPages.length ? { removedEmptyPages: r.removedPages } : {}), { note: 'moved to the Trash page \u2014 restore with {op: "restore", ids}' });
      }
      case "restore": {
        const nodes = await idsOf(op, ctx, i);
        const parent = op.parent ? container(await ctx.node(op.parent, `${label}.parent`), label) : void 0;
        return { restored: await restoreNodes(nodes, parent) };
      }
      case "place-image": {
        const nodes = await idsOf(op, ctx, i);
        const img = op.src ? (_d = assets == null ? void 0 : assets.images) == null ? void 0 : _d[op.src] : void 0;
        if (!(img == null ? void 0 : img.data)) throw badRequest(`${label}: image "${(_e = op.src) != null ? _e : ""}" was not loaded (absolute path or URL; PNG/JPG/GIF).`);
        for (const n of nodes) if (n.type !== "FRAME" && n.type !== "RECTANGLE") throw badRequest(`${label}: place images into a frame or rectangle ("${n.name}" is a ${n.type.toLowerCase()}).`);
        return placeImage({ ids: nodes.map((n) => n.id), imageData: img.data, fit: op.fit });
      }
      case "move": {
        const nodes = await idsOf(op, ctx, i);
        const parent = op.parent ? container(await ctx.node(op.parent, `${label}.parent`), label) : null;
        for (const n of nodes) {
          if (parent) {
            if (op.index !== void 0) parent.insertChild(Math.min(op.index, parent.children.length), n);
            else parent.appendChild(n);
          } else if (op.index !== void 0 && n.parent && "insertChild" in n.parent) {
            n.parent.insertChild(Math.min(op.index, n.parent.children.length - 1), n);
          }
          if (op.x !== void 0) n.x = op.x;
          if (op.y !== void 0) n.y = op.y;
          touched.push(n);
        }
        keepChromeOnTop(mockupScreenOf((_g = parent != null ? parent : (_f = nodes[0]) == null ? void 0 : _f.parent) != null ? _g : null));
        return { ids: nodes.map((n) => n.id) };
      }
      case "duplicate": {
        const [n] = await idsOf(op, ctx, i);
        const count = Math.max(1, Math.min((_h = op.count) != null ? _h : 1, 50));
        const parent = op.parent ? container(await ctx.node(op.parent, `${label}.parent`), label) : n.parent;
        const copies = [];
        for (let k = 0; k < count; k++) {
          const c = n.clone();
          if (op.index !== void 0) parent.insertChild(Math.min(op.index + k, parent.children.length), c);
          else if (parent === n.parent) parent.insertChild(parent.children.indexOf(n) + 1 + k, c);
          else parent.appendChild(c);
          if (!isAutoLayout(parent)) {
            if (op.x !== void 0) c.x = op.x;
            else if (parent.type === "PAGE" || parent.type === "SECTION") c.x = n.x + (n.width + ((_i = op.gap) != null ? _i : 80)) * (k + 1);
            if (op.y !== void 0) c.y = op.y;
          }
          copies.push(c);
          touched.push(c);
        }
        if (op.ref) ctx.refs.set(op.ref, copies[0]);
        return { ids: copies.map((c) => c.id) };
      }
      case "insert": {
        if (!op.parent) throw badRequest(`${label}: needs "parent".`);
        const parent = container(await ctx.node(op.parent, `${label}.parent`), label);
        const issues = newIssues();
        const spec = normalizeSpec((_k = (_j = op.spec) != null ? _j : op.props) != null ? _k : {}, `${label}.spec`, issues);
        issues.errors.push(...applyAssets(spec, assets));
        if (issues.errors.length) throw badRequest(issues.errors.join("; "));
        ctx.warnings.push(...issues.warnings);
        await preflight(spec, ctx, { font: {} });
        const node = await buildNode(spec, parent, { font: {} }, ctx, label, { index: op.index, opts: { focus: false } });
        keepChromeOnTop(mockupScreenOf(parent));
        if (op.ref) ctx.refs.set(op.ref, node);
        touched.push(node);
        return summarize(node);
      }
      case "wrap": {
        const nodes = await idsOf(op, ctx, i);
        const parent = nodes[0].parent;
        if (!parent || nodes.some((n) => n.parent !== parent)) throw badRequest(`${label}: all layers must share the same parent.`);
        const index = Math.min(...nodes.map((n) => parent.children.indexOf(n)));
        const issues = newIssues();
        const spec = normalizeSpec(__spreadValues({ type: "frame" }, (_m = (_l = op.spec) != null ? _l : op.props) != null ? _m : {}), `${label}.spec`, issues);
        issues.errors.push(...applyAssets(spec, assets));
        if (issues.errors.length) throw badRequest(issues.errors.join("; "));
        delete spec.children;
        const minX = Math.min(...nodes.map((n) => n.x));
        const minY = Math.min(...nodes.map((n) => n.y));
        await preflight(spec, ctx, { font: {} });
        const frame = await buildNode(spec, parent, { font: {} }, ctx, label, { index, opts: { focus: false } });
        const ordered = [...nodes].sort((a, b) => frame.layoutMode === "HORIZONTAL" ? a.x - b.x : a.y - b.y);
        for (const n of ordered) frame.appendChild(n);
        if (!isAutoLayout(parent)) {
          frame.x = minX;
          frame.y = minY;
        }
        if (op.ref) ctx.refs.set(op.ref, frame);
        touched.push(frame);
        return summarize(frame);
      }
      case "unwrap": {
        const [n] = await idsOf(op, ctx, i);
        if (!("children" in n) || n.type === "INSTANCE") throw badRequest(`${label}: only frames/groups can be unwrapped.`);
        const parent = n.parent;
        const index = parent.children.indexOf(n);
        const kids = [...n.children];
        const abs = kids.map((k) => ({ k, x: k.absoluteTransform[0][2], y: k.absoluteTransform[1][2] }));
        kids.forEach((k, j) => parent.insertChild(index + j, k));
        if (!isAutoLayout(parent)) {
          const t = parent.type === "PAGE" ? null : parent.absoluteTransform;
          const px = t ? t[0][2] : 0;
          const py = t ? t[1][2] : 0;
          for (const a of abs) {
            a.k.x = a.x - px;
            a.k.y = a.y - py;
          }
        }
        if (!n.removed) n.remove();
        return { ids: kids.map((k) => k.id) };
      }
      case "swap": {
        const [n] = await idsOf(op, ctx, i);
        if (n.type !== "INSTANCE") throw badRequest(`${label}: only instances can be swapped.`);
        const c = await ctx.component((_n = op.component) != null ? _n : "");
        let comp;
        if (c.type === "COMPONENT_SET") {
          const want = (_o = op.variant) != null ? _o : {};
          const variants = c.children;
          comp = (_q = (_p = variants.find((v) => Object.entries(want).every(([k, val]) => {
            var _a2, _b2;
            return ((_b2 = (_a2 = v.variantProperties) == null ? void 0 : _a2[k]) == null ? void 0 : _b2.toLowerCase()) === val.toLowerCase();
          }))) != null ? _p : c.defaultVariant) != null ? _q : variants[0];
        } else comp = c;
        await ctx.loadFontsIn(n);
        n.swapComponent(comp);
        touched.push(n);
        return { id: n.id, component: comp.name };
      }
      case "detach": {
        const nodes = await idsOf(op, ctx, i);
        const out = [];
        for (const n of nodes) {
          if (n.type !== "INSTANCE") throw badRequest(`${label}: ${n.id} is not an instance.`);
          out.push(n.detachInstance().id);
        }
        return { ids: out, note: "detached frames have new ids" };
      }
      case "reset": {
        const nodes = await idsOf(op, ctx, i);
        for (const n of nodes) if (n.type === "INSTANCE") n.resetOverrides();
        return { ids: nodes.map((n) => n.id) };
      }
      case "to-component": {
        const nodes = await idsOf(op, ctx, i);
        const out = [];
        for (const n of nodes) {
          const twin = await ctx.localComponentNamed((_r = op.name) != null ? _r : n.name);
          if (twin) ctx.warn(`${label}: a component named "${twin.name}" already exists (${twin.id}) \u2014 swap instances to it rather than keeping two.`);
          const c = figma.createComponentFromNode(n);
          if (op.name) c.name = op.name;
          ctx.registerComponent(c);
          if (op.ref) ctx.refs.set(op.ref, c);
          let instance;
          const home = (await rolePage("components")).page;
          if (!op.keepInPlace && pageOf(c) !== home && c.parent) {
            const parent = c.parent;
            const idx = parent.children.indexOf(c);
            const sizing = { h: c.layoutSizingHorizontal, v: c.layoutSizingVertical, pos: c.layoutPositioning, grow: c.layoutGrow, align: c.layoutAlign, x: c.x, y: c.y, constraints: c.constraints };
            instance = c.createInstance();
            parent.insertChild(idx, instance);
            if (sizing.pos === "ABSOLUTE") instance.layoutPositioning = "ABSOLUTE";
            if (!isAutoLayout(parent) || sizing.pos === "ABSOLUTE") {
              instance.x = sizing.x;
              instance.y = sizing.y;
              if (parent.type !== "PAGE" && parent.type !== "SECTION") instance.constraints = sizing.constraints;
            } else {
              instance.layoutAlign = sizing.align;
              instance.layoutGrow = sizing.grow;
            }
            if (isAutoLayout(parent) || isAutoLayout(instance)) {
              instance.layoutSizingHorizontal = sizing.h;
              instance.layoutSizingVertical = sizing.v;
            }
            (await componentHome(c.name)).appendChild(c);
            if (c.layoutSizingHorizontal === "FILL") c.layoutSizingHorizontal = "FIXED";
            if (c.layoutSizingVertical === "FILL") c.layoutSizingVertical = "FIXED";
          }
          out.push(__spreadValues({ id: c.id, name: c.name, key: c.key, page: (_s = pageOf(c)) == null ? void 0 : _s.name }, instance ? { instance: instance.id } : {}));
        }
        return { components: out };
      }
      case "combine-variants": {
        const nodes = await idsOf(op, ctx, i);
        if (nodes.some((n) => n.type !== "COMPONENT")) throw badRequest(`${label}: every layer must be a component named like "Prop=Value".`);
        const parent = nodes[0].parent;
        const set = figma.combineAsVariants(nodes, parent);
        if (op.name) set.name = op.name;
        let x = 24;
        for (const c of set.children) {
          c.x = x;
          c.y = 24;
          x += c.width + 24;
        }
        set.resizeWithoutConstraints(x, Math.max(...set.children.map((c) => c.height)) + 48);
        if (op.ref) ctx.refs.set(op.ref, set);
        return { id: set.id, name: set.name, key: set.key };
      }
      case "select": {
        const nodes = await idsOf(op, ctx, i);
        const page = pageOf(nodes[0]);
        if (page && page !== figma.currentPage) await figma.setCurrentPageAsync(page);
        figma.currentPage.selection = nodes;
        if (op.zoom !== false) figma.viewport.scrollAndZoomIntoView(nodes);
        return { selected: nodes.map((n) => n.id) };
      }
      case "page": {
        const name = (_u = (_t = op.name) != null ? _t : op.id) != null ? _u : "";
        let page = figma.root.children.find((pg) => pg.id === name || pg.name.toLowerCase() === name.toLowerCase());
        let created = false;
        if (!page) {
          if (!op.create) throw badRequest(`${label}: no page "${name}" (pass create: true). Pages: ${figma.root.children.map((x) => x.name).join(", ")}.`);
          const r = await ensurePage(name);
          page = r.page;
          created = r.created;
        }
        await figma.setCurrentPageAsync(page);
        if (op.background !== void 0) {
          const c = parseColor(String(op.background));
          if (!c) throw badRequest(`${label}.background: "${op.background}" is not a color (e.g. "#D4D4D8").`);
          setCanvas(page, { r: c.r, g: c.g, b: c.b });
        }
        return { page: { id: page.id, name: page.name }, created };
      }
      case "group": {
        const nodes = await idsOf(op, ctx, i);
        const parent = nodes[0].parent;
        const g2 = figma.group(nodes, parent);
        if (op.name) g2.name = op.name;
        if (op.ref) ctx.refs.set(op.ref, g2);
        return { id: g2.id };
      }
      case "ungroup": {
        const nodes = await idsOf(op, ctx, i);
        const out = [];
        for (const n of nodes) {
          if (n.type !== "GROUP") throw badRequest(`${label}: ${n.id} is not a group.`);
          out.push(...figma.ungroup(n).map((c) => c.id));
        }
        return { ids: out };
      }
      case "flatten": {
        const nodes = await idsOf(op, ctx, i);
        const v = figma.flatten(nodes);
        if (op.name) v.name = op.name;
        return { id: v.id };
      }
      case "boolean": {
        const nodes = await idsOf(op, ctx, i);
        const parent = nodes[0].parent;
        const fn = { union: figma.union, subtract: figma.subtract, intersect: figma.intersect, exclude: figma.exclude }[(_v = op.operation) != null ? _v : "union"];
        const first = nodes[0];
        const fills = Array.isArray(first.fills) ? JSON.parse(JSON.stringify(first.fills)) : null;
        const b = fn.call(figma, nodes, parent);
        if (fills && fills.length) b.fills = fills;
        if (op.name) b.name = op.name;
        return { id: b.id };
      }
    }
    throw badRequest(`${label}: unknown op.`);
  }

  // src/plugin/execute.ts
  function isNode(v) {
    return !!v && typeof v === "object" && "id" in v && "type" in v && typeof v.type === "string" && "removed" in v;
  }
  function toPlain(v, depth = 0, seen = /* @__PURE__ */ new Set()) {
    if (v === null || v === void 0 || typeof v === "boolean" || typeof v === "number") return v;
    if (typeof v === "string") return v.length > 2e4 ? v.slice(0, 2e4) + "\u2026(truncated)" : v;
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "function") return "[function]";
    if (typeof v === "symbol") return v === figma.mixed ? "[mixed]" : String(v);
    if (isNode(v)) return v.removed ? { id: v.id, removed: true } : { id: v.id, name: v.name, type: v.type };
    if (v instanceof Uint8Array) return `[${v.length} bytes]`;
    if (depth > 6) return "[\u2026]";
    if (typeof v === "object") {
      if (seen.has(v)) return "[circular]";
      seen.add(v);
      if (Array.isArray(v)) {
        const arr = v.slice(0, 500).map((x) => toPlain(x, depth + 1, seen));
        if (v.length > 500) arr.push(`\u2026(${v.length - 500} more)`);
        return arr;
      }
      if (v instanceof Map) return toPlain(Object.fromEntries(v), depth + 1, seen);
      if (v instanceof Set) return toPlain([...v], depth + 1, seen);
      if (v instanceof Error) return { error: v.message };
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = toPlain(val, depth + 1, seen);
      return out;
    }
    return String(v);
  }
  function fmt(a) {
    if (typeof a === "string") return a;
    try {
      return JSON.stringify(toPlain(a));
    } catch (e) {
      return String(a);
    }
  }
  function helpers(ctx, logs) {
    const node = async (idOrNode) => typeof idOrNode === "string" ? ctx.sceneNode(idOrNode) : idOrNode;
    return {
      /** await h.node("12:34") — throws a clear error if missing (never hangs). */
      node,
      /** Declarative build, same spec as the build tool (icons/images need the build tool). */
      build: async (spec, opts = {}) => {
        const issues = newIssues();
        const s = normalizeSpec(spec, "spec", issues);
        if (issues.errors.length) throw badRequest(issues.errors.join("\n"));
        return build(s, __spreadValues({ focus: false }, opts), ctx);
      },
      /** Apply build-style props to an existing node: await h.set(node, {fill: "$color/bg", pad: 16}). */
      set: async (target, props) => {
        const issues = newIssues();
        const s = normalizeSpec(props, "props", issues, { partial: true });
        if (issues.errors.length) throw badRequest(issues.errors.join("\n"));
        const n = await node(target);
        await applyProps(n, s, { font: {} }, ctx, "props", { isNew: false });
        return n;
      },
      loadFonts: async (target) => ctx.loadFontsIn(await node(target)),
      font: async (family, weight, italic) => {
        const f = await ctx.resolveFont(family, weight, italic);
        await ctx.loadFont(f);
        return f;
      },
      variable: (name) => ctx.variable(name),
      component: (name) => ctx.component(name),
      style: (name, type) => ctx.style(name, type),
      /** h.solid("#2563EB", 0.5) → SolidPaint */
      solid: (color, opacity) => {
        const c = parseColor(color);
        if (!c) throw badRequest(`bad color ${color}`);
        return { type: "SOLID", color: { r: c.r, g: c.g, b: c.b }, opacity: opacity != null ? opacity : c.a };
      },
      hex: (c) => toHex(c),
      /** Bind a COLOR variable as the node's only fill. */
      bindFill: async (target, varName2) => {
        const n = await node(target);
        const v = await ctx.variable(varName2, "COLOR");
        const val = await ctx.resolveVariableValue(v);
        n.fills = [figma.variables.setBoundVariableForPaint({ type: "SOLID", color: { r: val.r, g: val.g, b: val.b } }, "color", v)];
        return n;
      },
      /** Bind a FLOAT variable to a numeric field (itemSpacing, paddingLeft, topLeftRadius, width…). */
      bind: async (target, field, varName2) => {
        const n = await node(target);
        n.setBoundVariable(field, await ctx.variable(varName2));
        return n;
      },
      focus: (nodes) => {
        const list = Array.isArray(nodes) ? nodes : [nodes];
        figma.currentPage.selection = list;
        figma.viewport.scrollAndZoomIntoView(list);
      },
      /** Move a top-level node to free canvas space (right of existing content). */
      place: (n) => {
        const spot = freeSpot(figma.currentPage, n);
        n.x = spot.x;
        n.y = spot.y;
        return n;
      },
      inspect: async (target) => nodeDetails(await node(target)),
      /** Delete the way the user wants: move to the Trash page (restorable). Never node.remove() user content. */
      trash: async (targets) => {
        const list = Array.isArray(targets) ? targets : [targets];
        return trashNodes(await Promise.all(list.map((t) => node(t))));
      },
      /** A page by English name, created on first use (reuses an untouched "Page 1"); switches to it. */
      page: async (name) => {
        const { page } = await ensurePage(name);
        if (page !== figma.currentPage) await figma.setCurrentPageAsync(page);
        return page;
      },
      log: (...a) => {
        logs.push(a.map(fmt).join(" "));
      }
    };
  }
  async function execute(p) {
    var _a, _b, _c, _d;
    if (typeof p.code !== "string" || !p.code.trim()) throw badRequest("code is empty.");
    const ctx = new Ctx();
    const logs = [];
    const h = helpers(ctx, logs);
    const shim = {
      log: (...a) => logs.push(a.map(fmt).join(" ")),
      info: (...a) => logs.push(a.map(fmt).join(" ")),
      warn: (...a) => logs.push("warn: " + a.map(fmt).join(" ")),
      error: (...a) => logs.push("error: " + a.map(fmt).join(" "))
    };
    let fn;
    try {
      fn = (0, eval)(`(async function (figma, h, console, params) {
${p.code}
})`);
    } catch (e) {
      throw badRequest(`Syntax error: ${e instanceof Error ? e.message : e}. Write plain JavaScript (top-level await and return are fine; no TypeScript).`);
    }
    const timeoutMs = Math.max(1e3, Math.min((_a = p.timeoutMs) != null ? _a : 6e4, 3e5));
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Script still running after ${timeoutMs} ms (it may keep running in Figma). Check the canvas before retrying.`)), timeoutMs);
    });
    try {
      const result = await Promise.race([fn(figma, h, shim, (_b = p.params) != null ? _b : {}), timeout]);
      return { result: toPlain(result), logs, warnings: ctx.warnings };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      const line = (_d = (_c = err.stack) == null ? void 0 : _c.match(/<anonymous>:(\d+):\d+/)) == null ? void 0 : _d[1];
      err.details = __spreadValues({ logs }, line ? { line: Number(line) - 1 } : {});
      throw err;
    } finally {
      if (timer !== void 0) clearTimeout(timer);
    }
  }

  // src/plugin/export.ts
  async function screenshot(p) {
    var _a, _b, _c, _d, _e;
    const ctx = new Ctx();
    let nodes = [];
    const ids = ((_a = p.nodeIds) == null ? void 0 : _a.length) ? p.nodeIds : p.nodeId ? [p.nodeId] : [];
    if (ids.length) for (const id of ids.slice(0, 6)) nodes.push(await ctx.sceneNode(id));
    else if (figma.currentPage.selection.length) nodes = figma.currentPage.selection.slice(0, 6);
    else throw badRequest("Pass nodeId (or select a layer in Figma). Use get_metadata to find ids.");
    const maxPx = (_b = p.maxPx) != null ? _b : 1280;
    const out = [];
    for (const n of nodes) {
      const longest = Math.max(n.width, n.height, 1);
      const scale = Math.max(0.05, Math.min((_c = p.scale) != null ? _c : 2, maxPx / longest));
      try {
        const bytes = await deadline(n.exportAsync({ format: (_d = p.format) != null ? _d : "PNG", constraint: { type: "SCALE", value: scale } }), 3e4, `rendering "${n.name}"`);
        out.push({ nodeId: n.id, name: n.name, type: n.type, w: Math.round(n.width), h: Math.round(n.height), scale: Math.round(scale * 1e3) / 1e3, format: (_e = p.format) != null ? _e : "PNG", data: figma.base64Encode(bytes) });
      } catch (e) {
        out.push({ nodeId: n.id, name: n.name, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { images: out };
  }
  function deadline(work, ms, what) {
    let timer;
    const late = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} took longer than ${Math.round(ms / 1e3)}s \u2014 skipped`)), ms);
    });
    const done = () => timer !== void 0 && clearTimeout(timer);
    return Promise.race([work, late]).then(
      (v) => {
        done();
        return v;
      },
      (e) => {
        done();
        throw e;
      }
    );
  }
  function sniff(bytes) {
    if (bytes[0] === 137 && bytes[1] === 80) return "png";
    if (bytes[0] === 255 && bytes[1] === 216) return "jpg";
    if (bytes[0] === 71 && bytes[1] === 73) return "gif";
    if (bytes[8] === 87 && bytes[9] === 69) return "webp";
    return "bin";
  }
  async function exportNodes(p) {
    var _a, _b, _c, _d, _e;
    const ctx = new Ctx();
    if (!((_a = p.items) == null ? void 0 : _a.length)) throw badRequest("items is empty.");
    const out = [];
    for (const item of p.items.slice(0, 60)) {
      const n = await ctx.sceneNode(item.nodeId);
      const name = (_b = item.name) != null ? _b : n.name;
      try {
        if (item.original) {
          const fills = "fills" in n && Array.isArray(n.fills) ? n.fills : [];
          const img = fills.find((f) => f.type === "IMAGE" && f.imageHash);
          if (img == null ? void 0 : img.imageHash) {
            const image = figma.getImageByHash(img.imageHash);
            const bytes2 = image ? await deadline(image.getBytesAsync(), 2e4, `reading the image of "${n.name}"`).catch(() => null) : null;
            if (bytes2) {
              out.push({ nodeId: n.id, name, ext: sniff(bytes2), data: figma.base64Encode(bytes2) });
              continue;
            }
          }
        }
        const format = (_c = item.format) != null ? _c : "PNG";
        let bytes;
        const what = `exporting "${n.name}" as ${format}`;
        if (format === "SVG") bytes = await deadline(n.exportAsync({ format: "SVG", svgOutlineText: (_d = item.outlineText) != null ? _d : true, svgIdAttribute: false, svgSimplifyStroke: true }), 3e4, what);
        else if (format === "PDF") bytes = await deadline(n.exportAsync({ format: "PDF" }), 3e4, what);
        else bytes = await deadline(n.exportAsync({ format, constraint: { type: "SCALE", value: (_e = item.scale) != null ? _e : 2 } }), 3e4, what);
        out.push({ nodeId: n.id, name, ext: format.toLowerCase(), data: figma.base64Encode(bytes) });
      } catch (e) {
        out.push({ nodeId: n.id, name, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { files: out };
  }

  // src/plugin/extract.ts
  var PATH_TYPES = /* @__PURE__ */ new Set(["VECTOR", "BOOLEAN_OPERATION", "STAR", "POLYGON"]);
  var SHAPE_TYPES = /* @__PURE__ */ new Set(["VECTOR", "BOOLEAN_OPERATION", "STAR", "POLYGON", "ELLIPSE", "RECTANGLE", "LINE"]);
  function isStyledContainer(n) {
    if (!("children" in n) || n.type === "BOOLEAN_OPERATION") return false;
    const f = n;
    if ("layoutMode" in f && f.layoutMode !== "NONE") return true;
    const visible = (list) => Array.isArray(list) && list.some((p) => p.visible !== false);
    return "fills" in f && visible(f.fills) || "strokes" in f && visible(f.strokes) || "effects" in f && visible(f.effects);
  }
  function isVectorAsset(n) {
    if (isStyledContainer(n)) return false;
    let hasPath = false;
    const ok = (x) => {
      if (x.type === "TEXT") return false;
      if ("fills" in x && Array.isArray(x.fills) && x.fills.some((f) => f.type === "IMAGE")) return false;
      if (PATH_TYPES.has(x.type)) {
        hasPath = true;
        return true;
      }
      if (SHAPE_TYPES.has(x.type)) return true;
      if ("children" in x) return x.children.length > 0 && !(x !== n && isStyledContainer(x)) && x.children.every((c) => !c.visible || ok(c));
      return false;
    };
    const res = ok(n);
    return res && hasPath;
  }
  function fmtLh(lh) {
    return lh.unit === "AUTO" ? "auto" : lh.unit === "PERCENT" ? `${round(lh.value, 1)}%` : round(lh.value, 2);
  }
  function fmtLs(ls) {
    return ls.unit === "PERCENT" ? `${round(ls.value, 2)}%` : round(ls.value, 2);
  }
  var Extractor = class {
    constructor(p) {
      __publicField(this, "vars", /* @__PURE__ */ new Map());
      __publicField(this, "varById", /* @__PURE__ */ new Map());
      __publicField(this, "styles", /* @__PURE__ */ new Map());
      __publicField(this, "components", /* @__PURE__ */ new Map());
      __publicField(this, "assets", []);
      __publicField(this, "assetNames", /* @__PURE__ */ new Set());
      __publicField(this, "fonts", /* @__PURE__ */ new Set());
      __publicField(this, "count", 0);
      __publicField(this, "truncated", false);
      __publicField(this, "mainCache", /* @__PURE__ */ new Map());
      __publicField(this, "p");
      __publicField(this, "assetByKey", /* @__PURE__ */ new Map());
      this.p = p;
    }
    async varName(alias) {
      var _a;
      if (!alias) return void 0;
      const a = Array.isArray(alias) ? alias[0] : alias;
      if (!(a == null ? void 0 : a.id)) return void 0;
      if (this.varById.has(a.id)) return (_a = this.varById.get(a.id)) != null ? _a : void 0;
      const v = await figma.variables.getVariableByIdAsync(a.id);
      if (!v) {
        this.varById.set(a.id, null);
        return void 0;
      }
      this.varById.set(a.id, v.name);
      if (!this.vars.has(v.name)) await this.recordVar(v);
      return v.name;
    }
    async recordVar(v) {
      var _a;
      const coll = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
      const fmt2 = async (val, depth = 0) => {
        if (val && typeof val === "object" && "type" in val && val.type === "VARIABLE_ALIAS") {
          const t = await figma.variables.getVariableByIdAsync(val.id);
          return t ? `$${t.name}` : "$?";
        }
        if (val && typeof val === "object" && "r" in val) return toHex(val);
        return val;
      };
      const resolve = async (vv, modeId, depth = 0) => {
        var _a2;
        const c = await figma.variables.getVariableCollectionByIdAsync(vv.variableCollectionId);
        const mid = modeId && modeId in vv.valuesByMode ? modeId : (_a2 = c == null ? void 0 : c.defaultModeId) != null ? _a2 : Object.keys(vv.valuesByMode)[0];
        const val = vv.valuesByMode[mid];
        if (val && typeof val === "object" && "type" in val && val.type === "VARIABLE_ALIAS" && depth < 10) {
          const t = await figma.variables.getVariableByIdAsync(val.id);
          return t ? resolve(t, void 0, depth + 1) : "?";
        }
        return fmt2(val);
      };
      const modes = {};
      if (coll && coll.modes.length > 1) for (const m of coll.modes) modes[m.name] = await resolve(v, m.modeId);
      const web = v.codeSyntax.WEB;
      const css = web ? web.replace(/^var\((.*)\)$/, "$1").trim() : `--${kebab(v.name)}`;
      this.vars.set(v.name, {
        name: v.name,
        collection: (_a = coll == null ? void 0 : coll.name) != null ? _a : "?",
        type: v.resolvedType,
        css,
        value: await resolve(v, coll == null ? void 0 : coll.defaultModeId),
        modes: Object.keys(modes).length ? modes : void 0
      });
    }
    async styleName(id, type) {
      if (!id || id === figma.mixed) return void 0;
      const s = await figma.getStyleByIdAsync(id);
      if (!s) return void 0;
      this.styles.set(s.name, { type, name: s.name });
      return s.name;
    }
    async paints(list) {
      var _a, _b, _c, _d;
      if (list === figma.mixed) return void 0;
      const out = [];
      for (const p of list) {
        if (p.visible === false) continue;
        if (p.type === "SOLID") {
          const v = await this.varName((_a = p.boundVariables) == null ? void 0 : _a.color);
          out.push(__spreadValues({ t: "solid", c: toHex(p.color, (_b = p.opacity) != null ? _b : 1) }, v ? { v } : {}));
        } else if (p.type === "GRADIENT_LINEAR" || p.type === "GRADIENT_RADIAL" || p.type === "GRADIENT_ANGULAR" || p.type === "GRADIENT_DIAMOND") {
          const stops = [];
          for (const s of p.gradientStops) {
            const v = await this.varName((_c = s.boundVariables) == null ? void 0 : _c.color);
            stops.push(__spreadValues({ c: toHex(s.color, s.color.a * ((_d = p.opacity) != null ? _d : 1)), p: round(s.position, 3) }, v ? { v } : {}));
          }
          const kind = p.type.replace("GRADIENT_", "").toLowerCase();
          out.push(__spreadProps(__spreadValues({ t: "gradient", kind }, kind === "linear" ? { angle: angleOf(p.gradientTransform) } : {}), { stops }));
        } else if (p.type === "IMAGE" && p.imageHash) {
          out.push({ t: "image", ref: p.imageHash, fit: p.scaleMode.toLowerCase() });
        }
      }
      return out.length ? out : void 0;
    }
    async effects(list) {
      var _a, _b;
      const out = [];
      for (const e of list) {
        if (!e.visible) continue;
        if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
          const v = await this.varName((_a = e.boundVariables) == null ? void 0 : _a.color);
          out.push(__spreadValues({ t: e.type === "DROP_SHADOW" ? "shadow" : "inner", x: e.offset.x, y: e.offset.y, blur: e.radius, spread: (_b = e.spread) != null ? _b : 0, c: toHex(e.color, e.color.a) }, v ? { v } : {}));
        } else if (e.type === "LAYER_BLUR" || e.type === "BACKGROUND_BLUR") {
          out.push({ t: e.type === "LAYER_BLUR" ? "blur" : "bg-blur", r: e.radius });
        }
      }
      return out.length ? out : void 0;
    }
    /** One asset per image (same IMG id or same image hash), however many layers show it. */
    sharedAsset(n, key, make) {
      if (!key) return make();
      const known = this.assetByKey.get(key);
      if (known) return known;
      const id = make();
      this.assetByKey.set(key, id);
      return id;
    }
    addAsset(n, kind, baseName, imageHash, pending) {
      let name = kebab(baseName.replace(/^icon\//, "icon-")) || kind;
      let i = 2;
      const base = name;
      while (this.assetNames.has(name)) name = `${base}-${i++}`;
      this.assetNames.add(name);
      this.assets.push(__spreadValues({ id: name, nodeId: n.id, name, kind, w: round(n.width, 1), h: round(n.height, 1), imageHash }, pending ? { pending } : {}));
      return name;
    }
    async mainOf(inst) {
      if (this.mainCache.has(inst.id)) return this.mainCache.get(inst.id);
      const m = await inst.getMainComponentAsync();
      this.mainCache.set(inst.id, m);
      return m;
    }
    async node(n, depth, parentAL) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
      if (!n.visible && !this.p.includeHidden) return null;
      if (isChrome(n)) return null;
      this.count++;
      const x = {
        id: n.id,
        name: n.name,
        type: n.type.toLowerCase().replace("rectangle", "rect").replace("boolean_operation", "boolean"),
        x: round(n.x, 1),
        y: round(n.y, 1),
        w: round(n.width, 1),
        h: round(n.height, 1)
      };
      if (!n.visible) x.hidden = true;
      const vars = {};
      const bv = (_a = n.boundVariables) != null ? _a : {};
      for (const [field, alias] of Object.entries(bv)) {
        if (["fills", "strokes", "effects", "componentProperties", "textRangeFills", "layoutGrids"].includes(field)) continue;
        const name = await this.varName(alias);
        if (name) vars[field] = name;
      }
      if ("layoutMode" in n && n.layoutMode !== "NONE") {
        const f = n;
        const dir = f.layoutMode === "HORIZONTAL" ? "row" : f.layoutMode === "VERTICAL" ? "column" : "grid";
        const between = f.layoutMode !== "GRID" && f.primaryAxisAlignItems === "SPACE_BETWEEN";
        x.layout = __spreadValues(__spreadValues(__spreadProps(__spreadValues({
          dir
        }, dir === "grid" ? { rowGap: f.gridRowGap, colGap: f.gridColumnGap, cols: f.gridColumnCount, rows: f.gridRowCount } : between ? { between: true } : { gap: f.itemSpacing }), {
          pad: [f.paddingTop, f.paddingRight, f.paddingBottom, f.paddingLeft]
        }), dir !== "grid" ? {
          justify: { MIN: "start", CENTER: "center", MAX: "end", SPACE_BETWEEN: "between", SPACE_AROUND: "around", SPACE_EVENLY: "evenly" }[f.primaryAxisAlignItems],
          align: { MIN: "start", CENTER: "center", MAX: "end", BASELINE: "baseline" }[f.counterAxisAlignItems]
        } : {}), f.layoutWrap === "WRAP" ? { wrap: true, rowGap: (_b = f.counterAxisSpacing) != null ? _b : void 0 } : {});
      }
      const isAL = !!x.layout;
      if (parentAL || isAL) {
        const c = n;
        x.sizing = { w: c.layoutSizingHorizontal.toLowerCase(), h: c.layoutSizingVertical.toLowerCase() };
        if (parentAL && c.layoutPositioning === "ABSOLUTE") x.abs = true;
      }
      if ((!parentAL || x.abs) && "constraints" in n) {
        const c = n.constraints;
        x.constraints = { h: c.horizontal.toLowerCase(), v: c.vertical.toLowerCase() };
      }
      if ("minWidth" in n) {
        const m = n;
        if (m.minWidth != null || m.minHeight != null) x.min = __spreadValues(__spreadValues({}, m.minWidth != null ? { w: m.minWidth } : {}), m.minHeight != null ? { h: m.minHeight } : {});
        if (m.maxWidth != null || m.maxHeight != null) x.max = __spreadValues(__spreadValues({}, m.maxWidth != null ? { w: m.maxWidth } : {}), m.maxHeight != null ? { h: m.maxHeight } : {});
      }
      if (n.parent && "layoutMode" in n.parent && n.parent.layoutMode === "GRID") {
        const g2 = n;
        try {
          x.cell = { row: g2.gridRowAnchorIndex, col: g2.gridColumnAnchorIndex, rowSpan: g2.gridRowSpan, colSpan: g2.gridColumnSpan };
        } catch (e) {
        }
      }
      const styles = {};
      if ("fills" in n && n.type !== "TEXT") {
        const fs = await this.styleName(n.fillStyleId, "paint");
        if (fs) styles.fill = fs;
        const fills = await this.paints(n.fills);
        if (fills) x.fills = fills;
      }
      const mockup = hasMockup(n);
      if ("strokes" in n && n.strokes.length && !mockup) {
        const s = n;
        const st = await this.styleName(s.strokeStyleId, "paint");
        if (st) styles.stroke = st;
        const strokes = await this.paints(s.strokes);
        if (strokes) {
          x.strokes = strokes;
          const sw = s.strokeWeight;
          if (sw === figma.mixed && "strokeTopWeight" in n) {
            const i = n;
            x.strokeW = [i.strokeTopWeight, i.strokeRightWeight, i.strokeBottomWeight, i.strokeLeftWeight];
          } else if (typeof sw === "number") x.strokeW = sw;
          x.strokeAlign = s.strokeAlign.toLowerCase();
          if (s.dashPattern.length) x.dash = [...s.dashPattern];
        }
      }
      if ("cornerRadius" in n && !mockup) {
        const r = n.cornerRadius;
        if (r === figma.mixed && "topLeftRadius" in n) {
          const c = n;
          x.radius = [c.topLeftRadius, c.topRightRadius, c.bottomRightRadius, c.bottomLeftRadius];
        } else if (typeof r === "number" && r > 0) x.radius = r;
      }
      if ("effects" in n && n.effects.length) {
        const es = await this.styleName(n.effectStyleId, "effect");
        if (es) styles.effect = es;
        const e = await this.effects(n.effects);
        if (e) x.effects = e;
      }
      if ("opacity" in n && n.opacity < 1) x.opacity = round(n.opacity, 3);
      if ("blendMode" in n && !["NORMAL", "PASS_THROUGH"].includes(n.blendMode)) x.blend = n.blendMode.toLowerCase().replace(/_/g, "-");
      if ("clipsContent" in n && n.clipsContent && "children" in n && n.children.length) x.clip = true;
      if ("rotation" in n && Math.abs(n.rotation) > 0.01) x.rotation = round(n.rotation, 2);
      if (n.type === "TEXT") {
        const ts = await this.styleName(n.textStyleId, "text");
        if (ts) styles.text = ts;
        const fsn = await this.styleName(n.fillStyleId, "paint");
        if (fsn) styles.fill = fsn;
        const segs = n.getStyledTextSegments(["fontName", "fontSize", "fontWeight", "textDecoration", "textCase", "lineHeight", "letterSpacing", "fills", "hyperlink"]);
        const base = segs[0];
        const font = (s) => __spreadValues(__spreadValues(__spreadProps(__spreadValues({
          family: s.fontName.family,
          style: s.fontName.style,
          weight: s.fontWeight
        }, /italic|oblique/i.test(s.fontName.style) ? { italic: true } : {}), {
          size: s.fontSize,
          lh: fmtLh(s.lineHeight),
          ls: fmtLs(s.letterSpacing)
        }), s.textCase !== "ORIGINAL" ? { case: s.textCase.toLowerCase() } : {}), s.textDecoration !== "NONE" ? { deco: s.textDecoration.toLowerCase() } : {});
        for (const s of segs) this.fonts.add(`${s.fontName.family} ${s.fontName.style}`);
        x.text = __spreadValues({
          chars: n.characters,
          font: font(base),
          align: n.textAlignHorizontal.toLowerCase(),
          valign: n.textAlignVertical.toLowerCase(),
          autoResize: n.textAutoResize.toLowerCase()
        }, n.textTruncation === "ENDING" ? { maxLines: (_c = n.maxLines) != null ? _c : 1 } : {});
        x.fills = await this.paints(base.fills);
        if (segs.length > 1) {
          const b = font(base);
          x.text.segs = [];
          for (const s of segs) {
            const f = font(s);
            const diff = {};
            for (const k of Object.keys(f)) if (JSON.stringify(f[k]) !== JSON.stringify(b[k])) diff[k] = f[k];
            const fills = await this.paints(s.fills);
            x.text.segs.push(__spreadValues(__spreadValues(__spreadValues({
              chars: s.characters
            }, Object.keys(diff).length ? { font: diff } : {}), JSON.stringify(fills) !== JSON.stringify(x.fills) ? { fills } : {}), s.hyperlink && s.hyperlink.type === "URL" ? { link: s.hyperlink.value } : {}));
          }
        } else if (base.hyperlink && base.hyperlink.type === "URL") x.text.link = base.hyperlink.value;
      }
      if (Object.keys(styles).length) x.styles = styles;
      if (Object.keys(vars).length) x.vars = vars;
      let descend = "children" in n;
      if (n.type === "INSTANCE") {
        const main = await this.mainOf(n);
        const owner = ((_d = main == null ? void 0 : main.parent) == null ? void 0 : _d.type) === "COMPONENT_SET" ? main.parent : main;
        if (owner) {
          const props = {};
          for (const [k, v] of Object.entries(n.componentProperties)) if (v.type !== "VARIANT") props[k.split("#")[0]] = v.value;
          x.comp = __spreadValues(__spreadValues({ kind: "instance", name: owner.name }, (main == null ? void 0 : main.variantProperties) ? { variant: main.variantProperties } : {}), Object.keys(props).length ? { props } : {});
          if (!this.components.has(owner.name)) {
            let defs;
            try {
              const d = owner.componentPropertyDefinitions;
              defs = Object.fromEntries(Object.entries(d).map(([k, def]) => [k.split("#")[0], def.type === "VARIANT" ? { type: "variant", options: def.variantOptions } : { type: def.type.toLowerCase(), default: def.defaultValue }]));
            } catch (e) {
              defs = void 0;
            }
            this.components.set(owner.name, { name: owner.name, key: owner.key, description: owner.description || void 0, props: defs, remote: owner.remote || void 0 });
          }
        }
        if (this.p.instances === "reference" && !isVectorAsset(n)) descend = false;
      } else if (n.type === "COMPONENT" || n.type === "COMPONENT_SET") {
        x.comp = { kind: n.type === "COMPONENT" ? "component" : "set", name: n.name, key: n.key };
      }
      const waiting = neededPrompt(n);
      const imageId = n.type === "FRAME" || n.type === "RECTANGLE" ? n.getPluginData("imageId") : "";
      if (waiting !== null) {
        const box = isPlaceholderBox(n);
        x.asset = { kind: "image", id: this.sharedAsset(n, imageId, () => this.addAsset(n, "image", imageId ? `${imageId}-${n.name}` : n.name, void 0, { imageId: imageId || void 0, prompt: waiting || void 0 })) };
        if (!box) x.fills = [{ t: "image", ref: "", fit: "fill" }, ...(_e = x.fills) != null ? _e : []];
        if (box) descend = false;
      } else if (n.type !== "TEXT" && isVectorAsset(n)) {
        const base = (_g = (_f = x.comp) == null ? void 0 : _f.name) != null ? _g : n.name;
        x.asset = { kind: "svg", id: this.addAsset(n, "svg", base) };
        descend = false;
      } else if ((_h = x.fills) == null ? void 0 : _h.some((f) => f.t === "image")) {
        const img = x.fills.find((f) => f.t === "image");
        x.asset = { kind: "image", id: this.sharedAsset(n, imageId || `hash:${img.ref}`, () => this.addAsset(n, "image", imageId ? `${imageId}-${n.name}` : n.name, img.ref)) };
      }
      if ("reactions" in n && n.reactions.length) {
        const rs = [];
        for (const r of n.reactions) {
          const t = (_j = (_i = r.trigger) == null ? void 0 : _i.type) != null ? _j : "NONE";
          for (const a of (_k = r.actions) != null ? _k : []) {
            if (a.type === "NODE") {
              const dest = a.destinationId ? await figma.getNodeByIdAsync(a.destinationId) : null;
              rs.push({ trigger: t.toLowerCase(), action: a.navigation.toLowerCase(), to: (_l = a.destinationId) != null ? _l : void 0, toName: dest == null ? void 0 : dest.name, transition: describeTransition(a.transition) });
            } else if (a.type === "URL") rs.push({ trigger: t.toLowerCase(), action: "url", url: a.url });
            else rs.push({ trigger: t.toLowerCase(), action: a.type.toLowerCase() });
          }
        }
        if (rs.length) x.reactions = rs;
      }
      if (descend && "children" in n) {
        const kids = n.children;
        const max = (_m = this.p.maxNodes) != null ? _m : 1500;
        if (depth >= ((_n = this.p.depth) != null ? _n : 25) || this.count >= max) {
          if (kids.length) {
            x.more = kids.length;
            this.truncated = true;
          }
        } else {
          const out = [];
          for (const c of kids) {
            if (this.count >= max) {
              x.more = kids.length - out.length;
              this.truncated = true;
              break;
            }
            const xc = await this.node(c, depth + 1, isAL);
            if (xc) out.push(xc);
          }
          if (out.length) x.children = out;
        }
      }
      return x;
    }
  };
  async function extract(p) {
    var _a, _b;
    const ctx = new Ctx();
    let target;
    if (p.nodeId) target = await ctx.sceneNode(p.nodeId);
    else if (figma.currentPage.selection.length === 1) target = figma.currentPage.selection[0];
    else if (figma.currentPage.selection.length > 1) throw new Error("Several layers are selected; pass nodeId or select one.");
    else throw new Error("Pass nodeId (or select one layer in Figma).");
    const ex = new Extractor(p);
    const parentAL = !!target.parent && "layoutMode" in target.parent && target.parent.layoutMode !== "NONE";
    const root = await ex.node(target, 0, parentAL);
    const screen = screenOf(target);
    const page = pageOf(target);
    return {
      root,
      context: {
        page: page == null ? void 0 : page.name,
        screen: screen && screen !== target ? { id: screen.id, name: screen.name, w: round(screen.width), h: round(screen.height) } : void 0,
        topLevel: ((_a = target.parent) == null ? void 0 : _a.type) === "PAGE" || ((_b = target.parent) == null ? void 0 : _b.type) === "SECTION",
        parentLayout: parentAL,
        file: figma.root.name
      },
      vars: Object.fromEntries(ex.vars),
      styles: Object.fromEntries(ex.styles),
      components: Object.fromEntries(ex.components),
      assets: ex.assets,
      fonts: [...ex.fonts],
      stats: { nodes: ex.count, truncated: ex.truncated }
    };
  }

  // src/plugin/lint.ts
  var RULES = {
    "contrast": { severity: "error", about: "Text contrast below WCAG AA (4.5:1, or 3:1 for large text)." },
    "text-collapsed": { severity: "error", about: "Text squeezed to ~0 width (parent hugs while text fills)." },
    "clipped-content": { severity: "warn", about: "Content sticks out of a frame that clips it (cut-off text/elements)." },
    "unbound-color": { severity: "warn", about: "Raw color not bound to a variable or style.", fixable: true },
    "text-style": { severity: "warn", about: "Text without a text style or typography variables." },
    "no-autolayout": { severity: "warn", about: "Frame with several children positioned by hand instead of auto layout." },
    "detached": { severity: "warn", about: "Detached component instance." },
    "section-number": { severity: "warn", about: 'Decorative section number ("01 Why us") \u2014 an AI-look clich\xE9; only when the user or the references have it.' },
    "touch-target": { severity: "warn", about: "Interactive layer smaller than 24\xD724 (WCAG 2.2 target size)." },
    "unbound-spacing": { severity: "info", about: "Gap/padding not bound to a spacing variable.", fixable: true },
    "unbound-radius": { severity: "info", about: "Corner radius not bound to a radius variable.", fixable: true },
    "off-grid": { severity: "info", about: "Spacing not on the spacing grid (default 4)." },
    "default-name": { severity: "info", about: 'Generic layer name ("Frame 12").' },
    "group": { severity: "info", about: "Group used as a container (prefer frames with auto layout)." },
    "empty-frame": { severity: "info", about: "Empty frame with no fill or stroke." },
    "hidden": { severity: "info", about: "Hidden layer left in the design." },
    "placeholder": { severity: "info", about: "Image placeholder still waiting for the real image." }
  };
  var DEFAULT_NAME = /^(Frame|Rectangle|Ellipse|Group|Vector|Line|Polygon|Star|Component|Instance|Section|Image|Union|Subtract|Intersect|Exclude|Text|Auto layout|Container)( \d+)?$/i;
  async function variableIndex() {
    const ctx = new Ctx();
    const vars = await figma.variables.getLocalVariablesAsync();
    const colors = [];
    const floats = [];
    for (const v of vars) {
      if (!v.scopes.length) continue;
      const coll = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
      const raw = coll ? v.valuesByMode[coll.defaultModeId] : void 0;
      const alias = !!raw && typeof raw === "object" && "type" in raw && raw.type === "VARIABLE_ALIAS";
      const val = await ctx.resolveVariableValue(v);
      if (v.resolvedType === "COLOR" && val && typeof val === "object" && "r" in val) colors.push({ v, value: val, alias });
      if (v.resolvedType === "FLOAT" && typeof val === "number") floats.push({ v, value: val, alias });
    }
    return { colors, floats };
  }
  var scopeOk = (v, wanted) => v.scopes.includes("ALL_SCOPES") || v.scopes.some((s) => wanted.includes(s));
  function pick(cands) {
    if (cands.length === 1) return cands[0];
    const semantic = cands.filter((c) => c.alias);
    if (semantic.length === 1) return semantic[0];
    return null;
  }
  function backgroundOf(n) {
    var _a;
    const layers = [];
    let p = n.parent;
    while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
      if ("fills" in p && Array.isArray(p.fills)) {
        const fills = p.fills.filter((f) => f.visible !== false);
        for (let i = fills.length - 1; i >= 0; i--) {
          const f = fills[i];
          if (f.type === "IMAGE" || f.type.startsWith("GRADIENT")) return null;
          if (f.type === "SOLID") {
            const c = __spreadProps(__spreadValues({}, f.color), { a: (_a = f.opacity) != null ? _a : 1 });
            layers.push(c);
            if (c.a >= 0.99) {
              let base2 = __spreadProps(__spreadValues({}, c), { a: 1 });
              for (let k = layers.length - 2; k >= 0; k--) base2 = composite(layers[k], base2);
              return base2;
            }
          }
        }
      }
      p = p.parent;
    }
    let base = { r: 1, g: 1, b: 1, a: 1 };
    for (let k = layers.length - 1; k >= 0; k--) base = composite(layers[k], base);
    return base;
  }
  async function lint(p) {
    var _a, _b, _c, _d;
    const ctx = new Ctx();
    const roots = [];
    if (p.nodeId) roots.push(await ctx.sceneNode(p.nodeId));
    else if (figma.currentPage.selection.length) roots.push(...figma.currentPage.selection);
    else roots.push(...figma.currentPage.children.filter((c) => c.getPluginData("role") !== "icons"));
    const enabled = new Set(((_a = p.rules) == null ? void 0 : _a.length) ? p.rules : Object.keys(RULES));
    const fixRules = new Set(p.fix === true ? Object.keys(RULES).filter((r) => RULES[r].fixable) : Array.isArray(p.fix) ? p.fix : []);
    const grid = (_b = p.grid) != null ? _b : 4;
    const issues = [];
    const add = (rule, n, message, fixed) => {
      if (!enabled.has(rule)) return;
      issues.push(__spreadValues({ rule, severity: RULES[rule].severity, id: n.id, name: n.name, message }, fixed ? { fixed } : {}));
    };
    const needVars = ["unbound-color", "unbound-spacing", "unbound-radius"].some((r) => enabled.has(r));
    const idx = needVars ? await variableIndex() : { colors: [], floats: [] };
    const hasSpacingVars = idx.floats.some((c) => scopeOk(c.v, ["GAP"]));
    const hasRadiusVars = idx.floats.some((c) => scopeOk(c.v, ["CORNER_RADIUS"]));
    const stats = { nodes: 0, fonts: /* @__PURE__ */ new Map(), fontSizes: /* @__PURE__ */ new Map(), radii: /* @__PURE__ */ new Map(), gaps: /* @__PURE__ */ new Map(), colors: /* @__PURE__ */ new Map() };
    const bump = (m, k) => {
      var _a2;
      return m.set(k, ((_a2 = m.get(k)) != null ? _a2 : 0) + 1);
    };
    const checkPaints = async (n, kind) => {
      var _a2, _b2;
      const node = n;
      const paints2 = node[kind];
      if (!Array.isArray(paints2) || !paints2.length) return;
      const styleId = kind === "fills" ? node.fillStyleId : node.strokeStyleId;
      if (styleId && styleId !== figma.mixed) return;
      const next = [...paints2];
      let changed = false;
      for (let i = 0; i < next.length; i++) {
        const paint2 = next[i];
        if (paint2.type !== "SOLID" || paint2.visible === false || ((_a2 = paint2.boundVariables) == null ? void 0 : _a2.color)) continue;
        const hex = toHex(paint2.color, (_b2 = paint2.opacity) != null ? _b2 : 1);
        bump(stats.colors, hex);
        const wanted = kind === "strokes" ? ["STROKE_COLOR"] : n.type === "TEXT" ? ["TEXT_FILL", "ALL_FILLS"] : n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE" ? ["FRAME_FILL", "ALL_FILLS"] : ["SHAPE_FILL", "ALL_FILLS"];
        const cands = idx.colors.filter((c) => {
          var _a3;
          return scopeOk(c.v, wanted) && toHex(c.value, c.value.a * 1) === toHex(paint2.color, (_a3 = paint2.opacity) != null ? _a3 : 1);
        });
        const choice = pick(cands);
        if (choice && fixRules.has("unbound-color")) {
          const base = { type: "SOLID", color: paint2.color, opacity: 1 };
          next[i] = figma.variables.setBoundVariableForPaint(base, "color", choice.v);
          changed = true;
          add("unbound-color", n, `${kind === "strokes" ? "stroke" : "fill"} ${hex} \u2192 bound to $${choice.v.name}`, true);
        } else {
          const hint = choice ? ` \u2014 matches $${choice.v.name} (run with fix)` : cands.length > 1 ? ` \u2014 matches ${cands.length} variables: ${cands.slice(0, 3).map((c) => "$" + c.v.name).join(", ")}` : "";
          add("unbound-color", n, `${kind === "strokes" ? "stroke" : "fill"} ${hex} is a raw value${hint}`);
        }
      }
      if (changed) {
        if (n.type === "TEXT") await ctx.loadFontsIn(n);
        node[kind] = next;
      }
    };
    const bindFloat = (n, field, value, scope, rule, label) => {
      const cands = idx.floats.filter((c) => scopeOk(c.v, [scope]) && Math.abs(c.value - value) < 0.01);
      const choice = pick(cands);
      if (choice && fixRules.has(rule)) {
        n.setBoundVariable(field, choice.v);
        add(rule, n, `${label} ${value} \u2192 bound to $${choice.v.name}`, true);
        return true;
      }
      if (value !== 0) add(rule, n, `${label} ${value} is a raw value${choice ? ` \u2014 matches $${choice.v.name} (run with fix)` : cands.length ? ` \u2014 ${cands.length} matching variables` : " \u2014 no matching variable"}`);
      return false;
    };
    const visit = async (n, inInstance) => {
      var _a2, _b2, _c2, _d2;
      if (isChrome(n)) return;
      stats.nodes++;
      if (!n.visible) {
        if (!inInstance) add("hidden", n, "hidden layer");
        return;
      }
      const prompt = neededPrompt(n);
      if (prompt !== null) {
        const id = n.getPluginData("imageId");
        add("placeholder", n, prompt ? `waits for its image${id ? ` ${id}` : ""} \u2014 list it with image_prompts` : "image placeholder without a prompt \u2014 set {prompt} so it can be generated");
        if (isPlaceholderBox(n)) return;
      }
      const tokenRules = !inInstance && n.type !== "INSTANCE";
      if (tokenRules && DEFAULT_NAME.test(n.name) && n.type !== "TEXT") add("default-name", n, `generic name "${n.name}"`);
      if (tokenRules && n.type === "GROUP" && n.children.length > 1 && !isVectorOnly(n)) add("group", n, "group used as a container");
      if (tokenRules && "detachedInfo" in n && n.detachedInfo) add("detached", n, "detached from its component");
      if (tokenRules && "fills" in n) await checkPaints(n, "fills");
      if (tokenRules && "strokes" in n && !hasMockup(n)) await checkPaints(n, "strokes");
      if ("layoutMode" in n) {
        const f = n;
        const kids = "children" in f ? f.children.filter((c) => c.visible) : [];
        if (tokenRules && f.layoutMode === "NONE" && kids.length >= 2 && n.type !== "COMPONENT_SET" && !isVectorOnly(n)) {
          add("no-autolayout", n, `${kids.length} children positioned by hand`);
        }
        if (tokenRules && f.layoutMode !== "NONE") {
          const bv = (_a2 = f.boundVariables) != null ? _a2 : {};
          const fields = [];
          if (f.primaryAxisAlignItems !== "SPACE_BETWEEN" && f.layoutMode !== "GRID") fields.push(["itemSpacing", f.itemSpacing, "gap"]);
          fields.push(["paddingTop", f.paddingTop, "padding-top"], ["paddingRight", f.paddingRight, "padding-right"], ["paddingBottom", f.paddingBottom, "padding-bottom"], ["paddingLeft", f.paddingLeft, "padding-left"]);
          for (const [field, value, label] of fields) {
            if (bv[field]) continue;
            if (field === "itemSpacing") bump(stats.gaps, value);
            if (value % grid !== 0) add("off-grid", n, `${label} ${value} is not a multiple of ${grid}`);
            if (hasSpacingVars) bindFloat(n, field, value, "GAP", "unbound-spacing", label);
          }
        }
        if (tokenRules && n.type === "FRAME" && !kids.length && !f.fills.some((x) => x.visible !== false) && !f.strokes.length) add("empty-frame", n, "empty frame");
        if (f.clipsContent && kids.length) {
          for (const c of kids) {
            if (c.x < -0.5 || c.y < -0.5 || c.x + c.width > f.width + 0.5 || c.y + c.height > f.height + 0.5) {
              add("clipped-content", c, `extends outside "${f.name}" which clips it (${round(c.x)},${round(c.y)} ${round(c.width)}\xD7${round(c.height)} in ${round(f.width)}\xD7${round(f.height)})`);
              break;
            }
          }
        }
      }
      if (tokenRules && "cornerRadius" in n && !hasMockup(n)) {
        const r = n.cornerRadius;
        const bv = (_b2 = n.boundVariables) != null ? _b2 : {};
        if (typeof r === "number" && r > 0 && !bv.topLeftRadius) {
          bump(stats.radii, r);
          if (hasRadiusVars && "topLeftRadius" in n) {
            const cands = idx.floats.filter((c) => scopeOk(c.v, ["CORNER_RADIUS"]) && Math.abs(c.value - r) < 0.01);
            const choice = pick(cands);
            if (choice && fixRules.has("unbound-radius")) {
              for (const f of ["topLeftRadius", "topRightRadius", "bottomRightRadius", "bottomLeftRadius"]) n.setBoundVariable(f, choice.v);
              add("unbound-radius", n, `radius ${r} \u2192 bound to $${choice.v.name}`, true);
            } else add("unbound-radius", n, `radius ${r} is a raw value${choice ? ` \u2014 matches $${choice.v.name} (run with fix)` : ""}`);
          }
        }
      }
      if (n.type === "TEXT") {
        const fontName = n.fontName;
        if (fontName !== figma.mixed) bump(stats.fonts, fontName.family);
        if (n.fontSize !== figma.mixed) bump(stats.fontSizes, n.fontSize);
        if (tokenRules && !n.textStyleId && !((_c2 = n.boundVariables) == null ? void 0 : _c2.fontSize)) add("text-style", n, `no text style (${fontName !== figma.mixed ? `${fontName.family} ${fontName.style}` : "mixed"} ${n.fontSize !== figma.mixed ? n.fontSize : ""})`);
        if (n.width < 2 && n.characters.trim().length > 0) add("text-collapsed", n, `text is ${round(n.width, 1)}px wide`);
        if (isSectionNumber(n.characters)) add("section-number", n, `"${n.characters.trim()}" numbers a section as decoration \u2014 remove the number (and any marker square/dot/line beside it) unless the user or the references asked for it`);
        if (enabled.has("contrast") && Array.isArray(n.fills)) {
          const solid = n.fills.find((f) => f.visible !== false && f.type === "SOLID");
          const bg = backgroundOf(n);
          if (solid && bg) {
            const fg = composite(__spreadProps(__spreadValues({}, solid.color), { a: ((_d2 = solid.opacity) != null ? _d2 : 1) * ("opacity" in n ? n.opacity : 1) }), bg);
            const ratio = contrastRatio(fg, bg);
            const size2 = n.fontSize !== figma.mixed ? n.fontSize : 16;
            const weight = typeof n.fontWeight === "number" ? n.fontWeight : 400;
            const large = size2 >= 24 || size2 >= 18.66 && weight >= 700;
            const min = large ? 3 : 4.5;
            if (ratio < min) add("contrast", n, `contrast ${round(ratio, 2)}:1 (${toHex(fg)} on ${toHex(bg)}), needs ${min}:1`);
          }
        }
      }
      if ("reactions" in n && n.reactions.length && (n.width < 24 || n.height < 24)) add("touch-target", n, `interactive layer is ${round(n.width)}\xD7${round(n.height)}`);
      if ("children" in n && !(tokenRules && isVectorOnly(n))) {
        for (const c of n.children) if (c.getPluginData("role") !== "icons") await visit(c, inInstance || n.type === "INSTANCE");
      }
    };
    for (const r of roots) await visit(r, false);
    const limit = (_c = p.limit) != null ? _c : 80;
    const order = { error: 0, warn: 1, info: 2 };
    issues.sort((a, b) => order[a.severity] - order[b.severity]);
    const summary = {};
    for (const i of issues) summary[i.rule] = ((_d = summary[i.rule]) != null ? _d : 0) + 1;
    const top = (m, n = 12) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${k}\xD7${c}`);
    return {
      scope: roots.map((r) => ({ id: r.id, name: r.name })),
      summary,
      fixed: issues.filter((i) => i.fixed).length,
      issues: issues.slice(0, limit),
      more: Math.max(0, issues.length - limit),
      stats: {
        nodes: stats.nodes,
        fontFamilies: top(stats.fonts),
        fontSizes: top(stats.fontSizes, 20),
        radii: top(stats.radii),
        gaps: top(stats.gaps),
        rawColors: stats.colors.size
      },
      rules: Object.fromEntries(Object.entries(RULES).map(([k, v]) => [k, v.about]))
    };
  }

  // src/plugin/main.ts
  var methods = {
    ping: { fn: () => ({ pong: true, at: Date.now() }) },
    status: { fn: () => status() },
    metadata: { fn: metadata },
    get_nodes: { fn: getNodes },
    search: { fn: search },
    fonts: { fn: fonts },
    screenshot: { fn: screenshot },
    export: { fn: exportNodes },
    extract: { fn: extract },
    design_system: { fn: designSystem },
    components: { fn: listComponents },
    variables_read: { fn: readVariables },
    styles_read: { fn: readStyles },
    prototype_read: { fn: readPrototype },
    placeholders: { fn: listPlaceholders },
    place_image: { fn: placeImage, write: true },
    navigate: { fn: navigate },
    brief: { fn: (p) => brief(p), write: (p) => {
      var _a;
      return ((_a = p == null ? void 0 : p.action) != null ? _a : "get") !== "get";
    } },
    lint: { fn: lint, write: (p) => !!(p == null ? void 0 : p.fix) },
    build: {
      write: true,
      fn: async (p) => {
        const issues = newIssues();
        const spec = normalizeSpec(p.spec, "spec", issues);
        issues.errors.push(...applyAssets(spec, p.assets));
        if (issues.errors.length) throw new PluginError("BAD_REQUEST", `Nothing was created \u2014 fix these first:
- ${issues.errors.join("\n- ")}`);
        const res = await build(spec, p);
        return __spreadProps(__spreadValues({}, res), { warnings: [...issues.warnings, ...res.warnings] });
      }
    },
    edit: { fn: edit, write: true },
    variables: { fn: upsertVariables, write: true },
    styles: { fn: upsertStyles, write: true },
    create_component: { fn: createComponent, write: true },
    prototype: { fn: prototype, write: true },
    execute: { fn: execute, write: true }
  };
  var g = globalThis;
  if (typeof g.__FIGMA_MCP_HOT__ === "function") {
    g.__FIGMA_MCP_HOT__(methods, PLUGIN_VERSION);
  } else {
    start();
  }
  function start() {
    const rt = { table: methods, version: PLUGIN_VERSION };
    const sessionId = Math.random().toString(36).slice(2, 10);
    let paused = false;
    const state = () => {
      var _a, _b, _c;
      return {
        sessionId,
        version: rt.version,
        file: { name: figma.root.name, key: (_a = figma.fileKey) != null ? _a : null, editorType: figma.editorType },
        page: { id: figma.currentPage.id, name: figma.currentPage.name },
        user: (_c = (_b = figma.currentUser) == null ? void 0 : _b.name) != null ? _c : null,
        selection: selectionSummary(),
        paused
      };
    };
    figma.showUI(__html__, { width: 300, height: 380, themeColors: true, title: "Figma MCP" });
    figma.ui.postMessage({ type: "init", state: state() });
    let stateTimer;
    const pushState = () => {
      if (stateTimer !== void 0) clearTimeout(stateTimer);
      stateTimer = setTimeout(() => figma.ui.postMessage({ type: "state", state: state() }), 120);
    };
    figma.on("selectionchange", pushState);
    figma.on("currentpagechange", pushState);
    g.__FIGMA_MCP_HOT__ = (table, version) => {
      rt.table = table;
      rt.version = version;
      pushState();
    };
    const isWrite = (m, params) => !!m && (typeof m.write === "function" ? m.write(params != null ? params : {}) : !!m.write);
    const DEADLINES = { build: 23e4, create_component: 29e4, edit: 17e4, variables: 17e4, lint: 17e4, export: 17e4, extract: 11e4, design_system: 11e4, screenshot: 8e4, placeholders: 11e4, components: 11e4 };
    const deadlineFor = (method, params) => {
      var _a, _b;
      return method === "execute" ? Math.min(Number((_a = params == null ? void 0 : params.timeoutMs) != null ? _a : 6e4), 3e5) + 5e3 : (_b = DEADLINES[method]) != null ? _b : 55e3;
    };
    const withDeadline = (work, ms, method) => {
      let timer;
      const late = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new PluginError("TIMEOUT", `Figma did not finish "${method}" within ${Math.round(ms / 1e3)}s (a Figma call never returned). The plugin moved on; check the canvas \u2014 part of the change may be applied. If it keeps happening, close and re-run the plugin.`)), ms);
      });
      const done = () => timer !== void 0 && clearTimeout(timer);
      return Promise.race([work, late]).then(
        (v) => {
          done();
          return v;
        },
        (e) => {
          done();
          throw e;
        }
      );
    };
    let queue = Promise.resolve();
    figma.ui.onmessage = (msg) => {
      if (msg.type === "pause") {
        paused = !!msg.value;
        pushState();
        figma.notify(paused ? "Figma MCP paused \u2014 Claude cannot change this file" : "Figma MCP resumed", { timeout: 1600 });
        return;
      }
      if (msg.type === "resize" && msg.width && msg.height) {
        figma.ui.resize(msg.width, msg.height);
        return;
      }
      if (msg.type === "ui-ready") {
        figma.ui.postMessage({ type: "init", state: state() });
        return;
      }
      if (msg.type !== "request" || !msg.id || !msg.method) return;
      const { id, method, params } = msg;
      queue = queue.then(async () => {
        var _a;
        const started = Date.now();
        const m = rt.table[method];
        try {
          let result;
          if (method === "__reload") {
            const before = rt.version;
            (0, eval)(String((_a = params == null ? void 0 : params.code) != null ? _a : ""));
            result = { from: before, to: rt.version, reloaded: rt.version !== before };
          } else {
            if (!m) throw new PluginError("UNKNOWN_METHOD", `Unknown method "${method}". Re-run the Figma plugin to load the current build.`);
            if (paused && isWrite(m, params)) throw new PluginError("PAUSED", "The user paused Figma MCP in the plugin panel. Ask them to press Resume; do not work around it.");
            result = await withDeadline(Promise.resolve(m.fn(params != null ? params : {})), deadlineFor(method, params), method);
          }
          figma.ui.postMessage({ type: "response", id, ok: true, result, ms: Date.now() - started });
        } catch (e) {
          const code = e instanceof PluginError ? e.code : "FIGMA_ERROR";
          const details = e == null ? void 0 : e.details;
          figma.ui.postMessage({ type: "response", id, ok: false, error: { code, message: explainFigmaError(e), details }, ms: Date.now() - started });
        }
        if (isWrite(m, params)) pushState();
      });
    };
  }
})();
