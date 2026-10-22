import assert from "node:assert/strict";
import test from "node:test";
import { renderParkedRecord } from "../../../lib/parked-record.mjs";
import { issue, item, REPOSITORY, selectNext, snapshot } from "./select-next.test-support.mjs";

const OPEN_BLOCKER = { repository: REPOSITORY, number: 250, state: "open" };
const PARKED_COMMENT = {
  id: 7,
  body: renderParkedRecord({ blocked: "waiting on the owner", unblocksWhen: "the owner answers" }),
  author_association: "OWNER",
};

// Two Todo roots, 40 and 41, built from the given issues.
function twoRoots(first, extra = {}) {
  const input = { ...snapshot(), ...extra };
  input.items = [item(40, "Todo"), item(41, "Todo")];
  input.issues = [first, issue(41)];
  return input;
}

const groupOf = (result, number) => result.groups.find(({ rootIssueNumber }) => rootIssueNumber === number);

test("a Todo group blocked by an open issue is held with the blocker named and the next one is selected", async () => {
  const result = await selectNext(twoRoots(issue(40, { blockedBy: [OPEN_BLOCKER] })));
  assert.equal(result.selected.rootIssueNumber, 41);
  assert.deepEqual(groupOf(result, 40), {
    rootIssueNumber: 40,
    kind: "hold",
    reasons: [`issue #40 is blocked by ${REPOSITORY}#250`],
  });
});

test("a Todo root with a parked record is held with the record in its reason and the next is selected", async () => {
  const result = await selectNext(twoRoots(issue(40, { comments: [PARKED_COMMENT] })));
  assert.equal(result.selected.rootIssueNumber, 41);
  assert.deepEqual(groupOf(result, 40), {
    rootIssueNumber: 40,
    kind: "hold",
    reasons: ["issue #40 is parked: waiting on the owner; unblocks when: the owner answers"],
  });
});

test("a Todo root with an unfinished delivery branch holds the queue and names the branch", async () => {
  const branches = [{ name: "codex/40-example", openPullRequest: false }];
  const result = await selectNext(twoRoots(issue(40), { branches }));
  assert.equal(result.selected, null);
  assert.equal(result.queueState, "held");
  assert.deepEqual(groupOf(result, 40), {
    rootIssueNumber: 40,
    kind: "hold",
    reasons: ["issue #40 has unfinished delivery branch codex/40-example without an open pull request"],
  });
});
