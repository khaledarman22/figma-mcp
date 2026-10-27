// Reference images for the References page: a design page (its share image and the work's own
// large images), a direct image URL or a screenshot on disk. Fetching is polite — robots.txt is
// honoured, the user agent says what it is, and a login wall or bot check is reported, never
// worked around. Free-stock photo pages resolve to their photo the same way.

const USER_AGENT = 'figma-mcp (design reference fetcher; local)';
const MAX_HTML = 4 * 1024 * 1024;

/** Design galleries: their images are other people's work — references only, never product images. */
export const INSPIRATION_HOSTS = [
  'dribbble.com', 'behance.net', 'awwwards.com', 'siteinspire.com', 'land-book.com', 'onepagelove.com',
  'pinterest.com', 'pinterest.co.uk', 'pin.it', 'pinimg.com', 'mobbin.com', 'lapa.ninja', 'godly.website',
  'muz.li', 'pageflows.com', 'saaslandingpage.com', 'uplabs.com',
];
/** Content behind an account: never fetched; the user supplies screenshots from their own session. */
const LOGIN_ONLY = ['mobbin.com', 'pageflows.com'];
/** Free-license photo libraries (photo pages resolve to the photo). */
export const FREE_PHOTO_HOSTS = ['unsplash.com', 'pexels.com', 'pixabay.com'];

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};
const onHost = (url: string, list: string[]) => {
  const h = hostOf(url);
  return !!h && list.some((d) => h === d || h.endsWith(`.${d}`));
};

export const isInspirationHost = (url: string) => /^https?:/i.test(url) && onHost(url, INSPIRATION_HOSTS);
export const isLoginOnlyHost = (url: string) => onHost(url, LOGIN_ONLY);
export const isFreePhotoPage = (url: string) => onHost(url, FREE_PHOTO_HOSTS) && !/^(images|cdn)\./.test(new URL(url).hostname);

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

function meta(html: string, key: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key.replace(/[:.]/g, '\\$&')}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content.trim()) : undefined;
}

export function pageTitle(html: string): string {
  const t = meta(html, 'og:title') ?? decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '');
  return t.replace(/\s+/g, ' ').slice(0, 120);
}

/** Full-size variants of the gallery CDNs' thumbnails, so the board shows the work, not a 400 px crop. */
function fullSize(u: string): string {
  try {
    const url = new URL(u);
    const h = url.hostname;
    if (h === 'cdn.dribbble.com') {
      url.searchParams.delete('resize');
      url.searchParams.delete('vertical');
      url.searchParams.delete('crop');
      url.searchParams.delete('format');
    } else if (h.endsWith('behance.net')) {
      url.pathname = url.pathname.replace(/\/project_modules\/(?:max_\d+|disp|fs|1400|1400_opt_1|2800_opt_1|max_\d+_webp)\//, '/project_modules/max_3840/');
    } else if (h === 'assets.awwwards.com') {
      url.pathname = url.pathname.replace(/\/media\/cache\/[^/]+\//, '/');
    } else if (h === 'images.unsplash.com') {
      for (const k of ['w', 'h', 'crop', 'fit', 'q', 'fm', 'auto', 'ixlib', 'ixid']) url.searchParams.delete(k);
      url.searchParams.set('w', '2400');
      url.searchParams.set('fm', 'jpg');
      url.searchParams.set('q', '85');
    } else if (h === 'images.pexels.com') {
      url.search = '?auto=compress&cs=tinysrgb&w=2400';
    }
    return url.toString();
  } catch {
    return u;
  }
}

/**
 * The images worth seeing on a page, best first: the work's own large images on the galleries
 * (Dribbble shot files, Behance project modules, Awwwards submissions), then the share image.
 */
export function pageImages(html: string, baseUrl: string, max = 4): string[] {
  const host = hostOf(baseUrl);
  const found: string[] = [];
  const add = (raw: string | undefined) => {
    if (!raw) return;
    try {
      const u = fullSize(new URL(decode(raw), baseUrl).toString());
      if (/^https?:/.test(u) && !found.includes(u)) found.push(u);
    } catch {
      /* not a URL */
    }
  };
  const all = (re: RegExp) => [...html.matchAll(re)].map((m) => m[0]);
  // The share image is the cover the author picked (and the only image of most production sites).
  add(meta(html, 'og:image') ?? meta(html, 'og:image:url') ?? meta(html, 'twitter:image') ?? meta(html, 'twitter:image:src'));
  if (host.endsWith('dribbble.com')) all(/https:\/\/cdn\.dribbble\.com\/userupload\/[^"'\s)]+?\.(?:png|jpe?g|gif|webp)(?:\?[^"'\s)]*)?/gi).forEach(add);
  else if (host.endsWith('behance.net')) all(/https:\/\/mir-s3-cdn-cf\.behance\.net\/project_modules\/[^"'\s)]+?\.(?:png|jpe?g|gif|webp)/gi).forEach(add);
  else if (host.endsWith('awwwards.com')) all(/https:\/\/assets\.awwwards\.com\/awards\/(?:media\/cache\/[^/]+\/)?submissions\/[^"'\s)]+?\.(?:png|jpe?g|webp)/gi).forEach(add);
  return found.slice(0, Math.max(1, max));
}

/** Why a fetched page is not the requested content (bot check, login wall), or null. */
export function blockedReason(status: number, html: string, finalUrl: string): string | null {
  if (status === 401 || status === 403) return `HTTP ${status} — the site refuses automated access`;
  if (status === 429) return 'HTTP 429 — rate limited';
  if (status === 202 && html.length < 20_000) return 'bot check (HTTP 202 challenge page)';
  if (status < 200 || status >= 300) return `HTTP ${status}`;
  const head = html.slice(0, 30_000).toLowerCase();
  let path = '';
  try {
    path = new URL(finalUrl).pathname;
  } catch {
    /* keep empty */
  }
  if (/\/(login|signin|sign-in|signup|join)(\/|$)/i.test(path)) return 'redirected to a login page';
  if (/are you a robot|captcha|cf-challenge|challenge-platform|just a moment\.\.\./.test(head)) return 'bot check (captcha)';
  if (/(log ?in|sign ?in) to (continue|view|see)|subscribe to (view|continue)/.test(head) && /type=["']?password/.test(head)) return 'login wall';
  return null;
}

/* ---------- robots.txt ---------- */

interface Rule {
  allow: boolean;
  path: string;
}

export function robotsRules(text: string, agent = 'figma-mcp'): Rule[] {
  const groups: Array<{ agents: string[]; rules: Rule[] }> = [];
  let cur: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const line of text.split(/\r?\n/)) {
    const m = line.replace(/#.*$/, '').trim().match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === 'allow' || key === 'disallow') && val) cur.rules.push({ allow: key === 'allow', path: val });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.toLowerCase().includes(a)));
  return (mine.length ? mine : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules);
}

export function robotsAllows(rules: Rule[], pathAndQuery: string): boolean {
  let best: Rule | null = null;
  for (const r of rules) {
    const re = new RegExp(`^${r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
    if (!re.test(pathAndQuery)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return !best || best.allow;
}

/* ---------- fetching ---------- */

const robotsCache = new Map<string, Rule[]>();

async function get(url: string, accept: string, ms = 20_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': USER_AGENT, accept } });
  } finally {
    clearTimeout(t);
  }
}

async function allowedByRobots(url: string): Promise<boolean> {
  const u = new URL(url);
  let rules = robotsCache.get(u.origin);
  if (!rules) {
    let text = '';
    try {
      const res = await get(`${u.origin}/robots.txt`, 'text/plain', 8_000);
      if (res.ok) text = await res.text();
      else if (res.status >= 500) text = 'User-agent: *\nDisallow: /';
    } catch {
      /* unreachable robots.txt: no rules */
    }
    rules = robotsRules(text);
    robotsCache.set(u.origin, rules);
  }
  return robotsAllows(rules, `${u.pathname}${u.search}`);
}

async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  if (Number(res.headers.get('content-length') ?? 0) > max) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > max ? null : buf;
}

export class FetchRefused extends Error {}

/** Downloads an image URL, or — for a web page — the page's best images. */
export async function fetchPage(url: string, max: number, maxBytes: number): Promise<{ title?: string; images: Array<{ url: string; buf: Buffer }>; skipped: string[] }> {
  if (!/^https?:\/\//i.test(url)) throw new FetchRefused('only http(s) URLs can be fetched');
  if (isLoginOnlyHost(url)) throw new FetchRefused(`${hostOf(url)} needs an account — it is never fetched. Ask the user for screenshots from their own session (or open it in your browser if they are signed in there) and pass the files.`);
  if (!(await allowedByRobots(url))) throw new FetchRefused(`robots.txt of ${hostOf(url)} does not allow fetching this page — take a screenshot in a browser instead.`);
  let res: Response;
  try {
    res = await get(url, 'text/html,application/xhtml+xml,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5');
  } catch (e) {
    throw new FetchRefused(`could not reach ${hostOf(url)} (${e instanceof Error ? e.message : e})`);
  }
  const type = res.headers.get('content-type') ?? '';
  if (res.ok && /^image\//i.test(type)) {
    const buf = await readCapped(res, maxBytes);
    if (!buf) throw new FetchRefused('the image is too large');
    return { images: [{ url, buf }], skipped: [] };
  }
  const html = (await readCapped(res, MAX_HTML))?.toString('utf8') ?? '';
  const blocked = blockedReason(res.status, html, res.url || url);
  if (blocked) throw new FetchRefused(`${hostOf(url)}: ${blocked}. Open it in your browser and save a screenshot (or ask the user for one), then pass the file path.`);
  if (!/html|xml/i.test(type)) throw new FetchRefused(`not a page or image (${type || 'unknown type'})`);
  const candidates = pageImages(html, res.url || url, max + 2);
  if (!candidates.length) throw new FetchRefused('the page exposes no image (no share image) — take a screenshot of it instead');
  const images: Array<{ url: string; buf: Buffer }> = [];
  const skipped: string[] = [];
  for (const img of candidates) {
    if (images.length >= max) break;
    try {
      if (!(await allowedByRobots(img))) {
        skipped.push(`${img}: robots.txt`);
        continue;
      }
      const r = await get(img, 'image/png,image/jpeg,image/gif,image/webp,image/*;q=0.8');
      const buf = r.ok ? await readCapped(r, maxBytes) : null;
      if (!r.ok || !buf) skipped.push(`${img}: ${r.ok ? 'too large' : `HTTP ${r.status}`}`);
      else images.push({ url: img, buf });
    } catch (e) {
      skipped.push(`${img}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (!images.length) throw new FetchRefused(`none of the page's images could be downloaded (${skipped.join('; ')})`);
  return { title: pageTitle(html) || undefined, images, skipped };
}

/** Pixel size of a PNG, JPEG or GIF (null if it can't be read). */
export function imageSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length >= 10 && buf.slice(0, 3).toString() === 'GIF') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

export const boardLetter = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : `${boardLetter(Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);

export function letterIndex(name: string): number {
  const m = name.match(/^([A-Z]{1,2}) [–-] /);
  if (!m) return -1;
  return [...m[1]].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
}
