// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
import { planHash } from "./plan-hash.mjs";
import { mergeAnswers } from "./review-batches.mjs";

const HEAD = "a".repeat(40);

function questions(count, prefix) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i + 1}`,
    lens: "lens",
    question: `Question ${i + 1}?`,
    files: ["a.mjs"],
  }));
}

// Ten questions in one slot: batch b01 holds q1 to q8, batch b02 holds q9 and q10.
const TEN = [{ slot: "s1", questions: questions(10, "q") }];
// Two questions in one slot: one batch, b01.
const SMALL = [{ slot: "s1", questions: questions(2, "q") }];

function answered(id, slot = "s1") {
  return { id, slot, status: "answered", path: "a.mjs", line: 1, fact: "x" };
}

function fileFor(plan, { batch, answers, ...overrides }) {
  return { planHash: planHash(plan), headSha: HEAD, batch, answers, ...overrides };
}

function smallFile(overrides = {}) {
  return fileFor(SMALL, { batch: "b01", answers: [answered("q1"), answered("q2")], ...overrides });
}

function merge(files, plan = SMALL) {
  return mergeAnswers({ plan, headSha: HEAD, files: new Map(files) });
}

function refused(files, fragment) {
  assert.throws(() => merge(files), new RegExp(`Answers refused[\\s\\S]*${fragment}`));
}

export { answered, fileFor, HEAD, merge, questions, refused, SMALL, smallFile, TEN };
