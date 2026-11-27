import assert from "node:assert/strict";
import test from "node:test";
import { cli } from "./review-batch-cli.test-support.mjs";

const { HEAD, cut, readJson, run, scratch } = cli;
const HEX16 = /^[0-9a-f]{16}$/;

test("batches writes one stamped file per batch", () => {
  const dir = scratch();
  const { planHash, batches, body, comment } = cut(dir);
  assert.match(planHash, HEX16);
  // The largest body the review can post is known before any investigator runs.
  assert.equal(body.cap, 8000);
  assert.ok(body.bound > 0 && body.bound <= body.cap, JSON.stringify(body));
  // So is the largest inline comment.
  assert.equal(comment.cap, 2000);
  assert.ok(comment.bound > 0 && comment.bound <= comment.cap, JSON.stringify(comment));
  assert.ok(batches.length > 0);
  for (const { file, batch } of batches) {
    const doc = readJson(file);
    assert.equal(doc.planHash, planHash);
    assert.equal(doc.headSha, HEAD);
    assert.equal(doc.batch, batch);
    assert.ok(Array.isArray(doc.questions));
  }
});

test("batches and answers without a flag print usage", () => {
  for (const command of ["batches", "answers"]) {
    const result = run(command, []);
    assert.equal(result.status, 3, command);
    assert.ok(result.stderr.startsWith("Usage:"), command);
  }
});
