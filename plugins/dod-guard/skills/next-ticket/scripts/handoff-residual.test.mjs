// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { test as it } from "node:test";
import { readHandoffMatrix } from "../../../lib/handoff-matrix.mjs";
import { pendingMatrixRows } from "../../complete-pr/scripts/lib/closure-records.mjs";
import { build, evidenceFor } from "./testing/handoff-build-harness.mjs";
import { BODY_TEXT, gate, run, withTempFile } from "./testing/handoff-proof-harness.mjs";

// The #904 body with its planned row R1 opted in to accepted residuals by the given value.
const optIn = (value) =>
  BODY_TEXT.replace(
    '{"id": "R1", "contract": "AC-1",',
    `{"id": "R1", "acceptsResiduals": ${JSON.stringify(value)}, "contract": "AC-1",`,
  );
const ACCEPTING = optIn(true);
// Any issue number serves: the proofs check a deferral for shape only, never for an open issue.
const TAKEN_BY = 1055;
const VERIFIED = { status: 0, json: { outcome: "verified", remainder: [] } };

function deferring(list) {
  const evidence = evidenceFor();
  evidence.rows.R1.deferredTo = list;
  return evidence;
}

const refinement = (body) => withTempFile("body.md", body, (file) => run("refinement", `--body-file=${file}`));

it("refinement takes a planned row that accepts residuals and refuses an opt-in that is not true", async () => {
  assert.notEqual(ACCEPTING, BODY_TEXT);
  assert.deepEqual(await refinement(ACCEPTING), VERIFIED);
  assert.deepEqual(await refinement(optIn("yes")), {
    status: 1,
    json: {
      outcome: "actionable remainder",
      remainder: ["acceptance matrix: R1 acceptsResiduals must be true when present"],
    },
  });
});

it("builds a deferring pass row that every gate accepts and leaves no row pending", async () => {
  const { code, out } = await build(deferring([TAKEN_BY]), ACCEPTING);
  assert.equal(code, 0);
  const { rows } = readHandoffMatrix(out);
  assert.deepEqual(rows.find((row) => row.id === "R1").deferredTo, [TAKEN_BY]);
  assert.deepEqual(await gate("post-push", { body: ACCEPTING, handoff: out }), VERIFIED);
  assert.deepEqual(await gate("finalization", { body: ACCEPTING, handoff: out }), VERIFIED);
  assert.deepEqual(pendingMatrixRows(rows), []);
});

it("refuses a deferral when the planned row does not accept residuals", async () => {
  const { code, out, err } = await build(deferring([TAKEN_BY]));
  assert.equal(code, 1);
  assert.equal(out, "");
  assert.ok(err.includes("row R1 entry defers residuals, but its planned row does not accept them"), err);
});

it("post-push refuses a deferring handoff against a body that does not opt in", async () => {
  const { out } = await build(deferring([TAKEN_BY]), ACCEPTING);
  const result = await gate("post-push", { body: BODY_TEXT, handoff: out });
  assert.equal(result.status, 1);
  assert.ok(
    result.json.remainder.includes("acceptance matrix: R1 defers residuals, but its planned row does not accept them"),
    JSON.stringify(result.json),
  );
});

it("refuses an empty deferral and builds once it names an issue", async () => {
  const empty = await build(deferring([]), ACCEPTING);
  assert.equal(empty.code, 1);
  assert.ok(empty.err.includes("row R1 entry deferredTo must be a non-empty list of issue numbers"), empty.err);
  const named = await build(deferring([TAKEN_BY]), ACCEPTING);
  assert.equal(named.code, 0);
});
