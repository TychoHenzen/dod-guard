import assert from "node:assert/strict";
import test from "node:test";
import { buildHandoff, gate, HEAD_904, ROWS_904 } from "./testing/handoff-proof-harness.mjs";
import {
  bodyWithLensRecords,
  firstLensStores,
  HEAD_B,
  headless,
  staleAt,
  staleLensEntries,
} from "./testing/handoff-proof-lens-bodies.mjs";

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
