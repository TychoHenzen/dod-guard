import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SCANNER = join(
  HERE,
  "..",
  "skills",
  "quality-refactor",
  "scripts",
  "quality-scan.mjs",
);
const BASELINE = join(".github", "quality", "quality-baseline.json");
export const FILE_RULES =
  "file-length,function-length,complexity,param-count," +
  "nesting-depth,types-per-file,else-branch,unnamed-tuple," +
  "unused-local,commented-out-code,todo-marker,stateless-method," +
  "comment-bloat,comment-restates-code,comment-metadata,comment-placeholder," +
  "output-parameter,flag-parameter,wildcard-import";
const SCAN_TIMEOUT_MS = 20_000;

export function baselinePath(repoRoot) {
  return join(repoRoot, BASELINE);
}

export function findRepoRoot(filePath) {
  let dir = dirname(resolve(filePath));
  while (true) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function runScanner(filePath, repoRoot, rules = FILE_RULES) {
  const result = spawnSync(
    process.execPath,
    [
      SCANNER,
      filePath,
      `--root=${repoRoot}`,
      "--format=json",
      `--rules=${rules}`,
    ],
    { encoding: "utf8", timeout: SCAN_TIMEOUT_MS, cwd: repoRoot },
  );
  if (!result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function scanFile({ filePath, repoRoot, scanner, rules = FILE_RULES }) {
  try {
    const scan = scanner(filePath, repoRoot, rules);
    if (!scan || !Array.isArray(scan.violations))
      return { error: "scanner did not return a readable report." };
    return { scan };
  } catch (error) {
    return { error: `scanner failed: ${errorMessage(error)}` };
  }
}

function readComparison({ baseline, scan, relPath, deps }) {
  if (!existsSync(baseline)) return { ok: true, value: null };
  try {
    return {
      ok: true,
      value: deps.compareToBaseline(
        scan.violations,
        deps.readBaseline(baseline),
        [relPath],
      ),
    };
  } catch {
    return { ok: false, value: null };
  }
}

export function compareFile({ baseline, scan, relPath, services }) {
  return readComparison({ baseline, scan, relPath, deps: services });
}

export function relativePath(repoRoot, filePath) {
  return relative(repoRoot, resolve(filePath)).split("\\").join("/");
}
