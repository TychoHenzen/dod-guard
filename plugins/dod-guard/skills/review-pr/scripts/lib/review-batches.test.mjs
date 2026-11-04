// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  batchDocuments,
  batchName,
  cutBatches,
  mergeAnswers,
  planHash,
  requireFreshAnswers,
} from "./review-batches.mjs";

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

function fileFor(plan, batch, answers, overrides = {}) {
  return { planHash: planHash(plan), headSha: HEAD, batch, answers, ...overrides };
}

function smallFile(overrides = {}) {
  return fileFor(SMALL, "b01", [answered("q1"), answered("q2")], overrides);
}

function merge(files, plan = SMALL) {
  return mergeAnswers({ plan, headSha: HEAD, files: new Map(files) });
}

function refused(files, fragment) {
  assert.throws(() => merge(files), new RegExp(`Answers refused[\\s\\S]*${fragment}`));
}

test("planHash ignores status, risk, scanner and entry order", () => {
  const plan = [
    {
      slot: "s1",
      questions: [{ id: "q1", lens: "l", question: "Q?", files: ["a.mjs"] }],
    },
    { slot: "s2", excluded: { lens: "l", reason: "none" } },
  ];
  const decorated = [...plan].reverse().map((entry) => ({
    ...entry,
    status: "VERIFIED",
    risk: "high",
    scanner: { id: "S1" },
    questions: entry.questions?.map((q) => ({ ...q, status: "VERIFIED", risk: "high", scanner: { id: "S1" } })),
  }));
  assert.equal(planHash(decorated), planHash(plan));
});

test("planHash changes when a question text changes", () => {
  const edited = [{ slot: "s1", questions: [{ ...SMALL[0].questions[0], question: "Other?" }, SMALL[0].questions[1]] }];
  const hash = planHash(SMALL);
  assert.notEqual(planHash(edited), hash);
  assert.match(hash, /^[0-9a-f]{16}$/);
  assert.match(planHash(edited), /^[0-9a-f]{16}$/);
});

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

test("mergeAnswers joins valid files in batch order", () => {
  const first = fileFor(
    TEN,
    "b01",
    questions(8, "q").map((q) => answered(q.id)),
  );
  const second = fileFor(
    TEN,
    "b02",
    questions(2, "q").map((q, i) => answered(`q${9 + i}`)),
  );
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

test("mergeAnswers refuses a missing id", () => {
  refused([["b01", smallFile({ answers: [answered("q1")] })]], "missing answer for");
});

test("mergeAnswers refuses an extra id", () => {
  refused(
    [["b01", smallFile({ answers: [answered("q1"), answered("q2"), answered("q9")] })]],
    "is not a question of this batch",
  );
});

test("mergeAnswers refuses a duplicate id", () => {
  refused([["b01", smallFile({ answers: [answered("q1"), answered("q1"), answered("q2")] })]], "duplicate answer for");
});

test("mergeAnswers refuses a slot mismatch", () => {
  refused([["b01", smallFile({ answers: [answered("q1", "s2"), answered("q2")] })]], "names slot");
});

test("mergeAnswers refuses an answered entry without a line", () => {
  refused(
    [["b01", smallFile({ answers: [{ ...answered("q1"), line: 0 }, answered("q2")] })]],
    "without a line above 0",
  );
});

test("mergeAnswers refuses an answered entry without a path", () => {
  refused(
    [["b01", smallFile({ answers: [{ ...answered("q1"), path: "" }, answered("q2")] })]],
    "answered without a path",
  );
});

test("mergeAnswers refuses an answered entry without a fact", () => {
  refused(
    [["b01", smallFile({ answers: [{ ...answered("q1"), fact: " " }, answered("q2")] })]],
    "answered without a fact",
  );
});

test("mergeAnswers refuses an unanswered entry without searched", () => {
  const unanswered = { id: "q1", slot: "s1", status: "unanswered", searched: "" };
  refused([["b01", smallFile({ answers: [unanswered, answered("q2")] })]], "unanswered without searched");
});

test("mergeAnswers refuses an unknown status", () => {
  refused(
    [["b01", smallFile({ answers: [{ ...answered("q1"), status: "maybe" }, answered("q2")] })]],
    "unknown status",
  );
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
