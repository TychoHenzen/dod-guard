// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { assertPatchCount, isSingleItemRead } from "./fixtures/project-status-calls.mjs";
import { ITEM_IDS } from "./fixtures/project-status-data.mjs";
import { backlogRunner, numericIdOf, writeFirst, writeItems } from "./fixtures/project-status-write.mjs";

test("a failed PATCH reports its own text or exit status in the stop message", () => {
  const cases = [
    [{ status: 1, stderr: "gh: boom", stdout: "" }, "gh: boom"],
    [{ status: 1, stderr: "", stdout: "" }, "Project status mutation exited with 1."],
  ];
  for (const [failure, detail] of cases) {
    const { runner } = backlogRunner();
    const failing = (args) => (args.includes("PATCH") ? failure : runner(args));

    assert.throws(() => writeFirst(failing), {
      message: `Project item ${ITEM_IDS[0]} status mutation failed (${detail}); read back Backlog, expected Done.`,
    });
  }
});

test("a non-404 single-item read failure with no output reports the exit status", () => {
  const numericId = numericIdOf(0);
  const { calls, runner } = backlogRunner();
  const failing = (args) => (isSingleItemRead(args) ? { status: 1, stderr: "", stdout: "" } : runner(args));

  assert.throws(() => writeItems([numericId], failing), {
    message: `Project item ${numericId} read exited with 1.`,
  });
  assertPatchCount(calls, 0);
});
