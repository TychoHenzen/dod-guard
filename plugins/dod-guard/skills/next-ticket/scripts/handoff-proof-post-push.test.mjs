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
import {
  bodyWithLensRecords,
  firstLensStores,
  staleLensEntries,
  UNPUSHED_HEAD,
} from "./testing/handoff-proof-lens-bodies.mjs";

test("post-push verifies the 904 body with the handoff rows at their head", async () => {
  assert.deepEqual(await gate("post-push"), { status: 0, json: { outcome: "verified", remainder: [] } });
});

test("post-push names the stale row and the lens evidence bound to it, and nothing else", async () => {
  const result = await gate("post-push", { handoff: buildHandoff(withStaleRow(ROWS_904)) });

  assert.deepEqual(result, {
    status: 1,
    json: {
      outcome: "actionable remainder",
      remainder: [
        `acceptance matrix: R1 is bound to head deadbeef, expected ${HEAD_904}`,
        `implementation review lens acceptance evidence ev-ac1-ok-line is bound to deadbeef, expected ${HEAD_904}`,
        `implementation review lens verification evidence proof-ac1-ok-line is bound to deadbeef, expected ${HEAD_904}`,
      ],
    },
  });
});

test("post-push names exactly the one lens that stores a different head", async () => {
  // The #904 body stores no lens head, so a stale lens needs a body that stores one.
  const { status, json } = await gate("post-push", {
    body: bodyWithLensRecords(firstLensStores(HEAD_904)),
    head: UNPUSHED_HEAD,
  });

  assert.equal(status, 1);
  assert.deepEqual(staleLensEntries(json), [
    `implementation review lens is not bound to handoff head ${UNPUSHED_HEAD}`,
  ]);
});

test("post-push accepts a handoff with no checkpoint", async () => {
  assert.equal((await gate("post-push")).status, 0);
});

test("post-push names a pending context when a checkpoint exists", async () => {
  const result = await gate("post-push", { checkpoint: checkpointRows(HEAD_904, "pending") });

  assert.equal(result.status, 1);
  assert.ok(result.json.remainder.includes("required context build-test is pending"), JSON.stringify(result.json));
});

test("post-push exits 1 and names every row except the one re-observed at the new head", async () => {
  const handoff = buildHandoff(ROWS_904.map((row, index) => (index === 0 ? row : { ...row, headSha: "deadbeef" })));
  const { status, json } = await gate("post-push", { handoff });

  assert.equal(status, 1);
  const staleRows = json.remainder
    .filter((line) => line.startsWith("acceptance matrix: "))
    .map((line) => line.split(" ")[2]);
  assert.deepEqual(
    staleRows,
    ROWS_904.slice(1).map((row) => row.id),
  );
});
