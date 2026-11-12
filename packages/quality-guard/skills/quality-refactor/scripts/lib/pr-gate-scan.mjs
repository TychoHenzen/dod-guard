import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { loadExcludePaths } from "./exclusion-config.mjs";
import { exportTree } from "./merge-base-tree.mjs";
import { parseNameStatus } from "./pr-gate-paths.mjs";

const SCAN = fileURLToPath(new URL("../quality-scan.mjs", import.meta.url));

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(
      `git ${args[0]} failed: ${result.error?.message ?? result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

export function changedFiles(base, cwd) {
  // Deleted files are included so removing a file that carried findings pays
  // down the cleanup quota.
  const output = git(
    ["diff", "--name-status", "-M", "--diff-filter=ACDMR", `${base}...HEAD`],
    cwd,
  );
  return parseNameStatus(output);
}

function spawnFailure(result) {
  if (result.error) return result.error.message;
  return result.status === 0 ? undefined : result.stderr.trim();
}

export function scanViolations(dir, excludes) {
  const args = [
    SCAN,
    ".",
    "--format=json",
    `--root=${dir}`,
    "--no-config",
    ...excludes.map((x) => `--exclude=${x}`),
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  const failure = spawnFailure(result);
  if (failure !== undefined) throw new Error(`quality-scan failed: ${failure}`);
  return summarizeScan(JSON.parse(result.stdout));
}

function summarizeScan(parsed) {
  return {
    violations: parsed.violations ?? [],
    fileCount: parsed.fileCount ?? 0,
  };
}

// The merge base is exported to a private directory, with no git worktree, so
// the scan sees exactly the upstream files. Its .quality-guard.json is the only
// setting that counts, so a pull request cannot change its own exclusions.
export function scanMergeBase(options, cwd) {
  const mergeBase = git(["merge-base", options.base, "HEAD"], cwd).trim();
  const { dir, cleanup } = exportTree(cwd, mergeBase);
  try {
    const excludes = [...options.excludes, ...loadExcludePaths(dir)];
    const { violations } = scanViolations(dir, excludes);
    return { mergeBase, excludes, violations };
  } finally {
    cleanup();
  }
}
