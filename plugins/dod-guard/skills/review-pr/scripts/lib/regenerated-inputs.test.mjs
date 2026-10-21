import assert from "node:assert/strict";
import test from "node:test";
import { judgedCandidates, scannerCandidates } from "./finding-ids.mjs";
import { regenerate } from "./regenerated-inputs.mjs";
import { complete, findingsFixture, judgment } from "./review-pr.test-support.mjs";
import { slotsByLens } from "./review-slots.mjs";
import { parseChangedLines } from "./unified-diff.mjs";

const { FIX, UNICODE, PBI, PLAN, scan, diff } = findingsFixture;
const SUB_ISSUES = [{ repository: "TychoHenzen/dod-guard", number: 900, title: "Child" }];
const ASSIGNED = new Map([
  ["review-pr-feature", new Set([`file:${FIX}`, "criterion:1"])],
  ["review-pr-design", new Set([`file:${FIX}`])],
  ["review-pr-reliability", new Set([`file:${UNICODE}`])],
  ["review-pr-hygiene", new Set(["sub-issue:TychoHenzen/dod-guard#900"])],
]);
const results = complete([{ reviewer: "review-pr-feature", findings: [judgment(FIX)] }], ASSIGNED);
const inputs = { scan, diff, pbi: PBI, subIssues: SUB_ISSUES, plan: PLAN, results };

test("regenerate gives the same J and S ids as the candidate functions", () => {
  const out = regenerate(inputs);
  assert.deepEqual(out.judged, judgedCandidates(results, slotsByLens(PLAN)));
  assert.deepEqual(out.scanner, scannerCandidates(scan, parseChangedLines(diff)));
  assert.equal(out.judged.length, 1);
  assert.ok(out.scanner.length > 0);
});

test("regenerate refuses a plan whose scanner list names another file's S id", () => {
  const plan = PLAN.map((entry) =>
    entry.questions
      ? {
          ...entry,
          questions: entry.questions.map((question) =>
            question.id === "D1" ? { ...question, scanner: ["S1"] } : question,
          ),
        }
      : entry,
  );
  assert.throws(
    () => regenerate({ ...inputs, plan }),
    (error) => error.message.includes("question D1 lists S1"),
  );
});
