import assert from "node:assert/strict";
import test from "node:test";
import { classify, completedGroup, groupOf, issue, item, pull, ref, snapshot } from "./harness/queue-snapshot.mjs";
import { renderParkedRecord } from "./parked-record.mjs";

const RECORD_BODY = renderParkedRecord({ blocked: "owner has not answered", unblocksWhen: "owner answers" });
const PARKED = [{ id: 9001, body: RECORD_BODY, author_association: "OWNER" }];
const PARKED_REASON = "issue #100 is parked: owner has not answered; unblocks when: owner answers";

test("a Todo root with a parked record is held, naming the record's words, and the next group is selected", () => {
  const input = snapshot({
    items: [item(100, "Todo"), item(101, "Todo")],
    issues: [issue(100, { comments: PARKED }), issue(101)],
  });
  const result = classify(input);
  const { decision } = groupOf(result, 100);
  assert.equal(decision.kind, "hold");
  assert.deepEqual(decision.reasons, [PARKED_REASON]);
  assert.equal(result.selected.rootIssueNumber, 101);
});

test("a parked Backlog root and a parked In Progress root with an open pull request are both held", () => {
  const backlog = snapshot({ items: [item(100, "Backlog")], issues: [issue(100, { comments: PARKED })] });
  assert.equal(groupOf(classify(backlog), 100).decision.kind, "hold");
  const resumable = snapshot({
    items: [item(100, "In Progress", { linked: [ref(540)] })],
    issues: [issue(100, { comments: PARKED })],
    pullRequests: [pull(540, { state: "open", mergedAt: null })],
  });
  const result = classify(resumable);
  assert.equal(groupOf(result, 100).decision.kind, "hold");
  assert.equal(result.selected, null);
});

test("a parked sub-issue does not park its delivery", () => {
  const input = snapshot({
    items: [item(517, "Todo"), item(518, "Todo", { parent: ref(517) })],
    issues: [issue(517, { children: [ref(518)] }), issue(518, { parent: ref(517), comments: PARKED })],
  });
  assert.equal(classify(input).selected.rootIssueNumber, 517);
});

test("a comment that only quotes the parked marker never parks the root", () => {
  const quoted = [{ id: 1, body: `Quoted:\n\n${RECORD_BODY}`, author_association: "OWNER" }];
  const input = snapshot({ items: [item(100, "Todo")], issues: [issue(100, { comments: quoted })] });
  assert.equal(classify(input).selected.rootIssueNumber, 100);
});

test("a parked record from a commenter without write standing never parks the root", () => {
  for (const authorAssociation of ["NONE", "CONTRIBUTOR", null, undefined]) {
    const stranger = [{ ...PARKED[0], author_association: authorAssociation }];
    const input = snapshot({ items: [item(100, "Todo")], issues: [issue(100, { comments: stranger })] });
    assert.equal(classify(input).selected.rootIssueNumber, 100);
  }
});

test("an issue snapshot with no comments list is not parked", () => {
  const input = snapshot({ items: [item(100, "Todo")], issues: [issue(100)] });
  delete input.issues[0].comments;
  assert.equal(classify(input).selected.rootIssueNumber, 100);
});

test("a completed delivery is judged by its merged evidence even when a parked record remains", () => {
  const plain = completedGroup([540], [540]);
  const parked = completedGroup([540], [540]);
  parked.issues[0].comments = PARKED;
  assert.deepEqual(groupOf(classify(parked), 444).decision, groupOf(classify(plain), 444).decision);
});
