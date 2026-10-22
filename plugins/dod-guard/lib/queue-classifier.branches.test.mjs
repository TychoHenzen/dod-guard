import assert from "node:assert/strict";
import test from "node:test";
import { classify, groupOf, issue, item, pull, ref, snapshot } from "./harness/queue-snapshot.mjs";
import { renderParkedRecord } from "./parked-record.mjs";

function stalled(number) {
  return { name: `codex/${number}-example`, openPullRequest: false };
}

test("a Todo root with a pushed branch and no open pull request is held, names it, and withholds Todo work", () => {
  const input = snapshot({
    items: [item(100, "Todo"), item(101, "Todo")],
    issues: [issue(100), issue(101)],
    branches: [stalled(100)],
  });
  const result = classify(input);
  const { decision } = groupOf(result, 100);
  assert.equal(decision.kind, "hold");
  assert.deepEqual(decision.reasons, [
    "issue #100 has unfinished delivery branch codex/100-example without an open pull request",
  ]);
  assert.equal(groupOf(result, 101).decision.kind, "eligible");
  assert.equal(result.selected, null);
});

test("an unfinished branch on a Backlog root withholds Backlog selection too", () => {
  const input = snapshot({
    items: [item(100, "Backlog"), item(101, "Backlog")],
    issues: [issue(100), issue(101)],
    branches: [stalled(100)],
  });
  assert.equal(groupOf(classify(input), 100).decision.kind, "hold");
  assert.equal(classify(input).selected, null);
});

test("a branch whose pull request is open does not hold its root", () => {
  const input = snapshot({
    items: [item(100, "Todo")],
    issues: [issue(100)],
    branches: [{ name: "codex/100-example", openPullRequest: true }],
  });
  assert.equal(classify(input).selected.rootIssueNumber, 100);
});

test("a branch for another issue number that shares a digit prefix does not hold", () => {
  const input = snapshot({ items: [item(9, "Todo")], issues: [issue(9)], branches: [stalled(90)] });
  assert.equal(classify(input).selected.rootIssueNumber, 9);
});

test("a branch entry that does not say its pull request is open still holds the root", () => {
  const input = snapshot({
    items: [item(100, "Todo")],
    issues: [issue(100)],
    branches: [{ name: "codex/100-example" }, { openPullRequest: false }],
  });
  assert.equal(groupOf(classify(input), 100).decision.kind, "hold");
});

test("a snapshot with no branches list holds nothing", () => {
  const input = snapshot({ items: [item(100, "Todo")], issues: [issue(100)] });
  assert.equal("branches" in input, false);
  assert.equal(classify(input).selected.rootIssueNumber, 100);
});

test("an In Progress group still resumes while an unfinished branch holds a Todo root", () => {
  const input = snapshot({
    items: [item(100, "Todo"), item(102, "In Progress", { linked: [ref(540)] })],
    issues: [issue(100), issue(102)],
    pullRequests: [pull(540, { state: "open", mergedAt: null })],
    branches: [stalled(100)],
  });
  assert.equal(classify(input).selected.rootIssueNumber, 102);
});

test("an In Progress root with its own branch and no pull request is resumed, not held", () => {
  const input = snapshot({ items: [item(100, "In Progress")], issues: [issue(100)], branches: [stalled(100)] });
  assert.equal(groupOf(classify(input), 100).decision.kind, "in-progress");
  assert.equal(classify(input).selected.rootIssueNumber, 100);
});

test("a parked root with an unfinished branch is held as parked and withholds nothing", () => {
  const body = renderParkedRecord({ blocked: "owner has not answered", unblocksWhen: "owner answers" });
  const input = snapshot({
    items: [item(100, "Todo"), item(101, "Todo")],
    issues: [issue(100, { comments: [{ id: 9001, body, author_association: "OWNER" }] }), issue(101)],
    branches: [stalled(100)],
  });
  const result = classify(input);
  assert.deepEqual(groupOf(result, 100).decision.reasons, [
    "issue #100 is parked: owner has not answered; unblocks when: owner answers",
  ]);
  assert.equal(result.selected.rootIssueNumber, 101);
});
