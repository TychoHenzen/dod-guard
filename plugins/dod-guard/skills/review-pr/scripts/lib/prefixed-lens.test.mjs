import assert from "node:assert/strict";
import test from "node:test";
import { canonicalLens } from "./plan-entry.mjs";
import { regenerate } from "./regenerated-inputs.mjs";
import { complete, findingsFixture, judgment } from "./review-pr.test-support.mjs";
import { slotsBlock, slotsByLens } from "./review-slots.mjs";

const { FIX, PBI, PLAN, scan, diff } = findingsFixture;

// The Agent tool names a reviewer `dod-guard:review-pr-feature`, and the planner copies that name.
function withLensPrefix(plan, prefix) {
  const relabel = (item) => ({ ...item, lens: `${prefix}${item.lens}` });
  return plan.map((entry) =>
    entry.questions
      ? { ...entry, questions: entry.questions.map(relabel) }
      : { ...entry, excluded: relabel(entry.excluded) },
  );
}

const finding = { reviewer: "review-pr-feature", findings: [judgment(FIX)] };
const results = complete([finding], slotsByLens(PLAN));
const inputs = { scan, diff, pbi: PBI, results };
const child = { repository: "TychoHenzen/dod-guard", number: 900, title: "Child" };
const bare = regenerate({ ...inputs, subIssues: [child], plan: PLAN });

test("a plan whose lenses carry the dod-guard: prefix regenerates the same ids as the bare plan", () => {
  const plan = withLensPrefix(PLAN, "dod-guard:");
  const out = regenerate({ ...inputs, subIssues: [child], plan });
  assert.deepEqual(out.judged, bare.judged);
  assert.deepEqual(out.scanner, bare.scanner);
});

test("a prefixed lens is assigned to the same slots and listed under its bare name", () => {
  const plan = withLensPrefix(PLAN, "dod-guard:");
  assert.deepEqual(slotsByLens(plan), slotsByLens(PLAN));
  assert.equal(slotsBlock(plan, bare.slots), slotsBlock(PLAN, bare.slots));
  assert.equal(slotsBlock(plan, bare.slots).includes("dod-guard:"), false);
});

test("a prefix other than dod-guard: is still refused", () => {
  const plan = withLensPrefix(PLAN, "other:");
  assert.throws(
    () => regenerate({ ...inputs, subIssues: [child], plan }),
    /needs an id, a reviewer lens|needs a reviewer lens/,
  );
});

test("canonicalLens drops only a leading dod-guard: and passes any other value through", () => {
  assert.equal(canonicalLens("dod-guard:review-pr-design"), "review-pr-design");
  assert.equal(canonicalLens("review-pr-design"), "review-pr-design");
  assert.equal(canonicalLens("other:review-pr-design"), "other:review-pr-design");
  assert.equal(canonicalLens(undefined), undefined);
});
