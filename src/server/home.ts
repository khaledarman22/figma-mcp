// ~/.figma-mcp is the fixed place AI tools (launch.mjs) and Figma (figma-plugin/) point to, so the
// figma-mcp folder can move. `npm run setup` creates it; every server start keeps it in step with
// the installed folder and records where that folder is now.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sourceRepo } from './files.ts';
import { log } from './log.ts';

export const homeDir = () => process.env.FIGMA_MCP_HOME || path.join(os.homedir(), '.figma-mcp');

function copyIfChanged(from: string, to: string): boolean {
  if (!fs.existsSync(from)) return false;
  const next = fs.readFileSync(from);
  if (fs.existsSync(to) && fs.readFileSync(to).equals(next)) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const tmp = `${to}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, next);
  fs.renameSync(tmp, to);
  return true;
}

/** Content hash of a skill folder (paths + bytes, marker excluded) — the same formula setup writes into .figma-mcp. */
export function skillHash(dir: string): string {
  const h = crypto.createHash('sha1');
  const files = (fs.readdirSync(dir, { recursive: true }) as string[]).map(String).filter((f) => f !== '.figma-mcp' && fs.statSync(path.join(dir, f)).isFile()).sort();
  for (const f of files) h.update(`${f.split(path.sep).join('/')}\0`).update(fs.readFileSync(path.join(dir, f))).update('\0');
  return h.digest('hex').slice(0, 16);
}

/** Skill folders setup copied into other tools (marked with .figma-mcp) are replaced when the skills change. */
function refreshInstalledSkills(repo: string): number {
  const source = path.join(repo, 'agent-skills');
  if (!fs.existsSync(source)) return 0;
  const home = os.homedir();
  const targets = [path.join(home, '.agents', 'skills'), ...['config', 'antigravity', 'antigravity-cli'].map((d) => path.join(home, '.gemini', d, 'skills'))];
  let n = 0;
  for (const name of fs.readdirSync(source)) {
    const from = path.join(source, name);
    if (!fs.statSync(from).isDirectory()) continue;
    const hash = skillHash(from);
    for (const t of targets) {
      const to = path.join(t, name);
      const marker = path.join(to, '.figma-mcp');
      if (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8').includes(`hash: ${hash}`)) continue;
      fs.rmSync(to, { recursive: true, force: true });
      fs.cpSync(from, to, { recursive: true });
      fs.writeFileSync(marker, `installed by figma-mcp (npm run setup); kept current by its server\nhash: ${hash}\n`);
      n++;
    }
  }
  return n;
}

export function syncHome(): void {
  const dir = homeDir();
  try {
    const recordFile = path.join(dir, 'install.json');
    if (!fs.existsSync(recordFile)) return; // setup never ran
    const repo = sourceRepo();
    if (!repo) return;
    const record = JSON.parse(fs.readFileSync(recordFile, 'utf8')) as { root?: string; movedAt?: string };
    if (!record.root || !fs.existsSync(path.join(record.root, 'claude-plugin', 'dist', 'server.mjs'))) {
      log(`figma-mcp folder moved: ${record.root ?? '?'} → ${repo}`);
      record.root = repo;
      record.movedAt = new Date().toISOString();
      fs.writeFileSync(recordFile, JSON.stringify(record, null, 2) + '\n');
    }
    if (fs.realpathSync(record.root) !== repo) return; // another copy of the folder is the installed one
    const changed = [copyIfChanged(path.join(repo, 'scripts', 'home-launch.mjs'), path.join(dir, 'launch.mjs'))];
    for (const f of ['manifest.json', 'code.js', 'ui.html']) changed.push(copyIfChanged(path.join(repo, 'figma-plugin', f), path.join(dir, 'figma-plugin', f)));
    if (changed.some(Boolean)) log(`updated ${dir} from ${repo}`);
    const skills = refreshInstalledSkills(repo);
    if (skills) log(`refreshed ${skills} installed skill folder(s)`);
  } catch (e) {
    log(`could not update ${dir}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
