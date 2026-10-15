// Builds throwaway git repositories under the OS temp directory and runs the
// gate CLI in them, because the gate shells out to git and scans a merge-base
// worktree that only a real repository can provide.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { writeTree } from "./formatter-width-test-support.mjs";

const GATE = fileURLToPath(
  new URL(
    "../../../../../skills/quality-refactor/scripts/quality-pr-gate.mjs",
    import.meta.url,
  ),
);

const IDENTITY = ["-c", "user.email=t@example.test", "-c", "user.name=t"];

export function git(cwd, ...args) {
  const result = spawnSync("git", [...IDENTITY, ...args], {
    cwd,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
}

// Most cases only vary src/a.js, so a bare string stands for that file.
function commitTree(repo, tree, message) {
  const files = typeof tree === "string" ? { "src/a.js": tree } : tree;
  writeTree(repo, files);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", message);
}

// `base` lands on main and `head` on a feature branch on top of it, so the
// head tree only needs the files the pull request changes.
export function pullRequest(t, { base, head }) {
  const repo = mkdtempSync(join(tmpdir(), "quality-pr-gate-test-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  git(repo, "init", "-q", "-b", "main");
  commitTree(repo, base, "base");
  git(repo, "checkout", "-q", "-b", "feature");
  commitTree(repo, head, "head");
  return repo;
}

export function runGate(repo, ...extra) {
  const report = join(repo, "report.md");
  const comment = join(repo, "comment.md");
  const args = [
    GATE,
    "--base=main",
    "--root=src",
    `--report=${report}`,
    `--comment=${comment}`,
    ...extra,
  ];
  return {
    ...spawnSync(process.execPath, args, { cwd: repo, encoding: "utf8" }),
    report,
    comment,
  };
}

// Calls the gate without the report flags, for cases that must fail before
// any output is written.
export function runBareGate(repo, ...args) {
  return spawnSync(process.execPath, [GATE, ...args], {
    cwd: repo,
    encoding: "utf8",
  });
}
