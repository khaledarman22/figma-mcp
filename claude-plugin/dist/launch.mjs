// Starts the server next to this file; from a copy outside the source folder (e.g. a plugin cache),
// the source folder's newer build recorded in source.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
let target = path.join(here, 'server.mjs');
if (!fs.existsSync(path.join(here, '..', '..', 'figma-plugin', 'manifest.json'))) {
  try {
    const { repo } = JSON.parse(fs.readFileSync(path.join(here, 'source.json'), 'utf8'));
    const candidate = path.join(repo, 'claude-plugin', 'dist', 'server.mjs');
    if (fs.existsSync(candidate)) target = candidate;
  } catch {}
}
await import(pathToFileURL(target).href);
