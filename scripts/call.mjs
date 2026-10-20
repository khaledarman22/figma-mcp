// Dev helper: call one figma-mcp tool against the running Figma plugin.
//   node scripts/call.mjs <tool> '<json args>'        e.g. node scripts/call.mjs status '{}'
//   node scripts/call.mjs execute --code 'return figma.currentPage.name'
// Images in the result are written next to the current directory as call-<n>.png.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [tool, ...rest] = process.argv.slice(2);
if (!tool) {
  console.error('usage: node scripts/call.mjs <tool> \'<json>\' | execute --code \'…\'');
  process.exit(1);
}
let args = {};
if (rest[0] === '--code') args = { code: rest.slice(1).join(' ') };
else if (rest[0] === '--file') args = JSON.parse(fs.readFileSync(rest[1], 'utf8'));
else if (rest[0]) args = JSON.parse(rest[0]);

const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'claude-plugin/dist/server.mjs')], env: { ...process.env }, stderr: 'ignore' });
const client = new Client({ name: 'call', version: '0' });
await client.connect(transport);
const res = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 600_000 });
let k = 0;
for (const c of res.content ?? []) {
  if (c.type === 'text') console.log(c.text);
  if (c.type === 'image') {
    const f = path.resolve(process.env.CALL_OUT ?? '.', `call-${++k}.png`);
    fs.writeFileSync(f, Buffer.from(c.data, 'base64'));
    console.log(`[image → ${f}]`);
  }
}
if (res.isError) process.exitCode = 1;
await client.close();
