// src/guard/guard.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
var real = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};
var isRepo = (dir) => fs.existsSync(path.join(dir, "figma-plugin", "manifest.json"));
function protectedRoots() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pluginRoot = path.resolve(here, "..");
  const roots = /* @__PURE__ */ new Set();
  const relRepo = path.resolve(pluginRoot, "..");
  if (isRepo(relRepo)) roots.add(real(relRepo));
  try {
    const { repo } = JSON.parse(fs.readFileSync(path.join(here, "source.json"), "utf8"));
    if (repo && isRepo(repo)) roots.add(real(repo));
  } catch {
  }
  if (!roots.size || !roots.has(real(relRepo))) roots.add(real(pluginRoot));
  return [...roots];
}
var inside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === "" || !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
};
var READ_ONLY = /* @__PURE__ */ new Set([
  "cat",
  "less",
  "more",
  "head",
  "tail",
  "ls",
  "grep",
  "egrep",
  "rg",
  "ag",
  "wc",
  "stat",
  "file",
  "du",
  "tree",
  "diff",
  "cmp",
  "md5",
  "md5sum",
  "shasum",
  "sha256sum",
  "echo",
  "printf",
  "pwd",
  "realpath",
  "readlink",
  "basename",
  "dirname",
  "jq",
  "open",
  "code",
  "test",
  "[",
  "which",
  "type",
  "cd",
  "pushd",
  "popd",
  "true",
  "false",
  "sort",
  "uniq",
  "cut",
  "awk",
  "column",
  "nl",
  "xxd",
  "hexdump",
  "od",
  "strings",
  "curl"
]);
var GIT_READ = /* @__PURE__ */ new Set(["status", "log", "diff", "show", "ls-files", "blame", "grep", "rev-parse", "branch", "remote", "describe", "shortlog", "cat-file", "ls-tree"]);
function mentions(text, root) {
  const home = os.homedir();
  const forms = [root];
  if (root.startsWith(home)) forms.push("~" + root.slice(home.length), "$HOME" + root.slice(home.length), "${HOME}" + root.slice(home.length));
  return forms.some((f) => text.includes(f));
}
function bashViolation(command, root, cwdInside) {
  const segments = command.split(/\n|;|&&|\|\||\|/).map((s) => s.trim()).filter(Boolean);
  let inRoot = cwdInside;
  for (const seg of segments) {
    const words = seg.split(/\s+/).filter((w) => !/^[A-Z_][A-Z0-9_]*=/.test(w));
    while (words[0] === "sudo" || words[0] === "command" || words[0] === "env" || words[0] === "time") words.shift();
    const cmd = (words[0] ?? "").replace(/^.*\//, "");
    const touches = mentions(seg, root);
    if (cmd === "cd" || cmd === "pushd") {
      if (touches) inRoot = true;
      else if (words[1]) inRoot = false;
      continue;
    }
    const redirect = seg.match(/>{1,2}\s*("?)([^\s"]+)\1/);
    if (redirect && (mentions(redirect[2], root) || inRoot && !path.isAbsolute(redirect[2]) && !redirect[2].startsWith("/dev/"))) return `writes into it (${seg.slice(0, 80)})`;
    if (!touches && !inRoot) continue;
    if (cmd === "git") {
      const sub = words.slice(1).find((w) => !w.startsWith("-") && !mentions(w, root));
      if (!sub || GIT_READ.has(sub)) continue;
      return `runs "git ${sub}" on it`;
    }
    if (cmd === "find" && !/\s-(delete|exec|execdir|ok)\b/.test(seg)) continue;
    if (cmd === "sed" && !/\s-i\b|\s-i['"]|--in-place/.test(seg)) continue;
    if ((cmd === "cp" || cmd === "rsync" || cmd === "scp" || cmd === "ditto") && touches) {
      const last = words[words.length - 1] ?? "";
      if (!mentions(last, root) && !inRoot) continue;
      return `copies files into it`;
    }
    if (READ_ONLY.has(cmd)) continue;
    return `runs "${cmd}" on it`;
  }
  return null;
}
function decide(input, rootOrRoots = protectedRoots(), env = process.env) {
  if (env.FIGMA_MCP_UNLOCK === "1") return null;
  const roots = Array.isArray(rootOrRoots) ? rootOrRoots : [rootOrRoots];
  const dirs = [input.cwd, env.CLAUDE_PROJECT_DIR].filter((d) => !!d);
  if (dirs.some((d) => roots.some((r) => inside(real(d), r)))) return null;
  for (const root of roots) {
    const why = decideFor(input, root);
    if (why) return why;
  }
  return null;
}
function decideFor(input, root) {
  const t = input.tool_name ?? "";
  const ti = input.tool_input ?? {};
  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(t)) {
    const p = String(ti.file_path ?? ti.notebook_path ?? "");
    if (!p) return null;
    const abs = path.isAbsolute(p) ? p : path.resolve(input.cwd ?? process.cwd(), p);
    let probe = abs;
    while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
    const resolved = path.join(real(probe), path.relative(probe, abs));
    return inside(resolved, root) ? `${t} of ${p}` : null;
  }
  if (t === "Bash") {
    const cmd = String(ti.command ?? "");
    const why = bashViolation(cmd, root, false);
    return why ? `the command ${why}` : null;
  }
  return null;
}
async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    return;
  }
  const roots = protectedRoots();
  const why = decide(input, roots);
  if (!why) return;
  const reason = `figma-mcp guard: ${roots[0]} is the figma-mcp tool folder and stays clean while you work on other projects (${why}). Put generated files (assets, code, tokens, notes) in the current project instead. To change the tool itself, open Claude Code inside that folder (or start it with FIGMA_MCP_UNLOCK=1).`;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
}
var isMain = process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url));
if (isMain) main().catch(() => process.exit(0));
export {
  bashViolation,
  decide,
  inside,
  protectedRoots
};
