import assert from "node:assert/strict";
import test from "node:test";
import * as queue from "./harness/queue-snapshot.mjs";

const { classify, groupOf, issue, item, pull, REPOSITORY, ref, snapshot } = queue;
const OPEN_250 = { repository: REPOSITORY, number: 250, state: "open" };

test("a Todo group with an open blocker outside the group is held, naming it, and the next group is selected", () => {
  const input = snapshot({
    items: [item(100, "Todo"), item(101, "Todo")],
    issues: [issue(100, { blockedBy: [OPEN_250] }), issue(101)],
  });
  const result = classify(input);
  assert.equal(groupOf(result, 100).decision.kind, "hold");
  assert.deepEqual(groupOf(result, 100).decision.reasons, [`issue #100 is blocked by ${REPOSITORY}#250`]);
  assert.equal(result.selected.rootIssueNumber, 101);
});

test("a Backlog group with an open blocker is held", () => {
  const input = snapshot({ items: [item(100, "Backlog")], issues: [issue(100, { blockedBy: [OPEN_250] })] });
  assert.equal(groupOf(classify(input), 100).decision.kind, "hold");
  assert.equal(classify(input).selected, null);
});

test("a closed blocker and a blocker inside the group do not hold it", () => {
  const closed = snapshot({
    items: [item(100, "Todo")],
    issues: [issue(100, { blockedBy: [{ ...OPEN_250, state: "closed" }] })],
  });
  assert.equal(classify(closed).selected.rootIssueNumber, 100);
  const inside = snapshot({
    items: [item(517, "Todo"), item(518, "Todo", { parent: ref(517) })],
    issues: [
      issue(517, { children: [ref(518)], blockedBy: [{ repository: REPOSITORY, number: 518, state: "open" }] }),
      issue(518, { parent: ref(517) }),
    ],
  });
  assert.equal(classify(inside).selected.rootIssueNumber, 517);
});

test("a same-numbered open blocker in another repository still holds the group", () => {
  const foreign = { repository: queue.FOREIGN_REPOSITORY, number: 518, state: "open" };
  const input = snapshot({
    items: [item(517, "Todo"), item(518, "Todo", { parent: ref(517) })],
    issues: [issue(517, { children: [ref(518)], blockedBy: [foreign] }), issue(518, { parent: ref(517) })],
  });
  assert.deepEqual(groupOf(classify(input), 517).decision.reasons, [
    `issue #517 is blocked by ${queue.FOREIGN_REPOSITORY}#518`,
  ]);
});

test("an open Todo issue with no blocker list is held and names the relationship", () => {
  const input = snapshot({ items: [item(100, "Todo")], issues: [issue(100)] });
  delete input.issues[0].blockedBy;
  const result = classify(input);
  assert.equal(result.selected, null);
  assert.deepEqual(groupOf(result, 100).decision.reasons, ["issue #100 blocked_by relationship missing"]);
});

test("an In Progress delivery with an open pull request still resumes while a blocker is open", () => {
  const input = snapshot({
    items: [item(100, "In Progress", { linked: [ref(540)] })],
    issues: [issue(100, { blockedBy: [OPEN_250] })],
    pullRequests: [pull(540, { state: "open", mergedAt: null })],
  });
  assert.equal(groupOf(classify(input), 100).decision.kind, "in-progress");
});
