// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { ITEM_IDS } from "./fixtures/project-status-data.mjs";
import { backlogRunner, writeOptions } from "./fixtures/project-status-write.mjs";
import { writeProjectStatusesWithFallback } from "./project-status.mjs";
import { createRunner } from "./project-status-fixtures.mjs";

test("routes MCP rate-limit writes through guarded REST readback without duplicate PATCHes", async () => {
  for (const failure of [
    Object.assign(new Error("API rate limit exceeded"), { status: 429 }),
    Object.assign(new Error("API rate limit exceeded token=secret"), {
      status: 403,
      headers: { "X-RateLimit-Reset": "1700000000" },
    }),
  ]) {
    const { calls, runner } = backlogRunner();
    const evidence = [];
    let primaryCalls = 0;
    const result = await writeProjectStatusesWithFallback({
      ...writeOptions({ itemIds: [ITEM_IDS[0]] }),
      commandRunner: runner,
      evidence,
      primaryMutation: async () => {
        primaryCalls += 1;
        throw failure;
      },
    });

    assert.equal(result.transport, "rest");
    assert.equal(primaryCalls, 1);
    assert.equal(calls.filter((args) => args.includes("PATCH")).length, 1);
    assert.deepEqual(result.value.mutations, [{ itemId: ITEM_IDS[0], status: "Done" }]);
    assert.equal(evidence[0].failure.category, "mcp_rate_limit");
    assert.doesNotMatch(evidence[0].failure.message, /secret/);
  }

  const statuses = new Map([[ITEM_IDS[0], "Backlog"]]);
  const { calls, runner } = createRunner({ statuses });
  const result = await writeProjectStatusesWithFallback({
    ...writeOptions({ itemIds: [ITEM_IDS[0]] }),
    commandRunner: runner,
    primaryMutation: async () => {
      statuses.set(ITEM_IDS[0], "Done");
      throw Object.assign(new Error("API rate limit exceeded"), { status: 429 });
    },
  });
  assert.equal(result.transport, "rest");
  assert.equal(calls.filter((args) => args.includes("PATCH")).length, 0);

  const unresolvedStatuses = new Map([[ITEM_IDS[0], "Backlog"]]);
  const unresolved = createRunner({ statuses: unresolvedStatuses });
  const unresolvedRunner = (args) => {
    const value = unresolved.runner(args);
    if (args.includes("PATCH")) unresolvedStatuses.set(ITEM_IDS[0], "Backlog");
    return value;
  };
  await assert.rejects(
    writeProjectStatusesWithFallback({
      ...writeOptions({ itemIds: [ITEM_IDS[0]] }),
      commandRunner: unresolvedRunner,
      primaryMutation: async () => {
        throw Object.assign(new Error("API rate limit exceeded"), { status: 429 });
      },
    }),
    (error) => error.details.restFailure.message.includes("read back Backlog, expected Done"),
  );
  assert.equal(unresolved.calls.filter((args) => args.includes("PATCH")).length, 1);
});
