import assert from "node:assert/strict";
import test from "node:test";
import { issue, item, REPOSITORY, selectNext } from "./select-next.test-support.mjs";

const UMBRELLA = { repository: REPOSITORY, number: 239 };
const settled = { state: "closed", state_reason: "completed" };

function umbrella(childState = settled) {
  return {
    repository: REPOSITORY,
    defaultBranch: "master",
    today: "2026-10-29",
    items: [item(239, "Done"), item(240, "Done", { parentIssue: UMBRELLA })],
    issues: [
      issue(239, { ...settled, children: [{ repository: REPOSITORY, number: 240 }] }),
      issue(240, { ...childState, parent: UMBRELLA }),
    ],
    pullRequests: [],
  };
}

test("select-next reports a closed umbrella with all children closed and Done as complete", async () => {
  const result = await selectNext(umbrella());
  assert.deepEqual(result.groups, [{ rootIssueNumber: 239, kind: "complete", reasons: [] }]);
  assert.equal(result.queueState, "exhausted");
  assert.deepEqual(result.missingEvidence, []);
});

test("select-next holds a closed umbrella while one child is still open", async () => {
  const result = await selectNext(umbrella({ state: "open", state_reason: null }));
  assert.equal(result.groups[0].kind, "hold");
  assert.equal(result.queueState, "held");
});
