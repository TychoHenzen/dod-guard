// Exports a commit's tree into a private directory without git worktree, so the
// gate also runs in repositories that forbid worktrees. A private index file
// keeps the repository's own index and working tree untouched.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

function runGit(args, cwd, env) {
  const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    const why = result.error?.message ?? result.stderr.trim();
    throw new Error(`git ${args[0]} failed: ${why}`);
  }
}

export function exportTree(cwd, rev) {
  const parent = mkdtempSync(join(tmpdir(), "quality-pr-gate-base-"));
  const dir = join(parent, "tree");
  const env = { ...process.env, GIT_INDEX_FILE: join(parent, "index") };
  const cleanup = () => rmSync(parent, { recursive: true, force: true });
  try {
    runGit(["read-tree", rev], cwd, env);
    const prefix = `${dir.replaceAll("\\", "/")}/`;
    runGit(["checkout-index", "-a", `--prefix=${prefix}`], cwd, env);
    return { dir, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
