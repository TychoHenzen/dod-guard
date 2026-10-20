import assert from "node:assert/strict";
import test from "node:test";
import { acceptanceMatrix } from "./passing-matrix.mjs";

const ROW_COUNT = 6;

test("the default matrix keeps the evidence-N and proof-N strings", () => {
  const rows = acceptanceMatrix("h1");
  assert.equal(rows.length, ROW_COUNT);
  assert.deepEqual(rows[0], {
    id: "AC-1-1",
    contract: "AC-1",
    path: rows[0].path,
    proof: "proof-1",
    expected: "expected-1",
    observed: "observed-1",
    status: "pass",
    evidence: "evidence-1",
    headSha: "h1",
  });
});

test("a prefix renames the evidence and proof strings only", () => {
  const rows = acceptanceMatrix("h1", "AC-1", "matrix-");
  assert.equal(rows.length, ROW_COUNT);
  assert.equal(rows[0].evidence, "matrix-evidence-1");
  assert.equal(rows[0].proof, "matrix-proof-1");
  assert.equal(rows[0].id, "AC-1-1");
  assert.equal(rows[0].expected, "expected-1");
});
