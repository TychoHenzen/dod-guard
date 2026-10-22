// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";

const RECOVERY_FLAG = /--recover-merged/;
const PUSHED_HEAD_FLAG = /--pushed-head/;
const VERIFIED_HEAD_SHA = /verified-head-sha/;

test("rejects a dry-run flag without merged-recovery mode", () => {
  const result = spawnSync(process.execPath, ["complete-pr.mjs", "owner/repo", "24", "--dry-run"], {
    cwd: import.meta.dirname,
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, RECOVERY_FLAG);
});

test("requires a verified pushed head for normal completion", () => {
  const result = spawnSync(process.execPath, ["complete-pr.mjs", "owner/repo", "24"], {
    cwd: import.meta.dirname,
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, PUSHED_HEAD_FLAG);
});

test("rejects a malformed pushed head", () => {
  const result = spawnSync(process.execPath, ["complete-pr.mjs", "owner/repo", "24", "--pushed-head", "not-a-sha"], {
    cwd: import.meta.dirname,
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, VERIFIED_HEAD_SHA);
});

test("usage errors still exit 2 with empty stdout", () => {
  const result = spawnSync(process.execPath, ["complete-pr.mjs", "owner/repo", "24"], {
    cwd: import.meta.dirname,
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
});
