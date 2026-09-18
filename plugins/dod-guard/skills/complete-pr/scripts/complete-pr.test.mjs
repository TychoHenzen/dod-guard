// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import process from "node:process";

const RECOVERY_FLAG = /--recover-merged/;

test("rejects a dry-run flag without merged-recovery mode", () => {
  const result = spawnSync(process.execPath, ["complete-pr.mjs", "owner/repo", "24", "--dry-run"], {
    cwd: import.meta.dirname,
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, RECOVERY_FLAG);
});
