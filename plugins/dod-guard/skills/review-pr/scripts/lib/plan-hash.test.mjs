// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { planHash } from "./plan-hash.mjs";
import { SMALL } from "./review-batches.test-support.mjs";

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
