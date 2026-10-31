import assert from "node:assert/strict";
import test from "node:test";
import { classifyQueue } from "../../../lib/queue-classifier.mjs";
import { assertHold, decisionOf, findIssue, setStatus, TODAY } from "./harness/queue-decision-checks.mjs";
import { issue, item, pullRequest, snapshot } from "./queue-decision.test-support.mjs";

const PARENT = 376;
const CHILD = 377;
const RETIRED = { state: "closed", stateReason: "not_planned", activeCheckpoint: null };
const COMPLETE = { kind: "complete", eligible: false, status: "Done", reasons: [] };

// A parent investigated, found not reproducible, closed as not planned, and set to Done.
function retiredParent() {
  return snapshot({ items: [item(PARENT, "Done")], issues: [issue(PARENT, RETIRED)] });
}

function retiredWithChild() {
  return snapshot({
    items: [item(PARENT, "Done"), item(CHILD, "Done", { parent: PARENT })],
    issues: [
      issue(PARENT, { ...RETIRED, children: [CHILD] }),
      issue(CHILD, { ...RETIRED, stateReason: "completed", parent: PARENT }),
    ],
  });
}

test("a parent closed as not planned and Done is complete", () => {
  const input = retiredParent();
  assert.deepEqual(decisionOf(input, PARENT), COMPLETE);
  const queue = classifyQueue(input, { today: TODAY });
  assert.equal(queue.selected, null);
  assert.deepEqual(queue.missingEvidence, []);
});

test("a parent closed as not planned is held while its Project status is not Done", () => {
  const input = retiredParent();
  setStatus(input, PARENT, "In Progress");
  assertHold(input, PARENT);
});

test("a parent closed as not planned with every child closed and Done is complete", () => {
  assert.deepEqual(decisionOf(retiredWithChild(), PARENT), COMPLETE);
});

test("a parent closed as not planned with a child that is not Done is held", () => {
  const input = retiredWithChild();
  setStatus(input, CHILD, "In Progress");
  assertHold(input, PARENT);
});

test("a parent closed as not planned with an open child is held", () => {
  const input = retiredWithChild();
  Object.assign(findIssue(input, CHILD), { state: "open", state_reason: null });
  assertHold(input, PARENT);
});

test("a parent closed as not planned with an open pull request is held", () => {
  const input = retiredParent();
  input.items[0] = item(PARENT, "Done", { linked: [900] });
  input.pullRequests = [pullRequest(900, { state: "OPEN", mergedAt: null })];
  assertHold(input, PARENT, "open implementation pull request remains active");
});

test("a parent closed with no recorded reason keeps its closed-without-delivery hold", () => {
  const input = retiredParent();
  findIssue(input, PARENT).state_reason = null;
  assertHold(input, PARENT, "issue #376 is closed without a verified merged delivery");
});
