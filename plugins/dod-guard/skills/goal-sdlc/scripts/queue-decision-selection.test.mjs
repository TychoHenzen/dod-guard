import assert from "node:assert/strict";
import test from "node:test";
import { classifyQueue } from "../../../lib/queue-classifier.mjs";
import {
  assertHold,
  decisionOf,
  deliveryIssues,
  deliveryItems,
  issue,
  item,
  pullRequest,
  snapshot,
  TODAY,
} from "./queue-decision.test-support.mjs";

test("queue selection groups children under their parent and keeps only the Todo", () => {
  const input = snapshot({
    items: [
      item(31, "Backlog", { parentField: false }),
      ...deliveryItems(),
      item(517, "Todo"),
      item(600, "Todo", { parent: 599 }),
    ],
    issues: [
      issue(31, { state: "open" }),
      ...deliveryIssues(),
      issue(517, { state: "open" }),
      issue(600, { state: "open", parent: 599 }),
    ],
    pullRequests: [pullRequest(540)],
  });
  assert.equal(decisionOf(input, 31).kind, "hold");
  const { selected } = classifyQueue(input, { today: TODAY });
  assert.equal(selected.rootIssueNumber, 517);
  assert.deepEqual(
    selected.records.map(({ issueNumber }) => issueNumber),
    [517],
  );
});

test("queue selection skips a group whose statuses drift", () => {
  const input = snapshot({
    items: [item(700, "Todo"), item(701, "Backlog", { parent: 700 })],
    issues: [issue(700, { state: "open", children: [701] }), issue(701, { state: "open", parent: 700 })],
  });
  assert.equal(classifyQueue(input, { today: TODAY }).selected, null);
  assertHold(input, 700, "Project status drift: Todo, Backlog");
});

test("an In Progress parent is resumed, not held, by its own pull request", () => {
  const openPull = pullRequest(900, { state: "OPEN", mergedAt: null });
  const resumed = snapshot({
    items: [item(800, "In Progress", { linked: [900] })],
    issues: [issue(800, { state: "open" })],
    pullRequests: [openPull],
  });
  assert.deepEqual(decisionOf(resumed, 800), {
    kind: "in-progress",
    eligible: true,
    status: "In Progress",
    openPullRequest: true,
    reasons: [],
  });

  const checkpointed = snapshot({
    items: [item(801, "In Progress")],
    issues: [issue(801, { state: "open", activeCheckpoint: true })],
  });
  assert.equal(decisionOf(checkpointed, 801).openPullRequest, false);

  const gap = snapshot({
    items: [item(800, "In Progress", { linked: [900], parentField: false })],
    issues: [issue(800, { state: "open" })],
    pullRequests: [openPull],
  });
  assertHold(gap, 800, "Project item #800 Parent issue");

  const todoChild = snapshot({
    items: [item(801, "In Progress"), item(802, "Todo", { parent: 801 })],
    issues: [
      issue(801, { state: "open", children: [802], activeCheckpoint: true }),
      issue(802, { state: "open", parent: 801 }),
    ],
  });
  assert.equal(decisionOf(todoChild, 801).kind, "in-progress");

  const backlogChild = snapshot({
    items: [item(801, "In Progress"), item(802, "Backlog", { parent: 801 })],
    issues: [
      issue(801, { state: "open", children: [802], activeCheckpoint: true }),
      issue(802, { state: "open", parent: 801 }),
    ],
  });
  assertHold(backlogChild, 801, "Project status drift: In Progress, Backlog");
});
