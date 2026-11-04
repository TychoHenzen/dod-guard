import assert from "node:assert/strict";
import test from "node:test";
import { classifyQueue } from "../../../lib/queue-classifier.mjs";
import { assertHold, decisionOf, findIssue, setStatus, TODAY } from "./harness/queue-decision-checks.mjs";
import { issue, item, pullRequest, snapshot } from "./queue-decision.test-support.mjs";

const UMBRELLA = 239;
const CHILDREN = [240, 241];
const SETTLED = { state: "closed", stateReason: "completed", activeCheckpoint: null };

// A closed umbrella with no delivery of its own: its children were each delivered separately, and the
// closed issues predate the checkpoint marker, so none carries an explicit false.
function closedUmbrella() {
  return snapshot({
    items: [item(UMBRELLA, "Done"), ...CHILDREN.map((number) => item(number, "Done", { parent: UMBRELLA }))],
    issues: [
      issue(UMBRELLA, { ...SETTLED, children: CHILDREN }),
      ...CHILDREN.map((number) => issue(number, { ...SETTLED, parent: UMBRELLA })),
    ],
  });
}

test("a closed umbrella whose children are all closed and Done is complete", () => {
  const input = closedUmbrella();
  assert.deepEqual(decisionOf(input, UMBRELLA), { kind: "complete", eligible: false, status: "Done", reasons: [] });
  const queue = classifyQueue(input, { today: TODAY });
  assert.deepEqual(queue.missingEvidence, []);
  assert.equal(queue.selected, null);
});

test("a closed umbrella is complete when a closed child is not a Project item", () => {
  const input = closedUmbrella();
  input.items = input.items.filter(({ content }) => content.number !== 241);
  const queue = classifyQueue(input, { today: TODAY });
  assert.equal(decisionOf(input, UMBRELLA).kind, "complete");
  assert.deepEqual(queue.missingEvidence, []);
});

test("a closed umbrella with one open child is held", () => {
  const input = closedUmbrella();
  Object.assign(findIssue(input, 241), { state: "open", state_reason: null });
  assertHold(input, UMBRELLA);
});

test("a closed umbrella with a child that is not Done is held", () => {
  const input = closedUmbrella();
  setStatus(input, 241, "In Progress");
  assertHold(input, UMBRELLA);
});

test("a superseded child closed as not planned does not hold a closed umbrella", () => {
  const input = closedUmbrella();
  findIssue(input, 240).state_reason = "not_planned";
  assert.equal(decisionOf(input, UMBRELLA).kind, "complete");
});

test("a child closed with no recorded reason holds a closed umbrella", () => {
  const input = closedUmbrella();
  findIssue(input, 240).state_reason = null;
  assertHold(input, UMBRELLA);
});

test("an umbrella that was itself closed as not planned with every child Done is complete", () => {
  const input = closedUmbrella();
  findIssue(input, UMBRELLA).state_reason = "not_planned";
  assert.equal(decisionOf(input, UMBRELLA).kind, "complete");
});

test("a closed umbrella with an open pull request is held", () => {
  const input = closedUmbrella();
  input.items[0] = item(UMBRELLA, "Done", { linked: [900] });
  input.pullRequests = [pullRequest(900, { state: "OPEN", mergedAt: null })];
  assertHold(input, UMBRELLA, "open implementation pull request remains active");
});

test("a closed issue without children keeps its closed-without-delivery hold", () => {
  const input = snapshot({
    items: [item(UMBRELLA, "Done")],
    issues: [issue(UMBRELLA, SETTLED)],
  });
  assertHold(input, UMBRELLA, "issue #239 is closed without a verified merged delivery");
});

test("an open parent with a missing checkpoint is still held", () => {
  const input = closedUmbrella();
  Object.assign(findIssue(input, UMBRELLA), { state: "open", state_reason: null });
  setStatus(input, UMBRELLA, "In Progress");
  assertHold(input, UMBRELLA);
  const open = closedUmbrella();
  Object.assign(findIssue(open, UMBRELLA), { state: "open", state_reason: null, activeCheckpoint: null });
  assert.notEqual(decisionOf(open, UMBRELLA).kind, "complete");
});

test("a merged-delivery parent with a missing checkpoint on an open child is still held", () => {
  const input = closedUmbrella();
  input.items[0] = item(UMBRELLA, "Done", { linked: [901] });
  input.pullRequests = [pullRequest(901)];
  Object.assign(findIssue(input, 241), { state: "open", state_reason: null, activeCheckpoint: null });
  assertHold(input, UMBRELLA, "active checkpoint for issue #241 is not explicitly false");
});

test("a closed umbrella with an explicitly active checkpoint is held", () => {
  const input = closedUmbrella();
  findIssue(input, 241).activeCheckpoint = true;
  assertHold(input, UMBRELLA, "active implementation checkpoint remains");
});

test("a closed umbrella linking a pull request of another repository is held", () => {
  const input = closedUmbrella();
  input.items[0] = item(UMBRELLA, "Done");
  const field = input.items[0].fields.find(({ name }) => name === "Linked pull requests");
  field.value = [{ repository: "other/repo", number: 5 }];
  assert.notEqual(decisionOf(input, UMBRELLA).kind, "complete");
});
