import assert from "node:assert/strict";
import test from "node:test";
import { classify, groupOf, issue, item, ref, snapshot } from "./harness/queue-snapshot.mjs";
import { REFINED_BODY } from "./refined-body.test-support.mjs";

const UNREFINED_BODY = "## Outcome\n\nProse only.\n";
const OPEN_BLOCKER = { repository: "TychoHenzen/dod-guard", number: 250, state: "open" };

function withIssues(items, issues) {
  return snapshot({ items, issues });
}

test("a Todo root whose body has no refinement records is needs-refinement and the next group is selected", () => {
  const input = withIssues([item(100, "Todo"), item(101, "Todo")], [issue(100, { body: UNREFINED_BODY }), issue(101)]);
  const result = classify(input);
  const { decision } = groupOf(result, 100);
  assert.equal(decision.kind, "needs-refinement");
  assert.equal(decision.eligible, false);
  assert.ok(
    decision.reasons.includes("issue #100 body has no ## Implementation notes section"),
    decision.reasons.join("; "),
  );
  assert.equal(result.selected.rootIssueNumber, 101);
});

test("a Todo root with a missing or blank body is needs-refinement", () => {
  for (const body of [null, "", "   \n"]) {
    const input = withIssues([item(100, "Todo")], [issue(100, { body })]);
    const { decision } = groupOf(classify(input), 100);
    assert.equal(decision.kind, "needs-refinement");
    assert.deepEqual(decision.reasons, ["issue #100 has no refined body"]);
  }
});

test("a Todo root whose acceptance ids disagree with its checkboxes is needs-refinement and names both ids", () => {
  const drifted = REFINED_BODY.replace("- [ ] AC-5 ", "- [ ] AC-6 ");
  assert.notEqual(drifted, REFINED_BODY);
  const { decision } = groupOf(classify(withIssues([item(100, "Todo")], [issue(100, { body: drifted })])), 100);
  assert.equal(decision.kind, "needs-refinement");
  assert.deepEqual(decision.reasons, [
    "issue #100 AC-6 acceptance criterion has no acceptance-evidence entry",
    "issue #100 acceptance-evidence entry AC-5 has no Acceptance criteria checkbox",
  ]);
});

test("only a Todo root is checked for refinement: a Backlog root and a child body are not", () => {
  const backlog = withIssues([item(100, "Backlog")], [issue(100, { body: UNREFINED_BODY })]);
  assert.equal(groupOf(classify(backlog), 100).decision.kind, "eligible");
  const child = withIssues(
    [item(517, "Todo"), item(518, "Todo", { parent: ref(517) })],
    [issue(517, { children: [ref(518)] }), issue(518, { parent: ref(517), body: UNREFINED_BODY })],
  );
  assert.equal(classify(child).selected.rootIssueNumber, 517);
});

test("an open blocker is reported before a missing refinement", () => {
  const input = withIssues([item(100, "Todo")], [issue(100, { body: UNREFINED_BODY, blockedBy: [OPEN_BLOCKER] })]);
  assert.equal(groupOf(classify(input), 100).decision.kind, "hold");
});
