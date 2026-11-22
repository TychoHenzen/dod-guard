// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { batchDocuments, batchName, cutBatches } from "./batch-cut.mjs";
import { planHash } from "./plan-hash.mjs";
import { HEAD, questions, TEN } from "./review-batches.test-support.mjs";

test("cutBatches keeps a slot together and never passes eight", () => {
  const plan = [
    { slot: "a", questions: questions(5, "a") },
    { slot: "b", questions: questions(5, "b") },
    { slot: "c", questions: questions(3, "c") },
  ];
  const batches = cutBatches(plan);
  assert.deepEqual(
    batches.map((batch) => batch.length),
    [5, 8],
  );
  assert.ok(batches[0].every((q) => q.slot === "a"));
});

test("cutBatches splits a slot of ten into eight and two", () => {
  assert.deepEqual(
    cutBatches(TEN).map((batch) => batch.length),
    [8, 2],
  );
});

test("cutBatches adds nothing for an exclusion", () => {
  assert.deepEqual(cutBatches([{ slot: "s1", excluded: { lens: "l", reason: "r" } }]), []);
});

test("batchDocuments stamps every batch", () => {
  const docs = batchDocuments(TEN, HEAD);
  assert.deepEqual(
    docs.map((doc) => doc.batch),
    [batchName(0), batchName(1)],
  );
  assert.deepEqual(
    docs.map((doc) => doc.batch),
    ["b01", "b02"],
  );
  for (const doc of docs) {
    assert.equal(doc.planHash, planHash(TEN));
    assert.equal(doc.headSha, HEAD);
  }
});
