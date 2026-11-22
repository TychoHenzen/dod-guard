// Fixtures the archon-* script tests share: a temporary directory removed
// after the test, git calls that fail the test on a non-zero exit, and an
// initialised repository with a fixed identity and no line-ending rewrites.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function scratch(t, prefix = "archon-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

export function initRepo(t, prefix) {
  const repo = scratch(t, prefix);
  git(repo, ["init", "-q"]);
  git(repo, ["config", "core.autocrlf", "false"]);
  git(repo, ["config", "user.name", "t"]);
  git(repo, ["config", "user.email", "t@example.invalid"]);
  return repo;
}

export function commitAll(repo, message = "init") {
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", message]);
}
