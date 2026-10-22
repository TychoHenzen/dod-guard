import assert from "node:assert/strict";
import test from "node:test";
import {
  BODY_TEXT,
  buildHandoff,
  checkpointRows,
  gate,
  HEAD_904,
  LENSES_904,
  ROWS_904,
  withStaleRow,
} from "./testing/handoff-proof-harness.mjs";

const UNPUSHED_HEAD = "cccccccccccccccccccccccccccccccccccccccc";
const HEAD_B = "1111111111111111111111111111111111111111";
const LENS_OWNERSHIP_BLOCK = /### lens-ownership\r?\n[\s\S]*?```json\r?\n([\s\S]*?)\r?\n```/;
const STALE_LENS = /review lens is not bound to handoff head/;
function bodyWithLensRecords(transform) {
  const [, block] = LENS_OWNERSHIP_BLOCK.exec(BODY_TEXT);
  const records = JSON.parse(block).map(transform);
  return BODY_TEXT.replace(block, JSON.stringify(records, null, 2));
}

const headless = ({ headSha, ...lens }) => lens;
const firstLensStores = (head) => (lens, index) =>
  index === 0 ? { ...headless(lens), headSha: head } : headless(lens);

// Every row and every lens evidence value the #904 handoff binds to `actual`,
// as the proof reports them when `expected` is the head under test.
function staleAt(actual, expected) {
  const rows = ROWS_904.map((row) => `acceptance matrix: ${row.id} is bound to head ${actual}, expected ${expected}`);
  const lenses = LENSES_904.flatMap((lens) =>
    ["acceptance", "verification"].flatMap((kind) =>
      lens[`${kind}Evidence`].map(
        (value) => `${lens.id} review lens ${kind} evidence ${value} is bound to ${actual}, expected ${expected}`,
      ),
    ),
  );
  return [...rows, ...lenses];
}

const staleLensEntries = (json) => json.remainder.filter((entry) => STALE_LENS.test(entry));

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

test("post-push accepts a handoff with no checkpoint", async () => {
  assert.equal((await gate("post-push")).status, 0);
});

test("post-push names a pending context when a checkpoint exists", async () => {
  const result = await gate("post-push", { checkpoint: checkpointRows(HEAD_904, "pending") });

  assert.equal(result.status, 1);
  assert.ok(result.json.remainder.includes("required context build-test is pending"), JSON.stringify(result.json));
});

test("a lens that stores no head passes finalization", async () => {
  const result = await gate("finalization", { body: bodyWithLensRecords(headless) });

  assert.deepEqual(result, { status: 0, json: { outcome: "verified", remainder: [] } });
});

test("a lens that stores an older head fails finalization and only that lens is named", async () => {
  const handoff = buildHandoff(ROWS_904.map((row) => ({ ...row, headSha: HEAD_B })));
  const { status, json } = await gate("finalization", {
    body: bodyWithLensRecords(firstLensStores(HEAD_904)),
    handoff,
    head: HEAD_B,
  });

  assert.equal(status, 1);
  assert.deepEqual(staleLensEntries(json), [`implementation review lens is not bound to handoff head ${HEAD_B}`]);
});

// The CardCleaner 282 replay: the #904 body was checked at head A, and a merge
// of head B must stop. The #904 body stores no lens head, so re-observing it at B
// only moves the handoff rows. The lens heads rebound below model a body that
// still stores one, which the proof must accept once it matches head B.
test("the CardCleaner 282 case: rows left at the old head stop a merge of the new head", async () => {
  assert.deepEqual(await gate("finalization", { head: HEAD_B }), {
    status: 1,
    json: { outcome: "actionable remainder", remainder: staleAt(HEAD_904, HEAD_B) },
  });
});

test("the CardCleaner 282 case: rows and lenses re-observed at the new head pass", async () => {
  const bodyAtB = bodyWithLensRecords((lens) => ({ ...lens, headSha: HEAD_B }));
  const handoffAtB = buildHandoff(ROWS_904.map((row) => ({ ...row, headSha: HEAD_B })));

  assert.deepEqual(await gate("finalization", { body: bodyAtB, handoff: handoffAtB, head: HEAD_B }), {
    status: 0,
    json: { outcome: "verified", remainder: [] },
  });
});
