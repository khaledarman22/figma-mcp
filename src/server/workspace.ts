// The design workspace: one folder per Figma file inside the user's project (design/<file>/) that
// holds everything the design produces outside Figma — the identity (DESIGN.md), tokens, references,
// image prompts with previews, generated images and the user's own assets — plus a small project
// skill that points every agent at it. Figma stays the source of truth; `workspace sync` refreshes it.

import fs from 'node:fs';
import path from 'node:path';
import { kebab } from '../shared/util.ts';
import { projectDir, resolveOutput } from './files.ts';
import { summarizeVariables, type VariablesDump } from './tokens.ts';

export const WORKSPACE_ROOT = 'design';
const META = 'workspace.json';
export const FOLDERS = ['references', 'images', 'assets', 'previews', 'tokens', 'library'] as const;

export interface FigmaFileRef {
  name: string;
  key?: string | null;
}

interface WorkspaceMeta {
  figma: { name: string; key?: string | null };
  created: string;
  synced?: string;
}

export interface Workspace {
  dir: string;
  slug: string;
  meta: WorkspaceMeta;
  /** true when this call made the folder. */
  created?: boolean;
}

const slugOf = (name: string) => kebab(name).slice(0, 60) || 'figma';
const today = () => new Date().toISOString().slice(0, 10);

function readMeta(dir: string): WorkspaceMeta | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, META), 'utf8')) as WorkspaceMeta;
  } catch {
    return null;
  }
}

function writeMeta(dir: string, meta: WorkspaceMeta): void {
  fs.writeFileSync(path.join(dir, META), JSON.stringify(meta, null, 2) + '\n');
}

/** The workspace of a Figma file in this project: matched by file key, else by name. */
export function findWorkspace(file: FigmaFileRef, project = projectDir()): Workspace | null {
  if (!project) return null;
  const root = path.join(project, WORKSPACE_ROOT);
  if (!fs.existsSync(root)) return null;
  let byName: Workspace | null = null;
  for (const slug of fs.readdirSync(root).sort()) {
    const dir = path.join(root, slug);
    const meta = readMeta(dir);
    if (!meta) continue;
    if (file.key && meta.figma.key === file.key) {
      if (meta.figma.name !== file.name) {
        // The Figma file was renamed: keep the folder, remember the new name.
        meta.figma.name = file.name;
        writeMeta(dir, meta);
      }
      return { dir, slug, meta };
    }
    if (!byName && meta.figma.name === file.name && (!meta.figma.key || !file.key)) byName = { dir, slug, meta };
  }
  if (byName && file.key && !byName.meta.figma.key) {
    byName.meta.figma.key = file.key;
    writeMeta(byName.dir, byName.meta);
  }
  return byName;
}

/** Finds or creates the workspace (null when the project folder is unknown). */
export function ensureWorkspace(file: FigmaFileRef, project = projectDir()): Workspace | null {
  if (!project) return null;
  const found = findWorkspace(file, project);
  if (found) {
    for (const f of FOLDERS) fs.mkdirSync(path.join(found.dir, f), { recursive: true });
    return found;
  }
  let slug = slugOf(file.name);
  for (let i = 2; fs.existsSync(path.join(project, WORKSPACE_ROOT, slug)); i++) slug = `${slugOf(file.name)}-${i}`;
  const dir = resolveOutput(path.join(project, WORKSPACE_ROOT, slug));
  for (const f of FOLDERS) fs.mkdirSync(path.join(dir, f), { recursive: true });
  const meta: WorkspaceMeta = { figma: { name: file.name, key: file.key ?? null }, created: today() };
  writeMeta(dir, meta);
  fs.writeFileSync(path.join(dir, 'README.md'), readme(file.name));
  return { dir, slug, meta, created: true };
}

function readme(name: string): string {
  return [
    `# ${name} — design workspace`,
    '',
    `كل حاجة التصميم ده بيطلّعها برّه فيجما موجودة هنا. فيجما هي المرجع، والفولدر ده نسخة منها بتتحدّث بـ \`workspace sync\`.`,
    '',
    '| الملف / الفولدر | فيه إيه |',
    '|---|---|',
    '| `COMPONENTS.md` | الكمبوننتس اللي اتعملت في فيجما: الفاريانتس، البروبرتيز، اتستخدمت كام مرة، وإزاي تتحط في شاشة. بيتحدّث لوحده بعد أي تغيير في الكمبوننتس |',
    '| `DESIGN.md` | الهوية: الشخصية، الألوان وأدوارها، الخطوط، الكمبوننتس، الـ patterns والقواعد. الجزء اللي بين العلامات بيتكتب من فيجما؛ ملاحظاتك تحته بتفضل زي ما هي |',
    '| `tokens/` | الـ tokens بنفس أسامي فيجما: `tokens.css` و `tokens.json` (DTCG) و `tailwind.css` |',
    '| `references/` | صور الريفرنس اللي على صفحة References + `REFERENCES.md` |',
    '| `IMAGE_PROMPTS.md` | الصور المطلوبة: لكل صورة مكانها، مقاسها، والبرومبت بالتفصيل |',
    '| `previews/` | لكل صورة مطلوبة سكرينشوت للشاشة اللي هتتحط فيها |',
    '| `images/` | حط هنا الصور اللي ولّدتها (`IMG-001.png` …) |',
    '| `library/` + `LIBRARY.md` | مكتبة الصور اللي اتجابت من النت أو منك: كل صورة بوصفها ومقاسها ورخصتها، ومعروضة في صفحة Library في فيجما. بتتستخدم زي ما هي أو كأساس لبرومبت تعديل |',
    '| `assets/` | حط هنا حاجتك الحقيقية اللي مطلوبة (لوجو، صور منتجات…) بالاسم المكتوب في `IMAGE_PROMPTS.md` |',
    '',
  ].join('\n');
}

// ───────────── DESIGN.md ─────────────

const START = '<!-- figma-mcp:start — generated from Figma by `workspace sync`; edits inside are replaced -->';
const END = '<!-- figma-mcp:end -->';

/** The `## Identity` block of the brief (up to the next level-2 heading). */
export function identityBlock(brief: string | null | undefined): string | null {
  if (!brief) return null;
  const m = brief.match(/^## Identity[^\n]*\n([\s\S]*?)(?=^## (?!#)|(?![\s\S]))/m);
  return m ? m[1].trim() || null : null;
}

export interface DesignData {
  fileName: string;
  brief: string | null;
  pages: string[];
  variables?: VariablesDump;
  styles?: { text: Array<Record<string, unknown>>; paint: Array<Record<string, unknown>>; effect: Array<Record<string, unknown>>; grid: Array<Record<string, unknown>> };
  components?: Array<Record<string, unknown>>;
  references?: Array<{ name: string; file?: string }>;
  tokenFiles: string[];
}

export function renderDesignBody(d: DesignData): string {
  const L: string[] = [];
  const identity = identityBlock(d.brief);
  L.push('## Identity', '');
  if (identity) L.push(identity, '');
  else if (d.brief) L.push('_No `## Identity` block in the brief yet — the brief as it stands:_', '', d.brief.trim(), '');
  else L.push('_Not written yet. Define it in Figma (figma-mcp identity guide) and run `workspace sync`._', '');

  if (d.variables?.variables.length) L.push('## Tokens', '', summarizeVariables(d.variables, 200), '');
  const s = d.styles;
  if (s && (s.text.length || s.effect.length || s.paint.length)) {
    L.push('## Styles', '');
    if (s.text.length) L.push('**Text**', ...s.text.map((t) => `- \`${t.name}\`: ${t.family} ${t.style} ${t.size}/${t.lineHeight}${t.letterSpacing ? ` ls ${t.letterSpacing}` : ''}${t.description ? ` — ${t.description}` : ''}`), '');
    if (s.paint.length) L.push('**Color**', ...s.paint.map((p) => `- \`${p.name}\`: ${p.value}`), '');
    if (s.effect.length) L.push('**Effects**', ...s.effect.map((e) => `- \`${e.name}\`: ${e.value}`), '');
  }
  const comps = (d.components ?? []).filter((c) => !/^icon\//i.test(String(c.name)));
  const icons = [...new Set((d.components ?? []).map((c) => String(c.name).match(/^icon\/([a-z0-9-]+)\//i)?.[1]).filter(Boolean))];
  if (comps.length) {
    L.push('## Components', '');
    for (const c of comps) {
      const axes = c.axes ? Object.entries(c.axes as Record<string, string[]>).map(([k, v]) => `${k}: ${v.join('|')}`).join('; ') : '';
      const props = c.props ? Object.keys(c.props as Record<string, string>).join(', ') : '';
      L.push(`- **${c.name}**${axes ? ` · ${axes}` : ''}${props ? ` · props: ${props}` : ''}${c.description ? ` — ${c.description}` : ''}`);
    }
    L.push('');
  }
  if (icons.length) L.push(`## Icons`, '', `Iconify set${icons.length > 1 ? 's' : ''}: ${icons.map((i) => `\`${i}\``).join(', ')}${icons.length > 1 ? ' — more than one set: unify unless it is deliberate' : ''}. In code use the matching package (e.g. \`lucide-react\`).`, '');
  if (d.references?.length) L.push('## References', '', ...d.references.map((r) => `- ${r.name}${r.file ? ` → \`${r.file}\`` : ''}`), '');
  L.push('## Files', '');
  for (const f of d.tokenFiles) L.push(`- \`${f}\``);
  L.push('- `COMPONENTS.md` — every component, how to place it, and which ones no design uses yet');
  L.push('- `LIBRARY.md` + `library/` — images already collected (web or user), reusable as they are or as edit bases');
  L.push('- `IMAGE_PROMPTS.md` — images waiting · `images/` generated · `assets/` supplied by the user', `- Figma pages: ${d.pages.join(' · ')}`, '');
  L.push(
    '## Rules',
    '',
    '- This is the only design system of this project: every screen, component, banner, image and UI in code uses these tokens, components, patterns, icon set and image style.',
    '- Need something it does not have? Add it to the identity in Figma first (token, variant, pattern), then use it — never a one-off value.',
    '- Change the identity in Figma, then run `workspace sync`; do not edit the generated part of this file.',
  );
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/** Writes DESIGN.md: the generated part between the markers is replaced, everything else is kept. */
export function writeDesignMd(file: string, d: DesignData): void {
  const body = `${START}\n${renderDesignBody(d)}\n${END}`;
  let text: string;
  if (fs.existsSync(file)) {
    const old = fs.readFileSync(file, 'utf8');
    const a = old.indexOf('<!-- figma-mcp:start');
    const b = old.indexOf(END);
    text = a >= 0 && b > a ? old.slice(0, a) + body + old.slice(b + END.length) : `${old.trimEnd()}\n\n${body}\n`;
  } else {
    text = `# ${d.fileName} — design identity\n\nSource of truth: the Figma file "${d.fileName}".\n\n${body}\n\n## Notes\n\n_Your own notes go here; sync keeps them._\n`;
  }
  fs.writeFileSync(file, text);
}

// ───────────── project skill ─────────────

const SKILL_MARK = '.figma-mcp';

/** A short project skill that sends every agent to the workspace (Claude Code reads .claude/skills, others .agents/skills). */
export function renderSkill(ws: Workspace, project: string): { name: string; text: string } {
  const name = `${ws.slug}-design`.slice(0, 64);
  const rel = path.relative(project, ws.dir).split(path.sep).join('/');
  const fileName = ws.meta.figma.name.replace(/["\\]/g, '').slice(0, 80);
  const description =
    `The design identity of "${fileName}" — the only design system for UI in this project. ` +
    `Use it for any screen, page, component, layout, styling, banner or image work here (design in Figma or UI in code), ` +
    `e.g. "build the settings screen", "add a pricing section", "style this button", "make the banner images". ` +
    `It reads ${rel}/DESIGN.md (identity, tokens, components, patterns, rules), the tokens in ${rel}/tokens and the image prompts.`;
  const text = [
    '---',
    `name: ${name}`,
    `description: "${description.replace(/"/g, "'")}"`,
    '---',
    '',
    `# ${fileName} — design identity`,
    '',
    `Generated by figma-mcp \`workspace sync\` — regenerated on every sync; edit the identity in Figma, not this file.`,
    '',
    `1. Read \`${rel}/DESIGN.md\` before any UI work. It is the only design system here: its tokens, components, section patterns, icon set and image style — nothing parallel, no one-off values.`,
    `2. Screens and code are built from the components in \`${rel}/COMPONENTS.md\` (instances, never hand-drawn copies).`,
    `3. Code uses the tokens from \`${rel}/tokens/\` (\`tokens.css\`, \`tailwind.css\`, \`tokens.json\`) by their names.`,
    `4. Something missing (a color, a variant, a pattern)? Add it to the identity in Figma first (figma-mcp), run \`workspace sync\`, then use it.`,
    `5. Images: \`${rel}/IMAGE_PROMPTS.md\` lists what is waiting; generated files go to \`${rel}/images/\`, the user's own files to \`${rel}/assets/\`; images already collected are in \`${rel}/LIBRARY.md\` — reuse them before searching again.`,
    `6. Figma file: "${fileName}"${ws.meta.figma.key ? ` (key ${ws.meta.figma.key})` : ''}.`,
    '',
  ].join('\n');
  return { name, text };
}

/** Installs the project skill; never replaces a skill folder figma-mcp did not write. */
export function writeSkill(ws: Workspace, project: string): string[] {
  const { name, text } = renderSkill(ws, project);
  const out: string[] = [];
  for (const base of ['.claude/skills', '.agents/skills']) {
    const dir = resolveOutput(path.join(project, base, name));
    const skill = path.join(dir, 'SKILL.md');
    if (fs.existsSync(skill) && !fs.existsSync(path.join(dir, SKILL_MARK))) {
      out.push(`skipped ${path.relative(project, skill)} (not written by figma-mcp — left as it is)`);
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(skill, text);
    fs.writeFileSync(path.join(dir, SKILL_MARK), `written by figma-mcp workspace sync for ${ws.meta.figma.name}\n`);
    out.push(path.relative(project, skill));
  }
  return out;
}

export function markSynced(ws: Workspace): void {
  ws.meta.synced = new Date().toISOString();
  writeMeta(ws.dir, ws.meta);
}

// ───────────── component catalog ─────────────

/** One local component or variant set, as the plugin lists it (with usage when asked). */
export interface CatalogItem {
  id: string;
  name: string;
  kind: 'set' | 'component';
  page?: string;
  description?: string;
  axes?: Record<string, string[]>;
  props?: Record<string, string>;
  size?: string;
  instances?: number;
  inDesigns?: number;
}

const CATALOG = 'components.json';
const isIcon = (c: CatalogItem) => /^icon\//i.test(c.name);

export function readCatalog(ws: Workspace): CatalogItem[] | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(ws.dir, CATALOG), 'utf8')).components as CatalogItem[];
  } catch {
    return null;
  }
}

/** How a screen uses the component: the instance spec with its first variant and its properties. */
export function instanceExample(c: CatalogItem): string {
  const variant = c.axes ? Object.fromEntries(Object.entries(c.axes).map(([k, v]) => [k, v[0]])) : undefined;
  const props = c.props
    ? Object.fromEntries(
        Object.entries(c.props).flatMap(([k, d]) => {
          const m = d.match(/^(\w+)=(.*)$/);
          if (!m || m[1] === 'instance_swap') return [];
          try {
            return [[k, JSON.parse(m[2])]];
          } catch {
            return [];
          }
        }),
      )
    : undefined;
  return JSON.stringify({ type: 'instance', component: c.name, ...(variant ? { variant } : {}), ...(props && Object.keys(props).length ? { props } : {}) });
}

export function renderCatalog(fileName: string, items: CatalogItem[]): string {
  const comps = items.filter((c) => !isIcon(c));
  const icons = items.filter(isIcon);
  const L: string[] = [
    `# Components — ${fileName}`,
    '',
    'Generated by figma-mcp after every component change (and on `workspace sync`). These already exist in Figma:',
    'build screens from them — `{"type": "instance", "component": "<name>", "variant": {…}, "props": {…}}` — and never redraw one by hand.',
    'Missing a variation? Add a variant or property to the component, not a look-alike.',
    '',
  ];
  if (!comps.length) L.push('_No components yet._', '');
  else {
    L.push('| Component | Variants | Properties | Used in designs | What it is for |', '|---|---|---|---|---|');
    for (const c of comps) {
      const axes = c.axes ? Object.entries(c.axes).map(([k, v]) => `${k}: ${v.join(' / ')}`).join('<br>') : '—';
      const props = c.props ? Object.keys(c.props).join(', ') : '—';
      const used = c.inDesigns === undefined ? '?' : c.inDesigns === 0 ? '**unused**' : `${c.inDesigns}×`;
      L.push(`| \`${c.name}\` | ${axes} | ${props} | ${used} | ${(c.description ?? '').replace(/\|/g, '/').replace(/\n+/g, ' ') || '—'} |`);
    }
    L.push('');
    const unused = comps.filter((c) => c.inDesigns === 0);
    if (unused.length) {
      L.push('## Not used in any design yet', '');
      L.push('A component nobody uses is unfinished work: put it where it belongs (`edit` `swap` the hand-built copies — `search` finds them by name) or move it to Trash if it is not needed.', '');
      for (const c of unused) L.push(`- \`${c.name}\`${c.instances ? ` (only inside other components or boards: ${c.instances}×)` : ''}`);
      L.push('');
    }
    L.push('## How to use each one', '');
    for (const c of comps) L.push(`- **${c.name}**${c.size ? ` (${c.size})` : ''}: \`${instanceExample(c)}\``);
    L.push('');
  }
  if (icons.length) L.push(`## Icons (${icons.length})`, '', `Use \`{"type": "icon", "icon": "<set>:<name>"}\` — already in the file: ${icons.slice(0, 60).map((i) => `\`${i.name.replace(/^icon\//, '').replace('/', ':')}\``).join(', ')}${icons.length > 60 ? ' …' : ''}.`, '');
  return L.join('\n').trimEnd() + '\n';
}

export function writeCatalog(ws: Workspace, items: CatalogItem[]): void {
  fs.writeFileSync(path.join(ws.dir, CATALOG), JSON.stringify({ updated: new Date().toISOString(), components: items }, null, 2) + '\n');
  fs.writeFileSync(path.join(ws.dir, 'COMPONENTS.md'), renderCatalog(ws.meta.figma.name, items));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '');

/**
 * Layers in a spec that look like an existing component (same name as the component or the last part
 * of its path, "Forms/Input" → "Input") but are drawn by hand instead of being instances.
 */
export function lookalikes(spec: unknown, catalog: CatalogItem[]): string[] {
  const byName = new Map<string, CatalogItem>();
  for (const c of catalog) {
    if (isIcon(c)) continue;
    for (const k of [c.name, c.name.split('/').pop() ?? c.name]) {
      const n = norm(k);
      if (n.length >= 3 && !byName.has(n)) byName.set(n, c);
    }
  }
  const out: string[] = [];
  const walk = (s: unknown, where: string) => {
    if (!s || typeof s !== 'object') return;
    const o = s as Record<string, unknown>;
    const type = String(o.type ?? o.kind ?? 'frame').toLowerCase();
    const name = typeof o.name === 'string' ? o.name : '';
    const hit = name && !['instance', 'icon', 'text', 'component'].includes(type) ? byName.get(norm(name)) : undefined;
    if (hit) out.push(`${where} "${name}" is drawn by hand but the component "${hit.name}" exists — use ${instanceExample(hit)}${hit.axes ? ` (variants: ${Object.entries(hit.axes).map(([k, v]) => `${k} ${v.join('|')}`).join('; ')})` : ''}.`);
    const kids = (o.children ?? o.items ?? o.kids) as unknown;
    if (Array.isArray(kids)) kids.forEach((k, i) => walk(k, `${where}.children[${i}]`));
  };
  walk(spec, 'spec');
  return out;
}

/** True when the spec contains at least one component instance. */
export function usesInstances(spec: unknown): boolean {
  if (!spec || typeof spec !== 'object') return false;
  const o = spec as Record<string, unknown>;
  if (String(o.type ?? '').toLowerCase() === 'instance' || o.component !== undefined) return true;
  const kids = o.children ?? o.items ?? o.kids;
  return Array.isArray(kids) && kids.some(usesInstances);
}
