#!/usr/bin/env node
/**
 * quality-guard - PostToolUse gate for code structure.
 *
 * It runs the quality-refactor scanner on the one file that was written. An
 * existing baseline supplies a ratchet comparison. Otherwise, normal
 * file-local hard bounds apply. The tracked baseline is read-only here.
 *
 * A `.quality-skip` sentinel waives one blocked write. See sentinel.mjs.
 *
 * Exit 0 always on internal failure. A broken gate must not stop work.
 */

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scopeToChangedLines } from "./changed-lines.mjs";
import { hookTargets } from "./hook-targets.mjs";
import { runProjectLinter } from "./project-linter.mjs";
import { absoluteVerdict, ratchetVerdict } from "./baseline-gate.mjs";
import { deleteSentinel, readSentinel, recordConsumption } from "./sentinel.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCANNER = join(HERE, "..", "skills", "quality-refactor", "scripts", "quality-scan.mjs");
const BASELINE = join(".github", "quality", "quality-baseline.json");

const CODE_EXT = new Set([
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
  ".cs", ".rs", ".py", ".go", ".java", ".kt", ".cpp", ".cc", ".hpp", ".h",
]);

/**
 * Rules a single-file scan can decide. duplicate-block, dead-export and
 * test-only-export need whole-project reachability, so a per-file gate would
 * call every export dead. Run those in a repository-wide scan instead.
 */
export const FILE_RULES = [
  "file-length", "function-length", "complexity", "param-count",
  "nesting-depth", "types-per-file", "else-branch", "unnamed-tuple",
  "unused-local", "commented-out-code", "todo-marker", "stateless-method",
  "comment-bloat", "comment-restates-code",
].join(",");

const SCAN_TIMEOUT_MS = 20_000;
const MAX_REPORTED = 20;

/** Nearest ancestor holding a .git entry, or the file directory. */
function findRepoRoot(filePath) {
  let dir = dirname(resolve(filePath));
  for (let depth = 0; depth < 40; depth++) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirname(resolve(filePath));
}

function runScanner(filePath, repoRoot) {
  const result = spawnSync(process.execPath, [
    SCANNER, filePath, `--root=${repoRoot}`, "--format=json", `--rules=${FILE_RULES}`,
  ], { encoding: "utf8", timeout: SCAN_TIMEOUT_MS, cwd: repoRoot });
  if (!result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function report(header, lines, tail) {
  const shown = lines.slice(0, MAX_REPORTED);
  const extra = lines.length - shown.length;
  const body = [header, "", ...shown, extra > 0 ? `... and ${extra} more.` : "", "", tail];
  process.stderr.write(`${body.filter(Boolean).join("\n")}\n`);
  return 2;
}

export function successMessage(filePath) {
  return `quality-guard file-local feedback passed for ${filePath}. This is not commit evidence.\n`
    + "Run quality-guard check --staged before committing.";
}

function absoluteTail(repoRoot) {
  const sentinel = join(repoRoot, ".quality-skip");
  return (
    "This file-local hard bound applies before a baseline exists or knows this file. Split it up.\n"
    + `To waive this one write: touch "${sentinel}"\n`
    + "Before committing, run: quality-guard check --staged"
  );
}

function trackedTail(filePath, repoRoot) {
  const sentinel = join(repoRoot, ".quality-skip");
  return (
    "Fix the new violations, or split the change. The baseline records what was\n"
    + "already there, so only the increase blocks. Run the scanner directly:\n"
    + `  node "${SCANNER}" "${filePath}" --root="${repoRoot}"\n`
    + `To waive this tracked regression once: echo '{"rebaseline": true}' > "${sentinel}"\n`
    + "Before committing, run: quality-guard check --staged"
  );
}

/**
 * Honour a sentinel. A plain sentinel waives file-local hard bounds. A
 * tracked-file regression needs `{"rebaseline": true}`. Either way, the
 * consumption is logged and the sentinel is deleted without writing a baseline.
 */
export function waive(repoRoot, sentinel, context) {
  if (!sentinel) return false;
  if (!context.isNew && !sentinel.rebaseline) return false;
  recordConsumption(repoRoot, { ...context.record, rebaseline: sentinel.rebaseline === true });
  deleteSentinel(repoRoot);
  return true;
}

/**
 * A file the baseline has never scanned has no comparison point. It receives
 * normal file-local hard bounds whether Git tracks it or not.
 */
function unseenVerdict(comparison, relPath) {
  return comparison === null || comparison.newFiles.includes(relPath);
}

export function gate(input, filePath, deps) {
  const { readBaseline, compareToBaseline } = deps;
  const repoRoot = findRepoRoot(filePath);
  const baselinePath = join(repoRoot, BASELINE);

  const scan = runScanner(filePath, repoRoot);
  if (!scan || !Array.isArray(scan.violations)) return 0;
  const relPath = relative(repoRoot, resolve(filePath)).split("\\").join("/");

  let comparison = null;
  if (existsSync(baselinePath)) {
    try {
      comparison = compareToBaseline(scan.violations, readBaseline(baselinePath), [relPath]);
    } catch {
      return 0;
    }
  }

  const isUnseen = unseenVerdict(comparison, relPath);
  const blocking = isUnseen
    ? absoluteVerdict(scan.violations)
    : ratchetVerdict(comparison, relPath, scan.violations);

  const waived = blocking.length > 0
    && waive(repoRoot, readSentinel(repoRoot), { isNew: isUnseen, record: { file: relPath, reasons: blocking } });

  if (blocking.length > 0 && !waived) {
    return report(
      `quality-guard blocked this file-local write. ${filePath} did not pass its applicable check.`,
      blocking,
      isUnseen ? absoluteTail(repoRoot) : trackedTail(filePath, repoRoot),
    );
  }

  const findings = scopeToChangedLines(input, runProjectLinter(filePath, repoRoot));
  if (findings.length > 0) {
    return report(
      `The project linter rejected lines this edit wrote in ${filePath}.`,
      findings.map((f) => `${f.line}: ${f.rule ? `[${f.rule}] ` : ""}${f.message}`),
      "These rules come from the repository config, not from this hook.",
    );
  }
  process.stderr.write(`${successMessage(filePath)}\n`);
  return 0;
}

export function shouldGate(input) {
  if (!input || process.env.QUALITY_GUARD === "off") return false;
  return hookTargets(input).some(({ filePath }) => {
    if (!CODE_EXT.has(extname(filePath).toLowerCase())) return false;
    if (!existsSync(filePath)) return false;
    return !/quality-guard:\s*off/i.test(readFileSync(filePath, "utf8").slice(0, 500));
  });
}

async function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return 0;
  }
  if (!shouldGate(input)) return 0;
  const baselineLib = await import("./baseline-lib.mjs");
  for (const target of hookTargets(input)) {
    if (!existsSync(target.filePath)) continue;
    if (!CODE_EXT.has(extname(target.filePath).toLowerCase())) continue;
    if (/quality-guard:\s*off/i.test(readFileSync(target.filePath, "utf8").slice(0, 500))) continue;
    const code = await gate(target.input, target.filePath, baselineLib);
    if (code !== 0) return code;
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch(() => process.exit(0));
}
