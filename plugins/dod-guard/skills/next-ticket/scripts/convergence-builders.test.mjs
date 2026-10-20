import assert from "node:assert/strict";
import test from "node:test";
import { recordsWithRequiredKeys, reviewLenses } from "./convergence-builders.mjs";
import { REQUIRED_RECORDS } from "./convergence-core.mjs";

function byId(lenses) {
  return Object.fromEntries(lenses.map((lens) => [lens.id, lens]));
}

test("review lenses cite the matrix rows each lens id owns", () => {
  const lenses = byId(reviewLenses({ headSha: "h" }));
  assert.deepEqual(Object.keys(lenses), ["implementation", "wiring/usability", "quality", "reliability"]);
  assert.equal(lenses.implementation.acceptanceEvidence, "evidence-1");
  assert.deepEqual(lenses["wiring/usability"].acceptanceEvidence, ["evidence-2", "evidence-3"]);
  assert.deepEqual(lenses.reliability.acceptanceEvidence, ["evidence-4", "evidence-5"]);
  assert.equal(lenses.quality.acceptanceEvidence, "evidence-6");
  assert.deepEqual(lenses["wiring/usability"].verificationEvidence, ["proof-2", "proof-3"]);
  assert.equal(lenses.quality.headSha, "h");
  assert.equal(lenses.quality.owner, "task-1");
  assert.equal(lenses.quality.evidence, "lens-quality");
});

test("a prefix renames the cited evidence and proof", () => {
  const lenses = byId(reviewLenses({ headSha: "h", prefix: "matrix-" }));
  assert.equal(lenses.implementation.acceptanceEvidence, "matrix-evidence-1");
  assert.deepEqual(lenses.reliability.verificationEvidence, ["matrix-proof-4", "matrix-proof-5"]);
});

test("an owner function is called with the lens id and index", () => {
  const calls = [];
  const lenses = reviewLenses({
    headSha: "h",
    owner: (id, index) => {
      calls.push([id, index]);
      return `owner-${index}`;
    },
  });
  assert.deepEqual(calls[1], ["wiring/usability", 1]);
  assert.deepEqual(
    lenses.map((lens) => lens.owner),
    ["owner-0", "owner-1", "owner-2", "owner-3"],
  );
});

test("required records are present and carry the lens-ownership value", () => {
  const ownership = [{ id: "implementation" }];
  const records = recordsWithRequiredKeys(ownership);
  assert.equal(records["lens-ownership"], ownership);
  for (const name of REQUIRED_RECORDS.filter((record) => record !== "lens-ownership")) {
    assert.equal(records[name], true);
  }
});
