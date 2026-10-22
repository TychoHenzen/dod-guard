// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { ITEM_IDS } from "./fixtures/project-status-data.mjs";
import { writeOptions } from "./fixtures/project-status-write.mjs";
import { writeProjectStatusesWithFallback } from "./project-status.mjs";
import { createRunner } from "./project-status-fixtures.mjs";

test("routes an interactive status form only after a no-op readback", async () => {
  const statuses = new Map([[ITEM_IDS[0], "Backlog"]]);
  const { calls, runner } = createRunner({ statuses });
  const phases = [];
  let primaryCalls = 0;
  const result = await writeProjectStatusesWithFallback({
    ...writeOptions({ itemIds: [ITEM_IDS[0]] }),
    commandRunner: runner,
    primaryMutation: async () => {
      primaryCalls += 1;
      return { isError: true, structuredContent: { status: "awaiting_user_submission" } };
    },
    readback: async ({ phase }) => {
      phases.push(phase);
      return { mutated: phase === "after-fallback" };
    },
  });

  assert.equal(result.transport, "rest");
  assert.equal(primaryCalls, 1);
  assert.deepEqual(phases, ["before-fallback", "after-fallback"]);
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 1);
  assert.deepEqual(result.value.mutations, [{ itemId: ITEM_IDS[0], status: "Done" }]);
});
