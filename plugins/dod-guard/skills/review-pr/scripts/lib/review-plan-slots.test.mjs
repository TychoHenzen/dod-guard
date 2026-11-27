// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { requirePostableBody } from "./review-body.mjs";
import { findingsFixture } from "./review-pr.test-support.mjs";

const { FIX, UNICODE, SUB_SLOT, PBI, PLAN, scan, question, review } = findingsFixture;

// The plan stays in the run's files: a body that restated it grew with the plan
// and reached 117442 characters for 427 slots.
test("the review body keeps the marker first and restates no slot or question", () => {
  const { payload } = review([], { scan });
  const lines = payload.body.split("\n");
  assert.match(lines[0], /^<!-- dod-guard:review-pr head=/);
  assert.equal(payload.event, "COMMENT");
  assert.ok(lines.includes("Findings: 0 BLOCKER, 1 MAJOR, 1 MINOR. Threads to fix: 1."));
  for (const planText of ["<details>", "Review plan slots", "criterion:1", SUB_SLOT, "F1 ", "Does review-pr"]) {
    assert.ok(!payload.body.includes(planText), planText);
  }
});

test("the build regenerates the slots and refuses a plan that misses one", () => {
  const plan = PLAN.filter((entry) => entry.slot !== `file:${UNICODE}`);
  const missing = /Slots missing from the plan: file:docs\/\u00fc\.md/;
  assert.throws(() => review([], { scan, plan }), missing);
});

test("the build refuses a plan slot it did not generate", () => {
  const plan = [
    ...PLAN,
    {
      slot: "file:README.md",
      questions: [question("F9", "review-pr-feature")],
    },
  ];
  assert.throws(() => review([], { scan, plan }), /Plan slot "file:README\.md" was not generated/);
});

test("a PBI without acceptance criteria stops the build", () => {
  const pbi = { ...PBI, body: "" };
  assert.throws(
    () => review([], { scan, pbi }),
    /PBI TychoHenzen\/dod-guard#837 has no checkbox item under ## Acceptance criteria/,
  );
});

test("the build refuses a judge result missing a ruling for an assigned slot", () => {
  assert.throws(
    () =>
      review([
        {
          reviewer: "review-pr-feature",
          rulings: [{ slot: `file:${FIX}`, status: "VERIFIED", evidence: "checked" }],
        },
      ]),
    /review-pr-feature: missing ruling for slot criterion:1/,
  );
});

// The template cannot reach the cap, so the guard is proven on the body check itself.
test("a body over the review cap stops the build before posting", () => {
  const over = /The review body is 8001 characters, over the 8000-character cap for reviewBody\. Nothing was posted\./;
  assert.throws(() => requirePostableBody("x".repeat(8001)), over);
  assert.equal(requirePostableBody("x".repeat(8000)).length, 8000);
});

test("an over-long question is refused before the body is built", () => {
  const long = { ...question("F1", "review-pr-feature"), question: "x".repeat(70_000) };
  const plan = [{ slot: `file:${FIX}`, questions: [long, question("D1", "review-pr-design")] }, ...PLAN.slice(1)];
  assert.throws(() => review([], { scan, plan }), /is 70000 characters; the limit is 240/);
});
