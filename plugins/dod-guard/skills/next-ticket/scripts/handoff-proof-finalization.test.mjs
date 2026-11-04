import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHandoff,
  checkpointRows,
  gate,
  HEAD_904,
  ROWS_904,
  withStaleRow,
} from "./testing/handoff-proof-harness.mjs";
import { staleAt, UNPUSHED_HEAD } from "./testing/handoff-proof-lens-bodies.mjs";

test("finalization verifies the 904 body at the head the handoff names", async () => {
  assert.deepEqual(await gate("finalization"), { status: 0, json: { outcome: "verified", remainder: [] } });
});

test("finalization on a stale head names every row and lens evidence bound to the old head", async () => {
  const result = await gate("finalization", { head: UNPUSHED_HEAD });

  assert.deepEqual(result, {
    status: 1,
    json: { outcome: "actionable remainder", remainder: staleAt(HEAD_904, UNPUSHED_HEAD) },
  });
});

test("finalization and post-push agree on the same inputs", async () => {
  for (const rows of [ROWS_904, withStaleRow(ROWS_904)]) {
    const handoff = buildHandoff(rows);
    const postPush = await gate("post-push", { handoff });
    const finalization = await gate("finalization", { handoff });

    assert.equal(finalization.status, postPush.status);
    assert.deepEqual(finalization.json, postPush.json);
  }
});

test("finalization fails and names a failed required context", async () => {
  const [build, guard] = checkpointRows();
  const result = await gate("finalization", { checkpoint: [build, { ...guard, state: "failed" }] });

  assert.equal(result.status, 1);
  assert.ok(result.json.remainder.includes("required context quality-guard is failed"), JSON.stringify(result.json));
});

test("finalization fails when the handoff has no checkpoint", async () => {
  const result = await gate("finalization", { checkpoint: null });

  assert.equal(result.status, 1);
  assert.ok(
    result.json.remainder.includes("handoff has no ## Preflight checkpoint section"),
    JSON.stringify(result.json),
  );
});

test("finalization passes present and skipped rows at the head", async () => {
  const [build, guard] = checkpointRows();
  const rows = [build, { ...guard, state: "skipped" }];

  assert.deepEqual(await gate("finalization", { checkpoint: rows }), {
    status: 0,
    json: { outcome: "verified", remainder: [] },
  });
});
