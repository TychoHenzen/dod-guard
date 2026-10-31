import assert from "node:assert/strict";
import test from "node:test";
import { issue, item, REPOSITORY, selectNext } from "./select-next.test-support.mjs";

function retired(status) {
  return {
    repository: REPOSITORY,
    defaultBranch: "master",
    today: "2026-10-31",
    items: [item(376, status)],
    issues: [issue(376, { state: "closed", state_reason: "not_planned" })],
    pullRequests: [],
  };
}

test("select-next reports a parent closed as not planned and Done as complete", async () => {
  const result = await selectNext(retired("Done"));
  assert.deepEqual(result.groups, [{ rootIssueNumber: 376, kind: "complete", reasons: [] }]);
  assert.equal(result.queueState, "exhausted");
  assert.deepEqual(result.missingEvidence, []);
});

test("select-next holds a parent closed as not planned that is not Done", async () => {
  const result = await selectNext(retired("In Progress"));
  assert.equal(result.groups[0].kind, "hold");
  assert.equal(result.queueState, "held");
});
