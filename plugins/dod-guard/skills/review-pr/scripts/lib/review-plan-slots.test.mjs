// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { findingsFixture } from "./review-pr.test-support.mjs";

const { FIX, UNICODE, SUB_SLOT, PBI, PLAN, scan, question, review } = findingsFixture;

test("the review body keeps the marker first and lists every slot in a collapsed block", () => {
  const { payload } = review([], { scan });
  const lines = payload.body.split("\n");
  assert.match(lines[0], /^<!-- dod-guard:review-pr head=/);
  assert.equal(payload.event, "COMMENT");
  assert.ok(lines.includes("<details>"));
  assert.ok(lines.includes("<summary>Review plan slots (4)</summary>"));
  assert.ok(lines.includes("</details>"));
  assert.ok(lines.includes(`**file:${FIX}**`));
  assert.ok(lines.includes("**file:docs/\u00fc.md**"));
  assert.ok(lines.includes("**criterion:1**: AC-01 The review posts once"));
  assert.ok(lines.includes(`**${SUB_SLOT}**: Child`));
  const f1 = "- F1 review-pr-feature (verified): Does review-pr-feature hold at the reviewed head?";
  assert.ok(lines.includes(f1));
  assert.ok(lines.includes("- excluded for review-pr-hygiene: Same work as criterion:1"));
  assert.ok(lines.indexOf("<details>") > lines.findIndex((line) => line.startsWith("Findings:")));
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

test("a body over the GitHub limit stops the build before posting", () => {
  const long = {
    ...question("F1", "review-pr-feature"),
    question: "x".repeat(70_000),
  };
  const plan = [
    {
      slot: `file:${FIX}`,
      questions: [long, question("D1", "review-pr-design")],
    },
    ...PLAN.slice(1),
  ];
  assert.throws(() => review([], { scan, plan }), /over the 65536-character limit, with 4 slots/);
});
