// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { assertPatchCount } from "./fixtures/project-status-calls.mjs";
import { ITEM_IDS } from "./fixtures/project-status-data.mjs";
import { alterTargetInLaterReads, timedOutPatchRunner } from "./fixtures/project-status-lag.mjs";
import { backlogRunner, numericIdOf, writeItems } from "./fixtures/project-status-write.mjs";
import { createRunner } from "./project-status-fixtures.mjs";

const IDENTITY_SHIFT = 1000;
const IDENTITY_CHANGE_ERROR = /same numeric and global IDs/;
const UNAPPLIED_WRITE_ERROR = /status mutation failed.*read back Backlog, expected Done/;

function rerunFrom(numericId, statuses) {
  const rerun = createRunner({ statuses });
  return { result: writeItems([numericId], rerun.runner), rerun };
}

test("AC-03 rerun after an identity-change stop makes no PATCH once the item already holds Done", () => {
  const numericId = numericIdOf(0);
  const { calls, runner } = backlogRunner();
  const shifted = alterTargetInLaterReads(runner, (item) => ({ ...item, id: item.id + IDENTITY_SHIFT }));

  assert.throws(() => writeItems([numericId], shifted), IDENTITY_CHANGE_ERROR);
  assertPatchCount(calls, 1);
  const { result, rerun } = rerunFrom(numericId, new Map([[ITEM_IDS[0], "Done"]]));
  assert.deepEqual(result.mutations, [{ itemId: numericId, status: "Done", changed: false }]);
  assertPatchCount(rerun.calls, 0);
});

test("AC-03 rerun after an unapplied ambiguous numeric write makes no PATCH once the item holds Done", () => {
  const numericId = numericIdOf(0);
  const statuses = new Map([[ITEM_IDS[0], "Backlog"]]);
  const fixture = createRunner({ statuses });

  assert.throws(() => writeItems([numericId], timedOutPatchRunner(fixture)), UNAPPLIED_WRITE_ERROR);
  assertPatchCount(fixture.calls, 1);
  statuses.set(ITEM_IDS[0], "Done");
  const { result, rerun } = rerunFrom(numericId, statuses);
  assert.deepEqual(result.mutations, [{ itemId: numericId, status: "Done", changed: false }]);
  assertPatchCount(rerun.calls, 0);
});
