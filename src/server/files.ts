// Where the server may write. Everything produced while working (exported assets, tokens, code)
// belongs to the user's project — never to the figma-mcp tool folder itself.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isRepo = (dir: string) => fs.existsSync(path.join(dir, 'figma-plugin', 'manifest.json'));

/** The figma-mcp source folder: next to this bundle, or recorded in dist/source.json by the build. */
export function sourceRepo(): string | null {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const relRepo = path.resolve(here, '..', '..');
    if (isRepo(relRepo)) return realpath(relRepo);
    const { repo } = JSON.parse(fs.readFileSync(path.join(here, 'source.json'), 'utf8')) as { repo?: string };
    if (repo && isRepo(repo)) return realpath(repo);
  } catch {
    /* not built by scripts/build.mjs */
  }
  return null;
}

/** <repo>/claude-plugin/dist/server.mjs → plugin root (wherever it runs from) and the source repo. */
export function toolRoots(): string[] {
  const roots = new Set<string>();
  try {
    roots.add(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  } catch {
    /* bundled differently */
  }
  const repo = sourceRepo();
  if (repo) roots.add(repo);
  if (process.env.CLAUDE_PLUGIN_ROOT) roots.add(path.resolve(process.env.CLAUDE_PLUGIN_ROOT));
  return [...roots].map((r) => realpath(r));
}

function realpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

let clientRoots: string[] = [];

/** Workspace folders announced by the MCP client (roots/list), e.g. Codex, OpenCode, Claude Code. */
export function setClientRoots(uris: string[]): void {
  clientRoots = uris
    .map((u) => {
      try {
        return u.startsWith('file:') ? fileURLToPath(u) : u;
      } catch {
        return '';
      }
    })
    .filter((d) => !!d && fs.existsSync(d));
}

/**
 * The project the agent works in: CLAUDE_PROJECT_DIR (Claude Code) → FIGMA_MCP_PROJECT_DIR (any client)
 * → the first root the client announced → the server's working directory when it is a real project.
 */
export function projectDir(): string | null {
  for (const d of [process.env.CLAUDE_PROJECT_DIR, process.env.FIGMA_MCP_PROJECT_DIR, clientRoots[0]]) {
    if (d && fs.existsSync(d)) return realpath(d);
  }
  const cwd = realpath(process.cwd());
  const home = realpath(os.homedir());
  if (cwd === '/' || cwd === home || toolRoots().some((r) => isInside(cwd, r))) return null;
  return cwd;
}

export class PathError extends Error {}

/**
 * Resolves an output path. Relative paths are relative to the project directory.
 * Refuses the tool folder (unless FIGMA_MCP_UNLOCK=1, used when developing the tool).
 */
export function resolveOutput(p: string): string {
  if (!p || !p.trim()) throw new PathError('An output path is required.');
  let out = p.trim();
  if (out.startsWith('~/')) out = path.join(os.homedir(), out.slice(2));
  if (!path.isAbsolute(out)) {
    const base = projectDir();
    if (!base) throw new PathError(`"${p}" is relative and the project directory is unknown — pass an absolute path inside the user's project.`);
    out = path.join(base, out);
  }
  out = path.resolve(out);
  // Compare against real paths of the closest existing ancestor (handles symlinks).
  let probe = out;
  while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
  const real = path.join(realpath(probe), path.relative(probe, out));
  if (process.env.FIGMA_MCP_UNLOCK !== '1') {
    for (const root of toolRoots()) {
      if (isInside(real, root)) {
        throw new PathError(`Refusing to write into the figma-mcp tool folder (${root}). Write into the user's project instead (e.g. ${projectDir() ?? '<project>'}/src/assets).`);
      }
    }
  }
  return out;
}

/** Unique file name inside dir: name.ext, name-2.ext, … (unless overwrite). */
export function uniquePath(dir: string, base: string, ext: string, overwrite: boolean): string {
  const safe = base.replace(/[^a-zA-Z0-9؀-ۿ._-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
  let candidate = path.join(dir, `${safe}.${ext}`);
  if (overwrite) return candidate;
  let i = 2;
  while (fs.existsSync(candidate)) candidate = path.join(dir, `${safe}-${i++}.${ext}`);
  return candidate;
}

export function writeFileSafe(file: string, data: Buffer | string): void {
  const out = resolveOutput(file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, data);
}

/** The built Figma plugin bundle next to this server (used to update a running plugin in place). */
export function figmaPluginBundle(): string | null {
  const repo = sourceRepo();
  if (!repo) return null;
  const file = path.join(repo, 'figma-plugin', 'code.js');
  try {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  } catch {
    return null;
  }
}
