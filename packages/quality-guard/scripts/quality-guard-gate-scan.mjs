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
const FILE_RULES =
  "file-length,function-length,complexity,param-count," +
  "nesting-depth,types-per-file,else-branch,unnamed-tuple," +
  "unused-local,commented-out-code,todo-marker,stateless-method," +
  "comment-bloat,comment-restates-code";
const SCAN_TIMEOUT_MS = 20_000;

export function baselinePath(repoRoot) {
  return join(repoRoot, BASELINE);
}

export function findRepoRoot(filePath) {
  let dir = dirname(resolve(filePath));
  for (let depth = 0; depth < 40; depth++) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirname(resolve(filePath));
}

export function runScanner(filePath, repoRoot) {
  const result = spawnSync(
    process.execPath,
    [
      SCANNER,
      filePath,
      `--root=${repoRoot}`,
      "--format=json",
      `--rules=${FILE_RULES}`,
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

export function readComparison({ baseline, scan, relPath, deps }) {
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

export function relativePath(repoRoot, filePath) {
  return relative(repoRoot, resolve(filePath)).split("\\").join("/");
}
