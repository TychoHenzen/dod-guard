import assert from "node:assert/strict";
import test from "node:test";
import { classifyQueue } from "../../../lib/queue-classifier.mjs";
import { assertHold, findIssue, TODAY } from "./harness/queue-decision-checks.mjs";
import { completeDelivery, issue, item, pullRequest, snapshot } from "./queue-decision.test-support.mjs";

test("a contradictory parent holds the delivery", () => {
  const input = completeDelivery();
  // #536's Project Parent issue field still names #444, while its issue parent is now null.
  findIssue(input, 536).parent = null;
  assertHold(input, 444, "contradictory parent for issue #536");
});

test("a null Project parent against a set issue parent holds that issue", () => {
  const child = 536;
  const parent = 444;
  const input = snapshot({
    items: [item(child, "Todo")],
    issues: [issue(child, { state: "open", parent })],
    pullRequests: [],
  });
  assertHold(input, child, "contradictory parent for issue #536");
  assert.equal(classifyQueue(input, { today: TODAY }).selected, null);
  const corrected = snapshot({
    items: [item(child, "Todo")],
    issues: [issue(child, { state: "open", parent: null })],
    pullRequests: [],
  });
  const { selected } = classifyQueue(corrected, { today: TODAY });
  assert.equal(selected.rootIssueNumber, child);
  assert.equal(selected.decision.status, "Todo");
});

test("a merged child alone, without its parent's item, is an orphan hold", () => {
  const input = snapshot({
    items: [item(536, "Done", { parent: 444, linked: [540] })],
    issues: [issue(536, { parent: 444 })],
    pullRequests: [pullRequest(540, { mergeCommit: null })],
  });
  assertHold(
    input,
    444,
    "orphaned parent/child relationship",
    "parent issue #444 Project item",
    "merge commit is missing",
  );
});
