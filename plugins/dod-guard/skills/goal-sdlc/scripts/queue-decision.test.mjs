import assert from "node:assert/strict";
import test from "node:test";
import { classifyQueue } from "../../../lib/queue-classifier.mjs";
import { assertHold, decisionOf, findIssue, setStatus, TODAY } from "./harness/queue-decision-checks.mjs";
import { completeDelivery, issue, item, pullRequest, ref, snapshot } from "./queue-decision.test-support.mjs";

test("a fully evidenced merged delivery is complete", () => {
  assert.deepEqual(decisionOf(completeDelivery(), 444), {
    kind: "complete",
    eligible: false,
    status: "Done",
    reasons: [],
  });
});

test("Todo and Backlog parents without a delivery are eligible", () => {
  const todo = snapshot({ items: [item(517, "Todo")], issues: [issue(517, { state: "open" })] });
  assert.deepEqual(decisionOf(todo, 517), { kind: "eligible", eligible: true, status: "Todo", reasons: [] });
  const backlog = snapshot({ items: [item(31, "Backlog")], issues: [issue(31, { state: "open" })] });
  assert.equal(decisionOf(backlog, 31).status, "Backlog");
});

test("closed unmerged issues are diagnostic holds instead of selected or resumed work", () => {
  for (const status of ["Todo", "Backlog", "In Progress"]) {
    const input = snapshot({ items: [item(866, status)], issues: [issue(866)] });
    assert.equal(classifyQueue(input, { today: TODAY }).selected, null);
    assert.deepEqual(decisionOf(input, 866), {
      kind: "hold",
      eligible: false,
      reasons: ["issue #866 is closed without a verified merged delivery"],
    });
  }
});

test("an evidence gap holds even a complete delivery", () => {
  const input = completeDelivery();
  // #444 lists #535 as a sub-issue, but #535 has no Project item to carry its evidence.
  findIssue(input, 444).children.push(ref(535));
  assertHold(input, 444, "child issue #535 Project item");
});

test("an open child that is not Done holds a merged delivery", () => {
  const input = completeDelivery();
  findIssue(input, 536).state = "open";
  setStatus(input, 536, "In Progress");
  assertHold(
    input,
    444,
    "issue #536 is not closed",
    "Project item #536 is not Done",
    "Project status drift: Done, In Progress",
  );
});

test("the active checkpoint must be explicitly false before completion", () => {
  const absent = completeDelivery();
  delete findIssue(absent, 444).activeCheckpoint;
  assertHold(absent, 444, "active checkpoint for issue #444 is not explicitly false");
  const active = snapshot({
    items: [item(517, "Todo")],
    issues: [issue(517, { state: "open", activeCheckpoint: true })],
  });
  assertHold(active, 517, "active implementation checkpoint remains");
});

test("each missing piece of merge evidence holds the delivery", () => {
  const cases = [
    [
      { head: { repository: "someone/fork", ref: "codex/540", sha: "head-540" } },
      "pull request head repository is not the target repository",
    ],
    [{ base: { ref: "develop", sha: "base-540" } }, "pull request base is not the default branch"],
    [{ trustedHeadSha: "stale-540" }, "trusted pull request head evidence is missing or stale"],
    [{ mergeCommit: null }, "merge commit is missing"],
    [{ requiredChecks: [{ name: "build-test", bucket: "fail" }] }, "required checks are incomplete or failed"],
    [{ requiredChecks: [] }, "required checks missing or empty"],
  ];
  for (const [overrides, reason] of cases) {
    const input = completeDelivery();
    input.pullRequests[0] = pullRequest(540, overrides);
    assertHold(input, 444, reason);
  }
});
