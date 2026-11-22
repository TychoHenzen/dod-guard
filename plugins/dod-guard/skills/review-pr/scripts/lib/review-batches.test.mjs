// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { planHash } from "./plan-hash.mjs";
import { requireFreshAnswers } from "./review-batches.mjs";
import {
  answered,
  fileFor,
  HEAD,
  merge,
  questions,
  refused,
  SMALL,
  smallFile,
  TEN,
} from "./review-batches.test-support.mjs";

test("mergeAnswers joins valid files in batch order", () => {
  const first = fileFor(TEN, {
    batch: "b01",
    answers: questions(8, "q").map((q) => answered(q.id)),
  });
  const second = fileFor(TEN, {
    batch: "b02",
    answers: questions(2, "q").map((q, i) => answered(`q${9 + i}`)),
  });
  const merged = merge(
    [
      ["b02", second],
      ["b01", first],
    ],
    TEN,
  );
  assert.equal(merged.planHash, planHash(TEN));
  assert.equal(merged.headSha, HEAD);
  assert.deepEqual(
    merged.answers.map((answer) => answer.id),
    ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"],
  );
});

test("mergeAnswers refuses a file that is a string problem", () => {
  refused([["b01", "answers file x/b01.json is missing"]], "is missing");
});

test("mergeAnswers refuses a planHash mismatch", () => {
  refused([["b01", smallFile({ planHash: "0".repeat(16) })]], "planHash is");
});

test("mergeAnswers refuses a headSha mismatch", () => {
  refused([["b01", smallFile({ headSha: "b".repeat(40) })]], "headSha is");
});

test("mergeAnswers refuses a batch mismatch", () => {
  refused([["b01", smallFile({ batch: "b02" })]], "batch is");
});

test("mergeAnswers refuses answers that are not an array", () => {
  refused([["b01", smallFile({ answers: "nope" })]], "answers array");
});

test("mergeAnswers reports two problems in one file in one error", () => {
  assert.throws(
    () => merge([["b01", smallFile({ planHash: "0".repeat(16), answers: [answered("q1")] })]]),
    /Answers refused[\s\S]*planHash is[\s\S]*missing answer for q2/,
  );
});

test("requireFreshAnswers accepts a matching file and checks the head only when given", () => {
  const answers = { planHash: planHash(SMALL), headSha: HEAD };
  assert.doesNotThrow(() => requireFreshAnswers(answers, SMALL));
  assert.doesNotThrow(() => requireFreshAnswers(answers, SMALL, HEAD));
  assert.doesNotThrow(() => requireFreshAnswers({ planHash: planHash(SMALL), headSha: "other" }, SMALL, undefined));
  assert.throws(() => requireFreshAnswers({ ...answers, planHash: "0".repeat(16) }, SMALL), /stale: planHash/);
  assert.throws(() => requireFreshAnswers(answers, SMALL, "c".repeat(40)), /stale: headSha/);
});
