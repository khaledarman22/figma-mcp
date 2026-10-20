import assert from 'node:assert/strict';
import { test } from 'node:test';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { bashViolation, decide } from '../src/guard/guard.ts';

// Real paths, like the guard computes them (macOS tmp is a symlink to /private/var).
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-guard-root-')));
const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'some-project-')));

test('blocks writes into the tool folder from another project', () => {
  assert.ok(decide({ cwd: elsewhere, tool_name: 'Write', tool_input: { file_path: path.join(root, 'src/x.ts') } }, root, {}));
  assert.ok(decide({ cwd: elsewhere, tool_name: 'Edit', tool_input: { file_path: path.join(root, 'claude-plugin/skills/figma/SKILL.md') } }, root, {}));
  assert.equal(decide({ cwd: elsewhere, tool_name: 'Write', tool_input: { file_path: path.join(elsewhere, 'a.ts') } }, root, {}), null);
});

test('allows everything while developing the tool itself or when unlocked', () => {
  assert.equal(decide({ cwd: path.join(root, 'src'), tool_name: 'Write', tool_input: { file_path: path.join(root, 'src/x.ts') } }, root, {}), null);
  assert.equal(decide({ cwd: elsewhere, tool_name: 'Write', tool_input: { file_path: path.join(root, 'x') } }, root, { CLAUDE_PROJECT_DIR: root }), null);
  assert.equal(decide({ cwd: elsewhere, tool_name: 'Write', tool_input: { file_path: path.join(root, 'x') } }, root, { FIGMA_MCP_UNLOCK: '1' }), null);
});

test('bash: read-only commands pass, mutations are blocked', () => {
  assert.equal(bashViolation(`cat ${root}/README.md | head -5`, root, false), null);
  assert.equal(bashViolation(`ls -la ${root} && grep -r foo ${root}/src`, root, false), null);
  assert.equal(bashViolation(`git -C ${root} status`, root, false), null);
  assert.equal(bashViolation(`cp ${root}/figma-plugin/manifest.json /tmp/x.json`, root, false), null, 'copying out is fine');
  assert.ok(bashViolation(`rm -rf ${root}/dist`, root, false));
  assert.ok(bashViolation(`echo hi > ${root}/notes.md`, root, false));
  assert.ok(bashViolation(`cd ${root} && npm install left-pad`, root, false));
  assert.ok(bashViolation(`cd ${root} && rm -rf src`, root, false));
  assert.ok(bashViolation(`sed -i '' 's/a/b/' ${root}/src/x.ts`, root, false));
  assert.ok(bashViolation(`git -C ${root} commit -am wip`, root, false));
  assert.ok(bashViolation(`cp /tmp/a.png ${root}/assets/`, root, false));
  assert.equal(bashViolation(`rm -rf ${elsewhere}/dist`, root, false), null);
});
