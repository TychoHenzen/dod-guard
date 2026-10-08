import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireSeverity } from "../skills/quality-refactor/scripts/lib/severity.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SCANNER = join(
  HERE,
  "..",
  "skills",
  "quality-refactor",
  "scripts",
  "quality-scan.mjs",
);
export const FILE_RULES =
  "file-length,partial-type-length,function-length,complexity,param-count," +
  "nesting-depth,types-per-file,else-branch,unnamed-tuple," +
  "unused-local,commented-out-code,todo-marker,stateless-method," +
  "comment-bloat,comment-restates-code,comment-metadata,comment-placeholder," +
  "output-parameter,flag-parameter,wildcard-import";
const SCAN_TIMEOUT_MS = 20_000;

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
    for (const violation of scan.violations) {
      requireSeverity(violation.severity);
    }
    return { scan };
  } catch (error) {
    return { error: `scanner failed: ${errorMessage(error)}` };
  }
}
